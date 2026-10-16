-- Tabela de serviços (mão de obra) da oficina: nome, preço e tempo estimado.
-- No orçamento/OS, digitar o nome traz o preço — igual ao cadastro de peças.
create table if not exists public.workshop_services (
  id                uuid primary key default uuid_generate_v4(),
  workshop_id       uuid not null references public.workshops(id) on delete cascade,
  name              text not null check (length(trim(name)) > 0),
  category          text,                                   -- mesma lista das categorias de OS
  price             numeric not null default 0 check (price >= 0),
  estimated_minutes integer check (estimated_minutes > 0),
  active            boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create unique index if not exists workshop_services_name_uq on public.workshop_services (workshop_id, lower(trim(name)));

alter table public.workshop_services enable row level security;
drop policy if exists workshop_services_members on public.workshop_services;
create policy workshop_services_members on public.workshop_services
  for all
  using      (is_workshop_member(workshop_id, auth.uid()) or is_admin(auth.uid()))
  with check (is_workshop_member(workshop_id, auth.uid()) or is_admin(auth.uid()));

drop trigger if exists trg_workshop_services_touch on public.workshop_services;
create trigger trg_workshop_services_touch before update on public.workshop_services
  for each row execute function public.touch_updated_at();
