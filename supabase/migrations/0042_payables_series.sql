-- Série de contas recorrentes (ex.: aluguel 12x): permite editar "esta e as próximas".
alter table public.payables add column if not exists series_id uuid;
create index if not exists payables_series_idx on public.payables (series_id) where series_id is not null;

-- Séries já lançadas: contas avulsas parceladas criadas no mesmo instante (mesmo insert)
with s as (
  select workshop_id, created_at, category, gen_random_uuid() as sid
    from public.payables
   where invoice_id is null and installment is not null and series_id is null
   group by workshop_id, created_at, category
  having count(*) > 1
)
update public.payables p set series_id = s.sid
  from s
 where p.workshop_id = s.workshop_id and p.created_at = s.created_at and p.category = s.category
   and p.invoice_id is null and p.installment is not null and p.series_id is null;
