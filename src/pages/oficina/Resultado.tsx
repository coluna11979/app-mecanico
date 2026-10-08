import { CSSProperties, ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import WorkshopLayout from '@/components/layout/WorkshopLayout';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { fetchAll } from '@/lib/fetchAll';
import { useModuleAllows } from '@/lib/modules';
import { fmtBRL } from '@/components/os/osHelpers';
import { Icon, type IconName } from '@/components/home/ui';
import { change, revenueSeries, salesOf, type PanelOs } from '@/lib/workshopMetrics';
import { cashFlowOf, receivables, type FinEntry, type FinOs } from '@/lib/finance';
import { platformJobStatus, type JobTone, type PlatformJob } from '@/lib/platformJob';
import { addDays, startOfDay } from '@/components/PeriodPicker';
import { greeting } from '@/lib/today';
import { timeAgo } from '@/lib/relativeTime';

/**
 * Resultado: a tela do gestor no celular. Só leitura — como a loja está indo (hoje e no mês),
 * dinheiro a entrar e a sair, quem está vendendo e a plataforma para emergências.
 * A operação (abrir OS, lançar conta, caixa…) continua nas telas de sempre, pelo "Mais".
 */

type Job = PlatformJob & { title: string };
type ActiveOs = { id: string; status: string; price: number };
type Payable = { id: string; amount: number; due_date: string };
type Mech = { id: string; name: string };

type Data = {
  sales: PanelOs[];
  active: ActiveOs[];
  entriesToday: FinEntry[];
  payables: Payable[];
  toReceive: { total: number; overdueTotal: number; count: number };
  mechanics: Mech[];
  jobs: Job[];
  at: string;
};

const SALE_COLS = 'id, number, title, status, quote_status, price, parts_cost, labor_cost, created_at, started_at, completed_at, '
  + 'approval_requested_at, approved_at, estimated_hours, workshop_mechanic_id, customer_id, customer:customers(id, full_name, created_at), vehicle:vehicles(make, model, plate)';
const JOB_COLS = 'id, title, status, mechanic_id, scheduled_at, created_at, accepted_at, en_route_at, arrived_at, pix_paid_at, started_at, completed_at, workshop_confirmed_at, cancelled_at';

const LS_SCOPE = 'resultado_escopo';
const isoDate = (d: Date) => d.toLocaleDateString('en-CA');
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const firstName = (s: string) => s.split(' ')[0];
const initialsOf = (s: string) => s.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
/** R$ sem centavos, para números grandes de destaque */
const brlShort = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
/** Entrada em cascata dos blocos */
const rise = (i: number): CSSProperties => ({ animationDelay: `${i * 60}ms` });

/** Faturamento a receber de uma loja (mesma regra do Financeiro: depois do 1º caixa ou "pagar depois") */
async function receivablesOf(wid: string) {
  const first = await supabase.from('cash_registers').select('opened_at').eq('workshop_id', wid)
    .order('opened_at').limit(1).maybeSingle();
  const since = (first.data as { opened_at: string } | null)?.opened_at ?? null;
  const rec = await fetchAll((a, b) => {
    let q = supabase.from('service_orders')
      .select('id, number, title, status, quote_status, price, paid_amount, counter_discount, pay_later_due, completed_at')
      .eq('workshop_id', wid).eq('status', 'completed').is('paid_at', null);
    q = since ? q.or(`pay_later_due.not.is.null,completed_at.gte.${since}`) : q.not('pay_later_due', 'is', null);
    return q.order('id').range(a, b);
  });
  return receivables((rec.data as unknown as FinOs[]) ?? [], since);
}

export default function Resultado() {
  const { profile, currentWorkshop, workshops } = useAuth();
  const wid = currentWorkshop?.id ?? null;
  const modAllows = useModuleAllows();
  const showPlatform = modAllows('/oficina/dashboard');

  // Duas ou mais lojas no mesmo login: dá pra ver a loja atual ou todas somadas
  const multi = workshops.length > 1;
  const [scope, setScope] = useState<'loja' | 'todas'>(() => {
    try { return localStorage.getItem(LS_SCOPE) === 'todas' ? 'todas' : 'loja'; } catch { return 'loja'; }
  });
  function pickScope(s: 'loja' | 'todas') {
    setScope(s);
    try { localStorage.setItem(LS_SCOPE, s); } catch { /* ignora */ }
  }
  const ids = useMemo(
    () => (multi && scope === 'todas' ? workshops.map(w => w.id) : wid ? [wid] : []),
    [multi, scope, workshops, wid],
  );
  const idsKey = ids.join(',');

  const [data, setData] = useState<Data | null>(null);
  const [reload, setReload] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  // Volta pro app (celular desbloqueado, troca de aba): atualiza sozinho se passou mais de 1 min
  const loadedAt = useRef(0);
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && loadedAt.current && Date.now() - loadedAt.current > 60_000) setReload(n => n + 1);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);
  // Mantém o "há X min" do botão de atualizar em dia
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick(n => n + 1), 30_000); return () => clearInterval(t); }, []);

  // Troca de loja/escopo: mostra o esqueleto; atualizar mantém os números na tela
  useEffect(() => { setData(null); }, [idsKey]);

  useEffect(() => {
    if (!ids.length) return;
    let alive = true;
    setRefreshing(true);
    (async () => {
      const now = new Date();
      const today = startOfDay(now);
      const prevMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);

      const [sales, active, ent, pay, mech, jobs, recs] = await Promise.all([
        fetchAll((a, b) => supabase.from('service_orders').select(SALE_COLS)
          .in('workshop_id', ids).eq('status', 'completed').gte('completed_at', prevMonthStart.toISOString())
          .order('id').range(a, b)),
        fetchAll((a, b) => supabase.from('service_orders').select('id, status, price')
          .in('workshop_id', ids).in('status', ['open', 'awaiting_approval', 'approved', 'in_progress'])
          .order('id').range(a, b)),
        supabase.from('cash_entries').select('id, kind, method, amount, installments, category, mechanic_id, created_at')
          .in('workshop_id', ids).is('cancelled_at', null).gte('created_at', today.toISOString()),
        supabase.from('payables').select('id, amount, due_date')
          .in('workshop_id', ids).is('paid_at', null).is('cancelled_at', null).lte('due_date', isoDate(addDays(today, 7))),
        supabase.from('workshop_mechanics').select('id, name').in('workshop_id', ids),
        showPlatform
          ? supabase.from('jobs').select(JOB_COLS).in('workshop_id', ids)
              .or('status.in.(open,assigned,in_progress),and(status.eq.completed,workshop_confirmed_at.is.null)')
              .order('created_at', { ascending: false })
          : Promise.resolve({ data: [] }),
        Promise.all(ids.map(receivablesOf)),
      ]);
      if (!alive) return;
      setData({
        sales: (sales.data as unknown as PanelOs[]) ?? [],
        active: (active.data as ActiveOs[]) ?? [],
        entriesToday: (ent.data as FinEntry[]) ?? [],
        payables: (pay.data as Payable[]) ?? [],
        toReceive: {
          total: recs.reduce((a, r) => a + r.total, 0),
          overdueTotal: recs.reduce((a, r) => a + r.overdueTotal, 0),
          count: recs.reduce((a, r) => a + r.rows.length, 0),
        },
        mechanics: (mech.data as Mech[]) ?? [],
        jobs: (jobs.data as unknown as Job[]) ?? [],
        at: new Date().toISOString(),
      });
      loadedAt.current = Date.now();
      setRefreshing(false);
    })();
    return () => { alive = false; };
  }, [idsKey, showPlatform, reload]); // eslint-disable-line react-hooks/exhaustive-deps

  const v = useMemo(() => {
    if (!data) return null;
    const now = new Date();
    const today = startOfDay(now);
    const tomorrow = addDays(today, 1);
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    // Mês anterior até o mesmo dia (comparação justa com o mês ainda em andamento)
    const prevStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const prevDays = new Date(today.getFullYear(), today.getMonth(), 0).getDate();
    const prevEnd = addDays(prevStart, Math.min(today.getDate(), prevDays));

    const day = salesOf(data.sales, { from: today, to: tomorrow });
    const lastWeek = salesOf(data.sales, { from: addDays(today, -7), to: addDays(today, -6) });
    const month = salesOf(data.sales, { from: monthStart, to: tomorrow });
    const before = salesOf(data.sales, { from: prevStart, to: prevEnd });
    const prevFull = salesOf(data.sales, { from: prevStart, to: monthStart });

    // Ritmo: média por dia corrido até hoje × dias do mês (só depois de alguns dias, senão engana)
    const elapsed = today.getDate();
    const projection = elapsed >= 5 && month.revenue > 0 ? (month.revenue / elapsed) * daysInMonth : null;

    // Quem mais vendeu no mês (responsável da OS)
    const names = new Map(data.mechanics.map(m => [m.id, m.name]));
    const byMech = new Map<string, { revenue: number; count: number }>();
    for (const o of month.sales) {
      if (!o.workshop_mechanic_id || !names.has(o.workshop_mechanic_id)) continue;
      const cur = byMech.get(o.workshop_mechanic_id) ?? { revenue: 0, count: 0 };
      cur.revenue += Number(o.price); cur.count += 1;
      byMech.set(o.workshop_mechanic_id, cur);
    }
    const ranking = [...byMech.entries()]
      .map(([id, x]) => ({ id, name: names.get(id)!, ...x }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    const todayKey = isoDate(today);
    const late = data.payables.filter(p => p.due_date < todayKey);
    const week = data.payables.filter(p => p.due_date >= todayKey);
    const sumP = (l: Payable[]) => l.reduce((a, p) => a + Number(p.amount), 0);
    const awaiting = data.active.filter(o => o.status === 'awaiting_approval');

    return {
      day, month, before, prevFull, projection, elapsed,
      dayChange: change(day.revenue, lastWeek.revenue),
      monthChange: change(month.revenue, before.revenue),
      ticketChange: change(month.ticket, before.ticket),
      received: cashFlowOf(data.entriesToday, [], { from: today, to: tomorrow }).received,
      inProgress: data.active.filter(o => o.status === 'in_progress').length,
      awaiting: { count: awaiting.length, value: awaiting.reduce((a, o) => a + Number(o.price), 0) },
      series: revenueSeries(data.sales, { from: monthStart, to: nextMonth }),
      ranking,
      toReceive: data.toReceive,
      lateTotal: sumP(late), lateCount: late.length,
      weekTotal: sumP(week), weekCount: week.length,
      platformJobs: [...data.jobs.filter(j => j.status === 'completed'), ...data.jobs.filter(j => j.status !== 'completed')],
    };
  }, [data]);

  const name = firstName(profile?.full_name ?? '');
  const now = new Date();
  const dateRaw = now.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  const dateLabel = dateRaw.charAt(0).toUpperCase() + dateRaw.slice(1);
  const monthName = now.toLocaleDateString('pt-BR', { month: 'long' });
  const weekday = now.toLocaleDateString('pt-BR', { weekday: 'long' }).split('-')[0];
  const maxBar = v ? Math.max(1, ...v.series.map(s => s.value)) : 1;
  // No escopo "todas", os números vêm somados; os links de detalhe abrem a loja atual, então somem
  const allStores = multi && scope === 'todas';
  const needsAction = v ? v.platformJobs.filter(j => platformJobStatus(j).tone === 'action').length : 0;

  return (
    <WorkshopLayout>
      <div className="max-w-xl mx-auto -mt-1 space-y-6">
        {/* ── Cabeçalho ── */}
        <header className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-medium text-steel-500">{dateLabel}</div>
            <h1 className="font-display text-[26px] font-bold tracking-tight text-steel-900 leading-tight mt-0.5 truncate">
              {greeting()}{name ? `, ${name}` : ''}
            </h1>
          </div>
          <button onClick={() => setReload(n => n + 1)} disabled={refreshing || !data}
            aria-label="Atualizar números"
            className="shrink-0 flex items-center gap-1.5 h-9 pl-2.5 pr-3 rounded-full bg-white ring-1 ring-steel-200 text-[11px] font-semibold text-steel-500 active:bg-steel-100 disabled:opacity-70">
            <svg viewBox="0 0 24 24" className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden>
              <path d="M20 12a8 8 0 1 1-2.3-5.6" /><path d="M20 4v4.5h-4.5" />
            </svg>
            {refreshing ? 'Atualizando' : data ? timeAgo(data.at) : '…'}
          </button>
        </header>

        {multi && (
          <div className="grid grid-cols-2 rounded-xl bg-steel-200/60 p-1 text-[13px] font-semibold" role="tablist" aria-label="Lojas">
            {([['loja', currentWorkshop?.business_name ?? 'Esta loja'], ['todas', `Todas as ${workshops.length} lojas`]] as const).map(([k, label]) => (
              <button key={k} role="tab" aria-selected={scope === k} onClick={() => pickScope(k)}
                className={`h-9 px-2 rounded-lg truncate transition-all ${scope === k ? 'bg-white text-steel-900 shadow-sm' : 'text-steel-500 active:text-steel-700'}`}>
                {label}
              </button>
            ))}
          </div>
        )}

        {!v ? <Skeleton /> : (
          <>
            {/* ── Painel do dia (o número que o dono quer ver primeiro) ── */}
            <section className="animate-rise" style={rise(0)}>
              <div className="relative overflow-hidden rounded-[20px] bg-steel-900 text-white px-5 pt-5 pb-4 shadow-lg shadow-steel-900/10">
                {/* brilho e trama sutis, como um painel de instrumentos */}
                <div aria-hidden className="pointer-events-none absolute -top-24 -right-20 h-56 w-56 rounded-full bg-brand-500/25 blur-3xl" />
                <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.07]"
                  style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '14px 14px' }} />

                <div className="relative flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-steel-400">Faturado hoje</span>
                  <DeltaPill value={v.dayChange} dark />
                </div>
                <div className="relative font-display text-[40px] leading-none font-bold tracking-tight tabular-nums mt-2">
                  {fmtBRL(v.day.revenue)}
                </div>
                <div className="relative text-xs text-steel-400 mt-1.5">
                  {v.dayChange == null ? `nada na ${weekday} passada para comparar` : `comparado com a ${weekday} passada`}
                </div>

                <dl className="relative grid grid-cols-3 mt-5 pt-4 border-t border-white/10">
                  <HeroStat label="Recebido" value={brlShort(v.received)} />
                  <HeroStat label="Concluídas" value={String(v.day.count)} divider />
                  <HeroStat label="Na oficina" value={String(v.inProgress)} divider />
                </dl>
              </div>
            </section>

            {/* ── Plataforma: botão de emergência + o que está rolando ── */}
            {showPlatform && (
              <section className="animate-rise space-y-2" style={rise(1)}>
                <Link to="/oficina/dashboard?nova=1"
                  className="group flex items-center gap-3 rounded-2xl bg-white ring-1 ring-brand-200 px-4 py-3.5 shadow-sm active:scale-[0.99] active:bg-brand-50 transition">
                  <span className="relative grid place-items-center h-11 w-11 rounded-xl bg-brand-500 text-white text-xl shrink-0 shadow-brand">
                    ⚡
                    {needsAction > 0 && <span className="absolute -top-1 -right-1 h-3.5 w-3.5 rounded-full bg-alert-500 ring-2 ring-white animate-pulse-soft" />}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block font-bold text-steel-900">Chamar mecânico agora</span>
                    <span className="block text-xs text-steel-500">Faltou alguém ou o pátio encheu? Peça reforço.</span>
                  </span>
                  <Chevron className="text-brand-500" />
                </Link>

                {v.platformJobs.length > 0 && (
                  <ul className="rounded-2xl bg-white ring-1 ring-steel-200/70 divide-y divide-steel-100 overflow-hidden">
                    {v.platformJobs.slice(0, 3).map(j => {
                      const st = platformJobStatus(j);
                      return (
                        <li key={j.id}>
                          <Link to={j.status === 'open' ? '/oficina/dashboard' : `/oficina/job/${j.id}/tracking`}
                            className="flex items-center gap-3 px-4 min-h-[56px] py-2.5 active:bg-steel-50">
                            <span className="relative flex h-2.5 w-2.5 shrink-0" aria-hidden>
                              {st.tone !== 'wait' && <span className={`absolute inset-0 rounded-full opacity-60 animate-ping ${TONE_DOT[st.tone]}`} />}
                              <span className={`relative h-2.5 w-2.5 rounded-full ${TONE_DOT[st.tone]}`} />
                            </span>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-semibold text-steel-900 truncate">{j.title}</div>
                              <div className={`text-xs truncate ${st.tone === 'action' ? 'text-alert-600 font-semibold' : 'text-steel-500'}`}>{st.label}</div>
                            </div>
                            <Chevron />
                          </Link>
                        </li>
                      );
                    })}
                    {v.platformJobs.length > 3 && (
                      <li><Link to="/oficina/dashboard" className="block px-4 py-2.5 text-xs font-semibold text-brand-600">
                        Ver as {v.platformJobs.length} demandas
                      </Link></li>
                    )}
                  </ul>
                )}
              </section>
            )}

            {/* ── Mês ── */}
            <section className="animate-rise" style={rise(2)}>
              <SectionTitle title={`Mês de ${monthName}`} to={allStores ? undefined : '/oficina/painel'} link="Vendas" />
              <Card>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs text-steel-500">Faturado até hoje</div>
                    <div className="font-display text-[28px] leading-tight font-bold tracking-tight tabular-nums text-steel-900">{fmtBRL(v.month.revenue)}</div>
                  </div>
                  <DeltaPill value={v.monthChange} />
                </div>
                <div className="text-xs text-steel-500 mt-0.5">
                  {v.monthChange == null ? 'Sem vendas no mês passado para comparar' : <>vs. {fmtBRL(v.before.revenue)} no mesmo período de {prevMonthName(now)}</>}
                </div>

                {/* Faturamento dia a dia; dias que ainda vão chegar ficam tracejados */}
                <div className="mt-4" aria-hidden>
                  <div className="flex items-end gap-[2px] h-[72px]">
                    {v.series.map((s, i) => {
                      const future = i >= v.elapsed;
                      const isToday = i === v.elapsed - 1;
                      return (
                        <div key={i} className={`flex-1 rounded-[3px] ${
                          future ? 'border border-dashed border-steel-200 h-[3px]'
                          : isToday ? 'bg-brand-500' : s.value ? 'bg-brand-300' : 'bg-steel-100'}`}
                          style={future ? undefined : { height: `${Math.max(s.value ? 8 : 4, (s.value / maxBar) * 100)}%` }} />
                      );
                    })}
                  </div>
                  <div className="flex justify-between text-[10px] text-steel-400 mt-1 tabular-nums">
                    <span>1</span><span>hoje</span><span>{v.series.length}</span>
                  </div>
                </div>

                {v.projection != null && (
                  <div className="mt-3 flex items-center gap-2 rounded-xl bg-steel-50 px-3 py-2.5 text-[13px] text-steel-700">
                    <Icon name="trend" size={16} className="text-brand-500 shrink-0" />
                    <span>No ritmo atual, o mês fecha em <strong className="text-steel-900 tabular-nums">~{brlShort(v.projection)}</strong>
                      {v.prevFull.revenue > 0 && <span className="text-steel-500"> (mês passado: {brlShort(v.prevFull.revenue)})</span>}
                    </span>
                  </div>
                )}

                <dl className="grid grid-cols-2 gap-3 mt-4 pt-3 border-t border-steel-100">
                  <MiniStat label="Ticket médio" value={fmtBRL(v.month.ticket)} delta={v.ticketChange} />
                  <MiniStat label="OS concluídas" value={String(v.month.count)} note={`${v.before.count} no mesmo período`} />
                </dl>
              </Card>
            </section>

            {/* ── Dinheiro ── */}
            <section className="animate-rise" style={rise(3)}>
              <SectionTitle title="Dinheiro" to={allStores ? undefined : '/oficina/financeiro'} link="Financeiro" />
              <div className="grid grid-cols-2 gap-3">
                <MoneyTile tone="in" label="Vai entrar" value={v.toReceive.total}
                  note={v.toReceive.count === 0 ? 'nada em aberto' : `a receber · ${plural(v.toReceive.count, 'OS', 'OS')}`} />
                <MoneyTile tone="out" label="Vai sair" value={v.weekTotal}
                  note={v.weekCount === 0 ? 'nada em 7 dias' : `em 7 dias · ${plural(v.weekCount, 'conta', 'contas')}`} />
              </div>
              {(v.toReceive.overdueTotal > 0 || v.lateCount > 0) && (
                <div className="mt-2 rounded-xl bg-alert-50 ring-1 ring-alert-100 px-3.5 py-2.5 space-y-1 text-[13px]">
                  {v.toReceive.overdueTotal > 0 && (
                    <div className="flex justify-between gap-3"><span className="text-alert-700">Recebimentos atrasados</span><strong className="text-alert-700 tabular-nums">{fmtBRL(v.toReceive.overdueTotal)}</strong></div>
                  )}
                  {v.lateCount > 0 && (
                    <div className="flex justify-between gap-3"><span className="text-alert-700">{plural(v.lateCount, 'conta vencida', 'contas vencidas')}</span><strong className="text-alert-700 tabular-nums">{fmtBRL(v.lateTotal)}</strong></div>
                  )}
                </div>
              )}
              {v.awaiting.count > 0 && (
                <div className="mt-2 flex items-center gap-2 rounded-xl bg-pending-50 ring-1 ring-pending-100 px-3.5 py-2.5 text-[13px] text-pending-800">
                  <Icon name="clipboard" size={15} className="shrink-0" />
                  <span><strong className="tabular-nums">{fmtBRL(v.awaiting.value)}</strong> em {plural(v.awaiting.count, 'orçamento esperando', 'orçamentos esperando')} o cliente aprovar</span>
                </div>
              )}
            </section>

            {/* ── Equipe ── */}
            <section className="animate-rise" style={rise(4)}>
              <SectionTitle title="Quem mais vendeu no mês" to={allStores ? undefined : '/oficina/desempenho'} link="Equipe" />
              <Card pad="px-4 py-2">
                {v.ranking.length === 0 ? (
                  <p className="text-sm text-steel-500 py-2">Nenhuma OS concluída com responsável neste mês.</p>
                ) : (
                  <ol className="divide-y divide-steel-100">
                    {v.ranking.map((r, i) => (
                      <li key={r.id} className="flex items-center gap-3 py-2.5">
                        <span className={`relative grid place-items-center h-9 w-9 rounded-full text-xs font-bold shrink-0 ${MEDAL[i] ?? 'bg-steel-100 text-steel-500'}`}>
                          {initialsOf(r.name)}
                          {i < 3 && <span className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full bg-white ring-1 ring-steel-200 text-[9px] font-bold text-steel-700 grid place-items-center">{i + 1}</span>}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="text-sm font-semibold text-steel-900 truncate">{r.name}</span>
                            <span className="text-sm font-bold tabular-nums shrink-0">{fmtBRL(r.revenue)}</span>
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <div className="flex-1 h-1 rounded-full bg-steel-100 overflow-hidden">
                              <div className="h-full rounded-full bg-brand-500" style={{ width: `${(r.revenue / v.ranking[0].revenue) * 100}%` }} />
                            </div>
                            <span className="text-[11px] text-steel-400 tabular-nums shrink-0">{plural(r.count, 'OS', 'OS')}</span>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </Card>
            </section>

            {/* ── Pendências da operação ── */}
            <Link to="/oficina/inicio" style={rise(5)}
              className="animate-rise flex items-center gap-3 rounded-2xl bg-white ring-1 ring-steel-200/70 px-4 py-3.5 active:bg-steel-50">
              <span className="h-10 w-10 rounded-xl bg-steel-100 text-steel-600 grid place-items-center shrink-0"><Icon name="clipboard" size={18} /></span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-semibold text-steel-900">Pendências do dia</span>
                <span className="block text-xs text-steel-500">OS paradas, agenda e o que precisa de você</span>
              </span>
              <Chevron />
            </Link>

            {allStores && (
              <p className="text-[11px] text-steel-400 text-center">
                Números somados das {workshops.length} lojas. Para ver os detalhes, escolha uma loja.
              </p>
            )}
          </>
        )}
      </div>
    </WorkshopLayout>
  );
}

/* ── Peças da tela ── */

const TONE_DOT: Record<JobTone, string> = {
  wait: 'bg-pending-400', move: 'bg-signal-500', action: 'bg-alert-500', done: 'bg-steel-300', off: 'bg-steel-200',
};
/** Ouro, prata e bronze nas iniciais do top 3 */
const MEDAL = ['bg-pending-100 text-pending-800', 'bg-steel-200 text-steel-700', 'bg-brand-100 text-brand-700'];

function prevMonthName(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() - 1, 1).toLocaleDateString('pt-BR', { month: 'long' });
}

function Card({ children, pad = 'px-4 py-4' }: { children: ReactNode; pad?: string }) {
  return <div className={`rounded-2xl bg-white ring-1 ring-steel-200/70 ${pad}`}>{children}</div>;
}

function Chevron({ className = 'text-steel-300' }: { className?: string }) {
  return <Icon name="chevron" size={16} className={`-rotate-90 shrink-0 ${className}`} />;
}

function SectionTitle({ title, to, link }: { title: string; to?: string; link?: string }) {
  return (
    <div className="flex items-center justify-between h-7 mb-2 px-0.5">
      <h2 className="text-[15px] font-bold text-steel-900 first-letter:uppercase">{title}</h2>
      {to && link && (
        <Link to={to} className="inline-flex items-center gap-0.5 h-8 -mr-1 px-1 text-xs font-semibold text-brand-600 active:text-brand-700">
          {link}<Chevron className="text-brand-500" />
        </Link>
      )}
    </div>
  );
}

function DeltaPill({ value, dark = false }: { value: number | null; dark?: boolean }) {
  if (value == null) return null;
  const up = value >= 0;
  const cls = dark
    ? (up ? 'bg-signal-500/15 text-signal-300' : 'bg-alert-500/15 text-alert-300')
    : (up ? 'bg-signal-50 text-signal-700' : 'bg-alert-50 text-alert-700');
  return (
    <span className={`inline-flex items-center gap-0.5 h-6 px-2 rounded-full text-xs font-bold tabular-nums shrink-0 ${cls}`}>
      {up ? '↑' : '↓'} {Math.abs(Math.round(value))}%
    </span>
  );
}

function HeroStat({ label, value, divider = false }: { label: string; value: string; divider?: boolean }) {
  return (
    <div className={`min-w-0 ${divider ? 'pl-3 border-l border-white/10' : ''}`}>
      <dt className="text-[10px] font-semibold uppercase tracking-wider text-steel-400 truncate">{label}</dt>
      <dd className="text-lg font-bold tabular-nums truncate mt-0.5">{value}</dd>
    </div>
  );
}

function MiniStat({ label, value, delta, note }: { label: string; value: string; delta?: number | null; note?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-steel-500">{label}</dt>
      <dd className="flex items-center gap-1.5 mt-0.5">
        <span className="font-bold text-steel-900 tabular-nums truncate">{value}</span>
        {delta !== undefined && <DeltaPill value={delta} />}
      </dd>
      {note && <div className="text-[11px] text-steel-400 mt-0.5">{note}</div>}
    </div>
  );
}

function MoneyTile({ tone, label, value, note }: { tone: 'in' | 'out'; label: string; value: number; note: string }) {
  const icon: IconName = tone === 'in' ? 'wallet' : 'receipt';
  return (
    <div className="rounded-2xl bg-white ring-1 ring-steel-200/70 px-4 py-3.5 min-w-0">
      <div className="flex items-center gap-1.5">
        <span className={`grid place-items-center h-6 w-6 rounded-md ${tone === 'in' ? 'bg-signal-50 text-signal-600' : 'bg-steel-100 text-steel-500'}`}>
          <Icon name={icon} size={13} />
        </span>
        <span className="text-xs font-semibold text-steel-600">{label}</span>
      </div>
      <div className={`font-display text-xl font-bold tracking-tight tabular-nums mt-2 truncate ${value === 0 ? 'text-steel-300' : 'text-steel-900'}`}>
        {brlShort(value)}
      </div>
      <div className="text-[11px] text-steel-500 truncate mt-0.5">{note}</div>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="space-y-6">
      <div className="h-[196px] rounded-[20px] bg-steel-200/70 animate-pulse" />
      <div className="h-[70px] rounded-2xl bg-white ring-1 ring-steel-200/70 animate-pulse" />
      <div className="h-[260px] rounded-2xl bg-white ring-1 ring-steel-200/70 animate-pulse" />
      <div className="grid grid-cols-2 gap-3">
        <div className="h-[104px] rounded-2xl bg-white ring-1 ring-steel-200/70 animate-pulse" />
        <div className="h-[104px] rounded-2xl bg-white ring-1 ring-steel-200/70 animate-pulse" />
      </div>
    </div>
  );
}
