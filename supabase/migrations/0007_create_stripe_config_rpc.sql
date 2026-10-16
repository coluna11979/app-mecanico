-- Settings de Stripe
insert into public.app_settings (key, value, description, is_public) values
  ('stripe_mode',            'test', 'Modo Stripe: test ou live', true),
  ('stripe_publishable_key', '',     'Stripe publishable key (test)', true),
  ('stripe_publishable_key_live', '', 'Stripe publishable key (live)', false)
on conflict (key) do nothing;

-- Drop da versão antiga e recria com tipo correto
drop function if exists public.public_stripe_config();

create or replace function public.public_stripe_config()
returns json language sql stable security definer as $$
  select json_build_object(
    'mode', (select value from public.app_settings where key = 'stripe_mode'),
    'publishable_key', (
      select case
        when (select value from public.app_settings where key = 'stripe_mode') = 'live'
        then (select value from public.app_settings where key = 'stripe_publishable_key_live')
        else (select value from public.app_settings where key = 'stripe_publishable_key')
      end
    )
  );
$$;

grant execute on function public.public_stripe_config() to authenticated;
