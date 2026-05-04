-- MESSAGES (chat por job) ------------------------------------
create table if not exists public.messages (
  id         uuid primary key default uuid_generate_v4(),
  job_id     uuid not null references public.jobs(id) on delete cascade,
  sender_id  uuid not null references auth.users(id) on delete cascade,
  content    text not null,
  created_at timestamptz not null default now()
);

create index if not exists messages_job_idx on public.messages(job_id, created_at asc);

alter table public.messages enable row level security;

drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages for select using (
  public.is_admin(auth.uid())
  or job_id in (
    select id from public.jobs
    where workshop_id in (select id from public.workshops where profile_id = auth.uid())
       or mechanic_id in (select id from public.mechanics where profile_id = auth.uid())
  )
);

drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages for insert with check (
  sender_id = auth.uid()
  and job_id in (
    select id from public.jobs
    where workshop_id in (select id from public.workshops where profile_id = auth.uid())
       or mechanic_id in (select id from public.mechanics where profile_id = auth.uid())
  )
);

alter publication supabase_realtime add table public.messages;
