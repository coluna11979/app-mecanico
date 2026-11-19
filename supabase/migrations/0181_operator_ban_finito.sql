-- Desativar colaborador não pode mais gravar banned_until = 'infinity'.
--
-- O GoTrue (Auth) lê banned_until como timestamp e NÃO sabe ler 'infinity': com uma única conta assim, qualquer
-- listagem de usuários (auth.admin.listUsers, GET /auth/v1/admin/users) falha com HTTP 500
-- "Database error finding users" (Scan error on column "banned_until"). Foi o que derrubou a prévia de campanhas.
--
-- Troca por uma data finita bem distante — é o que o próprio GoTrue grava com ban_duration='876000h'.
-- O banimento continua efetivo (banned_until > now() => login bloqueado). Quem reativa continua com null.
-- Corpo igual ao da 0165 (create or replace mantém dono e permissões); só o valor do ban muda.

create or replace function public.sync_operator_login_ban()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'auth'
as $$
begin
  if new.profile_id is null or coalesce(new.is_owner, false) then
    return new;
  end if;

  if new.active and coalesce(cardinality(new.roles), 0) > 0 then
    update auth.users set banned_until = null where id = new.profile_id;
  else
    update auth.users set banned_until = now() + interval '100 years' where id = new.profile_id;
    delete from auth.sessions where user_id = new.profile_id;
  end if;
  return new;
end;
$$;

-- Conserta as contas que já ficaram com 'infinity' (continuam banidas).
update auth.users set banned_until = now() + interval '100 years' where banned_until = 'infinity';
