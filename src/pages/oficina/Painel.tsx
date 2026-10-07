import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import WorkshopLayout from '@/components/layout/WorkshopLayout';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { fmtBRL, osNumber } from '@/components/os/osHelpers';
import {
  approvalRate, change, customerMix, funnel, previousRange, revenueSeries, salesOf, topItems,
  type PanelItem, type PanelOs,
} from '@/lib/workshopMetrics';
import ShowcaseReminder from '@/components/showcase/ShowcaseReminder';
import { fetchAll } from '@/lib/fetchAll';
import PeriodPicker, { PREV_LABEL, addDays, startOfDay, usePeriod } from '@/components/PeriodPicker';

/**
 * Painel de vendas: tudo que é venda (faturamento, ticket, orçamentos, mais vendidos, clientes).
 * Produtividade e comissões ficam em Equipe → Desempenho; mecânicos da plataforma em Demandas.
 */
export default function Painel() {
  const { currentWorkshop } = useAuth();
  const wid = currentWorkshop?.id ?? null;
  const period = usePeriod('painel-periodo', 'month');
  const { preset, range } = period;
  const [os, setOs]         = useState<PanelOs[]>([]);
  const [items, setItems]   = useState<PanelItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!wid) return;
    let alive = true;
    (async () => {
      setLoading(true);
      const [o, it] = await Promise.all([
        fetchAll((a, b) => supabase.from('service_orders')
          .select('id, number, title, status, quote_status, price, parts_cost, labor_cost, created_at, started_at, completed_at, approval_requested_at, approved_at, estimated_hours, workshop_mechanic_id, customer_id, customer:customers(id, full_name, created_at), vehicle:vehicles(make, model, plate)')
          .eq('workshop_id', wid).order('created_at', { ascending: false }).order('id').range(a, b)),
        fetchAll((a, b) => supabase.from('service_order_items').select('service_order_id, kind, description, quantity, unit_price')
          .eq('workshop_id', wid).order('id').range(a, b)),
      ]);
      if (!alive) return;
      setOs(o.data as unknown as PanelOs[]);
      setItems(it.data as PanelItem[]);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [wid]);

  const prev = useMemo(() => previousRange(range), [range]);

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
      topServices: topItems(os, items, range, 'labor'),
      topParts: topItems(os, items, range, 'part'),
      customers: customerMix(os, range),
    };
  }, [os, items, range, prev]);

  const maxBar = Math.max(1, ...m.series.map(s => s.value));

  return (
    <WorkshopLayout>
      <div className="max-w-6xl mx-auto space-y-5">
        {/* Cabeçalho + período */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-sm text-steel-500">Painel de vendas</div>
            <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">{currentWorkshop?.business_name ?? '…'}</h1>
            <div className="text-xs text-steel-400 mt-0.5">{period.label}</div>
          </div>
          <PeriodPicker period={period} />
        </div>

        {wid && <ShowcaseReminder workshopId={wid} />}

        {loading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => <div key={i} className="h-28 bg-white rounded-2xl animate-pulse" />)}
          </div>
        ) : os.length === 0 ? (
          <div className="card text-center py-14">
            <div className="text-4xl mb-2">📊</div>
            <h2 className="text-lg font-bold">Suas vendas aparecem aqui</h2>
            <p className="text-sm text-steel-500 mt-1 max-w-md mx-auto">
              Assim que você abrir e concluir ordens de serviço, o painel mostra faturamento, ticket médio, orçamentos e o que mais vende.
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
              <Kpi label="Orçamentos aprovados" value={m.approval.rate == null ? '—' : `${Math.round(m.approval.rate)}%`}
                note={`${m.approval.approved} de ${m.approval.approved + m.approval.declined} decididos no período`} />
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

            {/* Vendas de hoje + funil de orçamentos */}
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
                <div className="text-[10px] font-bold text-steel-500 uppercase tracking-widest mb-3">🧭 Funil de orçamentos agora</div>
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

            {/* Mais vendidos + clientes */}
            <div className="grid md:grid-cols-3 gap-4">
              <RankCard title="🔧 Serviços mais vendidos" rows={m.topServices.map(t => ({ name: t.name, value: fmtBRL(t.revenue), sub: `${t.qty}x` }))} />
              <RankCard title="🔩 Peças mais vendidas" rows={m.topParts.map(t => ({ name: t.name, value: fmtBRL(t.revenue), sub: `${String(t.qty).replace('.', ',')} un.` }))} />
              <div className="card">
                <div className="text-[10px] font-bold text-steel-500 uppercase tracking-widest mb-3">👥 Clientes atendidos</div>
                <div className="text-3xl font-bold font-display">{m.customers.served}</div>
                <div className="mt-2 space-y-1 text-sm">
                  <div className="flex justify-between"><span className="text-steel-600">🆕 Novos</span><strong>{m.customers.novos}</strong></div>
                  <div className="flex justify-between"><span className="text-steel-600">🔁 Voltaram</span><strong>{m.customers.voltaram}</strong></div>
                </div>
              </div>
            </div>

            {/* Onde foram parar as outras seções */}
            <p className="text-[11px] text-steel-400">
              Desempenho e comissões da equipe estão em <Link to="/oficina/desempenho" className="text-brand-600 hover:underline">Equipe → Desempenho</Link> e <Link to="/oficina/comissoes" className="text-brand-600 hover:underline">Comissões</Link>.
              O resumo dos mecânicos da plataforma está em <Link to="/oficina/dashboard" className="text-brand-600 hover:underline">Demandas</Link>.
            </p>
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
          {delta == null ? <span className="text-steel-400">sem base de comparação</span> : (
            <span className={delta >= 0 ? 'text-signal-500 font-semibold' : 'text-alert-500 font-semibold'}>
              {delta >= 0 ? '▲' : '▼'} {Math.abs(Math.round(delta))}%
            </span>
          )}
          {note && delta != null && <span className="text-steel-400"> {note}</span>}
        </div>
      )}
      {delta === undefined && note && <div className="text-xs mt-1 text-steel-400">{note}</div>}
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
