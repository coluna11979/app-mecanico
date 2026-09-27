-- Plano VIP liberado manualmente: a oficina solicita, um colaborador do MecânicoApp
-- entra em contato, combina o pagamento e libera o módulo pelo admin.
--
-- O plano fica em tabela própria que SÓ o admin altera (a oficina pode editar a
-- tabela workshops, então o plano não pode morar lá).

create table if not exists public.workshop_plans (
  workshop_id  uuid primary key references public.workshops(id) on delete cascade,
  plan         text not null default 'free' check (plan in ('free', 'vip')),
  vip_since    timestamptz,
  vip_until    timestamptz,          -- null = sem data de término
  price_note   text,                 -- o que foi combinado (valor, forma de pagamento)
  activated_by uuid references auth.users(id) on delete set null,
  updated_at   timestamptz not null default now()
);

alter table public.workshop_plans enable row level security;

drop policy if exists workshop_plans_read on public.workshop_plans;
create policy workshop_plans_read on public.workshop_plans for select
  using (public.is_workshop_member(workshop_id, auth.uid()) or public.is_admin(auth.uid()));

drop policy if exists workshop_plans_admin_write on public.workshop_plans;
create policy workshop_plans_admin_write on public.workshop_plans for all
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

drop trigger if exists trg_touch_workshop_plans on public.workshop_plans;
create trigger trg_touch_workshop_plans before update on public.workshop_plans
  for each row execute function public.touch_workshop_showcase();

-- A oficina é VIP agora? (para usar em RLS / edge functions dos módulos VIP)
create or replace function public.is_workshop_vip(wid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.workshop_plans
    where workshop_id = wid and plan = 'vip' and (vip_until is null or vip_until > now())
  );
$$;
revoke execute on function public.is_workshop_vip(uuid) from anon;

-- Solicitações de upgrade
create table if not exists public.vip_requests (
  id              uuid primary key default gen_random_uuid(),
  workshop_id     uuid not null references public.workshops(id) on delete cascade,
  requested_by    uuid references auth.users(id) on delete set null,
  contact_name    text,
  phone           text,
  best_time       text,
  message         text,
  status          text not null default 'pending' check (status in ('pending', 'contacted', 'activated', 'declined')),
  admin_notes     text,
  handled_by      uuid references auth.users(id) on delete set null,
  handled_at      timestamptz,
  created_at      timestamptz not null default now()
);
create index if not exists vip_requests_status_idx on public.vip_requests(status, created_at desc);

alter table public.vip_requests enable row level security;

-- Oficina: cria e vê as próprias solicitações (não altera status)
drop policy if exists vip_requests_member_read on public.vip_requests;
create policy vip_requests_member_read on public.vip_requests for select
  using (public.is_workshop_member(workshop_id, auth.uid()) or public.is_admin(auth.uid()));

drop policy if exists vip_requests_member_insert on public.vip_requests;
create policy vip_requests_member_insert on public.vip_requests for insert
  with check (public.is_workshop_member(workshop_id, auth.uid()) and status = 'pending'
    and admin_notes is null and handled_by is null and handled_at is null);

drop policy if exists vip_requests_admin_update on public.vip_requests;
create policy vip_requests_admin_update on public.vip_requests for update
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

drop policy if exists vip_requests_admin_delete on public.vip_requests;
create policy vip_requests_admin_delete on public.vip_requests for delete
  using (public.is_admin(auth.uid()));

-- Uma solicitação em aberto por oficina
create unique index if not exists vip_requests_one_open_idx on public.vip_requests(workshop_id)
  where status in ('pending', 'contacted');
