import { supabase } from './supabase';

const BUCKET = 'approval-attachments';

// Formatos aceitos — cobre casos reais de celulares BR:
// - iPhone iOS 15+ manda image/heif (não image/heic)
// - Android + WhatsApp pode mandar mime vazio ou image/jpg (sem 'e')
// Aceitamos por MIME OU por extensão do arquivo — o que passar primeiro vale.
const ACCEPTED_EXTS = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'gif', 'pdf'];
/** `accept` do <input>: image/* + pdf funciona melhor no seletor do celular do que listar um a um */
export const ACCEPT_ATTR = 'image/*,application/pdf';
export const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024; // 10 MB (mesmo limite do bucket)

/** Extensão do nome do arquivo em minúsculas, sem o ponto. */
export function fileExt(name: string): string {
  const parts = name.split('.');
  return parts.length > 1 ? parts.pop()!.toLowerCase() : '';
}

/** Problema do arquivo (formato ou tamanho), ou null se pode enviar. */
export function attachmentProblem(f: File): string | null {
  const mime = (f.type || '').toLowerCase();
  const mimeOk = mime.startsWith('image/') || mime === 'application/pdf';
  if (!mimeOk && !ACCEPTED_EXTS.includes(fileExt(f.name))) {
    return `"${f.name}" tem formato não aceito. Use foto (JPG, PNG, HEIC) ou PDF.`;
  }
  if (f.size > MAX_ATTACHMENT_SIZE) {
    return `"${f.name}" é muito grande (máx ${fmtFileSize(MAX_ATTACHMENT_SIZE)}).`;
  }
  return null;
}

/**
 * Foto grande de celular → JPEG de no máximo 2000px (fica legível e sobe rápido no 4G).
 * Se o navegador não conseguir abrir a imagem (ex.: HEIC fora do Safari) ou não ficar
 * menor, devolve o arquivo original.
 */
export async function shrinkImage(file: File, maxSide = 2000, quality = 0.85): Promise<File> {
  const mime = (file.type || '').toLowerCase();
  if (!mime.startsWith('image/') || mime === 'image/gif' || file.size < 1.5 * 1024 * 1024) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    const blob = await new Promise<Blob | null>(r => canvas.toBlob(r, 'image/jpeg', quality));
    if (!blob || blob.size >= file.size) return file;
    const name = file.name.replace(/\.[^.]+$/, '') + '.jpg';
    return new File([blob], name, { type: 'image/jpeg', lastModified: Date.now() });
  } catch {
    return file;
  }
}

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
