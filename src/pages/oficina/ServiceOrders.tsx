import { useEffect, useState } from 'react';
import WorkshopLayout from '@/components/layout/WorkshopLayout';
import { supabase } from '@/lib/supabase';
import { fetchAll } from '@/lib/fetchAll';
import { useAuth } from '@/contexts/AuthContext';
import type {
  ServiceOrder, Customer, Vehicle,
  OsStatus, WorkshopMechanic, ServiceOrderPause,
} from '@/types/database';
import OsCardNew from '@/components/os/OsCard';
import LicensePlate from '@/components/os/LicensePlate';
import StatusChips from '@/components/os/StatusChips';
import EmptyState from '@/components/os/EmptyState';
import OsSkeleton from '@/components/os/OsSkeleton';
import { toast } from '@/components/ui/Toast';
import NewOsModal, { type NewOsPreset } from '@/components/os/NewOsModal';
import { OS_STATUS_FLOW, openPause, statusChange, workedMinutes } from '@/components/os/osHelpers';
import { useNavigate, useSearchParams } from 'react-router-dom';

/* ─── tipos locais ──────────────────────────────────────────── */
type OsRow = ServiceOrder & {
  customer: Customer | null;
  vehicle:  Vehicle  | null;
  mechanic: WorkshopMechanic | null;
  pauses?: ServiceOrderPause[];
};

type MainTab   = 'os' | 'agendados' | 'mecanicos';
type PeriodFilter = 'all' | 'today' | 'week' | 'month';

/* ─── constantes ────────────────────────────────────────────── */
const STATUSES: readonly OsStatus[] = OS_STATUS_FLOW;
/** Etapas antes de o serviço começar (agendadas aparecem na aba Agendados) */
const PRE_START: OsStatus[] = ['open', 'awaiting_approval', 'approved'];


/* ─── helpers ───────────────────────────────────────────────── */
/** Tempo trabalhado na OS concluída (descontando pausas, ex.: aguardando peça) */
function durationMin(os: OsRow): number | null {
  if (!os.started_at || !os.completed_at) return null;
  return workedMinutes(os.started_at, os.completed_at, os.pauses);
}
function fmtDur(min: number) {
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h}h ${m}min` : `${h}h`;
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', { day:'2-digit', month:'short', year:'numeric' });
}
function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' });
}
/* ══════════════════════════════════════════════════════════════
   Componente principal
══════════════════════════════════════════════════════════════ */
export default function ServiceOrders() {
  const { user, currentWorkshop } = useAuth();

  const shop = currentWorkshop;
  const [list, setList]                   = useState<OsRow[]>([]);
  const [internalMechs, setInternalMechs] = useState<WorkshopMechanic[]>([]);

  const [loading, setLoading]             = useState(true);
  const [tab, setTab]                     = useState<MainTab>('os');
  const [filterStatus, setFilterStatus]   = useState<OsStatus|'all'>('all');
  const [filterMech, setFilterMech]       = useState('all');
  const [filterPeriod, setFilterPeriod]   = useState<PeriodFilter>('all');
  const [search, setSearch]               = useState('');
  const [newOs, setNewOs]                 = useState<NewOsPreset | null>(null);
  /* ── links antigos (?os=<id>) → página da OS ── */
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const linkedOsId = searchParams.get('os');
  useEffect(() => {
    if (linkedOsId) nav(`/oficina/os/${linkedOsId}`, { replace: true });
  }, [linkedOsId, nav]);

  /* ── ?nova=1&cliente=<id>&veiculo=<id> → abre a Nova OS já com o cliente (ficha do cliente) ── */
  const newForCustomer = searchParams.get('nova') === '1' ? searchParams.get('cliente') : null;
  const newForVehicle = searchParams.get('veiculo');
  useEffect(() => {
    if (!newForCustomer) return;
    setNewOs({ customerId: newForCustomer, vehicleId: newForVehicle });
    nav('/oficina/os', { replace: true });
  }, [newForCustomer, newForVehicle, nav]);

  const openOs = (os: OsRow) => nav(`/oficina/os/${os.id}`);

  /* ── persistência de filtros (localStorage por oficina) ── */
  const prefsKey = currentWorkshop ? `os-prefs:${currentWorkshop.id}` : null;
  useEffect(() => {
    if (!prefsKey) return;
    try {
      const raw = localStorage.getItem(prefsKey);
      if (raw) {
        const p = JSON.parse(raw);
        if (p.filterStatus) setFilterStatus(p.filterStatus);
        if (p.filterMech)   setFilterMech(p.filterMech);
        if (p.filterPeriod) setFilterPeriod(p.filterPeriod);
      }
    } catch { /* ignore */ }
    // só ao carregar a oficina
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefsKey]);

  useEffect(() => {
    if (!prefsKey) return;
    try {
      localStorage.setItem(prefsKey, JSON.stringify({ filterStatus, filterMech, filterPeriod }));
    } catch { /* ignore */ }
  }, [prefsKey, filterStatus, filterMech, filterPeriod]);

  useEffect(() => {
    if (!user || !currentWorkshop) return;
    setLoading(true);
    Promise.all([
      fetchOS(currentWorkshop.id),
      fetchMechs(currentWorkshop.id),
    ]).finally(() => setLoading(false));
  }, [user, currentWorkshop?.id]);

  async function fetchOS(wid: string) {
    // Em páginas: o Supabase devolve no máximo 1000 linhas por consulta
    const { data } = await fetchAll((a, b) => supabase
      .from('service_orders')
      .select('*, customer:customers(*), vehicle:vehicles(*), mechanic:workshop_mechanics!fk_so_workshop_mechanic(*), pauses:service_order_pauses(*)')
      .eq('workshop_id', wid)
      .order('created_at', { ascending: false }).order('id')
      .range(a, b));
    setList((data as OsRow[]) ?? []);
  }
  async function fetchMechs(wid: string) {
    const { data } = await supabase
      .from('workshop_mechanics').select('*').eq('workshop_id', wid).eq('active', true).order('name');
    setInternalMechs((data as WorkshopMechanic[]) ?? []);
  }
  /* ── equipe: cadastro completo fica em /oficina/equipe ── */
  function openNewMech() { nav('/oficina/equipe/novo'); }
  function openEditMech(m: WorkshopMechanic) { nav(`/oficina/equipe/${m.id}`); }
  async function deactivateMech(id: string) {
    if (!confirm('Remover mecânico da lista?')) return;
    const { error } = await supabase.from('workshop_mechanics')
      .update({ active: false, status: 'terminated', terminated_at: new Date().toISOString().slice(0, 10) }).eq('id', id);
    if (error) {
      console.error('[deactivateMech] erro:', error);
      toast.error(error.message || 'Não foi possível remover o mecânico');
      return;
    }
    setInternalMechs(prev => prev.filter(m => m.id !== id));
    toast.success('Mecânico removido');
  }

  /* ── status ── */
  async function updateStatus(os: OsRow, status: OsStatus, opts: { channel?: string; declined?: boolean } = {}) {
    if (status === 'cancelled' && !opts.declined && !confirm('Cancelar esta OS?')) return;
    const { patch, message } = statusChange(os, status, opts);
    // Concluir/cancelar com o serviço pausado: encerra a pausa no mesmo momento
    let pauses = os.pauses;
    if ((status === 'completed' || status === 'cancelled') && openPause(os.pauses)) {
      const endedAt = new Date().toISOString();
      await supabase.from('service_order_pauses').update({ ended_at: endedAt })
        .eq('service_order_id', os.id).is('ended_at', null);
      pauses = os.pauses?.map(p => p.ended_at ? p : { ...p, ended_at: endedAt });
    }
    const { error } = await supabase.from('service_orders').update(patch).eq('id', os.id);
    if (error) {
      toast.error('Erro ao atualizar a situação: ' + error.message);
      return;
    }
    setList(prev => prev.map(o => o.id === os.id ? { ...o, ...patch, pauses } as OsRow : o));
    toast.success(message);
  }

  /* ── copiar link da OS ── */
  function copyOsLink(os: OsRow) {
    const url = `${window.location.origin}/oficina/os/${os.id}`;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(url)
        .then(() => toast.success('Link copiado — abre esta OS para quem estiver logado na oficina'))
        .catch(() => toast.error('Não foi possível copiar o link'));
    } else {
      toast.info(url);
    }
  }

  /* ─── analytics ──────────────────────────────────────────── */
  const now          = new Date();
  const completed    = list.filter(o => o.status === 'completed');
  const revenue      = completed.reduce((a, o) => a + o.price, 0);
  const thisMonth    = completed.filter(o =>
    new Date(o.completed_at!).getMonth() === now.getMonth() &&
    new Date(o.completed_at!).getFullYear() === now.getFullYear()
  );
  const revenueMonth = thisMonth.reduce((a, o) => a + o.price, 0);

  const catMap: Record<string, { count: number; revenue: number; durations: number[] }> = {};
  list.forEach(o => {
    const cat = o.category || 'Sem categoria';
    if (!catMap[cat]) catMap[cat] = { count: 0, revenue: 0, durations: [] };
    catMap[cat].count++;
    if (o.status === 'completed') catMap[cat].revenue += o.price;
    const d = durationMin(o); if (d !== null) catMap[cat].durations.push(d);
  });
  const topCats  = Object.entries(catMap).sort((a, b) => b[1].count - a[1].count).slice(0, 6);
  const maxCount = topCats[0]?.[1].count ?? 1;

  const mechMap: Record<string, { name: string; count: number; revenue: number; durations: number[] }> = {};
  list.forEach(o => {
    if (!o.mechanic) return;
    const id = o.mechanic.id;
    if (!mechMap[id]) mechMap[id] = { name: o.mechanic.name, count: 0, revenue: 0, durations: [] };
    mechMap[id].count++;
    if (o.status === 'completed') mechMap[id].revenue += o.price;
    const d = durationMin(o); if (d !== null) mechMap[id].durations.push(d);
  });
  const topMechs = Object.values(mechMap).sort((a, b) => b.count - a.count);

  const allDurs = completed.map(durationMin).filter((d): d is number => d !== null);
  const avgDur  = allDurs.length ? Math.round(allDurs.reduce((a,b) => a+b,0) / allDurs.length) : null;

  /* ─── listas filtradas ───────────────────────────────────── */
  const periodCutoff = (() => {
    if (filterPeriod === 'all') return null;
    const d = new Date();
    if (filterPeriod === 'today') { d.setHours(0, 0, 0, 0); return d.getTime(); }
    if (filterPeriod === 'week')  { d.setDate(d.getDate() - 7);   return d.getTime(); }
    if (filterPeriod === 'month') { d.setMonth(d.getMonth() - 1); return d.getTime(); }
    return null;
  })();

  // Período: a OS entra se foi aberta, concluída ou paga dentro dele
  const inPeriod = (o: OsRow) => periodCutoff === null
    || [o.created_at, o.completed_at, o.paid_at].some(d => d && new Date(d).getTime() >= periodCutoff);

  // Filtros de período, mecânico e busca (sem o de status) — os contadores dos chips usam esta base
  const base = list.filter(o => {
    if (filterMech !== 'all' && (o.workshop_mechanic_id ?? 'none') !== filterMech) return false;
    if (!inPeriod(o)) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        o.title.toLowerCase().includes(q) ||
        (o.number != null && (String(o.number) === q.replace(/^0+/, '') || String(o.number).padStart(4, '0').includes(q))) ||
        (o.customer?.full_name ?? '').toLowerCase().includes(q) ||
        (o.vehicle?.plate ?? '').toLowerCase().includes(q) ||
        (o.mechanic?.name ?? '').toLowerCase().includes(q)
      );
    }
    return true;
  });
  const filtered = filterStatus === 'all' ? base : base.filter(o => o.status === filterStatus);

  const agendados = list
    .filter(o => o.scheduled_at && PRE_START.includes(o.status))
    .sort((a, b) => new Date(a.scheduled_at!).getTime() - new Date(b.scheduled_at!).getTime());

  const counts  = STATUSES.reduce((acc, s) => ({ ...acc, [s]: base.filter(o => o.status === s).length }), {} as Record<string, number>);
  const osCount = list.filter(o => !o.scheduled_at || !PRE_START.includes(o.status)).length;

  /* ══════════════════════════════════════════════ RENDER ══ */
  return (
    <WorkshopLayout>

      {/* Cabeçalho */}
      <div className="flex flex-wrap justify-between items-start gap-3 mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Ordens de Serviço</h1>
          <p className="text-sm text-steel-500 mt-1">{list.length} OS cadastradas</p>
        </div>
        <button onClick={() => tab === 'mecanicos' ? openNewMech() : setNewOs(tab === 'agendados' ? { schedule: true } : {})} className="btn-primary">
          {tab === 'mecanicos' ? '+ Mecânico' : '+ Nova OS'}
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <KPI label="Faturamento total" value={`R$ ${revenue.toLocaleString('pt-BR',{minimumFractionDigits:2})}`}      sub={`${completed.length} concluídas`} color="text-signal-600" />
        <KPI label="Este mês"          value={`R$ ${revenueMonth.toLocaleString('pt-BR',{minimumFractionDigits:2})}`} sub={`${thisMonth.length} OS`}         color="text-brand-600" />
        <KPI label="Tempo médio"       value={avgDur !== null ? fmtDur(avgDur) : '—'}                                  sub="por OS concluída" />
        <KPI label="Equipe ativa"      value={internalMechs.length}                                                    sub="mecânicos" />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-steel-100 rounded-xl p-1">
        {([
          { key: 'os',        label: `📋 OS (${osCount})` },
          { key: 'agendados', label: `📅 Agendados (${agendados.length})` },
          { key: 'mecanicos', label: `🔧 Equipe (${internalMechs.length})` },
        ] as { key: MainTab; label: string }[]).map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex-1 rounded-lg py-2 text-sm font-semibold transition ${
              tab === t.key ? 'bg-white shadow text-steel-900' : 'text-steel-500 hover:text-steel-700'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ══ TAB: OS ══ */}
      {tab === 'os' && (
        <div className="space-y-5">

          {/* ── Banner Check-up Gratuito ── */}
          <div className="rounded-2xl overflow-hidden border border-signal-200 bg-gradient-to-r from-signal-50 to-brand-50">
            <div className="px-5 py-4 flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <div className="text-4xl shrink-0">🎁</div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-steel-800 text-base">Check-up Gratuito — Estratégia de captação</div>
                <p className="text-sm text-steel-500 mt-0.5">
                  Ofereça uma avaliação gratuita do veículo para atrair novos clientes.
                  Pode ser executado por mecânico interno ou profissional do marketplace.
                </p>
              </div>
              <div className="flex gap-2 shrink-0 flex-wrap">
                <button onClick={() => setNewOs({ title: 'Check-up gratuito', category: 'Check-up', free: true })}
                  className="btn-primary text-sm !py-2 !px-4">
                  ⚡ Agora
                </button>
                <button onClick={() => setNewOs({ title: 'Check-up gratuito', category: 'Check-up', free: true, schedule: true })}
                  className="btn-secondary text-sm !py-2 !px-4">
                  📅 Agendar
                </button>
              </div>
            </div>
          </div>

          {topCats.length > 0 && (
            <div className="card">
              <h2 className="font-bold text-steel-800 mb-4">Serviços mais realizados</h2>
              <div className="space-y-3">
                {topCats.map(([cat, info]) => {
                  const avgD = info.durations.length ? Math.round(info.durations.reduce((a,b)=>a+b,0)/info.durations.length) : null;
                  return (
                    <div key={cat}>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-semibold truncate">{cat}</span>
                          {avgD !== null && <span className="text-xs text-steel-400 whitespace-nowrap">⏱ {fmtDur(avgD)}</span>}
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          {info.revenue > 0 && <span className="text-xs text-signal-600 font-semibold">R$ {info.revenue.toLocaleString('pt-BR',{minimumFractionDigits:2})}</span>}
                          <span className="text-xs font-bold text-steel-700 w-8 text-right">{info.count}×</span>
                        </div>
                      </div>
                      <div className="h-2 bg-steel-100 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-brand-500 to-brand-400 rounded-full transition-all duration-700"
                          style={{ width: `${(info.count / maxCount) * 100}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="space-y-3">
            <StatusChips
              value={filterStatus}
              counts={counts}
              total={base.length}
              onChange={setFilterStatus}
            />
            <div className="flex flex-wrap gap-2 items-center">
              <div className="relative flex-1 min-w-[200px] max-w-md">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-steel-400 text-sm">🔍</span>
                <input
                  className="input pl-9 text-sm"
                  placeholder="Buscar OS, cliente, placa, mecânico…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
              <select
                className="input max-w-[140px] text-sm"
                value={filterPeriod}
                onChange={e => setFilterPeriod(e.target.value as PeriodFilter)}
              >
                <option value="all">Todo período</option>
                <option value="today">Hoje</option>
                <option value="week">Última semana</option>
                <option value="month">Último mês</option>
              </select>
              {internalMechs.length > 0 && (
                <select className="input max-w-[180px] text-sm" value={filterMech}
                  onChange={e => setFilterMech(e.target.value)}>
                  <option value="all">Todos mecânicos</option>
                  <option value="none">Sem mecânico</option>
                  {internalMechs.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              )}
              {(filterStatus !== 'all' || filterMech !== 'all' || filterPeriod !== 'all' || search) && (
                <button
                  type="button"
                  onClick={() => { setFilterStatus('all'); setFilterMech('all'); setFilterPeriod('all'); setSearch(''); }}
                  className="text-xs font-semibold text-steel-500 hover:text-steel-800 underline"
                >
                  Limpar filtros
                </button>
              )}
            </div>
          </div>

          {loading ? (
            <OsSkeleton count={3} />
          ) : filtered.length === 0 ? (
            list.length === 0 ? (
              <EmptyState
                icon="📋"
                title="Nenhuma OS ainda"
                description="Crie a sua primeira ordem de serviço ou ofereça um check-up gratuito para captar clientes."
                actions={
                  <>
                    <button onClick={() => setNewOs({})} className="btn-primary text-sm !py-2">+ Nova OS</button>
                    <button onClick={() => setNewOs({ title: 'Check-up gratuito', category: 'Check-up', free: true })} className="btn-ghost text-sm !py-2 border border-steel-200">🎁 Check-up gratuito</button>
                  </>
                }
              />
            ) : (
              <EmptyState
                icon="🔎"
                title="Nenhuma OS com esses filtros"
                description="Ajuste a busca ou limpe os filtros para ver mais resultados."
                actions={
                  <button
                    onClick={() => { setFilterStatus('all'); setFilterMech('all'); setFilterPeriod('all'); setSearch(''); }}
                    className="btn-ghost text-sm !py-2 border border-steel-200"
                  >
                    Limpar filtros
                  </button>
                }
              />
            )
          ) : (
            <div className="space-y-2">
              {filtered.map(os => (
                <OsCardNew
                  key={os.id}
                  os={os}
                  onClick={() => openOs(os)}
                  onChangeStatus={(status, opts) => updateStatus(os, status, opts)}
                  onCopyLink={() => copyOsLink(os)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══ TAB: AGENDADOS ══ */}
      {tab === 'agendados' && (
        <div className="space-y-4">
          {agendados.length === 0 ? (
            <div className="card text-center text-steel-500 py-16">
              <div className="text-4xl mb-3">📅</div>
              <p className="text-lg font-semibold">Nenhum serviço agendado</p>
              <p className="text-sm mt-1">Ao criar uma OS, escolha "Agendar para uma data".</p>
              <button onClick={() => setNewOs({ schedule: true })} className="btn-primary mt-5">+ Agendar OS</button>
            </div>
          ) : (
            <>
              <p className="text-sm text-steel-500">{agendados.length} serviço{agendados.length !== 1 ? 's' : ''} agendado{agendados.length !== 1 ? 's' : ''}</p>
              <div className="space-y-3">
                {agendados.map(os => {
                  const d      = new Date(os.scheduled_at!);
                  const isToday = d.toDateString() === now.toDateString();
                  const isPast  = d < now;
                  return (
                    <button key={os.id} onClick={() => openOs(os)}
                      className="card w-full text-left hover:shadow-md transition hover:-translate-y-0.5">
                      <div className="flex items-start gap-4">
                        <div className={`shrink-0 rounded-xl px-3 py-2 text-center min-w-[56px] ${
                          isPast ? 'bg-alert-50 border border-alert-200' :
                          isToday ? 'bg-brand-50 border border-brand-200' :
                          'bg-steel-50 border border-steel-200'
                        }`}>
                          <div className={`text-xs font-bold uppercase ${isPast ? 'text-alert-600' : isToday ? 'text-brand-600' : 'text-steel-500'}`}>
                            {d.toLocaleDateString('pt-BR', { month: 'short' })}
                          </div>
                          <div className={`text-2xl font-bold leading-tight font-display ${isPast ? 'text-alert-700' : isToday ? 'text-brand-700' : 'text-steel-800'}`}>
                            {d.getDate()}
                          </div>
                          <div className={`text-[10px] font-semibold ${isPast ? 'text-alert-500' : isToday ? 'text-brand-500' : 'text-steel-400'}`}>
                            {d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            {isPast  && <span className="badge bg-alert-100 text-alert-700 text-xs">Atrasado</span>}
                            {isToday && !isPast && <span className="badge bg-brand-100 text-brand-700 text-xs">Hoje</span>}
                            <span className="font-bold truncate">{os.title}</span>
                          </div>
                          <div className="text-xs text-steel-500 mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                            {os.vehicle && <LicensePlate plate={os.vehicle.plate} size="sm" />}
                            {os.customer  && <span>👤 {os.customer.full_name}</span>}
                            {os.vehicle   && <span>🚗 {os.vehicle.make} {os.vehicle.model}</span>}
                            {os.mechanic  && <span>🔧 {os.mechanic.name}</span>}
                            {os.estimated_hours && <span>⏱ {os.estimated_hours}h estimadas</span>}
                          </div>
                          {os.category && <span className="badge bg-steel-100 text-steel-600 text-xs mt-2">{os.category}</span>}
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-lg font-bold font-display">R$ {os.price.toLocaleString('pt-BR',{minimumFractionDigits:2})}</div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* ══ TAB: EQUIPE ══ */}
      {tab === 'mecanicos' && (
        <div className="space-y-4">
          {topMechs.length > 0 && (
            <div className="card">
              <h2 className="font-bold text-steel-800 mb-3">Performance da equipe</h2>
              <div className="divide-y divide-steel-100">
                {topMechs.map(m => {
                  const avgD = m.durations.length ? Math.round(m.durations.reduce((a,b)=>a+b,0)/m.durations.length) : null;
                  return (
                    <div key={m.name} className="py-3 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-full bg-brand-500/10 grid place-items-center text-brand-600 font-bold shrink-0">
                          {m.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-semibold text-sm">{m.name}</div>
                          <div className="text-xs text-steel-500">{m.count} OS {avgD !== null && `· ⏱ ${fmtDur(avgD)} em média`}</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold font-display text-sm">R$ {m.revenue.toLocaleString('pt-BR',{minimumFractionDigits:2})}</div>
                        <div className="text-xs text-steel-400">faturado</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {internalMechs.length === 0 ? (
            <div className="card text-center py-14 text-steel-500">
              <p className="text-lg font-semibold">Nenhum mecânico cadastrado</p>
              <p className="text-sm mt-1">Adicione a equipe para vincular nas OS e medir performance.</p>
              <button onClick={openNewMech} className="btn-primary mt-4">+ Adicionar mecânico</button>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {internalMechs.map(m => (
                <div key={m.id} className="card">
                  <div className="flex items-start gap-3">
                    <div className="h-12 w-12 rounded-full bg-brand-500 grid place-items-center text-white font-bold text-lg shrink-0">
                      {m.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold truncate">{m.name}</div>
                      {m.specialty && <div className="text-xs text-steel-500 mt-0.5">{m.specialty}</div>}
                      <div className="text-xs text-steel-400 mt-0.5">{(mechMap[m.id]?.count ?? 0)} OS realizadas</div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button onClick={() => openEditMech(m)} className="h-7 w-7 rounded-lg bg-steel-100 hover:bg-steel-200 grid place-items-center text-steel-500 hover:text-steel-700 transition text-xs">✏️</button>
                      <button onClick={() => deactivateMech(m.id)} className="h-7 w-7 rounded-lg bg-steel-100 hover:bg-alert-100 grid place-items-center text-steel-400 hover:text-alert-600 transition text-xs">✕</button>
                    </div>
                  </div>
                  {m.skills.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-3">
                      {m.skills.map(s => (
                        <span key={s} className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-brand-50 text-brand-600 border border-brand-100">{s}</span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══ NOVA OS (rápida, pela placa) ══ */}
      {newOs && shop && (
        <NewOsModal
          workshopId={shop.id}
          preset={newOs}
          onClose={() => setNewOs(null)}
          onManageTeam={() => { setNewOs(null); openNewMech(); }}
          onCreated={(id, number) => {
            setNewOs(null);
            toast.success(`OS nº ${String(number ?? '').padStart(4, '0')} aberta ✓ — lance as peças e serviços`);
            nav(`/oficina/os/${id}`);
          }}
        />
      )}

    </WorkshopLayout>
  );
}

/* ─── sub-componentes ─────────────────────────────────────── */
function KPI({ label, value, sub, color }: { label: string; value: string|number; sub?: string; color?: string }) {
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
      <div className={`h-5 w-5 rounded-full grid place-items-center text-xs shrink-0 ${done ? 'bg-signal-500 text-white' : 'bg-steel-200 text-steel-400'}`}>
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
