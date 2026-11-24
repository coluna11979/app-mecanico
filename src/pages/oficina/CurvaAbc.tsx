import { useEffect, useMemo, useState } from 'react';
import WorkshopLayout from '@/components/layout/WorkshopLayout';
import PeriodPicker, { usePeriod } from '@/components/PeriodPicker';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { fetchAll } from '@/lib/fetchAll';
import { fmtBRL } from '@/components/os/osHelpers';
import { fmtQty } from '@/lib/parts';
import { serviceLines, servicesExecuted } from '@/lib/serviceCatalog';
import type { PanelItem, PanelOs } from '@/lib/workshopMetrics';
import { partsBase, rankAbc, servicesBase, servicesSubBase, type AbcClass, type AbcLevel, type AbcMetric, type SoldItem } from '@/lib/abcReport';

const STYLE: Record<AbcClass, { badge: string; bar: string; hint: string }> = {
  A: { badge: 'bg-brand-500 text-white', bar: 'bg-brand-500', hint: 'até 80% do total: o que sustenta a oficina' },
  B: { badge: 'bg-pending-500 text-white', bar: 'bg-pending-500', hint: 'de 80% a 95%: importantes, dá para crescer' },
  C: { badge: 'bg-steel-400 text-white', bar: 'bg-steel-300', hint: 'os últimos 5%: pouco peso no total' },
};
const METRICS: { key: AbcMetric; label: string }[] = [
  { key: 'faturamento', label: 'Faturamento' },
  { key: 'lucro', label: 'Lucro' },
  { key: 'quantidade', label: 'Quantidade' },
];
const pct1 = (n: number) => `${n.toFixed(1).replace('.', ',')}%`;

type Os = { id: string; title: string; status: string; quote_status: string | null; completed_at: string | null };

/**
 * Curva ABC de peças e de serviços: o que mais pesa no faturamento, no lucro ou na quantidade vendida.
 * Conta as OS concluídas no período (orçamento não entra). Peça = item vendido; serviço = tipo de serviço
 * (a mesma agrupação do Painel de vendas).
 */
export default function CurvaAbc() {
  const { currentWorkshop, workshops } = useAuth();
  const wid = currentWorkshop?.id ?? null;
  const multi = workshops.length > 1;
  const [scope, setScope] = useState<'loja' | 'todas'>('loja');
  const ids = useMemo(() => (multi && scope === 'todas' ? workshops.map(w => w.id) : wid ? [wid] : []), [multi, scope, workshops, wid]);
  const idsKey = ids.join(',');

  const period = usePeriod('curva-abc-periodo', 'month');
  const { range } = period;
  const fromIso = range.from.toISOString(), toIso = range.to.toISOString();

  const [kind, setKind] = useState<'pecas' | 'servicos'>('pecas');
  const [metric, setMetric] = useState<AbcMetric>('faturamento');
  const [level, setLevel] = useState<AbcLevel>('item');
  const [cls, setCls] = useState<AbcClass | ''>('');
  const [q, setQ] = useState('');
  const [os, setOs] = useState<Os[] | null>(null);
  const [items, setItems] = useState<SoldItem[]>([]);

  useEffect(() => {
    if (!ids.length) return;
    let alive = true;
    setOs(null);
    (async () => {
      const [o, it] = await Promise.all([
        fetchAll((a, b) => supabase.from('service_orders').select('id, title, status, quote_status, completed_at')
          .in('workshop_id', ids).eq('status', 'completed').is('quote_status', null)
          .gte('completed_at', fromIso).lt('completed_at', toIso).order('id').range(a, b)),
        fetchAll((a, b) => supabase.from('service_order_items')
          .select('service_order_id, kind, description, quantity, unit_price, unit_cost, part:workshop_parts(name, code, category, subcategory), so:service_orders!inner(completed_at, status, quote_status)')
          .in('workshop_id', ids).eq('so.status', 'completed').is('so.quote_status', null)
          .gte('so.completed_at', fromIso).lt('so.completed_at', toIso).order('id').range(a, b)),
      ]);
      if (!alive) return;
      setOs((o.data as unknown as Os[]) ?? []);
      setItems((it.data as unknown as SoldItem[]) ?? []);
    })();
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, fromIso, toIso]);

  const base = useMemo(() => {
    if (!os) return [];
    if (kind === 'pecas') return partsBase(items, level);
    if (level === 'sub') return servicesSubBase(serviceLines(os as unknown as PanelOs[], items as unknown as PanelItem[], range));
    const svc = servicesExecuted(os as unknown as PanelOs[], items as unknown as PanelItem[], range, 10000);
    return servicesBase(svc.rows);
  }, [os, items, kind, range, level]);

  const abc = useMemo(() => rankAbc(base, metric), [base, metric]);
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return abc.rows.map((r, i) => ({ ...r, pos: i + 1 }))
      .filter(r => (!cls || r.cls === cls) && (!t || r.label.toLowerCase().includes(t) || r.code.toLowerCase().includes(t)));
  }, [abc, cls, q]);
  const [limit, setLimit] = useState(100);
  useEffect(() => { setLimit(100); }, [kind, level, metric, cls, q, fromIso, toIso, idsKey]);

  const totals = useMemo(() => ({
    revenue: base.reduce((t, b) => t + b.revenue, 0), cost: base.reduce((t, b) => t + b.cost, 0),
    noCost: base.reduce((t, b) => t + b.noCost, 0), qty: base.reduce((t, b) => t + b.qty, 0),
  }), [base]);
  const fmtValue = (n: number) => (metric === 'quantidade' ? fmtQty(n) : fmtBRL(n));
  const noun = level === 'categoria' ? 'categoria' : level === 'sub' ? 'subcategoria' : kind === 'pecas' ? 'peça' : 'serviço';
  const nouns = level === 'categoria' ? 'categorias' : level === 'sub' ? 'subcategorias' : kind === 'pecas' ? 'peças' : 'serviços';
  const colName = level === 'categoria' ? 'Categoria' : level === 'sub' ? 'Subcategoria' : kind === 'pecas' ? 'Peça' : 'Serviço';

  function exportCsv() {
    const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const num = (n: number) => n.toFixed(2).replace('.', ',');
    const head = ['Posição', colName, 'Código', 'Categoria', 'Quantidade', 'Faturamento', 'Custo', 'Lucro', 'Margem %', '% do total', '% acumulado', 'Classe'];
    const lines = list.map(r => [r.pos, r.label, r.code, r.category, String(r.qty).replace('.', ','), num(r.revenue), num(r.cost), num(r.profit), num(r.pct), num(r.share), num(r.cumulative), r.cls].map(esc).join(';'));
    const blob = new Blob(['﻿' + [head.map(esc).join(';'), ...lines].join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `curva-abc-${kind}-${level}-${metric}-${range.from.toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const chip = (on: boolean) => `text-xs font-semibold px-3 py-1.5 rounded-full border transition ${on ? 'bg-steel-900 text-white border-steel-900' : 'bg-white text-steel-600 border-steel-200 hover:border-steel-300'}`;

  return (
    <WorkshopLayout>
      <div className="max-w-6xl mx-auto space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-sm text-steel-500">Relatórios</div>
            <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">Curva ABC</h1>
            <div className="text-xs text-steel-400 mt-0.5">{currentWorkshop?.business_name}{multi && scope === 'todas' ? ' e outras lojas' : ''} · {period.label}</div>
          </div>
          <button className="btn-primary text-sm !py-2" onClick={exportCsv} disabled={!list.length}>⬇ Baixar planilha</button>
        </div>

        <div className="card space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-1.5">
              <button className={chip(kind === 'pecas')} onClick={() => setKind('pecas')}>🔩 Peças</button>
              <button className={chip(kind === 'servicos')} onClick={() => setKind('servicos')}>🛠️ Serviços</button>
            </div>
            <span className="text-steel-300">|</span>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs text-steel-500">Agrupar por</span>
              <button className={chip(level === 'item')} onClick={() => setLevel('item')}>{kind === 'pecas' ? 'Peça' : 'Serviço'}</button>
              <button className={chip(level === 'categoria')} onClick={() => setLevel('categoria')}>Categoria</button>
              <button className={chip(level === 'sub')} onClick={() => setLevel('sub')}>Subcategoria</button>
            </div>
            <span className="text-steel-300">|</span>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs text-steel-500">Ordenar por</span>
              {METRICS.map(m => <button key={m.key} className={chip(metric === m.key)} onClick={() => setMetric(m.key)}>{m.label}</button>)}
            </div>
            {multi && (
              <div className="flex gap-1.5 sm:ml-auto">
                <button className={chip(scope === 'loja')} onClick={() => setScope('loja')}>Esta loja</button>
                <button className={chip(scope === 'todas')} onClick={() => setScope('todas')}>Todas as lojas</button>
              </div>
            )}
          </div>
          <PeriodPicker period={period} />
        </div>

        {os === null ? (
          <div className="space-y-3">
            <div className="grid sm:grid-cols-3 gap-3">{[1, 2, 3].map(i => <div key={i} className="h-24 bg-white rounded-2xl animate-pulse" />)}</div>
            <div className="h-64 bg-white rounded-2xl animate-pulse" />
          </div>
        ) : abc.rows.length === 0 ? (
          <div className="card text-center py-14 text-sm text-steel-500">
            Nada vendido neste período. Só contam as OS concluídas (orçamento não entra).
          </div>
        ) : (
          <>
            <div className="grid sm:grid-cols-3 gap-3">
              {abc.groups.map(g => (
                <button key={g.cls} onClick={() => setCls(cls === g.cls ? '' : g.cls)}
                  className={`text-left rounded-2xl border px-4 py-3 bg-white transition ${cls === g.cls ? 'border-steel-900 ring-1 ring-steel-900' : 'border-steel-200 hover:border-steel-300'}`}>
                  <div className="flex items-center gap-2">
                    <span className={`h-7 w-7 rounded-md grid place-items-center text-sm font-bold ${STYLE[g.cls].badge}`}>{g.cls}</span>
                    <span className="text-sm font-bold">{g.count} {g.count === 1 ? noun : nouns}</span>
                    <span className="ml-auto text-lg font-bold tabular-nums">{Math.round(g.share)}%</span>
                  </div>
                  <div className="text-xs text-steel-500 mt-1 leading-snug">{fmtValue(g.value)} · {STYLE[g.cls].hint}</div>
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-steel-500 px-1">
              <span>Faturamento <strong className="text-steel-800">{fmtBRL(totals.revenue)}</strong></span>
              <span>Custo das peças <strong className="text-steel-800">{fmtBRL(totals.cost)}</strong></span>
              <span>Lucro <strong className="text-signal-700">{fmtBRL(totals.revenue - totals.cost)}</strong></span>
              {kind === 'pecas' && <span>{fmtQty(totals.qty)} unidades vendidas</span>}
            </div>
            {metric !== 'faturamento' && totals.noCost > 0 && metric === 'lucro' && (
              <div className="card !py-3 border-l-4 border-l-pending-500 text-xs text-steel-700">
                {totals.noCost} venda{totals.noCost > 1 ? 's' : ''} sem custo cadastrado: o lucro delas aparece igual ao valor vendido. Informe o custo em Peças para a curva de lucro ficar certa.
              </div>
            )}

            <div className="card !p-0 overflow-hidden">
              <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-steel-100">
                <input className="input flex-1 min-w-[10rem] !py-2 text-sm" placeholder={level === 'item' && kind === 'pecas' ? '🔍 Buscar peça ou código' : `🔍 Buscar ${noun}`} value={q} onChange={e => setQ(e.target.value)} />
                {(['A', 'B', 'C'] as AbcClass[]).map(c => <button key={c} className={chip(cls === c)} onClick={() => setCls(cls === c ? '' : c)}>Classe {c}</button>)}
                {(cls || q) && <button className="text-xs font-semibold text-steel-500 underline" onClick={() => { setCls(''); setQ(''); }}>limpar</button>}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[720px]">
                  <thead>
                    <tr className="bg-steel-50 text-[10px] uppercase tracking-wider text-steel-500 text-left">
                      <th className="font-bold py-2 px-3 w-10">#</th>
                      <th className="font-bold py-2 px-2">{colName}</th>
                      <th className="font-bold py-2 px-2 text-right">{kind === 'pecas' ? 'Qtd.' : level === 'sub' ? 'OS' : 'Vezes'}</th>
                      <th className="font-bold py-2 px-2 text-right">Faturamento</th>
                      <th className="font-bold py-2 px-2 text-right">Lucro</th>
                      <th className="font-bold py-2 px-2 text-right">Margem</th>
                      <th className="font-bold py-2 px-2 text-right">%</th>
                      <th className="font-bold py-2 px-2 w-[18%]">Acumulado</th>
                      <th className="font-bold py-2 px-3 text-center">Classe</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-steel-100">
                    {list.slice(0, limit).map(r => (
                      <tr key={r.key} className="hover:bg-steel-50">
                        <td className="py-2.5 px-3 text-steel-400 tabular-nums">{r.pos}</td>
                        <td className="py-2.5 px-2 min-w-0">
                          <div className="font-semibold text-steel-800 truncate max-w-[22rem]">{r.label}</div>
                          {(r.code || r.category) && <div className="text-[11px] text-steel-500 truncate">{[r.code, r.category].filter(Boolean).join(' · ')}</div>}
                        </td>
                        <td className="py-2.5 px-2 text-right tabular-nums text-steel-600">{fmtQty(r.qty)}</td>
                        <td className={`py-2.5 px-2 text-right tabular-nums ${metric === 'faturamento' ? 'font-bold' : 'text-steel-600'}`}>{fmtBRL(r.revenue)}</td>
                        <td className={`py-2.5 px-2 text-right tabular-nums ${metric === 'lucro' ? 'font-bold' : 'text-steel-600'}`}>
                          {fmtBRL(r.profit)}{r.noCost > 0 && <span title="Tem venda sem custo cadastrado" className="text-pending-600"> ⚠</span>}
                        </td>
                        <td className="py-2.5 px-2 text-right tabular-nums text-steel-600">{r.revenue ? pct1(r.pct) : '—'}</td>
                        <td className="py-2.5 px-2 text-right tabular-nums text-steel-600">{pct1(r.share)}</td>
                        <td className="py-2.5 px-2">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 flex-1 rounded-full bg-steel-100 overflow-hidden">
                              <div className={`h-full rounded-full ${STYLE[r.cls].bar}`} style={{ width: `${r.cumulative}%` }} />
                            </div>
                            <span className="text-xs tabular-nums text-steel-500 w-10 text-right">{Math.round(r.cumulative)}%</span>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span className={`inline-grid place-items-center h-6 w-6 rounded-md text-xs font-bold ${STYLE[r.cls].badge}`}>{r.cls}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {list.length === 0 && <div className="py-8 text-center text-sm text-steel-500">Nada com esse filtro.</div>}
              {list.length > limit && (
                <button onClick={() => setLimit(l => l + 100)} className="w-full py-3 text-sm font-semibold text-brand-700 border-t border-steel-100 hover:bg-steel-50">
                  Mostrar mais ({list.length - limit} restantes)
                </button>
              )}
            </div>

            <p className="text-[11px] text-steel-400 leading-relaxed">
              Conta as OS concluídas no período (orçamento não entra). A = itens que somam até 80% do {metric === 'quantidade' ? 'total vendido' : metric === 'lucro' ? 'lucro' : 'faturamento'}, B = de 80% a 95%, C = o resto.
              {kind === 'pecas'
                ? ' Valor = quantidade × preço de venda na OS; lucro = valor menos o custo da peça na hora da venda. Desconto dado na OS inteira não é distribuído entre os itens.'
                : ' Serviço = tipo de serviço (peças e mão de obra juntas), como no Painel de vendas; "Serviço não identificado" fica fora. Lucro = faturamento menos o custo das peças, antes do pagamento do mecânico.'}
            </p>
          </>
        )}
      </div>
    </WorkshopLayout>
  );
}
