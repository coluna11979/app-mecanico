-- Veículo do serviço empilhado avulso (texto livre: modelo, cor, placa), para o mecânico saber
-- em qual carro vai trabalhar e a oficina ver quantos carros vão na mesma demanda.
alter table public.stacked_services add column if not exists vehicle text;
