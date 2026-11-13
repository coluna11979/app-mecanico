-- Código do fornecedor → peça do cadastro. A nota seguinte do mesmo fornecedor reconhece a peça pelo código,
-- mesmo que a descrição tenha sido mudada no cadastro (e sem confundir com o código de outro fornecedor).
create table if not exists public.part_supplier_codes (
  workshop_id uuid not null references public.workshops(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  code        text not null check (length(trim(code)) > 0),
  part_id     uuid not null references public.workshop_parts(id) on delete cascade,
  updated_at  timestamptz not null default now(),
  primary key (supplier_id, code)
);
create index if not exists part_supplier_codes_part on public.part_supplier_codes(part_id);

alter table public.part_supplier_codes enable row level security;
drop policy if exists part_supplier_codes_members on public.part_supplier_codes;
create policy part_supplier_codes_members on public.part_supplier_codes
  for all
  using      (is_workshop_member(workshop_id, auth.uid()) or is_admin(auth.uid()))
  with check (is_workshop_member(workshop_id, auth.uid()) or is_admin(auth.uid()));

-- Já cadastradas pelas notas: peça com fornecedor e código (fora a planilha do sistema antigo, que tem o código da loja)
insert into public.part_supplier_codes (workshop_id, supplier_id, code, part_id)
select distinct on (p.supplier_id, trim(p.code)) p.workshop_id, p.supplier_id, trim(p.code), p.id
  from public.workshop_parts p
 where p.supplier_id is not null and nullif(trim(p.code), '') is not null and p.origin is distinct from 'planilha'
 order by p.supplier_id, trim(p.code), p.created_at
on conflict do nothing;
