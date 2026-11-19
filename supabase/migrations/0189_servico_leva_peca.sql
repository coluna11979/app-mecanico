-- Serviço que LEVA PEÇA só conclui com a peça lançada dentro dele.
-- Raiz do problema (Jota Car, 19/11/2026): a equipe lançava só o serviço (a nota de papel não lista peças). Sem peça,
-- o sistema tratava como "mão de obra" (10% de comissão), o Caixa corrigia a comissão à mão para 4% e o custo das
-- peças nunca entrava (DRE sem custo, estoque sem baixa).
--  · workshop_services.leva_peca: marcado na Tabela de serviços. Começa ligado só na Jota Car e na Check All 2
--    (alinhamento, balanceamento, diagnóstico, limpeza etc. ficam como "só mão de obra"); nas outras lojas, desligado.
--  · Trigger: a OS não vai para "concluída" com serviço que leva peça sem nenhuma peça dentro, a não ser que o
--    cliente tenha trazido a peça. Vale para tela, Caixa e agentes. Não vale para venda de balcão, importação de
--    nota antiga, demonstração e retorno (garantia).

alter table public.workshop_services add column if not exists leva_peca boolean not null default false;
comment on column public.workshop_services.leva_peca is
  'true = o serviço usa peça: a OS só conclui com peça dentro dele (ou "cliente trouxe a peça"); false = só mão de obra';

-- Liga só nas lojas que pediram (Jota Car e a loja de teste Check All 2). Nas demais nada muda até marcarem na Tabela.
update public.workshop_services set leva_peca = true
 where workshop_id in ('69408e90-6119-4d33-b73d-b91c24ed44de', 'ebe7c512-8c68-4ae3-a608-bc606facb5de')
   and not (orc_norm(name) ~ '(alinhament|balanceament|cambage|rodizio|diagnostic|scanner|regulage|limpeza|higieniza|lavage|montage|desmontage|conserto de pneu|reparo de pneu|vulcaniza|socorro|guincho|revisao|check|inspec|avaliac|teste|mao de obra|bico$|^bico )'
            or coalesce(orc_norm(category), '') in ('diagnostico', 'revisao geral'));

-- Serviços da OS que levam peça e estão sem peça (mesma ligação peça→serviço da tela e da comissão: pela ordem das linhas)
create or replace function public.os_services_missing_parts(p_os uuid)
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  with b as (
    select i.*, count(*) filter (where i.kind = 'labor') over (order by i.position, i.created_at, i.id) g
      from service_order_items i where i.service_order_id = p_os
  )
  select coalesce(array_agg(l.description order by l.position), '{}')
    from b l
    join service_orders so on so.id = p_os
   where l.kind = 'labor'
     and exists (select 1 from workshop_services s where s.workshop_id = so.workshop_id and s.active and s.leva_peca
                   and orc_norm(s.name) = orc_norm(l.description))
     and not exists (select 1 from b p where p.kind = 'part'
                       and (p.used_in_item_id = l.id or (p.used_in_item_id is null and not coalesce(p.standalone, false) and p.g = l.g)));
$$;
grant execute on function public.os_services_missing_parts(uuid) to authenticated, service_role;

create or replace function public.trg_os_require_parts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v text[];
begin
  if new.status = 'completed' and old.status is distinct from 'completed'
     and coalesce(new.source, '') not in ('balcao', 'paper_import', 'demo')
     and new.rework_of_id is null
     and not coalesce(new.customer_brought_parts, false) then
    v := os_services_missing_parts(new.id);
    if coalesce(array_length(v, 1), 0) > 0 then
      raise exception 'Falta lançar a peça de: %. Esse serviço leva peça: coloque a peça dentro dele (com o custo) ou marque "Cliente trouxe a peça".',
        array_to_string(v, ', ') using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_service_orders_require_parts on public.service_orders;
create trigger trg_service_orders_require_parts
  before update of status on public.service_orders
  for each row execute function public.trg_os_require_parts();
