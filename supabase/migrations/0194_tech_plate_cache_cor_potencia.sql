-- Placa: guarda também a cor e a potência (cv), que a oficina usa na OS. Continua sem tabela FIPE.
alter table public.tech_plate_cache
  add column if not exists color text,
  add column if not exists power_cv integer;
