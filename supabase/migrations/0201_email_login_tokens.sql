-- Chaves de acesso dos e-mails de cadastro: o botão do e-mail entra direto na conta,
-- sem pedir senha. Guarda só o hash (sha-256) da chave; quem lê é a edge function email-login.
create table if not exists public.email_login_tokens (
  token_hash   text primary key,
  profile_id   uuid not null references public.profiles(id) on delete cascade,
  next_path    text not null default '/aguardando-aprovacao',
  expires_at   timestamptz not null,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz,
  use_count    integer not null default 0
);

create index if not exists email_login_tokens_profile_idx on public.email_login_tokens(profile_id);

alter table public.email_login_tokens enable row level security;
revoke all on public.email_login_tokens from anon, authenticated;
