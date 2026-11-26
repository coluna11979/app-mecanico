-- Quadro de melhorias do admin: ideias e tarefas de evolução do app (kanban).
create table if not exists public.admin_melhorias (
  id          uuid primary key default gen_random_uuid(),
  titulo      text not null,
  descricao   text,
  status      text not null default 'ideia'
              check (status in ('ideia', 'planejado', 'fazendo', 'feito')),
  prioridade  text not null default 'media'
              check (prioridade in ('alta', 'media', 'baixa')),
  area        text,
  data_alvo   date,
  posicao     double precision not null default extract(epoch from now()),
  criado_por  uuid references public.profiles(id) on delete set null,
  criado_em   timestamptz not null default now(),
  feito_em    timestamptz
);

create index if not exists idx_admin_melhorias_status on public.admin_melhorias(status, posicao);

alter table public.admin_melhorias enable row level security;
drop policy if exists admin_all_melhorias on public.admin_melhorias;
create policy admin_all_melhorias on public.admin_melhorias for all to authenticated
  using      (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'::public.user_role))
  with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'::public.user_role));

-- Grava a data de conclusão automaticamente ao mover para "feito"
create or replace function public.admin_melhorias_feito_em()
returns trigger language plpgsql as $$
begin
  if new.status = 'feito' and (old.status is distinct from 'feito') then
    new.feito_em := now();
  elsif new.status <> 'feito' then
    new.feito_em := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_admin_melhorias_feito_em on public.admin_melhorias;
create trigger trg_admin_melhorias_feito_em
  before update on public.admin_melhorias
  for each row execute function public.admin_melhorias_feito_em();
