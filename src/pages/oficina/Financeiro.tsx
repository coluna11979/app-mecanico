import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import WorkshopLayout from '@/components/layout/WorkshopLayout';
import PaymentsList from '@/components/cash/PaymentsList';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { canDo, sessionAllows, useOperator } from '@/lib/operators';
import { brl } from '@/lib/cash';
import { fetchAll } from '@/lib/fetchAll';
import { daysUntil } from '@/lib/purchasing';
import { change, previousRange, salesOf } from '@/lib/workshopMetrics';
import PeriodPicker, { PRESETS, PREV_LABEL, usePeriod, type Preset } from '@/components/PeriodPicker';
import ReceivablesTab from '@/components/finance/ReceivablesTab';
import CompletedOsList from '@/components/finance/CompletedOsList';
import {
  cashFlowOf, closings, flowSeriesFull, operatingResult, outflowsOf, receivables, receivedGroups,
  type FinEntry, type FinOs, type FinPayable, type FinPayment, type FinRegister,
} from '@/lib/finance';

type CostItem = { service_order_id: string; quantity: number; unit_price: number; unit_cost: number };

/**
 * Visão financeira (gerencial): quanto faturou, recebeu, tem a receber, saiu e sobrou no período,
 * pendências com ação direta e evolução. O detalhe fica nas telas próprias (Caixa, Contas a pagar,
 * Fechar comissões); aqui entra só o impacto agregado.
 */
export default function Financeiro() {
  const { currentWorkshop } = useAuth();
  const wid = currentWorkshop?.id ?? null;
  const { balcao, session } = useOperator();
  const allowed = canDo(session, balcao, 'ver_financeiro');
  /** Link para outra tela só aparece como botão se a pessoa puder abrir */
  const canOpen = (path: string) => !balcao || !session || sessionAllows(session, path);

  const period = usePeriod('financeiro-periodo');
  const { preset, range } = period;
  /** Visão geral do dinheiro ou a lista de OS a receber (o Início abre direto em ?aba=receber) */
  const [tab, setTab] = useState<'geral' | 'receber'>(() => {
    try { return new URLSearchParams(window.location.search).get('aba') === 'receber' ? 'receber' : 'geral'; } catch { return 'geral'; }
  });
  const [entries, setEntries]   = useState<FinEntry[]>([]);
  const [payments, setPayments] = useState<FinPayment[]>([]);
  const [regs, setRegs]         = useState<FinRegister[]>([]);
  const [os, setOs]             = useState<FinOs[]>([]);
  const [firstOpen, setFirstOpen] = useState<string | null>(null);
  const [payables, setPayables] = useState<FinPayable[]>([]);
  const [costItems, setCostItems] = useState<CostItem[]>([]);
  const [loading, setLoading]   = useState(true);

  const prev = useMemo(() => previousRange(range), [range]);
  // Movimentos: do início do período anterior (comparação) até o fim do atual
  const fromIso = prev.from.toISOString();
  const toIso = range.to.toISOString();

  useEffect(() => {
    if (!wid || !allowed) return;
    let alive = true;
    (async () => {
      setLoading(true);
      const [e, p, r, o, first, ci, pay] = await Promise.all([
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
          .select('id, number, title, status, quote_status, price, parts_cost, labor_cost, paid_amount, counter_discount, pay_later_due, pay_later_note, created_at, started_at, completed_at, estimated_hours, workshop_mechanic_id, customer_id, customer:customers(id, full_name, phone, created_at), vehicle:vehicles(make, model, plate)')
          .eq('workshop_id', wid).eq('status', 'completed').order('id').range(a, b)),
        supabase.from('cash_registers').select('opened_at').eq('workshop_id', wid)
          .order('opened_at').limit(1).maybeSingle(),
        fetchAll((a, b) => supabase.from('service_order_items')
          .select('service_order_id, quantity, unit_price, unit_cost')
          .eq('workshop_id', wid).eq('kind', 'part').not('unit_cost', 'is', null)
          .order('id').range(a, b)),
        // Contas em aberto (todas) + pagas desde o início do período anterior
        fetchAll((a, b) => supabase.from('payables').select('amount, due_date, paid_at, paid_from, category, invoice_id')
          .eq('workshop_id', wid).is('cancelled_at', null)
          .or(`paid_at.is.null,paid_at.gte.${fromIso.slice(0, 10)}`)
          .order('id').range(a, b)),
      ]);
      if (!alive) return;
      setEntries((e.data as FinEntry[]) ?? []);
      setPayments((p.data as FinPayment[]) ?? []);
      setRegs((r.data as FinRegister[]) ?? []);
      setOs((o.data as unknown as FinOs[]) ?? []);
      setCostItems((ci.data as CostItem[]) ?? []);
      setPayables((pay.data as FinPayable[]) ?? []);
      setFirstOpen((first.data as { opened_at: string } | null)?.opened_at ?? null);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [wid, allowed, fromIso, toIso]);

  const f = useMemo(() => {
    /** Faturado, custo das peças vendidas, saídas e resultado de um intervalo */
    const periodOf = (r: typeof range) => {
      const sales = salesOf(os, r);
      const ids = new Set(sales.sales.map(o => o.id));
      const withCost = costItems.filter(i => ids.has(i.service_order_id));
      const partsCost = withCost.reduce((a, i) => a + Number(i.quantity) * Number(i.unit_cost), 0);
      const out = outflowsOf(entries, payables, r);
      const res = operatingResult(sales.revenue, partsCost, out.operating);
      // Cobertura do custo: OS com peças × OS em que alguma peça tem custo cadastrado
      const withParts = sales.sales.filter(o => Number(o.parts_cost ?? 0) > 0).length;
      const costed = new Set(withCost.map(i => i.service_order_id)).size;
      return { sales, partsCost, out, res, withParts, costed, cash: cashFlowOf(entries, payments, r) };
    };
    const cur = periodOf(range);
    const before = periodOf(prev);
    const toReceive = receivables(os, firstOpen);
    const openPay = payables.filter(p => !p.paid_at);
    const overduePay = openPay.filter(p => daysUntil(p.due_date) < 0);
    const weekPay = openPay.filter(p => { const d = daysUntil(p.due_date); return d >= 0 && d <= 7; });
    const unpaidOs = toReceive.rows.filter(x => x.dueIn == null && !x.overdue);
    const closes = closings(regs, range);
    return {
      cur, before, toReceive,
      deltas: {
        revenue: change(cur.sales.revenue, before.sales.revenue),
        received: change(cur.cash.inflow, before.cash.inflow),
        out: change(cur.out.total, before.out.total),
        result: change(cur.res.result, before.res.result),
      },
      alerts: {
        overduePay: { n: overduePay.length, total: overduePay.reduce((a, p) => a + Number(p.amount), 0) },
        weekPay: { n: weekPay.length, total: weekPay.reduce((a, p) => a + Number(p.amount), 0) },
        overdueRec: { n: toReceive.overdue.length, total: toReceive.overdueTotal },
        unpaidOs: { n: unpaidOs.length, total: unpaidOs.reduce((a, x) => a + x.open, 0) },
        divergences: closes.rows.filter(c => Math.abs(c.diff) >= 0.01),
      },
      received: receivedGroups(entries, range),
      series: flowSeriesFull(entries, payables, range),
    };
  }, [entries, payments, regs, os, range, prev, firstOpen, costItems, payables]);

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

  const { cur, deltas, alerts } = f;
  const prevLabel = PREV_LABEL[preset];
  const empty = cur.sales.count === 0 && cur.cash.inflow === 0 && cur.out.total === 0;
  const partial = cur.withParts > 0 && cur.costed < cur.withParts;
  const hasAlerts = alerts.overduePay.n > 0 || alerts.weekPay.n > 0 || alerts.overdueRec.n > 0 || alerts.unpaidOs.n > 0 || alerts.divergences.length > 0;
  const openReceber = () => { setTab('receber'); window.scrollTo({ top: 0, behavior: 'smooth' }); };

  return (
    <WorkshopLayout>
      <div className="max-w-6xl mx-auto space-y-5">
        {/* Topo: título + período */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">Visão financeira</h1>
            <div className="text-xs text-steel-400 mt-0.5">{period.label}</div>
          </div>
          {tab === 'geral' && (
            <>
              {/* Celular: filtro compacto */}
              <div className="sm:hidden w-full flex flex-wrap gap-2">
                <select className="input !py-2 text-sm flex-1" value={preset} onChange={e => period.setPreset(e.target.value as Preset)}>
                  {PRESETS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
                </select>
                {preset === 'custom' && (
                  <div className="flex items-center gap-1.5 w-full">
                    <input type="date" className="input !py-1.5 text-sm" value={period.custom.from} onChange={e => period.setCustom(c => ({ ...c, from: e.target.value }))} />
                    <span className="text-steel-400 text-sm">a</span>
                    <input type="date" className="input !py-1.5 text-sm" value={period.custom.to} onChange={e => period.setCustom(c => ({ ...c, to: e.target.value }))} />
                  </div>
                )}
              </div>
              <div className="hidden sm:block"><PeriodPicker period={period} /></div>
            </>
          )}
        </div>

        {/* Abas */}
        <div className="flex gap-1 bg-steel-100 rounded-xl p-1">
          {([['geral', 'Visão geral'], ['receber', `OS a receber${f.toReceive.rows.length ? ` (${f.toReceive.rows.length})` : ''}`]] as const).map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`flex-1 rounded-lg py-2 text-sm font-semibold transition ${tab === k ? 'bg-white shadow text-steel-900' : 'text-steel-500 hover:text-steel-700'}`}>
              {l}
            </button>
          ))}
        </div>

        {tab === 'receber' ? (
          loading
            ? <div className="h-40 bg-white rounded-2xl animate-pulse" />
            : <ReceivablesTab data={f.toReceive} firstOpen={firstOpen} shopName={currentWorkshop?.business_name} />
        ) : loading ? (
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-28 bg-white rounded-2xl animate-pulse" />)}
          </div>
        ) : (
          <>
            {/* KPIs principais */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              <Kpi label="Faturado" value={brl(cur.sales.revenue)} delta={deltas.revenue} note={prevLabel}
                tip="Faturado considera as OS concluídas no período." sub={`${cur.sales.count} OS concluída${cur.sales.count === 1 ? '' : 's'}`} />
              <Kpi label="Recebido" value={brl(cur.cash.inflow)} delta={deltas.received} note={prevLabel}
                tip="Recebido considera os pagamentos efetivamente recebidos no período (inclui entradas avulsas do caixa)." />
              <Kpi label="A receber" value={brl(f.toReceive.total)}
                sub={firstOpen ? (alerts.overdueRec.n > 0 ? `${alerts.overdueRec.n} vencida${alerts.overdueRec.n === 1 ? '' : 's'}` : `${f.toReceive.rows.length} OS em aberto`) : 'conta a partir do 1º caixa'}
                tone={alerts.overdueRec.n > 0 ? 'warn' : undefined}
                tip="OS concluídas com saldo em aberto (independe do período), contadas a partir do primeiro caixa aberto." />
              <Kpi label="Saídas" value={brl(cur.out.total)} delta={deltas.out} note={prevLabel} invert
                tip="Despesas e vales do caixa + contas pagas no período. Sangria e suprimento não entram (só mudam o dinheiro de lugar)." />
              <Kpi label="Resultado operacional estimado" value={brl(cur.res.result)} delta={deltas.result} note={prevLabel} highlight wide
                tone={cur.res.result < 0 ? 'bad' : undefined}
                sub={cur.res.margin != null ? `margem estimada ${Math.round(cur.res.margin)}%` : undefined}
                tip="Faturado − custo das peças vendidas − demais despesas do período. Estimativa: não é lucro contábil." />
            </div>
            <p className="text-[11px] text-steel-400 -mt-2">
              ⓘ Faturado considera as OS concluídas no período. Recebido considera os pagamentos efetivamente recebidos no período.
            </p>

            {empty && (
              <div className="card text-center py-8">
                <div className="text-3xl mb-2">📊</div>
                <p className="text-sm text-steel-600 max-w-md mx-auto">
                  Ainda não há movimentações suficientes para mostrar uma visão financeira deste período.
                  Concluir OS e lançar recebimentos, despesas e contas faz os números aparecerem aqui.
                </p>
                <div className="flex flex-wrap justify-center gap-2 mt-4">
                  {preset !== 'month' && <button className="btn-secondary text-sm" onClick={() => period.setPreset('month')}>Ver este mês</button>}
                  {canOpen('/oficina/caixa') && <Link to="/oficina/caixa" className="btn-secondary text-sm">Ir para o Caixa</Link>}
                </div>
              </div>
            )}

            {/* Pendências acionáveis */}
            {hasAlerts && (
              <div className="card !p-0 overflow-hidden border border-pending-200">
                <div className="px-5 py-2.5 bg-pending-50 text-xs font-bold uppercase tracking-widest text-pending-800">⚠️ Pendências</div>
                <ul className="divide-y divide-steel-100">
                  {alerts.overduePay.n > 0 && (
                    <Alert tone="bad" text={<><strong>{brl(alerts.overduePay.total)}</strong> em contas vencidas ({alerts.overduePay.n})</>}
                      action={canOpen('/oficina/contas-a-pagar') ? { label: 'Ver contas a pagar', to: '/oficina/contas-a-pagar' } : undefined} />
                  )}
                  {alerts.overdueRec.n > 0 && (
                    <Alert tone="bad" text={<><strong>{brl(alerts.overdueRec.total)}</strong> a receber vencido ({alerts.overdueRec.n} OS)</>}
                      action={{ label: 'Ver a receber', onClick: openReceber }} />
                  )}
                  {alerts.unpaidOs.n > 0 && (
                    <Alert text={<><strong>{alerts.unpaidOs.n} OS concluída{alerts.unpaidOs.n === 1 ? '' : 's'}</strong> sem pagamento ({brl(alerts.unpaidOs.total)})</>}
                      action={{ label: 'Ver a receber', onClick: openReceber }} />
                  )}
                  {alerts.weekPay.n > 0 && (
                    <Alert text={<><strong>{brl(alerts.weekPay.total)}</strong> em contas vencem nos próximos 7 dias ({alerts.weekPay.n})</>}
                      action={canOpen('/oficina/contas-a-pagar') ? { label: 'Ver contas a pagar', to: '/oficina/contas-a-pagar' } : undefined} />
                  )}
                  {alerts.divergences.slice(0, 3).map(c => (
                    <Alert key={c.id} text={<>Caixa de {new Date(c.closed_at!).toLocaleDateString('pt-BR')} fechou com <strong>{c.diff > 0 ? 'sobra' : 'falta'} de {brl(Math.abs(c.diff))}</strong></>}
                      action={canOpen('/oficina/caixa') ? { label: 'Abrir caixa', to: '/oficina/caixa' } : undefined} />
                  ))}
                </ul>
              </div>
            )}

            {/* Resultado do período + evolução */}
            <div className="grid lg:grid-cols-2 gap-4">
              <div className="card">
                <SectionTitle>Resultado do período</SectionTitle>
                <Row label="Faturado" value={brl(cur.sales.revenue)} strong />
                <Row label="(−) Custo das peças vendidas" value={brl(cur.partsCost)} />
                <Row label="(−) Despesas do período" value={brl(cur.out.operating)} />
                {cur.out.groups.map(g => (
                  <Row key={g.key} label={`${g.icon} ${g.label}`} value={brl(g.total)} indent />
                ))}
                <div className="flex items-baseline justify-between gap-3 pt-2.5 mt-1 border-t border-steel-200">
                  <span className="font-bold">= Resultado operacional estimado</span>
                  <span className={`text-lg font-bold font-display ${cur.res.result < 0 ? 'text-alert-600' : ''}`}>{brl(cur.res.result)}</span>
                </div>
                {cur.res.margin != null && <div className="text-right text-xs text-steel-500">margem estimada {Math.round(cur.res.margin)}%</div>}
                <div className="mt-3 space-y-1.5 text-[11px] text-steel-500 leading-snug">
                  {partial && (
                    <p className="text-pending-800 bg-pending-50 rounded-lg px-2.5 py-1.5">
                      Estimativa baseada nos custos disponíveis. Custo informado em {cur.costed} de {cur.withParts} OS.
                    </p>
                  )}
                  {cur.out.partsPurchases > 0 && (
                    <p>Compras de peças pagas no período ({brl(cur.out.partsPurchases)}) não entram de novo aqui: a peça já conta pelo custo das peças vendidas.</p>
                  )}
                  <p>Comissões, salários e vales entram quando já foram pagos ou lançados como despesa.
                    {canOpen('/oficina/comissoes') && <> <Link to="/oficina/comissoes" className="font-semibold text-brand-700">Ver comissões da equipe →</Link></>}
                  </p>
                </div>
              </div>

              <div className="card">
                <div className="flex items-center justify-between mb-3">
                  <SectionTitle className="!mb-0">Entradas × saídas por {f.series.length > 62 ? 'mês' : 'dia'}</SectionTitle>
                  <div className="flex gap-3 text-[11px] text-steel-500">
                    <span className="flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-sm bg-signal-500 inline-block" />Entradas</span>
                    <span className="flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-sm bg-alert-400 inline-block" />Saídas</span>
                  </div>
                </div>
                <FlowChart series={f.series} />
              </div>
            </div>

            {/* Origem do faturamento + recebimentos */}
            <div className="grid lg:grid-cols-2 gap-4">
              <div className="card">
                <SectionTitle>Origem do faturamento</SectionTitle>
                {cur.sales.revenue <= 0 ? <p className="text-sm text-steel-400">Nenhuma OS concluída no período.</p> : (
                  <>
                    <Split label="🔧 Mão de obra" value={cur.sales.labor} total={cur.sales.revenue} color="bg-brand-500" />
                    <Split label="🔩 Peças" value={cur.sales.parts} total={cur.sales.revenue} color="bg-steel-500" />
                    {cur.sales.unsplit > 0.009 && (
                      <Split label="Sem detalhamento" value={cur.sales.unsplit} total={cur.sales.revenue} color="bg-steel-300" />
                    )}
                    {cur.sales.unsplit > 0.009 && (
                      <p className="text-[11px] text-steel-400">“Sem detalhamento”: OS antigas ou com desconto, em que o total não se divide entre mão de obra e peças.</p>
                    )}
                  </>
                )}
              </div>
              <div className="card">
                <SectionTitle>Recebimentos</SectionTitle>
                {f.received.rows.length === 0 ? <p className="text-sm text-steel-400">Nenhum recebimento no período.</p> : (
                  f.received.rows.map(x => (
                    <Split key={x.key} label={x.label} value={x.total} total={f.received.rows.reduce((a, r) => a + r.total, 0)}
                      color={x.key === 'pix' ? 'bg-brand-500' : x.key === 'dinheiro' ? 'bg-signal-500' : 'bg-steel-500'} />
                  ))
                )}
                {f.received.installments > 0 && (
                  <p className="text-xs text-steel-600 bg-steel-50 rounded-lg px-3 py-2 mt-1">
                    💡 {brl(f.received.installments)} no crédito parcelado — esse dinheiro cai no banco aos poucos.
                  </p>
                )}
              </div>
            </div>

            {/* Conferência do período (recolhida) */}
            <details className="card group">
              <summary className="cursor-pointer list-none flex items-center justify-between text-sm font-semibold text-steel-700">
                <span>Conferência do período · OS concluídas e recebimentos</span>
                <span className="text-steel-400 group-open:rotate-90 transition">›</span>
              </summary>
              <div className="mt-4 space-y-4">
                <CompletedOsList list={cur.sales.sales as FinOs[]} />
                <PaymentsList filter={{ workshopId: wid!, from: range.from.toISOString(), to: range.to.toISOString() }}
                  title="Recebimentos de OS no período" empty="Nenhum recebimento no período." />
              </div>
            </details>
          </>
        )}
      </div>
    </WorkshopLayout>
  );
}

function SectionTitle({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`text-[10px] font-bold text-steel-500 uppercase tracking-widest mb-3 ${className}`}>{children}</div>;
}

function Kpi({ label, value, delta, note, sub, tip, highlight = false, invert = false, wide = false, tone }: {
  label: string; value: string; delta?: number | null; note?: string; sub?: string; tip?: string;
  highlight?: boolean;
  /** Para saídas: subir é ruim */
  invert?: boolean;
  /** No celular ocupa a linha toda */
  wide?: boolean;
  tone?: 'bad' | 'warn';
}) {
  const good = delta != null && (invert ? delta <= 0 : delta >= 0);
  const valueColor = tone === 'bad' ? (highlight ? 'text-alert-300' : 'text-alert-600') : tone === 'warn' ? 'text-pending-700' : '';
  return (
    <div className={`card !p-4 ${highlight ? '!bg-steel-900 text-white' : ''} ${wide ? 'col-span-2 lg:col-span-1' : ''}`} title={tip}>
      <div className={`text-[10px] font-bold uppercase tracking-widest flex items-center gap-1 ${highlight ? 'text-steel-400' : 'text-steel-500'}`}>
        {label}{tip && <span className="opacity-60 cursor-help">ⓘ</span>}
      </div>
      <div className={`text-xl lg:text-2xl font-bold font-display mt-1 ${valueColor}`}>{value}</div>
      {sub && <div className={`text-[11px] mt-0.5 ${highlight ? 'text-steel-300' : 'text-steel-500'}`}>{sub}</div>}
      {delta !== undefined && (
        <div className="text-[11px] mt-1">
          {delta == null ? <span className={highlight ? 'text-steel-400' : 'text-steel-400'}>sem base de comparação</span> : (
            <>
              <span className={good ? 'text-signal-500 font-semibold' : 'text-alert-500 font-semibold'}>
                {delta >= 0 ? '▲' : '▼'} {Math.abs(Math.round(delta))}%
              </span>
              {note && <span className="text-steel-400"> {note}</span>}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ label, value, strong, indent }: { label: string; value: string; strong?: boolean; indent?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 py-1.5 ${indent ? 'pl-4 text-xs text-steel-500' : 'text-sm border-b border-steel-100'}`}>
      <span className={strong ? 'font-semibold text-steel-800' : indent ? '' : 'text-steel-700'}>{label}</span>
      <span className={strong ? 'font-bold' : indent ? '' : 'font-semibold'}>{value}</span>
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

function Alert({ text, action, tone }: {
  text: React.ReactNode; tone?: 'bad';
  action?: { label: string; to?: string; onClick?: () => void };
}) {
  return (
    <li className="px-5 py-3 flex flex-wrap items-center justify-between gap-3">
      <span className={`text-sm ${tone === 'bad' ? 'text-alert-700' : 'text-steel-700'}`}>{text}</span>
      {action && (action.to
        ? <Link to={action.to} className="btn-secondary text-xs !py-1.5">{action.label}</Link>
        : <button onClick={action.onClick} className="btn-secondary text-xs !py-1.5">{action.label}</button>)}
    </li>
  );
}

function FlowChart({ series }: { series: { label: string; inflow: number; outflow: number }[] }) {
  if (series.length <= 1) {
    const s = series[0];
    return (
      <div className="py-6 text-center text-sm text-steel-500">
        {s ? <>Hoje: entradas <strong className="text-signal-700">{brl(s.inflow)}</strong> · saídas <strong className="text-alert-600">{brl(s.outflow)}</strong></> : null}
        <div className="text-xs text-steel-400 mt-1">Escolha um período maior para ver a evolução.</div>
      </div>
    );
  }
  const max = Math.max(1, ...series.map(s => Math.max(s.inflow, s.outflow)));
  return (
    <div className="flex items-end gap-1 h-44">
      {series.map((s, i) => (
        <div key={i} className="flex-1 flex flex-col items-center justify-end h-full group relative min-w-0">
          <div className="absolute -top-1 -translate-y-full hidden group-hover:block bg-steel-900 text-white text-[10px] rounded px-1.5 py-0.5 whitespace-nowrap z-10">
            {s.label}: +{brl(s.inflow)} / −{brl(s.outflow)}
          </div>
          <div className="w-full flex items-end gap-px h-full">
            <div className={`flex-1 rounded-t ${s.inflow ? 'bg-signal-500' : 'bg-steel-100'}`} style={{ height: `${Math.max(s.inflow ? 4 : 2, (s.inflow / max) * 100)}%` }} />
            <div className={`flex-1 rounded-t ${s.outflow ? 'bg-alert-400' : 'bg-steel-100'}`} style={{ height: `${Math.max(s.outflow ? 4 : 2, (s.outflow / max) * 100)}%` }} />
          </div>
          {(series.length <= 15 || i % Math.ceil(series.length / 8) === 0) && (
            <div className="text-[9px] text-steel-400 mt-1 truncate w-full text-center">{s.label}</div>
          )}
        </div>
      ))}
    </div>
  );
}
