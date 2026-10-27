-- Mecânico pede para virar embaixador pelo app; o admin aprova ou recusa.
-- Aprovar usa a mesma regra de tornar_embaixador (gera código e prazo do programa).
-- O pedido leva as respostas da pesquisa de perfil (src/lib/embaixadorPesquisa.ts).

create table if not exists public.embaixador_pedidos (
  id           uuid primary key default gen_random_uuid(),
  mechanic_id  uuid not null references public.mechanics(id) on delete cascade,
  motivo       text,
  respostas    jsonb not null default '{}'::jsonb,
  status       text not null default 'pendente' check (status in ('pendente', 'aprovado', 'recusado')),
  created_at   timestamptz not null default now(),
  decided_at   timestamptz,
  decided_by   uuid references public.profiles(id) on delete set null
);
-- Um pedido aberto por mecânico
create unique index if not exists embaixador_pedidos_um_pendente
  on public.embaixador_pedidos(mechanic_id) where status = 'pendente';

alter table public.embaixador_pedidos enable row level security;
drop policy if exists admin_all on public.embaixador_pedidos;
create policy admin_all on public.embaixador_pedidos for all to authenticated
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
-- O mecânico só lê e cria pelos RPCs abaixo

-- Mecânico: pede (ou devolve o pedido aberto)
create or replace function public.pedir_embaixador(p_motivo text default null, p_respostas jsonb default '{}'::jsonb)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_mec uuid;
begin
  select id into v_mec from public.mechanics where profile_id = auth.uid();
  if v_mec is null then raise exception 'só mecânicos podem pedir'; end if;
  if exists (select 1 from public.mechanics where id = v_mec and is_embaixador) then return 'ja_embaixador'; end if;
  if exists (select 1 from public.embaixador_pedidos where mechanic_id = v_mec and status = 'pendente') then return 'pendente'; end if;
  insert into public.embaixador_pedidos (mechanic_id, motivo, respostas)
    values (v_mec, nullif(trim(p_motivo), ''), coalesce(p_respostas, '{}'::jsonb));
  return 'pendente';
end;
$$;

-- Mecânico: último pedido dele (null se nunca pediu)
create or replace function public.meu_pedido_embaixador()
returns table (status text, created_at timestamptz, decided_at timestamptz)
language sql stable security definer set search_path = public as $$
  select p.status, p.created_at, p.decided_at
    from public.embaixador_pedidos p
    join public.mechanics m on m.id = p.mechanic_id
   where m.profile_id = auth.uid()
   order by p.created_at desc
   limit 1;
$$;

-- Admin: pedidos em aberto com o básico para decidir
create or replace function public.admin_listar_pedidos_embaixador()
returns table (
  id uuid, mechanic_id uuid, profile_id uuid, full_name text, phone text, city text, state text,
  rating numeric, total_jobs int, motivo text, respostas jsonb, created_at timestamptz
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin(auth.uid()) then raise exception 'forbidden'; end if;
  return query
    select p.id, m.id, pr.id, pr.full_name, pr.phone, m.city, m.state,
           m.rating::numeric, m.total_jobs::int, p.motivo, p.respostas, p.created_at
      from public.embaixador_pedidos p
      join public.mechanics m on m.id = p.mechanic_id
      join public.profiles pr on pr.id = m.profile_id
     where p.status = 'pendente'
     order by p.created_at;
end;
$$;

-- Admin: aprova (vira embaixador) ou recusa
create or replace function public.admin_decidir_pedido_embaixador(p_id uuid, p_aprovar boolean)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_mec uuid;
begin
  if not public.is_admin(auth.uid()) then raise exception 'forbidden'; end if;
  select mechanic_id into v_mec from public.embaixador_pedidos where id = p_id and status = 'pendente';
  if v_mec is null then raise exception 'pedido não encontrado ou já decidido'; end if;
  if p_aprovar then perform public.tornar_embaixador(v_mec); end if;
  update public.embaixador_pedidos
     set status = case when p_aprovar then 'aprovado' else 'recusado' end,
         decided_at = now(), decided_by = auth.uid()
   where id = p_id;
end;
$$;

revoke execute on function public.pedir_embaixador(text, jsonb)                from public, anon;
revoke execute on function public.meu_pedido_embaixador()                      from public, anon;
revoke execute on function public.admin_listar_pedidos_embaixador()            from public, anon;
revoke execute on function public.admin_decidir_pedido_embaixador(uuid, boolean) from public, anon;
grant execute on function public.pedir_embaixador(text, jsonb)                 to authenticated;
grant execute on function public.meu_pedido_embaixador()                       to authenticated;
grant execute on function public.admin_listar_pedidos_embaixador()             to authenticated;
grant execute on function public.admin_decidir_pedido_embaixador(uuid, boolean) to authenticated;
