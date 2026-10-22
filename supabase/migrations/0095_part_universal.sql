-- Peça que serve em qualquer veículo (óleo, pneu, abraçadeira...): não aparece em "Sem veículo".
alter table public.workshop_parts add column if not exists universal boolean not null default false;
