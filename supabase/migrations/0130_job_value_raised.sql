-- Valor aumentou: quando a oficina sobe o valor de uma demanda que ninguém aceitou, os mecânicos
-- que receberam o aviso dela recebem um novo push ("💰 Valor aumentou: R$ X → R$ Y").
-- Antes só a demanda nova tocava o celular: quem achou pouco e ignorou nunca sabia do aumento.
--
--   raised_at          última vez que o valor subiu (o mecânico vê o selo "Valor aumentou" por 24 h)
--   raised_from        valor (bruto) antes da primeira alta da rodada — o "era R$ X" do selo
--   raise_notified_at  último push de aumento: no máximo 1 a cada 15 min por demanda (sem spam)
--
-- Só conta aumento do total (valor/hora × horas, ou o preço fechado). Editar texto, horário ou baixar
-- o valor não avisa ninguém. O envio usa a mesma função do aviso de demanda nova (kind = 'raise').

alter table public.jobs
  add column if not exists raised_at         timestamptz,
  add column if not exists raised_from       numeric(10,2),
  add column if not exists raise_notified_at timestamptz;

create or replace function public.job_value_raised()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old    numeric;
  v_new    numeric;
  v_url    text;
  v_secret text;
begin
  if new.status <> 'open' or new.mechanic_id is not null then
    return new;
  end if;

  -- Mesmo cálculo de jobGross() (src/lib/payment.ts)
  v_old := coalesce(nullif(coalesce(old.price_per_hour, 0) * coalesce(old.max_hours, 1), 0), old.price, 0);
  v_new := coalesce(nullif(coalesce(new.price_per_hour, 0) * coalesce(new.max_hours, 1), 0), new.price, 0);
  if v_new <= v_old then
    return new;
  end if;

  -- Primeira alta da rodada (ou depois de 24 h): guarda o valor de antes para o "era R$ X"
  if new.raised_at is null or new.raised_at < now() - interval '24 hours' then
    new.raised_from := v_old;
  end if;
  new.raised_at := now();

  -- Já avisou há pouco: só atualiza o selo, sem tocar o celular de novo
  if old.raise_notified_at is not null and old.raise_notified_at > now() - interval '15 minutes' then
    return new;
  end if;
  new.raise_notified_at := now();

  begin
    select decrypted_secret into v_url    from vault.decrypted_secrets where name = 'push_notify_url'    limit 1;
    select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'push_notify_secret' limit 1;
    if v_url is null or v_secret is null then
      return new;
    end if;

    -- pg_net envia depois do commit: a função já lê o valor novo
    perform net.http_post(
      url     := v_url,
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
      body    := jsonb_build_object('job_id', new.id, 'kind', 'raise', 'from', new.raised_from)
    );
  exception when others then
    -- Push é "melhor esforço": nunca impede a oficina de editar a demanda
    raise warning 'job_value_raised falhou: %', sqlerrm;
  end;

  return new;
end;
$$;

revoke all on function public.job_value_raised() from public, anon, authenticated;

drop trigger if exists jobs_value_raised on public.jobs;
create trigger jobs_value_raised
  before update of price_per_hour, max_hours, price on public.jobs
  for each row execute function public.job_value_raised();
