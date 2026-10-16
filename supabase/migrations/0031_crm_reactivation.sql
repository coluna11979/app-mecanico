-- CRM de reativação (módulo VIP).
-- Cada mensagem enviada ao cliente vira um registro em crm_contacts. O "painel de
-- retorno" cruza esses contatos com as OS abertas depois (cliente voltou → R$).

create table if not exists public.crm_contacts (
  id                uuid primary key default gen_random_uuid(),
  workshop_id       uuid not null references public.workshops(id) on delete cascade,
  customer_id       uuid not null references public.customers(id) on delete cascade,
  vehicle_id        uuid references public.vehicles(id) on delete set null,
  recommendation_id uuid references public.service_recommendations(id) on delete set null,
  source_os_id      uuid references public.service_orders(id) on delete set null,
  reason            text not null check (reason in ('recommendation', 'inactive', 'oil_due', 'declined_quote')),
  message           text not null,
  channel           text not null default 'whatsapp' check (channel in ('whatsapp', 'phone', 'other')),
  ai_generated      boolean not null default false,
  sent_by           uuid references auth.users(id) on delete set null,
  sent_at           timestamptz not null default now()
);
create index if not exists crm_contacts_ws_idx on public.crm_contacts(workshop_id, sent_at desc);
create index if not exists crm_contacts_customer_idx on public.crm_contacts(customer_id, sent_at desc);

alter table public.crm_contacts enable row level security;

drop policy if exists crm_contacts_read on public.crm_contacts;
create policy crm_contacts_read on public.crm_contacts for select
  using (public.is_workshop_member(workshop_id, auth.uid()) or public.is_admin(auth.uid()));

-- Só oficina VIP registra contatos (o módulo é do plano VIP)
drop policy if exists crm_contacts_insert on public.crm_contacts;
create policy crm_contacts_insert on public.crm_contacts for insert
  with check (public.is_workshop_member(workshop_id, auth.uid()) and public.is_workshop_vip(workshop_id));

drop policy if exists crm_contacts_delete on public.crm_contacts;
create policy crm_contacts_delete on public.crm_contacts for delete
  using (public.is_workshop_member(workshop_id, auth.uid()) or public.is_admin(auth.uid()));

-- Marca a data do último contato no cliente (evita mandar mensagem repetida)
create or replace function public.crm_contact_touch_customer()
returns trigger language plpgsql set search_path = public as $$
begin
  update public.customers set last_contacted_at = new.sent_at
   where id = new.customer_id and (last_contacted_at is null or last_contacted_at < new.sent_at);
  return new;
end $$;

drop trigger if exists trg_crm_contact_touch_customer on public.crm_contacts;
create trigger trg_crm_contact_touch_customer after insert on public.crm_contacts
  for each row execute function public.crm_contact_touch_customer();

-- Configurações da IA de texto (mensagens do CRM) — editáveis no painel admin
insert into public.app_settings (key, value, description, is_public) values
  ('ai_text_model',  (select value from public.app_settings where key = 'ai_vision_model'),
                     'Modelo usado para escrever as mensagens do CRM', false),
  ('ai_text_effort', 'low', 'Esforço da IA nas mensagens do CRM (low | medium | high)', false)
on conflict (key) do nothing;
