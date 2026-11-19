-- Destinatários das campanhas de e-mail (edge function marketing-email).
--
-- Por que existe: a função resolvia os e-mails com auth.admin.listUsers() (GoTrue). Basta UMA linha de
-- auth.users com banned_until = 'infinity' (a trigger sync_operator_login_ban grava isso ao desativar um
-- colaborador) pra o GoTrue falhar ao ler a lista: "Database error finding users" / HTTP 500. Aqui o JOIN
-- profiles x auth.users é feito direto no banco, sem passar pelo GoTrue, e todas as regras ficam num lugar só.
--
-- Regras:
--   * descadastrados (marketing_unsubscribes) nunca entram — se a tabela falhar, a função falha (nunca "libera");
--   * lead só com consentimento, sem perfil vinculado, não perdido/convertido, com e-mail válido;
--   * lead cujo e-mail já tem conta NÃO entra como lead: quem decide é o status da conta
--     (senão um mecânico "em espera por região" voltaria pela porta dos leads);
--   * status 'pending' = pendente + em análise (NÃO inclui awaiting_region);
--   * status 'approved' = só aprovados;
--   * status 'all' = pendente + em análise + aprovados (rejeitados e em espera por região ficam de fora);
--   * oficina = dono de oficina (linha em workshops). Conta de equipe tem role 'workshop' mas não é oficina e usa
--     e-mail sintético (@equipe.mecanicoapp.app) que não existe: não recebe campanha;
--   * 1 linha por e-mail (perfil ganha do lead).

create or replace function public.marketing_recipients(
  p_audience text default 'all',
  p_status text default 'all',
  p_state text default null,
  p_include_leads boolean default false
)
returns table (email text, name text, profile_id uuid, lead_id uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_state text := nullif(upper(btrim(coalesce(p_state, ''))), '');
begin
  if p_audience is null or p_audience not in ('mechanic', 'workshop', 'all') then
    raise exception 'audience invalido: % (use mechanic, workshop ou all)', p_audience using errcode = '22023';
  end if;
  if p_status is null or p_status not in ('pending', 'approved', 'all') then
    raise exception 'status invalido: % (use pending, approved ou all)', p_status using errcode = '22023';
  end if;

  return query
  with candidatos as (
    -- contas (perfis)
    select lower(btrim(u.email)) as c_email, p.full_name::text as c_name, p.id as c_profile_id, null::uuid as c_lead_id, 0 as prio
    from public.profiles p
    join auth.users u on u.id = p.id
    where nullif(btrim(u.email), '') is not null
      and (
        (p.role = 'mechanic' and p_audience in ('mechanic', 'all') and exists (
          select 1 from public.mechanics m
          where m.profile_id = p.id and (v_state is null or upper(btrim(coalesce(m.state, ''))) = v_state)))
        or
        (p.role = 'workshop' and p_audience in ('workshop', 'all') and exists (
          select 1 from public.workshops w
          where w.profile_id = p.id and (v_state is null or upper(btrim(coalesce(w.state, ''))) = v_state)))
      )
      and (
        (p_status = 'pending'  and p.status in ('pending', 'under_review'))
        or (p_status = 'approved' and p.status = 'approved')
        or (p_status = 'all'      and p.status in ('pending', 'under_review', 'approved'))
      )

    union all

    -- leads (só com consentimento)
    select lower(btrim(l.email)), l.name::text, null::uuid, l.id, 1
    from public.leads l
    where p_include_leads
      and l.consent is true
      and l.converted_profile_id is null
      and l.status::text not in ('perdido', 'convertido')
      and (p_audience = 'all' or l.intent = p_audience)
      and (v_state is null or upper(btrim(coalesce(l.estado, ''))) = v_state)
      and lower(btrim(l.email)) ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
      and not exists (select 1 from auth.users u2 where lower(btrim(u2.email)) = lower(btrim(l.email)))
  )
  select d.c_email, d.c_name, d.c_profile_id, d.c_lead_id
  from (
    select distinct on (c.c_email) c.*
    from candidatos c
    where not exists (select 1 from public.marketing_unsubscribes s where lower(btrim(s.email)) = c.c_email)
    order by c.c_email, c.prio
  ) d
  order by d.c_email;
end;
$$;

-- Devolve e-mails de todo mundo: só a edge function (service_role) pode chamar. Sem isso, qualquer usuário
-- logado listaria os e-mails da plataforma pelo PostgREST.
revoke all on function public.marketing_recipients(text, text, text, boolean) from public, anon, authenticated;
grant execute on function public.marketing_recipients(text, text, text, boolean) to service_role;
