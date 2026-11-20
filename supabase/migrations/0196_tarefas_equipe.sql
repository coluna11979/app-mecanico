-- Tarefas da equipe (modelo do CRM IA First adaptado à oficina).
-- Tabela nova: não mexe em nada que já existe.

create table if not exists public.workshop_tasks (
  id               uuid primary key default gen_random_uuid(),
  workshop_id      uuid not null references public.workshops(id) on delete cascade,
  title            text not null check (length(trim(title)) > 0),
  description      text,
  task_type        text not null default 'outro'
                   check (task_type in ('ligar_cliente', 'peca', 'conferir_os', 'entregar_carro', 'organizacao', 'outro')),
  priority         text not null default 'media' check (priority in ('alta', 'media', 'baixa')),
  status           text not null default 'a_fazer' check (status in ('a_fazer', 'fazendo', 'feito')),
  -- Responsável: a pessoa do Painel da equipe (quem entra por login/PIN está ligado a ela)
  assignee_id      uuid references public.workshop_mechanics(id) on delete set null,
  due_at           timestamptz,
  -- Repetição: nenhuma, todo dia, toda semana ou a cada N dias
  recurrence       text not null default 'nenhuma' check (recurrence in ('nenhuma', 'diaria', 'semanal', 'dias')),
  recurrence_days  int check (recurrence_days is null or recurrence_days between 1 and 365),
  -- Ligações opcionais
  service_order_id uuid references public.service_orders(id) on delete set null,
  customer_id      uuid references public.customers(id) on delete set null,
  completed_at     timestamptz,
  completed_by     text,
  next_task_id     uuid references public.workshop_tasks(id) on delete set null,
  created_by       uuid references public.profiles(id) on delete set null,
  created_by_name  text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists workshop_tasks_ws_status_idx on public.workshop_tasks (workshop_id, status, due_at);
create index if not exists workshop_tasks_assignee_idx on public.workshop_tasks (assignee_id) where status <> 'feito';

alter table public.workshop_tasks enable row level security;

drop policy if exists workshop_tasks_member on public.workshop_tasks;
create policy workshop_tasks_member on public.workshop_tasks
  for all using (is_workshop_member(workshop_id, auth.uid()) or is_admin(auth.uid()))
  with check (is_workshop_member(workshop_id, auth.uid()) or is_admin(auth.uid()));

-- Concluir / reabrir: grava quando; tarefa repetida cria a próxima uma vez só
create or replace function public.workshop_tasks_on_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_step interval;
  v_base timestamptz;
  v_next uuid;
begin
  new.updated_at := now();
  if new.status = 'feito' and old.status is distinct from 'feito' then
    new.completed_at := coalesce(new.completed_at, now());
  elsif new.status <> 'feito' then
    new.completed_at := null;
    new.completed_by := null;
  end if;

  if new.status = 'feito' and old.status is distinct from 'feito'
     and new.recurrence <> 'nenhuma' and new.next_task_id is null then
    v_step := case new.recurrence
      when 'diaria'  then interval '1 day'
      when 'semanal' then interval '7 days'
      else make_interval(days => coalesce(new.recurrence_days, 1)) end;
    -- Próximo prazo a partir do prazo anterior (ou de agora), sempre no futuro
    v_base := coalesce(new.due_at, now());
    loop
      v_base := v_base + v_step;
      exit when v_base > now();
    end loop;
    insert into public.workshop_tasks (workshop_id, title, description, task_type, priority, assignee_id, due_at,
      recurrence, recurrence_days, service_order_id, customer_id, created_by, created_by_name)
    values (new.workshop_id, new.title, new.description, new.task_type, new.priority, new.assignee_id, v_base,
      new.recurrence, new.recurrence_days, new.service_order_id, new.customer_id, new.created_by, new.created_by_name)
    returning id into v_next;
    new.next_task_id := v_next;
  end if;
  return new;
end;
$$;

drop trigger if exists workshop_tasks_on_change on public.workshop_tasks;
create trigger workshop_tasks_on_change
  before update on public.workshop_tasks
  for each row execute function public.workshop_tasks_on_change();

-- Aviso no sino de quem recebeu a tarefa (se a pessoa tem acesso por login)
create or replace function public.workshop_tasks_notify_assignee()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_profile uuid;
begin
  if new.assignee_id is null then return new; end if;
  if tg_op = 'UPDATE' and old.assignee_id is not distinct from new.assignee_id then return new; end if;
  select profile_id into v_profile from public.workshop_operators
   where workshop_id = new.workshop_id and mechanic_id = new.assignee_id and active and profile_id is not null
   limit 1;
  -- Quem criou a tarefa para si mesmo não precisa de aviso
  if v_profile is null or v_profile = new.created_by then return new; end if;
  begin
    insert into public.notifications (user_id, type, link, title, body)
    values (v_profile, 'info', '/oficina/tarefas', 'Nova tarefa para você',
      new.title || coalesce(' · prazo ' || to_char(new.due_at at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI'), ''));
  exception when others then null;  -- aviso é melhor esforço
  end;
  return new;
end;
$$;

drop trigger if exists workshop_tasks_notify_assignee on public.workshop_tasks;
create trigger workshop_tasks_notify_assignee
  after insert or update of assignee_id on public.workshop_tasks
  for each row execute function public.workshop_tasks_notify_assignee();
