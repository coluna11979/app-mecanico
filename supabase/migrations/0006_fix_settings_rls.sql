-- Adiciona coluna is_public para separar settings sensíveis
alter table public.app_settings add column if not exists is_public boolean not null default true;

-- Marcar configurações sensíveis como privadas
update public.app_settings set is_public = false
where key in ('pix_client_secret', 'pix_client_id');

-- Atualizar policy: usuários comuns só leem settings públicas, admin lê tudo
drop policy if exists settings_read on public.app_settings;
create policy settings_read on public.app_settings for select
  using (
    (is_public = true and auth.uid() is not null)
    or public.is_admin(auth.uid())
  );
