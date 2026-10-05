import { ChangeEvent, useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import WorkshopLayout from '@/components/layout/WorkshopLayout';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/components/ui/Toast';
import { resizeImage } from '@/lib/imageResize';
import { fmtBRL } from '@/components/os/osHelpers';
import ImportReview from '@/components/imports/ImportReview';
import { ensureCatalogParts, partKey, partNameForVehicle } from '@/lib/parts';
import type { PaperImport, PaperImportStatus } from '@/types/database';

type Tab = 'review' | 'reading' | 'failed' | 'done';

const TAB_STATUS: Record<Tab, PaperImportStatus[]> = {
  review:  ['extracted'],
  reading: ['pending', 'processing'],
  failed:  ['failed'],
  done:    ['confirmed'],
};

const PARALLEL = 2; // leituras simultâneas

/** Filtro pela data de importação (quando a nota foi enviada) */
type Period = 'all' | 'today' | 'yesterday' | 'week' | 'month' | 'custom';
const PERIODS: [Period, string][] = [
  ['all', 'Todas'], ['today', 'Hoje'], ['yesterday', 'Ontem'], ['week', '7 dias'], ['month', '30 dias'], ['custom', '📅 Escolher datas'],
];
function periodRange(p: Period, from: string, to: string): [string | null, string | null] {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const day = 86400000, iso = (ms: number) => new Date(ms).toISOString(), t = today.getTime();
  if (p === 'today') return [iso(t), null];
  if (p === 'yesterday') return [iso(t - day), iso(t)];
  if (p === 'week') return [iso(t - 6 * day), null];
  if (p === 'month') return [iso(t - 29 * day), null];
  if (p === 'custom') return [
    from ? new Date(`${from}T00:00:00`).toISOString() : null,
    to ? iso(new Date(`${to}T00:00:00`).getTime() + day) : null,
  ];
  return [null, null];
}
const MAX_PDF_MB = 15;
const isPdfPath = (path: string) => path.toLowerCase().endsWith('.pdf');

export default function ImportarOrcamentos() {
  const { currentWorkshop } = useAuth();
  const wid = currentWorkshop?.id ?? null;
  const [list, setList]       = useState<PaperImport[]>([]);
  const [urls, setUrls]       = useState<Record<string, string>>({});
  const [tab, setTab]         = useState<Tab>('review');
  const [uploading, setUploading] = useState<{ done: number; total: number } | null>(null);
  const [reviewing, setReviewing] = useState<PaperImport | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod]   = useState<Period>('all');
  const [from, setFrom]       = useState('');
  const [to, setTo]           = useState('');
  const [start, end]          = periodRange(period, from, to);
  /** Filtrar pela data escrita na nota (padrão) ou pela data em que foi enviada */
  const [by, setBy]           = useState<'nota' | 'envio'>('nota');
  // Data da nota é AAAA-MM-DD (dia local); o fim do período é exclusivo
  const localDay = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraRef  = useRef<HTMLInputElement>(null);

  /** Peças das notas já importadas que ainda não estão no cadastro */
  type LoosePart = {
    id: string; description: string; unit_price: number; unit_cost: number | null; created_at: string;
    os: {
      vehicle: { make: string | null; model: string | null } | null;
      imp: { extracted: { veiculo?: { marca?: string | null; modelo?: string | null } } | null }[] | null;
    } | null;
  };
  /** Nome no cadastro: com o veículo da nota quando houver ("Kit amortecedor (Fiat Strada)") */
  const looseName = (i: LoosePart) => {
    // Veículo da OS; sem ele, o que a leitura da nota trouxe (nota só com o modelo não gera veículo)
    const read = i.os?.imp?.[0]?.extracted?.veiculo;
    const make = i.os?.vehicle?.make && !/n[aã]o informado/i.test(i.os.vehicle.make) ? i.os.vehicle.make : read?.marca;
    const model = i.os?.vehicle?.model && !/n[aã]o informado/i.test(i.os.vehicle.model) ? i.os.vehicle.model : read?.modelo;
    return partNameForVehicle(i.description, make, model);
  };
  const [loose, setLoose] = useState<LoosePart[]>([]);
  const [linking, setLinking] = useState(false);
  const loadLoose = useCallback(async () => {
    if (!wid) return;
    const { data } = await supabase.from('service_order_items')
      .select('id, description, unit_price, unit_cost, created_at, os:service_orders!inner(source, status, vehicle:vehicles(make, model), imp:paper_imports(extracted))')
      .eq('workshop_id', wid).eq('kind', 'part').is('part_id', null)
      .eq('os.source', 'paper_import').neq('os.status', 'cancelled').limit(2000);
    setLoose(((data ?? []) as unknown as LoosePart[]));
  }, [wid]);
  useEffect(() => { loadLoose(); }, [loadLoose]);

  async function linkLooseParts() {
    if (!wid || !loose.length) return;
    const names = new Set(loose.map(i => partKey(looseName(i))));
    if (!confirm(`Salvar no cadastro ${names.size} peça(s) das notas importadas? O preço de venda é o da nota mais recente; o custo sai pela margem da loja (100% → metade). Dá para mudar depois em Peças e estoque.`)) return;
    setLinking(true);
    try {
      // Preço da nota mais recente de cada peça
      const latest = [...loose].sort((a, b) => b.created_at.localeCompare(a.created_at));
      const { map, created } = await ensureCatalogParts(wid, latest.map(i => ({ name: looseName(i), price: Number(i.unit_price) })));
      const byPart = new Map<string, { cost: number; ids: string[]; noCost: string[] }>();
      for (const i of loose) {
        const p = map.get(partKey(looseName(i)));
        if (!p) continue;
        const e = byPart.get(p.id) ?? { cost: p.cost, ids: [], noCost: [] };
        e.ids.push(i.id);
        if (i.unit_cost == null && p.cost > 0) e.noCost.push(i.id);
        byPart.set(p.id, e);
      }
      for (const [partId, e] of byPart) {
        const { error } = await supabase.from('service_order_items').update({ part_id: partId }).in('id', e.ids);
        if (error) throw error;
        if (e.noCost.length) await supabase.from('service_order_items').update({ unit_cost: e.cost }).in('id', e.noCost);
      }
      toast.success(`${created} peça(s) nova(s) no cadastro · ${loose.length} item(ns) das notas ligados ✓`);
      await loadLoose();
    } catch (err: any) {
      toast.error('Não foi possível salvar as peças: ' + (err?.message ?? 'erro'));
    } finally {
      setLinking(false);
    }
  }

  const load = useCallback(async () => {
    if (!wid) return;
    let query = supabase.from('paper_imports').select('*')
      .eq('workshop_id', wid).neq('status', 'discarded');
    if (by === 'envio') {
      if (start) query = query.gte('created_at', start);
      if (end) query = query.lt('created_at', end);
    } else {
      if (start) query = query.gte('extracted->>data', localDay(start));
      if (end) query = query.lt('extracted->>data', localDay(end));
    }
    const { data } = await query.order('created_at', { ascending: false }).limit(1000);
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
  }, [wid, start, end, by]);

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
      // Em resposta de erro o corpo vem em error.context — é lá que está o motivo real
      let msg: string = (data as any)?.error ?? '';
      if (!msg && error && 'context' in error) {
        try { msg = (await (error as any).context.json())?.error ?? ''; } catch { /* corpo não-JSON */ }
      }
      msg = msg || error?.message || 'erro';
      console.warn('[importar] leitura falhou:', msg);
      return msg as string;
    }
    return null;
  }

  async function onFiles(e: ChangeEvent<HTMLInputElement>) {
    const all = Array.from(e.target.files ?? []);
    const files = all.filter(f => f.type.startsWith('image/') || f.type === 'application/pdf');
    if (files.length < all.length) toast.error('Só dá para enviar foto ou PDF');
    e.target.value = '';
    if (!wid || !files.length) return;

    setUploading({ done: 0, total: files.length });
    // As novas são de hoje: o filtro de outro período as esconderia
    if (period !== 'all' && !(by === 'envio' && period === 'today')) setPeriod('all');
    setTab('reading');
    const ids: string[] = [];
    for (const file of files) {
      try {
        const pdf = file.type === 'application/pdf';
        if (pdf && file.size > MAX_PDF_MB * 1024 * 1024) throw new Error(`PDF maior que ${MAX_PDF_MB} MB`);
        const blob = pdf ? file : await resizeImage(file);
        const path = `${wid}/imports/${crypto.randomUUID()}.${pdf ? 'pdf' : 'jpg'}`;
        const { error: upErr } = await supabase.storage.from('os-attachments')
          .upload(path, blob, { contentType: pdf ? 'application/pdf' : 'image/jpeg' });
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
    else if (ids.length) { toast.success(`${ids.length} ${ids.length === 1 ? 'nota lida' : 'notas lidas'} ✓ — confira os dados`); setTab('review'); }
  }

  async function retry(imp: PaperImport) {
    setList(l => l.map(r => r.id === imp.id ? { ...r, status: 'processing', error: null } : r));
    const err = await readImport(imp.id);
    await load();
    if (err) toast.error('Não foi possível ler: ' + err);
    else toast.success('Foto lida ✓');
  }

  /** Trocar a data da nota no cartão (antes de conferir) */
  const [editingDate, setEditingDate] = useState<string | null>(null);
  async function saveDate(imp: PaperImport, ymd: string) {
    if (!imp.extracted) return;
    const extracted = { ...imp.extracted, data: ymd };
    const { error } = await supabase.from('paper_imports').update({ extracted }).eq('id', imp.id);
    if (error) { toast.error('Não foi possível trocar a data: ' + error.message); return; }
    setList(l => l.map(x => x.id === imp.id ? { ...x, extracted } : x));
    setEditingDate(null);
    toast.success(`Data da nota: ${new Date(`${ymd}T12:00:00`).toLocaleDateString('pt-BR')} ✓`);
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
        <h1 className="text-3xl font-bold tracking-tight">📷 Importar notas e orçamentos</h1>
        <p className="text-steel-500 mt-1 max-w-2xl">
          Envie as notas antigas — foto do bloquinho ou PDF — do mês ou do ano inteiro. A inteligência artificial lê cliente,
          carro, serviços e valores; você confere e informa quem fez e como foi pago. Tudo entra nos relatórios,
          no Financeiro e na comissão <strong>com a data da nota</strong>.
        </p>

        {/* Envio */}
        <div className="card mt-5 border-2 border-dashed border-brand-200 !bg-brand-50/40 text-center py-8">
          <div className="text-4xl mb-2">🧾</div>
          <div className="font-bold text-steel-900">Envie fotos ou PDFs de uma ou várias notas</div>
          <div className="text-sm text-steel-500 mt-1">Dica: foto de cima, com boa luz e o papel inteiro aparecendo. PDF: uma nota por arquivo.</div>
          <div className="flex flex-wrap gap-3 justify-center mt-5">
            <button onClick={() => cameraRef.current?.click()} disabled={!!uploading} className="btn-primary">📸 Tirar foto</button>
            <button onClick={() => galleryRef.current?.click()} disabled={!!uploading} className="btn-ghost border border-steel-300 bg-white">🖼️ Escolher fotos ou PDF</button>
          </div>
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFiles} />
          <input ref={galleryRef} type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={onFiles} />
          {uploading && (
            <div className="mt-4 text-sm text-brand-700 font-semibold">
              Enviando {uploading.done}/{uploading.total}…
            </div>
          )}
        </div>

        {loose.length > 0 && (
          <div className="card mt-5 flex flex-wrap items-center gap-3 !py-3">
            <div className="flex-1 min-w-[220px] text-sm">
              <strong>🔩 {new Set(loose.map(i => partKey(looseName(i)))).size} peça(s) das notas importadas ainda não estão no cadastro.</strong>
              <span className="block text-xs text-steel-500">Salve para buscar nas próximas OS — com o preço da nota e o custo pela margem da loja.
                Nota com veículo: a peça entra com o carro no nome (ex.: “Kit amortecedor (Fiat Strada)”).</span>
            </div>
            <button onClick={linkLooseParts} disabled={linking} className="btn-primary text-sm">{linking ? 'Salvando…' : 'Salvar no cadastro'}</button>
          </div>
        )}

        {/* Período da importação */}
        <div className="flex flex-wrap items-center gap-2 mt-6">
          <select className="input !py-1 !px-2 !text-xs !w-auto font-semibold" value={by} onChange={e => setBy(e.target.value as 'nota' | 'envio')}>
            <option value="nota">Data da nota</option>
            <option value="envio">Data de envio</option>
          </select>
          {PERIODS.map(([k, l]) => (
            <button key={k} onClick={() => setPeriod(k)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition ${
                period === k ? 'bg-steel-900 text-white border-steel-900' : 'bg-white text-steel-600 border-steel-200 hover:border-steel-300'}`}>
              {l}
            </button>
          ))}
          {period === 'custom' && (
            <div className="flex items-center gap-1.5 text-xs text-steel-500">
              <input type="date" className="input !py-1.5 !text-xs !w-auto" value={from} onChange={e => setFrom(e.target.value)} />
              até
              <input type="date" className="input !py-1.5 !text-xs !w-auto" value={to} onChange={e => setTo(e.target.value)} />
            </div>
          )}
        </div>

        {/* Abas */}
        <div className="flex flex-wrap gap-2 mt-3 mb-4">
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
            {tab === 'done' && (period === 'all' ? 'Nenhuma nota importada ainda.' : 'Nenhuma nota importada neste período.')}
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {shown.map(r => {
              const x = r.extracted;
              return (
                <div key={r.id} className="card !p-0 overflow-hidden flex flex-col">
                  <div className="h-40 bg-steel-100 overflow-hidden">
                    {urls[r.id] && (isPdfPath(r.image_path)
                      ? <div className="w-full h-full grid place-items-center text-steel-500"><div className="text-center"><div className="text-4xl">📄</div><div className="text-xs font-semibold mt-1">PDF</div></div></div>
                      : <img src={urls[r.id]} alt="" className="w-full h-full object-cover" />)}
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
                        <div className="font-bold text-steel-900 truncate">{x?.cliente?.nome || 'Cliente sem nome'}</div>
                        <div className="text-xs text-steel-500 truncate">
                          {[x?.veiculo?.marca, x?.veiculo?.modelo, x?.veiculo?.placa].filter(Boolean).join(' · ') || 'Veículo não identificado'}
                        </div>
                        <div className="text-xs text-steel-500 truncate mt-0.5">{x?.servico_resumo ?? ''}</div>
                        <div className="flex justify-between items-center mt-2 text-sm">
                          {r.status === 'extracted' && editingDate === r.id ? (
                            <input type="date" className="input !py-1 !text-xs !w-auto" autoFocus defaultValue={x?.data ?? ''}
                              onBlur={() => setEditingDate(null)}
                              onChange={e => e.target.value && saveDate(r, e.target.value)} />
                          ) : (
                            <button type="button" disabled={r.status !== 'extracted'} onClick={() => setEditingDate(r.id)}
                              className="text-steel-400 hover:text-brand-700 disabled:hover:text-steel-400 text-left" title="Trocar a data da nota">
                              {x?.data ? `Nota de ${new Date(`${x.data}T12:00:00`).toLocaleDateString('pt-BR')}` : 'Sem data'}
                              {r.status === 'extracted' && <span className="ml-1">✏️</span>}
                            </button>
                          )}
                          {x?.total != null && <strong>{fmtBRL(x.total)}</strong>}
                        </div>
                        {(x?.campos_incertos?.length ?? 0) > 0 && r.status === 'extracted' && (
                          <div className="text-[11px] text-pending-700 mt-1">⚠️ {x!.campos_incertos.length} campo(s) para conferir</div>
                        )}
                      </>
                    )}
                    <div className="text-[11px] text-steel-400 mt-1">Importada em {new Date(r.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</div>
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
          isPdf={isPdfPath(reviewing.image_path)}
          onClose={() => setReviewing(null)}
          onDone={() => { setReviewing(null); load(); loadLoose(); }}
        />
      )}
    </WorkshopLayout>
  );
}
