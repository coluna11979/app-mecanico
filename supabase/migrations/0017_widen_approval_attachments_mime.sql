-- Amplia os MIME types aceitos no bucket approval-attachments.
-- Motivo: celulares diversos (iPhone iOS 15+ com HEIF, Android com galeria)
-- às vezes mandam mime `image/heif`, `image/jpg` ou vazio ('' que o Storage
-- interpreta como application/octet-stream). A lista antiga rejeitava esses
-- casos, fazendo o upload falhar silenciosamente pro mecânico anexando docs.
--
-- Nova lista: qualquer imagem, PDF ou octet-stream (fallback pra mime vazio).
-- O cliente ainda valida por extensão em PendingApproval.tsx, então arquivos
-- exóticos (executáveis, arquivos de texto) continuam bloqueados no frontend.

update storage.buckets
set allowed_mime_types = array['image/*','application/pdf','application/octet-stream']
where id = 'approval-attachments';
