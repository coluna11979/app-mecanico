-- Valor que a oficina vai cobrar do cliente por um serviço empilhado (opcional, só a oficina vê:
-- stacked_services já é só dos membros da oficina). Ao juntar vários numa demanda, os valores somam
-- e vão para job_customer_charges.
alter table public.stacked_services add column if not exists customer_charge numeric(10,2)
  check (customer_charge is null or customer_charge >= 0);
