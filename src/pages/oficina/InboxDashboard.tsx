import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import WorkshopLayout from '@/components/layout/WorkshopLayout';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { fetchAll } from '@/lib/fetchAll';
import { useOperator } from '@/lib/operators';
import { fmtBRL, fmtPhone } from '@/components/os/osHelpers';
import PeriodPicker, { PRESETS, PREV_LABEL, usePeriod, type Preset } from '@/components/PeriodPicker';
import { useSectors } from '@/lib/inbox';
import {
  AUTHOR_LABEL, SPEED_BUCKETS, fmtMinutes, funnel, heatmap, median, people, perDay, speedBuckets, waitsOf,
  type Author, type StatChat, type StatMsg, type StatOs,
} from '@/lib/inboxStats';

/* ── Paleta (validada: claro sobre #fff e escuro sobre o cartão #151C24) ──────────
   Entidade → cor fixa em todo o painel: Cliente azul · Equipe laranja · IA verde-água · Celular amarelo.
   Contraste baixo de verde-água/amarelo no claro → sempre com rótulo visível (regra de alívio). */
const SERIES: Record<'cliente' | Author, string> = {
  cliente: 'bg-[#2a78d6] dark:bg-[#3987e5]',
  equipe: 'bg-[#eb6834] dark:bg-[#d95926]',
  ia: 'bg-[#1baf7a] dark:bg-[#199e70]',
  celular: 'bg-[#eda100] dark:bg-[#c98500]',
};
/** Status (bom → crítico) para a velocidade de resposta — sempre com rótulo */
const SPEED_COLOR: Record<string, string> = {
  b5: 'bg-[#0ca30c]', b15: 'bg-[#0ca30c]/70', b60: 'bg-[#fab219]', b240: 'bg-[#ec835a]', bmax: 'bg-[#d03b3b]', none: 'bg-[#d03b3b]/50',
};
/** Rampa sequencial azul (perto de zero → muito) para o mapa de calor */
const SEQ = ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95', '#0d366b'];
const WEEK = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

/** Período anterior do mesmo tamanho (para comparar) */
const prevRange = (r: { from: Date; to: Date }) => {
  const len = r.to.getTime() - r.from.getTime();
  return { from: new Date(r.from.getTime() - len), to: new Date(r.from) };
};

export default function InboxDashboard() {
  const { currentWorkshop } = useAuth();
  const wid = currentWorkshop?.id ?? null;
  const op = useOperator();
  const role = op.balcao ? op.session?.role ?? null : null;
  const isManager = !role || role === 'gestor';
  const period = usePeriod('inbox-painel-periodo', '7d');
  const { range, preset } = period;
  const sectors = useSectors(wid);
  const [sectorId, setSectorId] = useState<string>('all');

  const [msgs, setMsgs] = useState<StatMsg[] | null>(null);
  const [chats, setChats] = useState<StatChat[]>([]);
  const [os, setOs] = useState<StatOs[]>([]);

  useEffect(() => {
    if (!wid) return;
    let alive = true;
    setMsgs(null);
    const prev = prevRange(range);
    (async () => {
      // Mensagens do período + o anterior (comparação); conversas da oficina
      const [m, c] = await Promise.all([
        fetchAll<StatMsg>((a, b) => supabase.from('whatsapp_messages')
          .select('chat_id, from_me, sent_at, sent_by, sent_by_name, by_agent')
          .eq('workshop_id', wid).gte('sent_at', prev.from.toISOString()).lt('sent_at', range.to.toISOString())
          .order('sent_at').order('id').range(a, b)),
        fetchAll<unknown>((a, b) => supabase.from('whatsapp_chats')
          .select('id, name, phone, customer_id, sector_id, created_at, awaiting_since, status, archived_at, lead_at, lead_value, source, customer:customers(full_name)')
          .eq('workshop_id', wid).order('id').range(a, b)),
      ]);
      const chatRows = (c.data ?? []) as unknown as StatChat[];
      const ids = [...new Set(chatRows.map(x => x.customer_id).filter(Boolean))] as string[];
      let osRows: StatOs[] = [];
      for (let i = 0; i < ids.length; i += 150) {
        const { data } = await supabase.from('service_orders').select('id, customer_id, created_at, status, quote_status, price')
          .in('customer_id', ids.slice(i, i + 150)).gte('created_at', prev.from.toISOString());
        osRows = osRows.concat((data ?? []) as StatOs[]);
      }
      if (!alive) return;
      setChats(chatRows); setOs(osRows); setMsgs((m.data ?? []) as StatMsg[]);
    })();
    return () => { alive = false; };
  }, [wid, range]);

  /** Tudo o que o painel mostra, para um intervalo (atual ou anterior) */
  const build = (from: Date, to: Date) => {
    const live = chats.filter(c => !c.archived_at && (sectorId === 'all' || c.sector_id === sectorId));
    const liveIds = new Set(live.map(c => c.id));
    const inRange = (msgs ?? []).filter(m => liveIds.has(m.chat_id) && new Date(m.sent_at) >= from && new Date(m.sent_at) < to);
    const inbound = inRange.filter(m => !m.from_me);
    const chatIds = new Set(inbound.map(m => m.chat_id));
    const chatsIn = live.filter(c => chatIds.has(c.id));
    const first = new Map<string, number>();
    for (const m of inbound) if (!first.has(m.chat_id)) first.set(m.chat_id, new Date(m.sent_at).getTime());
    const waits = waitsOf(inRange);
    const times = waits.filter(w => w.minutes != null).map(w => w.minutes!);
    const fn = funnel(chatsIn, waits, os, first);
    return {
      inRange, waits, chatsIn, fn,
      conversas: chatsIn.length,
      novos: chatsIn.filter(c => new Date(c.created_at) >= from).length,
      recebidas: inbound.length,
      enviadas: inRange.length - inbound.length,
      mediana: median(times),
      em15: waits.length ? Math.round((waits.filter(w => w.minutes != null && w.minutes <= 15).length / waits.length) * 100) : null,
      semResposta: waits.filter(w => w.minutes == null).length,
    };
  };

  const cur = useMemo(() => (msgs ? build(range.from, range.to) : null), [msgs, chats, os, range, sectorId]); // eslint-disable-line react-hooks/exhaustive-deps
  const prv = useMemo(() => { if (!msgs) return null; const p = prevRange(range); return build(p.from, p.to); }, [msgs, chats, os, range, sectorId]); // eslint-disable-line react-hooks/exhaustive-deps

  // "Agora" não depende do período: quem está esperando resposta neste momento
  const waitingNow = useMemo(() => chats
    .filter(c => !c.archived_at && c.status === 'open' && c.awaiting_since && (sectorId === 'all' || c.sector_id === sectorId))
    .sort((a, b) => a.awaiting_since!.localeCompare(b.awaiting_since!)), [chats, sectorId]);

  const days = useMemo(() => (cur ? perDay(cur.inRange, range.from, range.to) : []), [cur, range]);
  const heat = useMemo(() => (cur ? heatmap(cur.inRange) : []), [cur]);
  const speed = useMemo(() => (cur ? speedBuckets(cur.waits) : []), [cur]);
  const team = useMemo(() => (cur ? people(cur.inRange, cur.waits) : []), [cur]);
  const authors = useMemo(() => {
    const out: Record<Author, number> = { equipe: 0, ia: 0, celular: 0 };
    for (const w of cur?.waits ?? []) if (w.by) out[w.by]++;
    return out;
  }, [cur]);
  const bySector = useMemo(() => sectors.active.map(s => {
    const list = chats.filter(c => !c.archived_at && c.sector_id === s.id);
    const ids = new Set(list.map(c => c.id));
    const ws = (cur?.waits ?? []).filter(w => ids.has(w.chat_id));
    return {
      s, abertas: list.filter(c => c.status === 'open').length,
      aguardando: list.filter(c => c.status === 'open' && c.awaiting_since).length,
      mediana: median(ws.filter(w => w.minutes != null).map(w => w.minutes!)),
    };
  }), [sectors.active, chats, cur]);

  if (!isManager) {
    return <WorkshopLayout><div className="card max-w-md mx-auto text-center py-10 text-steel-600">O painel do WhatsApp é do gestor.</div></WorkshopLayout>;
  }

  const prevLabel = PREV_LABEL[preset];

  return (
    <WorkshopLayout>
      <div className="max-w-6xl mx-auto space-y-5">
        {/* Cabeçalho + filtros numa linha */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">📊 Painel do WhatsApp</h1>
            <p className="text-xs text-steel-500 dark:text-steel-400 mt-0.5">Como a oficina está atendendo pelo WhatsApp — e quanto isso vira negócio.</p>
          </div>
          <Link to="/oficina/inbox" className="btn-secondary text-sm !py-2">💬 Abrir conversas</Link>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select className="input !py-2 text-sm sm:hidden" value={preset} onChange={e => period.setPreset(e.target.value as Preset)}>
            {PRESETS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
          <div className="hidden sm:block"><PeriodPicker period={period} /></div>
          {sectors.active.length > 0 && (
            <select className="input !py-2 !w-auto text-sm" value={sectorId} onChange={e => setSectorId(e.target.value)}>
              <option value="all">Todos os setores</option>
              {sectors.active.map(s => <option key={s.id} value={s.id}>{s.icon} {s.name}</option>)}
            </select>
          )}
        </div>

        {!cur || !prv ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{[1, 2, 3, 4].map(i => <div key={i} className="h-28 card animate-pulse" />)}</div>
        ) : (
          <>
            {/* ── Números principais ── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Kpi label="Conversas" value={String(cur.conversas)} delta={delta(cur.conversas, prv.conversas)} prev={prevLabel}
                sub={`${cur.novos} contato${cur.novos === 1 ? '' : 's'} novo${cur.novos === 1 ? '' : 's'} · ${cur.recebidas} mensagens`} />
              <Kpi label="1ª resposta (mediana)" value={fmtMinutes(cur.mediana)} prev={prevLabel}
                delta={cur.mediana != null && prv.mediana != null ? delta(cur.mediana, prv.mediana, true) : null}
                sub={cur.em15 != null ? `${cur.em15}% respondidas em até 15 min` : 'sem conversas no período'} />
              <Kpi label="Esperando resposta agora" value={String(waitingNow.length)}
                tone={waitingNow.length ? 'warn' : 'good'}
                sub={waitingNow[0] ? `mais antigo há ${fmtMinutes((Date.now() - new Date(waitingNow[0].awaiting_since!).getTime()) / 60000)}` : 'ninguém esperando 👏'} />
              <Kpi label="Viraram negócio" value={fmtBRL(cur.fn.approvedValue)} dark prev={prevLabel}
                delta={delta(cur.fn.approvedValue, prv.fn.approvedValue)}
                sub={`${cur.fn.steps[4].n} aprovaram · ${cur.fn.steps[3].n} viraram OS`} />
            </div>

            {/* ── Volume + quem respondeu ── */}
            <div className="grid lg:grid-cols-3 gap-3">
              <Card title="Conversas por dia" hint="Quantos clientes diferentes escreveram em cada dia" className="lg:col-span-2">
                <DayBars days={days} />
              </Card>
              <Card title="Quem respondeu" hint="Cada vez que o cliente esperava, quem deu a resposta">
                <AuthorsBar counts={authors} />
              </Card>
            </div>

            {/* ── Horários + velocidade ── */}
            <div className="grid lg:grid-cols-3 gap-3">
              <Card title="Quando os clientes chamam" hint="Mensagens de clientes por dia da semana e hora — onde precisa de gente no balcão" className="lg:col-span-2">
                <Heatmap grid={heat} />
              </Card>
              <Card title="Velocidade da resposta" hint="Quanto o cliente esperou até alguém responder">
                <SpeedBars buckets={speed} />
              </Card>
            </div>

            {/* ── Funil + equipe ── */}
            <div className="grid lg:grid-cols-2 gap-3">
              <Card title="Do WhatsApp ao serviço" hint="Conversas do período até a aprovação (OS do cliente aberta depois do contato)">
                <Funnel steps={cur.fn.steps} value={cur.fn.approvedValue} leadsValue={cur.fn.leadsValue} />
              </Card>
              <Card title="Quem atendeu" hint="Mensagens enviadas, conversas atendidas e tempo da resposta">
                <TeamTable rows={team} />
              </Card>
            </div>

            {/* ── Setores ── */}
            {bySector.length > 0 && sectorId === 'all' && (
              <Card title="Por setor" hint="Situação agora e tempo de resposta no período">
                <div className="grid sm:grid-cols-3 gap-2">
                  {bySector.map(b => (
                    <div key={b.s.id} className="rounded-xl border border-steel-200 dark:border-steel-700 p-3">
                      <p className="text-sm font-bold text-steel-800 dark:text-steel-100">{b.s.icon} {b.s.name}</p>
                      <div className="grid grid-cols-3 gap-1 mt-2 text-center">
                        <Mini label="abertas" value={String(b.abertas)} />
                        <Mini label="esperando" value={String(b.aguardando)} warn={b.aguardando > 0} />
                        <Mini label="resposta" value={fmtMinutes(b.mediana)} />
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* ── Esquecidos ── */}
            <Card title="⏳ Esperando há mais tempo" hint="Clientes sem resposta agora — o mais antigo primeiro">
              {waitingNow.length === 0 ? (
                <p className="text-sm text-steel-500 py-4 text-center">Ninguém esperando resposta. 👏</p>
              ) : (
                <ul className="divide-y divide-steel-100 dark:divide-steel-700">
                  {waitingNow.slice(0, 8).map(c => {
                    const min = (Date.now() - new Date(c.awaiting_since!).getTime()) / 60000;
                    return (
                      <li key={c.id} className="flex items-center gap-3 py-2.5">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-steel-800 dark:text-steel-100 truncate">{c.customer?.full_name ?? c.name ?? fmtPhone(c.phone)}</p>
                          <p className="text-xs text-steel-500">{c.customer_id ? 'cliente cadastrado' : 'sem cadastro'}{c.lead_at ? ' · 💰 interessado' : ''}</p>
                        </div>
                        <span className={`text-xs font-bold px-2 py-1 rounded-md ${min >= 30 ? 'bg-[#d03b3b]/10 text-[#b52f2f] dark:text-[#ff8a8a]' : 'bg-steel-100 dark:bg-steel-700 text-steel-600 dark:text-steel-300'}`}>
                          ⏱ {fmtMinutes(min)}
                        </span>
                        <Link to={`/oficina/inbox?conversa=${c.id}`} className="text-xs font-semibold text-brand-600 hover:underline shrink-0">Responder →</Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          </>
        )}
      </div>
    </WorkshopLayout>
  );
}

/* ── Peças ─────────────────────────────────────────────────────────────────── */

/** Variação % contra o período anterior; `lowerIsBetter` inverte a cor (tempo de resposta) */
function delta(cur: number, prev: number, lowerIsBetter = false) {
  if (!prev) return null;
  const pct = Math.round(((cur - prev) / prev) * 100);
  return { pct, good: lowerIsBetter ? pct <= 0 : pct >= 0 };
}

function Kpi({ label, value, sub, delta: d, prev, tone, dark }: {
  label: string; value: string; sub?: string; delta?: { pct: number; good: boolean } | null; prev?: string;
  tone?: 'warn' | 'good'; dark?: boolean;
}) {
  return (
    <div className={`card !p-4 ${dark ? '!bg-steel-900 text-white' : ''}`}>
      <p className={`text-[10px] font-bold uppercase tracking-widest ${dark ? 'text-steel-400' : 'text-steel-500 dark:text-steel-400'}`}>{label}</p>
      <p className={`text-2xl lg:text-3xl font-bold font-display mt-1 tabular-nums ${
        tone === 'warn' ? 'text-[#b52f2f] dark:text-[#ff8a8a]' : tone === 'good' ? 'text-[#087a08] dark:text-[#4fd14f]' : ''}`}>{value}</p>
      {d && (
        <p className={`text-[11px] font-semibold mt-0.5 ${d.good ? 'text-[#087a08] dark:text-[#4fd14f]' : 'text-[#b52f2f] dark:text-[#ff8a8a]'}`}>
          {d.pct >= 0 ? '▲' : '▼'} {Math.abs(d.pct)}% <span className={`font-normal ${dark ? 'text-steel-400' : 'text-steel-400'}`}>{prev ? `vs ${prev}` : ''}</span>
        </p>
      )}
      {sub && <p className={`text-[11px] mt-0.5 ${dark ? 'text-steel-300' : 'text-steel-500 dark:text-steel-400'}`}>{sub}</p>}
    </div>
  );
}

function Card({ title, hint, className = '', children }: { title: string; hint?: string; className?: string; children: React.ReactNode }) {
  return (
    <section className={`card !p-4 lg:!p-5 ${className}`}>
      <h2 className="text-sm font-bold text-steel-900 dark:text-steel-100">{title}</h2>
      {hint && <p className="text-[11px] text-steel-500 dark:text-steel-400 mt-0.5 mb-3">{hint}</p>}
      {children}
    </section>
  );
}

function Mini({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div>
      <p className={`text-base font-bold tabular-nums ${warn ? 'text-[#b52f2f] dark:text-[#ff8a8a]' : 'text-steel-800 dark:text-steel-100'}`}>{value}</p>
      <p className="text-[10px] text-steel-500">{label}</p>
    </div>
  );
}

/** Colunas por dia (uma série: clientes que escreveram), tooltip no toque/mouse */
function DayBars({ days }: { days: { day: Date; chats: number; inbound: number; outbound: number }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...days.map(d => d.chats));
  if (!days.length) return null;
  const many = days.length > 14;
  const h = hover != null ? days[hover] : null;
  return (
    <div>
      <div className="h-6 text-xs text-steel-600 dark:text-steel-300">
        {h ? <><b>{h.day.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })}</b> · {h.chats} conversa{h.chats === 1 ? '' : 's'} · {h.inbound} recebidas · {h.outbound} enviadas</>
          : <span className="text-steel-400">Passe o mouse (ou toque) numa coluna</span>}
      </div>
      <div className="relative h-44 flex items-end gap-[2px] border-b border-steel-200 dark:border-steel-700" onMouseLeave={() => setHover(null)}>
        {/* grade recessiva */}
        {[0.5, 1].map(f => <div key={f} className="absolute inset-x-0 border-t border-dashed border-steel-100 dark:border-steel-700/60" style={{ bottom: `${f * 100}%` }} />)}
        {days.map((d, i) => (
          <button key={i} type="button" onMouseEnter={() => setHover(i)} onClick={() => setHover(i)}
            className="relative flex-1 h-full flex items-end group" aria-label={`${d.day.toLocaleDateString('pt-BR')}: ${d.chats} conversas`}>
            <div className={`w-full rounded-t-[4px] ${SERIES.cliente} ${hover === i ? 'opacity-100' : hover != null ? 'opacity-50' : ''} transition`}
              style={{ height: `${(d.chats / max) * 100}%`, minHeight: d.chats ? 3 : 0 }} />
          </button>
        ))}
      </div>
      <div className="flex gap-[2px] mt-1">
        {days.map((d, i) => (
          <span key={i} className="flex-1 text-center text-[9px] text-steel-400 tabular-nums">
            {!many || i % Math.ceil(days.length / 10) === 0 ? (days.length <= 7 ? d.day.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '') : d.day.getDate()) : ''}
          </span>
        ))}
      </div>
      <p className="text-[10px] text-steel-400 mt-1">Maior dia: {max} conversa{max === 1 ? '' : 's'}</p>
    </div>
  );
}

/** Barra 100% empilhada: quem respondeu (com rótulo visível e legenda) */
function AuthorsBar({ counts }: { counts: Record<Author, number> }) {
  const total = counts.equipe + counts.ia + counts.celular;
  if (!total) return <p className="text-sm text-steel-500 py-6 text-center">Nenhuma resposta no período.</p>;
  const order: Author[] = ['equipe', 'ia', 'celular'];
  return (
    <div className="space-y-4">
      <div className="flex h-9 rounded-lg overflow-hidden gap-[2px]">
        {order.filter(a => counts[a]).map(a => (
          <div key={a} className={`${SERIES[a]} h-full first:rounded-l-lg last:rounded-r-lg`} style={{ width: `${(counts[a] / total) * 100}%` }}
            title={`${AUTHOR_LABEL[a]}: ${counts[a]} (${Math.round((counts[a] / total) * 100)}%)`} />
        ))}
      </div>
      <ul className="space-y-2">
        {order.map(a => (
          <li key={a} className="flex items-center gap-2 text-sm">
            <span className={`h-3 w-3 rounded-sm ${SERIES[a]}`} />
            <span className="flex-1 text-steel-700 dark:text-steel-200">{a === 'ia' ? 'Assistente virtual 🤖' : AUTHOR_LABEL[a]}</span>
            <span className="font-bold tabular-nums text-steel-900 dark:text-steel-100">{Math.round((counts[a] / total) * 100)}%</span>
            <span className="text-xs text-steel-400 w-10 text-right tabular-nums">{counts[a]}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Mapa de calor dia × hora (rampa sequencial azul), horário comercial em destaque */
function Heatmap({ grid }: { grid: number[][] }) {
  const [hover, setHover] = useState<{ d: number; h: number } | null>(null);
  const max = Math.max(1, ...grid.flat());
  const total = grid.flat().reduce((a, b) => a + b, 0);
  // Mostra 6h–22h (fora disso quase nunca tem movimento); se tiver, aparece no rodapé
  const hours = Array.from({ length: 17 }, (_, i) => i + 6);
  const outside = total - grid.reduce((s, row) => s + hours.reduce((a, h) => a + row[h], 0), 0);
  const peak = grid.flatMap((row, d) => row.map((n, h) => ({ d, h, n }))).sort((a, b) => b.n - a.n)[0];
  const step = (n: number) => (n === 0 ? null : SEQ[Math.min(SEQ.length - 1, Math.floor((n / max) * (SEQ.length - 1) + 0.0001))]);
  if (!total) return <p className="text-sm text-steel-500 py-6 text-center">Sem mensagens de clientes no período.</p>;
  const hv = hover ? grid[hover.d][hover.h] : null;
  return (
    <div>
      <div className="h-6 text-xs text-steel-600 dark:text-steel-300">
        {hover ? <><b>{WEEK[hover.d]} {String(hover.h).padStart(2, '0')}h</b> · {hv} mensage{hv === 1 ? 'm' : 'ns'} de clientes</>
          : peak && <>Pico: <b>{WEEK[peak.d]} às {peak.h}h</b> ({peak.n} mensagens)</>}
      </div>
      <div className="overflow-x-auto" onMouseLeave={() => setHover(null)}>
        <div className="min-w-[520px]">
          {[1, 2, 3, 4, 5, 6, 0].map(d => (
            <div key={d} className="flex items-center gap-[2px] mb-[2px]">
              <span className="w-9 text-[10px] text-steel-500 shrink-0">{WEEK[d]}</span>
              {hours.map(h => {
                const n = grid[d][h];
                const c = step(n);
                return (
                  <button key={h} type="button" onMouseEnter={() => setHover({ d, h })} onClick={() => setHover({ d, h })}
                    className={`flex-1 h-6 rounded-[4px] ${c ? '' : 'bg-steel-100 dark:bg-steel-700/50'} ${hover?.d === d && hover?.h === h ? 'ring-2 ring-steel-900 dark:ring-white' : ''}`}
                    style={c ? { backgroundColor: c } : undefined} aria-label={`${WEEK[d]} ${h}h: ${n}`} />
                );
              })}
            </div>
          ))}
          <div className="flex gap-[2px] pl-[38px]">
            {hours.map(h => <span key={h} className="flex-1 text-center text-[9px] text-steel-400 tabular-nums">{h % 3 === 0 ? `${h}h` : ''}</span>)}
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between mt-2 text-[10px] text-steel-400">
        <span className="flex items-center gap-1">menos {SEQ.map(c => <span key={c} className="h-2.5 w-4 rounded-sm" style={{ backgroundColor: c }} />)} mais</span>
        {outside > 0 && <span>{outside} mensage{outside === 1 ? 'm' : 'ns'} fora das 6h–22h</span>}
      </div>
    </div>
  );
}

/** Faixas de espera (cores de status + rótulo e % sempre visíveis) */
function SpeedBars({ buckets }: { buckets: ReturnType<typeof speedBuckets> }) {
  const total = buckets.reduce((a, b) => a + b.n, 0);
  if (!total) return <p className="text-sm text-steel-500 py-6 text-center">Sem conversas no período.</p>;
  const max = Math.max(1, ...buckets.map(b => b.n));
  return (
    <ul className="space-y-2">
      {buckets.map(b => (
        <li key={b.key} className="text-xs">
          <div className="flex justify-between mb-0.5">
            <span className="text-steel-600 dark:text-steel-300">{b.key === 'none' ? '⚠️ ' : ''}{b.label}</span>
            <span className="font-semibold tabular-nums text-steel-800 dark:text-steel-100">{b.n} <span className="text-steel-400 font-normal">· {Math.round((b.n / total) * 100)}%</span></span>
          </div>
          <div className="h-2.5 rounded-full bg-steel-100 dark:bg-steel-700/60 overflow-hidden">
            <div className={`h-full rounded-full ${SPEED_COLOR[b.key]}`} style={{ width: `${(b.n / max) * 100}%` }} />
          </div>
        </li>
      ))}
      <li className="text-[10px] text-steel-400 pt-1">{SPEED_BUCKETS.length - 1 ? `${total} esperas de clientes no período` : ''}</li>
    </ul>
  );
}

/** Funil em barras horizontais, % sobre o primeiro passo */
function Funnel({ steps, value, leadsValue }: { steps: { key: string; label: string; n: number }[]; value: number; leadsValue: number }) {
  const top = Math.max(1, steps[0].n);
  return (
    <div>
      <ul className="space-y-2.5">
        {steps.map((s, i) => (
          <li key={s.key}>
            <div className="flex justify-between text-xs mb-0.5">
              <span className="text-steel-700 dark:text-steel-200 font-semibold">{s.label}</span>
              <span className="tabular-nums text-steel-900 dark:text-steel-100 font-bold">
                {s.n} <span className="text-steel-400 font-normal">{i > 0 ? `· ${Math.round((s.n / top) * 100)}%` : ''}</span>
              </span>
            </div>
            <div className="h-6 rounded-md bg-steel-100 dark:bg-steel-700/60 overflow-hidden">
              <div className={`h-full rounded-md ${SERIES.cliente}`} style={{ width: `${Math.max(s.n ? 2 : 0, (s.n / top) * 100)}%`, opacity: 1 - i * 0.12 }} />
            </div>
          </li>
        ))}
      </ul>
      <div className="grid grid-cols-2 gap-2 mt-4">
        <div className="rounded-xl bg-[#0ca30c]/10 px-3 py-2">
          <p className="text-[10px] font-bold uppercase tracking-wide text-[#087a08] dark:text-[#4fd14f]">Aprovado</p>
          <p className="text-lg font-bold text-steel-900 dark:text-steel-100 tabular-nums">{fmtBRL(value)}</p>
        </div>
        <div className="rounded-xl bg-steel-100 dark:bg-steel-700/50 px-3 py-2">
          <p className="text-[10px] font-bold uppercase tracking-wide text-steel-500">Interessados (estimado)</p>
          <p className="text-lg font-bold text-steel-900 dark:text-steel-100 tabular-nums">{fmtBRL(leadsValue)}</p>
        </div>
      </div>
    </div>
  );
}

/** Ranking: cada pessoa (e a IA / o celular) */
function TeamTable({ rows }: { rows: ReturnType<typeof people> }) {
  if (!rows.length) return <p className="text-sm text-steel-500 py-6 text-center">Ninguém respondeu no período.</p>;
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-[10px] uppercase tracking-wide text-steel-400 text-left">
          <th className="font-semibold pb-2">Quem</th>
          <th className="font-semibold pb-2 text-right">Conversas</th>
          <th className="font-semibold pb-2 text-right">Mensagens</th>
          <th className="font-semibold pb-2 text-right">Resposta</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-steel-100 dark:divide-steel-700">
        {rows.map(r => (
          <tr key={`${r.author}:${r.name}`}>
            <td className="py-2">
              <span className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-sm shrink-0 ${SERIES[r.author]}`} />
                <span className="font-semibold text-steel-800 dark:text-steel-100 truncate">{r.author === 'ia' ? 'Assistente virtual 🤖' : r.name}</span>
              </span>
            </td>
            <td className="py-2 text-right tabular-nums text-steel-700 dark:text-steel-200">{r.chats}</td>
            <td className="py-2 text-right tabular-nums text-steel-700 dark:text-steel-200">{r.msgs}</td>
            <td className="py-2 text-right tabular-nums font-semibold text-steel-900 dark:text-steel-100">{fmtMinutes(r.median)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
