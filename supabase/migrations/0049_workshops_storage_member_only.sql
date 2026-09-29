-- Bucket 'workshops' (logo/foto da oficina): as políticas antigas deixavam QUALQUER usuário
-- autenticado enviar/sobrescrever/apagar qualquer arquivo. O app grava em {workshop_id}/...
-- (NovaOficina.tsx), então a escrita passa a ser só de membros da própria oficina,
-- no mesmo padrão do bucket 'workshop-showcase' (0029). Leitura pública continua.

drop policy if exists workshops_storage_upload on storage.objects;
create policy workshops_storage_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'workshops'
    and public.is_workshop_member(((storage.foldername(name))[1])::uuid, auth.uid()));

-- upload com upsert: true passa por UPDATE, então a checagem vale também para o novo nome
drop policy if exists workshops_storage_update on storage.objects;
create policy workshops_storage_update on storage.objects for update to authenticated
  using (bucket_id = 'workshops'
    and public.is_workshop_member(((storage.foldername(name))[1])::uuid, auth.uid()))
  with check (bucket_id = 'workshops'
    and public.is_workshop_member(((storage.foldername(name))[1])::uuid, auth.uid()));

drop policy if exists workshops_storage_delete on storage.objects;
create policy workshops_storage_delete on storage.objects for delete to authenticated
  using (bucket_id = 'workshops'
    and public.is_workshop_member(((storage.foldername(name))[1])::uuid, auth.uid()));
