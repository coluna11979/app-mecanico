-- Orçamentista: excluir peças do cadastro, com a autorização do dono no chat.
-- Peça SEM nenhum uso (OS, compras, movimento de estoque, kits da Tabela de serviços, check-up) é apagada de verdade
-- (junto com os veículos vinculados). Peça COM uso não pode ser apagada sem quebrar o histórico: fica ARQUIVADA
-- (desativada), que é o que a tela de peças também faz. Até 50 por chamada; só o service_role executa.

create or replace function public.orc_parts_remove(p_workshop uuid, p_ids jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id    uuid;
  v_name  text;
  v_used  boolean;
  v_del   integer := 0;
  v_arq   integer := 0;
  v_skip  jsonb := '[]'::jsonb;
  v_arqn  jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(p_ids) <> 'array' or jsonb_array_length(p_ids) = 0 then return jsonb_build_object('ok', false, 'error', 'lista_vazia'); end if;
  if jsonb_array_length(p_ids) > 50 then return jsonb_build_object('ok', false, 'error', 'maximo_50_por_vez'); end if;

  for v_id in select distinct (x)::uuid from jsonb_array_elements_text(p_ids) x loop
    select name into v_name from workshop_parts where id = v_id and workshop_id = p_workshop;
    if not found then v_skip := v_skip || to_jsonb(v_id::text); continue; end if;

    v_used := exists (select 1 from service_order_items where part_id = v_id)
           or exists (select 1 from purchase_items where part_id = v_id)
           or exists (select 1 from stock_movements where part_id = v_id)
           or exists (select 1 from workshop_service_parts where part_id = v_id)
           or exists (select 1 from checkup_items where quote_part_id = v_id);
    if v_used then
      update workshop_parts set active = false where id = v_id;
      v_arq := v_arq + 1;
      v_arqn := v_arqn || to_jsonb(v_name);
    else
      delete from workshop_part_vehicles where part_id = v_id;
      delete from workshop_parts where id = v_id;
      v_del := v_del + 1;
    end if;
  end loop;
  return jsonb_build_object('ok', true, 'apagadas', v_del, 'arquivadas_por_terem_uso', v_arq, 'nomes_arquivadas', v_arqn, 'nao_encontradas', v_skip);
end $$;

revoke all on function public.orc_parts_remove(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.orc_parts_remove(uuid, jsonb) to service_role;
