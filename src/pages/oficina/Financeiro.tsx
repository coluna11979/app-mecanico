import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import WorkshopLayout from '@/components/layout/WorkshopLayout';
import PaymentsList from '@/components/cash/PaymentsList';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { canDo, sessionAllows, useOperator } from '@/lib/operators';
import { useFeature } from '@/lib/modules';
import { brl } from '@/lib/cash';
import { fetchAll } from '@/lib/fetchAll';
import { daysUntil } from '@/lib/purchasing';
import { change, previousRange, salesOf, type PanelItem } from '@/lib/workshopMetrics';
import { partsSharePct, revenueByService, servicesExecuted } from '@/lib/serviceCatalog';
import PeriodPicker, { PRESETS, PREV_LABEL, usePeriod, type Preset } from '@/components/PeriodPicker';
import ReceivablesTab from '@/components/finance/ReceivablesTab';
import PartsLaborBar from '@/components/finance/PartsLaborBar';
import TeamCostDay, { useTeamCost } from '@/components/finance/TeamCostDay';
import { NO_FEES, cardFeesOf, hasFees, useCardFees, type CardFees } from '@/lib/cardFees';
import { useTeamAccess } from '@/lib/teamAccess';
import { ShopGoalCard } from '@/components/goals/Goals';
import CompletedOsList from '@/components/finance/CompletedOsList';
import {
  cashFlowOf, closings, flowSeriesFull, operatingResult, outflowsOf, paymentMixOf, receivables, receivedGroups,
  type FinEntry, type FinOs, type FinPayable, type FinPayment, type FinRegister, type PayMixRow,
} from '@/lib/finance';

const FIN_OS_COLS = 'id, number, title, status, quote_status, price, parts_cost, labor_cost, paid_amount, counter_discount, pay_later_due, pay_later_note, created_at, started_at, completed_at, estimated_hours, workshop_mechanic_id, customer_id, customer:customers(id, full_name, phone, created_at), vehicle:vehicles(make, model, plate)';

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
  /** Salário é dado sensível: o custo da equipe só aparece para o dono e o gestor */
  const { isGestor } = useTeamAccess();
  const allowed = canDo(session, balcao, 'ver_financeiro');
  /** Link para outra tela só aparece como botão se a pessoa puder abrir */
  const canOpen = (path: string) => !balcao || !session || sessionAllows(session, path);

  const period = usePeriod('financeiro-periodo');
  const { preset, range } = period;
  /** Visão geral do dinheiro ou a lista de OS a receber (o Início abre direto em ?aba=receber) */
  const [tabState, setTabState] = useState<'geral' | 'receber'>(() => {
    try { return new URLSearchParams(window.location.search).get('aba') === 'receber' ? 'receber' : 'geral'; } catch { return 'geral'; }
  });
  // A aba fica no endereço: ao abrir uma OS e voltar, cai de novo na mesma aba
  const [, setParams] = useSearchParams();
  const setTab = (t: 'geral' | 'receber') => {
    setTabState(t);
    setParams(p => { const n = new URLSearchParams(p); if (t === 'receber') n.set('aba', 'receber'); else n.delete('aba'); return n; }, { replace: true });
  };
  // Abas desligadas no superadmin (ferramentas do módulo) somem; cai na que estiver liberada
  const feature = useFeature();
  const okTabs = (['geral', 'receber'] as const).filter(t => feature(`financeiro.${t}`));
  const tab = okTabs.includes(tabState) ? tabState : okTabs[0];
  const [entries, setEntries]   = useState<FinEntry[]>([]);
  const [payments, setPayments] = useState<FinPayment[]>([]);
  const [regs, setRegs]         = useState<FinRegister[]>([]);
  const [os, setOs]             = useState<FinOs[]>([]);
  const [firstOpen, setFirstOpen] = useState<string | null>(null);
  const [payables, setPayables] = useState<FinPayable[]>([]);
  const [costItems, setCostItems] = useState<CostItem[]>([]);
  /** Itens das OS concluídas no período (descrição) — para mostrar o faturamento por tipo de serviço */
  const [svcItems, setSvcItems] = useState<PanelItem[]>([]);
  /** Notas de compra de peças lançadas no período (null = ainda não carregou) */
  const [purchaseCount, setPurchaseCount] = useState<number | null>(null);
  const [loading, setLoading]   = useState(true);
  /** Recebeu uma OS aqui: recarrega os números sem piscar a tela */
  const [reloadKey, setReloadKey] = useState(0);

  const prev = useMemo(() => previousRange(range), [range]);
  const rangeFrom = range.from.getTime();
  const rangeTo = range.to.getTime();
  useEffect(() => {
    if (!wid || !allowed) return;
    let alive = true;
    fetchAll((a, b) => supabase.from('service_order_items')
      .select('service_order_id, kind, description, quantity, unit_price, so:service_orders!inner(completed_at)')
      .eq('workshop_id', wid)
      .gte('so.completed_at', new Date(rangeFrom).toISOString()).lt('so.completed_at', new Date(rangeTo).toISOString())
      .order('id').range(a, b))
      .then(r => { if (alive) setSvcItems((r.data as unknown as PanelItem[]) ?? []); });
    return () => { alive = false; };
  }, [wid, allowed, rangeFrom, rangeTo, reloadKey]);

  // Movimentos: do início do período anterior (comparação) até o fim do atual
  const fromIso = prev.from.toISOString();
  const toIso = range.to.toISOString();
  const curFromDay = range.from.toLocaleDateString('en-CA');
  const curToDay = range.to.toLocaleDateString('en-CA');

  useEffect(() => {
    if (!wid || !allowed) return;
    let alive = true;
    (async () => {
      if (!reloadKey) setLoading(true);
      const [e, p, r, o, first, ci, pay, pur] = await Promise.all([
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
        // Concluídas no período (e no anterior, p/ comparar) + as que ainda têm saldo a receber —
        // não baixa o histórico inteiro a cada abertura (economiza dados do Supabase)
        fetchAll((a, b) => supabase.from('service_orders').select(FIN_OS_COLS)
          .eq('workshop_id', wid).eq('status', 'completed')
          .or(`paid_at.is.null,and(completed_at.gte.${fromIso},completed_at.lt.${toIso})`)
          .order('id').range(a, b)),
        supabase.from('cash_registers').select('opened_at').eq('workshop_id', wid)
          .order('opened_at').limit(1).maybeSingle(),
        // Custo das peças só das OS concluídas no intervalo exibido
        fetchAll((a, b) => supabase.from('service_order_items')
          .select('service_order_id, quantity, unit_price, unit_cost, so:service_orders!inner(completed_at)')
          .eq('workshop_id', wid).eq('kind', 'part').not('unit_cost', 'is', null)
          .gte('so.completed_at', fromIso).lt('so.completed_at', toIso)
          .order('id').range(a, b)),
        // Contas em aberto (todas) + pagas desde o início do período anterior
        fetchAll((a, b) => supabase.from('payables').select('amount, due_date, paid_at, paid_from, category, invoice_id')
          .eq('workshop_id', wid).is('cancelled_at', null)
          .or(`paid_at.is.null,paid_at.gte.${fromIso.slice(0, 10)}`)
          .order('id').range(a, b)),
        // Só a contagem de notas de compra do período (para o aviso de custo estimado)
        supabase.from('purchase_invoices').select('id', { count: 'exact', head: true })
          .eq('workshop_id', wid).gte('issue_date', curFromDay).lt('issue_date', curToDay),
      ]);
      if (!alive) return;
      setEntries((e.data as FinEntry[]) ?? []);
      setPayments((p.data as FinPayment[]) ?? []);
      setRegs((r.data as FinRegister[]) ?? []);
      setOs((o.data as unknown as FinOs[]) ?? []);
      setCostItems((ci.data as CostItem[]) ?? []);
      setPayables((pay.data as FinPayable[]) ?? []);
      setPurchaseCount(pur.error ? null : pur.count ?? 0);
      setFirstOpen((first.data as { opened_at: string } | null)?.opened_at ?? null);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [wid, allowed, fromIso, toIso, curFromDay, curToDay, reloadKey]);

  /** Custo da equipe do período (salários, encargos, benefícios e comissões): só o gestor vê; entra no Resultado */
  const team = useTeamCost(wid, range, isGestor && allowed);
  const { fees, save: saveFees } = useCardFees(wid);
  const cardCfg = fees ?? NO_FEES;

  const f = useMemo(() => {
    /** Faturado, custo das peças vendidas, saídas e resultado de um intervalo */
    const periodOf = (r: typeof range) => {
      const sales = salesOf(os, r);
      const ids = new Set(sales.sales.map(o => o.id));
      const withCost = costItems.filter(i => ids.has(i.service_order_id));
      const partsCost = withCost.reduce((a, i) => a + Number(i.quantity) * Number(i.unit_cost), 0);
      const out = outflowsOf(entries, payables, r);
      // Taxa de cartão (maquininha) é custo: estimada pelas taxas da oficina sobre os recebimentos em cartão
      const card = cardFeesOf(entries, r, cardCfg);
      const res = operatingResult(sales.revenue, partsCost, out.operating + card.total);
      // Cobertura do custo: OS com peças × OS em que alguma peça tem custo cadastrado
      const withParts = sales.sales.filter(o => Number(o.parts_cost ?? 0) > 0).length;
      const costed = new Set(withCost.map(i => i.service_order_id)).size;
      return { sales, partsCost, out, card, res, withParts, costed, cash: cashFlowOf(entries, payments, r) };
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
        received: change(cur.cash.received, before.cash.received),
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
      payMix: paymentMixOf(entries, os, range, firstOpen),
      series: flowSeriesFull(entries, payables, range),
    };
  }, [entries, payments, regs, os, range, prev, firstOpen, costItems, payables, cardCfg]);

  const svc = useMemo(() => servicesExecuted(os, svcItems, range, 100), [os, svcItems, range]);
  const svcRows = useMemo(() => revenueByService(svc.rows), [svc]);
  const partsShare = partsSharePct(svc.rows);

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

  const { cur, alerts } = f;
  /**
   * Gestor, com o período dentro do limite do custo da equipe: o Resultado troca as despesas pelo custo da equipe
   * (salários, encargos, benefícios e comissões do período). As despesas ficam fora (vão para o DRE).
   * O período anterior não carrega o custo da equipe, então nesse modo o resultado não tem comparação.
   */
  const withTeam = isGestor && !team.tooLong && !!team.first;
  const teamCost = withTeam ? team.cost : null;
  const teamLoading = withTeam && !teamCost;
  const res = withTeam
    ? operatingResult(cur.sales.revenue, cur.partsCost, (teamCost?.total ?? 0) + cur.card.total)
    : cur.res;
  const deltas = withTeam ? { ...f.deltas, result: null } : f.deltas;
  const prevLabel = PREV_LABEL[preset];
  const empty = cur.sales.count === 0 && cur.cash.inflow === 0 && cur.out.total === 0;
  const partial = cur.withParts > 0 && cur.costed < cur.withParts;
  /** Teve faturamento e nenhuma despesa lançada: o "resultado" é só receita − custo das peças, não lucro */
  const noExpenses = !withTeam && cur.sales.revenue > 0 && cur.out.operating === 0;
  const resultLabel = withTeam ? 'Margem antes das despesas' : noExpenses ? 'Resultado parcial (sem despesas)' : 'Resultado operacional estimado';
  /** Tem custo de peça no resultado, mas nenhuma nota de compra no período: o custo vem do cadastro e pode ser estimado */
  const costUnproven = cur.partsCost > 0 && purchaseCount === 0;
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

        {/* Abas (só aparecem se as duas estiverem liberadas) */}
        {okTabs.length > 1 && <div className="flex gap-1 bg-steel-100 rounded-xl p-1">
          {([['geral', 'Visão geral'], ['receber', `OS a receber${f.toReceive.rows.length ? ` (${f.toReceive.rows.length})` : ''}`]] as const).map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`flex-1 rounded-lg py-2 text-sm font-semibold transition ${tab === k ? 'bg-white shadow text-steel-900' : 'text-steel-500 hover:text-steel-700'}`}>
              {l}
            </button>
          ))}
        </div>}

        {tab === 'receber' ? (
          loading
            ? <div className="h-40 bg-white rounded-2xl animate-pulse" />
            : <ReceivablesTab data={f.toReceive} firstOpen={firstOpen} shopName={currentWorkshop?.business_name}
                receive={wid && canOpen('/oficina/caixa') ? {
                  wid, sid: balcao ? session?.session_id ?? null : null, canDiscount: canDo(session, balcao, 'dar_desconto'),
                  onReceived: () => setReloadKey(k => k + 1),
                } : undefined} />
        ) : loading ? (
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-28 bg-white rounded-2xl animate-pulse" />)}
          </div>
        ) : (
          <>
            {wid && <ShopGoalCard wid={wid} canEdit />}
            {/* KPIs principais */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              <Kpi label="Faturado" value={brl(cur.sales.revenue)} delta={deltas.revenue} note={prevLabel}
                tip="Faturado considera as OS concluídas no período." sub={`${cur.sales.count} OS concluída${cur.sales.count === 1 ? '' : 's'}`} />
              <Kpi label="Recebido de clientes" value={brl(cur.cash.received)} delta={deltas.received} note={prevLabel}
                sub={cur.cash.other > 0 ? `+ ${brl(cur.cash.other)} em outras entradas de caixa` : undefined}
                tip="Pagamentos de OS efetivamente recebidos no período, sem os cancelados. Entradas avulsas do caixa (sem OS) aparecem à parte, em 'outras entradas de caixa'." />
              <Kpi label="A receber" value={brl(f.toReceive.total)}
                sub={firstOpen ? (alerts.overdueRec.n > 0 ? `${alerts.overdueRec.n} vencida${alerts.overdueRec.n === 1 ? '' : 's'}` : `${f.toReceive.rows.length} OS em aberto`) : 'conta a partir do 1º caixa'}
                tone={alerts.overdueRec.n > 0 ? 'warn' : undefined}
                tip="OS concluídas com saldo em aberto (independe do período), contadas a partir do primeiro caixa aberto." />
              <Kpi label="Saídas" value={brl(cur.out.total)} delta={deltas.out} note={prevLabel} invert
                tip="Despesas e vales do caixa + contas pagas no período. Sangria e suprimento não entram (só mudam o dinheiro de lugar)." />
              <Kpi label={resultLabel} value={teamLoading ? '…' : brl(res.result)} delta={deltas.result} note={withTeam ? undefined : prevLabel} highlight wide
                tone={!teamLoading && res.result < 0 ? 'bad' : undefined}
                sub={withTeam ? 'ainda sem as despesas: não é lucro' : noExpenses ? 'despesas não lançadas: não é lucro' : res.margin != null ? `margem estimada ${Math.round(res.margin)}%` : undefined}
                tip={withTeam ? 'Faturado − custo das peças vendidas − custo da equipe − taxas de cartão. Não inclui aluguel, contas e demais despesas: não é lucro.' : 'Faturado − custo das peças vendidas − demais despesas do período. Estimativa: não é lucro contábil.'} />
            </div>
            <p className="text-[11px] text-steel-400 -mt-2">
              ⓘ Faturado considera as OS concluídas no período. Recebido de clientes considera os pagamentos de OS efetivamente recebidos no período; entradas avulsas do caixa ficam em "outras entradas".
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
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="card">
                <SectionTitle>Resultado do período</SectionTitle>
                <Row label="Faturado" value={brl(cur.sales.revenue)} strong />
                <Row label="(−) Custo das peças vendidas" value={brl(cur.partsCost)} />
                {withTeam ? (
                  <>
                    <Row label="(−) Custo da equipe no período" value={teamCost ? brl(teamCost.total) : '…'} />
                    {teamCost && (
                      <>
                        <Row label="👷 Salários, encargos e benefícios" value={brl(teamCost.salaryCost + teamCost.encargosCost + teamCost.benefitsCost)} indent />
                        <Row label="👷 Comissões" value={brl(teamCost.commission)} indent />
                      </>
                    )}
                  </>
                ) : (
                  <>
                    <Row label="(−) Despesas do período" value={brl(cur.out.operating)} />
                    {cur.out.groups.map(g => (
                      <Row key={g.key} label={`${g.icon} ${g.label}`} value={brl(g.total)} indent />
                    ))}
                  </>
                )}
                {hasFees(cardCfg) && (
                  <>
                    <Row label="(−) Taxas de cartão (estimadas)" value={brl(cur.card.total)} />
                    {cur.card.rows.filter(x => x.base > 0).map(x => (
                      <Row key={x.key} label={`💳 ${x.label} · ${x.rate.toLocaleString('pt-BR')}% de ${brl(x.base)}`} value={brl(x.fee)} indent />
                    ))}
                  </>
                )}
                <div className="flex items-baseline justify-between gap-3 pt-2.5 mt-1 border-t border-steel-200">
                  <span className="font-bold">= {resultLabel}</span>
                  <span className={`text-lg font-bold font-display ${!teamLoading && res.result < 0 ? 'text-alert-600' : ''}`}>{teamLoading ? '…' : brl(res.result)}</span>
                </div>
                {res.margin != null && !noExpenses && !teamLoading && <div className="text-right text-xs text-steel-500">margem estimada {Math.round(res.margin)}%</div>}
                <div className="mt-3 space-y-1.5 text-[11px] text-steel-500 leading-snug">
                  {withTeam && (
                    <p className="text-pending-800 bg-pending-50 rounded-lg px-2.5 py-1.5">
                      <strong>Não é lucro.</strong> Esta margem é o faturado menos o custo das peças, o custo da equipe e as taxas de cartão.
                      Aluguel, contas e demais despesas ficam de fora (vão para o DRE).
                    </p>
                  )}
                  {noExpenses && (
                    <p className="text-pending-800 bg-pending-50 rounded-lg px-2.5 py-1.5">
                      <strong>Não é lucro.</strong> Nenhuma despesa foi lançada neste período; este valor é só o faturado menos o custo das peças.
                      Lance aluguel, contas, salários e demais despesas para o resultado ficar completo.
                    </p>
                  )}
                  {costUnproven && (
                    <p className="text-pending-800 bg-pending-50 rounded-lg px-2.5 py-1.5">
                      <strong>Custo das peças sem nota de compra.</strong> Nenhuma compra de peças foi lançada neste período; o custo usado vem do cadastro
                      da peça e pode ser estimado. Lance as compras em Compras para o custo ficar comprovado.
                    </p>
                  )}
                  {partial && (
                    <p className="text-pending-800 bg-pending-50 rounded-lg px-2.5 py-1.5">
                      Estimativa baseada nos custos disponíveis. Custo informado em {cur.costed} de {cur.withParts} OS.
                    </p>
                  )}
                  {cur.out.partsPurchases > 0 && (
                    <p>Compras de peças pagas no período ({brl(cur.out.partsPurchases)}) não entram de novo aqui: a peça já conta pelo custo das peças vendidas.</p>
                  )}
                  <p>{withTeam
                    ? 'Custo da equipe pelas horas trabalhadas: salários, encargos, benefícios e comissões do período (não é o que foi pago no caixa).'
                    : 'Comissões, salários e vales entram quando já foram pagos ou lançados como despesa.'}
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
                <PaymentMix mix={f.payMix} />
              </div>
            </div>

            {isGestor && wid && <TeamCostDay team={team} os={os} items={svcItems} />}

            {/* Origem do faturamento + recebimentos */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="card">
                <SectionTitle>Origem do faturamento</SectionTitle>
                {cur.sales.revenue <= 0 ? <p className="text-sm text-steel-400">Nenhuma OS concluída no período.</p> : (
                  <>
                    <p className="text-[11px] text-steel-400 mb-3 -mt-1">Por tipo de serviço executado (peças + mão de obra de cada serviço)</p>
                    {svcRows.map(r => (
                      <Split key={r.name} label={r.name} value={r.revenue} total={svc.total} color={r.identified ? 'bg-brand-500' : 'bg-steel-300'} />
                    ))}
                    {svc.total > 0 && (
                      <>
                        <PartsLaborBar partsPct={partsShare} />
                        <p className="text-[11px] text-steel-400 mt-3">Soma dos itens lançados nas OS; pode diferir do faturado por descontos ou OS sem itens.</p>
                      </>
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
                {hasFees(cardCfg) && cur.card.base > 0 && (
                  <p className="text-xs text-steel-600 bg-steel-50 rounded-lg px-3 py-2 mt-2">
                    💳 Taxa de cartão estimada: <strong>{brl(cur.card.total)}</strong> sobre {brl(cur.card.base)} recebidos em débito e crédito
                    ({((cur.card.total / cur.card.base) * 100).toFixed(2).replace('.', ',')}% em média). Cai líquido na conta: {brl(cur.card.base - cur.card.total)}.
                  </p>
                )}
                {isGestor && <CardFeesEditor fees={cardCfg} onSave={saveFees} />}
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
    <div className="mb-3.5 last:mb-0">
      <div className="flex items-start justify-between gap-3">
        <span className="text-sm text-steel-700 leading-snug min-w-0 break-words">{label}</span>
        <span className="text-sm font-bold shrink-0 tabular-nums">{brl(value)}</span>
      </div>
      <div className="flex items-center gap-2 mt-1.5">
        <div className="h-2 rounded-full bg-steel-100 overflow-hidden flex-1">
          <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
        </div>
        <span className="text-[11px] font-semibold text-steel-500 w-9 text-right tabular-nums">{Math.round(pct)}%</span>
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

/** Como o período foi pago: dinheiro, PIX, débito, crédito (à vista e parcelado) e pagar depois */
function PaymentMix({ mix }: { mix: { rows: PayMixRow[]; total: number } }) {
  return (
    <div className="mt-4 pt-4 border-t border-steel-100">
      <SectionTitle>Como foi pago</SectionTitle>
      {mix.rows.length === 0 ? <p className="text-sm text-steel-400">Nenhum pagamento no período.</p> : (
        <ul className="divide-y divide-steel-100">
          {mix.rows.map(x => (
            <li key={x.key} className="py-2 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm text-steel-700">{x.label}</div>
                <div className="text-[11px] text-steel-400 leading-snug">
                  {x.count} {x.key === 'depois' ? 'OS a receber' : x.count === 1 ? 'pagamento' : 'pagamentos'}
                  {x.detail ? ` · ${x.detail}` : ''}
                </div>
              </div>
              <span className={`text-sm font-bold shrink-0 tabular-nums ${x.key === 'depois' ? 'text-pending-700' : ''}`}>{brl(x.total)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Taxas da maquininha (em %): débito, crédito de 1 a 6x e crédito de 7x em diante */
function CardFeesEditor({ fees, onSave }: { fees: CardFees; onSave: (f: CardFees) => unknown }) {
  const str = (n: number) => (n ? String(n).replace('.', ',') : '');
  const num = (v: string) => Math.max(0, Number(v.replace(',', '.')) || 0);
  const field = (label: string, key: keyof CardFees) => (
    <label className="text-xs text-steel-500">{label}
      <div className="flex items-center gap-1 mt-1">
        <input className="input !py-1.5 text-right" inputMode="decimal" placeholder="0,00" defaultValue={str(fees[key])} key={`${key}-${fees[key]}`}
          onBlur={e => { const v = num(e.target.value); if (v !== fees[key]) onSave({ ...fees, [key]: v }); }} />
        <span className="text-steel-400">%</span>
      </div>
    </label>
  );
  return (
    <details className="mt-3 rounded-xl border border-steel-200 px-3 py-2 group">
      <summary className="cursor-pointer list-none text-xs font-semibold text-steel-600 flex items-center justify-between">
        <span>⚙️ Taxas da maquininha</span><span className="text-steel-400 group-open:rotate-90 transition">›</span>
      </summary>
      <div className="grid grid-cols-3 gap-2 mt-3">
        {field('Débito', 'debit')}
        {field('Crédito 1 a 6x', 'creditLow')}
        {field('Crédito 7x ou mais', 'creditHigh')}
      </div>
      <p className="text-[11px] text-steel-400 mt-2">Custo estimado sobre os recebimentos em cartão do caixa. PIX e dinheiro não têm taxa. O valor real vem no extrato da maquininha.</p>
    </details>
  );
}
