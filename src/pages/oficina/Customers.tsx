import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import WorkshopLayout from '@/components/layout/WorkshopLayout';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { fetchAll } from '@/lib/fetchAll';
import { toast } from '@/components/ui/Toast';
import { fmtBRL, fmtPhone, waNumber } from '@/components/os/osHelpers';
import CustomerForm from '@/components/customers/CustomerForm';
import CallToday, { callMessage, type CallItem } from '@/components/customers/CallToday';
import NewOsModal, { type NewOsPreset } from '@/components/os/NewOsModal';
import { Icon } from '@/components/home/ui';
import { onlyDigits, plateNorm, timeAgo } from '@/lib/customers';
import {
  SEGMENTS, baseInsights, callReason, reasonLabel, serviceDueDays, serviceDueSoon, staleQuote,
  type CallReason, type CustomerInsight, type InsOs, type InsRec,
} from '@/lib/customerInsights';
import { PRESETS, rangeOf, type Preset } from '@/components/PeriodPicker';

type Base = {
  id: string; full_name: string; phone: string | null; cpf: string | null; created_at: string;
  contact_opt_out: boolean | null; last_contacted_at: string | null;
};
type Veh = { id: string; customer_id: string; plate: string; make: string | null; model: string | null };
type Sale = { d: string; price: number };
type Row = Base & {
  plates: string[]; car: string | null; vehicleId: string | null; lastService: string | null;
  ins: CustomerInsight; sales: Sale[]; reason: CallReason | null; quoteStale: boolean; serviceSoon: boolean;
};
type PeriodKey = 'all' | Preset;
type DateMode = 'served' | 'registered' | 'lastvisit';
const DATE_MODES: { key: DateMode; label: string }[] = [
  { key: 'served', label: 'Atendidos no período' },
  { key: 'registered', label: 'Cadastrados no período' },
  { key: 'lastvisit', label: 'Última visita no período' },
];
const toInput = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
type Filter = 'all' | 'vip' | 'risk' | 'gone' | 'due' | 'new' | 'quote' | 'service' | 'nophone' | 'money';
type Sort = 'money' | 'spent' | 'lastvisit' | 'action' | 'visits' | 'recent' | 'gone';

/** 4 filtros à vista (+ Todos); o resto em "Mais filtros" */
const MAIN_FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'Todos' },
  { key: 'vip', label: 'VIP' },
  { key: 'risk', label: 'Em risco' },
  { key: 'gone', label: 'Sumidos' },
  { key: 'due', label: 'Retornam este mês' },
];
const MORE_FILTERS: { key: Filter; label: string }[] = [
  { key: 'new', label: 'Novos' },
  { key: 'quote', label: 'Orçamento parado' },
  { key: 'service', label: 'Revisão próxima' },
  { key: 'nophone', label: 'Sem telefone' },
  { key: 'money', label: 'Oportunidade estimada' },
];
const SORTS: { key: Sort; label: string }[] = [
  { key: 'spent', label: 'Maior gasto' }, { key: 'lastvisit', label: 'Última visita' },
  { key: 'action', label: 'Próxima ação' }, { key: 'visits', label: 'Mais visitas' },
  { key: 'money', label: 'Oportunidade estimada' }, { key: 'recent', label: 'Cadastrados recentemente' },
  { key: 'gone', label: 'Sumidos há mais tempo' },
];
/** Períodos do "Mais filtros" (sem período = todo o histórico) */
const PERIOD_OPTS: { key: Preset; label: string }[] = [
  { key: 'today', label: 'Hoje' }, { key: '7d', label: '7 dias' }, { key: 'month', label: 'Este mês' },
  { key: 'lastMonth', label: 'Mês passado' }, { key: 'custom', label: 'Personalizado' },
];
const ACTION_RANK: Record<CallReason['kind'], number> = { quote: 0, service: 1, risk: 2, gone: 3 };
const PAGE = 50;
const DAY = 86400000;
const CONTACT_PAUSE_DAYS = 30;

const hasPhone = (p: string | null) => onlyDigits(p).length >= 10;
const contactedRecently = (iso: string | null, now = Date.now()) => !!iso && now - new Date(iso).getTime() < CONTACT_PAUSE_DAYS * DAY;

export default function Customers() {
  const { currentWorkshop } = useAuth();
  const shop = currentWorkshop;
  const nav = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('spent');
  const [shown, setShown] = useState(PAGE);
  // ?novo=1 (atalho do Início) abre o cadastro direto
  const [creating, setCreating] = useState(() => new URLSearchParams(window.location.search).get('novo') === '1');
  const [newOs, setNewOs] = useState<NewOsPreset | null>(null);
  const [period, setPeriod] = useState<PeriodKey>('all');
  const [dateMode, setDateMode] = useState<DateMode>('served');
  const [custom, setCustom] = useState(() => {
    const t = new Date(); const f = new Date(); f.setDate(f.getDate() - 29);
    return { from: toInput(f), to: toInput(t) };
  });
  const range = useMemo(() => (period === 'all' ? null : rangeOf(period, custom)), [period, custom]);

  useEffect(() => {
    if (!shop) return;
    let alive = true;
    (async () => {
      setLoading(true);
      const [c, v, o, r] = await Promise.all([
        fetchAll<Base>((a, b) => supabase.from('customers')
          .select('id, full_name, phone, cpf, created_at, contact_opt_out, last_contacted_at').eq('workshop_id', shop.id).order('id').range(a, b)),
        fetchAll<Veh>((a, b) => supabase.from('vehicles')
          .select('id, customer_id, plate, make, model').eq('workshop_id', shop.id).order('id').range(a, b)),
        fetchAll<InsOs>((a, b) => supabase.from('service_orders')
          .select('id, customer_id, vehicle_id, category, status, quote_status, price, created_at, completed_at, rework_of_id, approval_requested_at, title')
          .eq('workshop_id', shop.id).order('id').range(a, b)),
        fetchAll<InsRec>((a, b) => supabase.from('service_recommendations')
          .select('id, customer_id, vehicle_id, description, recommended_at').eq('workshop_id', shop.id).eq('status', 'pending').order('id').range(a, b)),
      ]);
      if (!alive) return;
      const vehBy = new Map<string, Veh[]>();
      const vehById = new Map<string, Veh>();
      for (const x of v.data) { vehBy.set(x.customer_id, [...(vehBy.get(x.customer_id) ?? []), x]); vehById.set(x.id, x); }
      const osBy = new Map<string, InsOs[]>();
      for (const x of o.data) if (x.customer_id) osBy.set(x.customer_id, [...(osBy.get(x.customer_id) ?? []), x]);
      const ins = baseInsights(c.data.map(x => x.id), o.data, r.data);
      const now = Date.now();
      const carLabel = (x: Veh | undefined) => (x ? [[x.make, x.model].filter(Boolean).join(' '), x.plate?.toUpperCase()].filter(Boolean).join(' · ') : null);

      setRows(c.data.map(x => {
        const list = (osBy.get(x.id) ?? []).sort((a, b) => b.created_at.localeCompare(a.created_at));
        const sales = list.filter(s => s.status === 'completed' && !s.quote_status && !s.rework_of_id)
          .map(s => ({ d: s.completed_at ?? s.created_at, price: Number(s.price) }));
        // Veículo principal: o da OS mais recente; senão o primeiro cadastrado
        const lastWithCar = list.find(s => s.vehicle_id && vehById.has(s.vehicle_id));
        const veh = lastWithCar ? vehById.get(lastWithCar.vehicle_id!) : vehBy.get(x.id)?.[0];
        const lastSale = list.find(s => s.status === 'completed' && !s.quote_status && !s.rework_of_id);
        const i = ins.map.get(x.id)!;
        return {
          ...x, plates: (vehBy.get(x.id) ?? []).map(p => p.plate), car: carLabel(veh), vehicleId: veh?.id ?? null,
          lastService: lastSale?.title ?? null, ins: i, sales,
          reason: callReason(i, list, now),
          quoteStale: !!staleQuote(list, now),
          serviceSoon: serviceDueSoon(serviceDueDays(i, now)),
        };
      }));
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [shop?.id]);

  // Quem devo chamar hoje: motivo claro, com telefone, aceita mensagens e não foi chamado nos últimos 30 dias
  const callList = useMemo<CallItem[]>(() => {
    return rows
      .filter(r => r.reason && hasPhone(r.phone) && !r.contact_opt_out && !contactedRecently(r.last_contacted_at))
      .sort((a, b) => ACTION_RANK[a.reason!.kind] - ACTION_RANK[b.reason!.kind] || b.ins.spent - a.ins.spent)
      .map(r => ({ id: r.id, name: r.full_name, phone: r.phone, car: r.car, lastService: r.lastService, spent: r.ins.spent, reason: r.reason! }));
  }, [rows]);

  // Gasto/visitas de cada cliente dentro do período escolhido
  const inRange = (iso: string | null | undefined) => {
    if (!range || !iso) return false;
    const t = new Date(iso).getTime();
    return t >= range.from.getTime() && t < range.to.getTime();
  };
  const periodOf = (r: Row) => {
    const s = r.sales.filter(x => inRange(x.d));
    return { visits: s.length, spent: s.reduce((a, x) => a + x.price, 0) };
  };

  const matches = (r: Row, f: Filter) => {
    const s = r.ins.segment;
    const now = new Date();
    const mStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const mEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();
    switch (f) {
      case 'all': return true;
      case 'vip': return r.ins.vip;
      case 'risk': return s === 'risk';
      case 'gone': return s === 'gone';
      case 'new': return s === 'new';
      case 'due': {
        const t = r.ins.nextExpected ? new Date(r.ins.nextExpected).getTime() : 0;
        return t >= mStart && t < mEnd && s !== 'risk' && s !== 'gone';
      }
      case 'quote': return r.quoteStale;
      case 'service': return r.serviceSoon;
      case 'nophone': return !hasPhone(r.phone);
      case 'money': return r.ins.opportunity.total > 0;
    }
  };
  const counts = useMemo(() => {
    const out = {} as Record<Filter, number>;
    for (const f of [...MAIN_FILTERS, ...MORE_FILTERS]) out[f.key] = rows.filter(r => matches(r, f.key)).length;
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    const qd = onlyDigits(q);
    const qp = plateNorm(q);
    let out = rows.filter(r => {
      if (!matches(r, filter)) return false;
      if (range) {
        if (dateMode === 'served' && !r.sales.some(x => inRange(x.d))) return false;
        if (dateMode === 'registered' && !inRange(r.created_at)) return false;
        if (dateMode === 'lastvisit' && !inRange(r.ins.lastVisit)) return false;
      }
      if (!q) return true;
      return r.full_name.toLowerCase().includes(q)
        || (qd.length >= 3 && (onlyDigits(r.phone).includes(qd) || onlyDigits(r.cpf).includes(qd)))
        || (qp.length >= 3 && r.plates.some(p => plateNorm(p).includes(qp)));
    });
    out = [...out].sort((a, b) => {
      switch (sort) {
        case 'money': return b.ins.opportunity.total - a.ins.opportunity.total || b.ins.spent - a.ins.spent;
        case 'spent': return range && dateMode === 'served' ? periodOf(b).spent - periodOf(a).spent : b.ins.spent - a.ins.spent;
        case 'visits': return b.ins.visits - a.ins.visits || b.ins.spent - a.ins.spent;
        case 'lastvisit': return (b.ins.lastVisit ?? '').localeCompare(a.ins.lastVisit ?? '');
        case 'action': return (a.reason ? ACTION_RANK[a.reason.kind] : 9) - (b.reason ? ACTION_RANK[b.reason.kind] : 9) || b.ins.spent - a.ins.spent;
        case 'gone': return (a.ins.lastVisit ?? '9999').localeCompare(b.ins.lastVisit ?? '9999');
        default: return b.created_at.localeCompare(a.created_at);
      }
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, search, filter, sort, range, dateMode]);

  // Resumo do período (quem entrou na lista)
  const periodSummary = useMemo(() => {
    if (!range) return null;
    if (dateMode !== 'served') return { count: list.length, spent: null as number | null, visits: null as number | null };
    let spent = 0, visits = 0;
    for (const r of list) { const p = periodOf(r); spent += p.spent; visits += p.visits; }
    return { count: list.length, spent, visits };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list, range, dateMode]);

  const go = (f: Filter) => { setFilter(f); setShown(PAGE); };
  const moreActive = MORE_FILTERS.some(f => f.key === filter) || period !== 'all' || sort !== 'spent';

  async function optOut(r: Row) {
    if (!confirm(`${r.full_name} não quer mais receber mensagens? Ele não vai mais aparecer em "Quem devo chamar hoje".`)) return;
    const { error } = await supabase.from('customers').update({ contact_opt_out: true }).eq('id', r.id);
    if (error) return toast.error('Erro: ' + error.message);
    setRows(rs => rs.map(x => (x.id === r.id ? { ...x, contact_opt_out: true } : x)));
    toast.success('Anotado — não vamos sugerir contato com este cliente');
  }
  const markContacted = (id: string) =>
    setRows(rs => rs.map(x => (x.id === id ? { ...x, last_contacted_at: new Date().toISOString() } : x)));
  const openNewOs = (customerId: string, schedule = false) => {
    const r = rows.find(x => x.id === customerId);
    setNewOs({ customerId, vehicleId: r?.vehicleId ?? null, schedule });
  };

  const noPhone = counts.nophone ?? 0;

  return (
    <WorkshopLayout>
      <div className="max-w-6xl mx-auto space-y-4">
        <header className="flex flex-wrap justify-between items-center gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl lg:text-[28px] font-bold tracking-tight text-steel-900 leading-tight">Clientes</h1>
            {!loading && (
              <div className="flex flex-col">
                <span className="text-sm text-steel-600">{rows.length.toLocaleString('pt-BR')} clientes</span>
                {noPhone > 0 && (
                  <button onClick={() => go('nophone')} className="self-start text-xs text-steel-400 hover:text-brand-600 hover:underline transition">
                    {noPhone.toLocaleString('pt-BR')} precisam de telefone
                  </button>
                )}
              </div>
            )}
          </div>
          <button onClick={() => setCreating(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-500 text-white px-3.5 h-10 lg:h-9 text-sm font-semibold hover:bg-brand-600 transition">
            <Icon name="plus" size={16} />Novo cliente
          </button>
        </header>

        {loading ? (
          <div className="space-y-4">
            <div className="h-40 rounded-xl bg-white ring-1 ring-steel-200/70 animate-pulse" />
            <div className="h-72 rounded-xl bg-white ring-1 ring-steel-200/70 animate-pulse" />
          </div>
        ) : (
          <>
            {shop && (
              <CallToday items={callList} workshopId={shop.id} shopName={shop.business_name}
                onContacted={markContacted} onSchedule={id => openNewOs(id, true)} />
            )}

            {/* Busca + filtros principais */}
            <section className="space-y-3">
              <div className="flex flex-col lg:flex-row lg:items-center gap-3">
                <div className="relative lg:w-80 shrink-0">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-steel-400"><Icon name="search" size={16} /></span>
                  <input className="input pl-9 text-sm lg:!py-1.5" placeholder="Nome, telefone, placa ou CPF"
                    value={search} onChange={e => { setSearch(e.target.value); setShown(PAGE); }} />
                </div>
                <div className="flex gap-1.5 overflow-x-auto lg:overflow-visible -mx-4 px-4 lg:mx-0 lg:px-0 pb-1 lg:pb-0">
                  {MAIN_FILTERS.map(f => (
                    <Chip key={f.key} active={filter === f.key} onClick={() => go(f.key)}
                      label={f.label} count={f.key === 'all' ? undefined : counts[f.key]} />
                  ))}
                  <MoreFilters
                    active={moreActive}
                    counts={counts}
                    value={{ filter, period, custom, dateMode, sort }}
                    onApply={x => {
                      setFilter(x.filter); setPeriod(x.period); setCustom(x.custom); setDateMode(x.dateMode); setSort(x.sort); setShown(PAGE);
                    }}
                    onClear={() => { setFilter('all'); setPeriod('all'); setDateMode('served'); setSort('spent'); setShown(PAGE); }} />
                </div>
              </div>
              {/* Segmento escolhido em "Mais filtros" aparece como etiqueta removível */}
              {MORE_FILTERS.some(f => f.key === filter) && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-steel-900 text-white px-3 h-7 font-semibold">
                    {MORE_FILTERS.find(f => f.key === filter)!.label}
                    <button onClick={() => go('all')} aria-label="Tirar filtro" className="text-steel-300 hover:text-white">✕</button>
                  </span>
                </div>
              )}

              {range && periodSummary && (
                <p className="text-sm text-steel-600">
                  <strong className="text-steel-900">{periodSummary.count.toLocaleString('pt-BR')}</strong> cliente{periodSummary.count === 1 ? '' : 's'}{' '}
                  {dateMode === 'served' ? 'atendidos' : dateMode === 'registered' ? 'cadastrados' : 'com a última visita'} de{' '}
                  {range.from.toLocaleDateString('pt-BR')} a {new Date(range.to.getTime() - DAY).toLocaleDateString('pt-BR')}
                  {periodSummary.spent != null && <> · <strong className="text-steel-900">{fmtBRL(periodSummary.spent)}</strong> em {periodSummary.visits} visita{periodSummary.visits === 1 ? '' : 's'}</>}
                </p>
              )}
            </section>

            {/* Lista */}
            {list.length === 0 ? (
              <div className="rounded-xl bg-white ring-1 ring-steel-200/70 text-center text-steel-500 py-12 px-4">
                {rows.length === 0
                  ? <><p className="font-semibold text-steel-800">Nenhum cliente ainda</p><p className="text-sm mt-1">Cadastre seu primeiro cliente e comece a construir o histórico.</p></>
                  : <p className="text-sm">Nenhum cliente com esse filtro ou busca.</p>}
              </div>
            ) : (
              <div className="md:rounded-xl md:bg-white md:ring-1 md:ring-steel-200/70">
                <div className="hidden md:grid grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)_110px_120px_minmax(0,1.5fr)_72px] gap-3 pl-4 pr-2 py-2 border-b border-steel-100 text-[11px] font-medium text-steel-500">
                  <span>Cliente</span><span>Veículo</span><span>Última visita</span><span className="text-right">Total gasto</span><span>Próxima ação</span><span />
                </div>
                <ul className="space-y-2 md:space-y-0 md:divide-y md:divide-steel-100">
                  {list.slice(0, shown).map(r => (
                    <CustomerRow key={r.id} r={r} shopId={shop?.id ?? ''} shopName={shop?.business_name ?? ''}
                      onOpen={() => nav(`/oficina/clientes/${r.id}`)}
                      onNewOs={() => openNewOs(r.id)} onSchedule={() => openNewOs(r.id, true)} onOptOut={() => optOut(r)}
                      periodSpent={range && dateMode === 'served' ? periodOf(r).spent : null} />
                  ))}
                </ul>
                {list.length > shown && (
                  <button onClick={() => setShown(s => s + PAGE)} className="w-full mt-2 md:mt-0 py-3 text-sm font-semibold text-brand-600 hover:bg-steel-50 rounded-xl md:rounded-none md:rounded-b-xl bg-white md:bg-transparent ring-1 ring-steel-200/70 md:ring-0 md:border-t md:border-steel-100">
                    Mostrar mais ({(list.length - shown).toLocaleString('pt-BR')} restantes)
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {creating && shop && (
        <CustomerForm workshopId={shop.id} onClose={() => setCreating(false)}
          onSaved={id => { setCreating(false); nav(`/oficina/clientes/${id}`); }} />
      )}

      {/* Mesma abertura de OS da tela de OS, já com o cliente */}
      {newOs && shop && (
        <NewOsModal
          workshopId={shop.id}
          preset={newOs}
          onClose={() => setNewOs(null)}
          onManageTeam={() => { setNewOs(null); nav('/oficina/equipe'); }}
          onCreated={(id, number, isCheckup) => {
            setNewOs(null);
            const n = String(number ?? '').padStart(4, '0');
            if (isCheckup) {
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

function Chip({ label, count, active, onClick }: { label: string; count?: number; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className={`shrink-0 inline-flex items-center gap-1.5 px-3 h-8 rounded-full text-xs font-semibold ring-1 transition ${
        active ? 'bg-steel-900 text-white ring-steel-900' : 'bg-white text-steel-600 ring-steel-200 hover:ring-steel-300'}`}>
      {label}
      {count != null && <span className={`tabular-nums ${active ? 'text-steel-300' : 'text-steel-400'}`}>{count.toLocaleString('pt-BR')}</span>}
    </button>
  );
}

/** Uma linha da lista: nome, telefone, veículo, última visita, total gasto e próxima ação */
function CustomerRow({ r, shopId, shopName, onOpen, onNewOs, onSchedule, onOptOut, periodSpent }: {
  r: Row; shopId: string; shopName: string; onOpen: () => void; onNewOs: () => void; onSchedule: () => void; onOptOut: () => void;
  periodSpent: number | null;
}) {
  const seg = SEGMENTS[r.ins.segment];
  const wa = !r.contact_opt_out ? waNumber(r.phone) : null;
  const contacted = contactedRecently(r.last_contacted_at);
  const action = r.reason
    ? (contacted ? `Chamado ${timeAgo(r.last_contacted_at)}` : reasonLabel(r.reason))
    : r.ins.openOs > 0 ? `${r.ins.openOs} OS em aberto` : null;
  const stop = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <li onClick={onOpen} className="cursor-pointer transition pl-4 pr-2 py-3 md:py-2.5 min-h-[56px]
      rounded-xl md:rounded-none bg-white md:bg-transparent ring-1 ring-steel-200/70 md:ring-0 hover:bg-steel-50
      grid grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)_110px_120px_minmax(0,1.5fr)_72px] gap-x-3 gap-y-1 items-center">
      {/* Cliente */}
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="font-semibold text-steel-900 truncate">{r.full_name}</span>
          {r.ins.vip && <span title="VIP: entre os 20% que mais gastam" className="text-brand-500 shrink-0"><Icon name="star" size={14} /></span>}
          <span title={seg.hint} className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-steel-100 text-steel-600">{seg.label}</span>
        </div>
        <div className="text-xs text-steel-500 truncate">
          {r.phone ? fmtPhone(r.phone) : 'sem telefone'}{r.contact_opt_out ? ' · não quer mensagens' : ''}
          <span className="md:hidden">{r.car ? ` · ${r.car}` : ''}</span>
        </div>
      </div>
      {/* Veículo */}
      <div className="hidden md:block text-sm text-steel-700 truncate">{r.car ?? <span className="text-steel-300">—</span>}</div>
      {/* Última visita */}
      <div className="hidden md:block text-sm text-steel-600">{r.ins.lastVisit ? timeAgo(r.ins.lastVisit) : <span className="text-steel-300">—</span>}</div>
      {/* Total gasto */}
      <div className="hidden md:block text-right text-sm font-semibold text-steel-900 tabular-nums">
        {fmtBRL(r.ins.spent)}
        {periodSpent != null && <div className="text-[11px] font-normal text-steel-500">no período: {fmtBRL(periodSpent)}</div>}
      </div>
      {/* Próxima ação */}
      <div className={`hidden md:block text-sm truncate ${!action ? 'text-steel-300' : r.reason && !contacted ? 'text-steel-800' : 'text-steel-400'}`}
        title={action ? undefined : 'Sem ação sugerida'}>{action ?? '—'}</div>

      {/* Ações (no celular: valor + ações na direita) */}
      <div className="flex items-center justify-end gap-0.5" onClick={stop}>
        <div className="md:hidden text-right mr-1">
          <div className="text-sm font-semibold text-steel-900 tabular-nums">{fmtBRL(r.ins.spent)}</div>
          <div className="text-[11px] text-steel-500">{r.ins.lastVisit ? timeAgo(r.ins.lastVisit) : '—'}</div>
        </div>
        {wa ? (
          <a href={`https://wa.me/${wa}?text=${encodeURIComponent(callMessage(shopId, shopName, { name: r.full_name, car: r.car, lastService: r.lastService }, r.reason))}`}
            target="_blank" rel="noopener noreferrer" title="WhatsApp"
            className="h-10 w-10 md:h-9 md:w-9 grid place-items-center rounded-lg text-steel-500 hover:text-signal-600 hover:bg-steel-100 transition">
            <Icon name="chat" size={17} />
          </a>
        ) : <span className="h-10 w-10 md:h-9 md:w-9" />}
        <RowMenu items={[
          { label: 'Criar OS / orçamento', onClick: onNewOs },
          { label: 'Agendar', onClick: onSchedule },
          { label: 'Ver histórico', onClick: onOpen },
          ...(!r.contact_opt_out ? [{ label: 'Não quer receber mensagens', onClick: onOptOut, muted: true }] : []),
        ]} />
      </div>
      {/* Próxima ação no celular */}
      {r.reason && !contacted && <div className="md:hidden col-span-2 text-xs font-medium text-steel-700 pt-1 border-t border-steel-100 mt-1">{action}</div>}
    </li>
  );
}

/** Menu "⋯" da linha: no computador abre ao lado; no celular sobe por baixo */
function RowMenu({ items }: { items: { label: string; onClick: () => void; muted?: boolean }[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(o => !o)} aria-label="Mais ações" aria-expanded={open}
        className="h-10 w-10 md:h-9 md:w-9 grid place-items-center rounded-lg text-steel-400 hover:text-steel-700 hover:bg-steel-100 transition">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40 bg-steel-900/40 md:hidden" onClick={() => setOpen(false)} />
          <div className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl pb-[env(safe-area-inset-bottom)] md:absolute md:inset-x-auto md:bottom-auto md:right-0 md:top-full md:mt-1 md:w-60 md:rounded-xl bg-white shadow-2xl ring-1 ring-steel-200 py-1">
            {items.map(i => (
              <button key={i.label} onClick={() => { setOpen(false); i.onClick(); }}
                className={`w-full text-left px-4 py-3 md:py-2.5 text-sm hover:bg-steel-50 ${i.muted ? 'text-steel-500 border-t border-steel-100' : 'text-steel-700'}`}>
                {i.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

type MoreValue = { filter: Filter; period: PeriodKey; custom: { from: string; to: string }; dateMode: DateMode; sort: Sort };

/** "Mais filtros": no computador abre embaixo do botão; no celular sobe por baixo. Nada muda até "Aplicar filtros". */
function MoreFilters({ value, counts, active, onApply, onClear }: {
  value: MoreValue; counts: Record<Filter, number>; active: boolean;
  onApply: (v: MoreValue) => void; onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<MoreValue>(value);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (open) setDraft(value); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);
  const set = (p: Partial<MoreValue>) => setDraft(d => ({ ...d, ...p }));
  const segment = MORE_FILTERS.some(f => f.key === draft.filter) ? draft.filter : null;

  return (
    <div className="relative shrink-0" ref={ref}>
      <button onClick={() => setOpen(o => !o)} aria-expanded={open}
        className={`inline-flex items-center gap-1 px-3 h-8 rounded-full text-xs font-semibold ring-1 transition ${
          active ? 'bg-steel-900 text-white ring-steel-900' : 'bg-white text-steel-600 ring-steel-200 hover:ring-steel-300'}`}>
        <Icon name="sliders" size={14} />
        Mais filtros{active ? ' •' : ''}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40 bg-steel-900/40 lg:hidden" onClick={() => setOpen(false)} />
          <div className="fixed inset-x-0 bottom-0 z-50 max-h-[85vh] overflow-y-auto rounded-t-2xl pb-[env(safe-area-inset-bottom)]
            lg:absolute lg:inset-x-auto lg:bottom-auto lg:right-0 lg:top-full lg:mt-2 lg:w-[380px] lg:max-h-none lg:rounded-xl
            bg-white shadow-2xl ring-1 ring-steel-200">
            <div className="p-4 space-y-4">
              <Group title="Segmento">
                {MORE_FILTERS.map(f => (
                  <Chip key={f.key} active={segment === f.key} label={f.label} count={counts[f.key]}
                    onClick={() => set({ filter: segment === f.key ? 'all' : f.key })} />
                ))}
              </Group>
              <Group title="Período">
                {PERIOD_OPTS.map(p => (
                  <Chip key={p.key} active={draft.period === p.key} label={p.label}
                    onClick={() => set({ period: draft.period === p.key ? 'all' : p.key })} />
                ))}
                {draft.period === 'custom' && (
                  <span className="flex items-center gap-1.5 w-full">
                    <input type="date" className="input !py-1 text-sm" value={draft.custom.from} onChange={e => set({ custom: { ...draft.custom, from: e.target.value } })} />
                    <span className="text-steel-400 text-sm">a</span>
                    <input type="date" className="input !py-1 text-sm" value={draft.custom.to} onChange={e => set({ custom: { ...draft.custom, to: e.target.value } })} />
                  </span>
                )}
              </Group>
              {draft.period !== 'all' && (
                <Group title="Data considerada">
                  {DATE_MODES.map(m => (
                    <Chip key={m.key} active={draft.dateMode === m.key} label={m.label.replace(' no período', '')} onClick={() => set({ dateMode: m.key })} />
                  ))}
                </Group>
              )}
              <Group title="Ordenar por">
                <select className="input text-sm" value={draft.sort} onChange={e => set({ sort: e.target.value as Sort })}>
                  {SORTS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
                </select>
              </Group>
            </div>
            <div className="flex gap-2 px-4 py-3 border-t border-steel-100 bg-steel-50/60 lg:rounded-b-xl">
              <button onClick={() => { onClear(); setOpen(false); }}
                className="flex-1 inline-flex items-center justify-center rounded-lg bg-white text-steel-700 ring-1 ring-steel-200 h-10 lg:h-9 text-sm font-semibold hover:bg-steel-50">
                Limpar
              </button>
              <button onClick={() => { onApply(draft); setOpen(false); }}
                className="flex-[2] inline-flex items-center justify-center rounded-lg bg-brand-500 text-white h-10 lg:h-9 text-sm font-semibold hover:bg-brand-600">
                Aplicar filtros
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-steel-400 mb-2">{title}</div>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}
