-- Fecha o furo da trava da 0189: nome de serviço escrito à mão (fora da Tabela) escapava da regra "leva peça"
-- (ex.: Jota Car OS 1684, "TROCA OLEO CAMBIO" concluída sem óleo). Nas lojas com a regra ligada (têm serviço
-- marcado "leva peça"), a OS aberta a partir de 20/11/2026 00:05 (UTC) só conclui se:
--   · todo serviço tiver nome da Tabela de serviços (ativo);
--   · nenhuma peça estiver solta com preço fora de serviço (pneu é a exceção).
-- OS mais antigas continuam só com a regra "leva peça". Venda de balcão, importação, demonstração e retorno ficam de fora.

create or replace function public.trg_os_require_parts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v text[]; v2 text[]; v3 text[];
begin
  if new.status = 'completed' and old.status is distinct from 'completed'
     and coalesce(new.source, '') not in ('balcao', 'paper_import', 'demo')
     and new.rework_of_id is null then

    -- Regras novas: só nas lojas que ligaram ("leva peça") e só para OS abertas depois da trava
    if new.created_at >= '2026-11-20 00:05:00+00'
       and exists (select 1 from workshop_services s where s.workshop_id = new.workshop_id and s.leva_peca) then
      select array_agg(i.description order by i.position) into v2
        from service_order_items i
       where i.service_order_id = new.id and i.kind = 'labor'
         and not exists (select 1 from workshop_services s where s.workshop_id = new.workshop_id and s.active
                           and orc_norm(s.name) = orc_norm(i.description));
      if coalesce(array_length(v2, 1), 0) > 0 then
        raise exception 'Serviço fora da Tabela: %. Escolha o serviço na lista da Tabela de serviços (se faltar, o gestor cadastra em Serviços).',
          array_to_string(v2, ', ') using errcode = 'P0001';
      end if;

      with b as (
        select i.*, count(*) filter (where i.kind = 'labor') over (order by i.position, i.created_at, i.id) g
          from service_order_items i where i.service_order_id = new.id
      )
      select array_agg(p.description order by p.position) into v3
        from b p
       where p.kind = 'part' and p.used_in_item_id is null
         and (coalesce(p.standalone, false) or p.g = 0)
         and orc_norm(p.description) !~ '(pneu|camara de ar|[0-9]{3}/[0-9]{2})'
         and not exists (select 1 from workshop_parts wp where wp.id = p.part_id and wp.category = 'rodas');
      if coalesce(array_length(v3, 1), 0) > 0 then
        raise exception 'Peça solta na OS: %. Na OS a peça entra dentro de um serviço, só com o custo (venda de peça é pelo Caixa).',
          array_to_string(v3, ', ') using errcode = 'P0001';
      end if;
    end if;

    if not coalesce(new.customer_brought_parts, false) then
      v := os_services_missing_parts(new.id);
      if coalesce(array_length(v, 1), 0) > 0 then
        raise exception 'Falta lançar a peça de: %. Esse serviço leva peça: coloque a peça dentro dele (com o custo) ou marque "Cliente trouxe a peça".',
          array_to_string(v, ', ') using errcode = 'P0001';
      end if;
    end if;
  end if;
  return new;
end $$;
