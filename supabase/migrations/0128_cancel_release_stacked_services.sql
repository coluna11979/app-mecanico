-- Cancelar o anúncio (demanda) não cancela a OS: os serviços voltam para a pilha (Empilhados).
-- Antes só os serviços de OS voltavam; os empilhados avulsos (stacked_services, sem OS) ficavam presos
-- na demanda cancelada e sumiam. Agora voltam também, guardando de qual demanda vieram (last_job_id),
-- para a oficina poder escolher "devolver para a equipe" depois de cancelar.

alter table public.stacked_services
  add column if not exists last_job_id uuid references public.jobs(id) on delete set null;

create or replace function public.release_stack_on_job_cancel()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  update public.service_order_items
     set last_platform_job_id = new.id,
         platform_job_id      = null,
         stacked_at           = now()
   where platform_job_id = new.id
     and executor = 'platform';

  update public.stacked_services
     set last_job_id = new.id,
         job_id      = null
   where job_id = new.id
     and removed_at is null;

  return new;
end $function$;

-- Avulsos que ficaram presos em demandas já canceladas (antes desta correção) voltam para a pilha
update public.stacked_services s
   set last_job_id = s.job_id, job_id = null
  from public.jobs j
 where j.id = s.job_id and j.status = 'cancelled' and s.removed_at is null;
