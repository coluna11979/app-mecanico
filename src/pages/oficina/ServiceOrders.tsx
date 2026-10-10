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
import OsBoard from '@/components/os/OsBoard';
import StatusChips from '@/components/os/StatusChips';
import EmptyState from '@/components/os/EmptyState';
import OsSkeleton from '@/components/os/OsSkeleton';
import { toast } from '@/components/ui/Toast';
import NewOsModal, { type NewOsPreset } from '@/components/os/NewOsModal';
import { OS_STATUS_FLOW, openPause, statusChange } from '@/components/os/osHelpers';
import { sessionAllows, useOperator } from '@/lib/operators';
import { useCheckupAccess } from '@/lib/checkupAccess';
import { MyCommissionSummary, useMyCommission } from '@/components/os/MyCommission';
import { useNavigate, useSearchParams } from 'react-router-dom';

/* ─── tipos locais ──────────────────────────────────────────── */
type OsRow = ServiceOrder & {
  customer: Customer | null;
  vehicle:  Vehicle  | null;
  mechanic: WorkshopMechanic | null;
  pauses?: ServiceOrderPause[];
};

type PeriodFilter = 'all' | 'today' | 'yesterday' | 'week' | 'month' | 'custom';
const PERIODS: [PeriodFilter, string][] = [
  ['all', 'Todo período'], ['today', 'Hoje'], ['yesterday', 'Ontem'], ['week', '7 dias'], ['month', '30 dias'], ['custom', '📅 Escolher datas'],
];
const PERIOD_LABEL: Record<PeriodFilter, string> = Object.fromEntries(PERIODS) as Record<PeriodFilter, string>;

/** Período escolhido → [início, fim) em ms; null = sem limite */
/** Lista enxuta: só o que os cartões e o quadro mostram (economiza dados do Supabase) */
const OS_LIST_COLS = 'id, workshop_id, vehicle_id, customer_id, workshop_mechanic_id, executor, title, category, status, price, '
  + 'created_at, started_at, completed_at, scheduled_at, estimated_hours, km_reading, parts_cost, labor_cost, number, '
  + 'quote_status, approval_requested_at, approved_at, rework_of_id, paid_amount, counter_discount, paid_at, pay_later_due, '
  + 'customer:customers(id, full_name, phone), vehicle:vehicles(id, plate, make, model, year), '
  + 'mechanic:workshop_mechanics!fk_so_workshop_mechanic(id, name, photo_url), pauses:service_order_pauses(id, reason, started_at, ended_at)';
const ACTIVE_STATUSES = ['open', 'awaiting_approval', 'approved', 'in_progress'];
const RECENT_DAYS = 120;

function periodRange(p: PeriodFilter, from: string, to: string): [number | null, number | null] {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const t = today.getTime(), day = 86400000;
  if (p === 'today') return [t, null];
  if (p === 'yesterday') return [t - day, t];
  if (p === 'week') return [t - 6 * day, null];
  if (p === 'month') return [t - 29 * day, null];
  if (p === 'custom') return [
    from ? new Date(`${from}T00:00:00`).getTime() : null,
    to ? new Date(`${to}T00:00:00`).getTime() + day : null,
  ];
  return [null, null];
}

/* ─── constantes ────────────────────────────────────────────── */
const STATUSES: readonly OsStatus[] = OS_STATUS_FLOW;
/** Etapas antes de o serviço começar (filtro "Agendadas") */
const PRE_START: OsStatus[] = ['open', 'awaiting_approval', 'approved'];


/* ══════════════════════════════════════════════════════════════
   Componente principal
══════════════════════════════════════════════════════════════ */
export default function ServiceOrders() {
  const { user, currentWorkshop } = useAuth();

  const shop = currentWorkshop;
  const [list, setList]                   = useState<OsRow[]>([]);
  const [internalMechs, setInternalMechs] = useState<WorkshopMechanic[]>([]);

  const [loading, setLoading]             = useState(true);
  const [filterStatus, setFilterStatus]   = useState<OsStatus|'all'>('all');
  const [filterMech, setFilterMech]       = useState('all');
  const [filterPeriod, setFilterPeriod]   = useState<PeriodFilter>('all');
  const [periodFrom, setPeriodFrom]       = useState('');
  const [periodTo, setPeriodTo]           = useState('');
  const [search, setSearch]               = useState('');
  /** OS antigas (concluídas/canceladas há mais de RECENT_DAYS dias) só carregam quando precisa */
  const [allLoaded, setAllLoaded]         = useState(false);
  const [loadingOlder, setLoadingOlder]   = useState(false);
  const [onlyScheduled, setOnlyScheduled] = useState(false);
  const [showFilters, setShowFilters]     = useState(false);
  // Lista ou quadro em colunas (só no computador); fica guardado no aparelho
  const [view, setViewState] = useState<'lista' | 'colunas'>(() => {
    try { return localStorage.getItem('os_view') === 'colunas' ? 'colunas' : 'lista'; } catch { return 'lista'; }
  });
  const setView = (v: 'lista' | 'colunas') => { setViewState(v); try { localStorage.setItem('os_view', v); } catch { /* sem localStorage */ } };   // celular: período e responsável ficam atrás de "Filtros"
  const op = useOperator();
  // Mecânico (PIN): só as OS dele (responsável ou que fez algum serviço), sem valores e sem ações comerciais
  const access = useCheckupAccess();
  const mech = access.isMechanic;
  const [myOsIds, setMyOsIds] = useState<Set<string> | null>(null);
  // Comissão dele (só leitura)
  const myComm = useMyCommission(currentWorkshop?.id, mech ? access.mechanicId : null);
  const canOpen = (path: string) => !op.balcao || !op.session || sessionAllows(op.session, path);
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
  // Mecânico tem os filtros dele (não herda os do gestor no mesmo aparelho)
  const prefsKey = currentWorkshop ? `os-prefs:${currentWorkshop.id}${mech ? ':mecanico' : ''}` : null;
  useEffect(() => {
    if (!prefsKey) return;
    try {
      const raw = localStorage.getItem(prefsKey);
      if (raw) {
        const p = JSON.parse(raw);
        if (p.filterStatus) setFilterStatus(p.filterStatus);
        if (p.filterMech)   setFilterMech(p.filterMech);
        if (p.filterPeriod && PERIOD_LABEL[p.filterPeriod as PeriodFilter]) setFilterPeriod(p.filterPeriod);
        if (typeof p.onlyScheduled === 'boolean') setOnlyScheduled(p.onlyScheduled);
      }
    } catch { /* ignore */ }
    // só ao carregar a oficina
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefsKey]);

  useEffect(() => {
    if (!prefsKey) return;
    try {
      localStorage.setItem(prefsKey, JSON.stringify({ filterStatus, filterMech, filterPeriod, onlyScheduled }));
    } catch { /* ignore */ }
  }, [prefsKey, filterStatus, filterMech, filterPeriod, onlyScheduled]);

  // OS em que o mecânico fez algum serviço (sem ser o responsável da OS)
  useEffect(() => {
    if (!mech || !access.mechanicId) { setMyOsIds(null); return; }
    supabase.from('service_order_items').select('service_order_id').eq('workshop_mechanic_id', access.mechanicId)
      .then(({ data }) => setMyOsIds(new Set(((data ?? []) as { service_order_id: string }[]).map(r => r.service_order_id))));
  }, [mech, access.mechanicId]);

  useEffect(() => {
    if (!user || !currentWorkshop) return;
    setLoading(true);
    Promise.all([
      fetchOS(currentWorkshop.id),
      fetchMechs(currentWorkshop.id),
    ]).finally(() => setLoading(false));
  }, [user, currentWorkshop?.id]);

  /** Só abertas + últimos RECENT_DAYS dias; as antigas vêm sob demanda (busca, período antigo ou botão) */
  async function fetchOS(wid: string, all = false) {
    // Em páginas: o Supabase devolve no máximo 1000 linhas por consulta
    const page = (from: number, to: number, filter: 'active' | 'recent' | 'all') => {
      let q = supabase.from('service_orders').select(OS_LIST_COLS).eq('workshop_id', wid);
      if (filter === 'active') q = q.in('status', ACTIVE_STATUSES);
      else if (filter === 'recent') {
        const since = new Date(Date.now() - RECENT_DAYS * 86400000).toISOString();
        q = q.not('status', 'in', `(${ACTIVE_STATUSES.join(',')})`)
          .or(`created_at.gte.${since},completed_at.gte.${since},paid_at.gte.${since}`);
      }
      return q.order('created_at', { ascending: false }).order('id').range(from, to);
    };
    const parts = all
      ? [await fetchAll((a, b) => page(a, b, 'all'))]
      : await Promise.all([fetchAll((a, b) => page(a, b, 'active')), fetchAll((a, b) => page(a, b, 'recent'))]);
    const rows = parts.flatMap(r => (r.data as unknown as OsRow[]) ?? []);
    rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
    setList(rows);
    setAllLoaded(all);
  }
  async function loadOlder() {
    if (allLoaded || loadingOlder || !currentWorkshop) return;
    setLoadingOlder(true);
    await fetchOS(currentWorkshop.id, true);
    setLoadingOlder(false);
  }
  async function fetchMechs(wid: string) {
    const { data } = await supabase
      .from('workshop_mechanics').select('*').eq('workshop_id', wid).eq('active', true).order('name');
    setInternalMechs((data as WorkshopMechanic[]) ?? []);
  }
  /* ── equipe: o cadastro fica em /oficina/equipe (a Nova OS leva para lá) ── */
  function openNewMech() { nav('/oficina/equipe/novo'); }

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

  /* ─── período ─── */
  const [pStart, pEnd] = periodRange(filterPeriod, periodFrom, periodTo);
  // Buscou algo ou escolheu um período antigo: traz também as OS antigas
  const needsOlder = search.trim().length >= 2
    || (pStart !== null && pStart < Date.now() - RECENT_DAYS * 86400000);
  useEffect(() => { if (needsOlder) loadOlder(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsOlder]);
  // A OS entra se foi aberta, concluída ou paga dentro do período
  const inPeriod = (o: OsRow) => (pStart === null && pEnd === null)
    || [o.created_at, o.completed_at, o.paid_at].some(d => {
      if (!d) return false;
      const x = new Date(d).getTime();
      return (pStart === null || x >= pStart) && (pEnd === null || x < pEnd);
    });
  /* ─── listas filtradas ───────────────────────────────────── */
  // Filtros de período, mecânico e busca (sem o de status) — os contadores dos chips usam esta base
  const mine = (o: OsRow) => !!access.mechanicId
    && o.status !== 'cancelled'
    && (o.workshop_mechanic_id === access.mechanicId || !!myOsIds?.has(o.id));
  const base = list.filter(o => {
    if (mech) { if (!mine(o)) return false; }
    else if (filterMech !== 'all') {
      const who = o.executor === 'platform' ? 'platform' : o.workshop_mechanic_id ?? 'none';
      if (who !== filterMech) return false;
    }
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
  const isScheduled = (o: OsRow) => !!o.scheduled_at && PRE_START.includes(o.status);
  const scheduledCount = base.filter(isScheduled).length;
  const byStatus = filterStatus === 'all' ? base : base.filter(o => o.status === filterStatus);
  // Agendadas: só as que ainda não começaram, da mais próxima para a mais distante
  const filtered = onlyScheduled
    ? byStatus.filter(isScheduled).sort((a, b) => a.scheduled_at!.localeCompare(b.scheduled_at!))
    : byStatus;

  const counts  = STATUSES.reduce((acc, s) => ({ ...acc, [s]: base.filter(o => o.status === s).length }), {} as Record<string, number>);
  const otherFilters = filterStatus !== 'all' || filterMech !== 'all' || filterPeriod !== 'all' || !!search;
  const hasFilters = otherFilters || onlyScheduled;
  function clearFilters() {
    setFilterStatus('all'); setFilterMech('all'); setFilterPeriod('all');
    setPeriodFrom(''); setPeriodTo(''); setSearch(''); setOnlyScheduled(false);
  }

  /* ══════════════════════════════════════════════ RENDER ══ */
  return (
    <WorkshopLayout>

      {/* Cabeçalho */}
      <div className="flex flex-wrap justify-between items-center gap-x-3 gap-y-2 mb-5">
        <div className="min-w-0">
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight leading-tight">{mech ? 'Minhas OS' : 'Ordens de serviço'}</h1>
          <p className="text-sm text-steel-500">
            {mech ? `${list.filter(mine).length} OS suas` : allLoaded ? `${list.length} OS cadastradas` : `${list.length} OS · abertas e dos últimos ${RECENT_DAYS} dias`}
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <div className="hidden md:flex rounded-xl border border-steel-200 bg-white p-0.5">
            {(['lista', 'colunas'] as const).map(v => (
              <button key={v} type="button" onClick={() => setView(v)}
                className={`px-3 py-1.5 rounded-lg text-sm font-semibold ${view === v ? 'bg-steel-900 text-white' : 'text-steel-600 hover:bg-steel-50'}`}>
                {v === 'lista' ? '☰ Lista' : '▥ Colunas'}
              </button>
            ))}
          </div>
          {canOpen('/oficina/agenda') && (
            <button onClick={() => nav('/oficina/agenda')} className="btn-secondary !py-2 !px-4 text-sm">📅 Agenda</button>
          )}
          {!mech && <button onClick={() => setNewOs({})} className="btn-primary !py-2 !px-4 text-sm">+ Nova OS</button>}
        </div>
      </div>

      {mech && access.mechanicId && <MyCommissionSummary c={myComm} />}

      {mech && access.ready && !access.mechanicId && (
        <div className="card !py-3 mb-4 bg-pending-50 border-pending-200 text-sm text-steel-700">
          Seu acesso ainda não está ligado ao seu nome na Equipe. Peça ao gestor para ligar em <strong>Acessos e funções</strong> —
          aí aparecem aqui as suas OS.
        </div>
      )}

      <div className="space-y-4">
        {/* Busca + situação */}
        <div className="space-y-3">
          <div className="flex gap-2 items-center">
            <div className="relative flex-1 min-w-0 lg:max-w-md">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-steel-400 text-sm">🔍</span>
              <input
                className="input pl-9 text-sm"
                placeholder="Buscar OS, cliente, placa, mecânico…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <button type="button" onClick={() => setShowFilters(v => !v)} aria-expanded={showFilters}
              className={`lg:hidden shrink-0 text-sm font-semibold px-3 py-2.5 rounded-xl border transition ${
                showFilters || filterPeriod !== 'all' || (!mech && filterMech !== 'all') ? 'bg-steel-900 text-white border-steel-900' : 'bg-white text-steel-700 border-steel-200'}`}>
              Filtros{(filterPeriod !== 'all' || filterMech !== 'all') ? ' •' : ''}
            </button>
          </div>

          <div className={view === 'colunas' ? 'md:hidden' : ''}>
            <StatusChips value={filterStatus} counts={counts} total={base.length} onChange={setFilterStatus} />
          </div>

          <div className="flex items-center gap-3">
          <button type="button" onClick={() => setOnlyScheduled(v => !v)} aria-pressed={onlyScheduled}
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-semibold transition ${
              onlyScheduled ? 'bg-brand-100 text-brand-800 border-brand-300' : 'bg-white text-steel-600 border-steel-200 hover:border-steel-300'}`}>
            📅 Agendadas
            <span className={`rounded-full px-1.5 py-px text-[10px] font-bold tabular-nums ${onlyScheduled ? 'bg-black/15' : 'bg-steel-100 text-steel-600'}`}>
              {scheduledCount}
            </span>
          </button>
          {hasFilters && (
            <button type="button" onClick={clearFilters} className="ml-auto text-xs text-steel-400 hover:text-steel-700 hover:underline">
              Limpar filtros
            </button>
          )}
          </div>
        </div>

        {/* Período e responsável (no celular, atrás de "Filtros") */}
        <div className={`${showFilters ? 'flex' : 'hidden'} lg:flex flex-col lg:flex-row lg:items-center gap-3 lg:gap-4`}>
          <div className="flex flex-wrap items-center gap-2">
            {PERIODS.map(([k, l]) => (
              <button key={k} type="button" onClick={() => setFilterPeriod(k)}
                className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition ${
                  filterPeriod === k ? 'bg-steel-900 text-white border-steel-900' : 'bg-white text-steel-600 border-steel-200 hover:border-steel-300'}`}>
                {l}
              </button>
            ))}
            {filterPeriod === 'custom' && (
              <div className="flex items-center gap-1.5 text-xs text-steel-500">
                <input type="date" className="input !py-1.5 !text-xs !w-auto" value={periodFrom} onChange={e => setPeriodFrom(e.target.value)} />
                até
                <input type="date" className="input !py-1.5 !text-xs !w-auto" value={periodTo} onChange={e => setPeriodTo(e.target.value)} />
              </div>
            )}
          </div>
          {!mech && <select className="input lg:max-w-[220px] text-sm" value={filterMech} onChange={e => setFilterMech(e.target.value)}>
            <option value="all">Todos os responsáveis</option>
            <option value="none">Sem responsável</option>
            <option value="platform">🌐 Mecânico da plataforma</option>
            {internalMechs.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>}
        </div>

        {loading || (mech && (!access.ready || (!!access.mechanicId && myOsIds === null))) ? (
          <OsSkeleton count={3} />
        ) : view === 'colunas' && typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches ? (
          <OsBoard
            list={onlyScheduled ? base.filter(isScheduled) : base}
            mechanicView={mech}
            onOpen={openOs}
            onMove={(os, to) => updateStatus(os, to)}
            onShowAllDone={() => { setView('lista'); setFilterStatus('completed'); }}
          />
        ) : filtered.length === 0 ? (
          mech ? (
            <EmptyState icon="🔧" title={hasFilters ? 'Nenhuma OS sua com esses filtros' : 'Nenhuma OS sua ainda'}
              description="Aqui aparecem as OS em que você é o responsável ou fez algum serviço." />
          ) : list.length === 0 ? (
            <EmptyState
              icon="📋"
              title="Nenhuma OS ainda"
              description="Crie a sua primeira ordem de serviço."
              actions={<button onClick={() => setNewOs({})} className="btn-primary text-sm !py-2">+ Nova OS</button>}
            />
          ) : onlyScheduled && !otherFilters ? (
            <EmptyState
              icon="📅"
              title="Nenhum serviço agendado"
              description='Ao criar uma OS, escolha "Agendar para uma data".'
              actions={<button onClick={() => setNewOs({ schedule: true })} className="btn-primary text-sm !py-2">+ Agendar OS</button>}
            />
          ) : (
            <EmptyState
              icon="🔎"
              title="Nenhuma OS com esses filtros"
              description="Ajuste a busca ou limpe os filtros para ver mais resultados."
              actions={
                <>
                  <button onClick={clearFilters} className="btn-ghost text-sm !py-2 border border-steel-200">Limpar filtros</button>
                  <button onClick={() => setNewOs({})} className="btn-primary text-sm !py-2">+ Nova OS</button>
                </>
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
                mechanicView={mech}
                myCommission={mech ? myComm.byOs.get(os.id)?.value : undefined}
              />
            ))}
          </div>
        )}
        {!loading && !allLoaded && (
          <div className="text-center pt-1">
            <button onClick={loadOlder} disabled={loadingOlder} className="btn-ghost text-sm !py-2 border border-steel-200">
              {loadingOlder ? 'Carregando…' : `Mostrar OS mais antigas (concluídas há mais de ${RECENT_DAYS} dias)`}
            </button>
          </div>
        )}
      </div>

      {/* ══ NOVA OS (rápida, pela placa) ══ */}
      {newOs && shop && (
        <NewOsModal
          workshopId={shop.id}
          preset={newOs}
          onClose={() => setNewOs(null)}
          onManageTeam={() => { setNewOs(null); openNewMech(); }}
          onCreated={(id, number, isCheckup) => {
            setNewOs(null);
            const n = String(number ?? '').padStart(4, '0');
            if (isCheckup) {
              // Check-up sempre vira inspeção com relatório (a tela de check-up cria o dela ligado à OS)
              toast.success(`OS nº ${n} aberta ✓ — faça o check-up`);
              nav(`/oficina/checkup?os=${id}`);
            } else {
              toast.success(`OS nº ${n} aberta ✓ — lance as peças e serviços`);
              nav(`/oficina/os/${id}`);
            }
          }}
        />
      )}

    </WorkshopLayout>
  );
}
