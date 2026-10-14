import { type ChangeEvent, useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import WorkshopLayout from '@/components/layout/WorkshopLayout';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/components/ui/Toast';
import { canDo, useOperator } from '@/lib/operators';
import { fmtBRL } from '@/components/os/osHelpers';
import { fmtDate } from '@/lib/purchasing';
import { hasAiInvoice } from '@/lib/invoiceImport';
import { BUCKET, readPurchaseImport, uploadPurchaseFile, type PurchaseImport, type PurchaseImportStatus } from '@/lib/purchaseImports';
import StockTabs from '@/components/stock/StockTabs';
import { Restricted } from './Fornecedores';

type Tab = 'review' | 'reading' | 'failed' | 'done';
const TAB_STATUS: Record<Tab, PurchaseImportStatus[]> = {
  review: ['extracted'], reading: ['pending', 'processing'], failed: ['failed'], done: ['confirmed'],
};
const TABS: { key: Tab; label: string }[] = [
  { key: 'review', label: '📝 Para conferir' }, { key: 'reading', label: '⏳ Lendo' },
  { key: 'failed', label: '⚠️ Com problema' }, { key: 'done', label: '✅ Lançadas' },
];
const PARALLEL = 2;
const onlyDigits = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '');

/** Notas de compra por foto: envia várias, a IA lê, e você confere uma por uma na tela de lançar nota */
export default function ComprasImportar() {
  const { currentWorkshop } = useAuth();
  const wid = currentWorkshop?.id ?? null;
  const { balcao, session } = useOperator();
  const allowed = canDo(session, balcao, 'compras');
  const nav = useNavigate();

  const [list, setList] = useState<PurchaseImport[] | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [tab, setTab] = useState<Tab>('review');
  const [uploading, setUploading] = useState<{ done: number; total: number } | null>(null);
  const [aiEnabled, setAiEnabled] = useState(true);
  /** Notas já lançadas (nº + CNPJ do fornecedor) — para avisar repetida */
  const [posted, setPosted] = useState<Set<string>>(new Set());
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!wid) return;
    const [{ data }, inv] = await Promise.all([
      supabase.from('purchase_imports').select('*').eq('workshop_id', wid).neq('status', 'discarded')
        .order('created_at', { ascending: false }).limit(500),
      supabase.from('purchase_invoices').select('number, supplier:suppliers(cnpj, name)').eq('workshop_id', wid).eq('status', 'posted').limit(5000),
    ]);
    const rows = (data as PurchaseImport[]) ?? [];
    setList(rows);
    setPosted(new Set(((inv.data ?? []) as unknown as { number: string | null; supplier: { cnpj: string | null; name: string } | null }[])
      .filter(i => i.number).map(i => `${i.number!.trim()}|${onlyDigits(i.supplier?.cnpj) || i.supplier?.name.trim().toLowerCase()}`)));
    const missing = rows.filter(r => r.media_type.startsWith('image/') && !urls[r.id]).map(r => r.file_path);
    if (missing.length) {
      const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrls(missing, 60 * 60);
      if (signed) {
        const byPath = new Map(signed.map(s => [s.path, s.signedUrl]));
        setUrls(u => { const n = { ...u }; for (const r of rows) { const s = byPath.get(r.file_path); if (s) n[r.id] = s; } return n; });
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wid]);

  useEffect(() => { if (allowed) load(); }, [load, allowed]);
  useEffect(() => { if (wid) hasAiInvoice(wid).then(setAiEnabled); }, [wid]);

  // Atualiza enquanto houver nota sendo lida
  const reading = (list ?? []).some(r => r.status === 'pending' || r.status === 'processing');
  useEffect(() => {
    if (!reading) return;
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [reading, load]);

  async function onFiles(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (!wid || !files.length) return;
    setUploading({ done: 0, total: files.length });
    setTab('reading');
    const queue: { id: string; blob: Blob; media: string }[] = [];
    for (const f of files) {
      try {
        if (!aiEnabled && !(f.name.toLowerCase().endsWith('.xml'))) throw new Error('leitura de foto/PDF não liberada para esta loja (use o XML)');
        queue.push(await uploadPurchaseFile(wid, f));
      } catch (err) {
        toast.error(`Não foi possível enviar ${f.name}: ${(err as { message?: string })?.message ?? 'erro'}`);
      }
      setUploading(u => u && { ...u, done: u.done + 1 });
    }
    setUploading(null);
    await load();

    let firstError: string | null = null;
    const ids = queue.length;
    await Promise.all(Array.from({ length: PARALLEL }, async () => {
      while (queue.length) {
        const q = queue.shift()!;
        const err = await readPurchaseImport({ id: q.id, workshop_id: wid, file_path: '', media_type: q.media }, q.blob);
        if (err && !firstError) firstError = err;
        load();
      }
    }));
    await load();
    if (firstError) toast.error('Algumas notas não foram lidas: ' + firstError);
    else if (ids) { toast.success(`${ids} ${ids === 1 ? 'nota lida' : 'notas lidas'} ✓ — confira e lance`); setTab('review'); }
  }

  async function retry(imp: PurchaseImport) {
    setList(l => (l ?? []).map(r => (r.id === imp.id ? { ...r, status: 'processing', error: null } : r)));
    const err = await readPurchaseImport(imp);
    await load();
    if (err) toast.error('Não foi possível ler: ' + err);
    else toast.success('Nota lida ✓');
  }

  async function discard(imp: PurchaseImport) {
    if (!confirm('Descartar esta nota da fila?')) return;
    const { error } = await supabase.from('purchase_imports').update({ status: 'discarded' }).eq('id', imp.id);
    if (error) return toast.error(error.message);
    setList(l => (l ?? []).filter(r => r.id !== imp.id));
  }

  if (!allowed) return <Restricted />;

  const counts = Object.fromEntries((Object.keys(TAB_STATUS) as Tab[]).map(t =>
    [t, (list ?? []).filter(r => TAB_STATUS[t].includes(r.status)).length])) as Record<Tab, number>;
  const shown = (list ?? []).filter(r => TAB_STATUS[tab].includes(r.status));
  const isDupe = (r: PurchaseImport) => {
    const x = r.extracted;
    if (!x?.number || r.status === 'confirmed') return false;
    return posted.has(`${x.number.trim()}|${onlyDigits(x.supplier.cnpj) || x.supplier.name.trim().toLowerCase()}`);
  };

  return (
    <WorkshopLayout>
      <div className="max-w-5xl mx-auto space-y-4">
        <StockTabs title="Importar notas de compra" subtitle="Tire foto ou envie PDF/XML de várias notas. A IA lê sozinha; depois você confere uma por uma e lança."
          actions={<Link to="/oficina/compras" className="btn-ghost border border-steel-200 text-sm !py-2">← Compras</Link>} />

        <div className="card border-2 border-dashed border-brand-200 !bg-brand-50/40 text-center py-7">
          <div className="text-4xl mb-2">🧾</div>
          <div className="font-bold text-steel-900">Envie as notas do fornecedor</div>
          <div className="text-sm text-steel-500 mt-1">Foto de cima, com boa luz e a nota inteira. Pode mandar várias de uma vez. XML da NF-e lê exato.</div>
          <div className="flex flex-wrap gap-3 justify-center mt-5">
            <button onClick={() => cameraRef.current?.click()} disabled={!!uploading} className="btn-primary">📸 Tirar foto</button>
            <button onClick={() => galleryRef.current?.click()} disabled={!!uploading} className="btn-ghost border border-steel-300 bg-white">🖼️ Escolher fotos, PDF ou XML</button>
          </div>
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFiles} />
          <input ref={galleryRef} type="file" multiple className="hidden" onChange={onFiles}
            accept={aiEnabled ? 'image/*,application/pdf,.pdf,.xml,text/xml,application/xml' : '.xml,text/xml,application/xml'} />
          {uploading && <div className="mt-4 text-sm text-brand-700 font-semibold">Enviando {uploading.done}/{uploading.total}…</div>}
          {!aiEnabled && <div className="mt-3 text-xs text-pending-800">A leitura de foto/PDF com IA não está liberada para esta loja: use o XML da nota.</div>}
        </div>

        <div className="flex flex-wrap gap-2">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`text-sm font-semibold px-3.5 py-2 rounded-full border transition ${tab === t.key ? 'bg-brand-500 text-white border-brand-500' : 'bg-white text-steel-600 border-steel-200 hover:border-brand-300'}`}>
              {t.label} <span className="opacity-80">({counts[t.key]})</span>
            </button>
          ))}
        </div>

        {list === null ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">{[1, 2, 3].map(i => <div key={i} className="h-48 bg-white rounded-2xl animate-pulse" />)}</div>
        ) : shown.length === 0 ? (
          <div className="card text-center text-steel-500 py-12">
            {tab === 'review' && 'Nada para conferir agora. Envie as notas acima.'}
            {tab === 'reading' && 'Nenhuma nota sendo lida.'}
            {tab === 'failed' && 'Nenhuma nota com problema. 👏'}
            {tab === 'done' && 'Nenhuma nota lançada por aqui ainda.'}
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {shown.map(r => {
              const x = r.extracted;
              const dupe = isDupe(r);
              return (
                <div key={r.id} className="card !p-0 overflow-hidden flex flex-col">
                  <div className="h-36 bg-steel-100 overflow-hidden">
                    {urls[r.id]
                      ? <img src={urls[r.id]} alt="" className="w-full h-full object-cover" />
                      : <div className="w-full h-full grid place-items-center text-steel-500"><div className="text-center"><div className="text-4xl">{r.media_type.includes('xml') ? '🧾' : '📄'}</div><div className="text-xs font-semibold mt-1">{r.media_type.includes('xml') ? 'XML' : 'PDF'}</div></div></div>}
                  </div>
                  <div className="p-4 flex-1 flex flex-col">
                    {r.status === 'pending' || r.status === 'processing' ? (
                      <div className="flex items-center gap-2 text-sm text-brand-700 font-semibold">
                        <span className="h-3 w-3 rounded-full border-2 border-brand-500 border-t-transparent animate-spin" /> Lendo a nota…
                      </div>
                    ) : r.status === 'failed' ? (
                      <div className="text-sm text-alert-700">⚠️ {r.error ?? 'Não foi possível ler'}</div>
                    ) : (
                      <>
                        <div className="font-bold text-steel-900 truncate">{x?.supplier.name || 'Fornecedor não identificado'}</div>
                        <div className="text-xs text-steel-500">
                          Nota {x?.number || 's/ nº'}{x?.date ? ` · ${fmtDate(x.date)}` : ''} · {x?.items.length ?? 0} ite{(x?.items.length ?? 0) === 1 ? 'm' : 'ns'}
                        </div>
                        <div className="flex justify-between items-center mt-2 text-sm">
                          <span className="text-steel-400">{x?.installments.length ? `${x.installments.length} parcela${x.installments.length === 1 ? '' : 's'}` : 'sem parcelas na nota'}</span>
                          {x?.total != null && <strong>{fmtBRL(x.total)}</strong>}
                        </div>
                        {dupe && <div className="text-[11px] text-alert-700 font-semibold mt-1">⚠️ Nota nº {x?.number} deste fornecedor já foi lançada</div>}
                        {(x?.uncertain.length ?? 0) > 0 && r.status === 'extracted' && (
                          <div className="text-[11px] text-pending-700 mt-1">⚠️ {x!.uncertain.length} campo(s) para conferir</div>
                        )}
                      </>
                    )}
                    <div className="text-[11px] text-steel-400 mt-1">Enviada em {new Date(r.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</div>
                    <div className="mt-auto pt-3 flex gap-2">
                      {r.status === 'extracted' && (
                        <button onClick={() => nav(`/oficina/compras/nova?importacao=${r.id}`)} className="btn-primary text-sm !py-2 flex-1">Conferir →</button>
                      )}
                      {r.status === 'failed' && (
                        <button onClick={() => retry(r)} className="btn-primary text-sm !py-2 flex-1">↻ Tentar de novo</button>
                      )}
                      {r.status === 'confirmed' && r.invoice_id && (
                        <Link to={`/oficina/compras?nota=${r.invoice_id}`} className="btn-ghost text-sm !py-2 flex-1 border border-steel-200 text-center">Ver nota →</Link>
                      )}
                      {r.status !== 'confirmed' && r.status !== 'processing' && (
                        <button onClick={() => discard(r)} className="btn-ghost text-sm !py-2 text-steel-500" title="Descartar">🗑️</button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </WorkshopLayout>
  );
}
