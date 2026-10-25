import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, Empty, Kpi, brl, pct } from './ui';

export interface FunnelRow {
  source: string;
  campaign_id: string | null;
  clicks: number;
  leads: number;
  signups: number;
  approved: number;
  activated: number;
  cost: number;
}
interface DayRow { day: string; clicks: number; leads: number; signups: number }

const SOURCE_LABEL: Record<string, string> = {
  direto: 'Direto / orgânico', indicacao: 'Indicação', instagram: 'Instagram', facebook: 'Facebook',
  google_ads: 'Google Ads', google_maps: 'Google Maps', whatsapp: 'WhatsApp', importado_csv: 'Importado (CSV)',
  link_convite: 'Link de convite', evento: 'Evento', outro: 'Outro', google: 'Google', impresso: 'Impresso (panfleto / QR)',
};

const STAGES = [
  { key: 'clicks',    label: 'Cliques nos links', emoji: '👆', color: 'bg-steel-400' },
  { key: 'leads',     label: 'Leads',             emoji: '🎯', color: 'bg-pending-500' },
  { key: 'signups',   label: 'Cadastros',         emoji: '📝', color: 'bg-blue-500' },
  { key: 'approved',  label: 'Aprovados',         emoji: '✅', color: 'bg-brand-500' },
  { key: 'activated', label: '1º serviço feito',  emoji: '🔧', color: 'bg-signal-500' },
] as const;

export default function Overview({ days }: { days: number }) {
  const [rows, setRows] = useState<FunnelRow[]>([]);
  const [daily, setDaily] = useState<DayRow[]>([]);
  const [coupons, setCoupons] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true); setError(null);
      const from = new Date(); from.setDate(from.getDate() - days); from.setHours(0, 0, 0, 0);
      const p = { p_from: from.toISOString() };
      const [f, d, c] = await Promise.all([
        supabase.rpc('marketing_funnel', p),
        supabase.rpc('marketing_daily', p),
        supabase.from('marketing_attributions').select('profile_id', { count: 'exact', head: true })
          .not('coupon_id', 'is', null).gte('created_at', from.toISOString()),
      ]);
      if (!alive) return;
      if (f.error || d.error) setError((f.error ?? d.error)!.message);
      setRows(((f.data ?? []) as FunnelRow[]).map(r => ({
        ...r, clicks: +r.clicks, leads: +r.leads, signups: +r.signups,
        approved: +r.approved, activated: +r.activated, cost: +r.cost,
      })));
      setDaily(((d.data ?? []) as DayRow[]).map(r => ({ ...r, clicks: +r.clicks, leads: +r.leads, signups: +r.signups })));
      setCoupons(c.count ?? 0);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [days]);

  const totals = useMemo(() => rows.reduce((t, r) => ({
    clicks: t.clicks + r.clicks, leads: t.leads + r.leads, signups: t.signups + r.signups,
    approved: t.approved + r.approved, activated: t.activated + r.activated, cost: t.cost + r.cost,
  }), { clicks: 0, leads: 0, signups: 0, approved: 0, activated: 0, cost: 0 }), [rows]);

  const table = useMemo(() => rows
    .filter(r => r.clicks + r.leads + r.signups > 0 || r.campaign_id)
    .sort((a, b) => b.signups - a.signups || b.leads - a.leads || b.clicks - a.clicks), [rows]);

  if (loading) return <div className="bg-white border border-steel-200 rounded-2xl p-10 text-center text-steel-500 text-sm">Carregando…</div>;
  if (error) return <div className="bg-alert-500/10 text-alert-700 rounded-2xl p-4 text-sm">Erro ao carregar: {error}</div>;

  const paidSignups = rows.filter(r => r.cost > 0).reduce((s, r) => s + r.signups, 0);
  const cac = totals.cost > 0 && paidSignups > 0 ? totals.cost / paidSignups : null;
  const funnelMax = Math.max(...STAGES.map(s => totals[s.key]), 1);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <Kpi label="Cliques" value={totals.clicks} hint="links de campanha" />
        <Kpi label="Leads" value={totals.leads} tone="pending" />
        <Kpi label="Cadastros" value={totals.signups} tone="brand" hint={`${pct(totals.signups, totals.leads)} dos leads`} />
        <Kpi label="Aprovados" value={totals.approved} hint={`${pct(totals.approved, totals.signups)} dos cadastros`} />
        <Kpi label="Ativos" value={totals.activated} tone="signal" hint="fizeram 1º serviço" />
        <Kpi label="Custo por cadastro" value={cac != null ? brl(cac) : '—'} hint={totals.cost > 0 ? `${brl(totals.cost)} investidos` : 'informe o custo nas campanhas'} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Funil de aquisição" subtitle="Do clique no link até o primeiro serviço concluído">
          <div className="space-y-2.5">
            {STAGES.map((s, i) => {
              const n = totals[s.key];
              const prev = i > 0 ? totals[STAGES[i - 1].key] : null;
              return (
                <div key={s.key}>
                  <div className="flex items-center justify-between text-xs mb-1 gap-2">
                    <span className="font-semibold text-steel-700">{s.emoji} {s.label}</span>
                    <span className="text-steel-500 whitespace-nowrap">
                      <b className="text-steel-800">{n}</b>
                      {prev !== null && prev > 0 && <span className="ml-1.5 text-steel-400">({pct(n, prev)})</span>}
                    </span>
                  </div>
                  <div className="h-6 bg-steel-100 rounded-lg overflow-hidden">
                    <div className={`h-full ${s.color} rounded-lg`} style={{ width: `${Math.max((n / funnelMax) * 100, n ? 3 : 0)}%` }} />
                  </div>
                </div>
              );
            })}
            <p className="text-[11px] text-steel-400 pt-1">
              Cadastros contam todo mundo que se cadastrou no período, com ou sem campanha. {coupons > 0 && `${coupons} usaram cupom.`}
            </p>
          </div>
        </Card>

        <Card title="Dia a dia" subtitle="Cliques, leads e cadastros por dia">
          <DailyChart data={daily} />
        </Card>
      </div>

      <Card title="Desempenho por origem" subtitle="Campanhas suas + origens automáticas (UTM, indicação, direto)">
        {table.length === 0 ? (
          <Empty emoji="📭" title="Nada no período" text="Crie uma campanha e divulgue o link para começar a medir." />
        ) : (
          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <table className="w-full text-sm min-w-[640px]">
              <thead className="text-xs uppercase tracking-wider text-steel-500 border-b border-steel-200">
                <tr>
                  <th className="text-left py-2 px-3">Origem</th>
                  <th className="text-right py-2 px-2">Cliques</th>
                  <th className="text-right py-2 px-2">Leads</th>
                  <th className="text-right py-2 px-2">Cadastros</th>
                  <th className="text-right py-2 px-2">Aprovados</th>
                  <th className="text-right py-2 px-2">Ativos</th>
                  <th className="text-right py-2 px-3">Custo/cadastro</th>
                </tr>
              </thead>
              <tbody>
                {table.map(r => (
                  <tr key={r.campaign_id ?? `src:${r.source}`} className="border-b border-steel-100">
                    <td className="py-2.5 px-3 font-semibold text-steel-800">
                      {r.campaign_id ? <span className="text-brand-600 mr-1">📣</span> : null}
                      {r.campaign_id ? r.source : (SOURCE_LABEL[r.source] ?? r.source)}
                    </td>
                    <td className="py-2.5 px-2 text-right text-steel-600">{r.campaign_id ? r.clicks : '—'}</td>
                    <td className="py-2.5 px-2 text-right text-steel-600">{r.leads}</td>
                    <td className="py-2.5 px-2 text-right font-semibold text-steel-900">{r.signups}</td>
                    <td className="py-2.5 px-2 text-right text-steel-600">{r.approved}</td>
                    <td className="py-2.5 px-2 text-right text-signal-700 font-semibold">{r.activated}</td>
                    <td className="py-2.5 px-3 text-right text-steel-600">
                      {r.cost > 0 ? (r.signups > 0 ? brl(r.cost / r.signups) : `${brl(r.cost)} s/ cadastro`) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function DailyChart({ data }: { data: DayRow[] }) {
  if (!data.length) return <p className="text-sm text-steel-500">Sem dados.</p>;
  const max = Math.max(1, ...data.map(d => Math.max(d.clicks, d.leads, d.signups)));
  const series = [
    { key: 'clicks' as const,  label: 'Cliques',   color: '#9AA6B6' },
    { key: 'leads' as const,   label: 'Leads',     color: '#F59E0B' },
    { key: 'signups' as const, label: 'Cadastros', color: '#FF5C0A' },
  ];
  const W = 600, H = 180, P = 4;
  const x = (i: number) => P + (data.length === 1 ? (W - 2 * P) / 2 : (i / (data.length - 1)) * (W - 2 * P));
  const y = (v: number) => H - P - (v / max) * (H - 2 * P);
  const fmt = (s: string) => s.slice(8, 10) + '/' + s.slice(5, 7);

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-44" preserveAspectRatio="none" role="img" aria-label="Gráfico diário">
        {[0.25, 0.5, 0.75].map(t => (
          <line key={t} x1={0} x2={W} y1={y(max * t)} y2={y(max * t)} stroke="#EEF1F5" strokeWidth={1} />
        ))}
        {series.map(s => (
          <polyline key={s.key} fill="none" stroke={s.color} strokeWidth={2.5} vectorEffect="non-scaling-stroke"
            strokeLinejoin="round" points={data.map((d, i) => `${x(i)},${y(d[s.key])}`).join(' ')} />
        ))}
      </svg>
      <div className="flex justify-between text-[10px] text-steel-400 mt-1">
        <span>{fmt(data[0].day)}</span><span>máx. {max}/dia</span><span>{fmt(data[data.length - 1].day)}</span>
      </div>
      <div className="flex gap-4 mt-2 text-xs text-steel-600 flex-wrap">
        {series.map(s => (
          <span key={s.key} className="inline-flex items-center gap-1.5">
            <span className="h-2 w-4 rounded-full" style={{ background: s.color }} />{s.label}
            <b className="text-steel-800">{data.reduce((t, d) => t + d[s.key], 0)}</b>
          </span>
        ))}
      </div>
    </div>
  );
}
