-- ─────────────────────────────────────────────────────────────────────────────
-- 0049 · Endurece permissões das funções do schema public (security advisor)
--
-- Só mexe em permissões (GRANT/REVOKE) e definições de função. Não altera dados.
--
-- Contexto: no Postgres toda função nova nasce com EXECUTE para PUBLIC, e o
-- Supabase ainda concede para anon/authenticated. Por isso cada REVOKE abaixo
-- tira de PUBLIC *e* de anon; depois devolve só a quem realmente chama.
--
-- NÃO mexemos em is_admin / is_workshop_member / is_workshop_owner /
-- is_workshop_vip: elas são usadas em políticas RLS declaradas "to public"
-- (inclui anon). Sem EXECUTE, qualquer leitura deslogada dessas tabelas
-- quebraria com "permission denied for function". Elas só devolvem true/false.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) Bug real: admin_listar_embaixadores não checava quem chamava — qualquer
--    pessoa (até deslogada) via nome, telefone e comissões dos embaixadores.
create or replace function public.admin_listar_embaixadores()
returns table(
  mechanic_id uuid, profile_id uuid, full_name text, phone text,
  codigo_indicacao text, embaixador_desde timestamptz, embaixador_ate timestamptz,
  ativo boolean, total_indicados integer, comissao_acumulada numeric, comissao_pendente numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'forbidden';
  end if;

  return query
  select
    m.id,
    p.id,
    p.full_name,
    p.phone,
    m.codigo_indicacao,
    m.embaixador_desde,
    m.embaixador_ate,
    public.embaixador_ativo(m.id),
    (select count(*)::int from public.mechanics where indicado_por = m.id),
    (select coalesce(sum(comissao), 0) from public.comissoes_embaixador where embaixador_id = m.id),
    (select coalesce(sum(comissao), 0) from public.comissoes_embaixador where embaixador_id = m.id and pago_em is null)
  from public.mechanics m
  join public.profiles p on p.id = m.profile_id
  where m.is_embaixador
  order by m.embaixador_desde desc nulls last;
end;
$$;

-- 2) Funções de gatilho: são disparadas pelo banco, ninguém chama por RPC.
--    (Gatilho não precisa de EXECUTE do usuário para disparar.)
revoke execute on function public.handle_new_user()                  from public, anon, authenticated;
revoke execute on function public.trg_recalc_job_stats()             from public, anon, authenticated;
revoke execute on function public.registrar_comissao_embaixador()    from public, anon, authenticated;
revoke execute on function public.ensure_workshop_owner_membership() from public, anon, authenticated;
revoke execute on function public.add_workshop_owner()               from public, anon, authenticated;

-- 3) Internas: só usadas por outras funções SECURITY DEFINER / gatilhos
--    (rodam como dono) — nenhum lugar do app chama direto.
revoke execute on function public.recalc_mechanic_stats(uuid)  from public, anon, authenticated;
revoke execute on function public.recalc_workshop_stats(uuid)  from public, anon, authenticated;
revoke execute on function public.embaixador_ativo(uuid)       from public, anon, authenticated;
revoke execute on function public.workshop_pending_fees(uuid)  from public, anon, authenticated;
revoke execute on function public.cleanup_job_locations()      from public, anon, authenticated;

-- 4) Só para usuário logado (o app chama estas depois do login).
--    As de admin já checam is_admin(auth.uid()) por dentro; as do próprio
--    usuário filtram por auth.uid().
revoke execute on function public.admin_get_user_email(uuid)       from public, anon;
revoke execute on function public.admin_listar_embaixadores()      from public, anon;
revoke execute on function public.admin_pagar_comissoes(uuid, numeric) from public, anon;
revoke execute on function public.tornar_embaixador(uuid)          from public, anon;
revoke execute on function public.revogar_embaixador(uuid)         from public, anon;
revoke execute on function public.broadcast_notification(text, text, text, text, text) from public, anon;
revoke execute on function public.cancel_broadcast(uuid)           from public, anon;
revoke execute on function public.embaixador_resumo()              from public, anon;
revoke execute on function public.embaixador_indicados()           from public, anon;
revoke execute on function public.touch_last_seen()                from public, anon;
revoke execute on function public.get_mechanic_reviews(uuid)       from public, anon;
revoke execute on function public.get_workshop_reviews(uuid)       from public, anon;
revoke execute on function public.public_stripe_config()           from public, anon;

grant execute on function public.admin_get_user_email(uuid)       to authenticated;
grant execute on function public.admin_listar_embaixadores()      to authenticated;
grant execute on function public.admin_pagar_comissoes(uuid, numeric) to authenticated;
grant execute on function public.tornar_embaixador(uuid)          to authenticated;
grant execute on function public.revogar_embaixador(uuid)         to authenticated;
grant execute on function public.broadcast_notification(text, text, text, text, text) to authenticated;
grant execute on function public.cancel_broadcast(uuid)           to authenticated;
grant execute on function public.embaixador_resumo()              to authenticated;
grant execute on function public.embaixador_indicados()           to authenticated;
grant execute on function public.touch_last_seen()                to authenticated;
grant execute on function public.get_mechanic_reviews(uuid)       to authenticated;
grant execute on function public.get_workshop_reviews(uuid)       to authenticated;
grant execute on function public.public_stripe_config()           to authenticated;

-- Continuam públicas de propósito (páginas abertas, sem login):
--   get_public_checkup(text)        → /checkup/:token (relatório do cliente)
--   resolver_codigo_indicacao(text) → /cadastro/mecanico (código de indicação)

-- 5) service_role (Edge Functions / painel) mantém acesso a tudo que foi mexido.
grant execute on function
  public.handle_new_user(), public.trg_recalc_job_stats(), public.registrar_comissao_embaixador(),
  public.ensure_workshop_owner_membership(), public.add_workshop_owner(),
  public.recalc_mechanic_stats(uuid), public.recalc_workshop_stats(uuid),
  public.embaixador_ativo(uuid), public.workshop_pending_fees(uuid), public.cleanup_job_locations()
to service_role;

-- 6) search_path fixo (function_search_path_mutable). Tudo o que essas funções
--    usam mora em public (inclusive a extensão unaccent).
alter function public.is_admin(uuid)                       set search_path = public;
alter function public.is_workshop_member(uuid, uuid)       set search_path = public;
alter function public.touch_updated_at()                   set search_path = public;
alter function public.update_mechanic_rating()             set search_path = public;
alter function public.update_workshop_rating()             set search_path = public;
alter function public.cleanup_job_locations()              set search_path = public;
alter function public.ensure_workshop_owner_membership()   set search_path = public;
alter function public.add_workshop_owner()                 set search_path = public;
alter function public.public_stripe_config()               set search_path = public;
alter function public.gerar_codigo_indicacao(text)         set search_path = public;
alter function public.is_secret_setting_key(text)          set search_path = public;
alter function public.guess_part_category(text)            set search_path = public;
alter function public.workshop_parts_fill_category()       set search_path = public;
