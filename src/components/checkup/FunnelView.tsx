import { useMemo, useState } from 'react';
import { CHECKUP_MODELS, modelOf, type CheckupModelKey } from '@/lib/checkup';
import { fmtBRL } from '@/components/os/osHelpers';
import type { PanelCheckup } from '@/lib/checkupPanel';
import { STAGES, byType, funnelOf, itemStats, leaksOf, typeOf, worstLeaks, type Funnel, type StageKey } from '@/lib/checkupFunnel';

/* Funil de vendas do Check-up: do check-up feito ao serviço feito, por tipo de check-up.
   Gráfico em funil (uma cor só, largura = quantidade), onde está perdendo e o que fazer,
   comparação entre os tipos e os itens que mais vendem / mais são recusados. */

const PERIODS = [30, 90, 180, 365] as const;
type Period = typeof PERIODS[number];
const pct = (n: number | null) => n == null ? '—' : `${Math.round(n)}%`;

export default function FunnelView({ list }: { list: PanelCheckup[] }) {
  const [days, setDays] = useState<Period>(90);
  const [type, setType] = useState<CheckupModelKey | 'todos'>('todos');

  const inPeriod = useMemo(() => {
    const from = Date.now() - days * 86400000;
    return list.filter(c => !c.replaced_by && new Date(c.created_at).getTime() >= from);
  }, [list, days]);
  const shown = useMemo(() => type === 'todos' ? inPeriod : inPeriod.filter(c => typeOf(c) === type), [inPeriod, type]);
  const f = useMemo(() => funnelOf(shown), [shown]);
  const leaks = useMemo(() => worstLeaks(f), [f]);
  const types = useMemo(() => byType(inPeriod), [inPeriod]);
  const items = useMemo(() => itemStats(shown), [shown]);

  const sells = [...items].filter(i => i.aprovado > 0).sort((a, b) => b.taxa - a.taxa || b.aprovado - a.aprovado).slice(0, 5);
  const refused = [...items].filter(i => i.recusado + i.lembrar > 0).sort((a, b) => (b.recusado + b.lembrar) - (a.recusado + a.lembrar)).slice(0, 5);

  return (
    <section className="space-y-5">
      {/* Filtros numa linha */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 justify-between">
        <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
          <Chip on={type === 'todos'} onClick={() => setType('todos')}>Todos os tipos</Chip>
          {CHECKUP_MODELS.filter(m => types.some(t => t.key === m.key)).map(m => (
            <Chip key={m.key} on={type === m.key} onClick={() => setType(m.key)}>{m.icon} {m.label}</Chip>
          ))}
        </div>
        <div className="inline-flex rounded-xl bg-steel-100 p-1 text-xs font-semibold self-start shrink-0">
          {PERIODS.map(d => (
            <button key={d} onClick={() => setDays(d)}
              className={`px-3 py-1.5 rounded-lg ${days === d ? 'bg-white text-steel-900 shadow-sm' : 'text-steel-500'}`}>
              {d === 365 ? '12 meses' : `${d} dias`}
            </button>
          ))}
        </div>
      </div>

      {f.total === 0 ? (
        <div className="card text-center py-10 text-sm text-steel-500">Nenhum check-up {type === 'todos' ? '' : 'desse tipo '}no período.</div>
      ) : (
        <>
          {/* Números de cabeça */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat label="Viraram serviço" value={pct(f.conversao)} sub={`${f.counts.aprovou} de ${f.total} check-ups`} />
            <Stat label="Orçado" value={fmtBRL(f.orcado)} sub={`${f.counts.enviados} orçamentos enviados`} />
            <Stat label="Aprovado" value={fmtBRL(f.aprovado)} sub={f.counts.enviados ? `${pct(f.orcado ? (f.aprovado / f.orcado) * 100 : 0)} do valor orçado` : '—'} dark />
            <Stat label="Ticket por aprovação" value={f.counts.aprovou ? fmtBRL(f.ticket) : '—'} sub={f.lembrar.n ? `+ ${f.lembrar.n} pediram para lembrar (${fmtBRL(f.lembrar.valor)})` : 'por check-up aprovado'} />
          </div>

          <div className="grid lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-5 items-start">
            <FunnelChart f={f} />

            {/* Onde está perdendo */}
            <div className="card space-y-3">
              <div>
                <div className="font-bold text-steel-800">Onde você está perdendo</div>
                <p className="text-xs text-steel-500">Comparado com a meta de cada etapa. O primeiro da lista é o que mais vale atacar.</p>
              </div>
              {leaks.length === 0 ? (
                <div className="rounded-xl bg-signal-50 text-signal-800 text-sm px-3 py-2.5">✅ Todas as etapas estão na meta neste período.</div>
              ) : leaks.slice(0, 3).map((l, i) => (
                <div key={l.from} className={`rounded-xl border px-3 py-2.5 space-y-1 ${i === 0 ? 'border-alert-200 bg-alert-50' : 'border-steel-200'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-sm font-semibold text-steel-800">{i === 0 && '🎯 '}{l.title}</div>
                    <span className="text-xs font-bold text-alert-700 shrink-0">{pct(l.taxa)} <span className="font-normal text-steel-500">· meta {l.meta}%</span></span>
                  </div>
                  <div className="text-xs text-steel-600">
                    {l.passou} de {l.entrou} passaram. Batendo a meta seriam <strong>+{l.perdidos} {l.perdidos === 1 ? 'carro' : 'carros'}</strong> nessa etapa.
                  </div>
                  <div className="text-xs text-steel-700">👉 {l.action}</div>
                </div>
              ))}
              <details className="text-xs text-steel-500">
                <summary className="cursor-pointer font-semibold">Ver todas as etapas e metas</summary>
                <table className="w-full mt-2">
                  <tbody className="divide-y divide-steel-100">
                    {leaksOf(f).map(l => (
                      <tr key={l.from}>
                        <td className="py-1.5 pr-2">{STAGE_LABEL[l.from]} → {STAGE_LABEL[l.to]}</td>
                        <td className={`py-1.5 text-right font-semibold ${l.ok ? 'text-signal-700' : 'text-alert-700'}`}>{l.entrou ? pct(l.taxa) : '—'}</td>
                        <td className="py-1.5 pl-2 text-right text-steel-400">meta {l.meta}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            </div>
          </div>

          {/* Por tipo de check-up */}
          {type === 'todos' && types.length > 1 && (
            <div className="card !p-0 overflow-hidden">
              <div className="px-5 pt-4 pb-2">
                <div className="font-bold text-steel-800">Qual tipo de check-up vende mais</div>
                <p className="text-xs text-steel-500">Toque num tipo para ver o funil dele.</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[560px]">
                  <thead className="text-[11px] uppercase tracking-wider text-steel-500 bg-steel-50">
                    <tr>
                      <th className="text-left px-5 py-2 font-semibold">Tipo</th>
                      <th className="text-right px-3 py-2 font-semibold">Feitos</th>
                      <th className="text-right px-3 py-2 font-semibold">Orçamento enviado</th>
                      <th className="text-right px-3 py-2 font-semibold">Viraram serviço</th>
                      <th className="text-right px-3 py-2 font-semibold">Aprovado</th>
                      <th className="text-right px-5 py-2 font-semibold">Ticket</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-steel-100">
                    {types.map(t => {
                      const best = types.every(o => (o.funnel.conversao ?? 0) <= (t.funnel.conversao ?? 0)) && (t.funnel.conversao ?? 0) > 0;
                      return (
                        <tr key={t.key} onClick={() => setType(t.key)} className="cursor-pointer hover:bg-brand-50">
                          <td className="px-5 py-2.5 font-semibold text-steel-800">{modelOf(t.key).icon} {modelOf(t.key).label}{best && <span className="ml-1.5 text-[10px] font-bold text-signal-700">MELHOR</span>}</td>
                          <td className="px-3 py-2.5 text-right">{t.funnel.total}</td>
                          <td className="px-3 py-2.5 text-right">{t.funnel.counts.enviados}</td>
                          <td className="px-3 py-2.5 text-right font-semibold">{pct(t.funnel.conversao)}</td>
                          <td className="px-3 py-2.5 text-right">{fmtBRL(t.funnel.aprovado)}</td>
                          <td className="px-5 py-2.5 text-right">{t.funnel.counts.aprovou ? fmtBRL(t.funnel.ticket) : '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Itens */}
          {items.length > 0 && (
            <div className="grid md:grid-cols-2 gap-5">
              <ItemList title="✅ Itens que mais vendem" empty="Nenhum item aprovado ainda."
                rows={sells.map(i => ({ key: i.key, label: i.label, right: `${i.aprovado} de ${i.ofertado}`, pct: i.taxa, tone: 'good' as const }))} />
              <ItemList title="✋ Itens que o cliente mais deixa para depois" empty="Nenhuma recusa no período."
                note="Pediu para lembrar não é perda: vira retorno no CRM."
                rows={refused.map(i => ({ key: i.key, label: i.label, right: `${i.recusado + i.lembrar} de ${i.ofertado}${i.lembrar ? ` · ${i.lembrar} lembrar` : ''}`, pct: ((i.recusado + i.lembrar) / i.ofertado) * 100, tone: 'bad' as const }))} />
            </div>
          )}
        </>
      )}
    </section>
  );
}

const STAGE_LABEL = Object.fromEntries(STAGES.map(s => [s.key, s.label])) as Record<StageKey, string>;
const META_OF: Partial<Record<StageKey, number>> = Object.fromEntries(leaksOfMeta().map(l => [l.to, l.meta]));
function leaksOfMeta() { return leaksOf(funnelOf([])); }

/* ─── Gráfico de funil ──────────────────────────────────────────
   Uma cor (laranja da marca); largura = quantidade em relação aos check-ups feitos.
   Entre as etapas: quantos passaram (vermelho quando abaixo da meta). */
function FunnelChart({ f }: { f: Funnel }) {
  const max = Math.max(1, f.total);
  const [hover, setHover] = useState<StageKey | null>(null);
  return (
    <div className="card space-y-1">
      <div className="flex items-baseline justify-between mb-2">
        <div className="font-bold text-steel-800">Funil de vendas</div>
        <span className="text-xs text-steel-500">{f.total} check-ups</span>
      </div>
      {STAGES.map((s, i) => {
        const n = f.counts[s.key];
        const w = Math.max(n ? 8 : 2, (n / max) * 100);
        const prev = i > 0 ? f.counts[STAGES[i - 1].key] : null;
        const rate = prev ? (n / prev) * 100 : null;
        const meta = META_OF[s.key];
        const low = rate != null && meta != null && rate < meta;
        // Última etapas em tom mais escuro: é onde o dinheiro entra
        const shade = i < 3 ? 'bg-brand-300' : i < 5 ? 'bg-brand-400' : 'bg-brand-600';
        return (
          <div key={s.key}>
            {rate != null && (
              <div className={`text-center text-[11px] py-0.5 ${low ? 'text-alert-700 font-semibold' : 'text-steel-400'}`}>
                ↓ {pct(rate)} passaram{prev! - n > 0 && ` · ficaram ${prev! - n}`}{low && ` (meta ${meta}%)`}
              </div>
            )}
            <div className="relative" onMouseEnter={() => setHover(s.key)} onMouseLeave={() => setHover(null)}>
              {/* Celular: nome da etapa em cima, barra com a largura toda */}
              <div className="sm:hidden text-xs font-semibold text-steel-700 text-center mb-0.5">{s.label}</div>
              <div className="flex items-center gap-3">
                <div className="hidden sm:block w-44 shrink-0 text-right">
                  <div className="text-xs font-semibold text-steel-700 leading-tight">{s.label}</div>
                </div>
                <div className="flex-1 min-w-0 flex justify-center">
                  {n === 0 ? <div className="h-9 grid place-items-center text-sm font-bold text-steel-300">0</div> : <div className={`${shade} h-9 rounded-md transition-all grid place-items-center ${hover === s.key ? 'ring-2 ring-brand-700' : ''}`}
                    style={{ width: `${w}%` }}>
                    <span className={`text-sm font-bold ${i < 3 ? 'text-steel-900' : 'text-white'}`}>{n}</span>
                  </div>}
                </div>
                <div className="w-12 shrink-0 text-xs text-steel-500 text-right">{pct((n / max) * 100)}</div>
              </div>
              {hover === s.key && (
                <div className="absolute z-10 left-1/2 -translate-x-1/2 top-full mt-1 rounded-lg bg-steel-900 text-white text-xs px-3 py-2 shadow-lg whitespace-nowrap">
                  <div className="font-semibold">{s.label}: {n}</div>
                  <div className="text-steel-300">{s.hint}</div>
                  {s.key === 'enviados' && <div>Orçado: {fmtBRL(f.orcado)}</div>}
                  {s.key === 'aprovou' && <div>Aprovado: {fmtBRL(f.aprovado)}</div>}
                  {s.key === 'feito' && <div>Já feito: {fmtBRL(f.executado)}</div>}
                </div>
              )}
            </div>
          </div>
        );
      })}
      <p className="text-[11px] text-steel-400 pt-2">
        “Encontrou o que fazer” não é perda: os outros carros estavam em bom estado. % à direita = em relação aos check-ups feitos.
      </p>
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={`px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition ${on ? 'bg-steel-900 text-white' : 'bg-white border border-steel-200 text-steel-600 hover:bg-steel-50'}`}>
      {children}
    </button>
  );
}

function Stat({ label, value, sub, dark }: { label: string; value: string; sub: string; dark?: boolean }) {
  return (
    <div className={`card !p-4 ${dark ? '!bg-steel-900 text-white' : ''}`}>
      <div className={`text-xs font-semibold ${dark ? 'text-steel-300' : 'text-steel-500'}`}>{label}</div>
      <div className="text-2xl font-bold font-display mt-1">{value}</div>
      <div className={`text-[11px] mt-0.5 ${dark ? 'text-steel-300' : 'text-steel-500'}`}>{sub}</div>
    </div>
  );
}

function ItemList({ title, rows, empty, note }: {
  title: string; empty: string; note?: string;
  rows: { key: string; label: string; right: string; pct: number; tone: 'good' | 'bad' }[];
}) {
  return (
    <div className="card space-y-2.5">
      <div className="font-bold text-steel-800">{title}</div>
      {rows.length === 0 ? <div className="text-sm text-steel-500">{empty}</div> : rows.map(r => (
        <div key={r.key} className="space-y-1">
          <div className="flex justify-between gap-2 text-sm">
            <span className="text-steel-800 truncate">{r.label}</span>
            <span className="text-xs text-steel-500 shrink-0">{r.right}</span>
          </div>
          <div className="h-1.5 rounded-full bg-steel-100 overflow-hidden">
            <div className={`h-full rounded-full ${r.tone === 'good' ? 'bg-signal-500' : 'bg-pending-500'}`} style={{ width: `${Math.max(4, r.pct)}%` }} />
          </div>
        </div>
      ))}
      {note && <p className="text-[11px] text-steel-400">{note}</p>}
    </div>
  );
}
