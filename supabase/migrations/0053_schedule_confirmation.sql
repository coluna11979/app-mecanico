-- Agenda: confirmação do horário com o cliente e "não veio".
-- schedule_status: null = aguardando confirmação · 'confirmed' = cliente confirmou · 'no_show' = não veio
alter table public.service_orders
  add column if not exists schedule_status       text check (schedule_status in ('confirmed', 'no_show')),
  add column if not exists schedule_reminded_at  timestamptz,   -- quando a oficina mandou a confirmação pelo WhatsApp
  add column if not exists schedule_status_at    timestamptz;

create index if not exists service_orders_scheduled_idx on public.service_orders (workshop_id, scheduled_at)
  where scheduled_at is not null;
