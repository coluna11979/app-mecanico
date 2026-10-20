-- Funil separado por tipo (mecanico | oficina) com etapa de ativação.
-- Versão final já corrigida com cast p/ user_role (patch 0131b aplicado em prod).
create or replace function public.admin_funil_por_tipo(p_tipo text)
returns table (
  leads_total       int,
  contato_feito     int,
  interessado       int,
  cadastro_iniciado int,
  convertido        int,
  perdido           int,
  profiles_total    int,
  aprovados         int,
  com_atividade     int,
  intent_valido     boolean
)
language plpgsql security definer set search_path = public as $$
declare
  v_intent text;
  v_role   public.user_role;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'::public.user_role) then
    raise exception 'Acesso restrito a admin';
  end if;

  v_intent := case when p_tipo in ('mechanic', 'mecanico') then 'mechanic'
                   when p_tipo in ('workshop', 'oficina')  then 'workshop'
                   else null end;
  v_role   := case when v_intent = 'mechanic' then 'mechanic'::public.user_role
                   when v_intent = 'workshop' then 'workshop'::public.user_role
                   else null end;

  if v_intent is null then
    return query select 0,0,0,0,0,0,0,0,0, false;
    return;
  end if;

  return query
  with
  ldata as (
    select
      count(*) filter (where status in ('lead_novo','contato_feito','interessado','cadastro_iniciado','convertido','perdido')) as total,
      count(*) filter (where status = 'contato_feito') as contato,
      count(*) filter (where status = 'interessado') as inter,
      count(*) filter (where status = 'cadastro_iniciado') as iniciado,
      count(*) filter (where status = 'convertido') as conv,
      count(*) filter (where status = 'perdido')    as perd
      from public.leads
     where intent = v_intent
  ),
  pdata as (
    select
      count(*) as total,
      count(*) filter (where status = 'approved') as aprov
      from public.profiles
     where role = v_role
  ),
  adata as (
    select count(distinct p.id) as com_atividade
      from public.profiles p
     where p.role = v_role
       and p.status = 'approved'
       and (
         (v_role = 'mechanic'::public.user_role and exists (
            select 1 from public.jobs j
             join public.mechanics m on m.id = j.mechanic_id
            where m.profile_id = p.id
         ))
         or
         (v_role = 'workshop'::public.user_role and exists (
            select 1 from public.jobs j
             join public.workshops w on w.id = j.workshop_id
            where w.profile_id = p.id
         ))
       )
  )
  select
    ldata.total::int,
    ldata.contato::int,
    ldata.inter::int,
    ldata.iniciado::int,
    ldata.conv::int,
    ldata.perd::int,
    pdata.total::int,
    pdata.aprov::int,
    adata.com_atividade::int,
    true
    from ldata, pdata, adata;
end;
$$;
revoke all on function public.admin_funil_por_tipo(text) from public;
grant execute on function public.admin_funil_por_tipo(text) to authenticated;

comment on function public.admin_funil_por_tipo(text) is 'Funil completo por tipo: lead → cadastro → aprovado → ativado (primeira atividade real).';
