-- Desativar/remover o acesso de um colaborador (tela Acessos) agora também tira o vínculo dele
-- com a oficina. Antes só mudava workshop_operators.active/roles: a conta de login e o
-- workshop_members (papel 'staff') continuavam, e o app abria o painel do gestor para ele.
--
-- Regra: colaborador com login (profile_id) só é membro da oficina enquanto estiver
-- ativo e com ao menos uma função. Reativar devolve o vínculo.

create or replace function public.sync_operator_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if old.profile_id is not null then
      delete from workshop_members
       where workshop_id = old.workshop_id and profile_id = old.profile_id and role <> 'owner';
    end if;
    return old;
  end if;

  if new.profile_id is null or coalesce(new.is_owner, false) then
    return new;
  end if;

  if new.active and coalesce(cardinality(new.roles), 0) > 0 then
    insert into workshop_members (workshop_id, profile_id, role)
    values (new.workshop_id, new.profile_id, 'staff')
    on conflict (workshop_id, profile_id) do nothing;
  else
    delete from workshop_members
     where workshop_id = new.workshop_id and profile_id = new.profile_id and role <> 'owner';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_operator_membership on public.workshop_operators;
create trigger trg_sync_operator_membership
  after insert or update of active, roles, profile_id or delete on public.workshop_operators
  for each row execute function public.sync_operator_membership();

-- Limpa quem já estava desativado com o vínculo preso
delete from workshop_members m
 using workshop_operators o
 where m.profile_id = o.profile_id and m.workshop_id = o.workshop_id
   and o.profile_id is not null and not coalesce(o.is_owner, false)
   and (not o.active or coalesce(cardinality(o.roles), 0) = 0)
   and m.role <> 'owner';
