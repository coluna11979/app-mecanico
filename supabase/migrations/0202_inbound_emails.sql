-- Respostas por e-mail (Resend Receiving → edge function resend-inbound): cada e-mail recebido
-- fica registrado aqui (o webhook pode repetir o aviso) e o cadastro é achado pelo remetente.
create table if not exists public.inbound_emails (
  email_id    text primary key,
  from_email  text,
  subject     text,
  profile_id  uuid references public.profiles(id) on delete set null,
  status      text not null,
  detail      text,
  attachments integer not null default 0,
  created_at  timestamptz not null default now()
);

alter table public.inbound_emails enable row level security;
revoke all on public.inbound_emails from anon, authenticated;

create or replace function public.find_profile_id_by_email(p_email text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select u.id from auth.users u where lower(u.email) = lower(trim(p_email)) limit 1;
$$;

revoke all on function public.find_profile_id_by_email(text) from public, anon, authenticated;
grant execute on function public.find_profile_id_by_email(text) to service_role;

-- app_settings.is_public nasce true: sem criar antes, a tela de Configurações gravaria estas
-- chaves visíveis para qualquer usuário logado
insert into public.app_settings (key, value, description, is_public) values
  ('resend_full_api_key',   '', 'Resend com acesso completo: baixa respostas e anexos recebidos.', false),
  ('resend_webhook_secret', '', 'Segredo do webhook email.received do Resend (whsec_…).', false),
  ('resend_reply_to',       '', 'Endereço de resposta dos emails de cadastro (recebimento ativo no Resend).', false)
on conflict (key) do update set is_public = false;
