-- Comissão da peça-item (peça vendida como item próprio da OS, service_order_items.standalone = true).
-- A prévia "Comissões a pagar nesta OS" já tratava a peça-item como um item com dono e 4% sobre o valor dela;
-- a view os_commission_base (relatório do dia, quinzena, folha) não: entregava a peça ao serviço de cima e,
-- sem nenhum serviço na OS, deixava a comissão sem dono (ex.: OS só com um catalisador).
-- Agora a peça-item é o próprio grupo: dono = quem fez o item (senão o responsável da OS), tipo serviço (4%),
-- e não conta como "peça do serviço" de cima. Lê a definição vigente da view e troca só estes trechos.
do $$
declare d text; n text;
begin
  d := pg_get_viewdef('public.os_commission_base'::regclass, true);
  n := d;
  -- 1) a peça-item (standalone) chega até os grupos
  n := replace(n, E'i.service_type,\n', E'i.service_type,\n            i.standalone,\n');
  n := replace(n, E'b.service_type,\n', E'b.service_type,\n            b.standalone,\n');
  -- 2) peça-item é o próprio grupo (como um serviço): tem dono e base de 4% só dela
  n := replace(n, 'WHEN b.kind = ''labor''::text THEN b.id', 'WHEN b.kind = ''labor''::text OR b.standalone THEN b.id');
  -- 3) peça-item não conta como "peça do serviço" de cima
  n := replace(n, 'count(*) FILTER (WHERE s1.kind = ''part''::text) AS nparts', 'count(*) FILTER (WHERE s1.kind = ''part''::text AND NOT s1.standalone) AS nparts');
  -- 4) o grupo da peça-item é do tipo "serviço" (4%)
  n := replace(n, 'WHEN COALESCE(np.nparts, 0::bigint) > 0 THEN ''servico''::text', 'WHEN COALESCE(np.nparts, 0::bigint) > 0 OR sv.standalone THEN ''servico''::text');
  if n = d or position('i.standalone' in n) = 0 or position('b.standalone' in n) = 0
     or position('OR b.standalone THEN b.id' in n) = 0 or position('NOT s1.standalone' in n) = 0 or position('OR sv.standalone THEN' in n) = 0
     or (length(n) - length(replace(n, 'b.standalone,', ''))) / length('b.standalone,') <> 1 then
    raise exception 'view os_commission_base mudou: ajustar o patch';
  end if;
  execute 'create or replace view public.os_commission_base with (security_invoker = true) as ' || n;
end $$;
