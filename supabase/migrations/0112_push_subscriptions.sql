-- Notificação push de nova demanda para o mecânico (celular toca mesmo com
-- a tela bloqueada / app fechado).
--
-- 1. push_subscriptions: um registro por aparelho que ativou os alertas.
-- 2. Trigger em jobs: quando nasce uma demanda aberta (ou volta a ficar
--    aberta, ou é um convite direto), chama a edge function notify-new-job
--    via pg_net (assíncrono — não atrasa nem derruba o insert).
--
-- A URL e o segredo da função ficam no Vault:
--   select vault.create_secret('<url>/functions/v1/notify-new-job', 'push_notify_url');
--   select vault.create_secret('<segredo>', 'push_notify_secret');
-- Sem esses dois segredos o trigger simplesmente não faz nada.

create extension if not exists pg_net with schema extensions;

create table if not exists public.push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  endpoint     text not null unique,
  p256dh       text not null,
  auth         text not null,
  user_agent   text,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz
);

create index if not exists push_subscriptions_user_idx on public.push_subscriptions(user_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists push_subscriptions_own on public.push_subscriptions;
create policy push_subscriptions_own on public.push_subscriptions
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Registra o aparelho para o usuário logado. Se o mesmo celular estava com
-- outro login, o aparelho passa a ser de quem está logado agora.
create or replace function public.register_push_subscription(
  p_endpoint text, p_p256dh text, p_auth text, p_user_agent text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, left(p_user_agent, 300))
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh,
        auth = excluded.auth, user_agent = excluded.user_agent;
end;
$$;

revoke all on function public.register_push_subscription(text, text, text, text) from public, anon;
grant execute on function public.register_push_subscription(text, text, text, text) to authenticated;

-- ── Trigger ──────────────────────────────────────────────────────────────
create or replace function public.notify_new_job_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url    text;
  v_secret text;
begin
  -- Demanda aberta nova, demanda que voltou a ficar aberta, ou convite direto
  if not (
       (tg_op = 'INSERT' and new.status = 'open')
    or (tg_op = 'INSERT' and new.status = 'assigned' and new.mechanic_id is not null)
    or (tg_op = 'UPDATE' and new.status = 'open' and old.status is distinct from 'open')
  ) then
    return new;
  end if;

  begin
    select decrypted_secret into v_url    from vault.decrypted_secrets where name = 'push_notify_url'    limit 1;
    select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'push_notify_secret' limit 1;
    if v_url is null or v_secret is null then
      return new;
    end if;

    perform net.http_post(
      url     := v_url,
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
      body    := jsonb_build_object('job_id', new.id, 'kind', case when new.status = 'open' then 'open' else 'invite' end)
    );
  exception when others then
    -- Push é "melhor esforço": nunca impede criar/reabrir a demanda
    raise warning 'notify_new_job_push falhou: %', sqlerrm;
  end;

  return new;
end;
$$;

revoke all on function public.notify_new_job_push() from public, anon, authenticated;

drop trigger if exists jobs_notify_push on public.jobs;
create trigger jobs_notify_push
  after insert or update of status on public.jobs
  for each row execute function public.notify_new_job_push();
