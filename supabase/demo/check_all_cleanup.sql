-- Remove os dados de DEMONSTRAÇÃO da oficina "Check All" (gerados por check_all_seed.sql).
-- Mantém os dados reais de teste que já existiam (source 'app' / 'paper_import').
do $$
declare wid uuid := 'be54b880-2983-4703-8221-01efb837298c';
begin
  delete from service_orders where workshop_id = wid and source = 'demo';          -- itens e pausas vão junto (cascade)
  delete from customers where workshop_id = wid and source = 'demo';               -- carros e recomendações vão junto
  delete from workshop_mechanic_absences where workshop_id = wid and created_by is null;   -- inseridos pelo script
  update workshop_mechanics set status = 'active', active = true where workshop_id = wid and status = 'away' and notes is distinct from 'DEMO';
  delete from workshop_mechanics where workshop_id = wid and notes = 'DEMO';
  -- renumera o que sobrou
  update service_orders set number = number + 100000 where workshop_id = wid;
  update service_orders s set number = x.rn
    from (select id, row_number() over (order by created_at, id) rn from service_orders where workshop_id = wid) x
   where s.id = x.id;
end $$;
