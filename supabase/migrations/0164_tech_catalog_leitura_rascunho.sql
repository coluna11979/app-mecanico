-- Catálogo técnico: a oficina passa a enxergar também as fichas em rascunho (a oficina confere no uso).
-- Escrita continua só do admin. O status segue existindo: a tela avisa "ficha ainda não verificada".
drop policy if exists tech_fluid_specs_read on public.tech_fluid_specs;
create policy tech_fluid_specs_read on public.tech_fluid_specs
  for select to authenticated using (true);

drop policy if exists tech_filter_refs_read on public.tech_filter_refs;
create policy tech_filter_refs_read on public.tech_filter_refs
  for select to authenticated using (true);

drop policy if exists tech_vehicles_read on public.tech_vehicles;
create policy tech_vehicles_read on public.tech_vehicles
  for select to authenticated using (true);
