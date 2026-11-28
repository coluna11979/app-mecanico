-- Diagnosticador: "casos parecidos" na base da própria rede (lojas do mesmo dono). Responde, para um modelo de carro:
--   · o que mais é feito/trocado nesse modelo (serviços e peças mais frequentes);
--   · casos em que as palavras do sintoma/sistema aparecem (reclamação, observação, título, serviços, peças) e o que foi feito;
--   · retorno de garantia (OS com "cliente voltou") por serviço, para saber o que resolveu de verdade.
-- Só leitura; não mostra nome nem telefone de cliente.

create or replace function public.diag_similar_cases(
  p_workshop uuid, p_modelo text, p_marca text default null, p_ano integer default null,
  p_palavras text[] default null, p_limit integer default 8
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_model text := split_part(orc_norm(coalesce(p_modelo, '')), ' ', 1);
  v_words text[];
  v_lim integer := least(greatest(coalesce(p_limit, 8), 1), 15);
  v_res jsonb;
begin
  if length(v_model) < 2 then return jsonb_build_object('ok', false, 'error', 'modelo_obrigatorio'); end if;
  select profile_id into v_owner from workshops where id = p_workshop;
  select array_agg(distinct w) into v_words
    from (select orc_norm(btrim(x)) w from unnest(coalesce(p_palavras, '{}')) x) t
   where length(w) >= 3;

  with shops as (
    select id from workshops where id = p_workshop or (v_owner is not null and profile_id = v_owner)
  ),
  base as (
    select so.id, so.number, so.workshop_id, so.created_at, so.completed_at, v.make, v.model, v.year,
           concat_ws(' ', so.title, so.description, so.notes, so.rework_notes) txt,
           exists (select 1 from service_orders r where r.rework_of_id = so.id) voltou
      from service_orders so
      join shops s on s.id = so.workshop_id
      join vehicles v on v.id = so.vehicle_id
     where so.status <> 'cancelled' and coalesce(so.source, '') not in ('demo', 'balcao')
       and orc_norm(coalesce(v.model, '')) ~ ('(^|[^a-z0-9])' || v_model || '([^a-z0-9]|$)')
       and (p_marca is null or orc_norm(coalesce(v.make, '')) like '%' || orc_norm(p_marca) || '%' or orc_norm(coalesce(v.make, '')) ~ '^nao informad')
       and (p_ano is null or v.year is null or abs(v.year - p_ano) <= 4)
  ),
  itens as (
    select b.id os_id, i.kind, i.description, i.quantity from base b join service_order_items i on i.service_order_id = b.id
  ),
  hits as (
    select b.*, (select count(*) from unnest(coalesce(v_words, '{}')) w
                  where orc_norm(b.txt || ' ' || coalesce((select string_agg(it.description, ' ') from itens it where it.os_id = b.id), '')) like '%' || w || '%') score
      from base b
  ),
  match as (select * from hits where coalesce(array_length(v_words, 1), 0) = 0 or score > 0)
  select jsonb_build_object(
    'ok', true,
    'modelo', p_modelo, 'ano_aprox', p_ano,
    'os_do_modelo', (select count(*) from base),
    'casos_com_as_palavras', case when coalesce(array_length(v_words, 1), 0) > 0 then (select count(*) from match) end,
    'servicos_mais_feitos_no_modelo', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select it.description servico, count(distinct it.os_id) vezes,
               count(distinct it.os_id) filter (where b.voltou) voltou
          from itens it join base b on b.id = it.os_id where it.kind = 'labor'
         group by orc_norm(it.description), it.description order by count(distinct it.os_id) desc limit 12) x),
    'pecas_mais_trocadas_no_modelo', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select it.description peca, count(distinct it.os_id) vezes
          from itens it where it.kind = 'part'
         group by orc_norm(it.description), it.description order by count(distinct it.os_id) desc limit 12) x),
    'nos_casos_com_as_palavras', case when coalesce(array_length(v_words, 1), 0) > 0 then jsonb_build_object(
        'servicos', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
            select it.description servico, count(distinct it.os_id) vezes, count(distinct it.os_id) filter (where m.voltou) voltou
              from itens it join match m on m.id = it.os_id where it.kind = 'labor'
             group by orc_norm(it.description), it.description order by count(distinct it.os_id) desc limit 10) x),
        'pecas', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
            select it.description peca, count(distinct it.os_id) vezes
              from itens it join match m on m.id = it.os_id where it.kind = 'part'
             group by orc_norm(it.description), it.description order by count(distinct it.os_id) desc limit 10) x)) end,
    'exemplos', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select m.number os, to_char(coalesce(m.completed_at, m.created_at), 'MM/YYYY') quando,
               nullif(btrim(concat_ws(' ', nullif(m.make, 'Não informado'), m.model, m.year::text)), '') carro,
               left(regexp_replace(regexp_replace(m.txt, 'Nota nº ?[0-9]+', '', 'g'), '\s+', ' ', 'g'), 220) relato,
               (select string_agg(it.description, ' + ') from itens it where it.os_id = m.id and it.kind = 'labor') servicos,
               (select string_agg(it.description, ', ') from itens it where it.os_id = m.id and it.kind = 'part') pecas,
               m.voltou cliente_voltou
          from match m order by m.score desc, m.created_at desc limit v_lim) x)
  ) into v_res;
  return v_res;
end $$;
revoke all on function public.diag_similar_cases(uuid, text, text, integer, text[], integer) from public, anon, authenticated;
grant execute on function public.diag_similar_cases(uuid, text, text, integer, text[], integer) to service_role;

update ai_agents set tools = array_append(tools, 'diag_casos_parecidos')
 where template = 'diagnostico' and not ('diag_casos_parecidos' = any (tools));
