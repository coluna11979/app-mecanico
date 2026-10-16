-- RPCs para o fluxo de link de convite:
-- 1) mark_lead_signup_started: chamada quando a página de signup abre com ?lead=
-- 2) convert_lead_to_profile:  chamada pelo usuário logo após criar a conta

-- 1. Marca o lead como "cadastro_iniciado" (anon pode chamar)
create or replace function public.mark_lead_signup_started(p_lead_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.leads
     set status          = case when status in ('convertido', 'perdido') then status else 'cadastro_iniciado' end,
         origem          = case when origem = 'formulario_site' then 'link_convite'::lead_origem else origem end,
         last_contact_at = now()
   where id = p_lead_id;
end;
$$;

revoke all on function public.mark_lead_signup_started(uuid) from public;
grant execute on function public.mark_lead_signup_started(uuid) to anon, authenticated;

-- 2. Converte lead em profile (usuário autenticado só pode se vincular a si mesmo)
create or replace function public.convert_lead_to_profile(p_lead_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Autenticação necessária';
  end if;

  update public.leads
     set converted_profile_id = auth.uid(),
         converted_at         = now(),
         status               = 'convertido'
   where id = p_lead_id
     and converted_profile_id is null;
end;
$$;

revoke all on function public.convert_lead_to_profile(uuid) from public;
grant execute on function public.convert_lead_to_profile(uuid) to authenticated;

-- 3. Retorna dados mínimos do lead para o pré-preenchimento do signup via link de convite
create or replace function public.get_lead_for_invite(p_lead_id uuid)
returns table (id uuid, name text, email text, phone text, intent text)
language sql
security definer
set search_path = public
as $$
  select id, name, email, phone, intent
    from public.leads
   where id = p_lead_id
     and converted_profile_id is null;
$$;

revoke all on function public.get_lead_for_invite(uuid) from public;
grant execute on function public.get_lead_for_invite(uuid) to anon, authenticated;

comment on function public.mark_lead_signup_started(uuid) is
  'Marca o lead como cadastro_iniciado quando a página de signup abre com ?lead=<uuid>. Pode ser chamada por anon.';
comment on function public.convert_lead_to_profile(uuid) is
  'Vincula o lead ao profile recém-criado. Chamada pelo próprio usuário logo após signup.';
comment on function public.get_lead_for_invite(uuid) is
  'Retorna dados mínimos do lead para pré-preencher o signup via link de convite. Só retorna se ainda não foi convertido.';
