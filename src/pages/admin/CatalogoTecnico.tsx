import { useEffect, useMemo, useState } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/components/ui/Toast';
import { VEHICLE_MAKES } from '@/lib/vehicleCatalog';
import {
  FILTER_KINDS, SYSTEMS, token, vehicleDetail, vehicleName,
  type FilterRef, type FluidSpec, type TechStatus, type TechVehicle,
} from '@/lib/techCatalog';

/**
 * Catálogo técnico (admin): as fichas de óleo e filtros que as oficinas consultam.
 * Tudo nasce como rascunho; só o que for aprovado (com a fonte preenchida) aparece para a oficina.
 */
type Tab = 'fichas' | 'fila' | 'avisos';
type Counts = Record<string, { ok: number; draft: number }>;
type Missing = { make: string | null; model: string; cars: number; lookups: number };
type FeedbackRow = {
  id: string; message: string; created_at: string; vehicle_id: string;
  vehicle: Pick<TechVehicle, 'make' | 'model' | 'version'> | null; workshop: { business_name: string } | null;
};
type VehicleDraft = Omit<TechVehicle, 'id'> & { id?: string };

const emptyVehicle = (make = '', model = ''): VehicleDraft =>
  ({ make, model, version: null, engine: null, fuel: null, transmission: null, year_from: null, year_to: null, notes: null });
const num = (s: string) => (s.trim() === '' ? null : Number(s.replace(',', '.')));
const txt = (s: string) => s.trim() || null;

export default function AdminCatalogoTecnico() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('fichas');
  const [vehicles, setVehicles] = useState<TechVehicle[]>([]);
  const [counts, setCounts] = useState<Counts>({});
  const [missing, setMissing] = useState<Missing[]>([]);
  const [feedback, setFeedback] = useState<FeedbackRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<VehicleDraft | null>(null);
  /** Texto pesquisável de cada ficha: viscosidade e códigos de filtro (a busca acha por "WO340" ou "5W30") */
  const [blobs, setBlobs] = useState<Record<string, string>>({});
  const [hasOil, setHasOil] = useState<Set<string>>(new Set());
  const [fMake, setFMake] = useState('');
  const [fModel, setFModel] = useState('');
  const [fStatus, setFStatus] = useState('');
  const [fFuel, setFFuel] = useState('');
  const [fYear, setFYear] = useState('');
  const [ignored, setIgnored] = useState<{ key: string; label: string }[]>([]);
  const [showIgnored, setShowIgnored] = useState(false);

  async function load() {
    const [v, s, f, m, fb, ig] = await Promise.all([
      supabase.from('tech_vehicles').select('*').order('make').order('model').order('year_from').limit(5000),
      supabase.from('tech_fluid_specs').select('vehicle_id, status, viscosity').limit(20000),
      supabase.from('tech_filter_refs').select('vehicle_id, status, kind, code').limit(20000),
      supabase.rpc('tech_missing_models'),
      supabase.from('tech_feedback')
        .select('id, message, created_at, vehicle_id, vehicle:tech_vehicles(make, model, version), workshop:workshops(business_name)')
        .is('resolved_at', null).order('created_at', { ascending: false }).limit(200),
      supabase.from('tech_queue_ignored').select('key, label').order('created_at', { ascending: false }).limit(1000),
    ]);
    if (v.error) toast.error('Erro ao carregar o catálogo: ' + v.error.message);
    const c: Counts = {};
    for (const r of [...((s.data as { vehicle_id: string; status: TechStatus }[] | null) ?? []), ...((f.data as { vehicle_id: string; status: TechStatus }[] | null) ?? [])]) {
      c[r.vehicle_id] ??= { ok: 0, draft: 0 };
      if (r.status === 'verificado') c[r.vehicle_id].ok++; else c[r.vehicle_id].draft++;
    }
    const b: Record<string, string> = {}; const oil = new Set<string>();
    for (const r of (s.data as { vehicle_id: string; viscosity: string | null }[] | null) ?? []) b[r.vehicle_id] = `${b[r.vehicle_id] ?? ''} ${r.viscosity ?? ''}`;
    for (const r of (f.data as { vehicle_id: string; kind: string; code: string }[] | null) ?? []) {
      b[r.vehicle_id] = `${b[r.vehicle_id] ?? ''} ${r.code}`;
      if (r.kind === 'oleo') oil.add(r.vehicle_id);
    }
    setBlobs(b); setHasOil(oil);
    setVehicles((v.data as TechVehicle[] | null) ?? []);
    setCounts(c);
    setMissing((m.data as Missing[] | null) ?? []);
    setFeedback((fb.data as unknown as FeedbackRow[] | null) ?? []);
    setIgnored((ig.data as { key: string; label: string }[] | null) ?? []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const makes = useMemo(() => [...new Set(vehicles.map(v => v.make))].sort((a, b) => a.localeCompare(b, 'pt-BR')), [vehicles]);
  const models = useMemo(() => [...new Set(vehicles.filter(v => !fMake || v.make === fMake).map(v => v.model))].sort((a, b) => a.localeCompare(b, 'pt-BR')), [vehicles, fMake]);
  const fuels = useMemo(() => [...new Set(vehicles.map(v => v.fuel).filter((x): x is string => !!x))].sort(), [vehicles]);
  const filtersOn = !!(q || fMake || fModel || fStatus || fFuel || fYear);
  const clearFilters = () => { setQ(''); setFMake(''); setFModel(''); setFStatus(''); setFFuel(''); setFYear(''); };

  const shown = useMemo(() => {
    const t = token(q);
    const y = fYear.trim() ? Number(fYear) : null;
    return vehicles.filter(v => {
      const c = counts[v.id] ?? { ok: 0, draft: 0 };
      if (fMake && v.make !== fMake) return false;
      if (fModel && v.model !== fModel) return false;
      if (fFuel && (fFuel === '_none' ? v.fuel : v.fuel !== fFuel)) return false;
      if (y != null && !((v.year_from == null || v.year_from <= y) && (v.year_to == null || v.year_to >= y))) return false;
      if (fStatus === 'rascunho' && c.draft === 0) return false;
      if (fStatus === 'no_ar' && c.ok === 0) return false;
      if (fStatus === 'pronta' && !(c.ok > 0 && c.draft === 0)) return false;
      if (fStatus === 'vazia' && c.ok + c.draft > 0) return false;
      if (fStatus === 'sem_filtro' && hasOil.has(v.id)) return false;
      return !t || token(`${v.make}${v.model}${v.version ?? ''}${v.engine ?? ''}${v.fuel ?? ''}${v.transmission ?? ''}${blobs[v.id] ?? ''}`).includes(t);
    });
  }, [q, vehicles, counts, blobs, hasOil, fMake, fModel, fStatus, fFuel, fYear]);

  const published = vehicles.filter(v => (counts[v.id]?.ok ?? 0) > 0).length;
  const pending = vehicles.filter(v => (counts[v.id]?.draft ?? 0) > 0).length;

  /** Tira o modelo da fila (não apaga nada das oficinas: só guarda que foi ignorado) */
  async function ignoreModel(label: string) {
    const key = token(label).toLowerCase();
    if (!key) return;
    const { error } = await supabase.from('tech_queue_ignored').upsert({ key, label, created_by: user?.id ?? null }, { onConflict: 'key' });
    if (error) { toast.error(error.message); return; }
    setMissing(ms => ms.filter(m => token(m.model).toLowerCase() !== key));
    setIgnored(i => [{ key, label }, ...i.filter(x => x.key !== key)]);
  }
  async function restoreModel(key: string) {
    const { error } = await supabase.from('tech_queue_ignored').delete().eq('key', key);
    if (error) { toast.error(error.message); return; }
    setIgnored(i => i.filter(x => x.key !== key));
    load();
  }

  async function resolve(id: string) {
    const { error } = await supabase.from('tech_feedback').update({ resolved_at: new Date().toISOString() }).eq('id', id);
    if (error) { toast.error(error.message); return; }
    setFeedback(fs => fs.filter(f => f.id !== id));
  }

  return (
    <AdminLayout>
      <div className="max-w-5xl space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Catálogo técnico</h1>
            <p className="text-sm text-steel-500">Fichas de óleo e filtros por carro. A oficina só vê o que foi aprovado, e só dá para aprovar com a fonte preenchida.</p>
          </div>
          <button onClick={() => { setEditing(emptyVehicle()); setTab('fichas'); }} className="btn-primary text-sm !py-2">+ Nova ficha</button>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Stat label="Fichas no ar" value={published} tone="text-signal-700" />
          <Stat label="Com rascunho a conferir" value={pending} tone="text-pending-700" />
          <Stat label="Avisos de erro" value={feedback.length} tone={feedback.length ? 'text-alert-600' : 'text-steel-700'} />
        </div>

        {editing && (
          <Editor key={editing.id ?? `novo-${editing.make}-${editing.model}`} draft={editing}
            onClose={() => setEditing(null)}
            onChanged={load}
            onSaved={v => { setEditing(v); load(); }}
            onDeleted={() => { setEditing(null); load(); }} />
        )}

        <div className="flex gap-1 bg-steel-100 rounded-xl p-1 w-fit">
          {([['fichas', `Fichas (${vehicles.length})`], ['fila', `Falta cadastrar (${missing.length})`], ['avisos', `Avisos (${feedback.length})`]] as [Tab, string][]).map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`text-sm font-semibold px-3.5 py-1.5 rounded-lg transition ${tab === k ? 'bg-white shadow-sm text-steel-900' : 'text-steel-500 hover:text-steel-800'}`}>
              {l}
            </button>
          ))}
        </div>

        {loading ? <div className="card h-32 animate-pulse" /> : (
          <>
            {tab === 'fichas' && (
              <div className="space-y-3">
                <input className="input" placeholder="Buscar por marca, modelo, motor, viscosidade (5W30) ou código de filtro (WO340)…" value={q} onChange={e => setQ(e.target.value)} />
                <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                  <select className="input !py-1.5 text-sm" value={fMake} onChange={e => { setFMake(e.target.value); setFModel(''); }} aria-label="Marca">
                    <option value="">Todas as marcas</option>{makes.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                  <select className="input !py-1.5 text-sm" value={fModel} onChange={e => setFModel(e.target.value)} aria-label="Modelo">
                    <option value="">Todos os modelos</option>{models.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                  <select className="input !py-1.5 text-sm" value={fStatus} onChange={e => setFStatus(e.target.value)} aria-label="Situação">
                    <option value="">Qualquer situação</option>
                    <option value="rascunho">Com rascunho a conferir</option>
                    <option value="no_ar">Com linha no ar</option>
                    <option value="pronta">Tudo aprovado</option>
                    <option value="vazia">Vazia</option>
                    <option value="sem_filtro">Sem filtro de óleo</option>
                  </select>
                  <select className="input !py-1.5 text-sm" value={fFuel} onChange={e => setFFuel(e.target.value)} aria-label="Combustível">
                    <option value="">Qualquer combustível</option>{fuels.map(f => <option key={f} value={f}>{f}</option>)}<option value="_none">Nenhum (não informado)</option>
                  </select>
                  <input className="input !py-1.5 text-sm" inputMode="numeric" placeholder="Ano do carro" value={fYear} onChange={e => setFYear(e.target.value.replace(/\D/g, '').slice(0, 4))} aria-label="Ano" />
                </div>
                <div className="flex items-center justify-between text-xs text-steel-500">
                  <span>{shown.length} de {vehicles.length} fichas</span>
                  {filtersOn && <button onClick={clearFilters} className="font-semibold text-brand-600 hover:underline">Limpar filtros</button>}
                </div>
                <div className="card !p-0 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-steel-50 border-b border-steel-100 text-[10px] uppercase tracking-wider text-steel-500">
                      <tr><th className="text-left px-4 py-2">Carro</th><th className="text-left px-4 py-2">Versão</th><th className="text-left px-4 py-2">Situação</th><th /></tr>
                    </thead>
                    <tbody className="divide-y divide-steel-100">
                      {shown.map(v => {
                        const c = counts[v.id] ?? { ok: 0, draft: 0 };
                        return (
                          <tr key={v.id}>
                            <td className="px-4 py-2.5 font-semibold">{vehicleName(v)}</td>
                            <td className="px-4 py-2.5 text-steel-600">{vehicleDetail(v) || '—'}</td>
                            <td className="px-4 py-2.5 text-xs">
                              {c.ok > 0 && <span className="badge bg-signal-100 text-signal-700 mr-1">{c.ok} no ar</span>}
                              {c.draft > 0 && <span className="badge bg-pending-100 text-pending-700">{c.draft} rascunho</span>}
                              {c.ok + c.draft === 0 && <span className="text-steel-400">vazia</span>}
                            </td>
                            <td className="px-4 py-2.5 text-right">
                              <button onClick={() => setEditing(v)} className="text-xs font-semibold text-brand-600 hover:underline">Abrir</button>
                            </td>
                          </tr>
                        );
                      })}
                      {shown.length === 0 && <tr><td colSpan={4} className="px-4 py-6 text-center text-steel-500">Nenhuma ficha {filtersOn ? 'com esses filtros' : 'cadastrada ainda'}.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {tab === 'fila' && (
              <div className="card !p-0 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-steel-50 border-b border-steel-100 text-[10px] uppercase tracking-wider text-steel-500">
                    <tr><th className="text-left px-4 py-2">Modelo</th><th className="text-right px-4 py-2">Buscas sem ficha</th><th className="text-right px-4 py-2">Carros nas oficinas</th><th /></tr>
                  </thead>
                  <tbody className="divide-y divide-steel-100">
                    {missing.map(m => (
                      <tr key={`${m.make}-${m.model}`}>
                        <td className="px-4 py-2.5 font-semibold">{[m.make, m.model].filter(Boolean).join(' ')}</td>
                        <td className="px-4 py-2.5 text-right">{m.lookups || '—'}</td>
                        <td className="px-4 py-2.5 text-right">{m.cars || '—'}</td>
                        <td className="px-4 py-2.5 text-right">
                          <button onClick={() => { setEditing(emptyVehicle(m.make ?? '', m.model)); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                            className="text-xs font-semibold text-brand-600 hover:underline mr-3">Criar ficha</button>
                          <button onClick={() => ignoreModel(m.model)} className="text-xs text-steel-500 hover:underline">Ignorar</button>
                        </td>
                      </tr>
                    ))}
                    {missing.length === 0 && <tr><td colSpan={4} className="px-4 py-6 text-center text-steel-500">Nada na fila.</td></tr>}
                  </tbody>
                </table>
                {ignored.length > 0 && (
                  <div className="border-t border-steel-100 px-4 py-3 text-xs">
                    <button onClick={() => setShowIgnored(v => !v)} className="font-semibold text-steel-600 hover:underline">
                      {showIgnored ? 'Esconder' : 'Ver'} ignorados ({ignored.length})
                    </button>
                    {showIgnored && (
                      <ul className="mt-2 flex flex-wrap gap-2">
                        {ignored.map(i => (
                          <li key={i.key} className="inline-flex items-center gap-1.5 bg-steel-100 rounded-lg px-2 py-1">
                            {i.label}
                            <button onClick={() => restoreModel(i.key)} className="text-brand-600 hover:underline">voltar à fila</button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            )}

            {tab === 'avisos' && (
              feedback.length === 0
                ? <div className="card text-sm text-steel-500">Nenhum aviso em aberto.</div>
                : <div className="space-y-3">{feedback.map(f => (
                    <div key={f.id} className="card flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <strong>{f.vehicle ? `${f.vehicle.make} ${f.vehicle.model} ${f.vehicle.version ?? ''}` : 'Ficha removida'}</strong>
                        <div className="text-xs text-steel-500">{f.workshop?.business_name ?? 'Oficina'} · {new Date(f.created_at).toLocaleDateString('pt-BR')}</div>
                        <p className="text-sm mt-1.5 bg-steel-50 rounded-lg px-3 py-2">“{f.message}”</p>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button onClick={() => { const v = vehicles.find(x => x.id === f.vehicle_id); if (v) { setEditing(v); window.scrollTo({ top: 0, behavior: 'smooth' }); } }}
                          className="btn-ghost text-sm !py-1.5 border border-steel-200">Abrir ficha</button>
                        <button onClick={() => resolve(f.id)} className="btn-primary text-sm !py-1.5">Resolvido</button>
                      </div>
                    </div>
                  ))}</div>
            )}
          </>
        )}
      </div>
    </AdminLayout>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="card">
      <div className="text-[10px] font-bold uppercase tracking-widest text-steel-500">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${tone}`}>{value}</div>
    </div>
  );
}

/* ── Ficha: dados do carro + fluidos + filtros ─────────────────────────────── */

function Editor({ draft, onClose, onSaved, onDeleted, onChanged }: {
  draft: VehicleDraft; onClose: () => void; onSaved: (v: TechVehicle) => void; onDeleted: () => void; onChanged: () => void;
}) {
  const [f, setF] = useState({
    make: draft.make, model: draft.model, version: draft.version ?? '', engine: draft.engine ?? '', fuel: draft.fuel ?? '',
    transmission: draft.transmission ?? '', year_from: draft.year_from ? String(draft.year_from) : '',
    year_to: draft.year_to ? String(draft.year_to) : '', notes: draft.notes ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [fluids, setFluids] = useState<FluidSpec[]>([]);
  const [filters, setFilters] = useState<FilterRef[]>([]);
  const id = draft.id;
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF(s => ({ ...s, [k]: e.target.value }));

  async function loadLines() {
    if (!id) return;
    const [s, r] = await Promise.all([
      supabase.from('tech_fluid_specs').select('*').eq('vehicle_id', id).order('position').order('created_at'),
      supabase.from('tech_filter_refs').select('*').eq('vehicle_id', id).order('kind').order('position').order('created_at'),
    ]);
    setFluids((s.data as FluidSpec[] | null) ?? []);
    setFilters((r.data as FilterRef[] | null) ?? []);
  }
  useEffect(() => { loadLines(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);
  const changed = () => { loadLines(); onChanged(); };

  async function saveVehicle() {
    if (!f.make.trim() || !f.model.trim()) { toast.error('Informe marca e modelo.'); return; }
    const yf = num(f.year_from), yt = num(f.year_to);
    if (yf != null && yt != null && yt < yf) { toast.error('O ano final não pode ser menor que o inicial.'); return; }
    setSaving(true);
    const payload = {
      make: f.make.trim(), model: f.model.trim(), version: txt(f.version), engine: txt(f.engine), fuel: txt(f.fuel),
      transmission: txt(f.transmission), year_from: yf, year_to: yt, notes: txt(f.notes), updated_at: new Date().toISOString(),
    };
    const res = id
      ? await supabase.from('tech_vehicles').update(payload).eq('id', id).select().single()
      : await supabase.from('tech_vehicles').insert(payload).select().single();
    setSaving(false);
    if (res.error) { toast.error('Não foi possível salvar: ' + res.error.message); return; }
    toast.success('Carro salvo');
    onSaved(res.data as TechVehicle);
  }

  async function removeVehicle() {
    if (!id || !confirm('Apagar esta ficha inteira (carro, fluidos e filtros)?')) return;
    const { error } = await supabase.from('tech_vehicles').delete().eq('id', id);
    if (error) { toast.error(error.message); return; }
    toast.success('Ficha apagada');
    onDeleted();
  }

  return (
    <div className="card border-2 border-brand-300 space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div className="font-bold">{id ? 'Editar ficha' : 'Nova ficha'}</div>
        <button onClick={onClose} className="text-steel-400 hover:text-steel-700 text-xl" aria-label="Fechar">✕</button>
      </div>

      <div className="grid sm:grid-cols-4 gap-3">
        <div><label className="label">Marca *</label>
          <input className="input" list="tc-makes" value={f.make} onChange={set('make')} placeholder="Chevrolet" />
          <datalist id="tc-makes">{VEHICLE_MAKES.map(m => <option key={m} value={m} />)}</datalist></div>
        <div><label className="label">Modelo *</label><input className="input" value={f.model} onChange={set('model')} placeholder="Cruze" /></div>
        <div className="sm:col-span-2"><label className="label">Versão</label><input className="input" value={f.version} onChange={set('version')} placeholder="LTZ 1.8 16V Flexpower" /></div>
        <div><label className="label">Motor</label><input className="input" value={f.engine} onChange={set('engine')} placeholder="1.8 16V Ecotec" /></div>
        <div><label className="label">Combustível</label><input className="input" value={f.fuel} onChange={set('fuel')} placeholder="Flex" /></div>
        <div><label className="label">Câmbio</label><input className="input" value={f.transmission} onChange={set('transmission')} placeholder="Automático" /></div>
        <div className="grid grid-cols-2 gap-2">
          <div><label className="label">Ano de</label><input className="input" inputMode="numeric" value={f.year_from} onChange={set('year_from')} placeholder="2012" /></div>
          <div><label className="label">até</label><input className="input" inputMode="numeric" value={f.year_to} onChange={set('year_to')} placeholder="2016" /></div>
        </div>
        <div className="sm:col-span-4"><label className="label">Observação (aparece para a oficina)</label><input className="input" value={f.notes} onChange={set('notes')} /></div>
      </div>
      <div className="flex gap-2">
        <button onClick={saveVehicle} disabled={saving} className="btn-primary text-sm !py-2">{saving ? 'Salvando…' : id ? 'Salvar carro' : 'Criar ficha'}</button>
        {id && <button onClick={removeVehicle} className="btn-ghost text-sm !py-2 text-alert-600">Apagar ficha</button>}
      </div>

      {id ? (
        <>
          <Lines title="Fluidos" table="tech_fluid_specs" vehicleId={id} rows={fluids} onChanged={changed}
            blank={{ system: 'motor', viscosity: '', spec: '', capacity_liters: '', interval_km: '', interval_months: '', notes: '', source_url: '' }}
            fields={[
              { key: 'system', label: 'Sistema', options: SYSTEMS },
              { key: 'viscosity', label: 'Viscosidade', placeholder: '5W30' },
              { key: 'spec', label: 'Norma', placeholder: 'API SL / Dexos 1' },
              { key: 'capacity_liters', label: 'Litros', numeric: true, placeholder: '4,5' },
              { key: 'interval_km', label: 'Troca (km)', numeric: true, placeholder: '10000' },
              { key: 'interval_months', label: 'Troca (meses)', numeric: true, placeholder: '12' },
              { key: 'notes', label: 'Observação', wide: true },
              { key: 'source_url', label: 'Fonte (link do manual)', wide: true, placeholder: 'https://…' },
            ]} />
          <Lines title="Filtros" table="tech_filter_refs" vehicleId={id} rows={filters} onChanged={changed}
            blank={{ kind: 'oleo', brand: '', code: '', notes: '', source_url: '' }}
            fields={[
              { key: 'kind', label: 'Tipo', options: FILTER_KINDS },
              { key: 'brand', label: 'Marca', placeholder: 'Tecfil', required: true },
              { key: 'code', label: 'Código', placeholder: 'PSL 55', required: true },
              { key: 'notes', label: 'Observação', wide: true },
              { key: 'source_url', label: 'Fonte (catálogo do fabricante)', wide: true, placeholder: 'https://…' },
            ]} />
        </>
      ) : (
        <p className="text-sm text-steel-500">Crie a ficha para lançar os fluidos e os filtros.</p>
      )}
    </div>
  );
}

type Field = {
  key: string; label: string; placeholder?: string; numeric?: boolean; wide?: boolean; required?: boolean;
  options?: readonly { value: string; label: string }[];
};
type LineRow = { id: string; status: TechStatus } & Record<string, unknown>;

function Lines({ title, table, vehicleId, rows, fields, blank, onChanged }: {
  title: string; table: 'tech_fluid_specs' | 'tech_filter_refs'; vehicleId: string;
  rows: (FluidSpec | FilterRef)[]; fields: Field[]; blank: Record<string, string>; onChanged: () => void;
}) {
  const [adding, setAdding] = useState(false);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="font-bold">{title}</h3>
        <button onClick={() => setAdding(true)} className="text-sm font-semibold text-brand-600 hover:underline">+ Adicionar</button>
      </div>
      {rows.length === 0 && !adding && <p className="text-sm text-steel-500">Nada lançado.</p>}
      {/* Agrupado pelo tipo (Filtro de óleo, Filtro de ar…), para ver de relance o que é cada código */}
      {(() => {
        const typeField = fields[0];
        const groups = (typeField.options ?? []).map(o => ({
          label: o.label, rows: rows.filter(r => (r as unknown as Record<string, unknown>)[typeField.key] === o.value),
        })).filter(g => g.rows.length > 0);
        return groups.map(g => (
          <div key={g.label} className="space-y-2">
            <div className="text-xs font-bold uppercase tracking-widest text-steel-500 pt-1">{g.label} ({g.rows.length})</div>
            {g.rows.map(r => (
              <Line key={r.id} table={table} vehicleId={vehicleId} row={r as unknown as LineRow} fields={fields} blank={blank} onChanged={onChanged} />
            ))}
          </div>
        ));
      })()}
      {adding && (
        <Line table={table} vehicleId={vehicleId} row={null} fields={fields} blank={blank}
          onChanged={() => { setAdding(false); onChanged(); }} onCancel={() => setAdding(false)} />
      )}
    </div>
  );
}

function Line({ table, vehicleId, row, fields, blank, onChanged, onCancel }: {
  table: 'tech_fluid_specs' | 'tech_filter_refs'; vehicleId: string; row: LineRow | null;
  fields: Field[]; blank: Record<string, string>; onChanged: () => void; onCancel?: () => void;
}) {
  const { user } = useAuth();
  const initial = useMemo(() => Object.fromEntries(Object.keys(blank).map(k => {
    const v = row?.[k];
    return [k, v == null ? blank[k] : String(v).replace('.', fields.find(f => f.key === k)?.numeric ? ',' : '.')];
  })) as Record<string, string>, [row, blank, fields]);
  const [f, setF] = useState(initial);
  const [busy, setBusy] = useState(false);
  useEffect(() => setF(initial), [initial]);
  const dirty = !row || Object.keys(f).some(k => f[k] !== initial[k]);
  const verified = row?.status === 'verificado';

  const payload = () => Object.fromEntries(fields.map(fd =>
    [fd.key, fd.numeric ? num(f[fd.key]) : fd.options || fd.required ? f[fd.key].trim() : txt(f[fd.key])]));

  async function save() {
    const missing = fields.find(fd => fd.required && !f[fd.key].trim());
    if (missing) { toast.error(`Informe: ${missing.label}`); return; }
    setBusy(true);
    // Mexeu no conteúdo de uma linha aprovada → volta para rascunho até conferir de novo
    const res = row
      ? await supabase.from(table).update({ ...payload(), status: 'rascunho', verified_by: null, verified_at: null }).eq('id', row.id)
      : await supabase.from(table).insert({ ...payload(), vehicle_id: vehicleId });
    setBusy(false);
    if (res.error) { toast.error('Não foi possível salvar: ' + res.error.message); return; }
    onChanged();
  }

  async function setStatus(status: TechStatus) {
    if (!row) return;
    if (status === 'verificado' && !String(row.source_url ?? '').trim()) { toast.error('Preencha e salve a fonte antes de aprovar.'); return; }
    setBusy(true);
    const { error } = await supabase.from(table).update({
      status, verified_by: status === 'verificado' ? user?.id ?? null : null,
      verified_at: status === 'verificado' ? new Date().toISOString() : null,
    }).eq('id', row.id);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    onChanged();
  }

  async function remove() {
    if (!row || !confirm('Apagar esta linha?')) return;
    const { error } = await supabase.from(table).delete().eq('id', row.id);
    if (error) { toast.error(error.message); return; }
    onChanged();
  }

  return (
    <div className={`rounded-xl border p-3 space-y-2 ${verified ? 'border-signal-300 bg-signal-50/40' : 'border-steel-200'}`}>
      <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
        {fields.map(fd => (
          <div key={fd.key} className={fd.wide ? 'col-span-2 sm:col-span-3' : ''}>
            <label className="label">{fd.label}</label>
            {fd.options ? (
              <select className="input !py-1.5 text-sm" value={f[fd.key]} onChange={e => setF(s => ({ ...s, [fd.key]: e.target.value }))}>
                {fd.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            ) : (
              <input className="input !py-1.5 text-sm" inputMode={fd.numeric ? 'decimal' : undefined} placeholder={fd.placeholder}
                value={f[fd.key]} onChange={e => setF(s => ({ ...s, [fd.key]: e.target.value }))} />
            )}
          </div>
        ))}
      </div>
      {row && f[fields[0].key] !== initial[fields[0].key] && (
        <p className="text-xs text-pending-700 bg-pending-100/60 rounded-lg px-2.5 py-1.5">
          Você mudou o tipo, mas o código e a observação não mudam sozinhos. Confira se o código é mesmo desse tipo antes de salvar.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3 text-sm">
        {row && <span className={`badge ${verified ? 'bg-signal-100 text-signal-700' : 'bg-pending-100 text-pending-700'}`}>{verified ? 'No ar' : 'Rascunho'}</span>}
        {dirty && <button onClick={save} disabled={busy} className="btn-primary text-sm !py-1.5">{row ? 'Salvar alteração' : 'Adicionar'}</button>}
        {row && dirty && <button onClick={() => setF(initial)} disabled={busy} className="text-steel-500 hover:underline">Descartar</button>}
        {row && !dirty && !verified && <button onClick={() => setStatus('verificado')} disabled={busy} className="btn-primary text-sm !py-1.5 !bg-signal-600">Conferi, aprovar</button>}
        {row && !dirty && verified && <button onClick={() => setStatus('rascunho')} disabled={busy} className="text-steel-500 hover:underline">Tirar do ar</button>}
        {row && <button onClick={remove} disabled={busy} className="text-alert-600 hover:underline">Apagar</button>}
        {!row && onCancel && <button onClick={onCancel} className="text-steel-500 hover:underline">Cancelar</button>}
      </div>
    </div>
  );
}
