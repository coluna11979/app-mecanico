-- Credenciais da NextPay no admin (Configurações → NextPay), como as da Stripe.
-- Privadas (is_public = false): só o admin lê pelo app; as edge functions leem com service role.
-- Os valores NÃO vão aqui — são preenchidos no admin.
insert into public.app_settings (key, value, description, is_public) values
  ('nextpay_api_key',        '', 'NextPay: API Key (npk_…)', false),
  ('nextpay_api_secret',     '', 'NextPay: API Secret (nps_…)', false),
  ('nextpay_webhook_secret', '', 'NextPay: segredo que confere os avisos de pagamento (webhook)', false),
  ('nextpay_api_url',        'https://api.nextgopay.com', 'NextPay: endereço da API (produção ou staging)', true)
on conflict (key) do nothing;

-- Garantia: nenhuma credencial da NextPay fica pública
update public.app_settings set is_public = false
 where key in ('nextpay_api_key', 'nextpay_api_secret', 'nextpay_webhook_secret');
