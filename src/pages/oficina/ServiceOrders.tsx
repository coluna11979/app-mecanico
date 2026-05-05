import { FormEvent, useEffect, useState } from 'react';
import WorkshopLayout from '@/components/layout/WorkshopLayout';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type {
  ServiceOrder, Customer, Vehicle, Workshop,
  OsStatus, WorkshopMechanic,
} from '@/types/database';

/* ─── tipos locais ──────────────────────────────────────────── */
type OsRow = ServiceOrder & {
  customer: Customer | null;
  vehicle: Vehicle | null;
  mechanic: WorkshopMechanic | null;
};

/* ─── constantes ────────────────────────────────────────────── */
const STATUSES: OsStatus[] = ['open', 'in_progress', 'completed', 'cancelled'];

const OS_CATEGORIES = [
  'Troca de óleo', 'Freios', 'Suspensão', 'Elétrica', 'Motor',
  'Câmbio', 'Revisão geral', 'Diagnóstico', 'Ar-condicionado',
  'Funilaria', 'Pneus', 'Transmissão', 'Embreagem', 'Injeção eletrônica', 'Outro',
];

const EMPTY_OS = {
  title: '', description: '', category: '', price: '',
  customer_id: '', vehicle_id: '', workshop_mechanic_id: '',
};

const EMPTY_MECH = { name: '', phone: '', specialty: '' };

/* ─── helpers ───────────────────────────────────────────────── */
function osLabel(s: string) {
  return ({ open: 'Aberta', in_progress: 'Em andamento', completed: 'Concluída', cancelled: 'Cancelada' } as Record<string, string>)[s] ?? s;
}
function osColor(s: string) {
  return ({
    open:        'bg-pending-100 text-pending-700',
    in_progress: 'bg-brand-100 text-brand-700',
    completed:   'bg-signal-100 text-signal-700',
    cancelled:   'bg-steel-100 text-steel-500',
  } as Record<string, string>)[s] ?? '';
}
function durationMin(os: OsRow): number | null {
  if (!os.started_at || !os.completed_at) return null;
  return Math.round((new Date(os.completed_at).getTime() - new Date(os.started_at).getTime()) / 60000);
}
function fmtDur(min: number) {
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h}h ${m}min` : `${h}h`;
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/* ══════════════════════════════════════════════════════════════
   Componente principal
══════════════════════════════════════════════════════════════ */
export default function ServiceOrders() {
  const { user } = useAuth();

  /* dados base */
  const [shop, setShop]             = useState<Workshop | null>(null);
  const [list, setList]             = useState<OsRow[]>([]);
  const [customers, setCustomers]   = useState<Customer[]>([]);
  const [vehicles, setVehicles]     = useState<Vehicle[]>([]);
  const [internalMechs, setInternalMechs] = useState<WorkshopMechanic[]>([]);

  /* UI */
  const [tab, setTab]         = useState<'os' | 'mecanicos'>('os');
  const [filterStatus, setFilterStatus] = useState<OsStatus | 'all'>('all');
  const [filterMech, setFilterMech]     = useState<string>('all');
  const [search, setSearch]   = useState('');
  const [detail, setDetail]   = useState<OsRow | null>(null);
  const [modalOS, setModalOS] = useState(false);
  const [modalMech, setModalMech] = useState(false);
  const [formOS, setFormOS]   = useState(EMPTY_OS);
  const [formMech, setFormMech] = useState(EMPTY_MECH);
  const [saving, setSaving]   = useState(false);

  /* ── carrega tudo ── */
  useEffect(() => { if (user) load(); }, [user]);

  async function load() {
    const { data: w } = await supabase.from('workshops').select('*').eq('profile_id', user!.id).maybeSingle();
    setShop(w as Workshop);
    if (w?.id) {
      await Promise.all([fetchOS(w.id), fetchCustomers(w.id), fetchMechs(w.id)]);
    }
  }

  async function fetchOS(wid: string) {
    const { data } = await supabase
      .from('service_orders')
      .select('*, customer:customers(*), vehicle:vehicles(*), mechanic:workshop_mechanics(*)')
      .eq('workshop_id', wid)
      .order('created_at', { ascending: false });
    setList((data as OsRow[]) ?? []);
  }

  async function fetchCustomers(wid: string) {
    const { data } = await supabase.from('customers').select('*').eq('workshop_id', wid).order('full_name');
    setCustomers((data as Customer[]) ?? []);
  }

  async function fetchMechs(wid: string) {
    const { data } = await supabase
      .from('workshop_mechanics').select('*').eq('workshop_id', wid).eq('active', true).order('name');
    setInternalMechs((data as WorkshopMechanic[]) ?? []);
  }

  async function loadVehicles(customerId: string) {
    if (!shop) return;
    const { data } = await supabase.from('vehicles').select('*').eq('customer_id', customerId).eq('workshop_id', shop.id);
    setVehicles((data as Vehicle[]) ?? []);
  }

  /* ── criar OS ── */
  async function saveOS(e: FormEvent) {
    e.preventDefault();
    if (!shop) return;
    setSaving(true);
    await supabase.from('service_orders').insert({
      workshop_id:          shop.id,
      title:                formOS.title.trim(),
      description:          formOS.description.trim() || null,
      category:             formOS.category || null,
      price:                Number(formOS.price) || 0,
      customer_id:          formOS.customer_id || null,
      vehicle_id:           formOS.vehicle_id  || null,
      workshop_mechanic_id: formOS.workshop_mechanic_id || null,
      status:               'open',
    });
    await fetchOS(shop.id);
    setModalOS(false); setFormOS(EMPTY_OS); setVehicles([]);
    setSaving(false);
  }

  /* ── criar mecânico interno ── */
  async function saveMech(e: FormEvent) {
    e.preventDefault();
    if (!shop) return;
    setSaving(true);
    await supabase.from('workshop_mechanics').insert({
      workshop_id: shop.id,
      name:        formMech.name.trim(),
      phone:       formMech.phone.trim() || null,
      specialty:   formMech.specialty.trim() || null,
    });
    await fetchMechs(shop.id);
    setModalMech(false); setFormMech(EMPTY_MECH);
    setSaving(false);
  }

  /* ── desativar mecânico ── */
  async function deactivateMech(id: string) {
    if (!confirm('Remover mecânico da lista?')) return;
    await supabase.from('workshop_mechanics').update({ active: false }).eq('id', id);
    setInternalMechs(prev => prev.filter(m => m.id !== id));
  }

  /* ── atualizar status da OS ── */
  async function updateStatus(os: OsRow, status: OsStatus) {
    const extra: Record<string, unknown> = {};
    if (status === 'in_progress' && !os.started_at) extra.started_at = new Date().toISOString();
    if (status === 'completed')                      extra.completed_at = new Date().toISOString();
    await supabase.from('service_orders').update({ status, ...extra }).eq('id', os.id);
    const updated = { ...os, status, ...extra } as OsRow;
    setList(prev => prev.map(o => o.id === os.id ? updated : o));
    if (detail?.id === os.id) setDetail(updated);
  }

  /* ─── analytics ─────────────────────────────── */
  const completed = list.filter(o => o.status === 'completed');
  const revenue   = completed.reduce((a, o) => a + o.price, 0);

  const now = new Date();
  const thisMonth = completed.filter(o =>
    new Date(o.completed_at!).getMonth() === now.getMonth() &&
    new Date(o.completed_at!).getFullYear() === now.getFullYear()
  );
  const revenueMonth = thisMonth.reduce((a, o) => a + o.price, 0);

  // Top categorias
  const catCount: Record<string, { count: number; revenue: number; durations: number[] }> = {};
  list.forEach(o => {
    const cat = o.category || 'Sem categoria';
    if (!catCount[cat]) catCount[cat] = { count: 0, revenue: 0, durations: [] };
    catCount[cat].count++;
    if (o.status === 'completed') catCount[cat].revenue += o.price;
    const d = durationMin(o);
    if (d !== null) catCount[cat].durations.push(d);
  });
  const topCats = Object.entries(catCount)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 6);
  const maxCount = topCats[0]?.[1].count ?? 1;

  // Mecânicos
  const mechCount: Record<string, { name: string; count: number; revenue: number }> = {};
  list.forEach(o => {
    if (!o.mechanic) return;
    const id = o.mechanic.id;
    if (!mechCount[id]) mechCount[id] = { name: o.mechanic.name, count: 0, revenue: 0 };
    mechCount[id].count++;
    if (o.status === 'completed') mechCount[id].revenue += o.price;
  });
  const topMechs = Object.values(mechCount).sort((a, b) => b.count - a.count);

  // Tempo médio global
  const durations = completed.map(durationMin).filter((d): d is number => d !== null);
  const avgDur    = durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null;

  /* ─── lista filtrada ────────────────────────── */
  const filtered = list.filter(o => {
    if (filterStatus !== 'all' && o.status !== filterStatus) return false;
    if (filterMech !== 'all' && (o.workshop_mechanic_id ?? 'none') !== filterMech) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        o.title.toLowerCase().includes(q) ||
        o.customer?.full_name.toLowerCase().includes(q) ||
        o.vehicle?.plate.toLowerCase().includes(q) ||
        o.mechanic?.name.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const counts = STATUSES.reduce(
    (acc, s) => ({ ...acc, [s]: list.filter(o => o.status === s).length }),
    {} as Record<string, number>
  );

  /* ══════════════════════════════════════════════
     RENDER
  ══════════════════════════════════════════════ */
  return (
    <WorkshopLayout>

      {/* ── Cabeçalho ── */}
      <div className="flex flex-wrap justify-between items-start gap-3 mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Ordens de Serviço</h1>
          <p className="text-sm text-steel-500 mt-1">{list.length} OS cadastradas</p>
        </div>
        <div className="flex gap-2">
          {tab === 'mecanicos' ? (
            <button onClick={() => setModalMech(true)} className="btn-primary">+ Mecânico</button>
          ) : (
            <button onClick={() => setModalOS(true)} className="btn-primary">+ Nova OS</button>
          )}
        </div>
      </div>

      {/* ── KPIs ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <KPI label="Faturamento total"   value={`R$ ${revenue.toFixed(0)}`}   sub={`${completed.length} concluídas`} color="text-signal-600" />
        <KPI label="Este mês"            value={`R$ ${revenueMonth.toFixed(0)}`} sub={`${thisMonth.length} OS`}  color="text-brand-600" />
        <KPI label="Tempo médio"         value={avgDur !== null ? fmtDur(avgDur) : '—'} sub="por OS concluída" />
        <KPI label="Mecânicos ativos"    value={internalMechs.length} sub="cadastrados" />
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-1 mb-6 bg-steel-100 rounded-xl p-1 max-w-xs">
        {(['os', 'mecanicos'] as const).map(t => (
          <button
            key={t} onClick={() => setTab(t)}
            className={`flex-1 rounded-lg py-2 text-sm font-semibold transition ${
              tab === t ? 'bg-white shadow text-steel-900' : 'text-steel-500 hover:text-steel-700'
            }`}
          >
            {t === 'os' ? `📋 OS (${list.length})` : `🔧 Mecânicos (${internalMechs.length})`}
          </button>
        ))}
      </div>

      {/* ══════════ TAB: OS ══════════ */}
      {tab === 'os' && (
        <div className="space-y-5">

          {/* Analytics de categorias */}
          {topCats.length > 0 && (
            <div className="card">
              <h2 className="font-bold text-steel-800 mb-4">Serviços mais realizados</h2>
              <div className="space-y-3">
                {topCats.map(([cat, info]) => {
                  const avgD = info.durations.length
                    ? Math.round(info.durations.reduce((a, b) => a + b, 0) / info.durations.length)
                    : null;
                  return (
                    <div key={cat}>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-semibold truncate">{cat}</span>
                          {avgD !== null && (
                            <span className="text-xs text-steel-400 whitespace-nowrap">⏱ {fmtDur(avgD)} em média</span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          {info.revenue > 0 && (
                            <span className="text-xs text-signal-600 font-semibold">R$ {info.revenue.toFixed(0)}</span>
                          )}
                          <span className="text-xs font-bold text-steel-700 w-8 text-right">{info.count}×</span>
                        </div>
                      </div>
                      <div className="h-2 bg-steel-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-brand-500 to-brand-400 rounded-full transition-all duration-700"
                          style={{ width: `${(info.count / maxCount) * 100}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Filtros */}
          <div className="flex flex-wrap gap-2 items-center">
            <input
              className="input max-w-xs text-sm"
              placeholder="Buscar OS, cliente, placa, mecânico…"
              value={search} onChange={e => setSearch(e.target.value)}
            />
            <select className="input max-w-[160px] text-sm" value={filterStatus}
              onChange={e => setFilterStatus(e.target.value as OsStatus | 'all')}>
              <option value="all">Todos status</option>
              {STATUSES.map(s => (
                <option key={s} value={s}>{osLabel(s)} ({counts[s] ?? 0})</option>
              ))}
            </select>
            {internalMechs.length > 0 && (
              <select className="input max-w-[180px] text-sm" value={filterMech}
                onChange={e => setFilterMech(e.target.value)}>
                <option value="all">Todos mecânicos</option>
                <option value="none">Sem mecânico</option>
                {internalMechs.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            )}
          </div>

          {/* Lista OS */}
          {filtered.length === 0 ? (
            <div className="card text-center text-steel-500 py-14">
              {list.length === 0
                ? <><p className="text-lg font-semibold">Nenhuma OS ainda</p><p className="text-sm mt-1">Crie a primeira ordem de serviço.</p></>
                : 'Nenhuma OS com esses filtros.'}
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map(os => (
                <button key={os.id} onClick={() => setDetail(os)}
                  className="card w-full text-left hover:shadow-md transition hover:-translate-y-0.5 active:scale-[0.99]">
                  <div className="flex items-start gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`badge text-xs ${osColor(os.status)}`}>{osLabel(os.status)}</span>
                        {os.category && <span className="badge bg-steel-100 text-steel-600 text-xs">{os.category}</span>}
                        <span className="font-bold truncate">{os.title}</span>
                      </div>
                      <div className="text-sm text-steel-500 mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
                        {os.customer  && <span>👤 {os.customer.full_name}</span>}
                        {os.vehicle   && <span>🚗 {os.vehicle.plate} · {os.vehicle.make} {os.vehicle.model}</span>}
                        {os.mechanic  && <span>🔧 {os.mechanic.name}</span>}
                        {!os.mechanic && os.mechanic_name && <span>🔧 {os.mechanic_name}</span>}
                      </div>
                      <div className="text-xs text-steel-400 mt-1 flex flex-wrap gap-x-3">
                        <span>📅 {fmtDate(os.created_at)}</span>
                        {os.started_at && <span>▶ {fmtDateTime(os.started_at)}</span>}
                        {os.completed_at && (
                          <span>
                            ✓ {fmtDateTime(os.completed_at)}
                            {durationMin(os) !== null && ` · ⏱ ${fmtDur(durationMin(os)!)}`}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-lg font-bold font-display">R$ {os.price.toFixed(0)}</div>
                      <div className="text-xs text-steel-400">{fmtDate(os.created_at)}</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══════════ TAB: MECÂNICOS ══════════ */}
      {tab === 'mecanicos' && (
        <div className="space-y-4">

          {/* Performance breakdown */}
          {topMechs.length > 0 && (
            <div className="card">
              <h2 className="font-bold text-steel-800 mb-3">Performance por mecânico</h2>
              <div className="divide-y divide-steel-100">
                {topMechs.map(m => (
                  <div key={m.name} className="py-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-full bg-brand-500/10 grid place-items-center text-brand-600 font-bold shrink-0">
                        {m.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="font-semibold text-sm">{m.name}</div>
                        <div className="text-xs text-steel-500">{m.count} OS</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold font-display text-sm">R$ {m.revenue.toFixed(0)}</div>
                      <div className="text-xs text-steel-400">faturado</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Lista de mecânicos */}
          {internalMechs.length === 0 ? (
            <div className="card text-center py-14 text-steel-500">
              <p className="text-lg font-semibold">Nenhum mecânico cadastrado</p>
              <p className="text-sm mt-1">Adicione os mecânicos da sua equipe para vincular nas OS.</p>
              <button onClick={() => setModalMech(true)} className="btn-primary mt-4">+ Adicionar mecânico</button>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {internalMechs.map(m => (
                <div key={m.id} className="card flex items-center gap-4">
                  <div className="h-12 w-12 rounded-full bg-brand-500 grid place-items-center text-white font-bold text-lg shrink-0">
                    {m.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold truncate">{m.name}</div>
                    {m.specialty && <div className="text-xs text-steel-500">{m.specialty}</div>}
                    {m.phone     && <div className="text-xs text-steel-400">{m.phone}</div>}
                    <div className="text-xs text-steel-400 mt-0.5">
                      {(mechCount[m.id]?.count ?? 0)} OS · R$ {(mechCount[m.id]?.revenue ?? 0).toFixed(0)}
                    </div>
                  </div>
                  <button onClick={() => deactivateMech(m.id)}
                    className="text-steel-300 hover:text-alert-500 transition text-lg leading-none"
                    title="Remover">✕</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══════════ DETALHE DA OS ══════════ */}
      {detail && (
        <div className="fixed inset-0 bg-steel-900/60 grid place-items-center p-4 z-50"
          onClick={() => setDetail(null)}>
          <div onClick={e => e.stopPropagation()}
            className="card max-w-lg w-full space-y-4 max-h-[90vh] overflow-y-auto">

            <div className="flex items-start justify-between">
              <div>
                <div className="flex gap-2 flex-wrap mb-2">
                  <span className={`badge ${osColor(detail.status)}`}>{osLabel(detail.status)}</span>
                  {detail.category && <span className="badge bg-steel-100 text-steel-600">{detail.category}</span>}
                </div>
                <h2 className="text-xl font-bold">{detail.title}</h2>
              </div>
              <button onClick={() => setDetail(null)} className="text-steel-400 hover:text-steel-700 text-xl leading-none">✕</button>
            </div>

            {detail.description && (
              <p className="text-sm text-steel-600 bg-steel-50 rounded-xl p-3">{detail.description}</p>
            )}

            {/* Timeline */}
            <div className="bg-steel-50 rounded-xl p-4 space-y-2">
              <div className="text-xs font-bold text-steel-500 uppercase tracking-wider mb-2">Timeline</div>
              <TimelineRow label="Criada"    value={fmtDateTime(detail.created_at)} done />
              <TimelineRow label="Iniciada"  value={detail.started_at ? fmtDateTime(detail.started_at) : '—'} done={!!detail.started_at} />
              <TimelineRow label="Concluída" value={detail.completed_at ? fmtDateTime(detail.completed_at) : '—'} done={!!detail.completed_at} />
              {durationMin(detail) !== null && (
                <div className="pt-2 border-t border-steel-200">
                  <span className="text-xs text-steel-500">Duração total: </span>
                  <span className="text-sm font-bold text-brand-600">{fmtDur(durationMin(detail)!)}</span>
                </div>
              )}
            </div>

            {/* Info grid */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              {detail.customer && (
                <InfoCard label="Cliente" value={detail.customer.full_name} />
              )}
              {detail.vehicle && (
                <InfoCard label="Veículo" value={`${detail.vehicle.plate} · ${detail.vehicle.make} ${detail.vehicle.model}`} />
              )}
              {detail.mechanic && (
                <InfoCard label="Mecânico" value={detail.mechanic.name} sub={detail.mechanic.specialty ?? undefined} />
              )}
              <InfoCard label="Valor" value={`R$ ${detail.price.toFixed(2)}`} bold />
            </div>

            {/* Alterar status */}
            {detail.status !== 'completed' && detail.status !== 'cancelled' && (
              <div>
                <div className="label mb-2">Alterar status</div>
                <div className="flex gap-2 flex-wrap">
                  {detail.status === 'open' && (
                    <button onClick={() => updateStatus(detail, 'in_progress')}
                      className="btn-secondary text-sm flex items-center gap-1.5">
                      ▶ Iniciar (marca horário)
                    </button>
                  )}
                  {detail.status === 'in_progress' && (
                    <button onClick={() => updateStatus(detail, 'completed')}
                      className="btn-primary text-sm flex items-center gap-1.5">
                      ✓ Concluir (marca horário)
                    </button>
                  )}
                  <button onClick={() => updateStatus(detail, 'cancelled')}
                    className="btn-ghost text-sm text-alert-600 hover:bg-alert-50">
                    Cancelar OS
                  </button>
                </div>
              </div>
            )}

            {/* Avaliação final se concluída */}
            {detail.status === 'completed' && (
              <div className="bg-signal-50 border border-signal-200 rounded-xl p-3 text-sm text-signal-700 font-semibold flex items-center gap-2">
                <span>✓</span>
                <span>OS concluída · R$ {detail.price.toFixed(2)} · {durationMin(detail) !== null ? fmtDur(durationMin(detail)!) : 'tempo não registrado'}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════ MODAL NOVA OS ══════════ */}
      {modalOS && (
        <div className="fixed inset-0 bg-steel-900/60 grid place-items-center p-4 z-50"
          onClick={() => setModalOS(false)}>
          <form onSubmit={saveOS} onClick={e => e.stopPropagation()}
            className="card max-w-lg w-full space-y-4 max-h-[90vh] overflow-y-auto">

            <h2 className="text-xl font-bold sticky top-0 bg-white py-1">Nova Ordem de Serviço</h2>

            <div>
              <label className="label">Título do serviço *</label>
              <input className="input" required value={formOS.title}
                onChange={e => setFormOS(f => ({ ...f, title: e.target.value }))}
                placeholder="Ex.: Troca de correia dentada" />
            </div>

            <div>
              <label className="label">Categoria</label>
              <select className="input" value={formOS.category}
                onChange={e => setFormOS(f => ({ ...f, category: e.target.value }))}>
                <option value="">— Selecionar —</option>
                {OS_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div>
              <label className="label">Descrição / diagnóstico</label>
              <textarea className="input" rows={3} value={formOS.description}
                onChange={e => setFormOS(f => ({ ...f, description: e.target.value }))}
                placeholder="Descreva o problema, peças necessárias…" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Mecânico responsável</label>
                <select className="input" value={formOS.workshop_mechanic_id}
                  onChange={e => setFormOS(f => ({ ...f, workshop_mechanic_id: e.target.value }))}>
                  <option value="">— Selecionar —</option>
                  {internalMechs.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
                {internalMechs.length === 0 && (
                  <div className="text-xs text-steel-400 mt-1">
                    Nenhum mecânico cadastrado.{' '}
                    <button type="button" className="text-brand-500 underline"
                      onClick={() => { setModalOS(false); setTab('mecanicos'); setModalMech(true); }}>
                      Cadastrar agora
                    </button>
                  </div>
                )}
              </div>
              <div>
                <label className="label">Valor (R$)</label>
                <input className="input" type="number" min={0} step={0.01}
                  value={formOS.price}
                  onChange={e => setFormOS(f => ({ ...f, price: e.target.value }))}
                  placeholder="0,00" />
              </div>
            </div>

            <div>
              <label className="label">Cliente</label>
              <select className="input" value={formOS.customer_id}
                onChange={e => {
                  setFormOS(f => ({ ...f, customer_id: e.target.value, vehicle_id: '' }));
                  if (e.target.value) loadVehicles(e.target.value); else setVehicles([]);
                }}>
                <option value="">— Selecionar cliente —</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}
              </select>
            </div>

            {formOS.customer_id && (
              <div>
                <label className="label">Veículo</label>
                <select className="input" value={formOS.vehicle_id}
                  onChange={e => setFormOS(f => ({ ...f, vehicle_id: e.target.value }))}>
                  <option value="">— Selecionar veículo —</option>
                  {vehicles.map(v => <option key={v.id} value={v.id}>{v.plate} · {v.make} {v.model}</option>)}
                </select>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => { setModalOS(false); setVehicles([]); }}
                className="btn-ghost flex-1">Cancelar</button>
              <button className="btn-primary flex-1 btn-lg" disabled={saving}>
                {saving ? '…' : 'Criar OS'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ══════════ MODAL MECÂNICO ══════════ */}
      {modalMech && (
        <div className="fixed inset-0 bg-steel-900/60 grid place-items-center p-4 z-50"
          onClick={() => setModalMech(false)}>
          <form onSubmit={saveMech} onClick={e => e.stopPropagation()}
            className="card max-w-md w-full space-y-4">

            <h2 className="text-xl font-bold">Novo mecânico</h2>
            <p className="text-sm text-steel-500 -mt-2">Mecânicos internos da oficina, vinculados nas OS.</p>

            <div>
              <label className="label">Nome completo *</label>
              <input className="input" required value={formMech.name}
                onChange={e => setFormMech(f => ({ ...f, name: e.target.value }))}
                placeholder="João da Silva" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Telefone</label>
                <input className="input" value={formMech.phone}
                  onChange={e => setFormMech(f => ({ ...f, phone: e.target.value }))}
                  placeholder="(11) 9..." />
              </div>
              <div>
                <label className="label">Especialidade</label>
                <select className="input" value={formMech.specialty}
                  onChange={e => setFormMech(f => ({ ...f, specialty: e.target.value }))}>
                  <option value="">— Selecionar —</option>
                  {['Motor', 'Elétrica', 'Freios', 'Suspensão', 'Câmbio', 'Funilaria', 'Ar-condicionado', 'Geral'].map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setModalMech(false)} className="btn-ghost flex-1">Cancelar</button>
              <button className="btn-primary flex-1" disabled={saving}>{saving ? '…' : 'Cadastrar'}</button>
            </div>
          </form>
        </div>
      )}

    </WorkshopLayout>
  );
}

/* ─── sub-componentes ─────────────────────────────────────── */
function KPI({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="card">
      <div className="text-xs text-steel-500 uppercase tracking-wider">{label}</div>
      <div className={`text-2xl font-bold font-display mt-1 ${color ?? 'text-steel-800'}`}>{value}</div>
      {sub && <div className="text-xs text-steel-400 mt-0.5">{sub}</div>}
    </div>
  );
}

function TimelineRow({ label, value, done }: { label: string; value: string; done: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className={`h-5 w-5 rounded-full grid place-items-center text-xs shrink-0 ${
        done ? 'bg-signal-500 text-white' : 'bg-steel-200 text-steel-400'
      }`}>
        {done ? '✓' : '·'}
      </div>
      <div className="flex-1 flex justify-between text-sm">
        <span className={done ? 'font-semibold text-steel-700' : 'text-steel-400'}>{label}</span>
        <span className="text-steel-500">{value}</span>
      </div>
    </div>
  );
}

function InfoCard({ label, value, sub, bold }: { label: string; value: string; sub?: string; bold?: boolean }) {
  return (
    <div className="card !p-3">
      <div className="label">{label}</div>
      <div className={`${bold ? 'font-bold font-display text-lg' : 'font-semibold'} truncate`}>{value}</div>
      {sub && <div className="text-xs text-steel-500">{sub}</div>}
    </div>
  );
}
