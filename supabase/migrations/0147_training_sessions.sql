-- Sala de treinamentos (LiveKit): o admin cria a sessão, apresenta pela sala do
-- admin e manda o link público /treinamento/:token pras lojas e embaixadores.
-- A gravação (egress) vai pro Cloudflare R2; o webhook do LiveKit preenche
-- recording_url/recording_segments. Público nunca escreve direto: entra pela
-- edge function training-room (service_role).

create table if not exists public.training_sessions (
  id                 uuid primary key default gen_random_uuid(),
  title              text not null,
  description        text,
  audience           text not null default 'geral'
                       check (audience in ('geral','lojas','embaixadores','mecanicos')),
  scheduled_at       timestamptz,
  livekit_room_name  text not null unique,
  share_token        text not null unique,
  status             text not null default 'scheduled'
                       check (status in ('scheduled','live','completed','cancelled')),
  record             boolean not null default true,
  recording_status   text not null default 'pending'
                       check (recording_status in ('pending','recording','completed','failed','off')),
  recording_url      text,
  recording_segments text[] not null default '{}',
  started_at         timestamptz,
  ended_at           timestamptz,
  created_by         uuid references auth.users(id) on delete set null,
  created_at         timestamptz not null default now()
);

create index if not exists idx_training_sessions_scheduled on public.training_sessions (scheduled_at desc);

create table if not exists public.training_participants (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.training_sessions(id) on delete cascade,
  name        text not null,
  phone       text,
  store_name  text,
  identity    text not null,
  joined_at   timestamptz not null default now()
);

create index if not exists idx_training_participants_session on public.training_participants (session_id, joined_at);

alter table public.training_sessions     enable row level security;
alter table public.training_participants enable row level security;

drop policy if exists admin_all on public.training_sessions;
create policy admin_all on public.training_sessions for all to authenticated
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

drop policy if exists admin_all on public.training_participants;
create policy admin_all on public.training_participants for all to authenticated
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
