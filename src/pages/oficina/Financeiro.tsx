import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import WorkshopLayout from '@/components/layout/WorkshopLayout';
import PaymentsList from '@/components/cash/PaymentsList';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { canDo, useOperator } from '@/lib/operators';
import { METHODS, brl, hhmm } from '@/lib/cash';
import { osNumber } from '@/components/os/osHelpers';
import { fetchAll } from '@/lib/fetchAll';
import { daysUntil, type Payable } from '@/lib/purchasing';
import { change, previousRange, productivity, salesOf, type PanelMechanic } from '@/lib/workshopMetrics';
import PeriodPicker, { PREV_LABEL, usePeriod } from '@/components/PeriodPicker';
import { ALL_TIME, COMMISSION_COLS, loadCommissionBase, type CommissionBaseRow } from '@/lib/commission';
import CommissionDetail from '@/components/team/CommissionDetail';
import {
  byMethod, cashFlowOf, closings, expensesByCategory, flowSeries, receivables, valesByMechanic,
  type FinEntry, type FinOs, type FinPayment, type FinRegister,
} from '@/lib/finance';

export default function Financeiro() {
  const { currentWorkshop } = useAuth();
  const wid = currentWorkshop?.id ?? null;
  const { balcao, session } = useOperator();
  const allowed = canDo(session, balcao, 'ver_financeiro');

  const period = usePeriod('financeiro-periodo');
  const { preset, range } = period;
  // Comissões detalhadas: hoje (padrão) ou o período escolhido no topo
  const [commScope, setCommScope] = useState<'hoje' | 'periodo'>('hoje');
  const todayRange = useMemo(() => {
    const f = new Date(); f.setHours(0, 0, 0, 0);
    const t = new Date(f); t.setDate(t.getDate() + 1);
    return { from: f, to: t };
  }, []);
  const [entries, setEntries]   = useState<FinEntry[]>([]);
  const [payments, setPayments] = useState<FinPayment[]>([]);
  const [regs, setRegs]         = useState<FinRegister[]>([]);
  const [os, setOs]             = useState<FinOs[]>([]);
  const [mechs, setMechs]       = useState<PanelMechanic[]>([]);
  const [commBase, setCommBase] = useState<CommissionBaseRow[]>([]);
  const [ops, setOps]           = useState<Record<string, string>>({});
  const [firstOpen, setFirstOpen] = useState<string | null>(null);
  const [payables, setPayables] = useState<Pick<Payable, 'amount' | 'due_date' | 'paid_at' | 'paid_from'>[]>([]);
  const [costItems, setCostItems] = useState<{ service_order_id: string; quantity: number; unit_price: number; unit_cost: number }[]>([]);
  const [loading, setLoading]   = useState(true);

  const prev  = useMemo(() => previousRange(range), [range]);

  // Movimentos do caixa: do início do período anterior (comparação) até o fim do atual
  const fromIso = prev.from.toISOString();
  const toIso = range.to.toISOString();

  useEffect(() => {
    if (!wid || !allowed) return;
    let alive = true;
    (async () => {
      setLoading(true);
      const [e, p, r, o, m, op, first, ci, pay, cb] = await Promise.all([
        fetchAll((a, b) => supabase.from('cash_entries')
          .select('id, kind, method, amount, installments, category, mechanic_id, created_at')
          .eq('workshop_id', wid).is('cancelled_at', null).gte('created_at', fromIso).lt('created_at', toIso)
          .order('id').range(a, b)),
        fetchAll((a, b) => supabase.from('os_payments')
          .select('id, discount, created_at')
          .eq('workshop_id', wid).is('cancelled_at', null).gte('created_at', fromIso).lt('created_at', toIso)
          .order('id').range(a, b)),
        supabase.from('cash_registers')
          .select('id, opened_at, closed_at, opened_by, closed_by, counted_cash, expected_cash, close_notes')
          .eq('workshop_id', wid).eq('status', 'closed').gte('closed_at', fromIso).lt('closed_at', toIso)
          .order('closed_at', { ascending: false }),
        fetchAll((a, b) => supabase.from('service_orders')
          .select('id, number, title, status, quote_status, price, parts_cost, labor_cost, paid_amount, counter_discount, created_at, started_at, completed_at, estimated_hours, workshop_mechanic_id, customer_id, customer:customers(id, full_name, created_at), vehicle:vehicles(make, model, plate)')
          .eq('workshop_id', wid).eq('status', 'completed').order('id').range(a, b)),
        supabase.from('workshop_mechanics').select(`id, name, active, ${COMMISSION_COLS}`).eq('workshop_id', wid),
        supabase.from('workshop_operators').select('id, name').eq('workshop_id', wid),
        supabase.from('cash_registers').select('opened_at').eq('workshop_id', wid)
          .order('opened_at').limit(1).maybeSingle(),
        fetchAll((a, b) => supabase.from('service_order_items')
          .select('service_order_id, quantity, unit_price, unit_cost')
          .eq('workshop_id', wid).eq('kind', 'part').not('unit_cost', 'is', null)
          .order('id').range(a, b)),
        // Contas em aberto (todas) + pagas no período
        fetchAll((a, b) => supabase.from('payables').select('amount, due_date, paid_at, paid_from')
          .eq('workshop_id', wid).is('cancelled_at', null)
          .or(`paid_at.is.null,paid_at.gte.${fromIso.slice(0, 10)}`)
          .order('id').range(a, b)),
        loadCommissionBase(wid, ALL_TIME.from, ALL_TIME.to),
      ]);
      if (!alive) return;
      setEntries((e.data as FinEntry[]) ?? []);
      setPayments((p.data as FinPayment[]) ?? []);
      setRegs((r.data as FinRegister[]) ?? []);
      setOs((o.data as unknown as FinOs[]) ?? []);
      setMechs((m.data as unknown as PanelMechanic[]) ?? []);
      setCommBase(cb);
      setOps(Object.fromEntries(((op.data as { id: string; name: string }[]) ?? []).map(x => [x.id, x.name])));
      setCostItems((ci.data as typeof costItems) ?? []);
      setPayables((pay.data as typeof payables) ?? []);
      setFirstOpen((first.data as { opened_at: string } | null)?.opened_at ?? null);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [wid, allowed, fromIso, toIso]);

  const f = useMemo(() => {
    const cur = cashFlowOf(entries, payments, range);
    const before = cashFlowOf(entries, payments, prev);
    const sales = salesOf(os, range);
    // Peças com custo informado nas OS concluídas no período
    const saleIds = new Set(sales.sales.map(o => o.id));
    const withCost = costItems.filter(i => saleIds.has(i.service_order_id));
    const partsCost = withCost.reduce((a, i) => a + Number(i.quantity) * Number(i.unit_cost), 0);
    const partsSale = withCost.reduce((a, i) => a + Number(i.quantity) * Number(i.unit_price), 0);
    const osWithCost = new Set(withCost.map(i => i.service_order_id)).size;
    const vales = valesByMechanic(entries, range);
    const names = new Map(mechs.map(x => [x.id, x.name]));
    const team = new Map<string, { id: string; name: string; commission: number; vales: number }>();
    for (const row of productivity(os, mechs, range, commBase)) {
      if (row.id === 'none' || row.commission <= 0) continue;
      team.set(row.id, { id: row.id, name: row.name, commission: row.commission, vales: 0 });
    }
    for (const [id, total] of vales) {
      const row = team.get(id) ?? { id, name: id === '__none__' ? 'Sem colaborador' : names.get(id) ?? 'Colaborador removido', commission: 0, vales: 0 };
      row.vales = total;
      team.set(id, row);
    }
    return {
      cur, before, sales,
      inChange: change(cur.inflow, before.inflow),
      outChange: change(cur.outflow, before.outflow),
      methods: byMethod(entries, range),
      categories: expensesByCategory(entries, range),
      team: [...team.values()].sort((a, b) => (b.commission - b.vales) - (a.commission - a.vales)),
      toReceive: receivables(os, firstOpen),
      partsCost, partsSale, osWithCost,
      closes: closings(regs, range),
      series: flowSeries(entries, range),
    };
  }, [entries, payments, regs, os, mechs, range, prev, firstOpen, costItems, commBase]);

  if (!allowed) {
    return (
      <WorkshopLayout>
        <div className="max-w-md mx-auto card text-center py-12">
          <div className="text-4xl mb-2">🔒</div>
          <h1 className="text-lg font-bold">Financeiro restrito</h1>
          <p className="text-sm text-steel-500 mt-1">Sua função não tem a permissão “Painel financeiro”. Peça ao gestor para liberar em Acessos e funções.</p>
        </div>
      </WorkshopLayout>
    );
  }

  const maxBar = Math.max(1, ...f.series.map(s => Math.max(s.inflow, s.outflow)));
  const methodTotal = f.methods.reduce((a, x) => a + x.total, 0);
  const categoryTotal = f.categories.reduce((a, x) => a + x.total, 0);
  const credit = f.methods.find(x => x.method === 'credito');
  const noCash = entries.length === 0 && regs.length === 0;

  return (
    <WorkshopLayout>
      <div className="max-w-6xl mx-auto space-y-5">
        {/* Cabeçalho + período */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-sm text-steel-500">Financeiro</div>
            <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">💵 Como está o dinheiro</h1>
            <div className="text-xs text-steel-400 mt-0.5">{period.label}</div>
          </div>
          <PeriodPicker period={period} />
        </div>

        {loading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => <div key={i} className="h-28 bg-white rounded-2xl animate-pulse" />)}
          </div>
        ) : (
          <>
            {noCash && f.toReceive.rows.length === 0 && (
              <div className="card text-center py-10">
                <div className="text-4xl mb-2">💵</div>
                <h2 className="text-lg font-bold">O financeiro se monta sozinho pelo Caixa</h2>
                <p className="text-sm text-steel-500 mt-1 max-w-md mx-auto">
                  Cada recebimento, despesa, vale e fechamento lançado no Caixa aparece aqui, somado por período.
                </p>
                <Link to="/oficina/caixa" className="btn-primary mt-5 inline-flex">💰 Ir para o Caixa</Link>
              </div>
            )}

            {/* KPIs */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <Kpi label="Saldo do período" value={brl(f.cur.result)} highlight
                note="entradas − saídas do caixa" tone={f.cur.result < 0 ? 'bad' : undefined} />
              <Kpi label="Entradas" value={brl(f.cur.inflow)} delta={f.inChange} note={PREV_LABEL[preset]} />
              <Kpi label="Saídas" value={brl(f.cur.outflow)} delta={f.outChange} note={PREV_LABEL[preset]} invert />
              <Kpi label="A receber" value={brl(f.toReceive.total)}
                note={firstOpen ? `${f.toReceive.rows.length} OS concluída${f.toReceive.rows.length === 1 ? '' : 's'} sem quitar` : 'conta a partir do 1º caixa'}
                tone={f.toReceive.overdueTotal > 0 ? 'warn' : undefined} />
            </div>

            {/* Faturado × recebido + gráfico */}
            <div className="grid lg:grid-cols-3 gap-4">
              <div className="card">
                <div className="text-[10px] font-bold text-steel-500 uppercase tracking-widest mb-3">Faturado × recebido</div>
                <Line label="Faturado (OS concluídas)" value={brl(f.sales.revenue)} sub={`${f.sales.count} OS`} />
                <Line label="Recebido de OS no caixa" value={brl(f.cur.received)} sub={`${f.cur.receipts} recebimento${f.cur.receipts === 1 ? '' : 's'}`} />
                {f.cur.other > 0 && <Line label="Entradas avulsas" value={brl(f.cur.other)} />}
                <Line label="Descontos no balcão" value={brl(f.cur.discounts)} sub={`${f.cur.discountCount}×`} muted />
                {f.osWithCost > 0 && (
                  <>
                    <Line label="Custo das peças" value={brl(f.partsCost)} sub={`${f.osWithCost} de ${f.sales.count} OS com custo`} />
                    <Line label="Lucro nas peças" value={brl(f.partsSale - f.partsCost)}
                      sub={f.partsCost > 0 ? `margem ${Math.round(((f.partsSale - f.partsCost) / f.partsCost) * 100)}%` : undefined} />
                  </>
                )}
                <p className="text-[11px] text-steel-400 mt-3 leading-snug">
                  Faturado conta a OS no dia em que foi concluída; recebido conta o dia em que o dinheiro entrou.
                </p>
              </div>
              <div className="card lg:col-span-2">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-[10px] font-bold text-steel-500 uppercase tracking-widest">Entradas × saídas por {f.series.length > 62 ? 'mês' : 'dia'}</div>
                  <div className="flex gap-3 text-[11px] text-steel-500">
                    <span className="flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-sm bg-signal-500 inline-block" />Entradas</span>
                    <span className="flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-sm bg-alert-400 inline-block" />Saídas</span>
                  </div>
                </div>
                {f.series.length <= 1 ? (
                  <div className="text-sm text-steel-500 py-6 text-center">Escolha um período maior para ver o gráfico.</div>
                ) : (
                  <div className="flex items-end gap-1 h-40">
                    {f.series.map((s, i) => (
                      <div key={i} className="flex-1 flex flex-col items-center justify-end h-full group relative min-w-0">
                        <div className="absolute -top-1 -translate-y-full hidden group-hover:block bg-steel-900 text-white text-[10px] rounded px-1.5 py-0.5 whitespace-nowrap z-10">
                          {s.label}: +{brl(s.inflow)} / −{brl(s.outflow)}
                        </div>
                        <div className="w-full flex items-end gap-px h-full">
                          <div className={`flex-1 rounded-t ${s.inflow ? 'bg-signal-500' : 'bg-steel-100'}`}
                            style={{ height: `${Math.max(s.inflow ? 4 : 2, (s.inflow / maxBar) * 100)}%` }} />
                          <div className={`flex-1 rounded-t ${s.outflow ? 'bg-alert-400' : 'bg-steel-100'}`}
                            style={{ height: `${Math.max(s.outflow ? 4 : 2, (s.outflow / maxBar) * 100)}%` }} />
                        </div>
                        {(f.series.length <= 15 || i % Math.ceil(f.series.length / 10) === 0) && (
                          <div className="text-[9px] text-steel-400 mt-1 truncate w-full text-center">{s.label}</div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Formas de pagamento + despesas */}
            <div className="grid lg:grid-cols-2 gap-4">
              <div className="card">
                <div className="text-[10px] font-bold text-steel-500 uppercase tracking-widest mb-3">💳 Recebido por forma de pagamento</div>
                {f.methods.length === 0 ? <p className="text-sm text-steel-400">Nenhum recebimento no período.</p> : (
                  f.methods.map(x => (
                    <Split key={x.method} label={`${METHODS[x.method].icon} ${METHODS[x.method].label}`}
                      value={x.total} total={methodTotal} color={x.method === 'dinheiro' ? 'bg-signal-500' : x.method === 'pix' ? 'bg-brand-500' : 'bg-steel-500'} />
                  ))
                )}
                {credit && credit.installmentTotal > 0 && (
                  <p className="text-xs text-steel-600 bg-steel-50 rounded-lg px-3 py-2 mt-1">
                    💡 {brl(credit.installmentTotal)} foi no crédito parcelado — esse dinheiro cai no banco aos poucos, parcela por parcela.
                  </p>
                )}
              </div>

              <div className="card">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-[10px] font-bold text-steel-500 uppercase tracking-widest">🧾 Despesas do caixa</div>
                  <div className="text-sm font-bold">{brl(categoryTotal)}</div>
                </div>
                {f.categories.length === 0 ? <p className="text-sm text-steel-400">Nenhuma despesa lançada no período.</p> : (
                  f.categories.map(x => (
                    <Split key={x.category} label={`${x.category} · ${x.count}×`} value={x.total} total={categoryTotal} color="bg-alert-400" />
                  ))
                )}
                <p className="text-[11px] text-steel-400 mt-2 leading-snug">
                  Só o que foi pago com o dinheiro do caixa. Aluguel, luz e fornecedores entram com Contas a Pagar.
                </p>
              </div>
            </div>

            {/* Contas a pagar */}
            <PayablesCard payables={payables} from={range.from} to={range.to} />

            {/* A receber */}
            <div className="card">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <div className="text-[10px] font-bold text-steel-500 uppercase tracking-widest">📥 A receber — OS concluídas sem quitar</div>
                <div className="text-sm">
                  <strong>{brl(f.toReceive.total)}</strong>
                  {f.toReceive.overdueTotal > 0 && <span className="text-alert-600"> · {brl(f.toReceive.overdueTotal)} há mais de 7 dias</span>}
                </div>
              </div>
              {!firstOpen ? (
                <p className="text-sm text-steel-400">Começa a contar quando você abrir o primeiro caixa. As OS concluídas antes disso não entram aqui, porque o pagamento delas não foi registrado no sistema.</p>
              ) : f.toReceive.rows.length === 0 ? (
                <p className="text-sm text-steel-400">Tudo recebido. Nenhuma OS concluída com saldo em aberto. 👏</p>
              ) : (
                <ul className="divide-y divide-steel-100">
                  {f.toReceive.rows.slice(0, 12).map(({ os: o, open, days, partial }) => (
                    <li key={o.id}>
                      <Link to={`/oficina/os/${o.id}`} className="flex items-center justify-between gap-3 py-2 hover:bg-steel-50 -mx-2 px-2 rounded-lg">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold truncate">OS {osNumber(o)} · {o.title}</div>
                          <div className="text-xs text-steel-500 truncate">
                            {o.customer?.full_name ?? 'Sem cliente'}{o.vehicle?.plate ? ` · ${o.vehicle.plate}` : ''}
                            {partial && <> · pago {brl(o.paid_amount)} de {brl(o.price)}</>}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-sm font-bold">{brl(open)}</div>
                          <div className={`text-[11px] ${days > 7 ? 'text-alert-600 font-semibold' : 'text-steel-400'}`}>
                            {days === 0 ? 'concluída hoje' : `há ${days} dia${days === 1 ? '' : 's'}`}
                          </div>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              {f.toReceive.rows.length > 12 && (
                <p className="text-xs text-steel-500 mt-2">+ {f.toReceive.rows.length - 12} OS. As mais antigas aparecem primeiro.</p>
              )}
            </div>

            {/* Comissões detalhadas por colaborador */}
            {wid && (
              <div className="card">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <div className="text-[10px] font-bold text-steel-500 uppercase tracking-widest">
                    🏅 Comissões {commScope === 'hoje' ? 'de hoje' : 'do período'} por colaborador
                  </div>
                  <div className="flex items-center gap-2">
                    {([['hoje', 'Hoje'], ['periodo', 'Período do topo']] as const).map(([k, l]) => (
                      <button key={k} onClick={() => setCommScope(k)}
                        className={`text-xs font-semibold px-3 py-1 rounded-full border transition ${commScope === k ? 'bg-steel-900 text-white border-steel-900' : 'bg-white text-steel-600 border-steel-200'}`}>
                        {l}
                      </button>
                    ))}
                    <Link to="/oficina/comissoes" className="text-xs font-semibold text-brand-700 ml-1">Fechar comissões →</Link>
                  </div>
                </div>
                <CommissionDetail wid={wid} from={commScope === 'hoje' ? todayRange.from : range.from} to={commScope === 'hoje' ? todayRange.to : range.to} />
                <p className="text-[11px] text-steel-400 mt-2">Toque no colaborador para ver cada OS: o que ele fez em serviços e peças × a % dele. Só OS concluídas.</p>
              </div>
            )}

            {/* Equipe + fechamentos */}
            <div className="grid lg:grid-cols-2 gap-4">
              <div className="card">
                <div className="text-[10px] font-bold text-steel-500 uppercase tracking-widest mb-3">👷 Comissões e vales da equipe</div>
                {f.team.length === 0 ? (
                  <p className="text-sm text-steel-400">Sem comissões nem vales no período. A comissão de cada mecânico é definida em Equipe.</p>
                ) : (
                  <>
                    <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 gap-y-2 text-sm items-center">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-steel-400">Colaborador</span>
                      <span className="text-[10px] font-bold uppercase tracking-widest text-steel-400 text-right">Comissão</span>
                      <span className="text-[10px] font-bold uppercase tracking-widest text-steel-400 text-right">Vales</span>
                      <span className="text-[10px] font-bold uppercase tracking-widest text-steel-400 text-right">Saldo</span>
                      {f.team.map(r => {
                        const bal = r.commission - r.vales;
                        return (
                          <div key={r.id} className="contents">
                            <span className="truncate">{r.name}</span>
                            <span className="text-right">{brl(r.commission)}</span>
                            <span className="text-right text-steel-500">{r.vales ? `−${brl(r.vales)}` : '—'}</span>
                            <span className={`text-right font-semibold ${bal < 0 ? 'text-alert-600' : ''}`}>{brl(bal)}</span>
                          </div>
                        );
                      })}
                    </div>
                    <p className="text-[11px] text-steel-400 mt-3 leading-snug">
                      Comissão sobre a mão de obra das OS concluídas no período, menos os vales adiantados no caixa. Saldo negativo = vale maior que a comissão.
                    </p>
                  </>
                )}
              </div>

              <div className="card">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-[10px] font-bold text-steel-500 uppercase tracking-widest">🔒 Fechamentos de caixa</div>
                  {f.closes.rows.length > 0 && (
                    <div className={`text-sm font-bold ${f.closes.net < 0 ? 'text-alert-600' : f.closes.net > 0 ? 'text-pending-700' : 'text-signal-600'}`}>
                      {f.closes.net === 0 ? 'Tudo batendo' : `${f.closes.net > 0 ? 'Sobra' : 'Falta'} de ${brl(Math.abs(f.closes.net))}`}
                    </div>
                  )}
                </div>
                {f.closes.rows.length === 0 ? <p className="text-sm text-steel-400">Nenhum caixa fechado no período.</p> : (
                  <ul className="divide-y divide-steel-100">
                    {f.closes.rows.slice(0, 10).map(c => (
                      <li key={c.id} className="flex items-center justify-between gap-3 py-2">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold">
                            {new Date(c.closed_at!).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })}
                            <span className="font-normal text-steel-500"> · {hhmm(c.opened_at)}–{hhmm(c.closed_at!)}</span>
                          </div>
                          <div className="text-xs text-steel-500 truncate">
                            {c.closed_by && ops[c.closed_by] ? `Fechado por ${ops[c.closed_by]} · ` : ''}esperado {brl(c.expected_cash)} · contado {brl(c.counted_cash)}
                          </div>
                          {c.close_notes && <div className="text-xs text-steel-400 truncate">“{c.close_notes}”</div>}
                        </div>
                        <span className={`badge shrink-0 ${Math.abs(c.diff) < 0.01 ? 'bg-signal-100 text-signal-700' : c.diff < 0 ? 'bg-alert-100 text-alert-700' : 'bg-pending-100 text-pending-800'}`}>
                          {Math.abs(c.diff) < 0.01 ? 'Bateu' : `${c.diff > 0 ? '+' : '−'}${brl(Math.abs(c.diff))}`}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {/* Extrato: cada recebimento com a OS de origem */}
            <PaymentsList filter={{ workshopId: wid!, from: range.from.toISOString(), to: range.to.toISOString() }}
              title="🧾 Recebimentos de OS no período" empty="Nenhum recebimento no período." />
          </>
        )}
      </div>
    </WorkshopLayout>
  );
}

function Kpi({ label, value, delta, note, highlight = false, invert = false, tone }: {
  label: string; value: string; delta?: number | null; note?: string; highlight?: boolean;
  /** Para saídas: subir é ruim */
  invert?: boolean;
  tone?: 'bad' | 'warn';
}) {
  const good = delta != null && (invert ? delta <= 0 : delta >= 0);
  const valueColor = tone === 'bad' ? (highlight ? 'text-alert-300' : 'text-alert-600') : tone === 'warn' ? 'text-pending-700' : '';
  return (
    <div className={`card ${highlight ? '!bg-steel-900 text-white' : ''}`}>
      <div className={`text-[10px] font-bold uppercase tracking-widest ${highlight ? 'text-steel-400' : 'text-steel-500'}`}>{label}</div>
      <div className={`text-2xl lg:text-3xl font-bold font-display mt-1 ${valueColor}`}>{value}</div>
      {delta !== undefined && (
        <div className="text-xs mt-1">
          {delta == null ? <span className="text-steel-400">sem base de comparação</span> : (
            <span className={good ? 'text-signal-500 font-semibold' : 'text-alert-500 font-semibold'}>
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

function Line({ label, value, sub, muted }: { label: string; value: string; sub?: string; muted?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 border-b border-steel-100 last:border-0">
      <span className={`text-sm ${muted ? 'text-steel-500' : 'text-steel-700'}`}>{label}</span>
      <span className={`text-sm font-semibold text-right ${muted ? 'text-steel-500' : ''}`}>
        {value}{sub && <span className="block text-[10px] font-normal text-steel-400">{sub}</span>}
      </span>
    </div>
  );
}

function Split({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = total ? (value / total) * 100 : 0;
  return (
    <div className="mb-3">
      <div className="flex justify-between text-sm mb-1 gap-2">
        <span className="text-steel-700 truncate">{label}</span>
        <span className="font-semibold shrink-0">{brl(value)} <span className="text-xs text-steel-400">{Math.round(pct)}%</span></span>
      </div>
      <div className="h-2 rounded-full bg-steel-100 overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function PayablesCard({ payables, from, to }: {
  payables: Pick<Payable, 'amount' | 'due_date' | 'paid_at' | 'paid_from'>[]; from: Date; to: Date;
}) {
  const open = payables.filter(p => !p.paid_at);
  const sum = (xs: typeof payables) => xs.reduce((a, p) => a + Number(p.amount), 0);
  const overdue = sum(open.filter(p => daysUntil(p.due_date) < 0));
  const week = sum(open.filter(p => { const d = daysUntil(p.due_date); return d >= 0 && d <= 7; }));
  const inRange = (iso: string) => { const t = new Date(`${iso}T12:00:00`).getTime(); return t >= from.getTime() && t < to.getTime(); };
  const paid = payables.filter(p => p.paid_at && inRange(p.paid_at));
  const paidBank = sum(paid.filter(p => p.paid_from === 'banco'));
  return (
    <div className="card">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="text-[10px] font-bold text-steel-500 uppercase tracking-widest">📤 Contas a pagar</div>
        <Link to="/oficina/contas-a-pagar" className="text-xs font-semibold text-brand-700">Abrir contas a pagar →</Link>
      </div>
      {payables.length === 0 ? (
        <p className="text-sm text-steel-400">Nenhuma conta lançada. As parcelas das notas de compra e as contas fixas (aluguel, luz…) aparecem aqui.</p>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Mini label="Vencidas" value={brl(overdue)} tone={overdue > 0 ? 'text-alert-600' : ''} />
          <Mini label="Hoje + 7 dias" value={brl(week)} tone={week > 0 ? 'text-pending-700' : ''} />
          <Mini label="Total em aberto" value={brl(sum(open))} />
          <Mini label="Pago pelo banco no período" value={brl(paidBank)} sub="as pagas pelo caixa já estão nas saídas" />
        </div>
      )}
    </div>
  );
}

function Mini({ label, value, sub, tone = '' }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="bg-steel-50 rounded-xl px-3 py-3">
      <div className="text-[10px] font-bold uppercase tracking-widest text-steel-500">{label}</div>
      <div className={`text-xl font-bold font-display mt-0.5 ${tone}`}>{value}</div>
      {sub && <div className="text-[10px] text-steel-400 mt-0.5 leading-tight">{sub}</div>}
    </div>
  );
}
