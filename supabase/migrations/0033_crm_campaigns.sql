-- Campanhas de WhatsApp para a base de clientes (módulo VIP).
-- Uma campanha = tipo + público (filtros) + mensagem base com {nome} e {carro}.
-- Cada envio vira um crm_contacts (reason = 'campaign', campaign_id) e entra no painel de retorno.

create table if not exists public.crm_campaigns (
  id           uuid primary key default gen_random_uuid(),
  workshop_id  uuid not null references public.workshops(id) on delete cascade,
  name         text not null,
  kind         text not null check (kind in ('travel', 'rain', 'ac_summer', 'oil', 'battery', 'custom')),
  segment      jsonb not null default '{}'::jsonb,
  offer        text,
  idea         text,
  message      text not null default '',
  ai_generated boolean not null default false,
  status       text not null default 'active' check (status in ('active', 'done')),
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists crm_campaigns_ws_idx on public.crm_campaigns(workshop_id, created_at desc);

alter table public.crm_campaigns enable row level security;

drop policy if exists crm_campaigns_read on public.crm_campaigns;
create policy crm_campaigns_read on public.crm_campaigns for select
  using (public.is_workshop_member(workshop_id, auth.uid()) or public.is_admin(auth.uid()));

-- Criar/editar campanha é do plano VIP
drop policy if exists crm_campaigns_write on public.crm_campaigns;
create policy crm_campaigns_write on public.crm_campaigns for insert
  with check (public.is_workshop_member(workshop_id, auth.uid()) and public.is_workshop_vip(workshop_id));

drop policy if exists crm_campaigns_update on public.crm_campaigns;
create policy crm_campaigns_update on public.crm_campaigns for update
  using (public.is_workshop_member(workshop_id, auth.uid()) and public.is_workshop_vip(workshop_id))
  with check (public.is_workshop_member(workshop_id, auth.uid()) and public.is_workshop_vip(workshop_id));

drop policy if exists crm_campaigns_delete on public.crm_campaigns;
create policy crm_campaigns_delete on public.crm_campaigns for delete
  using (public.is_workshop_member(workshop_id, auth.uid()) or public.is_admin(auth.uid()));

drop trigger if exists trg_touch_crm_campaigns on public.crm_campaigns;
create trigger trg_touch_crm_campaigns before update on public.crm_campaigns
  for each row execute function public.touch_workshop_showcase();

-- Contatos ligados à campanha
alter table public.crm_contacts add column if not exists campaign_id uuid references public.crm_campaigns(id) on delete set null;
create index if not exists crm_contacts_campaign_idx on public.crm_contacts(campaign_id) where campaign_id is not null;

alter table public.crm_contacts drop constraint if exists crm_contacts_reason_check;
alter table public.crm_contacts add constraint crm_contacts_reason_check
  check (reason in ('recommendation', 'inactive', 'oil_due', 'declined_quote', 'campaign'));
