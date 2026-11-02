-- Acesso equipe (login remoto do colaborador).
-- Até aqui, um colaborador só entrava pelo PIN no modo balcão — sempre no
-- aparelho do dono (a conta da oficina logada). Agora cada colaborador pode ter
-- um LOGIN + SENHA próprios e entrar do próprio celular, pela tela "Acesso
-- equipe", caindo direto no painel restrito da função dele (ex.: mecânico vê só
-- OS, Agenda, Check-up e Avisos).
--
-- Como funciona por baixo:
--  • Cada colaborador com login ganha um usuário de autenticação próprio
--    (criado pela função de borda operator-set-login, que desvia do trigger
--    handle_new_user pra NÃO criar uma oficina nova).
--  • Esse usuário entra como MEMBRO da oficina (workshop_members, papel
--    'operator'); com isso a RLS que já existe (is_workshop_member) libera ler e
--    atualizar as OS, igual ao operador do balcão — sem dar poderes de dono
--    (is_workshop_owner continua falso).
--  • A função e as permissões continuam vindo de workshop_operators; a restrição
--    de telas é a mesma do modo balcão (feita no cliente).

-- ── Liga o operador ao usuário de autenticação dele + guarda o login ──────────
alter table public.workshop_operators
  add column if not exists profile_id uuid references public.profiles(id) on delete set null,
  add column if not exists login      text;

-- Um usuário de autenticação é de no máximo um operador; um login é único no sistema
create unique index if not exists workshop_operators_profile_id_key
  on public.workshop_operators (profile_id) where profile_id is not null;
create unique index if not exists workshop_operators_login_key
  on public.workshop_operators (lower(login)) where login is not null;

-- ── Quem sou eu (operador) ────────────────────────────────────────────────────
-- Usada pelo app logo após o login remoto pra saber a função/permissões e travar
-- a sessão no painel certo. Só enxerga o PRÓPRIO operador (profile_id = auth.uid()).
create or replace function public.operator_self()
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'operator_id', o.id,
    'workshop_id', o.workshop_id,
    'name',        o.name,
    'roles',       o.roles,
    'permissions', o.permissions,
    'perm_roles',  o.perm_roles
  )
  from workshop_operators o
  where o.profile_id = auth.uid() and o.active
  limit 1;
$$;

-- ── Abre uma sessão de trabalho (login remoto — sem PIN) ──────────────────────
-- A senha já autenticou o colaborador; aqui só registramos quem está operando e
-- em qual função (mesma auditoria do operator_login do balcão).
create or replace function public.operator_remote_session_start(p_role text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  _op  workshop_operators;
  _sid uuid;
begin
  select * into _op from workshop_operators where profile_id = auth.uid() and active;
  if _op.id is null then
    return json_build_object('ok', false, 'error', 'Acesso não encontrado ou desativado');
  end if;
  if not (p_role = any(_op.roles)) then
    return json_build_object('ok', false, 'error', 'Essa função não está liberada para você');
  end if;

  insert into operator_sessions (workshop_id, operator_id, role)
  values (_op.workshop_id, _op.id, p_role)
  returning id into _sid;

  return json_build_object('ok', true, 'session_id', _sid, 'operator_id', _op.id,
                           'name', _op.name, 'role', p_role, 'permissions', _op.permissions);
end;
$$;

revoke all on function public.operator_self()                        from public, anon;
revoke all on function public.operator_remote_session_start(text)    from public, anon;
grant execute on function public.operator_self()                     to authenticated;
grant execute on function public.operator_remote_session_start(text) to authenticated;
