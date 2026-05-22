-- Rastreamento de acesso à plataforma
-- Adiciona último acesso e contador de acessos por usuário, e uma RPC segura
-- para o app registrar o acesso do próprio usuário (auth.uid()).

-- 1. Colunas (aditivas, não alteram dados existentes)
alter table public.profiles
  add column if not exists last_seen_at timestamptz,
  add column if not exists access_count integer not null default 0;

-- 2. RPC: o usuário autenticado registra seu próprio acesso.
--    SECURITY DEFINER + auth.uid() garante que ninguém atualiza o acesso de outro.
create or replace function public.touch_last_seen()
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles
     set last_seen_at = now(),
         access_count = access_count + 1
   where id = auth.uid();
$$;

revoke all on function public.touch_last_seen() from public;
grant execute on function public.touch_last_seen() to authenticated;
