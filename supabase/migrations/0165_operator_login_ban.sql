-- Desativar o acesso de um colaborador também DESLIGA o login dele (auth), não só o vínculo.
-- Sem isso a conta continuava entrando (e o token ativo seguia valendo até expirar).
-- Reativar (ativo + ao menos uma função) libera o login de novo.

create or replace function public.sync_operator_login_ban()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if new.profile_id is null or coalesce(new.is_owner, false) then
    return new;
  end if;

  if new.active and coalesce(cardinality(new.roles), 0) > 0 then
    update auth.users set banned_until = null where id = new.profile_id;
  else
    update auth.users set banned_until = 'infinity' where id = new.profile_id;
    delete from auth.sessions where user_id = new.profile_id;  -- derruba quem já está logado
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_operator_login_ban on public.workshop_operators;
create trigger trg_sync_operator_login_ban
  after insert or update of active, roles, profile_id on public.workshop_operators
  for each row execute function public.sync_operator_login_ban();

-- Quem já está desativado agora
update auth.users u set banned_until = 'infinity'
  from workshop_operators o
 where u.id = o.profile_id and o.profile_id is not null and not coalesce(o.is_owner, false)
   and (not o.active or coalesce(cardinality(o.roles), 0) = 0);

delete from auth.sessions s
  using workshop_operators o
 where s.user_id = o.profile_id and o.profile_id is not null and not coalesce(o.is_owner, false)
   and (not o.active or coalesce(cardinality(o.roles), 0) = 0);
