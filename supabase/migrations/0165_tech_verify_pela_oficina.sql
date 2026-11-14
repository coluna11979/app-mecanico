-- A oficina confere a ficha do catálogo técnico e aprova ("Conferi, aprovar"), igual ao admin.
-- A tabela é global: quem aprova marca verified_by/verified_at, e a ficha passa a valer para todos.
-- Só membro da oficina informada (ou admin) pode aprovar; "tirar do ar" continua só no admin.
create or replace function public.tech_verify_vehicle(p_workshop uuid, p_vehicle uuid)
returns int
language plpgsql security definer set search_path = public as $$
declare n int := 0; m int := 0;
begin
  if auth.uid() is null or not (is_admin(auth.uid()) or is_workshop_member(p_workshop, auth.uid())) then
    raise exception 'Sem permissão';
  end if;
  update tech_fluid_specs set status = 'verificado', verified_by = auth.uid(), verified_at = now()
   where vehicle_id = p_vehicle and status = 'rascunho';
  get diagnostics n = row_count;
  update tech_filter_refs set status = 'verificado', verified_by = auth.uid(), verified_at = now()
   where vehicle_id = p_vehicle and status = 'rascunho';
  get diagnostics m = row_count;
  return n + m;
end $$;

revoke all on function public.tech_verify_vehicle(uuid, uuid) from public, anon;
grant execute on function public.tech_verify_vehicle(uuid, uuid) to authenticated;
