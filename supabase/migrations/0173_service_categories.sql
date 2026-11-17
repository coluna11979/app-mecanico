-- Categorias de serviço da oficina. Valem para o DONO (profiles.id): lojas do mesmo dono (ex.: Jota Car e JC Pneus)
-- usam a mesma lista. Sem linhas = a lista padrão do app. `sells_parts` = categoria em que a peça é o que se vende
-- (pneu): o item vira cabeçalho e as peças entram na OS como itens com preço de venda.
create table if not exists public.service_categories (
  id          uuid primary key default uuid_generate_v4(),
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  name        text not null check (length(trim(name)) > 0),
  position    int  not null default 0,
  sells_parts boolean not null default false,
  created_at  timestamptz not null default now(),
  unique (owner_id, name)
);

alter table public.service_categories enable row level security;

-- Ler: o dono, quem trabalha em alguma loja dele e o admin
drop policy if exists service_categories_read on public.service_categories;
create policy service_categories_read on public.service_categories for select using (
  owner_id = auth.uid() or public.is_admin(auth.uid())
  or exists (select 1 from public.workshops w where w.profile_id = service_categories.owner_id and public.is_workshop_member(w.id, auth.uid()))
);
-- Alterar: só o dono (e o admin)
drop policy if exists service_categories_write on public.service_categories;
create policy service_categories_write on public.service_categories for all
  using (owner_id = auth.uid() or public.is_admin(auth.uid()))
  with check (owner_id = auth.uid() or public.is_admin(auth.uid()));

-- Renomear leva junto os serviços e as OS de todas as lojas do dono (se o nome novo já existe, as duas se juntam)
create or replace function public.rename_service_category(p_owner uuid, p_old text, p_new text)
returns void language plpgsql security definer set search_path = public as $$
declare v_new text := trim(p_new);
begin
  if auth.uid() is distinct from p_owner and not public.is_admin(auth.uid()) then
    raise exception 'sem permissão';
  end if;
  if v_new = '' then raise exception 'nome vazio'; end if;
  if v_new <> p_old and exists (select 1 from service_categories where owner_id = p_owner and name = v_new) then
    delete from service_categories where owner_id = p_owner and name = p_old;
  else
    update service_categories set name = v_new where owner_id = p_owner and name = p_old;
  end if;
  update workshop_services set category = v_new
    where category = p_old and workshop_id in (select id from workshops where profile_id = p_owner);
  update service_orders set category = v_new
    where category = p_old and workshop_id in (select id from workshops where profile_id = p_owner);
end $$;

revoke all on function public.rename_service_category(uuid, text, text) from public, anon;
grant execute on function public.rename_service_category(uuid, text, text) to authenticated;
