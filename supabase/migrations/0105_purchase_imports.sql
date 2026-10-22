-- Fila de notas de compra por foto/PDF/XML (igual à importação das notinhas de venda, 0021).
-- Foto vai para o bucket os-attachments (pasta = id da oficina), a IA lê (read-purchase-invoice,
-- chamada pelo navegador), a oficina confere na tela "Lançar nota" e lança pelo purchase_post.
-- Só guarda a fila: não mexe em peças, estoque nem contas a pagar.

create table if not exists public.purchase_imports (
  id            uuid primary key default uuid_generate_v4(),
  workshop_id   uuid not null references public.workshops(id) on delete cascade,
  file_path     text not null,
  media_type    text not null,
  status        text not null default 'pending'
                check (status in ('pending', 'processing', 'extracted', 'confirmed', 'failed', 'discarded')),
  extracted     jsonb,                     -- InvoiceData (src/lib/invoiceImport.ts)
  error         text,
  invoice_id    uuid references public.purchase_invoices(id) on delete set null,
  created_by    uuid default auth.uid(),
  created_at    timestamptz not null default now(),
  processed_at  timestamptz,
  confirmed_at  timestamptz
);

create index if not exists purchase_imports_workshop_idx on public.purchase_imports (workshop_id, created_at desc);

alter table public.purchase_imports enable row level security;

drop policy if exists purchase_imports_members on public.purchase_imports;
create policy purchase_imports_members on public.purchase_imports
  for all
  using      (is_workshop_member(workshop_id, auth.uid()) or is_admin(auth.uid()))
  with check (is_workshop_member(workshop_id, auth.uid()) or is_admin(auth.uid()));
