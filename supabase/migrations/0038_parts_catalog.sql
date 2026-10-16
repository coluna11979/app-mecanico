-- Cadastro de peças: custo de compra e preço de venda usado nos orçamentos.
-- Preço de venda = preço fixo da peça, ou custo + margem (da peça ou a padrão da oficina).
-- A OS guarda o custo do momento em que a peça entrou (unit_cost), para a margem
-- das OS antigas não mudar quando o preço de compra mudar.

-- ── Margem padrão da oficina ────────────────────────────────────────────────
-- Tabela própria (e não coluna em workshops) porque workshops é pública (vitrine).
create table if not exists public.workshop_pricing (
  workshop_id          uuid primary key references public.workshops(id) on delete cascade,
  part_margin_percent  numeric not null default 40 check (part_margin_percent >= 0 and part_margin_percent <= 1000),
  updated_at           timestamptz not null default now()
);

alter table public.workshop_pricing enable row level security;
drop policy if exists workshop_pricing_members on public.workshop_pricing;
create policy workshop_pricing_members on public.workshop_pricing
  for all
  using      (is_workshop_member(workshop_id, auth.uid()) or is_admin(auth.uid()))
  with check (is_workshop_member(workshop_id, auth.uid()) or is_admin(auth.uid()));

drop trigger if exists trg_workshop_pricing_touch on public.workshop_pricing;
create trigger trg_workshop_pricing_touch before update on public.workshop_pricing
  for each row execute function public.touch_updated_at();

-- ── Peças ───────────────────────────────────────────────────────────────────
create table if not exists public.workshop_parts (
  id              uuid primary key default uuid_generate_v4(),
  workshop_id     uuid not null references public.workshops(id) on delete cascade,
  name            text not null check (length(trim(name)) > 0),
  code            text,                         -- referência / código do fabricante
  brand           text,
  unit            text not null default 'un',
  supplier        text,
  cost            numeric not null default 0 check (cost >= 0),
  margin_percent  numeric check (margin_percent >= 0 and margin_percent <= 1000),  -- null = margem padrão
  sale_price      numeric check (sale_price >= 0),                                  -- preço fixo; null = custo + margem
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists workshop_parts_workshop_idx on public.workshop_parts (workshop_id, lower(name));

alter table public.workshop_parts enable row level security;
drop policy if exists workshop_parts_members on public.workshop_parts;
create policy workshop_parts_members on public.workshop_parts
  for all
  using      (is_workshop_member(workshop_id, auth.uid()) or is_admin(auth.uid()))
  with check (is_workshop_member(workshop_id, auth.uid()) or is_admin(auth.uid()));

drop trigger if exists trg_workshop_parts_touch on public.workshop_parts;
create trigger trg_workshop_parts_touch before update on public.workshop_parts
  for each row execute function public.touch_updated_at();

-- ── Itens da OS: custo do momento e de qual peça do cadastro veio ───────────
alter table public.service_order_items
  add column if not exists unit_cost numeric check (unit_cost >= 0),
  add column if not exists part_id   uuid references public.workshop_parts(id) on delete set null;
