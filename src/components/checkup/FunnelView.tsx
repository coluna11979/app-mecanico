import { useMemo, useState } from 'react';
import { CHECKUP_MODELS, modelOf, type CheckupModelKey } from '@/lib/checkup';
import { fmtBRL } from '@/components/os/osHelpers';
import LicensePlate from '@/components/os/LicensePlate';
import type { PanelCheckup } from '@/lib/checkupPanel';
import {
  STAGES, byType, fmtHours, funnelOf, itemStats, leaksOf, moneyOnTable, quotedOf, speedOf, stuckList, typeOf, worstLeaks,
  type Funnel, type StageKey,
} from '@/lib/checkupFunnel';

/* Funil de vendas do Check-up.
   Funil desenhado (cada etapa afina até a próxima), clique numa etapa = carros parados nela com ação,
   dinheiro na mesa, velocidade, comparação com o período anterior, onde está perdendo,
   tipos de check-up e itens que mais vendem. */

const PERIODS = [30, 90, 180, 365] as const;
type Period = typeof PERIODS[number];
const DAY = 86400000;
const pct = (n: number | null) => n == null ? '—' : `${Math.round(n)}%`;
const carOf = (c: PanelCheckup) => [c.make, c.model, c.year].filter(Boolean).join(' ') || 'Veículo';
const daysAgo = (iso?: string | null) => iso ? Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / DAY)) : null;

/** Quando entrou na etapa em que está parado */
const sinceOf = (c: PanelCheckup, s: StageKey) => ({
  feitos: c.created_at, terminados: c.completed_at, oportunidade: c.completed_at, enviados: c.quote_sent_at,
  abriu: c.customer_viewed_at, aprovou: c.customer_responded_at, feito: c.customer_responded_at,
}[s] ?? c.updated_at);

/** O que fazer com quem parou em cada etapa */
const STUCK: Partial<Record<StageKey, { title: string; action: 'open' | 'wa'; cta: string }>> = {
  feitos:       { title: 'Inspeção não terminada', action: 'open', cta: 'Abrir' },
  oportunidade: { title: 'Encontrou problema e o orçamento não foi enviado', action: 'open', cta: 'Montar orçamento' },
  enviados:     { title: 'Cliente ainda não abriu o orçamento', action: 'wa', cta: 'Chamar no WhatsApp' },
  abriu:        { title: 'Cliente viu e não aprovou', action: 'wa', cta: 'Chamar no WhatsApp' },
  aprovou:      { title: 'Aprovado, serviço ainda não feito', action: 'open', cta: 'Abrir' },
};

export default function FunnelView({ list, onOpen, onWhatsapp }: {
  list: PanelCheckup[];
  onOpen: (c: PanelCheckup) => void;
  onWhatsapp: (c: PanelCheckup) => void;
}) {
  const [days, setDays] = useState<Period>(90);
  const [type, setType] = useState<CheckupModelKey | 'todos'>('todos');
  const [stage, setStage] = useState<StageKey | null>(null);

  const ofType = (cs: PanelCheckup[]) => type === 'todos' ? cs : cs.filter(c => typeOf(c) === type);
  const inRange = (from: number, to: number) =>
    list.filter(c => !c.replaced_by && new Date(c.created_at).getTime() >= from && new Date(c.created_at).getTime() < to);
  const now = Date.now();
  const allPeriod = useMemo(() => inRange(now - days * DAY, now + DAY), [list, days]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = useMemo(() => ofType(allPeriod), [allPeriod, type]); // eslint-disable-line react-hooks/exhaustive-deps
  const prev = useMemo(() => funnelOf(ofType(inRange(now - 2 * days * DAY, now - days * DAY))), [list, days, type]); // eslint-disable-line react-hooks/exhaustive-deps

  const f = useMemo(() => funnelOf(shown), [shown]);
  const leaks = useMemo(() => worstLeaks(f), [f]);
  const types = useMemo(() => byType(allPeriod), [allPeriod]);
  const items = useMemo(() => itemStats(shown), [shown]);
  const money = useMemo(() => moneyOnTable(shown), [shown]);
  const speed = useMemo(() => speedOf(shown), [shown]);
  const stuck = useMemo(() => stage ? stuckList(shown, stage)
    .sort((a, b) => (sinceOf(a, stage) ?? '').localeCompare(sinceOf(b, stage) ?? '')) : [], [shown, stage]);

  const sells = [...items].filter(i => i.aprovado > 0).sort((a, b) => b.taxa - a.taxa || b.aprovado - a.aprovado).slice(0, 5);
  const refused = [...items].filter(i => i.recusado + i.lembrar > 0).sort((a, b) => (b.recusado + b.lembrar) - (a.recusado + a.lembrar)).slice(0, 5);
  const hasPrev = prev.total > 0;

  return (
    <section className="space-y-5">
      {/* Filtros numa linha */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 justify-between">
        <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
          <Chip on={type === 'todos'} onClick={() => { setType('todos'); setStage(null); }}>Todos os tipos</Chip>
          {/* Todos os tipos sempre à vista, com quantos check-ups cada um teve no período */}
          {CHECKUP_MODELS.map(m => {
            const n = types.find(t => t.key === m.key)?.funnel.total ?? 0;
            return (
              <Chip key={m.key} on={type === m.key} dim={n === 0} onClick={() => { setType(m.key); setStage(null); }}>
                {m.icon} {m.label} <span className="opacity-60">({n})</span>
              </Chip>
            );
          })}
        </div>
        <div className="inline-flex rounded-xl bg-steel-100 p-1 text-xs font-semibold self-start shrink-0">
          {PERIODS.map(d => (
            <button key={d} onClick={() => { setDays(d); setStage(null); }}
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
          {/* Números de cabeça, com a comparação com o período anterior */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat label="Viraram serviço" value={pct(f.conversao)} sub={`${f.counts.aprovou} de ${f.total} check-ups`}
              delta={hasPrev && f.conversao != null && prev.conversao != null ? { v: f.conversao - prev.conversao, unit: 'pts' } : null} />
            <Stat label="Aprovado" value={fmtBRL(f.aprovado)} sub={f.orcado ? `${pct((f.aprovado / f.orcado) * 100)} do valor orçado` : 'nada orçado ainda'}
              delta={hasPrev && prev.aprovado > 0 ? { v: ((f.aprovado - prev.aprovado) / prev.aprovado) * 100, unit: '%' } : null} dark />
            <Stat label="Ticket por aprovação" value={f.counts.aprovou ? fmtBRL(f.ticket) : '—'} sub="por check-up aprovado"
              delta={hasPrev && prev.ticket > 0 && f.ticket > 0 ? { v: ((f.ticket - prev.ticket) / prev.ticket) * 100, unit: '%' } : null} />
            <Stat label="Check-ups feitos" value={String(f.total)} sub={`${f.counts.enviados} orçamentos enviados`}
              delta={hasPrev ? { v: ((f.total - prev.total) / prev.total) * 100, unit: '%' } : null} />
          </div>

          {/* Funil + dinheiro na mesa */}
          <div className="grid lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] gap-5 items-start">
            <div className="card space-y-2">
              <div className="flex items-baseline justify-between gap-2">
                <div className="font-bold text-steel-800">Funil de vendas</div>
                <span className="text-xs text-steel-500">toque numa etapa para ver os carros</span>
              </div>
              <FunnelSvg f={f} selected={stage} onSelect={k => setStage(s => s === k ? null : k)} />
              <p className="text-[11px] text-steel-400">
                % à direita = quantos passaram da etapa anterior (vermelho = abaixo da meta).
                “Encontrou o que fazer” não é perda: os outros carros estavam em bom estado.
                {hasPrev && ` Período anterior: ${prev.total} check-ups, ${pct(prev.conversao)} viraram serviço.`}
              </p>
            </div>

            <div className="space-y-5">
              <div className="card space-y-3">
                <div>
                  <div className="font-bold text-steel-800">💰 Dinheiro na mesa</div>
                  <p className="text-xs text-steel-500">Orçamentos esperando o cliente. É o que dá para vender agora.</p>
                </div>
                <div className="text-3xl font-bold font-display text-steel-900">{fmtBRL(money.total)}</div>
                <MoneyRow label="Enviado e o cliente não abriu" value={money.naoAbriu} total={money.total} tone="bg-brand-300"
                  onClick={money.naoAbriu ? () => setStage('enviados') : undefined} />
                <MoneyRow label="Cliente viu e não respondeu" value={money.viuSemResposta} total={money.total} tone="bg-brand-500"
                  onClick={money.viuSemResposta ? () => setStage('abriu') : undefined} />
                <MoneyRow label="Pediu para lembrar depois" value={money.lembrar} total={money.total} tone="bg-steel-400" />
              </div>

              <div className="card space-y-2.5">
                <div>
                  <div className="font-bold text-steel-800">⏱️ Velocidade</div>
                  <p className="text-xs text-steel-500">Tempo típico de cada passo. Quanto mais rápido, mais o cliente aprova.</p>
                </div>
                {speed.map(s => (
                  <div key={s.label} className="flex items-center justify-between gap-3 text-sm">
                    <div className="min-w-0">
                      <div className="text-steel-800">{s.label}</div>
                      <div className="text-[11px] text-steel-400">{s.hint}</div>
                    </div>
                    <span className={`font-bold shrink-0 ${s.h != null && s.h > 48 ? 'text-alert-700' : 'text-steel-900'}`}>{fmtHours(s.h)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Carros parados na etapa escolhida */}
          {stage && (
            <div className="card !p-0 overflow-hidden ring-2 ring-brand-500">
              <div className="px-5 py-3 flex items-center justify-between gap-2 bg-brand-50 border-b border-brand-100">
                <div>
                  <div className="font-bold text-steel-800">{STUCK[stage]?.title ?? `Pararam em: ${STAGE_LABEL[stage]}`} · {stuck.length}</div>
                  <div className="text-xs text-steel-500">Mais antigo primeiro.</div>
                </div>
                <button onClick={() => setStage(null)} className="text-xs font-semibold text-steel-500 hover:text-steel-800">Fechar ✕</button>
              </div>
              {stuck.length === 0 ? (
                <div className="px-5 py-6 text-sm text-steel-500 text-center">Nenhum carro parado nesta etapa. 👏</div>
              ) : (
                <ul className="divide-y divide-steel-100">
                  {stuck.map(c => {
                    const d = daysAgo(sinceOf(c, stage));
                    const act = STUCK[stage];
                    const value = quotedOf(c);
                    return (
                      <li key={c.id} className="px-5 py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          {c.plate && <LicensePlate plate={c.plate} size="sm" />}
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-steel-800 truncate">{carOf(c)}{c.customer_name && <span className="font-normal text-steel-500"> · {c.customer_name}</span>}</div>
                            <div className="text-xs text-steel-500">
                              {modelOf(c.template_key).label}{value > 0 && ` · ${fmtBRL(value)}`}
                              {d != null && <span className={d >= 2 ? 'text-alert-700 font-semibold' : ''}> · {d === 0 ? 'hoje' : `há ${d} ${d === 1 ? 'dia' : 'dias'}`}</span>}
                            </div>
                          </div>
                        </div>
                        {act ? (
                          <button onClick={() => act.action === 'wa' ? onWhatsapp(c) : onOpen(c)}
                            className={`text-sm !py-2 shrink-0 ${act.action === 'wa' ? 'btn-primary !bg-[#25D366]' : 'btn-primary'}`}>
                            {act.cta} →
                          </button>
                        ) : (
                          <button onClick={() => onOpen(c)} className="btn-ghost text-sm !py-2 border border-steel-200 shrink-0">Ver →</button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}

          {/* Onde está perdendo */}
          <div className="card space-y-3">
            <div>
              <div className="font-bold text-steel-800">🎯 Onde você está perdendo</div>
              <p className="text-xs text-steel-500">Comparado com a meta de cada etapa. Comece pelo primeiro.</p>
            </div>
            {leaks.length === 0 ? (
              <div className="rounded-xl bg-signal-50 text-signal-800 text-sm px-3 py-2.5">✅ Todas as etapas estão na meta neste período.</div>
            ) : (
              <div className="grid md:grid-cols-3 gap-3">
                {leaks.slice(0, 3).map((l, i) => (
                  <div key={l.from} className={`rounded-xl border px-3 py-3 space-y-1.5 ${i === 0 ? 'border-alert-200 bg-alert-50' : 'border-steel-200'}`}>
                    <div className="text-sm font-semibold text-steel-800">{i === 0 && '1º · '}{l.title}</div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-bold font-display text-alert-700">{pct(l.taxa)}</span>
                      <span className="text-xs text-steel-500">meta {l.meta}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-steel-100 relative">
                      <div className="h-full rounded-full bg-alert-500" style={{ width: `${Math.min(100, l.taxa)}%` }} />
                      <div className="absolute -top-[3px] h-3 w-0.5 bg-steel-800" style={{ left: `${l.meta}%` }} title={`meta ${l.meta}%`} />
                    </div>
                    <div className="text-xs text-steel-600">{l.passou} de {l.entrou} passaram · batendo a meta seriam <strong>+{l.perdidos}</strong></div>
                    <div className="text-xs text-steel-700">👉 {l.action}</div>
                    <button onClick={() => setStage(l.from === 'feitos' ? 'feitos' : l.from)} className="text-xs font-semibold text-brand-600 hover:underline">Ver os carros →</button>
                  </div>
                ))}
              </div>
            )}
            <details className="text-xs text-steel-500">
              <summary className="cursor-pointer font-semibold">Todas as etapas e metas</summary>
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

          {/* Por tipo de check-up */}
          {type === 'todos' && (
            <div className="card !p-0 overflow-hidden">
              <div className="px-5 pt-4 pb-2">
                <div className="font-bold text-steel-800">Qual tipo de check-up vende mais</div>
                <p className="text-xs text-steel-500">Toque num tipo para ver o funil dele. Tipo sem check-up no período aparece em cinza.</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[600px]">
                  <thead className="text-[11px] uppercase tracking-wider text-steel-500 bg-steel-50">
                    <tr>
                      <th className="text-left px-5 py-2 font-semibold">Tipo</th>
                      <th className="text-right px-3 py-2 font-semibold">Feitos</th>
                      <th className="text-left px-3 py-2 font-semibold w-44">Viraram serviço</th>
                      <th className="text-right px-3 py-2 font-semibold">Aprovado</th>
                      <th className="text-right px-5 py-2 font-semibold">Ticket</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-steel-100">
                    {CHECKUP_MODELS.map(m => types.find(t => t.key === m.key) ?? { key: m.key, funnel: funnelOf([]) }).map(t => {
                      const best = types.every(o => (o.funnel.conversao ?? 0) <= (t.funnel.conversao ?? 0)) && (t.funnel.conversao ?? 0) > 0;
                      return (
                        <tr key={t.key} onClick={() => { setType(t.key); setStage(null); }}
                          className={`cursor-pointer hover:bg-brand-50 ${t.funnel.total === 0 ? 'text-steel-400' : ''}`}>
                          <td className="px-5 py-2.5 font-semibold text-steel-800">{modelOf(t.key).icon} {modelOf(t.key).label}{best && <span className="ml-1.5 text-[10px] font-bold text-signal-700">MELHOR</span>}</td>
                          <td className="px-3 py-2.5 text-right">{t.funnel.total}</td>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-2">
                              <div className="h-1.5 flex-1 rounded-full bg-steel-100 overflow-hidden">
                                <div className="h-full rounded-full bg-brand-500" style={{ width: `${t.funnel.conversao ?? 0}%` }} />
                              </div>
                              <span className="font-semibold w-10 text-right">{pct(t.funnel.conversao)}</span>
                            </div>
                          </td>
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
                rows={sells.map(i => ({ key: i.key, label: i.label, right: `${i.aprovado} de ${i.ofertado} · ${fmtBRL(i.valor)}`, pct: i.taxa, tone: 'good' as const }))} />
              <ItemList title="✋ Itens que o cliente mais deixa para depois" empty="Nenhuma recusa no período."
                note="Pediu para lembrar não é perda: vira retorno no CRM. Item muito recusado pode estar caro ou mal explicado — mande foto."
                rows={refused.map(i => ({ key: i.key, label: i.label, right: `${i.recusado + i.lembrar} de ${i.ofertado}${i.lembrar ? ` · ${i.lembrar} lembrar` : ''}`, pct: ((i.recusado + i.lembrar) / i.ofertado) * 100, tone: 'bad' as const }))} />
            </div>
          )}
        </>
      )}
    </section>
  );
}

const STAGE_LABEL = Object.fromEntries(STAGES.map(s => [s.key, s.label])) as Record<StageKey, string>;
const META_OF: Partial<Record<StageKey, number>> = Object.fromEntries(leaksOf(funnelOf([])).map(l => [l.to, l.meta]));

/* ─── Funil desenhado ───────────────────────────────────────────
   Cada etapa é um trapézio: a largura de cima é a quantidade da etapa, a de baixo a da próxima,
   então o funil afina de verdade. Uma cor (laranja da marca), mais escura no fim, onde entra o dinheiro.
   À direita: quantos passaram da etapa anterior (vermelho abaixo da meta). */
const SHADES = ['fill-brand-100', 'fill-brand-200', 'fill-brand-200', 'fill-brand-300', 'fill-brand-400', 'fill-brand-500', 'fill-brand-600'];

function FunnelSvg({ f, selected, onSelect }: { f: Funnel; selected: StageKey | null; onSelect: (k: StageKey) => void }) {
  // L = espaço à esquerda para o nome das etapas estreitas
  const W = 360, H = 46, GAP = 6, MAXW = 340, MINW = 40, R = 58, L = 70;
  const max = Math.max(1, f.total);
  const width = (n: number) => Math.max(MINW, (n / max) * MAXW);
  const [hover, setHover] = useState<StageKey | null>(null);
  const total = STAGES.length * (H + GAP);
  return (
    <svg viewBox={`${-L} 0 ${W + R + L} ${total}`} className="w-full h-auto select-none" role="img" aria-label="Funil de vendas do check-up">
      {STAGES.map((s, i) => {
        const n = f.counts[s.key];
        const next = STAGES[i + 1] ? f.counts[STAGES[i + 1].key] : n;
        const top = width(n), bot = width(Math.min(n, next));
        const cx = W / 2, y = i * (H + GAP);
        const pts = `${cx - top / 2},${y} ${cx + top / 2},${y} ${cx + bot / 2},${y + H} ${cx - bot / 2},${y + H}`;
        const prev = i > 0 ? f.counts[STAGES[i - 1].key] : null;
        const rate = prev ? (n / prev) * 100 : null;
        const meta = META_OF[s.key];
        const low = rate != null && meta != null && rate < meta;
        const on = selected === s.key || hover === s.key;
        const dark = i >= 5;
        const narrow = Math.min(top, bot) < 130;
        return (
          <g key={s.key} className="cursor-pointer" onClick={() => onSelect(s.key)}
            onMouseEnter={() => setHover(s.key)} onMouseLeave={() => setHover(null)}>
            <title>{`${s.label}: ${n} — ${s.hint}`}</title>
            {/* Área de toque maior que o desenho */}
            <rect x={-L} y={y} width={W + R + L} height={H + GAP} fill="transparent" />
            <polygon points={pts} strokeLinejoin="round"
              className={`${SHADES[i]} transition-all ${on ? 'stroke-steel-900' : 'stroke-white'}`} strokeWidth={on ? 2.5 : 2} />
            {narrow ? (
              <>
                {/* Etapa estreita: número dentro, nome ao lado (fora da forma) */}
                <text x={cx} y={y + 29} textAnchor="middle" fontSize="17" fontWeight={800}
                  className={dark ? 'fill-white' : 'fill-steel-900'}>{n}</text>
                <text x={cx - Math.max(top, bot) / 2 - 8} y={y + 28} textAnchor="end" fontSize="11" fontWeight={600}
                  className="fill-steel-700">{s.label}</text>
              </>
            ) : (
              <>
                <text x={cx} y={y + 20} textAnchor="middle" fontSize="17" fontWeight={800}
                  className={dark ? 'fill-white' : 'fill-steel-900'}>{n}</text>
                <text x={cx} y={y + 36} textAnchor="middle" fontSize="10.5" fontWeight={600}
                  className={dark ? 'fill-white' : 'fill-steel-700'}>{s.label}</text>
              </>
            )}
            {rate != null && (
              <text x={W + R - 4} y={y + 28} textAnchor="end" fontSize="13" fontWeight={700}
                className={low ? 'fill-alert-600' : 'fill-steel-500'}>{pct(rate)}</text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function MoneyRow({ label, value, total, tone, onClick }: { label: string; value: number; total: number; tone: string; onClick?: () => void }) {
  return (
    <button type="button" disabled={!onClick} onClick={onClick} className="w-full text-left space-y-1 disabled:cursor-default group">
      <div className="flex justify-between gap-2 text-sm">
        <span className="text-steel-700">{label}</span>
        <span className="font-semibold text-steel-900 shrink-0">{fmtBRL(value)}{onClick && <span className="ml-1 text-brand-600 group-hover:underline text-xs">ver →</span>}</span>
      </div>
      <div className="h-1.5 rounded-full bg-steel-100 overflow-hidden">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${total ? Math.max(value ? 3 : 0, (value / total) * 100) : 0}%` }} />
      </div>
    </button>
  );
}

function Chip({ on, onClick, children, dim }: { on: boolean; onClick: () => void; children: React.ReactNode; dim?: boolean }) {
  return (
    <button onClick={onClick}
      className={`px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition ${on ? 'bg-steel-900 text-white' : `bg-white border border-steel-200 hover:bg-steel-50 ${dim ? 'text-steel-400' : 'text-steel-600'}`}`}>
      {children}
    </button>
  );
}

function Stat({ label, value, sub, dark, delta }: {
  label: string; value: string; sub: string; dark?: boolean;
  /** Variação contra o período anterior */
  delta?: { v: number; unit: '%' | 'pts' } | null;
}) {
  const up = !!delta && delta.v > 0.5, down = !!delta && delta.v < -0.5;
  return (
    <div className={`card !p-4 ${dark ? '!bg-steel-900 text-white' : ''}`}>
      <div className="flex items-center justify-between gap-2">
        <span className={`text-xs font-semibold ${dark ? 'text-steel-300' : 'text-steel-500'}`}>{label}</span>
        {delta && (up || down) && (
          <span className={`text-[11px] font-bold rounded-md px-1.5 py-0.5 ${up ? 'bg-signal-100 text-signal-800' : 'bg-alert-100 text-alert-800'}`}
            title="Comparado com o período anterior">
            {up ? '↑' : '↓'} {Math.abs(Math.round(delta.v))}{delta.unit === '%' ? '%' : ' pts'}
          </span>
        )}
      </div>
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
