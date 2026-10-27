-- Salvar vários itens de uma vez manda "vazio" para quem não informou o campo: vazio vale "não" (false)
create or replace function public.service_order_items_standalone_default()
returns trigger language plpgsql as $$
begin
  new.standalone := coalesce(new.standalone, false);
  return new;
end $$;

drop trigger if exists trg_service_order_items_standalone_default on public.service_order_items;
create trigger trg_service_order_items_standalone_default
  before insert or update on public.service_order_items
  for each row execute function public.service_order_items_standalone_default();
