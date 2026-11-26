import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { CATEGORIES, brl, monthLabel, participation, pctLabel, type Closing, type Investor } from '@/lib/investors';

type Live = {
  mechanics_today: number; mechanics_month: number; workshops_today: number; workshops_month: number;
  jobs_today: number; jobs_month: number; jobs_paid_today: number; gross_today: number; gross_month: number;
};
type Share = { month: string; investor_id: string; amount: number };
type Pay = { investor_id: string; amount: number };

/** Painel de controle: visão geral para apresentar o negócio aos investidores */
export default function DashboardTab({ investors, closings }: { investors: Investor[]; closings: Closing[] }) {
  const [live, setLive] = useState<Live | null>(null);
  const [shares, setShares] = useState<Share[]>([]);
  const [pays, setPays] = useState<Pay[]>([]);
  const [valuation, setValuation] = useState<number | null>(null);
  const [newInterests, setNewInterests] = useState(0);

  useEffect(() => {
    (async () => {
      const [l, s, p, v, i] = await Promise.all([
        supabase.rpc('investor_live_stats'),
        supabase.from('investor_closing_shares').select('month,investor_id,amount'),
        supabase.from('investor_payments').select('investor_id,amount'),
        supabase.from('investor_valuation').select('amount').eq('id', 1).maybeSingle(),
        supabase.from('investor_interests').select('id', { count: 'exact', head: true }).eq('status', 'novo'),
      ]);
      if (l.data) setLive(l.data as Live);
      setShares(((s.data ?? []) as Share[]).map(x => ({ ...x, amount: Number(x.amount) })));
      setPays(((p.data ?? []) as Pay[]).map(x => ({ ...x, amount: Number(x.amount) })));
      setValuation(v.data ? Number(v.data.amount) : null);
      setNewInterests(i.count ?? 0);
    })();
  }, []);

  const active = investors.filter(i => i.active);
  const raised = active.reduce((s, i) => s + i.amount, 0);
  const totalPart = valuation ? active.reduce((s, i) => s + (participation(i.amount, valuation) ?? 0), 0) : null;
  const last = closings[0];
  const owed = shares.reduce((s, x) => s + x.amount, 0) - pays.reduce((s, x) => s + x.amount, 0);
  const months = useMemo(() => [...closings].slice(0, 6).reverse(), [closings]);
  const receitas = Object.entries((last?.snapshot as { receitas_por_tipo?: Record<string, number> } | undefined)?.receitas_por_tipo ?? {});
  const custos = Object.entries(last?.snapshot?.custos_por_categoria ?? {});

  return (
    <div className="space-y-5">
      {/* Indicadores */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Total aportado" value={brl(raised)} sub={`${active.length} investidor(es) ativo(s)`} />
        <Kpi label="Participação total estimada" value={totalPart === null ? '—' : pctLabel(totalPart)} sub={valuation ? `sobre ${brl(valuation)}` : 'defina o valuation'} />
        <Kpi label={last ? `Resultado de ${monthLabel(last.month)}` : 'Resultado do último mês'} value={last ? brl(last.distributable) : '—'}
          sub={last ? 'distribuível, depois da reserva' : 'nenhum mês fechado'} tone={last && last.distributable < 0 ? 'neg' : undefined} />
        <Kpi label="A pagar aos investidores" value={brl(Math.max(owed, 0))} sub="partes fechadas − pagamentos" accent />
      </div>

      {newInterests > 0 && (
        <div className="rounded-xl bg-brand-500/10 border border-brand-500/30 px-4 py-3 text-sm">
          <b>{newInterests}</b> interessado(s) novo(s) no formulário. Veja na aba <b>Interessados</b>.
        </div>
      )}

      {/* Plataforma agora */}
      <Panel title="A plataforma hoje">
        {live ? (
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <Mini label="Faturamento bruto hoje" value={brl(live.gross_today)} sub={`${brl(live.gross_month)} no mês`} />
            <Mini label="Mecânicos novos hoje" value={String(live.mechanics_today)} sub={`${live.mechanics_month} no mês`} />
            <Mini label="Oficinas novas hoje" value={String(live.workshops_today)} sub={`${live.workshops_month} no mês`} />
            <Mini label="Demandas públicas hoje" value={String(live.jobs_today)} sub={`${live.jobs_month} no mês`} />
            <Mini label="Demandas pagas hoje" value={String(live.jobs_paid_today)} />
          </div>
        ) : <p className="text-sm text-steel-500">Carregando…</p>}
      </Panel>

      {/* Evolução */}
      <Panel title="Receita, custos e resultado por mês">
        {months.length === 0 ? <p className="text-sm text-steel-500">Feche o primeiro mês para ver a evolução.</p> : (
          <GroupBars items={months.map(c => ({
            label: monthLabel(c.month),
            a: c.revenue_apps + c.revenue_manual,
            b: c.costs + c.taxes + c.reserve,
            c: c.distributable,
          }))} />
        )}
      </Panel>

      <div className="grid lg:grid-cols-2 gap-5">
        <Panel title={`Receitas por tipo${last ? ` · ${monthLabel(last.month)}` : ''}`}>
          {receitas.length === 0
            ? <p className="text-sm text-steel-500">Aparece depois de fechar um mês com receitas por tipo.</p>
            : <HBars items={receitas.map(([k, v]) => ({ label: k, value: Number(v) }))} color="bg-green-500" />}
        </Panel>
        <Panel title={`Custos por categoria${last ? ` · ${monthLabel(last.month)}` : ''}`}>
          {custos.length === 0
            ? <p className="text-sm text-steel-500">Aparece depois de fechar um mês com custos.</p>
            : <HBars items={custos.map(([k, v]) => ({ label: CATEGORIES[k] ?? k, value: Number(v) }))} color="bg-alert-500" />}
        </Panel>
      </div>

      {/* Investidores */}
      <Panel title="Investidores">
        {active.length === 0 ? <p className="text-sm text-steel-500">Nenhum investidor ativo.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[520px]">
              <thead><tr className="text-left text-xs text-steel-500">
                <th className="py-1">Investidor</th><th className="text-right">Aporte</th><th className="text-right">Participação</th><th className="text-right">Recebido</th><th className="text-right">A receber</th>
              </tr></thead>
              <tbody className="tabular-nums">
                {active.map(i => {
                  const got = pays.filter(p => p.investor_id === i.id).reduce((s, p) => s + p.amount, 0);
                  const due = shares.filter(s => s.investor_id === i.id).reduce((s, x) => s + x.amount, 0) - got;
                  const part = participation(i.amount, valuation);
                  return (
                    <tr key={i.id} className="border-t border-steel-200 dark:border-steel-700">
                      <td className="py-2">{i.name}</td><td className="text-right">{brl(i.amount)}</td>
                      <td className="text-right">{part === null ? '—' : pctLabel(part)}</td><td className="text-right">{brl(got)}</td>
                      <td className={`text-right font-semibold ${due > 0 ? 'text-brand-600' : ''}`}>{brl(Math.max(due, 0))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <p className="text-xs text-steel-500">⚠️ Painel informativo. O número oficial é o do contador. Faturamento bruto não é receita da plataforma.</p>
    </div>
  );
}

const Panel = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="rounded-2xl border border-steel-200 dark:border-steel-700 bg-white dark:bg-steel-800 p-4 sm:p-5">
    <h2 className="text-xs uppercase tracking-[.14em] text-steel-500 font-semibold mb-3">{title}</h2>
    {children}
  </section>
);
const Kpi = ({ label, value, sub, tone, accent }: { label: string; value: string; sub?: string; tone?: 'neg'; accent?: boolean }) => (
  <div className={`rounded-2xl p-4 border ${accent ? 'bg-steel-900 text-white border-steel-900' : 'bg-white dark:bg-steel-800 border-steel-200 dark:border-steel-700'}`}>
    <div className={`text-xs ${accent ? 'text-steel-300' : 'text-steel-500'}`}>{label}</div>
    <div className={`mt-1 text-xl sm:text-2xl font-bold tabular-nums break-words ${tone === 'neg' ? 'text-alert-500' : ''}`}>{value}</div>
    {sub && <div className={`text-[11px] mt-0.5 ${accent ? 'text-steel-300' : 'text-steel-500'}`}>{sub}</div>}
  </div>
);
const Mini = ({ label, value, sub }: { label: string; value: string; sub?: string }) => (
  <div className="rounded-xl bg-steel-50 dark:bg-steel-900 p-3">
    <div className="text-[11px] text-steel-500 leading-tight">{label}</div>
    <div className="mt-1 text-lg font-bold tabular-nums">{value}</div>
    {sub && <div className="text-[11px] text-steel-500">{sub}</div>}
  </div>
);

/** Barras horizontais proporcionais ao maior valor */
function HBars({ items, color }: { items: { label: string; value: number }[]; color: string }) {
  const max = Math.max(1, ...items.map(i => i.value));
  const total = items.reduce((s, i) => s + i.value, 0);
  return (
    <ul className="space-y-3">
      {items.sort((a, b) => b.value - a.value).map(i => (
        <li key={i.label}>
          <div className="flex justify-between gap-3 text-sm">
            <span>{i.label}</span>
            <span className="tabular-nums whitespace-nowrap">{brl(i.value)} <span className="text-xs text-steel-500">({total ? Math.round((i.value / total) * 100) : 0}%)</span></span>
          </div>
          <div className="mt-1 h-2.5 rounded-full bg-steel-100 dark:bg-steel-700 overflow-hidden">
            <div className={`h-full rounded-full ${color}`} style={{ width: `${(i.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Três barras por mês: receita (verde), custos+impostos+reserva (vermelho) e resultado distribuível (laranja/vermelho) */
function GroupBars({ items }: { items: { label: string; a: number; b: number; c: number }[] }) {
  const H = 140;
  const max = Math.max(1, ...items.flatMap(i => [i.a, i.b, Math.max(i.c, 0)]));
  const min = Math.min(0, ...items.map(i => i.c));
  const range = max - min;
  const zero = (max / range) * H;
  const bar = (v: number, cls: string, key: string) => {
    const h = Math.max(2, (Math.abs(v) / range) * H);
    return <div key={key} className={`absolute rounded-t ${cls}`} style={{ left: 0, right: 0, height: h, top: v >= 0 ? zero - h : zero }} title={brl(v)} />;
  };
  return (
    <div>
      <div className="flex gap-4 text-xs text-steel-500 mb-3 flex-wrap">
        <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-green-500" />Receita</span>
        <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-alert-500" />Custos, impostos e reserva</span>
        <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-brand-500" />Resultado distribuível</span>
      </div>
      <div className="relative" style={{ height: H }}>
        <div className="absolute left-0 right-0 border-t border-dashed border-steel-300 dark:border-steel-600" style={{ top: zero }} />
        <div className="absolute inset-0 flex gap-3 justify-center">
          {items.map(i => (
            <div key={i.label} className="flex-1 flex gap-1 px-1" style={{ maxWidth: 150 }}>
              <div className="relative flex-1">{bar(i.a, 'bg-green-500', 'a')}</div>
              <div className="relative flex-1">{bar(i.b, 'bg-alert-500', 'b')}</div>
              <div className="relative flex-1">{bar(i.c, i.c >= 0 ? 'bg-brand-500' : 'bg-alert-500/60', 'c')}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="flex gap-3 mt-1.5 justify-center">{items.map(i => <div key={i.label} className="flex-1 text-center text-[11px] text-steel-500" style={{ maxWidth: 150 }}>{i.label}</div>)}</div>
    </div>
  );
}
