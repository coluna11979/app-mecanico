-- Agente de CS (pós-venda automático pelo WhatsApp da oficina):
--  · boas-vindas logo que a OS é aberta;
--  · mensagem N horas (padrão 12) depois de concluir a OS, com o link de avaliação do Google;
--  · na troca de óleo, a mensagem avisa que vamos lembrar quando estiver perto (o lembrete em si fica para depois).
-- Fila cs_messages: os gatilhos da OS só ENFILEIRAM (se a oficina tem o agente 'cs' LIGADO); quem envia é a edge function
-- cs-dispatch, chamada a cada 5 min pelo pg_cron (header x-cron-secret). Só envia em horário comercial, uma vez por evento,
-- respeita contact_opt_out e não manda para importação de nota antiga, venda balcão nem demonstração.

alter table public.ai_agents drop constraint if exists ai_agents_template_check;
alter table public.ai_agents add constraint ai_agents_template_check
  check (template in ('socio', 'recepcao', 'followup', 'posvenda', 'orcamento', 'admin_cadastros', 'diagnostico', 'cs'));

create table if not exists public.cs_messages (
  id               uuid primary key default gen_random_uuid(),
  workshop_id      uuid not null references public.workshops(id) on delete cascade,
  service_order_id uuid not null references public.service_orders(id) on delete cascade,
  customer_id      uuid not null references public.customers(id) on delete cascade,
  kind             text not null check (kind in ('welcome', 'post_service')),
  send_at          timestamptz not null,
  status           text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'skipped', 'failed')),
  claimed_at       timestamptz,
  sent_at          timestamptz,
  detail           text,
  text             text,
  created_at       timestamptz not null default now(),
  unique (service_order_id, kind)
);
create index if not exists cs_messages_due_idx on public.cs_messages (status, send_at);
create index if not exists cs_messages_workshop_idx on public.cs_messages (workshop_id, created_at desc);
create index if not exists cs_messages_customer_idx on public.cs_messages (customer_id, kind, created_at desc);

alter table public.cs_messages enable row level security;
drop policy if exists cs_messages_read on public.cs_messages;
create policy cs_messages_read on public.cs_messages for select
  using (public.is_workshop_member(workshop_id, auth.uid()));
revoke all on public.cs_messages from anon, authenticated;
grant select on public.cs_messages to authenticated;

/* ── Gatilho da OS: só enfileira ─────────────────────────────────────────────── */
create or replace function public.cs_enqueue()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  s jsonb;
  c record;
  v_hours int;
begin
  if new.customer_id is null or coalesce(new.source, '') in ('paper_import', 'demo', 'balcao') then return new; end if;

  select settings into s from ai_agents where workshop_id = new.workshop_id and template = 'cs' and enabled;
  if not found then return new; end if;
  if not workshop_module_enabled(new.workshop_id, 'agentes') then return new; end if;

  select phone, contact_opt_out into c from customers where id = new.customer_id;
  if not found or c.phone is null or btrim(c.phone) = '' or coalesce(c.contact_opt_out, false) then return new; end if;

  if tg_op = 'INSERT' then
    -- Boas-vindas: OS de verdade (não orçamento, não concluída); no máximo uma a cada 12 h por cliente
    if new.status in ('open', 'approved', 'in_progress') and new.quote_status is null
       and coalesce(s->>'welcome', 'true') <> 'false'
       and not exists (select 1 from cs_messages m where m.customer_id = new.customer_id and m.kind = 'welcome'
                         and m.status in ('pending', 'sending', 'sent') and m.created_at > now() - interval '12 hours') then
      insert into cs_messages (workshop_id, service_order_id, customer_id, kind, send_at)
      values (new.workshop_id, new.id, new.customer_id, 'welcome', now() + interval '3 minutes')
      on conflict (service_order_id, kind) do nothing;
    end if;
    return new;
  end if;

  -- Concluiu a OS: pós-serviço depois de N horas; no máximo um por semana por cliente
  if new.status = 'completed' and old.status is distinct from 'completed'
     and coalesce(s->>'post', 'true') <> 'false'
     and not exists (select 1 from cs_messages m where m.customer_id = new.customer_id and m.kind = 'post_service'
                       and m.status in ('pending', 'sending', 'sent') and m.created_at > now() - interval '7 days') then
    v_hours := greatest(0, least(72, coalesce(nullif(s->>'post_delay_hours', '')::int, 12)));
    insert into cs_messages (workshop_id, service_order_id, customer_id, kind, send_at)
    values (new.workshop_id, new.id, new.customer_id, 'post_service', coalesce(new.completed_at, now()) + make_interval(hours => v_hours))
    on conflict (service_order_id, kind) do nothing;
  end if;
  return new;
end $$;

drop trigger if exists trg_service_orders_cs on public.service_orders;
create trigger trg_service_orders_cs after insert or update of status on public.service_orders
  for each row execute function public.cs_enqueue();

/* ── Pega as mensagens vencidas (uma por vez por worker) ───────────────────── */
create or replace function public.cs_claim(p_limit integer default 15)
returns setof public.cs_messages
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Quem travou há mais de 15 min volta para a fila
  update cs_messages set status = 'pending', claimed_at = null where status = 'sending' and claimed_at < now() - interval '15 minutes';
  return query
    update cs_messages m set status = 'sending', claimed_at = now()
     where m.id in (select id from cs_messages where status = 'pending' and send_at <= now() order by send_at limit greatest(1, least(p_limit, 40)) for update skip locked)
    returning m.*;
end $$;
revoke all on function public.cs_claim(integer) from public, anon, authenticated;
grant execute on function public.cs_claim(integer) to service_role;

/* ── Segredo do cron + agenda (a cada 5 min) ───────────────────────────────── */
insert into public.app_settings (key, value, is_public) values
  ('cs_cron_secret', replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''), false)
on conflict (key) do nothing;

select cron.unschedule('cs-dispatch') where exists (select 1 from cron.job where jobname = 'cs-dispatch');
select cron.schedule(
  'cs-dispatch',
  '*/5 * * * *',
  $job$
  select net.http_post(
    url := 'https://qpwdwjzbgasjsnzpgcyo.supabase.co/functions/v1/cs-dispatch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select value from public.app_settings where key = 'cs_cron_secret')
    ),
    body := '{"source":"cron"}'::jsonb
  );
  $job$
);
