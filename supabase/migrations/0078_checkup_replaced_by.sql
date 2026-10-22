-- Check-up refeito: depois de enviado ao cliente, a correção vira um check-up novo
-- (cópia preenchida). O antigo NÃO é apagado — o link do cliente continua funcionando —
-- e fica marcado com o novo em replaced_by: sai dos KPIs, do "aguardando cliente" e do
-- Comercial, e aparece no histórico como "Refeito".
alter table public.vehicle_checkups
  add column if not exists replaced_by uuid references public.vehicle_checkups(id) on delete set null;

create index if not exists vehicle_checkups_replaced_by_idx
  on public.vehicle_checkups(replaced_by) where replaced_by is not null;
