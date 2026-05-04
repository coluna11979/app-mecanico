-- =========================================================
-- MecânicoApp — Schema inicial
-- =========================================================

create extension if not exists "uuid-ossp";

-- ENUMS ---------------------------------------------------
do $$ begin
  create type user_role     as enum ('mechanic','workshop','admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type profile_status as enum ('pending','approved','rejected');
exception when duplicate_object then null; end $$;

do $$ begin
  create type job_status     as enum ('open','assigned','in_progress','completed','disputed','cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type tx_status      as enum ('held','released','refunded');
exception when duplicate_object then null; end $$;

-- PROFILES ------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role user_role not null,
  full_name text not null,
  phone text,
  avatar_url text,
  status profile_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- WORKSHOPS -----------------------------------------------
create table if not exists public.workshops (
  id uuid primary key default uuid_generate_v4(),
  profile_id uuid not null unique references public.profiles(id) on delete cascade,
  business_name text not null,
  cnpj text not null unique,
  address text not null,
  city text not null,
  state text not null,
  lat double precision,
  lng double precision,
  description text,
  logo_url text,
  rating numeric(3,2) not null default 0,
  total_jobs int not null default 0,
  created_at timestamptz not null default now()
);

-- MECHANICS -----------------------------------------------
create table if not exists public.mechanics (
  id uuid primary key default uuid_generate_v4(),
  profile_id uuid not null unique references public.profiles(id) on delete cascade,
  cpf text not null unique,
  cnh text,
  skills text[] not null default '{}',
  experience_years int not null default 0,
  hourly_rate numeric(10,2) not null default 0,
  rating numeric(3,2) not null default 0,
  total_jobs int not null default 0,
  is_available boolean not null default false,
  current_lat double precision,
  current_lng double precision,
  last_location_update timestamptz,
  created_at timestamptz not null default now()
);

-- JOBS ----------------------------------------------------
create table if not exists public.jobs (
  id uuid primary key default uuid_generate_v4(),
  workshop_id uuid not null references public.workshops(id) on delete cascade,
  mechanic_id uuid references public.mechanics(id) on delete set null,
  title text not null,
  description text not null,
  status job_status not null default 'open',
  price numeric(10,2) not null,
  scheduled_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  workshop_confirmed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists jobs_status_idx on public.jobs(status);
create index if not exists jobs_workshop_idx on public.jobs(workshop_id);
create index if not exists jobs_mechanic_idx on public.jobs(mechanic_id);

-- JOB LOCATIONS (tracking) --------------------------------
create table if not exists public.job_locations (
  id uuid primary key default uuid_generate_v4(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  mechanic_id uuid not null references public.mechanics(id) on delete cascade,
  lat double precision not null,
  lng double precision not null,
  recorded_at timestamptz not null default now()
);
create index if not exists job_locations_job_idx on public.job_locations(job_id, recorded_at desc);

-- TRANSACTIONS --------------------------------------------
create table if not exists public.transactions (
  id uuid primary key default uuid_generate_v4(),
  job_id uuid not null unique references public.jobs(id) on delete cascade,
  amount numeric(10,2) not null,
  platform_fee numeric(10,2) not null,
  mechanic_amount numeric(10,2) not null,
  status tx_status not null default 'held',
  pix_key text,
  paid_at timestamptz,
  released_at timestamptz
);

-- APP SETTINGS (admin-controlled) -------------------------
create table if not exists public.app_settings (
  key text primary key,
  value text not null default '',
  description text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

-- NOTIFICATIONS -------------------------------------------
create table if not exists public.notifications (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  body text not null,
  type text not null default 'info',
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications(user_id, created_at desc);

-- =========================================================
-- HELPERS
-- =========================================================
create or replace function public.is_admin(uid uuid) returns boolean
language sql stable security definer as $$
  select exists (select 1 from public.profiles where id = uid and role = 'admin');
$$;

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- =========================================================
-- ROW LEVEL SECURITY
-- =========================================================
alter table public.profiles      enable row level security;
alter table public.workshops     enable row level security;
alter table public.mechanics     enable row level security;
alter table public.jobs          enable row level security;
alter table public.job_locations enable row level security;
alter table public.transactions  enable row level security;
alter table public.app_settings  enable row level security;
alter table public.notifications enable row level security;

-- PROFILES policies
drop policy if exists profiles_self_select on public.profiles;
create policy profiles_self_select on public.profiles for select
  using (auth.uid() = id or public.is_admin(auth.uid()));
drop policy if exists profiles_self_insert on public.profiles;
create policy profiles_self_insert on public.profiles for insert
  with check (auth.uid() = id);
drop policy if exists profiles_self_update on public.profiles;
create policy profiles_self_update on public.profiles for update
  using (auth.uid() = id or public.is_admin(auth.uid()));

-- WORKSHOPS policies
drop policy if exists workshops_read on public.workshops;
create policy workshops_read on public.workshops for select using (true);
drop policy if exists workshops_owner_write on public.workshops;
create policy workshops_owner_write on public.workshops for all
  using (profile_id = auth.uid() or public.is_admin(auth.uid()))
  with check (profile_id = auth.uid() or public.is_admin(auth.uid()));

-- MECHANICS policies
drop policy if exists mechanics_read on public.mechanics;
create policy mechanics_read on public.mechanics for select using (true);
drop policy if exists mechanics_owner_write on public.mechanics;
create policy mechanics_owner_write on public.mechanics for all
  using (profile_id = auth.uid() or public.is_admin(auth.uid()))
  with check (profile_id = auth.uid() or public.is_admin(auth.uid()));

-- JOBS policies — workshop dono, mecânico atribuído, ou admin
drop policy if exists jobs_select on public.jobs;
create policy jobs_select on public.jobs for select using (
  public.is_admin(auth.uid())
  or status = 'open'
  or workshop_id in (select id from public.workshops where profile_id = auth.uid())
  or mechanic_id in (select id from public.mechanics where profile_id = auth.uid())
);
drop policy if exists jobs_workshop_insert on public.jobs;
create policy jobs_workshop_insert on public.jobs for insert with check (
  workshop_id in (select id from public.workshops where profile_id = auth.uid())
);
drop policy if exists jobs_update on public.jobs;
create policy jobs_update on public.jobs for update using (
  public.is_admin(auth.uid())
  or workshop_id in (select id from public.workshops where profile_id = auth.uid())
  or mechanic_id in (select id from public.mechanics where profile_id = auth.uid())
);

-- JOB LOCATIONS policies
drop policy if exists locations_select on public.job_locations;
create policy locations_select on public.job_locations for select using (
  public.is_admin(auth.uid())
  or job_id in (
    select id from public.jobs
    where workshop_id in (select id from public.workshops where profile_id = auth.uid())
       or mechanic_id in (select id from public.mechanics where profile_id = auth.uid())
  )
);
drop policy if exists locations_mech_insert on public.job_locations;
create policy locations_mech_insert on public.job_locations for insert with check (
  mechanic_id in (select id from public.mechanics where profile_id = auth.uid())
);

-- TRANSACTIONS policies — partes envolvidas + admin
drop policy if exists tx_select on public.transactions;
create policy tx_select on public.transactions for select using (
  public.is_admin(auth.uid())
  or job_id in (
    select id from public.jobs
    where workshop_id in (select id from public.workshops where profile_id = auth.uid())
       or mechanic_id in (select id from public.mechanics where profile_id = auth.uid())
  )
);
drop policy if exists tx_admin_write on public.transactions;
create policy tx_admin_write on public.transactions for all
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- APP SETTINGS — leitura para autenticados, escrita só admin
drop policy if exists settings_read on public.app_settings;
create policy settings_read on public.app_settings for select using (auth.uid() is not null);
drop policy if exists settings_admin_write on public.app_settings;
create policy settings_admin_write on public.app_settings for all
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- NOTIFICATIONS — só o destinatário (e admin)
drop policy if exists notif_owner on public.notifications;
create policy notif_owner on public.notifications for all
  using (user_id = auth.uid() or public.is_admin(auth.uid()))
  with check (user_id = auth.uid() or public.is_admin(auth.uid()));

-- =========================================================
-- SEED DE CONFIGURAÇÕES (admin pode editar via UI)
-- =========================================================
insert into public.app_settings (key, value, description) values
  ('platform_fee_percent', '15', 'Comissão da plataforma sobre o mecânico (%)'),
  ('mapbox_token',         '',   'Mapbox public access token'),
  ('pix_key',              '',   'Chave PIX da plataforma para receber'),
  ('pix_client_id',        '',   'PIX provider client_id'),
  ('pix_client_secret',    '',   'PIX provider client_secret'),
  ('support_email',        'suporte@mecanicoapp.com.br', 'Email de suporte'),
  ('maintenance_mode',     'false', 'Bloquear app inteiro (true/false)')
on conflict (key) do nothing;

-- =========================================================
-- REALTIME — habilitar tracking
-- =========================================================
alter publication supabase_realtime add table public.mechanics;
alter publication supabase_realtime add table public.job_locations;
alter publication supabase_realtime add table public.jobs;
alter publication supabase_realtime add table public.notifications;
