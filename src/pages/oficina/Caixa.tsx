import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import WorkshopLayout from '@/components/layout/WorkshopLayout';
import NewOsModal from '@/components/os/NewOsModal';
import PaymentsList, { paidResponsibles, type PaidOs } from '@/components/cash/PaymentsList';
import CallMechanicModal, { type CallMechanicOs } from '@/components/cash/CallMechanicModal';
import CounterSaleModal from '@/components/cash/CounterSaleModal';
import { OsCommission, useOsCommission } from '@/components/cash/OsCommission';
import { AssignmentsModal, ReceiveAssignments, useReceiveAssignments } from '@/components/cash/ReceiveAssignments';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/components/ui/Toast';
import { canDo, sessionAllows, useOperator, type WorkshopOperator } from '@/lib/operators';
import {
  EXPENSE_CATEGORIES, KINDS, METHODS, RECEIVE_METHODS, brl, hhmm, moneyStr, parseMoney,
  type CashEntry, type CashRegister, type CashSummary, type EntryKind, type PayMethod,
} from '@/lib/cash';
import type { WorkshopMechanic } from '@/types/database';

type OpenOs = {
  id: string; number: number | null; title: string; price: number; paid_amount: number; counter_discount: number;
  status: string; completed_at: string | null; created_at: string;
  executor: 'workshop' | 'platform' | null; workshop_mechanic_id: string | null;
  customer: { full_name: string } | null; vehicle: { plate: string | null; make: string | null; model: string | null } | null;
  /** "Pagar depois": até quando o cliente vai pagar (o que falta da OS) */
  pay_later_due?: string | null; pay_later_note?: string | null;
};

/** Dias até o vencimento do "pagar depois" (negativo = vencido) */
const daysToDue = (due: string) => {
  const t = new Date(); t.setHours(0, 0, 0, 0);
  return Math.round((new Date(`${due}T00:00:00`).getTime() - t.getTime()) / 86400000);
};
const dueLabel = (due: string) => {
  const d = daysToDue(due);
  const date = new Date(`${due}T12:00:00`).toLocaleDateString('pt-BR');
  return d < 0 ? `vencido há ${-d} dia${d === -1 ? '' : 's'} (${date})` : d === 0 ? 'vence hoje' : `vence ${date}`;
};

type Tab = 'receber' | 'movimentos' | 'fechar';

const osNum = (o: { id: string; number: number | null }) => (o.number != null ? String(o.number).padStart(4, '0') : o.id.slice(0, 8));
const remainingOf = (o: OpenOs) => Math.round((o.price - o.counter_discount - o.paid_amount) * 100) / 100;
/* Filtro por data: concluída em (ou aberta em, se ainda não concluiu) */
type DatePeriod = 'today' | 'yesterday' | '7d' | '30d' | 'all' | 'custom';
const DATE_PERIODS: [DatePeriod, string][] = [['today', 'Hoje'], ['yesterday', 'Ontem'], ['7d', '7 dias'], ['30d', '30 dias'], ['all', 'Todas'], ['custom', '📅 Escolher datas']];
const osDate = (o: { completed_at: string | null; created_at: string }) => new Date(o.completed_at ?? o.created_at).getTime();

function periodRange(p: DatePeriod, from: string, to: string): [number | null, number | null] {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const day = 86400000;
  if (p === 'today') return [today.getTime(), null];
  if (p === 'yesterday') return [today.getTime() - day, today.getTime()];
  if (p === '7d') return [today.getTime() - 6 * day, null];
  if (p === '30d') return [today.getTime() - 29 * day, null];
  if (p === 'custom') return [
    from ? new Date(`${from}T00:00:00`).getTime() : null,
    to ? new Date(`${to}T00:00:00`).getTime() + day : null,
  ];
  return [null, null];
}

const STATUS_LABEL: Record<string, string> = { open: 'Aberta', approved: 'Aprovada', in_progress: 'Em execução', completed: 'Concluída' };

export default function Caixa() {
  const { currentWorkshop } = useAuth();
  const wid = currentWorkshop?.id ?? null;
  const { balcao, session } = useOperator();
  const sid = balcao ? session?.session_id ?? null : null;
  const can = (p: Parameters<typeof canDo>[2]) => canDo(session, balcao, p);
  /* Chamar mecânico publica demanda: só quem tem acesso à tela de Demandas */
  const canCallMechanic = !balcao || (!!session && sessionAllows(session, '/oficina/dashboard'));

  const [reg, setReg]         = useState<CashRegister | null | undefined>(undefined);
  const [lastClosed, setLastClosed] = useState<CashRegister | null>(null);
  const [summary, setSummary] = useState<CashSummary | null>(null);
  const [entries, setEntries] = useState<CashEntry[]>([]);
  const [ops, setOps]         = useState<Record<string, string>>({});
  const [team, setTeam]       = useState<WorkshopMechanic[]>([]);
  const [tab, setTab]         = useState<Tab>('receber');
  const [params, setParams]   = useSearchParams();
  const focusOs = params.get('os');

  const load = useCallback(async () => {
    if (!wid) return;
    const [r, o, m] = await Promise.all([
      supabase.from('cash_registers').select('*').eq('workshop_id', wid).order('opened_at', { ascending: false }).limit(2),
      supabase.from('workshop_operators').select('id, name').eq('workshop_id', wid),
      supabase.from('workshop_mechanics').select('*').eq('workshop_id', wid).neq('status', 'terminated').order('name'),
    ]);
    const regs = (r.data as CashRegister[]) ?? [];
    const open = regs.find(x => x.status === 'open') ?? null;
    setReg(open);
    setLastClosed(open ? null : regs.find(x => x.status === 'closed') ?? null);
    setOps(Object.fromEntries(((o.data as Pick<WorkshopOperator, 'id' | 'name'>[]) ?? []).map(x => [x.id, x.name])));
    setTeam((m.data as WorkshopMechanic[]) ?? []);
    if (open) {
      const [e, s] = await Promise.all([
        supabase.from('cash_entries').select('*').eq('register_id', open.id).order('created_at', { ascending: false }),
        supabase.rpc('cash_register_summary', { p_register: open.id }),
      ]);
      setEntries((e.data as CashEntry[]) ?? []);
      setSummary((s.data as CashSummary) ?? null);
    } else {
      setEntries([]); setSummary(null);
    }
  }, [wid]);

  useEffect(() => { load(); }, [load]);

  if (reg === undefined) {
    return <WorkshopLayout><div className="max-w-5xl mx-auto space-y-3">{[1, 2].map(i => <div key={i} className="h-32 bg-white rounded-2xl animate-pulse" />)}</div></WorkshopLayout>;
  }

  return (
    <WorkshopLayout>
      <div className="max-w-5xl mx-auto">
        <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">💰 Caixa</h1>
            <p className="text-sm text-steel-500 mt-1">
              {reg
                ? <>Aberto às {hhmm(reg.opened_at)} de {new Date(reg.opened_at).toLocaleDateString('pt-BR')}{reg.opened_by && ops[reg.opened_by] ? ` por ${ops[reg.opened_by]}` : ''}</>
                : 'Caixa fechado'}
            </p>
          </div>
          {reg && <span className="badge bg-signal-100 text-signal-700">● Caixa aberto</span>}
        </div>

        {!reg ? (
          <OpenRegister wid={wid!} sid={sid} lastClosed={lastClosed} ops={ops} canReopen={can('reabrir_caixa')} onDone={load} />
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
              <Kpi label="Dinheiro na gaveta" value={brl(summary?.expected_cash)} strong />
              <Kpi label="Recebido no caixa" value={brl(Object.values(summary?.by_method ?? {}).reduce((a, b) => a + Number(b), 0))} />
              <Kpi label="PIX + cartões" value={brl(Number(summary?.by_method.pix ?? 0) + Number(summary?.by_method.debito ?? 0) + Number(summary?.by_method.credito ?? 0))} />
              <Kpi label="Saídas (vales, despesas, sangrias)" value={brl(Number(summary?.by_kind.vale ?? 0) + Number(summary?.by_kind.despesa ?? 0) + Number(summary?.by_kind.sangria ?? 0))} />
            </div>

            <div className="flex gap-2 mb-4">
              {([['receber', '🧾 Receber OS'], ['movimentos', '↕️ Movimentações'], ['fechar', '🔒 Fechar caixa']] as [Tab, string][]).map(([k, l]) => (
                <button key={k} onClick={() => setTab(k)}
                  className={`text-sm font-semibold px-4 py-2 rounded-full border transition ${
                    tab === k ? 'bg-steel-900 text-white border-steel-900' : 'bg-white text-steel-600 border-steel-200'}`}>
                  {l}
                </button>
              ))}
            </div>

            {tab === 'receber' && (
              <ReceiveTab wid={wid!} sid={sid} registerId={reg.id} entriesCount={entries.length} canDiscount={can('dar_desconto')} canFix={can('cancelar_recebimento')} canCallMechanic={canCallMechanic} team={team} onDone={load}
                focusOs={focusOs} onFocusUsed={() => setParams({}, { replace: true })} />
            )}
            {tab === 'movimentos' && (
              <MovementsTab wid={wid!} sid={sid} entries={entries} ops={ops} team={team}
                canCancel={can('cancelar_recebimento')} onDone={load} />
            )}
            {tab === 'fechar' && summary && <CloseTab wid={wid!} sid={sid} summary={summary} onDone={load} />}
          </>
        )}
      </div>
    </WorkshopLayout>
  );
}

function Kpi({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`rounded-2xl px-4 py-3 border ${strong ? 'bg-steel-900 text-white border-steel-900' : 'bg-white border-steel-200'}`}>
      <div className={`text-[11px] ${strong ? 'text-steel-400' : 'text-steel-500'}`}>{label}</div>
      <div className="text-xl font-bold mt-0.5">{value}</div>
    </div>
  );
}

/* ── Abrir caixa ─────────────────────────────────────────────────────────── */

function OpenRegister({ wid, sid, lastClosed, ops, canReopen, onDone }: {
  wid: string; sid: string | null; lastClosed: CashRegister | null; ops: Record<string, string>; canReopen: boolean; onDone: () => void;
}) {
  const [amount, setAmount] = useState(lastClosed?.counted_cash != null ? moneyStr(Number(lastClosed.counted_cash)) : '');
  const [busy, setBusy] = useState(false);

  async function open() {
    setBusy(true);
    const { error } = await supabase.rpc('cash_open', { p_workshop: wid, p_session: sid, p_amount: parseMoney(amount) });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success('Caixa aberto');
    onDone();
  }

  async function reopen() {
    if (!lastClosed || !confirm('Reabrir o último caixa fechado?')) return;
    const { error } = await supabase.rpc('cash_reopen', { p_workshop: wid, p_session: sid, p_register: lastClosed.id });
    if (error) return toast.error(error.message);
    toast.success('Caixa reaberto');
    onDone();
  }

  const diff = lastClosed?.counted_cash != null && lastClosed.expected_cash != null
    ? Number(lastClosed.counted_cash) - Number(lastClosed.expected_cash) : null;

  return (
    <div className="grid md:grid-cols-2 gap-4">
      <div className="card">
        <h2 className="text-lg font-bold">Abrir o caixa</h2>
        <p className="text-sm text-steel-500 mt-1">Informe quanto tem de troco na gaveta para começar.</p>
        <div className="label mt-4 mb-1">Troco inicial (R$)</div>
        <input className="input text-lg" inputMode="decimal" placeholder="0,00" value={amount} onChange={e => setAmount(e.target.value)} />
        <button onClick={open} disabled={busy} className="btn-primary w-full mt-4 btn-lg">{busy ? 'Abrindo…' : 'Abrir caixa'}</button>
      </div>

      {lastClosed && (
        <div className="card">
          <div className="text-xs text-steel-500">Último fechamento</div>
          <div className="font-semibold">
            {new Date(lastClosed.closed_at!).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
            {lastClosed.closed_by && ops[lastClosed.closed_by] ? ` · ${ops[lastClosed.closed_by]}` : ''}
          </div>
          <div className="mt-3 space-y-1 text-sm">
            <Line label="Dinheiro esperado" value={brl(lastClosed.expected_cash)} />
            <Line label="Dinheiro contado" value={brl(lastClosed.counted_cash)} />
            {diff !== null && (
              <Line label="Diferença" value={`${diff > 0 ? '+' : ''}${brl(diff)}`}
                cls={Math.abs(diff) < 0.005 ? 'text-signal-700' : 'text-alert-600'} />
            )}
          </div>
          {lastClosed.close_notes && <div className="text-xs text-steel-500 mt-2">📝 {lastClosed.close_notes}</div>}
          {canReopen && <button onClick={reopen} className="btn-ghost text-sm mt-3">Reabrir este caixa</button>}
        </div>
      )}
    </div>
  );
}

function Line({ label, value, cls = '' }: { label: string; value: string; cls?: string }) {
  return <div className="flex justify-between gap-3"><span className="text-steel-500">{label}</span><span className={`font-semibold ${cls}`}>{value}</span></div>;
}

/* ── Receber OS ──────────────────────────────────────────────────────────── */

function ReceiveTab({ wid, sid, registerId, entriesCount, canDiscount, canFix, canCallMechanic, team, onDone, focusOs, onFocusUsed }: {
  wid: string; sid: string | null; registerId: string; entriesCount: number; canDiscount: boolean; canFix: boolean; canCallMechanic: boolean;
  team: WorkshopMechanic[]; onDone: () => void;
  focusOs: string | null; onFocusUsed: () => void;
}) {
  const nav = useNavigate();
  const [list, setList]   = useState<OpenOs[] | null>(null);
  const [q, setQ]         = useState('');
  const [picked, setPicked] = useState<OpenOs | null>(null);
  const [newOs, setNewOs] = useState(false);
  const [selling, setSelling] = useState(false);
  const [calling, setCalling] = useState<CallMechanicOs | null>(null);
  /* OS já recebida: definir/corrigir responsável (e chamar mecânico da plataforma) */
  const [setting, setSetting] = useState<PaidOs | null>(null);
  const [paidKey, setPaidKey] = useState(0);

  const load = useCallback(async () => {
    const { data } = await supabase.from('service_orders')
      .select('id, number, title, price, paid_amount, counter_discount, status, completed_at, created_at, executor, workshop_mechanic_id, pay_later_due, pay_later_note, customer:customers(full_name), vehicle:vehicles(plate, make, model)')
      .eq('workshop_id', wid).in('status', ['open', 'approved', 'in_progress', 'completed'])
      .order('created_at', { ascending: false }).limit(500);
    const rows = ((data as unknown as OpenOs[]) ?? []).filter(o => remainingOf(o) > 0.004);
    rows.sort((a, b) => (a.status === 'completed' ? 0 : 1) - (b.status === 'completed' ? 0 : 1));
    setList(rows);
  }, [wid]);

  useEffect(() => { load(); }, [load]);

  /* Veio da tela da OS ("Receber no caixa"): já abre o recebimento dela */
  useEffect(() => {
    if (!focusOs || !list) return;
    const o = list.find(x => x.id === focusOs);
    if (o) setPicked(o);
    else toast.info('Essa OS não tem valor em aberto para receber.');
    onFocusUsed();
  }, [focusOs, list]); // eslint-disable-line react-hooks/exhaustive-deps

  const [period, setPeriod] = useState<DatePeriod>('all');
  const [from, setFrom] = useState('');
  const [to, setTo]     = useState('');

  // Recebidas: no período escolhido (qualquer caixa); em "Todas", só as deste caixa
  const [pStart, pEnd] = periodRange(period, from, to);
  const periodName = DATE_PERIODS.find(([k]) => k === period)?.[1] ?? '';
  const paidFilter = pStart === null && pEnd === null
    ? { registerId }
    // sem fim = até a meia-noite de amanhã (valor fixo no dia, para a lista não recarregar a cada render)
    : { workshopId: wid, from: new Date(pStart ?? 0).toISOString(), to: new Date(pEnd ?? (() => { const d = new Date(); d.setHours(24, 0, 0, 0); return d.getTime(); })()).toISOString() };
  const paidTitle = 'registerId' in paidFilter
    ? '✅ Recebidas neste caixa'
    : `✅ Recebidas · ${period === 'custom' ? [from, to].filter(Boolean).map(d => new Date(`${d}T12:00:00`).toLocaleDateString('pt-BR')).join(' até ') : periodName}`;

  const matches = (o: OpenOs, t: string) => !t ||
    osNum(o).includes(t) ||
    (o.customer?.full_name ?? '').toLowerCase().includes(t) ||
    (o.vehicle?.plate ?? '').toLowerCase().replace(/[^a-z0-9]/g, '').includes(t.replace(/ /g, '')) ||
    o.title.toLowerCase().includes(t);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase().replace(/[^a-z0-9à-ú ]/g, '');
    const [start, end] = periodRange(period, from, to);
    const inDate = (o: OpenOs) => {
      const d = osDate(o);
      return (!start || d >= start) && (!end || d < end);
    };
    if (!list) return [];
    // "Pagar depois" fica numa lista à parte (sai da fila do dia)
    return list.filter(o => !o.pay_later_due && inDate(o) && matches(o, t));
  }, [list, q, period, from, to]);

  /** Combinadas para pagar depois — todas, as que vencem primeiro no topo (só a busca filtra) */
  const later = useMemo(() => {
    const t = q.trim().toLowerCase().replace(/[^a-z0-9à-ú ]/g, '');
    return (list ?? []).filter(o => !!o.pay_later_due && matches(o, t))
      .sort((a, b) => a.pay_later_due!.localeCompare(b.pay_later_due!));
  }, [list, q]);

  const osRow = (o: OpenOs) => {
    const rem = remainingOf(o);
    return (
      <div key={o.id} className="flex items-center gap-3 px-4 py-3">
        <div className="flex-1 min-w-0">
          <div className="font-semibold truncate">
            OS nº {osNum(o)} · {o.customer?.full_name ?? 'Sem cliente'}
          </div>
          <div className="text-xs text-steel-500 truncate">
            {[o.vehicle?.plate, [o.vehicle?.make, o.vehicle?.model].filter(Boolean).join(' '), o.title].filter(Boolean).join(' · ')}
          </div>
          <div className="flex gap-1 mt-1">
            <span className={`badge text-[10px] ${o.status === 'completed' ? 'bg-signal-100 text-signal-700' : 'bg-steel-100 text-steel-600'}`}>{STATUS_LABEL[o.status] ?? o.status}</span>
            <span className="text-[10px] text-steel-400 self-center">
              {o.completed_at ? 'concluída' : 'aberta'} em {new Date(osDate(o)).toLocaleDateString('pt-BR')}
            </span>
            {o.paid_amount > 0 && <span className="badge text-[10px] bg-pending-100 text-pending-800">Parcialmente paga</span>}
            {o.pay_later_due && (
              <span className={`badge text-[10px] ${daysToDue(o.pay_later_due) < 0 ? 'bg-alert-100 text-alert-700' : 'bg-brand-50 text-brand-700'}`}>
                🕒 Pagar depois · {dueLabel(o.pay_later_due)}
              </span>
            )}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="font-bold">{brl(rem)}</div>
          {o.paid_amount > 0 && <div className="text-[11px] text-steel-400">de {brl(o.price)}</div>}
          {o.pay_later_note && <div className="text-[11px] text-steel-500 max-w-[160px] truncate" title={o.pay_later_note}>📝 {o.pay_later_note}</div>}
        </div>
        <div className="flex flex-col sm:flex-row gap-2 shrink-0">
          <Link to={`/oficina/os/${o.id}`} className="btn-secondary text-sm text-center" title="Serviços, valores, quem fez e agendamento">✏️ Editar OS</Link>
          {canCallMechanic && o.status !== 'completed' && (
            <button onClick={() => setCalling(o)} className="btn-secondary text-sm" title="Publicar demanda com os serviços desta OS">🔧 Chamar mecânico</button>
          )}
          <button onClick={() => setPicked(o)} className="btn-primary text-sm">Receber</button>
        </div>
      </div>
    );
  };

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-3">
        <input className="input flex-1 min-w-[200px]" placeholder="Buscar por nº da OS, cliente, placa…" value={q} onChange={e => setQ(e.target.value)} autoFocus />
        <button onClick={() => setSelling(true)} className="btn-secondary shrink-0" title="Venda no balcão, sem serviço (óleo, palheta…)">🛒 Venda de peças</button>
        <button onClick={() => setNewOs(true)} className="btn-secondary shrink-0">+ Nova OS</button>
      </div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        {DATE_PERIODS.map(([k, l]) => (
          <button key={k} onClick={() => setPeriod(k)}
            className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition ${
              period === k ? 'bg-steel-900 text-white border-steel-900' : 'bg-white text-steel-600 border-steel-200'}`}>
            {l}
          </button>
        ))}
        {period === 'custom' && (
          <div className="flex items-center gap-1.5 text-xs text-steel-500">
            <input type="date" className="input !py-1.5 !text-xs w-auto" value={from} onChange={e => setFrom(e.target.value)} />
            até
            <input type="date" className="input !py-1.5 !text-xs w-auto" value={to} onChange={e => setTo(e.target.value)} />
          </div>
        )}
        {list && <span className="text-xs text-steel-400 ml-auto">{shown.length} OS · {brl(shown.reduce((a, o) => a + remainingOf(o), 0))} em aberto</span>}
      </div>
      {list === null ? (
        <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-16 bg-white rounded-2xl animate-pulse" />)}</div>
      ) : shown.length === 0 ? (
        <div className="card text-center py-10 text-sm text-steel-500">
          {list.length === 0 ? 'Nenhuma OS com valor em aberto.' : later.length && !list.some(o => !o.pay_later_due) ? 'Nenhuma OS para receber agora — veja as combinadas para pagar depois abaixo.' : 'Nenhuma OS encontrada.'}
        </div>
      ) : (
        <div className="card p-0 divide-y divide-steel-100">
          {shown.map(osRow)}
        </div>
      )}

      {later.length > 0 && (
        <div className="mt-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
            <h2 className="text-sm font-bold text-steel-700">🕒 Pagar depois</h2>
            <span className="text-xs text-steel-500">
              {later.length} OS · <strong className="text-steel-700">{brl(later.reduce((a, o) => a + remainingOf(o), 0))}</strong>
              {later.some(o => daysToDue(o.pay_later_due!) < 0) && (
                <span className="text-alert-600 font-semibold"> · {brl(later.filter(o => daysToDue(o.pay_later_due!) < 0).reduce((a, o) => a + remainingOf(o), 0))} vencido</span>
              )}
            </span>
          </div>
          <div className="card p-0 divide-y divide-steel-100">
            {later.map(osRow)}
          </div>
        </div>
      )}

      <div className="mt-6">
        <PaymentsList filter={paidFilter} reloadKey={`${entriesCount}-${paidKey}`} fix={canFix ? { wid, sid } : undefined} title={paidTitle} empty={paidFilter && 'registerId' in paidFilter ? 'Nenhuma OS recebida neste caixa ainda.' : 'Nenhuma OS recebida neste período.'}
          action={os => (
            <div className="flex flex-col sm:flex-row gap-1.5">
              <Link to={`/oficina/os/${os.id}`} className="btn-secondary text-xs !px-3 !py-1.5 whitespace-nowrap text-center">✏️ Editar OS</Link>
              {canCallMechanic && os.items?.some(i => i.kind === 'labor' && i.executor === 'platform') && (
                <button onClick={() => setCalling(os)} className="btn-secondary text-xs !px-3 !py-1.5 whitespace-nowrap">🔧 Chamar mecânico</button>
              )}
              <button onClick={() => setSetting(os)} className="btn-secondary text-xs !px-3 !py-1.5 whitespace-nowrap">
                {paidResponsibles(os).missing ? '⚠️ Definir responsáveis' : '👥 Responsáveis'}
              </button>
            </div>
          )} />
      </div>

      {newOs && (
        <NewOsModal
          workshopId={wid}
          onClose={() => setNewOs(false)}
          onCreated={(id, number) => {
            setNewOs(false);
            toast.success(`OS nº ${String(number ?? '').padStart(4, '0')} aberta ✓ — lance as peças e serviços e toque em Receber no caixa`);
            nav(`/oficina/os/${id}`);
          }}
        />
      )}

      {selling && (
        <CounterSaleModal wid={wid} sid={sid} canDiscount={canDiscount}
          onClose={() => setSelling(false)}
          onDone={() => { setSelling(false); setPaidKey(k => k + 1); onDone(); }} />
      )}

      {calling && <CallMechanicModal wid={wid} os={calling} onClose={() => setCalling(null)} />}

      {setting && (
        <AssignmentsModal os={setting} team={team} title={`OS nº ${osNum(setting)}`} wid={wid} sid={sid}
          onClose={() => setSetting(null)}
          onSaved={callPlatform => {
            const os = setting;
            setSetting(null); setPaidKey(k => k + 1);
            if (callPlatform && canCallMechanic) setCalling(os);
          }} />
      )}

      {picked && (
        <ReceiveModal os={picked} wid={wid} sid={sid} canDiscount={canDiscount} team={team}
          onClose={() => setPicked(null)}
          onDone={callPlatform => {
            const os = picked;
            setPicked(null); load(); onDone();
            // Escolheu "mecânico da plataforma" agora: já abre a chamada com os serviços da OS
            if (callPlatform && canCallMechanic) setCalling(os);
          }} />
      )}
    </div>
  );
}

type Part = { method: PayMethod; amount: string; installments: number };

function ReceiveModal({ os, wid, sid, canDiscount, team, onClose, onDone }: {
  os: OpenOs; wid: string; sid: string | null; canDiscount: boolean; team: WorkshopMechanic[];
  onClose: () => void; onDone: (callPlatform: boolean) => void;
}) {
  const open = remainingOf(os);
  const who = useReceiveAssignments(os, team);
  const comm = useOsCommission(os.id, who);
  const [discount, setDiscount] = useState('');
  const [parts, setParts] = useState<Part[]>([{ method: 'dinheiro', amount: moneyStr(open), installments: 1 }]);
  const [given, setGiven] = useState('');
  const [busy, setBusy]   = useState(false);
  // "Pagar depois": o que faltar fica como conta a receber, com vencimento
  const [later, setLater] = useState(!!os.pay_later_due);
  const [dueDate, setDueDate] = useState(os.pay_later_due ?? (() => { const d = new Date(); d.setDate(d.getDate() + 7); return d.toISOString().slice(0, 10); })());
  const [laterNote, setLaterNote] = useState(os.pay_later_note ?? '');

  const disc = parseMoney(discount);
  const due = Math.max(0, Math.round((open - disc) * 100) / 100);
  const total = Math.round(parts.reduce((a, p) => a + parseMoney(p.amount), 0) * 100) / 100;
  const missing = Math.round((due - total) * 100) / 100;
  const cashPart = parts.filter(p => p.method === 'dinheiro').reduce((a, p) => a + parseMoney(p.amount), 0);
  const givenN = parseMoney(given);
  const change = given ? Math.round((givenN - cashPart) * 100) / 100 : 0;

  const setPart = (i: number, patch: Partial<Part>) => setParts(ps => ps.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  function addPart() {
    const used = new Set(parts.map(p => p.method));
    const next = RECEIVE_METHODS.find(m => !used.has(m)) ?? 'pix';
    setParts(ps => [...ps, { method: next, amount: missing > 0 ? moneyStr(missing) : '', installments: 1 }]);
  }

  async function confirmReceive() {
    if (!who.valid) return toast.error('Informe quem fez cada serviço: mecânico da loja ou da plataforma');
    if (!comm.valid) return toast.error('Escolha quem recebe cada comissão');
    const deferring = later && missing > 0.004;
    if (total <= 0 && !deferring) return toast.error('Informe o valor recebido');
    if (missing < -0.004) return toast.error('O total passa do valor em aberto');
    if (given && givenN < cashPart) return toast.error('O valor entregue é menor que a parte em dinheiro');
    if (deferring && !dueDate) return toast.error('Informe até quando o cliente vai pagar');
    if (missing > 0.004 && !deferring && !confirm(`Vai ficar faltando ${brl(missing)} nesta OS. Confirmar recebimento parcial?`)) return;
    setBusy(true);
    const { error: rErr } = await who.save();
    if (rErr) { setBusy(false); return toast.error('Não consegui salvar quem fez: ' + rErr.message); }
    const { error: cErr } = await comm.save(wid, sid);
    if (cErr) { setBusy(false); return toast.error('Não consegui salvar as comissões: ' + cErr.message); }
    if (total > 0) {
      const { error } = await supabase.rpc('cash_receive_os', {
        p_workshop: wid, p_session: sid, p_os: os.id,
        p_parts: parts.filter(p => parseMoney(p.amount) > 0).map(p => ({ method: p.method, amount: parseMoney(p.amount), installments: p.installments })),
        p_discount: disc, p_cash_given: given ? givenN : null,
      });
      if (error) { setBusy(false); return toast.error(error.message); }
    }
    // Combinou pagar depois (ou desfez o combinado)
    if (deferring || os.pay_later_due) {
      const { error } = await supabase.rpc('cash_pay_later', {
        p_workshop: wid, p_session: sid, p_os: os.id,
        p_due: deferring ? dueDate : null, p_note: deferring ? laterNote : null,
      });
      if (error) { setBusy(false); return toast.error((total > 0 ? 'Recebimento registrado, mas o "pagar depois" não foi salvo: ' : '') + error.message); }
    }
    setBusy(false);
    toast.success(deferring
      ? `${total > 0 ? `Recebido ${brl(total)} · ` : ''}${brl(missing)} para pagar até ${new Date(`${dueDate}T12:00:00`).toLocaleDateString('pt-BR')}`
      : change > 0 ? `Recebido! Troco: ${brl(change)}` : 'Recebimento registrado');
    onDone(who.callPlatform);
  }

  return (
    <div className="fixed inset-0 z-50 bg-steel-900/60 grid place-items-center p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl w-full max-w-lg max-h-[92vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold">Receber OS nº {osNum(os)}</h2>
            <div className="text-sm text-steel-500">{os.customer?.full_name ?? 'Sem cliente'}{os.vehicle?.plate ? ` · ${os.vehicle.plate}` : ''}</div>
          </div>
          <button onClick={onClose} className="text-steel-400 hover:text-steel-700 text-xl leading-none" aria-label="Fechar">×</button>
        </div>

        <div className="rounded-2xl bg-steel-50 px-4 py-3 mt-4 space-y-1 text-sm">
          <Line label="Total da OS" value={brl(os.price)} />
          {os.counter_discount > 0 && <Line label="Desconto já dado" value={`− ${brl(os.counter_discount)}`} />}
          {os.paid_amount > 0 && <Line label="Já pago" value={`− ${brl(os.paid_amount)}`} />}
          {disc > 0 && <Line label="Desconto agora" value={`− ${brl(disc)}`} />}
          <div className="flex justify-between pt-1 border-t border-steel-200 text-base">
            <span className="font-semibold">A receber</span><span className="font-bold">{brl(due)}</span>
          </div>
        </div>

        <ReceiveAssignments a={who} team={team} />
        <OsCommission c={comm} team={team} />
        {who.callPlatform && (
          <p className="text-[11px] text-steel-500 mt-1">Depois de confirmar, abre a chamada do mecânico da plataforma com esses serviços.</p>
        )}

        {canDiscount && (
          <div className="mt-3">
            <div className="label mb-1">Desconto (R$)</div>
            <input className="input" inputMode="decimal" placeholder="0,00" value={discount} onChange={e => setDiscount(e.target.value)} />
          </div>
        )}

        <div className="label mt-4 mb-2">Formas de pagamento</div>
        <div className="space-y-2">
          {parts.map((p, i) => (
            <div key={i} className="flex gap-2 items-center">
              <select className="input flex-1 min-w-0" value={p.method} onChange={e => setPart(i, { method: e.target.value as PayMethod, installments: 1 })}>
                {RECEIVE_METHODS.map(m => <option key={m} value={m}>{METHODS[m].icon} {METHODS[m].label}</option>)}
              </select>
              {p.method === 'credito' && (
                <select className="input !w-16 shrink-0 !px-2" value={p.installments} onChange={e => setPart(i, { installments: Number(e.target.value) })}>
                  {Array.from({ length: 12 }, (_, k) => k + 1).map(n => <option key={n} value={n}>{n}x</option>)}
                </select>
              )}
              <input className="input !w-28 shrink-0 text-right" inputMode="decimal" placeholder="0,00" value={p.amount} onChange={e => setPart(i, { amount: e.target.value })} />
              {parts.length > 1 && (
                <button onClick={() => setParts(ps => ps.filter((_, j) => j !== i))} className="text-steel-400 hover:text-alert-600 px-1" aria-label="Remover">✕</button>
              )}
            </div>
          ))}
        </div>
        <button onClick={addPart} className="text-sm font-semibold text-brand-600 mt-2">+ Adicionar outra forma</button>

        <div className={`mt-3 text-sm font-semibold ${Math.abs(missing) < 0.005 ? 'text-signal-700' : missing > 0 ? (later ? 'text-brand-700' : 'text-pending-800') : 'text-alert-600'}`}>
          {Math.abs(missing) < 0.005 ? '✓ Valor fechado' : missing > 0 ? (later ? `🕒 ${brl(missing)} para pagar depois` : `Falta ${brl(missing)}`) : `Passou ${brl(-missing)} do valor em aberto`}
        </div>

        {/* Pagar depois */}
        <div className={`mt-3 rounded-2xl border-2 p-3 transition ${later ? 'border-brand-300 bg-brand-50/40' : 'border-steel-200'}`}>
          <label className="flex items-start gap-2 cursor-pointer">
            <input type="checkbox" className="mt-1" checked={later} onChange={e => {
              setLater(e.target.checked);
              // Tudo para depois: zera a forma que veio preenchida com o total
              if (e.target.checked && parts.length === 1 && Math.abs(parseMoney(parts[0].amount) - due) < 0.005) setParts([{ ...parts[0], amount: '' }]);
            }} />
            <span>
              <span className="font-semibold text-sm">🕒 Pagar depois</span>
              <span className="block text-[11px] text-steel-500">O que faltar fica como conta a receber. Não entra na gaveta; recebe quando o cliente pagar.</span>
            </span>
          </label>
          {later && (
            <div className="grid sm:grid-cols-2 gap-2 mt-3">
              <label className="text-[11px] text-steel-500">Vai pagar até *
                <input type="date" className="input mt-0.5" value={dueDate} onChange={e => setDueDate(e.target.value)} />
              </label>
              <label className="text-[11px] text-steel-500">Observação (opcional)
                <input className="input mt-0.5" placeholder="Ex.: paga no dia 10" value={laterNote} onChange={e => setLaterNote(e.target.value)} />
              </label>
            </div>
          )}
        </div>

        {cashPart > 0 && (
          <div className="mt-4 grid grid-cols-2 gap-3 items-end">
            <div>
              <div className="label mb-1">Cliente entregou (R$)</div>
              <input className="input" inputMode="decimal" placeholder={moneyStr(cashPart)} value={given} onChange={e => setGiven(e.target.value)} />
            </div>
            <div className="rounded-xl bg-steel-50 px-3 py-2.5">
              <div className="text-[11px] text-steel-500">Troco</div>
              <div className={`text-lg font-bold ${change < 0 ? 'text-alert-600' : ''}`}>{brl(Math.max(0, change))}</div>
            </div>
          </div>
        )}

        <div className="flex gap-2 mt-6">
          <button onClick={onClose} className="btn-ghost flex-1">Cancelar</button>
          <button onClick={confirmReceive} disabled={busy || !who.valid || (total <= 0 && !(later && missing > 0.004)) || missing < -0.004} className="btn-primary flex-[2] btn-lg">
            {busy ? 'Registrando…' : later && missing > 0.004 ? (total > 0 ? `Receber ${brl(total)} · resto depois` : `Confirmar ${brl(missing)} para depois`) : `Confirmar ${brl(total)}`}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Movimentações ───────────────────────────────────────────────────────── */

const MOVE_KINDS: EntryKind[] = ['vale', 'despesa', 'sangria', 'suprimento', 'entrada'];

function MovementsTab({ wid, sid, entries, ops, team, canCancel, onDone }: {
  wid: string; sid: string | null; entries: CashEntry[]; ops: Record<string, string>; team: WorkshopMechanic[];
  canCancel: boolean; onDone: () => void;
}) {
  const [kind, setKind] = useState<EntryKind | null>(null);
  const [payOs, setPayOs] = useState<Record<string, string>>({});
  const teamName = (id: string | null) => team.find(t => t.id === id)?.name;

  /* recebimento → OS de origem */
  useEffect(() => {
    const ids = [...new Set(entries.map(e => e.payment_id).filter(Boolean))] as string[];
    if (!ids.length) return;
    supabase.from('os_payments').select('id, service_order_id').in('id', ids)
      .then(({ data }) => setPayOs(Object.fromEntries(((data as { id: string; service_order_id: string }[]) ?? []).map(x => [x.id, x.service_order_id]))));
  }, [entries]);

  async function cancel(e: CashEntry) {
    const what = e.payment_id ? 'o recebimento inteiro desta OS (todas as formas de pagamento)' : 'este lançamento';
    const reason = prompt(`Estornar ${what}?\nInforme o motivo:`);
    if (!reason?.trim()) return;
    const { error } = await supabase.rpc('cash_cancel', {
      p_workshop: wid, p_session: sid, p_reason: reason,
      p_payment: e.payment_id, p_entry: e.payment_id ? null : e.id,
    });
    if (error) return toast.error(error.message);
    toast.success('Estornado');
    onDone();
  }

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-4">
        {MOVE_KINDS.map(k => (
          <button key={k} onClick={() => setKind(k)}
            className="rounded-2xl border border-steel-200 bg-white hover:border-brand-500 hover:shadow-sm transition px-3 py-3 text-left">
            <div className="text-lg">{KINDS[k].icon}</div>
            <div className="text-sm font-semibold mt-1">{KINDS[k].label}</div>
            <div className={`text-[11px] ${KINDS[k].sign > 0 ? 'text-signal-700' : 'text-alert-600'}`}>{KINDS[k].sign > 0 ? 'entra na gaveta' : 'sai da gaveta'}</div>
          </button>
        ))}
      </div>

      {entries.length === 0 ? (
        <div className="card text-center py-10 text-sm text-steel-500">Nenhum lançamento neste caixa ainda.</div>
      ) : (
        <div className="card p-0 divide-y divide-steel-100">
          {entries.map(e => {
            const k = KINDS[e.kind];
            const cancelled = !!e.cancelled_at;
            return (
              <div key={e.id} className={`flex items-center gap-3 px-4 py-3 ${cancelled ? 'opacity-50' : ''}`}>
                <div className="text-xs text-steel-400 w-10 shrink-0">{hhmm(e.created_at)}</div>
                <div className="flex-1 min-w-0">
                  <div className={`text-sm font-semibold truncate ${cancelled ? 'line-through' : ''}`}>
                    {k.icon} {k.label}
                    {e.kind === 'recebimento' && ` · ${METHODS[e.method].label}${e.installments > 1 ? ` ${e.installments}x` : ''}`}
                    {e.kind === 'vale' && teamName(e.mechanic_id) && ` · ${teamName(e.mechanic_id)}`}
                    {e.category && ` · ${e.category}`}
                  </div>
                  <div className="text-xs text-steel-500 truncate">
                    {e.kind === 'recebimento' && e.payment_id && payOs[e.payment_id] && (
                      <Link to={`/oficina/os/${payOs[e.payment_id]}`} className="text-brand-600 font-semibold hover:underline mr-1">ver OS ›</Link>
                    )}
                    {[e.description, e.operator_id && ops[e.operator_id] ? `por ${ops[e.operator_id]}` : null,
                      cancelled ? `estornado: ${e.cancel_reason}` : null].filter(Boolean).join(' · ')}
                  </div>
                </div>
                <div className={`font-bold shrink-0 ${e.method !== 'dinheiro' ? 'text-steel-700' : k.sign > 0 ? 'text-signal-700' : 'text-alert-600'}`}>
                  {k.sign > 0 ? '+' : '−'} {brl(e.amount)}
                </div>
                {canCancel && !cancelled && (
                  <button onClick={() => cancel(e)} className="text-[11px] text-steel-400 hover:text-alert-600 shrink-0">Estornar</button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {kind && (
        <MovementModal kind={kind} wid={wid} sid={sid} team={team}
          onClose={() => setKind(null)} onDone={() => { setKind(null); onDone(); }} />
      )}
    </div>
  );
}

function MovementModal({ kind, wid, sid, team, onClose, onDone }: {
  kind: EntryKind; wid: string; sid: string | null; team: WorkshopMechanic[]; onClose: () => void; onDone: () => void;
}) {
  const k = KINDS[kind];
  const [amount, setAmount]     = useState('');
  const [category, setCategory] = useState(kind === 'despesa' ? EXPENSE_CATEGORIES[0] : '');
  const [mechanic, setMechanic] = useState('');
  const [desc, setDesc]         = useState('');
  const [busy, setBusy]         = useState(false);

  async function save() {
    if (parseMoney(amount) <= 0) return toast.error('Informe o valor');
    if (kind === 'vale' && !mechanic) return toast.error('Escolha o colaborador');
    setBusy(true);
    const { error } = await supabase.rpc('cash_movement', {
      p_workshop: wid, p_session: sid, p_kind: kind, p_amount: parseMoney(amount),
      p_category: kind === 'despesa' ? category : null, p_description: desc || null, p_mechanic: kind === 'vale' ? mechanic : null,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`${k.label} lançado`);
    onDone();
  }

  return (
    <div className="fixed inset-0 z-50 bg-steel-900/60 grid place-items-center p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
        <h2 className="text-xl font-bold">{k.icon} {k.label}</h2>
        <p className="text-sm text-steel-500">{k.desc}</p>

        {kind === 'vale' && (
          <>
            <div className="label mt-4 mb-1">Colaborador</div>
            <select className="input" value={mechanic} onChange={e => setMechanic(e.target.value)}>
              <option value="">Escolha…</option>
              {team.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </>
        )}
        {kind === 'despesa' && (
          <>
            <div className="label mt-4 mb-1">Categoria</div>
            <select className="input" value={category} onChange={e => setCategory(e.target.value)}>
              {EXPENSE_CATEGORIES.map(c => <option key={c}>{c}</option>)}
            </select>
          </>
        )}

        <div className="label mt-4 mb-1">Valor (R$)</div>
        <input className="input text-lg" inputMode="decimal" placeholder="0,00" value={amount} onChange={e => setAmount(e.target.value)} autoFocus />

        <div className="label mt-4 mb-1">Observação {kind !== 'entrada' && <span className="text-steel-400 font-normal">(opcional)</span>}</div>
        <input className="input" value={desc} onChange={e => setDesc(e.target.value)}
          placeholder={kind === 'sangria' ? 'Ex.: levado para o cofre' : kind === 'entrada' ? 'Ex.: venda de óleo no balcão' : ''} />

        <div className="flex gap-2 mt-6">
          <button onClick={onClose} className="btn-ghost flex-1">Cancelar</button>
          <button onClick={save} disabled={busy} className="btn-primary flex-[2]">{busy ? 'Salvando…' : 'Lançar'}</button>
        </div>
      </div>
    </div>
  );
}

/* ── Fechamento ──────────────────────────────────────────────────────────── */

function CloseTab({ wid, sid, summary, onDone }: { wid: string; sid: string | null; summary: CashSummary; onDone: () => void }) {
  const [counted, setCounted] = useState('');
  const [notes, setNotes]     = useState('');
  const [busy, setBusy]       = useState(false);
  const expected = Number(summary.expected_cash);
  const diff = counted ? Math.round((parseMoney(counted) - expected) * 100) / 100 : null;

  async function close() {
    if (!counted) return toast.error('Conte o dinheiro da gaveta e informe o valor');
    if (diff !== null && Math.abs(diff) > 0.004 && !notes.trim()
        && !confirm(`Há uma diferença de ${brl(diff)}. Fechar mesmo assim, sem observação?`)) return;
    setBusy(true);
    const { error } = await supabase.rpc('cash_close', { p_workshop: wid, p_session: sid, p_counted: parseMoney(counted), p_notes: notes || null });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success('Caixa fechado');
    onDone();
  }

  const methods = (Object.keys(METHODS) as PayMethod[]).filter(m => Number(summary.by_method[m] ?? 0) > 0);

  return (
    <div className="grid md:grid-cols-2 gap-4">
      <div className="card">
        <h2 className="font-bold">Resumo do caixa</h2>
        <div className="mt-3 space-y-1 text-sm">
          <Line label="Troco inicial" value={brl(summary.opening)} />
          {methods.length === 0 && <Line label="Recebimentos" value={brl(0)} />}
          {methods.map(m => <Line key={m} label={`${METHODS[m].icon} Recebido em ${METHODS[m].label}`} value={brl(summary.by_method[m])} />)}
          {(['entrada', 'suprimento', 'vale', 'despesa', 'sangria'] as EntryKind[]).filter(k => Number(summary.by_kind[k] ?? 0) > 0).map(k => (
            <Line key={k} label={`${KINDS[k].icon} ${KINDS[k].label}`} value={`${KINDS[k].sign > 0 ? '+' : '−'} ${brl(summary.by_kind[k])}`} />
          ))}
          <div className="flex justify-between pt-2 mt-2 border-t border-steel-200 text-base">
            <span className="font-semibold">Dinheiro esperado na gaveta</span><span className="font-bold">{brl(expected)}</span>
          </div>
        </div>
        <p className="text-[11px] text-steel-400 mt-3">PIX e cartões não entram na gaveta: confira no extrato do banco e da maquininha.</p>
      </div>

      <div className="card">
        <h2 className="font-bold">Conferência</h2>
        <div className="label mt-3 mb-1">Dinheiro contado na gaveta (R$)</div>
        <input className="input text-lg" inputMode="decimal" placeholder="0,00" value={counted} onChange={e => setCounted(e.target.value)} />
        {diff !== null && (
          <div className={`mt-2 text-sm font-semibold ${Math.abs(diff) < 0.005 ? 'text-signal-700' : 'text-alert-600'}`}>
            {Math.abs(diff) < 0.005 ? '✓ Bateu certinho' : diff > 0 ? `Sobrando ${brl(diff)}` : `Faltando ${brl(-diff)}`}
          </div>
        )}
        <div className="label mt-4 mb-1">Observação</div>
        <textarea className="input min-h-[70px]" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Explique qualquer diferença" />
        <button onClick={close} disabled={busy} className="btn-primary w-full mt-4 btn-lg">{busy ? 'Fechando…' : '🔒 Fechar caixa'}</button>
      </div>
    </div>
  );
}
