-- Workshop Members — suporte a multi-oficina por usuário
create table if not exists public.workshop_members (
  id          uuid primary key default uuid_generate_v4(),
  workshop_id uuid not null references public.workshops(id) on delete cascade,
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  role        text not null default 'owner',
  created_at  timestamptz not null default now(),
  unique (workshop_id, profile_id)
);

create index if not exists workshop_members_profile_idx on public.workshop_members(profile_id);

alter table public.workshop_members enable row level security;

-- Leitura: o próprio membro ou admin
create policy workshop_members_read on public.workshop_members for select
  using (profile_id = auth.uid() or public.is_admin(auth.uid()));

-- Escrita: apenas admin (donos são inseridos via trigger)
create policy workshop_members_admin_write on public.workshop_members for all
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- Trigger: ao criar oficina, insere o dono como membro automaticamente
create or replace function public.add_workshop_owner()
returns trigger language plpgsql security definer as $$
begin
  insert into public.workshop_members (workshop_id, profile_id, role)
  values (new.id, new.profile_id, 'owner');
  return new;
end;
$$;

create trigger workshops_add_owner
  after insert on public.workshops
  for each row execute function public.add_workshop_owner();

-- Migrar oficinas existentes: insere donos atuais como membros
insert into public.workshop_members (workshop_id, profile_id, role)
select id, profile_id, 'owner' from public.workshops
on conflict do nothing;
