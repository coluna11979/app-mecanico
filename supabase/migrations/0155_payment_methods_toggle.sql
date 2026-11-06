-- Liga/desliga PIX e cartão (Admin → Configurações → Pagamentos). Nascem ligados, então nada muda.
-- Públicos: a tela de pagamento da oficina lê; as funções nextpay-charge, nextpay-fee-charge e
-- wallet-deposit também conferem e recusam o meio desligado.
insert into public.app_settings (key, value, description, is_public) values
  ('pay_pix_enabled',  'true', 'PIX ligado nas telas de pagamento da oficina', true),
  ('pay_card_enabled', 'true', 'Cartão de crédito ligado nas telas de pagamento da oficina', true)
on conflict (key) do nothing;
