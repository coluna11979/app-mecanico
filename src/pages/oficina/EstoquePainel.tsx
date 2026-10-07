import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import WorkshopLayout from '@/components/layout/WorkshopLayout';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { fetchAll } from '@/lib/fetchAll';
import { fmtBRL } from '@/components/os/osHelpers';
import { fmtQty, type WorkshopPart } from '@/lib/parts';
import { fmtDate, todayISO } from '@/lib/purchasing';
import {
  STALE_DAYS, costToConfirm, hasStaleHistory, isBelowMin, isStale, loadStockData, loadTopParts, osLabel, stockAlerts,
  type StockAlert, type StockData, type TopPart,
} from '@/lib/stock';
import StockTabs, { useStockAccess } from '@/components/stock/StockTabs';
import { StockMoveModal } from '@/components/stock/StockModals';

type Inv = { id: string; issue_date: string; total: number; number: string | null; supplier_id: string; supplier: { name: string } | null };

const ALERTS_SHOWN = 6;

export default function EstoquePainel() {
  const { currentWorkshop } = useAuth();
  const wid = currentWorkshop?.id ?? null;
  const access = useStockAccess();

  const [data, setData] = useState<StockData | null>(null);
  const [top, setTop] = useState<TopPart[] | null>(null);
  const [invs, setInvs] = useState<Inv[] | null>(null);
  const [allAlerts, setAllAlerts] = useState(false);
  const [topBy, setTopBy] = useState<'qty' | 'revenue'>('qty');
  const [adjusting, setAdjusting] = useState<WorkshopPart | null>(null);

  const load = useCallback(async () => {
    if (!wid) return;
    const d = await loadStockData(wid);
    setData(d);
    const since = new Date(Date.now() - STALE_DAYS * 86400000).toISOString();
    loadTopParts(wid, since, d.parts).then(setTop);
  }, [wid]);

  useEffect(() => { if (access.pecas) load(); }, [load, access.pecas]);
  useEffect(() => {
    if (!wid || !access.compras) return;
    fetchAll((a, b) => supabase.from('purchase_invoices')
      .select('id, issue_date, total, number, supplier_id, supplier:suppliers(name)')
      .eq('workshop_id', wid).eq('status', 'posted').order('id').range(a, b))
      .then(({ data }) => setInvs((data as unknown as Inv[]).sort((x, y) => y.issue_date.localeCompare(x.issue_date))));
  }, [wid, access.compras]);

  const kpi = useMemo(() => {
    if (!data) return null;
    const act = data.parts.filter(p => p.active);
    const withStock = act.filter(p => Number(p.stock_qty) > 0);
    const withMin = act.filter(p => Number(p.min_qty) > 0);
    return {
      value: withStock.reduce((s, p) => s + Number(p.stock_qty) * Number(p.cost), 0),
      withStock: withStock.length,
      withMin: withMin.length,
      below: withMin.filter(isBelowMin).length,
      toConfirm: act.filter(p => costToConfirm(p, data)).length,
    };
  }, [data]);

  const alerts = useMemo(() => (data ? stockAlerts(data) : []), [data]);

  const month = todayISO().slice(0, 7);
  const buys = useMemo(() => {
    if (!invs) return null;
    const inMonth = invs.filter(i => i.issue_date.startsWith(month));
    const yearAgo = new Date(); yearAgo.setFullYear(yearAgo.getFullYear() - 1);
    const sinceISO = yearAgo.toISOString().slice(0, 10);
    const bySup = new Map<string, { id: string; name: string; total: number; count: number }>();
    for (const i of invs) {
      if (i.issue_date < sinceISO) continue;
      const e = bySup.get(i.supplier_id) ?? { id: i.supplier_id, name: i.supplier?.name ?? 'Fornecedor', total: 0, count: 0 };
      e.total += Number(i.total); e.count++;
      bySup.set(i.supplier_id, e);
    }
    return {
      monthTotal: inMonth.reduce((s, i) => s + Number(i.total), 0),
      monthCount: inMonth.length,
      last: invs[0] ?? null,
      topSuppliers: [...bySup.values()].sort((a, b) => b.total - a.total).slice(0, 5),
    };
  }, [invs, month]);

  const stale = useMemo(() => {
    if (!data || !hasStaleHistory(data)) return null;
    const list = data.parts.filter(p => p.active && isStale(p, data));
    return { list, value: list.reduce((s, p) => s + Number(p.stock_qty) * Number(p.cost), 0) };
  }, [data]);

  const topList = useMemo(() => (top ?? []).slice().sort((a, b) => (topBy === 'qty' ? b.qty - a.qty : b.revenue - a.revenue)).slice(0, 5), [top, topBy]);

  if (!access.pecas) return <NoAccess />;

  const shown = allAlerts ? alerts : alerts.slice(0, ALERTS_SHOWN);

  return (
    <WorkshopLayout>
      <div className="max-w-6xl mx-auto space-y-5">
        <StockTabs title="Painel do estoque" subtitle="O que precisa de atenção, quanto há na prateleira e o que mais sai."
          actions={<>
            <Link to="/oficina/pecas?nova=1" className="btn-ghost border border-steel-200 text-sm !py-2">+ Nova peça</Link>
            {access.compras && <Link to="/oficina/compras/nova" className="btn-primary text-sm !py-2">🧾 Lançar nota</Link>}
          </>} />

        {!kpi || !data ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{[1, 2, 3, 4].map(i => <div key={i} className="h-24 bg-white rounded-2xl animate-pulse" />)}</div>
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Kpi dark label="Valor em estoque" value={fmtBRL(kpi.value)}
                sub={`${kpi.withStock} peça${kpi.withStock === 1 ? '' : 's'} com estoque · pelo custo`} />
              {kpi.withMin > 0 ? (
                <Kpi label="Abaixo do mínimo" value={String(kpi.below)} to="/oficina/pecas?situacao=baixo"
                  sub={`de ${kpi.withMin} com mínimo definido`} warn={kpi.below > 0} />
              ) : (
                <Kpi label="Abaixo do mínimo" value="—" to="/oficina/pecas?situacao=com_estoque"
                  sub="Nenhuma peça tem mínimo. Defina na ficha da peça →" />
              )}
              <Kpi label="Custo a confirmar" value={String(kpi.toConfirm)} to="/oficina/pecas?situacao=custo"
                sub="peças sem nota de compra lançada" warn={kpi.toConfirm > 0}
                tip="Peças com estoque (ou sem custo) que nunca entraram por uma nota de compra. O custo delas veio do cadastro ou da importação." />
              {access.compras ? (
                <Kpi label="Compras no mês" value={buys ? fmtBRL(buys.monthTotal) : '…'} to="/oficina/compras"
                  sub={buys ? `${buys.monthCount} nota${buys.monthCount === 1 ? '' : 's'} lançada${buys.monthCount === 1 ? '' : 's'}` : ''} />
              ) : (
                <Kpi label="Faltando para OS" value={String(alerts.filter(a => a.kind === 'os').length)} to="/oficina/pecas?situacao=os"
                  sub="peças pedidas em OS abertas" />
              )}
            </div>

            <div className="grid lg:grid-cols-3 gap-5 items-start">
              {/* Atenção agora */}
              <div className="card !p-0 overflow-hidden lg:col-span-2">
                <div className="px-5 py-3 flex items-center justify-between border-b border-steel-100">
                  <div className="font-bold text-sm">Atenção agora {alerts.length > 0 && <span className="text-steel-400 font-medium">({alerts.length})</span>}</div>
                  <Link to="/oficina/pecas?situacao=atencao" className="text-xs font-semibold text-brand-700">Ver na lista →</Link>
                </div>
                {alerts.length === 0 ? (
                  <p className="px-5 py-8 text-sm text-steel-500 text-center">Nada pedindo atenção no estoque agora. 👌</p>
                ) : (
                  <ul className="divide-y divide-steel-100">
                    {shown.map(a => <AlertRow key={a.kind === 'custo' ? 'custo' : a.part.id} a={a} canBuy={access.compras} onAdjust={setAdjusting} />)}
                  </ul>
                )}
                {alerts.length > ALERTS_SHOWN && (
                  <button onClick={() => setAllAlerts(v => !v)} className="w-full py-2.5 text-sm font-semibold text-brand-700 border-t border-steel-100 hover:bg-steel-50">
                    {allAlerts ? 'Mostrar menos' : `Ver todos (${alerts.length})`}
                  </button>
                )}
              </div>

              {/* Compras */}
              {access.compras && (
                <div className="card !p-0 overflow-hidden">
                  <div className="px-5 py-3 border-b border-steel-100 font-bold text-sm">De quem compro mais <span className="text-xs font-normal text-steel-400">12 meses</span></div>
                  {!buys ? (
                    <div className="p-5"><div className="h-20 bg-steel-50 rounded-xl animate-pulse" /></div>
                  ) : buys.topSuppliers.length === 0 ? (
                    <p className="px-5 py-6 text-sm text-steel-500 text-center">Nenhuma nota de compra lançada ainda.</p>
                  ) : (
                    <ul className="divide-y divide-steel-100">
                      {buys.topSuppliers.map(s => (
                        <li key={s.id} className="px-5 py-2.5 flex items-center justify-between gap-3 text-sm">
                          <span className="min-w-0 truncate">{s.name} <span className="text-xs text-steel-400">· {s.count} nota{s.count === 1 ? '' : 's'}</span></span>
                          <strong className="shrink-0">{fmtBRL(s.total)}</strong>
                        </li>
                      ))}
                    </ul>
                  )}
                  {buys?.last && (
                    <Link to={`/oficina/compras?nota=${buys.last.id}`} className="block px-5 py-3 bg-steel-50 border-t border-steel-100 text-xs text-steel-600 hover:bg-steel-100">
                      Última compra: <strong className="text-steel-800">{fmtDate(buys.last.issue_date)}</strong> · {buys.last.supplier?.name ?? 'Fornecedor'} · {fmtBRL(buys.last.total)} →
                    </Link>
                  )}
                </div>
              )}
            </div>

            <div className="grid lg:grid-cols-2 gap-5 items-start">
              {/* Mais saem */}
              <div className="card !p-0 overflow-hidden">
                <div className="px-5 py-3 flex items-center justify-between gap-2 border-b border-steel-100">
                  <div className="font-bold text-sm">Mais saem <span className="text-xs font-normal text-steel-400">OS concluídas · {STALE_DAYS} dias</span></div>
                  <div className="flex rounded-lg bg-steel-100 p-0.5 text-xs font-semibold">
                    {([['qty', 'Quantidade'], ['revenue', 'Valor']] as const).map(([k, l]) => (
                      <button key={k} onClick={() => setTopBy(k)} className={`px-2.5 py-1 rounded-md ${topBy === k ? 'bg-white shadow-sm text-steel-900' : 'text-steel-500'}`}>{l}</button>
                    ))}
                  </div>
                </div>
                {top === null ? (
                  <div className="p-5"><div className="h-24 bg-steel-50 rounded-xl animate-pulse" /></div>
                ) : topList.length === 0 ? (
                  <p className="px-5 py-6 text-sm text-steel-500 text-center">Nenhuma peça vendida em OS concluídas nos últimos {STALE_DAYS} dias.</p>
                ) : (
                  <ol className="divide-y divide-steel-100">
                    {topList.map((t, i) => (
                      <li key={t.key} className="px-5 py-2.5 flex items-center gap-3 text-sm">
                        <span className="w-5 text-xs font-bold text-steel-400">{i + 1}</span>
                        <span className="flex-1 min-w-0 truncate">{t.name}</span>
                        <span className="shrink-0 text-right">
                          <strong>{topBy === 'qty' ? `${fmtQty(t.qty)} un` : fmtBRL(t.revenue)}</strong>
                          <span className="block text-[11px] text-steel-400">{topBy === 'qty' ? fmtBRL(t.revenue) : `${fmtQty(t.qty)} un`} · {t.orders} OS</span>
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>

              {/* Paradas */}
              <div className="card !p-0 overflow-hidden">
                <div className="px-5 py-3 border-b border-steel-100 font-bold text-sm">Peças paradas <span className="text-xs font-normal text-steel-400">sem saída há {STALE_DAYS} dias</span></div>
                {!stale ? (
                  <p className="px-5 py-6 text-sm text-steel-500 text-center">
                    Peças paradas estarão disponíveis quando houver {STALE_DAYS} dias de histórico.
                    {data.historyStart && <span className="block text-xs text-steel-400 mt-1">Histórico desde {fmtDate(data.historyStart)}.</span>}
                  </p>
                ) : stale.list.length === 0 ? (
                  <p className="px-5 py-6 text-sm text-steel-500 text-center">Nenhuma peça parada. Todo o estoque teve saída nos últimos {STALE_DAYS} dias.</p>
                ) : (
                  <>
                    <div className="px-5 py-3 text-sm text-steel-600">{stale.list.length} peça{stale.list.length === 1 ? '' : 's'} · <strong className="text-steel-900">{fmtBRL(stale.value)}</strong> parados</div>
                    <ul className="divide-y divide-steel-100 border-t border-steel-100">
                      {stale.list.sort((a, b) => Number(b.stock_qty) * Number(b.cost) - Number(a.stock_qty) * Number(a.cost)).slice(0, 5).map(p => (
                        <li key={p.id} className="px-5 py-2.5 flex items-center justify-between gap-3 text-sm">
                          <Link to={`/oficina/pecas?peca=${p.id}`} className="min-w-0 truncate hover:text-brand-700">{p.name}</Link>
                          <span className="shrink-0 text-steel-600">{fmtQty(p.stock_qty)} {p.unit} · <strong className="text-steel-900">{fmtBRL(Number(p.stock_qty) * Number(p.cost))}</strong></span>
                        </li>
                      ))}
                    </ul>
                    <Link to="/oficina/pecas?situacao=parada" className="block py-2.5 text-center text-sm font-semibold text-brand-700 border-t border-steel-100 hover:bg-steel-50">Ver todas</Link>
                  </>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {adjusting && (
        <StockMoveModal part={adjusting} mode="ajuste" canBuy={access.compras}
          onClose={() => setAdjusting(null)} onSaved={() => { setAdjusting(null); load(); }} />
      )}
    </WorkshopLayout>
  );
}

function Kpi({ label, value, sub, to, warn, dark, tip }: { label: string; value: string; sub?: string; to?: string; warn?: boolean; dark?: boolean; tip?: string }) {
  const body = (
    <>
      <div className={`text-[10px] font-bold uppercase tracking-widest ${dark ? 'text-steel-400' : 'text-steel-500'}`}>{label}{tip && <span className="opacity-60 ml-1">ⓘ</span>}</div>
      <div className={`text-xl lg:text-2xl font-bold font-display mt-1 ${warn ? 'text-alert-600' : ''}`}>{value}</div>
      {sub && <div className={`text-[11px] mt-0.5 leading-snug ${dark ? 'text-steel-300' : 'text-steel-500'}`}>{sub}</div>}
    </>
  );
  const cls = `card !p-4 block ${dark ? '!bg-steel-900 text-white' : ''} ${to ? 'hover:border-steel-300 transition' : ''}`;
  return to ? <Link to={to} className={cls} title={tip}>{body}</Link> : <div className={cls} title={tip}>{body}</div>;
}

function AlertRow({ a, canBuy, onAdjust }: { a: StockAlert; canBuy: boolean; onAdjust: (p: WorkshopPart) => void }) {
  if (a.kind === 'custo') {
    return (
      <Row dot="bg-pending-500" title={`${a.count} peça${a.count === 1 ? '' : 's'} com custo a confirmar`}
        detail="Estão sem nota de compra lançada: o custo veio do cadastro ou da importação."
        actions={<Link to="/oficina/pecas?situacao=custo" className="btn-secondary text-sm !py-1.5">Ver peças</Link>} />
    );
  }
  const p = a.part;
  const buy = canBuy && (
    <Link to={`/oficina/compras/nova?peca=${p.id}${p.supplier_id ? `&fornecedor=${p.supplier_id}` : ''}`} className="btn-primary text-sm !py-1.5">Comprar</Link>
  );
  const see = <Link to={`/oficina/pecas?peca=${p.id}`} className="btn-secondary text-sm !py-1.5">Ver peça</Link>;
  if (a.kind === 'os') {
    const n = a.need.orders.length;
    return (
      <Row dot="bg-alert-500" title={p.name}
        detail={<>Faltam <strong>{fmtQty(a.short)} {p.unit}</strong> · estoque {fmtQty(p.stock_qty)} · {n} OS aberta{n === 1 ? '' : 's'} usa{n === 1 ? '' : 'm'} esta peça{' '}
          ({a.need.orders.slice(0, 3).map((o, i) => (
            <span key={o.id}>{i > 0 && ', '}<Link to={`/oficina/os/${o.id}`} className="text-brand-700 font-semibold">{osLabel(o.number, o.id)}</Link></span>
          ))}{n > 3 && '…'})</>}
        actions={<>{n === 1 && <Link to={`/oficina/os/${a.need.orders[0].id}`} className="btn-secondary text-sm !py-1.5">Ver OS</Link>}{buy}</>} />
    );
  }
  if (a.kind === 'negativo') {
    return (
      <Row dot="bg-alert-500" title={p.name}
        detail={<>Estoque negativo (<strong className="text-alert-600">{fmtQty(p.stock_qty)} {p.unit}</strong>): saiu em OS mais do que estava registrado. Confira a prateleira.</>}
        actions={<button onClick={() => onAdjust(p)} className="btn-secondary text-sm !py-1.5">Ajustar</button>} />
    );
  }
  if (a.kind === 'baixo') {
    return (
      <Row dot="bg-pending-500" title={p.name}
        detail={<><strong>{fmtQty(p.stock_qty)} {p.unit}</strong> restante{Number(p.stock_qty) === 1 ? '' : 's'} · mínimo {fmtQty(p.min_qty)}</>}
        actions={<>{see}{buy}</>} />
    );
  }
  return <Row dot="bg-steel-400" title={p.name} detail="Estoque zerado" actions={<>{see}{buy}</>} />;
}

function Row({ dot, title, detail, actions }: { dot: string; title: string; detail: React.ReactNode; actions: React.ReactNode }) {
  return (
    <li className="px-5 py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
      <div className="flex-1 min-w-0 flex gap-2.5">
        <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dot}`} />
        <div className="min-w-0">
          <div className="text-sm font-semibold truncate">{title}</div>
          <div className="text-xs text-steel-500">{detail}</div>
        </div>
      </div>
      <div className="flex gap-2 shrink-0 pl-4 sm:pl-0">{actions}</div>
    </li>
  );
}

function NoAccess() {
  return (
    <WorkshopLayout>
      <div className="max-w-md mx-auto card text-center py-12">
        <div className="text-4xl mb-2">🔒</div>
        <h1 className="text-lg font-bold">Estoque restrito</h1>
        <p className="text-sm text-steel-500 mt-1">Esta tela mostra o custo das peças. Peça ao gestor a permissão “Peças e estoque” em Acessos e funções.</p>
      </div>
    </WorkshopLayout>
  );
}
