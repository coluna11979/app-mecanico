import { ChangeEvent, useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import WorkshopLayout from '@/components/layout/WorkshopLayout';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/components/ui/Toast';
import { resizeImage } from '@/lib/imageResize';
import { fmtBRL } from '@/components/os/osHelpers';
import ImportReview from '@/components/imports/ImportReview';
import type { PaperImport, PaperImportStatus } from '@/types/database';

type Tab = 'review' | 'reading' | 'failed' | 'done';

const TAB_STATUS: Record<Tab, PaperImportStatus[]> = {
  review:  ['extracted'],
  reading: ['pending', 'processing'],
  failed:  ['failed'],
  done:    ['confirmed'],
};

const PARALLEL = 2; // leituras simultâneas

export default function ImportarOrcamentos() {
  const { currentWorkshop } = useAuth();
  const wid = currentWorkshop?.id ?? null;
  const [list, setList]       = useState<PaperImport[]>([]);
  const [urls, setUrls]       = useState<Record<string, string>>({});
  const [tab, setTab]         = useState<Tab>('review');
  const [uploading, setUploading] = useState<{ done: number; total: number } | null>(null);
  const [reviewing, setReviewing] = useState<PaperImport | null>(null);
  const [loading, setLoading] = useState(true);
  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraRef  = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!wid) return;
    const { data } = await supabase.from('paper_imports').select('*')
      .eq('workshop_id', wid).neq('status', 'discarded')
      .order('created_at', { ascending: false }).limit(300);
    const rows = (data as PaperImport[]) ?? [];
    setList(rows);
    setLoading(false);
    // Links temporários das fotos (bucket privado)
    const missing = rows.filter(r => !urls[r.id]).map(r => r.image_path);
    if (missing.length) {
      const { data: signed } = await supabase.storage.from('os-attachments').createSignedUrls(missing, 60 * 60);
      if (signed) {
        const byPath = new Map(signed.map(s => [s.path, s.signedUrl]));
        setUrls(u => {
          const next = { ...u };
          for (const r of rows) { const s = byPath.get(r.image_path); if (s) next[r.id] = s; }
          return next;
        });
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wid]);

  useEffect(() => { load(); }, [load]);

  // Atualiza enquanto houver foto sendo lida
  const reading = list.some(r => r.status === 'pending' || r.status === 'processing');
  useEffect(() => {
    if (!reading) return;
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [reading, load]);

  async function readImport(id: string) {
    const { data, error } = await supabase.functions.invoke('read-paper-quote', { body: { import_id: id } });
    if (error || (data as any)?.error) {
      const msg = (data as any)?.error ?? error?.message ?? 'erro';
      console.warn('[importar] leitura falhou:', msg);
      return msg as string;
    }
    return null;
  }

  async function onFiles(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []).filter(f => f.type.startsWith('image/'));
    e.target.value = '';
    if (!wid || !files.length) return;

    setUploading({ done: 0, total: files.length });
    setTab('reading');
    const ids: string[] = [];
    for (const file of files) {
      try {
        const blob = await resizeImage(file);
        const path = `${wid}/imports/${crypto.randomUUID()}.jpg`;
        const { error: upErr } = await supabase.storage.from('os-attachments')
          .upload(path, blob, { contentType: 'image/jpeg' });
        if (upErr) throw upErr;
        const { data, error } = await supabase.from('paper_imports')
          .insert({ workshop_id: wid, image_path: path }).select('id').single();
        if (error) throw error;
        ids.push(data.id);
      } catch (err: any) {
        console.error('[importar] envio falhou:', err);
        toast.error(`Não foi possível enviar ${file.name}: ${err?.message ?? 'erro'}`);
      }
      setUploading(u => u && { ...u, done: u.done + 1 });
    }
    setUploading(null);
    await load();

    // Leitura pela IA, algumas por vez
    let firstError: string | null = null;
    const queue = [...ids];
    await Promise.all(Array.from({ length: PARALLEL }, async () => {
      while (queue.length) {
        const id = queue.shift()!;
        const err = await readImport(id);
        if (err && !firstError) firstError = err;
        load();
      }
    }));
    await load();
    if (firstError) toast.error('Algumas fotos não foram lidas: ' + firstError);
    else if (ids.length) { toast.success(`${ids.length} ${ids.length === 1 ? 'foto lida' : 'fotos lidas'} ✓ — confira os dados`); setTab('review'); }
  }

  async function retry(imp: PaperImport) {
    setList(l => l.map(r => r.id === imp.id ? { ...r, status: 'processing', error: null } : r));
    const err = await readImport(imp.id);
    await load();
    if (err) toast.error('Não foi possível ler: ' + err);
    else toast.success('Foto lida ✓');
  }

  async function discard(imp: PaperImport) {
    if (!confirm('Descartar esta foto?')) return;
    const { error } = await supabase.from('paper_imports').update({ status: 'discarded' }).eq('id', imp.id);
    if (error) { toast.error('Erro ao descartar: ' + error.message); return; }
    setList(l => l.filter(r => r.id !== imp.id));
  }

  const counts = Object.fromEntries((Object.keys(TAB_STATUS) as Tab[]).map(t =>
    [t, list.filter(r => TAB_STATUS[t].includes(r.status)).length])) as Record<Tab, number>;
  const shown = list.filter(r => TAB_STATUS[tab].includes(r.status));

  const TABS: { key: Tab; label: string }[] = [
    { key: 'review',  label: '📝 Para conferir' },
    { key: 'reading', label: '⏳ Lendo' },
    { key: 'failed',  label: '⚠️ Com problema' },
    { key: 'done',    label: '✅ Importados' },
  ];

  return (
    <WorkshopLayout>
      <div className="max-w-5xl mx-auto">
        <h1 className="text-3xl font-bold tracking-tight">📷 Importar orçamentos em papel</h1>
        <p className="text-steel-500 mt-1 max-w-2xl">
          Fotografe os orçamentos e notas antigas do bloquinho. A inteligência artificial lê cliente, telefone, carro,
          serviços e valores — você só confere. Cada foto vira cliente, veículo e histórico de serviço no sistema.
        </p>

        {/* Envio */}
        <div className="card mt-5 border-2 border-dashed border-brand-200 !bg-brand-50/40 text-center py-8">
          <div className="text-4xl mb-2">🧾</div>
          <div className="font-bold text-steel-900">Envie fotos de um ou vários orçamentos</div>
          <div className="text-sm text-steel-500 mt-1">Dica: foto de cima, com boa luz e o papel inteiro aparecendo.</div>
          <div className="flex flex-wrap gap-3 justify-center mt-5">
            <button onClick={() => cameraRef.current?.click()} disabled={!!uploading} className="btn-primary">📸 Tirar foto</button>
            <button onClick={() => galleryRef.current?.click()} disabled={!!uploading} className="btn-ghost border border-steel-300 bg-white">🖼️ Escolher da galeria</button>
          </div>
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFiles} />
          <input ref={galleryRef} type="file" accept="image/*" multiple className="hidden" onChange={onFiles} />
          {uploading && (
            <div className="mt-4 text-sm text-brand-700 font-semibold">
              Enviando {uploading.done}/{uploading.total}…
            </div>
          )}
        </div>

        {/* Abas */}
        <div className="flex flex-wrap gap-2 mt-6 mb-4">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`text-sm font-semibold px-3.5 py-2 rounded-full border transition ${
                tab === t.key ? 'bg-brand-500 text-white border-brand-500' : 'bg-white text-steel-600 border-steel-200 hover:border-brand-300'}`}>
              {t.label} <span className="opacity-80">({counts[t.key]})</span>
            </button>
          ))}
        </div>

        {loading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">{[1, 2, 3].map(i => <div key={i} className="h-48 bg-white rounded-2xl animate-pulse" />)}</div>
        ) : shown.length === 0 ? (
          <div className="card text-center text-steel-500 py-12">
            {tab === 'review' && 'Nada para conferir agora. Envie fotos acima para começar.'}
            {tab === 'reading' && 'Nenhuma foto sendo lida.'}
            {tab === 'failed' && 'Nenhuma foto com problema. 👏'}
            {tab === 'done' && 'Nenhum orçamento importado ainda.'}
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {shown.map(r => {
              const x = r.extracted;
              return (
                <div key={r.id} className="card !p-0 overflow-hidden flex flex-col">
                  <div className="h-40 bg-steel-100 overflow-hidden">
                    {urls[r.id] && <img src={urls[r.id]} alt="" className="w-full h-full object-cover" />}
                  </div>
                  <div className="p-4 flex-1 flex flex-col">
                    {r.status === 'pending' || r.status === 'processing' ? (
                      <div className="flex items-center gap-2 text-sm text-brand-700 font-semibold">
                        <span className="h-3 w-3 rounded-full border-2 border-brand-500 border-t-transparent animate-spin" /> Lendo a foto…
                      </div>
                    ) : r.status === 'failed' ? (
                      <div className="text-sm text-alert-700">⚠️ {r.error ?? 'Não foi possível ler'}</div>
                    ) : (
                      <>
                        <div className="font-bold text-steel-900 truncate">{x?.cliente?.nome || 'Cliente sem nome'}</div>
                        <div className="text-xs text-steel-500 truncate">
                          {[x?.veiculo?.marca, x?.veiculo?.modelo, x?.veiculo?.placa].filter(Boolean).join(' · ') || 'Veículo não identificado'}
                        </div>
                        <div className="text-xs text-steel-500 truncate mt-0.5">{x?.servico_resumo ?? ''}</div>
                        <div className="flex justify-between items-center mt-2 text-sm">
                          <span className="text-steel-400">{x?.data ? new Date(`${x.data}T12:00:00`).toLocaleDateString('pt-BR') : 'Sem data'}</span>
                          {x?.total != null && <strong>{fmtBRL(x.total)}</strong>}
                        </div>
                        {(x?.campos_incertos?.length ?? 0) > 0 && r.status === 'extracted' && (
                          <div className="text-[11px] text-pending-700 mt-1">⚠️ {x!.campos_incertos.length} campo(s) para conferir</div>
                        )}
                      </>
                    )}
                    <div className="mt-auto pt-3 flex gap-2">
                      {r.status === 'extracted' && (
                        <button onClick={() => setReviewing(r)} className="btn-primary text-sm !py-2 flex-1">Conferir →</button>
                      )}
                      {r.status === 'failed' && (
                        <button onClick={() => retry(r)} className="btn-primary text-sm !py-2 flex-1">↻ Tentar de novo</button>
                      )}
                      {r.status === 'confirmed' && r.service_order_id && (
                        <Link to={`/oficina/os/${r.service_order_id}`} className="btn-ghost text-sm !py-2 flex-1 border border-steel-200 text-center">Ver OS →</Link>
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

      {reviewing && (
        <ImportReview
          imp={reviewing}
          imageUrl={urls[reviewing.id] ?? null}
          onClose={() => setReviewing(null)}
          onDone={() => { setReviewing(null); load(); }}
        />
      )}
    </WorkshopLayout>
  );
}
