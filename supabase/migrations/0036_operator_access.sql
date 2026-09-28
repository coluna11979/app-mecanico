-- Acessos por função (modo balcão).
-- O computador do balcão fica logado na conta da oficina; cada colaborador se
-- identifica com um PIN pessoal e escolhe a função em que vai trabalhar
-- (gestor, caixa, atendente, mecânico). A tela mostra só o que a função usa e
-- tudo o que for lançado fica registrado em nome de quem fez, em qual função.

-- ── Quem pode operar o sistema e em quais funções ───────────────────────────
create table if not exists public.workshop_operators (
  id           uuid primary key default uuid_generate_v4(),
  workshop_id  uuid not null references public.workshops(id) on delete cascade,
  -- Colaborador da Equipe (null = o próprio dono da oficina)
  mechanic_id  uuid references public.workshop_mechanics(id) on delete cascade,
  name         text not null,
  is_owner     boolean not null default false,
  roles        text[] not null default '{}',
  -- Permissões extras além das da função (a função gestor já tem todas)
  permissions  text[] not null default '{}',
  active       boolean not null default true,
  has_pin      boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (workshop_id, mechanic_id),
  constraint workshop_operators_roles_check
    check (roles <@ array['gestor', 'caixa', 'atendente', 'mecanico']::text[]),
  constraint workshop_operators_perms_check
    check (permissions <@ array['dar_desconto', 'cancelar_recebimento', 'reabrir_caixa', 'ver_financeiro']::text[])
);

create unique index if not exists workshop_operators_one_owner
  on public.workshop_operators (workshop_id) where is_owner;

alter table public.workshop_operators enable row level security;

drop policy if exists workshop_operators_read on public.workshop_operators;
create policy workshop_operators_read on public.workshop_operators for select
  using (is_workshop_member(workshop_id, auth.uid()) or is_admin(auth.uid()));

drop policy if exists workshop_operators_owner_write on public.workshop_operators;
create policy workshop_operators_owner_write on public.workshop_operators for all
  using      (is_workshop_owner(workshop_id, auth.uid()))
  with check (is_workshop_owner(workshop_id, auth.uid()));

-- ── PIN (hash bcrypt) — tabela sem policies: só as funções abaixo acessam ───
create table if not exists public.workshop_operator_secrets (
  operator_id     uuid primary key references public.workshop_operators(id) on delete cascade,
  pin_hash        text not null,
  failed_attempts int not null default 0,
  locked_until    timestamptz
);
alter table public.workshop_operator_secrets enable row level security;

-- ── Sessões: quem estava operando, em qual função, de quando a quando ───────
create table if not exists public.operator_sessions (
  id           uuid primary key default uuid_generate_v4(),
  workshop_id  uuid not null references public.workshops(id) on delete cascade,
  operator_id  uuid not null references public.workshop_operators(id) on delete cascade,
  role         text not null,
  started_by   uuid not null default auth.uid(),
  started_at   timestamptz not null default now(),
  ended_at     timestamptz
);
create index if not exists operator_sessions_workshop_idx on public.operator_sessions (workshop_id, started_at desc);

alter table public.operator_sessions enable row level security;
drop policy if exists operator_sessions_read on public.operator_sessions;
create policy operator_sessions_read on public.operator_sessions for select
  using (is_workshop_member(workshop_id, auth.uid()) or is_admin(auth.uid()));

-- ── Define/troca o PIN (só o dono) ──────────────────────────────────────────
create or replace function public.set_operator_pin(p_operator uuid, p_pin text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare _ws uuid;
begin
  select workshop_id into _ws from workshop_operators where id = p_operator;
  if _ws is null or not is_workshop_owner(_ws, auth.uid()) then
    raise exception 'Sem permissão';
  end if;
  if p_pin !~ '^[0-9]{4,6}$' then
    raise exception 'O PIN precisa ter de 4 a 6 números';
  end if;

  insert into workshop_operator_secrets (operator_id, pin_hash)
  values (p_operator, crypt(p_pin, gen_salt('bf')))
  on conflict (operator_id) do update
    set pin_hash = excluded.pin_hash, failed_attempts = 0, locked_until = null;

  update workshop_operators set has_pin = true, updated_at = now() where id = p_operator;
end;
$$;

-- ── Entrar numa função com o PIN ────────────────────────────────────────────
-- Não usa raise nos erros de PIN: o contador de tentativas precisa ser gravado.
create or replace function public.operator_login(p_operator uuid, p_pin text, p_role text)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  _op  workshop_operators;
  _sec workshop_operator_secrets;
  _sid uuid;
begin
  select * into _op from workshop_operators where id = p_operator;
  if _op.id is null or not is_workshop_member(_op.workshop_id, auth.uid()) then
    return json_build_object('ok', false, 'error', 'Colaborador não encontrado');
  end if;
  if not _op.active then
    return json_build_object('ok', false, 'error', 'Acesso desativado. Fale com o gestor.');
  end if;
  if not (p_role = any(_op.roles)) then
    return json_build_object('ok', false, 'error', 'Essa função não está liberada para você');
  end if;

  select * into _sec from workshop_operator_secrets where operator_id = p_operator;
  if _sec.operator_id is null then
    return json_build_object('ok', false, 'error', 'PIN ainda não cadastrado. Fale com o gestor.');
  end if;
  if _sec.locked_until is not null and _sec.locked_until > now() then
    return json_build_object('ok', false, 'error',
      'Muitas tentativas erradas. Tente de novo em ' || ceil(extract(epoch from _sec.locked_until - now()) / 60)::int || ' min.');
  end if;

  if _sec.pin_hash <> crypt(p_pin, _sec.pin_hash) then
    update workshop_operator_secrets
       set failed_attempts = failed_attempts + 1,
           locked_until = case when failed_attempts + 1 >= 5 then now() + interval '5 minutes' else null end
     where operator_id = p_operator;
    return json_build_object('ok', false, 'error',
      case when _sec.failed_attempts + 1 >= 5 then 'PIN incorreto. Acesso bloqueado por 5 minutos.'
           else 'PIN incorreto' end);
  end if;

  update workshop_operator_secrets set failed_attempts = 0, locked_until = null where operator_id = p_operator;

  insert into operator_sessions (workshop_id, operator_id, role)
  values (_op.workshop_id, _op.id, p_role)
  returning id into _sid;

  return json_build_object('ok', true, 'session_id', _sid, 'operator_id', _op.id,
                           'name', _op.name, 'role', p_role, 'permissions', _op.permissions);
end;
$$;

create or replace function public.operator_logout(p_session uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update operator_sessions set ended_at = now()
   where id = p_session and ended_at is null and is_workshop_member(workshop_id, auth.uid());
$$;

-- ── Usada pelas próximas fases (caixa, financeiro): valida a sessão ativa e a
--    permissão pedida (a função gestor pode tudo).
create or replace function public.operator_can(p_session uuid, p_workshop uuid, p_perm text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from operator_sessions s
      join workshop_operators o on o.id = s.operator_id
     where s.id = p_session
       and s.workshop_id = p_workshop
       and s.ended_at is null
       and o.active
       and is_workshop_member(s.workshop_id, auth.uid())
       and (s.role = 'gestor' or p_perm = s.role or p_perm = any(o.permissions))
  );
$$;

revoke all on function public.set_operator_pin(uuid, text) from public, anon;
revoke all on function public.operator_login(uuid, text, text) from public, anon;
revoke all on function public.operator_logout(uuid) from public, anon;
revoke all on function public.operator_can(uuid, uuid, text) from public, anon;
grant execute on function public.set_operator_pin(uuid, text) to authenticated;
grant execute on function public.operator_login(uuid, text, text) to authenticated;
grant execute on function public.operator_logout(uuid) to authenticated;
grant execute on function public.operator_can(uuid, uuid, text) to authenticated;
