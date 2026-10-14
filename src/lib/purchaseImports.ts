/**
 * Fila de notas de compra por foto/PDF/XML (migration 0105) — igual às notinhas de venda.
 * Envia o arquivo, a leitura (XML no navegador; PDF/foto pela IA) preenche `extracted`, e a
 * conferência abre a tela "Lançar nota" já preenchida (/oficina/compras/nova?importacao=<id>).
 */
import { supabase } from '@/lib/supabase';
import { resizeImage } from '@/lib/imageResize';
import { parseNfeXml, readInvoiceWithAi, type InvoiceData } from '@/lib/invoiceImport';

export type PurchaseImportStatus = 'pending' | 'processing' | 'extracted' | 'confirmed' | 'failed' | 'discarded';
export type PurchaseImport = {
  id: string; workshop_id: string; file_path: string; media_type: string; status: PurchaseImportStatus;
  extracted: InvoiceData | null; error: string | null; invoice_id: string | null;
  created_at: string; processed_at: string | null; confirmed_at: string | null;
};

export const BUCKET = 'os-attachments';
const MAX_MB = 10;

export const isXmlFile = (f: File) => f.name.toLowerCase().endsWith('.xml') || f.type.includes('xml');

/** Envia o arquivo e cria a linha na fila. Devolve o id e o conteúdo (para ler sem baixar de novo). */
export async function uploadPurchaseFile(wid: string, file: File): Promise<{ id: string; blob: Blob; media: string }> {
  const xml = isXmlFile(file);
  const pdf = !xml && (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'));
  if (!xml && !pdf && !file.type.startsWith('image/')) throw new Error('Envie foto, PDF ou XML da nota');
  // Foto: reduz, mas mantém resolução para ler as letras pequenas do DANFE
  const blob: Blob = xml || pdf ? file : await resizeImage(file, 2400, 0.85);
  if (blob.size > MAX_MB * 1024 * 1024) throw new Error(`Arquivo maior que ${MAX_MB} MB`);
  const media = xml ? 'text/xml' : pdf ? 'application/pdf' : 'image/jpeg';
  const path = `${wid}/compras/${crypto.randomUUID()}.${xml ? 'xml' : pdf ? 'pdf' : 'jpg'}`;
  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: media });
  if (upErr) throw upErr;
  const { data, error } = await supabase.from('purchase_imports')
    .insert({ workshop_id: wid, file_path: path, media_type: media }).select('id').single();
  if (error) throw error;
  return { id: (data as { id: string }).id, blob, media };
}

/** Lê a nota da fila e grava o resultado. Devolve a mensagem de erro (ou null). */
export async function readPurchaseImport(imp: Pick<PurchaseImport, 'id' | 'workshop_id' | 'file_path' | 'media_type'>, blob?: Blob): Promise<string | null> {
  await supabase.from('purchase_imports').update({ status: 'processing', error: null }).eq('id', imp.id);
  try {
    let file = blob;
    if (!file) {
      const { data, error } = await supabase.storage.from(BUCKET).download(imp.file_path);
      if (error || !data) throw new Error('Não foi possível abrir o arquivo enviado');
      file = data;
    }
    let d: InvoiceData | null;
    if (imp.media_type.includes('xml')) {
      d = parseNfeXml(await file.text());
      if (!d) throw new Error('Este XML não parece uma NF-e');
    } else {
      d = await readInvoiceWithAi(imp.workshop_id, file, imp.media_type);
    }
    await supabase.from('purchase_imports')
      .update({ status: 'extracted', extracted: d, error: null, processed_at: new Date().toISOString() }).eq('id', imp.id);
    return null;
  } catch (e) {
    const msg = (e as { message?: string })?.message ?? 'erro';
    await supabase.from('purchase_imports').update({ status: 'failed', error: msg }).eq('id', imp.id);
    return msg;
  }
}
