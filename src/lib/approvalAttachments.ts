import { supabase } from './supabase';

const BUCKET = 'approval-attachments';

/**
 * Faz upload de um anexo no bucket approval-attachments.
 * O path tem o formato: {profileId}/{timestamp}-{randomId}.{ext}
 * Isso é importante porque a RLS do bucket usa a primeira pasta como
 * dono — só admin OU dono do cadastro podem ler.
 */
export async function uploadApprovalAttachment(file: File, profileId: string) {
  const ext  = file.name.split('.').pop()?.toLowerCase() || 'bin';
  const rand = Math.random().toString(36).slice(2, 8);
  const path = `${profileId}/${Date.now()}-${rand}.${ext}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, {
      contentType: file.type,
      cacheControl: '3600',
      upsert: false,
    });

  if (error) throw error;

  return {
    path,
    name: file.name,
    size: file.size,
    mime: file.type,
  };
}

/** Cria signed URL pra abrir um anexo (válida por 1 hora) */
export async function getApprovalAttachmentUrl(path: string) {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, 60 * 60);
  if (error) return null;
  return data?.signedUrl ?? null;
}

export function fmtFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function fileIcon(mime: string | null): string {
  if (!mime) return '📎';
  if (mime.startsWith('image/')) return '🖼️';
  if (mime === 'application/pdf') return '📄';
  return '📎';
}
