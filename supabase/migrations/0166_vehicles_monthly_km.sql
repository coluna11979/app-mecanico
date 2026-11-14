-- Quanto o carro roda por mês (km), informado na abertura da OS. Serve para avisar da próxima troca
-- mesmo quando ainda não há OS suficientes para calcular a média pelo histórico.
alter table public.vehicles
  add column if not exists monthly_km integer check (monthly_km is null or monthly_km between 0 and 20000);
