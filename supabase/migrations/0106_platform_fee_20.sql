-- Taxa da plataforma passa de 18% para 20% (mesmo valor de PLATFORM_FEE em src/lib/payment.ts).
-- A comissão do embaixador (registrar_comissao_embaixador) lê esta configuração.
update public.app_settings set value = '20' where key = 'platform_fee_percent';
