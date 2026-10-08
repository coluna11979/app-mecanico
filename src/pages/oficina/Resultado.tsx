import { useEffect, useMemo, useState } from 'react';
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
};

const SALE_COLS = 'id, number, title, status, quote_status, price, parts_cost, labor_cost, created_at, started_at, completed_at, '
  + 'approval_requested_at, approved_at, estimated_hours, workshop_mechanic_id, customer_id, customer:customers(id, full_name, created_at), vehicle:vehicles(make, model, plate)';
const JOB_COLS = 'id, title, status, mechanic_id, scheduled_at, created_at, accepted_at, en_route_at, arrived_at, pix_paid_at, started_at, completed_at, workshop_confirmed_at, cancelled_at';

const LS_SCOPE = 'resultado_escopo';
const isoDate = (d: Date) => d.toLocaleDateString('en-CA');
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const firstName = (s: string) => s.split(' ')[0];

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

  useEffect(() => {
    if (!ids.length) return;
    let alive = true;
    setData(null);
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
      });
    })();
    return () => { alive = false; };
  }, [idsKey, showPlatform]); // eslint-disable-line react-hooks/exhaustive-deps

  const v = useMemo(() => {
    if (!data) return null;
    const now = new Date();
    const today = startOfDay(now);
    const tomorrow = addDays(today, 1);
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    // Mês anterior até o mesmo dia (comparação justa com o mês ainda em andamento)
    const prevStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const prevDays = new Date(today.getFullYear(), today.getMonth(), 0).getDate();
    const prevEnd = addDays(prevStart, Math.min(today.getDate(), prevDays));

    const day = salesOf(data.sales, { from: today, to: tomorrow });
    const lastWeek = salesOf(data.sales, { from: addDays(today, -7), to: addDays(today, -6) });
    const month = salesOf(data.sales, { from: monthStart, to: tomorrow });
    const before = salesOf(data.sales, { from: prevStart, to: prevEnd });

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
      day, month, before,
      dayChange: change(day.revenue, lastWeek.revenue),
      monthChange: change(month.revenue, before.revenue),
      ticketChange: change(month.ticket, before.ticket),
      received: cashFlowOf(data.entriesToday, [], { from: today, to: tomorrow }).received,
      inProgress: data.active.filter(o => o.status === 'in_progress').length,
      awaiting: { count: awaiting.length, value: awaiting.reduce((a, o) => a + Number(o.price), 0) },
      series: revenueSeries(data.sales, { from: monthStart, to: tomorrow }),
      ranking,
      toReceive: data.toReceive,
      lateTotal: sumP(late), lateCount: late.length,
      weekTotal: sumP(week), weekCount: week.length,
      toConfirm: data.jobs.filter(j => j.status === 'completed'),
      liveJobs: data.jobs.filter(j => j.status !== 'completed'),
    };
  }, [data]);

  const name = firstName(profile?.full_name ?? '');
  const monthLabel = new Date().toLocaleDateString('pt-BR', { month: 'long' });
  const weekday = new Date().toLocaleDateString('pt-BR', { weekday: 'long' });
  const maxBar = v ? Math.max(1, ...v.series.map(s => s.value)) : 1;
  const platformJobs = v ? [...v.toConfirm, ...v.liveJobs] : [];
  // No escopo "todas", o detalhe abre na loja atual; os números já vêm somados
  const allStores = multi && scope === 'todas';

  return (
    <WorkshopLayout>
      <div className="max-w-3xl mx-auto space-y-5">
        {/* ── Cabeçalho ── */}
        <header className="space-y-3">
          <div>
            <div className="text-xs font-medium text-steel-500">Resultado</div>
            <h1 className="text-2xl font-bold tracking-tight text-steel-900 leading-tight">
              {greeting()}{name ? `, ${name}` : ''}.
            </h1>
          </div>

          {multi && (
            <div className="inline-flex rounded-lg bg-steel-100 p-1 text-sm font-semibold" role="tablist">
              {([['loja', currentWorkshop?.business_name ?? 'Esta loja'], ['todas', `Todas as lojas (${workshops.length})`]] as const).map(([k, label]) => (
                <button key={k} role="tab" aria-selected={scope === k} onClick={() => pickScope(k)}
                  className={`px-3 h-8 rounded-md transition truncate max-w-[180px] ${scope === k ? 'bg-white text-steel-900 shadow-sm' : 'text-steel-500'}`}>
                  {label}
                </button>
              ))}
            </div>
          )}

          {/* Emergência: chamar um mecânico da plataforma de onde estiver */}
          {showPlatform && (
            <Link to="/oficina/dashboard?nova=1"
              className="flex items-center gap-3 rounded-xl bg-brand-500 text-white px-4 py-3 hover:bg-brand-600 transition">
              <span className="text-2xl leading-none">⚡</span>
              <span className="flex-1 min-w-0">
                <span className="block font-bold">Chamar mecânico agora</span>
                <span className="block text-xs text-white/80">Faltou alguém ou o pátio encheu? Peça reforço da plataforma.</span>
              </span>
              <Icon name="chevron" size={18} className="-rotate-90 shrink-0" />
            </Link>
          )}
        </header>

        {!v ? (
          <div className="space-y-3">
            <div className="h-28 rounded-xl bg-white ring-1 ring-steel-200/70 animate-pulse" />
            <div className="grid grid-cols-2 gap-3">
              {[1, 2, 3, 4].map(i => <div key={i} className="h-[88px] rounded-xl bg-white ring-1 ring-steel-200/70 animate-pulse" />)}
            </div>
          </div>
        ) : (
          <>
            {/* ── Plataforma agora (só quando tem algo acontecendo) ── */}
            {showPlatform && platformJobs.length > 0 && (
              <section>
                <SectionTitle title="Plataforma agora" to="/oficina/dashboard" link="Ver demandas" />
                <ul className="rounded-xl bg-white ring-1 ring-steel-200/70 divide-y divide-steel-100 overflow-hidden">
                  {platformJobs.slice(0, 4).map(j => {
                    const st = platformJobStatus(j);
                    return (
                      <li key={j.id}>
                        <Link to={j.status === 'open' ? '/oficina/dashboard' : `/oficina/job/${j.id}/tracking`}
                          className="flex items-center gap-3 px-4 py-3 hover:bg-steel-50">
                          <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${TONE_DOT[st.tone]}`} aria-hidden />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-semibold text-steel-900 truncate">{j.title}</div>
                            <div className={`text-xs truncate ${st.tone === 'action' ? 'text-alert-600 font-semibold' : 'text-steel-500'}`}>{st.label}</div>
                          </div>
                          <Icon name="chevron" size={16} className="-rotate-90 text-steel-300 shrink-0" />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}

            {/* ── Hoje ── */}
            <section>
              <SectionTitle title="Hoje" />
              <div className="rounded-xl bg-steel-900 text-white px-4 py-4">
                <div className="text-xs text-steel-400">Faturado hoje</div>
                <div className="text-3xl font-bold tracking-tight tabular-nums mt-0.5">{fmtBRL(v.day.revenue)}</div>
                <Delta value={v.dayChange} note={`vs. ${weekday} passada`} dark />
              </div>
              <div className="grid grid-cols-2 gap-3 mt-3">
                <Stat icon="wallet" label="Recebido hoje" value={fmtBRL(v.received)} muted={v.received === 0} />
                <Stat icon="check" label="OS concluídas" value={String(v.day.count)} muted={v.day.count === 0} />
                <Stat icon="wrench" label="Em andamento" value={String(v.inProgress)} muted={v.inProgress === 0} />
                <Stat icon="clipboard" label="Orçamentos aguardando" value={String(v.awaiting.count)} muted={v.awaiting.count === 0}
                  note={v.awaiting.value > 0 ? fmtBRL(v.awaiting.value) : undefined} />
              </div>
            </section>

            {/* ── Mês ── */}
            <section>
              <SectionTitle title={`Mês de ${monthLabel}`} to={allStores ? undefined : '/oficina/painel'} link="Painel de vendas" />
              <div className="rounded-xl bg-white ring-1 ring-steel-200/70 px-4 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs text-steel-500">Faturamento até hoje</div>
                    <div className="text-2xl font-bold tracking-tight tabular-nums text-steel-900">{fmtBRL(v.month.revenue)}</div>
                    <Delta value={v.monthChange} note="vs. mesmo período do mês passado" />
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs text-steel-500">Mês passado</div>
                    <div className="text-sm font-semibold text-steel-700 tabular-nums">{fmtBRL(v.before.revenue)}</div>
                  </div>
                </div>

                {/* Faturamento por dia */}
                <div className="flex items-end gap-[3px] h-20 mt-4" aria-hidden>
                  {v.series.map((s, i) => (
                    <div key={i} className={`flex-1 rounded-t ${s.value ? 'bg-brand-500' : 'bg-steel-100'}`}
                      style={{ height: `${Math.max(s.value ? 6 : 3, (s.value / maxBar) * 100)}%` }} />
                  ))}
                </div>

                <dl className="grid grid-cols-2 gap-3 mt-4 pt-3 border-t border-steel-100 text-sm">
                  <div>
                    <dt className="text-xs text-steel-500">Ticket médio</dt>
                    <dd className="font-bold text-steel-900 tabular-nums">{fmtBRL(v.month.ticket)}</dd>
                    <Delta value={v.ticketChange} small />
                  </div>
                  <div>
                    <dt className="text-xs text-steel-500">OS concluídas</dt>
                    <dd className="font-bold text-steel-900 tabular-nums">{v.month.count}</dd>
                    <div className="text-[11px] text-steel-400">mês passado: {v.before.count}</div>
                  </div>
                </dl>
              </div>
            </section>

            {/* ── Dinheiro ── */}
            <section>
              <SectionTitle title="Dinheiro" to={allStores ? undefined : '/oficina/financeiro'} link="Visão financeira" />
              <div className="rounded-xl bg-white ring-1 ring-steel-200/70 divide-y divide-steel-100">
                <MoneyLine icon="wallet" label="A receber" value={fmtBRL(v.toReceive.total)}
                  note={v.toReceive.count === 0 ? 'nada em aberto' : [
                    plural(v.toReceive.count, 'OS', 'OS'),
                    v.toReceive.overdueTotal > 0 && `${fmtBRL(v.toReceive.overdueTotal)} vencido`,
                  ].filter(Boolean).join(' · ')}
                  warn={v.toReceive.overdueTotal > 0} />
                <MoneyLine icon="receipt" label="A pagar em 7 dias" value={fmtBRL(v.weekTotal)}
                  note={v.weekCount === 0 ? 'nenhuma conta' : plural(v.weekCount, 'conta', 'contas')} />
                {v.lateCount > 0 && (
                  <MoneyLine icon="clock" label="Contas vencidas" value={fmtBRL(v.lateTotal)}
                    note={plural(v.lateCount, 'conta', 'contas')} warn />
                )}
              </div>
            </section>

            {/* ── Equipe ── */}
            <section>
              <SectionTitle title="Quem mais vendeu no mês" to={allStores ? undefined : '/oficina/desempenho'} link="Desempenho" />
              <div className="rounded-xl bg-white ring-1 ring-steel-200/70 px-4 py-3">
                {v.ranking.length === 0 ? (
                  <p className="text-sm text-steel-500 py-1">Nenhuma OS concluída com responsável neste mês.</p>
                ) : (
                  <ol className="space-y-2.5">
                    {v.ranking.map((r, i) => (
                      <li key={r.id}>
                        <div className="flex items-center justify-between gap-3 text-sm">
                          <span className="min-w-0 truncate">
                            <span className="text-steel-400 mr-1.5 tabular-nums">{i + 1}.</span>
                            <span className="font-medium text-steel-900">{r.name}</span>
                          </span>
                          <span className="shrink-0 font-semibold tabular-nums">{fmtBRL(r.revenue)}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-steel-100 mt-1 overflow-hidden">
                          <div className="h-full rounded-full bg-brand-500" style={{ width: `${(r.revenue / v.ranking[0].revenue) * 100}%` }} />
                        </div>
                        <div className="text-[11px] text-steel-400 mt-0.5">{plural(r.count, 'OS', 'OS')}</div>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </section>

            {/* ── Pendências da operação ── */}
            <Link to="/oficina/inicio"
              className="flex items-center gap-3 rounded-xl bg-white ring-1 ring-steel-200/70 px-4 py-3 hover:ring-steel-300 transition">
              <span className="h-8 w-8 rounded-lg bg-steel-100 text-steel-500 grid place-items-center shrink-0"><Icon name="clipboard" size={16} /></span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-semibold text-steel-900">Pendências do dia</span>
                <span className="block text-xs text-steel-500">OS paradas, agendamentos e o que precisa de você</span>
              </span>
              <Icon name="chevron" size={16} className="-rotate-90 text-steel-300 shrink-0" />
            </Link>

            {allStores && (
              <p className="text-[11px] text-steel-400">
                Números somados das {workshops.length} lojas. Para ver o detalhe, escolha uma loja no topo.
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

function SectionTitle({ title, to, link }: { title: string; to?: string; link?: string }) {
  return (
    <div className="flex items-center justify-between h-6 mb-2">
      <h2 className="text-sm font-semibold text-steel-900 first-letter:uppercase">{title}</h2>
      {to && link && <Link to={to} className="text-xs font-semibold text-brand-600 hover:underline">{link}</Link>}
    </div>
  );
}

function Delta({ value, note, dark = false, small = false }: { value: number | null; note?: string; dark?: boolean; small?: boolean }) {
  const size = small ? 'text-[11px]' : 'text-xs';
  if (value == null) return <div className={`${size} mt-1 ${dark ? 'text-steel-400' : 'text-steel-400'}`}>sem base de comparação</div>;
  const up = value >= 0;
  return (
    <div className={`${size} mt-1`}>
      <span className={`font-semibold ${up ? (dark ? 'text-signal-400' : 'text-signal-600') : (dark ? 'text-alert-400' : 'text-alert-600')}`}>
        {up ? '▲' : '▼'} {Math.abs(Math.round(value))}%
      </span>
      {note && <span className={dark ? 'text-steel-400' : 'text-steel-500'}> {note}</span>}
    </div>
  );
}

function Stat({ icon, label, value, note, muted = false }: {
  icon: IconName; label: string; value: string; note?: string; muted?: boolean;
}) {
  return (
    <div className="flex flex-col justify-between min-h-[88px] rounded-xl bg-white ring-1 ring-steel-200/70 px-4 py-3">
      <div className="flex items-center gap-1.5 text-xs font-medium text-steel-500">
        <Icon name={icon} size={14} className="text-steel-400" />
        <span className="truncate">{label}</span>
      </div>
      <div>
        <div className={`text-xl font-bold tracking-tight tabular-nums truncate ${muted ? 'text-steel-300' : 'text-steel-900'}`}>{value}</div>
        <div className="text-[11px] text-steel-500 truncate h-4">{note}</div>
      </div>
    </div>
  );
}

function MoneyLine({ icon, label, value, note, warn = false }: {
  icon: IconName; label: string; value: string; note?: string; warn?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 px-4 min-h-[60px] py-2.5">
      <span className={`h-8 w-8 rounded-lg grid place-items-center shrink-0 ${warn ? 'bg-alert-50 text-alert-600' : 'bg-steel-100 text-steel-500'}`}>
        <Icon name={icon} size={16} />
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-steel-800 truncate">{label}</div>
        {note && <div className={`text-[11px] truncate ${warn ? 'text-alert-600' : 'text-steel-500'}`}>{note}</div>}
      </div>
      <div className="text-base font-bold tabular-nums text-steel-900">{value}</div>
    </div>
  );
}
