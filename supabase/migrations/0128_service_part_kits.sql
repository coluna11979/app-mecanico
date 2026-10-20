-- Kit de peças por serviço: "Troca de óleo" → óleo do motor (4 L), filtro de óleo, junta do bujão…
-- Na OS, ao escolher o serviço no catálogo, o painel oferece essas peças para entrar junto.
-- A peça pode vir do estoque (part_id, traz preço e saldo) ou ser só um nome avulso.
create table if not exists public.workshop_service_parts (
  id          uuid primary key default uuid_generate_v4(),
  workshop_id uuid not null references public.workshops(id) on delete cascade,
  service_id  uuid not null references public.workshop_services(id) on delete cascade,
  part_id     uuid references public.workshop_parts(id) on delete set null,
  description text not null check (length(trim(description)) > 0),
  quantity    numeric not null default 1 check (quantity > 0),
  position    integer not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists workshop_service_parts_service_idx on public.workshop_service_parts (service_id, position);

alter table public.workshop_service_parts enable row level security;
drop policy if exists workshop_service_parts_members on public.workshop_service_parts;
create policy workshop_service_parts_members on public.workshop_service_parts
  for all
  using      (is_workshop_member(workshop_id, auth.uid()) or is_admin(auth.uid()))
  with check (is_workshop_member(workshop_id, auth.uid()) or is_admin(auth.uid()));

-- Serviço e peça precisam ser da mesma oficina do kit
create or replace function public.check_service_part_workshop() returns trigger
language plpgsql set search_path = public as $$
begin
  if not exists (select 1 from workshop_services s where s.id = new.service_id and s.workshop_id = new.workshop_id) then
    raise exception 'Serviço de outra oficina';
  end if;
  if new.part_id is not null and not exists (select 1 from workshop_parts p where p.id = new.part_id and p.workshop_id = new.workshop_id) then
    raise exception 'Peça de outra oficina';
  end if;
  return new;
end $$;

drop trigger if exists trg_service_part_workshop on public.workshop_service_parts;
create trigger trg_service_part_workshop before insert or update on public.workshop_service_parts
  for each row execute function public.check_service_part_workshop();

-- Ajuda a montar o kit: peças que já saíram nas OS sob um serviço de nome parecido (mesmo modelo de carro primeiro).
-- É só sugestão: numa nota com vários serviços, nem toda peça abaixo de um serviço é dele.
create or replace function public.service_part_suggestions(p_workshop uuid, p_service text, p_model text default null)
returns table (name text, part_id uuid, uses_model bigint, uses_all bigint, qty numeric, unit_price numeric, last_at timestamptz)
language sql stable security invoker set search_path = public as $$
with n as (
  select translate(lower(trim(p_service)), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc') as s,
         translate(lower(trim(coalesce(p_model, ''))), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc') as m
),
b as (
  select i.id, i.service_order_id, i.kind, i.description, i.quantity, i.unit_price, i.part_id, i.used_in_item_id, i.created_at, so.vehicle_id,
         count(*) filter (where i.kind = 'labor') over (partition by i.service_order_id order by i.position, i.created_at, i.id) as g
    from service_order_items i
    join service_orders so on so.id = i.service_order_id
   where i.workshop_id = p_workshop and so.status <> 'cancelled' and so.quote_status is null
),
labor as (
  select b.id, b.vehicle_id
    from b cross join n
   where b.kind = 'labor' and length(n.s) >= 4
     and translate(lower(b.description), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc') like '%' || n.s || '%'
),
parts as (
  select p.*, coalesce(lk.id, gl.id) as svc_id
    from b p
    left join b lk on lk.id = p.used_in_item_id and lk.kind = 'labor'
    left join b gl on gl.service_order_id = p.service_order_id and gl.kind = 'labor' and gl.g = greatest(p.g, 1)
   where p.kind = 'part' and p.unit_price > 0
),
hit as (
  select p.*, (n.m <> '' and translate(lower(coalesce(v.model, '')), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc') = n.m) as same_model
    from parts p
    join labor l on l.id = p.svc_id
    cross join n
    left join vehicles v on v.id = l.vehicle_id
)
select (array_agg(h.description order by h.created_at desc))[1],
       (array_agg(h.part_id order by h.created_at desc) filter (where h.part_id is not null))[1],
       count(distinct h.service_order_id) filter (where h.same_model),
       count(distinct h.service_order_id),
       (array_agg(h.quantity order by h.created_at desc))[1],
       (array_agg(h.unit_price order by h.created_at desc))[1],
       max(h.created_at)
  from hit h
 group by translate(lower(trim(h.description)), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc')
 order by 3 desc, 4 desc, 7 desc
 limit 10
$$;

revoke all on function public.service_part_suggestions(uuid, text, text) from public, anon;
grant execute on function public.service_part_suggestions(uuid, text, text) to authenticated;
