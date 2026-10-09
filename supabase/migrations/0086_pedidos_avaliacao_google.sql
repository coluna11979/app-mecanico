-- Pedidos de avaliação no Google (módulo opcional `avaliacoes`, ligado pelo superadmin por oficina).
-- Quando a OS é concluída e quitada, entra uma linha na fila; a equipe confere e envia
-- pelo WhatsApp com 1 clique (nada sai sozinho). O link da avaliação é por oficina/loja.

alter table public.workshops add column if not exists google_review_url text;

create table if not exists public.review_requests (
  id               uuid primary key default gen_random_uuid(),
  workshop_id      uuid not null references public.workshops(id) on delete cascade,
  service_order_id uuid not null references public.service_orders(id) on delete cascade,
  customer_id      uuid not null references public.customers(id) on delete cascade,
  status           text not null default 'pending' check (status in ('pending', 'sent', 'skipped')),
  created_at       timestamptz not null default now(),
  sent_at          timestamptz,
  sent_by          uuid references auth.users(id) on delete set null,
  unique (service_order_id)
);
create index if not exists review_requests_workshop_status_idx on public.review_requests (workshop_id, status, created_at desc);
create index if not exists review_requests_customer_idx on public.review_requests (customer_id, sent_at desc);

alter table public.review_requests enable row level security;

drop policy if exists review_requests_read on public.review_requests;
create policy review_requests_read on public.review_requests for select
  using (public.is_workshop_member(workshop_id, auth.uid()) and public.workshop_module_enabled(workshop_id, 'avaliacoes'));

drop policy if exists review_requests_update on public.review_requests;
create policy review_requests_update on public.review_requests for update
  using (public.is_workshop_member(workshop_id, auth.uid()) and public.workshop_module_enabled(workshop_id, 'avaliacoes'))
  with check (public.is_workshop_member(workshop_id, auth.uid()));

-- A equipe só marca enviado / dispensado; as linhas nascem pelo gatilho abaixo
revoke all on public.review_requests from anon, authenticated;
grant select on public.review_requests to authenticated;
grant update (status, sent_at, sent_by) on public.review_requests to authenticated;

/* ── Gatilho: OS concluída e quitada entra na fila ─────────────────────────── */
create or replace function public.enqueue_review_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _c record;
begin
  if new.status <> 'completed' or new.paid_at is null or new.customer_id is null then
    return new;
  end if;
  -- só na transição (concluiu ou quitou agora), não a cada edição
  if tg_op = 'UPDATE' and old.status = 'completed' and old.paid_at is not null then
    return new;
  end if;
  if not public.workshop_module_enabled(new.workshop_id, 'avaliacoes') then
    return new;
  end if;

  select id, phone, contact_opt_out into _c from customers where id = new.customer_id;
  if not found or _c.phone is null or btrim(_c.phone) = '' or coalesce(_c.contact_opt_out, false) then
    return new;
  end if;

  -- no máximo 1 pedido por cliente a cada 90 dias (enviado ou ainda na fila)
  if exists (
    select 1 from review_requests r
    where r.customer_id = new.customer_id
      and (r.status = 'pending' or (r.status = 'sent' and r.sent_at > now() - interval '90 days'))
  ) then
    return new;
  end if;

  insert into review_requests (workshop_id, service_order_id, customer_id)
  values (new.workshop_id, new.id, new.customer_id)
  on conflict (service_order_id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_service_orders_review_request on public.service_orders;
create trigger trg_service_orders_review_request
  after insert or update of status, paid_at on public.service_orders
  for each row execute function public.enqueue_review_request();
