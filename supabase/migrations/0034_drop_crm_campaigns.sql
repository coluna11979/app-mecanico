-- Módulo de campanhas (0033) removido a pedido do dono do produto: o CRM será redesenhado.
alter table public.crm_contacts drop constraint if exists crm_contacts_reason_check;
alter table public.crm_contacts add constraint crm_contacts_reason_check
  check (reason in ('recommendation', 'inactive', 'oil_due', 'declined_quote'));
drop index if exists public.crm_contacts_campaign_idx;
alter table public.crm_contacts drop column if exists campaign_id;
drop table if exists public.crm_campaigns;
