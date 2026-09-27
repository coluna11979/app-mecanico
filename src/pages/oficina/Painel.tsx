import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import WorkshopLayout from '@/components/layout/WorkshopLayout';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { fmtBRL, fmtDur, osNumber } from '@/components/os/osHelpers';
import {
  approvalRate, change, customerMix, funnel, marketplaceOf, pausesByReason, previousRange, productivity,
  revenueSeries, salesOf, topItems,
  type PanelItem, type PanelJob, type PanelMechanic, type PanelOs, type Range,
} from '@/lib/workshopMetrics';
import { arrivalDeadline } from '@/lib/arrivalDeadline';
import ShowcaseReminder from '@/components/showcase/ShowcaseReminder';
import { fetchAll } from '@/lib/fetchAll';

type Preset = 'today' | '7d' | 'month' | 'lastMonth' | 'custom';

const PRESETS: { key: Preset; label: string }[] = [
  { key: 'today',     label: 'Hoje' },
  { key: '7d',        label: '7 dias' },
  { key: 'month',     label: 'Este mês' },
  { key: 'lastMonth', label: 'Mês passado' },
  { key: 'custom',    label: 'Personalizado' },
];

const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const toInput = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function rangeOf(p: Preset, custom: { from: string; to: string }): Range {
  const today = startOfDay(new Date());
  switch (p) {
    case 'today':     return { from: today, to: addDays(today, 1) };
    case '7d':        return { from: addDays(today, -6), to: addDays(today, 1) };
    case 'month':     return { from: new Date(today.getFullYear(), today.getMonth(), 1), to: addDays(today, 1) };
    case 'lastMonth': return { from: new Date(today.getFullYear(), today.getMonth() - 1, 1), to: new Date(today.getFullYear(), today.getMonth(), 1) };
    case 'custom': {
      const from = custom.from ? new Date(`${custom.from}T00:00:00`) : addDays(today, -29);
      const to = custom.to ? addDays(new Date(`${custom.to}T00:00:00`), 1) : addDays(today, 1);
      return { from, to: to > from ? to : addDays(from, 1) };
    }
  }
}

const PREV_LABEL: Record<Preset, string> = {
  today: 'vs. ontem', '7d': 'vs. 7 dias anteriores', month: 'vs. mesmo período antes',
  lastMonth: 'vs. mês retrasado', custom: 'vs. período anterior',
};

export default function Painel() {
  const { currentWorkshop } = useAuth();
  const wid = currentWorkshop?.id ?? null;
  const [preset, setPreset] = useState<Preset>(() => {
    try { return (localStorage.getItem('painel-periodo') as Preset) || 'month'; } catch { return 'month'; }
  });
  const [custom, setCustom] = useState({ from: toInput(addDays(new Date(), -29)), to: toInput(new Date()) });
  const [os, setOs]         = useState<PanelOs[]>([]);
  const [items, setItems]   = useState<PanelItem[]>([]);
  const [mechs, setMechs]   = useState<PanelMechanic[]>([]);
  const [jobs, setJobs]     = useState<PanelJob[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { try { localStorage.setItem('painel-periodo', preset); } catch { /* ignore */ } }, [preset]);

  useEffect(() => {
    if (!wid) return;
    let alive = true;
    (async () => {
      setLoading(true);
      const [o, it, m, jb] = await Promise.all([
        fetchAll((a, b) => supabase.from('service_orders')
          .select('id, number, title, status, quote_status, price, parts_cost, labor_cost, created_at, started_at, completed_at, approval_requested_at, approved_at, estimated_hours, workshop_mechanic_id, customer_id, customer:customers(id, full_name, created_at), vehicle:vehicles(make, model, plate), pauses:service_order_pauses(started_at, ended_at, reason)')
          .eq('workshop_id', wid).order('created_at', { ascending: false }).order('id').range(a, b)),
        fetchAll((a, b) => supabase.from('service_order_items').select('service_order_id, kind, description, quantity, unit_price')
          .eq('workshop_id', wid).order('id').range(a, b)),
        supabase.from('workshop_mechanics').select('id, name, commission_percent, active').eq('workshop_id', wid),
        supabase.from('jobs')
          .select('id, title, status, price, created_at, accepted_at, en_route_at, arrived_at, completed_at, cancelled_at, cancelled_by, cancellation_fee, cancellation_fee_paid_at, workshop_confirmed_at, mechanic_rating, scheduled_at, mechanic_id, mechanic:mechanics(id, profile:profiles(full_name))')
          .eq('workshop_id', wid).order('created_at', { ascending: false }).limit(3000),
      ]);
      if (!alive) return;
      setOs((o.data as unknown as PanelOs[]) ?? []);
      setItems((it.data as PanelItem[]) ?? []);
      setMechs((m.data as PanelMechanic[]) ?? []);
      setJobs((jb.data as unknown as PanelJob[]) ?? []);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [wid]);

  const range = useMemo(() => rangeOf(preset, custom), [preset, custom]);
  const prev  = useMemo(() => previousRange(range), [range]);

  const m = useMemo(() => {
    const cur = salesOf(os, range);
    const before = salesOf(os, prev);
    const today = startOfDay(new Date());
    return {
      cur, before,
      revChange: change(cur.revenue, before.revenue),
      countChange: change(cur.count, before.count),
      ticketChange: change(cur.ticket, before.ticket),
      series: revenueSeries(os, range),
      todaySales: salesOf(os, { from: today, to: addDays(today, 1) }),
      funnel: funnel(os),
      approval: approvalRate(os, range),
      team: productivity(os, mechs, range),
      pauses: pausesByReason(os, range),
      topServices: topItems(os, items, range, 'labor'),
      topParts: topItems(os, items, range, 'part'),
      customers: customerMix(os, range),
      market: marketplaceOf(jobs, range, j => arrivalDeadline(j)),
    };
  }, [os, items, mechs, jobs, range, prev]);

  const commissionTotal = m.team.reduce((a, r) => a + r.commission, 0);
  const maxBar = Math.max(1, ...m.series.map(s => s.value));
  const periodLabel = `${range.from.toLocaleDateString('pt-BR')} a ${addDays(range.to, -1).toLocaleDateString('pt-BR')}`;

  return (
    <WorkshopLayout>
      <div className="max-w-6xl mx-auto space-y-5">
        {/* Cabeçalho + período */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-sm text-steel-500">Painel da oficina</div>
            <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">{currentWorkshop?.business_name ?? '…'}</h1>
            <div className="text-xs text-steel-400 mt-0.5">{periodLabel}</div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {PRESETS.map(p => (
              <button key={p.key} onClick={() => setPreset(p.key)}
                className={`text-sm font-semibold px-3 py-1.5 rounded-full border transition ${
                  preset === p.key ? 'bg-steel-900 text-white border-steel-900' : 'bg-white text-steel-600 border-steel-200 hover:border-steel-300'}`}>
                {p.label}
              </button>
            ))}
            {preset === 'custom' && (
              <div className="flex items-center gap-1.5">
                <input type="date" className="input !py-1.5 !w-auto text-sm" value={custom.from} onChange={e => setCustom(c => ({ ...c, from: e.target.value }))} />
                <span className="text-steel-400 text-sm">a</span>
                <input type="date" className="input !py-1.5 !w-auto text-sm" value={custom.to} onChange={e => setCustom(c => ({ ...c, to: e.target.value }))} />
              </div>
            )}
          </div>
        </div>

        {wid && <ShowcaseReminder workshopId={wid} />}

        {loading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => <div key={i} className="h-28 bg-white rounded-2xl animate-pulse" />)}
          </div>
        ) : os.length === 0 && jobs.length === 0 ? (
          <div className="card text-center py-14">
            <div className="text-4xl mb-2">📊</div>
            <h2 className="text-lg font-bold">Seu painel aparece aqui</h2>
            <p className="text-sm text-steel-500 mt-1 max-w-md mx-auto">
              Assim que você abrir e concluir ordens de serviço, o painel mostra vendas, produtividade da equipe e comissões.
            </p>
            <div className="flex gap-2 justify-center mt-5">
              <Link to="/oficina/os" className="btn-primary">+ Abrir uma OS</Link>
              <Link to="/oficina/importar" className="btn-ghost border border-steel-200">📷 Importar orçamentos antigos</Link>
            </div>
          </div>
        ) : (
          <>
            {/* KPIs */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <Kpi label="Faturamento" value={fmtBRL(m.cur.revenue)} delta={m.revChange} note={PREV_LABEL[preset]} highlight />
              <Kpi label="OS concluídas" value={String(m.cur.count)} delta={m.countChange} note={PREV_LABEL[preset]} />
              <Kpi label="Ticket médio" value={fmtBRL(m.cur.ticket)} delta={m.ticketChange} note={PREV_LABEL[preset]} />
              <Kpi label="Comissões a pagar" value={fmtBRL(commissionTotal)} note="sobre a mão de obra" />
            </div>

            {/* Peças × mão de obra + gráfico */}
            <div className="grid lg:grid-cols-3 gap-4">
              <div className="card">
                <div className="text-[10px] font-bold text-steel-500 uppercase tracking-widest mb-3">De onde veio o faturamento</div>
                <Split label="🔧 Mão de obra" value={m.cur.labor} total={m.cur.revenue} color="bg-brand-500" />
                <Split label="🔩 Peças" value={m.cur.parts} total={m.cur.revenue} color="bg-steel-500" />
                {m.cur.unsplit > 0 && <Split label="Sem detalhamento" value={m.cur.unsplit} total={m.cur.revenue} color="bg-steel-300" />}
              </div>
              <div className="card lg:col-span-2">
                <div className="text-[10px] font-bold text-steel-500 uppercase tracking-widest mb-3">Faturamento por {m.series.length > 62 ? 'mês' : 'dia'}</div>
                {m.series.length <= 1 ? (
                  <div className="text-sm text-steel-500 py-6 text-center">Escolha um período maior para ver o gráfico.</div>
                ) : (
                  <div className="flex items-end gap-1 h-40">
                    {m.series.map((s, i) => (
                      <div key={i} className="flex-1 flex flex-col items-center justify-end h-full group relative min-w-0">
                        <div className="absolute -top-1 -translate-y-full hidden group-hover:block bg-steel-900 text-white text-[10px] rounded px-1.5 py-0.5 whitespace-nowrap z-10">
                          {s.label}: {fmtBRL(s.value)}
                        </div>
                        <div className={`w-full rounded-t ${s.value ? 'bg-brand-500' : 'bg-steel-100'}`}
                          style={{ height: `${Math.max(s.value ? 4 : 2, (s.value / maxBar) * 100)}%` }} />
                        {(m.series.length <= 15 || i % Math.ceil(m.series.length / 10) === 0) && (
                          <div className="text-[9px] text-steel-400 mt-1 truncate w-full text-center">{s.label}</div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Vendas de hoje + funil */}
            <div className="grid lg:grid-cols-2 gap-4">
              <div className="card">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-[10px] font-bold text-steel-500 uppercase tracking-widest">💰 Vendas de hoje</div>
                  <div className="text-sm font-bold">{fmtBRL(m.todaySales.revenue)}</div>
                </div>
                {m.todaySales.count === 0 ? (
                  <p className="text-sm text-steel-400">Nenhuma OS concluída hoje ainda.</p>
                ) : (
                  <ul className="divide-y divide-steel-100">
                    {m.todaySales.sales.map(o => (
                      <li key={o.id}>
                        <Link to={`/oficina/os/${o.id}`} className="flex items-center justify-between gap-3 py-2 hover:bg-steel-50 -mx-2 px-2 rounded-lg">
                          <div className="min-w-0">
                            <div className="text-sm font-semibold truncate">OS {osNumber(o)} · {o.title}</div>
                            <div className="text-xs text-steel-500 truncate">
                              {o.customer?.full_name ?? 'Sem cliente'}{o.vehicle ? ` · ${o.vehicle.make} ${o.vehicle.model}` : ''}
                            </div>
                          </div>
                          <div className="text-sm font-bold shrink-0">{fmtBRL(o.price)}</div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="card">
                <div className="text-[10px] font-bold text-steel-500 uppercase tracking-widest mb-3">🧭 Funil agora</div>
                <div className="space-y-2">
                  {m.funnel.map(s => (
                    <Link key={s.key} to="/oficina/os" className="flex items-center justify-between gap-3 rounded-xl px-3 py-2 bg-steel-50 hover:bg-steel-100">
                      <span className="text-sm text-steel-700">{s.label}</span>
                      <span className="text-sm"><strong>{s.count}</strong> <span className="text-steel-500">· {fmtBRL(s.value)}</span></span>
                    </Link>
                  ))}
                </div>
                {m.funnel[1].value > 0 && (
                  <p className="text-xs text-pending-800 bg-pending-50 rounded-lg px-3 py-2 mt-3">
                    💡 {fmtBRL(m.funnel[1].value)} esperando o cliente aprovar. Vale um lembrete!
                  </p>
                )}
                <div className="mt-3 pt-3 border-t border-steel-100 text-sm flex justify-between">
                  <span className="text-steel-600">Orçamentos aprovados no período</span>
                  <span className="font-bold">
                    {m.approval.rate == null ? '—' : `${Math.round(m.approval.rate)}%`}
                    <span className="text-xs font-normal text-steel-500"> ({m.approval.approved} de {m.approval.approved + m.approval.declined})</span>
                  </span>
                </div>
              </div>
            </div>

            {/* Mecânicos da plataforma (demandas do marketplace) */}
            <div className="card">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                <div>
                  <div className="text-[10px] font-bold text-steel-500 uppercase tracking-widest">🌐 Mecânicos da plataforma</div>
                  <p className="text-xs text-steel-400">Demandas que você contratou pelo app no período.</p>
                </div>
                <Link to="/oficina/dashboard" className="text-xs font-semibold text-brand-600 hover:underline">Ver demandas →</Link>
              </div>

              {jobs.length === 0 ? (
                <div className="text-sm text-steel-500 bg-steel-50 rounded-xl px-4 py-4 flex flex-wrap items-center justify-between gap-3">
                  <span>Você ainda não chamou nenhum mecânico da plataforma. Quando faltar gente na oficina, é só publicar uma demanda.</span>
                  <Link to="/oficina/dashboard?nova=1" className="btn-primary text-sm !py-2">+ Chamar mecânico</Link>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <MiniStat label="Gasto no período" value={fmtBRL(m.market.spent)} sub={`${m.market.doneCount} demanda${m.market.doneCount === 1 ? '' : 's'} concluída${m.market.doneCount === 1 ? '' : 's'}`} />
                    <MiniStat label="Aceite em média" value={m.market.avgAcceptMin != null ? fmtDur(m.market.avgAcceptMin) : '—'} sub="da publicação ao aceite" />
                    <MiniStat label="Chegada em média" value={m.market.avgArrivalMin != null ? fmtDur(m.market.avgArrivalMin) : '—'}
                      sub={m.market.onTimeRate != null ? `${Math.round(m.market.onTimeRate)}% dentro do prazo` : 'sem chegadas no período'} />
                    <MiniStat label="Canceladas" value={String(m.market.cancelledCount)}
                      sub={m.market.feesPaid > 0 ? `${fmtBRL(m.market.feesPaid)} em multas` : 'sem multas'} />
                  </div>

                  <div className="grid md:grid-cols-2 gap-4 mt-4">
                    <div>
                      <div className="text-xs font-semibold text-steel-600 mb-2">Agora</div>
                      <div className="space-y-1.5 text-sm">
                        <NowRow label="📢 Aguardando aceite" value={m.market.now.waiting} />
                        <NowRow label="🚗 Mecânico a caminho" value={m.market.now.onTheWay} />
                        <NowRow label="🔧 Em serviço" value={m.market.now.inService} />
                      </div>
                      {(m.market.pendingConfirm > 0 || m.market.pendingRating > 0 || m.market.pendingFees > 0) && (
                        <div className="mt-3 space-y-1.5">
                          {m.market.pendingConfirm > 0 && (
                            <Link to="/oficina/dashboard" className="block text-xs font-semibold text-brand-800 bg-brand-50 border border-brand-200 rounded-lg px-3 py-2">
                              🔔 {m.market.pendingConfirm} serviço{m.market.pendingConfirm === 1 ? '' : 's'} aguardando sua confirmação — o mecânico só recebe depois dela
                            </Link>
                          )}
                          {m.market.pendingRating > 0 && (
                            <Link to="/oficina/dashboard" className="block text-xs text-steel-700 bg-steel-50 rounded-lg px-3 py-2">
                              ⭐ {m.market.pendingRating} avaliação{m.market.pendingRating === 1 ? '' : 'ões'} pendente{m.market.pendingRating === 1 ? '' : 's'}
                            </Link>
                          )}
                          {m.market.pendingFees > 0 && (
                            <Link to="/oficina/dashboard" className="block text-xs font-semibold text-alert-700 bg-alert-50 rounded-lg px-3 py-2">
                              ⚠️ {fmtBRL(m.market.pendingFees)} em multa de cancelamento pendente — bloqueia novas demandas
                            </Link>
                          )}
                        </div>
                      )}
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-steel-600 mb-2">Mecânicos que você mais contratou</div>
                      {m.market.topMechanics.length === 0 ? (
                        <p className="text-sm text-steel-400">Nenhuma demanda concluída no período.</p>
                      ) : (
                        <ol className="space-y-2">
                          {m.market.topMechanics.map((t, i) => (
                            <li key={i} className="flex items-center justify-between gap-2 text-sm">
                              <span className="min-w-0 truncate"><span className="text-steel-400 mr-1">{i + 1}.</span>{t.name}</span>
                              <span className="shrink-0 text-right">
                                <strong>{fmtBRL(t.spent)}</strong>
                                <span className="block text-[10px] text-steel-400">
                                  {t.jobs} demanda{t.jobs === 1 ? '' : 's'}{t.avgRating != null ? ` · ★ ${t.avgRating.toFixed(1)}` : ''}
                                </span>
                              </span>
                            </li>
                          ))}
                        </ol>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Produtividade + comissões */}
            <div className="card !p-0 overflow-hidden">
              <div className="px-5 pt-5 pb-3 flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="text-[10px] font-bold text-steel-500 uppercase tracking-widest">👷 Produtividade e comissões da equipe</div>
                  <p className="text-xs text-steel-400">OS concluídas no período. Tempo trabalhado já desconta as pausas.</p>
                </div>
                <Link to="/oficina/desempenho" className="text-xs font-semibold text-brand-600 hover:underline">🏆 Relatório de desempenho →</Link>
              </div>
              {m.team.length === 0 ? (
                <p className="px-5 pb-5 text-sm text-steel-400">Nenhuma OS concluída no período.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-steel-50 text-[10px] uppercase tracking-wider text-steel-500">
                      <tr>
                        <th className="text-left px-5 py-2">Mecânico</th>
                        <th className="text-right px-3 py-2">OS</th>
                        <th className="text-right px-3 py-2">Horas trabalhadas</th>
                        <th className="text-right px-3 py-2">Tempo médio</th>
                        <th className="text-right px-3 py-2">No prazo</th>
                        <th className="text-right px-3 py-2">Faturou</th>
                        <th className="text-right px-3 py-2">Mão de obra</th>
                        <th className="text-right px-5 py-2">Comissão</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-steel-100">
                      {m.team.map(r => (
                        <tr key={r.id}>
                          <td className="px-5 py-2.5 font-semibold">{r.name}</td>
                          <td className="px-3 py-2.5 text-right">{r.count}</td>
                          <td className="px-3 py-2.5 text-right">{r.timedCount ? fmtDur(r.workedMin) : '—'}</td>
                          <td className="px-3 py-2.5 text-right">{r.timedCount ? fmtDur(Math.round(r.workedMin / r.timedCount)) : '—'}</td>
                          <td className="px-3 py-2.5 text-right">{r.withEstimate ? `${Math.round((r.onTime / r.withEstimate) * 100)}%` : '—'}</td>
                          <td className="px-3 py-2.5 text-right">{fmtBRL(r.revenue)}</td>
                          <td className="px-3 py-2.5 text-right">{fmtBRL(r.labor)}</td>
                          <td className="px-5 py-2.5 text-right font-bold">
                            {r.id === 'none' ? '—' : fmtBRL(r.commission)}
                            {r.id !== 'none' && <div className="text-[10px] font-normal text-steel-400">{r.commissionPercent}% da mão de obra</div>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="px-5 py-3 bg-steel-50 text-xs text-steel-500 border-t border-steel-100">
                A % de comissão de cada mecânico é definida em <Link to="/oficina/equipe" className="text-brand-600 font-semibold">👷 Equipe</Link> (ficha de cada colaborador).
              </div>
            </div>

            {/* Mais vendidos, tempo parado, clientes */}
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
              <RankCard title="🔧 Serviços mais vendidos" rows={m.topServices.map(t => ({ name: t.name, value: fmtBRL(t.revenue), sub: `${t.qty}x` }))} />
              <RankCard title="🔩 Peças mais vendidas" rows={m.topParts.map(t => ({ name: t.name, value: fmtBRL(t.revenue), sub: `${String(t.qty).replace('.', ',')} un.` }))} />
              <RankCard title="⏸ Tempo parado" empty="Nenhuma pausa no período."
                rows={m.pauses.map(p => ({ name: p.reason, value: fmtDur(p.minutes) }))} />
              <div className="card">
                <div className="text-[10px] font-bold text-steel-500 uppercase tracking-widest mb-3">👥 Clientes atendidos</div>
                <div className="text-3xl font-bold font-display">{m.customers.served}</div>
                <div className="mt-2 space-y-1 text-sm">
                  <div className="flex justify-between"><span className="text-steel-600">🆕 Novos</span><strong>{m.customers.novos}</strong></div>
                  <div className="flex justify-between"><span className="text-steel-600">🔁 Voltaram</span><strong>{m.customers.voltaram}</strong></div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </WorkshopLayout>
  );
}

function Kpi({ label, value, delta, note, highlight = false }: {
  label: string; value: string; delta?: number | null; note?: string; highlight?: boolean;
}) {
  return (
    <div className={`card ${highlight ? '!bg-steel-900 text-white' : ''}`}>
      <div className={`text-[10px] font-bold uppercase tracking-widest ${highlight ? 'text-steel-400' : 'text-steel-500'}`}>{label}</div>
      <div className="text-2xl lg:text-3xl font-bold font-display mt-1">{value}</div>
      {delta !== undefined && (
        <div className="text-xs mt-1">
          {delta == null ? <span className={highlight ? 'text-steel-400' : 'text-steel-400'}>sem base de comparação</span> : (
            <span className={delta >= 0 ? 'text-signal-500 font-semibold' : 'text-alert-500 font-semibold'}>
              {delta >= 0 ? '▲' : '▼'} {Math.abs(Math.round(delta))}%
            </span>
          )}
          {note && delta != null && <span className={highlight ? 'text-steel-400' : 'text-steel-400'}> {note}</span>}
        </div>
      )}
      {delta === undefined && note && <div className="text-xs mt-1 text-steel-400">{note}</div>}
    </div>
  );
}

function MiniStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-steel-50 rounded-xl px-3 py-3">
      <div className="text-[10px] font-bold uppercase tracking-widest text-steel-500">{label}</div>
      <div className="text-xl font-bold font-display mt-0.5">{value}</div>
      {sub && <div className="text-[11px] text-steel-500 mt-0.5">{sub}</div>}
    </div>
  );
}

function NowRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between rounded-lg px-3 py-1.5 bg-steel-50">
      <span className="text-steel-700">{label}</span>
      <strong className={value ? 'text-steel-900' : 'text-steel-400'}>{value}</strong>
    </div>
  );
}

function Split({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = total ? (value / total) * 100 : 0;
  return (
    <div className="mb-3">
      <div className="flex justify-between text-sm mb-1">
        <span className="text-steel-700">{label}</span>
        <span className="font-semibold">{fmtBRL(value)} <span className="text-xs text-steel-400">{Math.round(pct)}%</span></span>
      </div>
      <div className="h-2 rounded-full bg-steel-100 overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function RankCard({ title, rows, empty = 'Sem dados no período.' }: {
  title: string; rows: { name: string; value: string; sub?: string }[]; empty?: string;
}) {
  return (
    <div className="card">
      <div className="text-[10px] font-bold text-steel-500 uppercase tracking-widest mb-3">{title}</div>
      {rows.length === 0 ? <p className="text-sm text-steel-400">{empty}</p> : (
        <ol className="space-y-2">
          {rows.map((r, i) => (
            <li key={i} className="flex items-start justify-between gap-2 text-sm">
              <span className="min-w-0 truncate"><span className="text-steel-400 mr-1">{i + 1}.</span>{r.name}</span>
              <span className="shrink-0 text-right font-semibold">{r.value}{r.sub && <span className="block text-[10px] font-normal text-steel-400">{r.sub}</span>}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
