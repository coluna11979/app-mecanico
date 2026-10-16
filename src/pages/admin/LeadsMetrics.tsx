import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import AdminLayout from '@/components/layout/AdminLayout';
import { supabase } from '@/lib/supabase';
import type { Lead, LeadOrigem, LeadStatus } from '@/types/database';

type Periodo = '7' | '30' | '90' | 'all';

const PERIODOS: { v: Periodo; label: string }[] = [
  { v: '7',   label: 'Últimos 7 dias'  },
  { v: '30',  label: 'Últimos 30 dias' },
  { v: '90',  label: 'Últimos 90 dias' },
  { v: 'all', label: 'Tudo'            },
];

const ORIGEM_LABEL: Record<LeadOrigem, string> = {
  formulario_site: 'Formulário no site',
  indicacao:       'Indicação',
  instagram:       'Instagram',
  facebook:        'Facebook',
  google_ads:      'Google Ads',
  google_maps:     'Google Maps',
  whatsapp:        'WhatsApp',
  importado_csv:   'CSV',
  link_convite:    'Link de convite',
  evento:          'Evento',
  outro:           'Outro',
};

const FUNIL_ETAPAS: { key: LeadStatus; label: string; emoji: string; color: string }[] = [
  { key: 'lead_novo',         label: 'Novos',             emoji: '🆕', color: 'bg-steel-400'   },
  { key: 'contato_feito',     label: 'Contato feito',     emoji: '📞', color: 'bg-pending-500' },
  { key: 'interessado',       label: 'Interessado',       emoji: '🔥', color: 'bg-orange-500'  },
  { key: 'cadastro_iniciado', label: 'Cadastro iniciado', emoji: '📝', color: 'bg-blue-500'    },
  { key: 'convertido',        label: 'Convertido',        emoji: '✅', color: 'bg-signal-500'  },
];

const RANKS: Record<LeadStatus, number> = {
  lead_novo: 1, contato_feito: 2, interessado: 3, cadastro_iniciado: 4, convertido: 5, perdido: 0,
};

export default function AdminLeadsMetrics() {
  const [periodo, setPeriodo] = useState<Periodo>('30');
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, [periodo]);

  async function load() {
    setLoading(true);
    let q = supabase.from('leads').select('*').order('created_at', { ascending: false });
    if (periodo !== 'all') {
      const d = new Date();
      d.setDate(d.getDate() - Number(periodo));
      q = q.gte('created_at', d.toISOString());
    }
    const { data } = await q;
    setLeads((data ?? []) as Lead[]);
    setLoading(false);
  }

  // Funil cumulativo: leads que CHEGARAM pelo menos em cada etapa
  const funil = useMemo(() => {
    return FUNIL_ETAPAS.map(e => {
      const n = leads.filter(l => RANKS[l.status] >= RANKS[e.key]).length;
      return { ...e, n };
    });
  }, [leads]);

  const total = leads.length;
  const perdidos = leads.filter(l => l.status === 'perdido').length;
  const convertidos = leads.filter(l => l.status === 'convertido').length;
  const emPipeline = total - perdidos - convertidos;
  const taxaConv = total ? (convertidos / total) * 100 : 0;

  // Por origem
  const porOrigem = useMemo(() => {
    const grp = new Map<LeadOrigem, { total: number; convertidos: number; perdidos: number }>();
    leads.forEach(l => {
      const g = grp.get(l.origem) ?? { total: 0, convertidos: 0, perdidos: 0 };
      g.total++;
      if (l.status === 'convertido') g.convertidos++;
      if (l.status === 'perdido')    g.perdidos++;
      grp.set(l.origem, g);
    });
    return Array.from(grp.entries())
      .map(([origem, g]) => ({
        origem,
        label: ORIGEM_LABEL[origem],
        ...g,
        taxa: g.total ? (g.convertidos / g.total) * 100 : 0,
      }))
      .sort((a, b) => b.total - a.total);
  }, [leads]);

  // Por tipo
  const porTipo = useMemo(() => {
    const mech = leads.filter(l => l.intent === 'mechanic');
    const wsh  = leads.filter(l => l.intent === 'workshop');
    return [
      { label: '🔧 Mecânicos', total: mech.length, conv: mech.filter(l => l.status === 'convertido').length },
      { label: '🏭 Oficinas',  total: wsh.length,  conv: wsh.filter(l => l.status === 'convertido').length  },
    ];
  }, [leads]);

  // Top cidades
  const porCidade = useMemo(() => {
    const grp = new Map<string, number>();
    leads.forEach(l => {
      if (!l.cidade) return;
      const chave = `${l.cidade}${l.estado ? `/${l.estado}` : ''}`;
      grp.set(chave, (grp.get(chave) ?? 0) + 1);
    });
    return Array.from(grp.entries())
      .map(([cidade, n]) => ({ cidade, n }))
      .sort((a, b) => b.n - a.n)
      .slice(0, 10);
  }, [leads]);

  // Evolução por semana (últimas 12 semanas, sempre; não depende do filtro)
  const [evolucao, setEvolucao] = useState<{ semana: string; novos: number; convertidos: number }[]>([]);
  useEffect(() => {
    (async () => {
      const inicio = new Date();
      inicio.setDate(inicio.getDate() - 12 * 7);
      const { data } = await supabase
        .from('leads')
        .select('created_at, converted_at, status')
        .gte('created_at', inicio.toISOString());

      const buckets: Record<string, { novos: number; convertidos: number }> = {};
      for (let i = 11; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i * 7);
        const key = isoWeekKey(d);
        buckets[key] = { novos: 0, convertidos: 0 };
      }
      (data ?? []).forEach((r: { created_at: string; converted_at: string | null }) => {
        const kCreated = isoWeekKey(new Date(r.created_at));
        if (buckets[kCreated]) buckets[kCreated].novos++;
        if (r.converted_at) {
          const kConv = isoWeekKey(new Date(r.converted_at));
          if (buckets[kConv]) buckets[kConv].convertidos++;
        }
      });
      setEvolucao(Object.entries(buckets).map(([semana, v]) => ({ semana, ...v })));
    })();
  }, []);

  // Tempo médio até conversão (dias)
  const tempoMedioConversao = useMemo(() => {
    const convs = leads.filter(l => l.status === 'convertido' && l.converted_at);
    if (!convs.length) return null;
    const soma = convs.reduce((acc, l) => {
      const dias = (new Date(l.converted_at!).getTime() - new Date(l.created_at).getTime()) / (1000 * 60 * 60 * 24);
      return acc + dias;
    }, 0);
    return soma / convs.length;
  }, [leads]);

  return (
    <AdminLayout>
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <Link to="/admin/leads" className="text-xs text-steel-500 hover:text-brand-500 mb-1 inline-block">← Pipeline de Leads</Link>
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">Métricas de Captação</h1>
          <p className="text-steel-500 text-sm mt-1">Veja o funil, descubra qual canal paga melhor e o que precisa de atenção.</p>
        </div>
        <div className="inline-flex bg-steel-100 rounded-xl p-1 text-sm">
          {PERIODOS.map(p => (
            <button key={p.v} onClick={() => setPeriodo(p.v)}
              className={`px-3 py-1.5 rounded-lg font-semibold transition ${periodo === p.v ? 'bg-white shadow text-steel-900' : 'text-steel-500 hover:text-steel-700'}`}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="bg-white border border-steel-200 rounded-2xl p-10 text-center text-steel-500 text-sm">Carregando…</div>
      ) : total === 0 ? (
        <div className="bg-white border border-steel-200 rounded-2xl p-10 text-center">
          <div className="text-5xl mb-2">📊</div>
          <p className="text-steel-700 font-semibold">Nenhum lead no período</p>
          <p className="text-steel-500 text-sm mt-1">Importe leads ou aguarde novos cadastros chegarem.</p>
        </div>
      ) : (
        <>
          {/* KPIs principais */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
            <Kpi label="Total" value={total} />
            <Kpi label="Em pipeline" value={emPipeline} tone="pending" />
            <Kpi label="Convertidos" value={convertidos} tone="signal" />
            <Kpi label="Taxa conversão" value={`${taxaConv.toFixed(1)}%`} tone="brand" />
            <Kpi label="Tempo médio" value={tempoMedioConversao != null ? `${tempoMedioConversao.toFixed(1)}d` : '—'} subtitle="até converter" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
            {/* Funil */}
            <Card title="Funil de conversão" subtitle="Quantos leads chegaram a cada etapa">
              <div className="space-y-2.5">
                {funil.map((f, i) => {
                  const pct = total ? (f.n / total) * 100 : 0;
                  const taxaPrev = i > 0 && funil[i - 1].n > 0 ? (f.n / funil[i - 1].n) * 100 : null;
                  return (
                    <div key={f.key}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="font-semibold text-steel-700">{f.emoji} {f.label}</span>
                        <span className="text-steel-500">
                          <b className="text-steel-800">{f.n}</b>
                          {taxaPrev !== null && <span className="ml-2 text-steel-400">({taxaPrev.toFixed(0)}% da etapa anterior)</span>}
                        </span>
                      </div>
                      <div className="h-6 bg-steel-100 rounded-lg overflow-hidden">
                        <div
                          className={`h-full ${f.color} rounded-lg flex items-center justify-end px-2 text-white text-[10px] font-bold transition-all`}
                          style={{ width: `${Math.max(pct, 2)}%` }}
                        >
                          {pct > 10 ? `${pct.toFixed(0)}%` : ''}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {perdidos > 0 && (
                  <div className="pt-2 mt-2 border-t border-steel-100 text-xs text-steel-500 flex justify-between">
                    <span>🚫 Perdidos (fora do funil)</span>
                    <span><b className="text-steel-800">{perdidos}</b> ({((perdidos / total) * 100).toFixed(0)}%)</span>
                  </div>
                )}
              </div>
            </Card>

            {/* Evolução */}
            <Card title="Evolução nas últimas 12 semanas" subtitle="Novos leads × Convertidos por semana (independente do filtro)">
              <Sparkline data={evolucao} />
            </Card>
          </div>

          {/* Por origem */}
          <Card title="Desempenho por origem" subtitle="Onde seu melhor canal está? E onde o dinheiro está indo pro ralo?">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase tracking-wider text-steel-500 border-b border-steel-200">
                  <tr>
                    <th className="text-left py-2 px-2">Origem</th>
                    <th className="text-right py-2 px-2">Total</th>
                    <th className="text-right py-2 px-2">Convertidos</th>
                    <th className="text-right py-2 px-2">Perdidos</th>
                    <th className="text-left py-2 px-2 w-[40%]">Taxa de conversão</th>
                  </tr>
                </thead>
                <tbody>
                  {porOrigem.map(o => (
                    <tr key={o.origem} className="border-b border-steel-100">
                      <td className="py-2.5 px-2 font-semibold text-steel-800">{o.label}</td>
                      <td className="py-2.5 px-2 text-right text-steel-600">{o.total}</td>
                      <td className="py-2.5 px-2 text-right text-signal-700 font-semibold">{o.convertidos}</td>
                      <td className="py-2.5 px-2 text-right text-steel-500">{o.perdidos}</td>
                      <td className="py-2.5 px-2">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-steel-100 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${o.taxa >= 20 ? 'bg-signal-500' : o.taxa >= 10 ? 'bg-pending-500' : 'bg-alert-500'}`}
                              style={{ width: `${Math.min(o.taxa, 100)}%` }} />
                          </div>
                          <span className="text-xs font-bold text-steel-700 w-10 text-right">{o.taxa.toFixed(0)}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
            {/* Por tipo */}
            <Card title="Mecânico vs Oficina" subtitle="Qual perfil você está captando mais?">
              <div className="space-y-3">
                {porTipo.map(t => {
                  const pct = total ? (t.total / total) * 100 : 0;
                  const taxa = t.total ? (t.conv / t.total) * 100 : 0;
                  return (
                    <div key={t.label}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="font-semibold">{t.label}</span>
                        <span className="text-steel-500">{t.total} ({pct.toFixed(0)}%) · <b className="text-signal-700">{taxa.toFixed(0)}%</b> convertem</span>
                      </div>
                      <div className="h-3 bg-steel-100 rounded-full overflow-hidden">
                        <div className="h-full bg-brand-500 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>

            {/* Top cidades */}
            <Card title="Top 10 cidades" subtitle="Onde está o grosso dos leads">
              {porCidade.length === 0 ? (
                <p className="text-sm text-steel-400 italic">Nenhum lead com cidade preenchida.</p>
              ) : (
                <ul className="space-y-1.5">
                  {porCidade.map((c, i) => (
                    <li key={c.cidade} className="flex items-center justify-between text-sm py-1 border-b border-steel-50 last:border-0">
                      <span className="flex items-center gap-2">
                        <span className="text-steel-400 w-5 text-xs">{i + 1}.</span>
                        <span className="font-semibold text-steel-800">{c.cidade}</span>
                      </span>
                      <span className="font-bold text-brand-600">{c.n}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </>
      )}
    </AdminLayout>
  );
}

function Kpi({ label, value, subtitle, tone }: { label: string; value: string | number; subtitle?: string; tone?: 'brand' | 'signal' | 'pending' }) {
  const cls = tone === 'brand'   ? 'text-brand-600'
            : tone === 'signal'  ? 'text-signal-600'
            : tone === 'pending' ? 'text-pending-700'
            : 'text-steel-800';
  return (
    <div className="bg-white border border-steel-200 rounded-2xl px-5 py-4">
      <div className="text-xs text-steel-500 font-semibold uppercase tracking-wider">{label}</div>
      <div className={`text-3xl font-bold mt-1 ${cls}`}>{value}</div>
      {subtitle && <div className="text-[11px] text-steel-500 mt-0.5">{subtitle}</div>}
    </div>
  );
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-steel-200 rounded-2xl p-5">
      <div className="mb-4">
        <h3 className="font-bold text-steel-800">{title}</h3>
        {subtitle && <p className="text-xs text-steel-500 mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

/** Sparkline SVG com duas séries (novos + convertidos). */
function Sparkline({ data }: { data: { semana: string; novos: number; convertidos: number }[] }) {
  if (!data.length) return <p className="text-sm text-steel-400 italic">Sem dados.</p>;
  const w = 400, h = 120, pad = 20;
  const max = Math.max(1, ...data.flatMap(d => [d.novos, d.convertidos]));
  const stepX = (w - pad * 2) / Math.max(1, data.length - 1);
  const toXY = (i: number, v: number) => [
    pad + i * stepX,
    h - pad - (v / max) * (h - pad * 2),
  ] as const;
  const path = (key: 'novos' | 'convertidos') =>
    data.map((d, i) => {
      const [x, y] = toXY(i, d[key]);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');

  const totNovos = data.reduce((a, d) => a + d.novos, 0);
  const totConv  = data.reduce((a, d) => a + d.convertidos, 0);

  return (
    <div>
      <div className="flex gap-4 mb-3 text-xs">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-0.5 bg-brand-500"></span>
          <span className="text-steel-700 font-semibold">Novos leads</span>
          <span className="text-steel-500">({totNovos})</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-0.5 bg-signal-500"></span>
          <span className="text-steel-700 font-semibold">Convertidos</span>
          <span className="text-steel-500">({totConv})</span>
        </span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-32">
        {/* linha base */}
        <line x1={pad} y1={h - pad} x2={w - pad} y2={h - pad} stroke="currentColor" className="text-steel-200" />
        {/* novos */}
        <path d={path('novos')} fill="none" stroke="currentColor" strokeWidth="2" className="text-brand-500" />
        {/* convertidos */}
        <path d={path('convertidos')} fill="none" stroke="currentColor" strokeWidth="2" className="text-signal-500" />
        {/* pontos */}
        {data.map((d, i) => {
          const [xn, yn] = toXY(i, d.novos);
          const [xc, yc] = toXY(i, d.convertidos);
          return (
            <g key={d.semana}>
              <circle cx={xn} cy={yn} r="2.5" className="fill-brand-500" />
              <circle cx={xc} cy={yc} r="2.5" className="fill-signal-500" />
            </g>
          );
        })}
      </svg>
      <div className="flex justify-between text-[10px] text-steel-400 mt-1 px-5">
        <span>{data[0]?.semana}</span>
        <span>{data[data.length - 1]?.semana}</span>
      </div>
    </div>
  );
}

/** Chave de semana ISO no formato "YYYY-Wnn" para agrupamento. */
function isoWeekKey(d: Date): string {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}
