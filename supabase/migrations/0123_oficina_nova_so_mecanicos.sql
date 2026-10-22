-- Oficina nova nasce no pacote "Só mecânicos": só a Plataforma liberada (contratar mecânicos),
-- a gestão (OS, caixa, estoque…) fica para quando a oficina quiser / plano pago.
-- Vale para qualquer cadastro (página pública, admin, nova loja), mas só se o dono NÃO tem outra loja:
-- a 2ª loja de quem já usa o sistema completo (ex.: Jota Car) continua com tudo liberado.
--
-- A lista é a etapa 1 da trilha (stageOff(0) em src/lib/modules.ts): todos os módulos menos a
-- plataforma e os opcionais (inbox, avaliacoes, agentes, site, vip — esses já nascem desligados).
-- Módulo novo de gestão criado depois precisa entrar nesta lista também.

create or replace function public.workshop_default_modules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.workshops w where w.profile_id = new.profile_id and w.id <> new.id) then
    return new;
  end if;

  insert into public.workshop_modules (workshop_id, disabled_modules)
  values (new.id, array[
    'painel', 'os', 'agenda', 'checkup', 'clientes', 'comercial',
    'caixa', 'financeiro', 'contas_pagar',
    'pecas', 'compras',
    'equipe', 'fechamentos',
    'servicos', 'acessos', 'importar'
  ])
  on conflict (workshop_id) do nothing;

  return new;
end;
$$;

revoke execute on function public.workshop_default_modules() from public, anon, authenticated;

drop trigger if exists workshops_default_modules on public.workshops;
create trigger workshops_default_modules
  after insert on public.workshops
  for each row execute function public.workshop_default_modules();
