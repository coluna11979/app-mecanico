/**
 * Painel do WhatsApp — cálculos puros (sem banco). A tela busca mensagens, conversas e OS do
 * período e tudo sai daqui: volume, tempo de resposta, quem respondeu, horários, funil.
 *
 * Tempo de resposta: cada vez que o cliente escreve depois de uma resposta nossa (ou pela
 * primeira vez) abre uma "espera"; ela fecha na próxima mensagem nossa (equipe, IA ou celular).
 */

export type StatMsg = {
  chat_id: string; from_me: boolean; sent_at: string;
  sent_by: string | null; sent_by_name: string | null; by_agent: boolean | null;
};
export type StatChat = {
  id: string; name: string | null; phone: string; customer_id: string | null; sector_id: string | null;
  created_at: string; awaiting_since: string | null; status: string; archived_at: string | null;
  lead_at: string | null; lead_value: number | null; source: string | null;
  customer?: { full_name: string } | null;
};
export type StatOs = {
  id: string; customer_id: string | null; created_at: string; status: string; quote_status: string | null; price: number | null;
};

/** Quem mandou a mensagem da oficina */
export type Author = 'equipe' | 'ia' | 'celular';
export const authorOf = (m: StatMsg): Author =>
  m.by_agent || /assistente virtual|🤖/i.test(m.sent_by_name ?? '') ? 'ia'
    : m.sent_by ? 'equipe' : 'celular';
export const AUTHOR_LABEL: Record<Author, string> = { equipe: 'Equipe', ia: 'Assistente virtual', celular: 'Celular da oficina' };

export type Wait = { chat_id: string; start: number; end: number | null; minutes: number | null; by: Author | null; byName: string | null };

/** Esperas do cliente (início → nossa resposta) a partir das mensagens ordenadas por conversa */
export function waitsOf(msgs: StatMsg[]): Wait[] {
  const byChat = new Map<string, StatMsg[]>();
  for (const m of msgs) (byChat.get(m.chat_id) ?? byChat.set(m.chat_id, []).get(m.chat_id)!).push(m);
  const out: Wait[] = [];
  for (const [chat_id, list] of byChat) {
    list.sort((a, b) => a.sent_at.localeCompare(b.sent_at));
    let open: Wait | null = null;
    for (const m of list) {
      const t = new Date(m.sent_at).getTime();
      if (!m.from_me) {
        if (!open) { open = { chat_id, start: t, end: null, minutes: null, by: null, byName: null }; out.push(open); }
      } else if (open) {
        open.end = t;
        open.minutes = Math.max(0, (t - open.start) / 60000);
        open.by = authorOf(m);
        open.byName = m.sent_by_name;
        open = null;
      }
    }
  }
  return out;
}

export const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

/** Faixas de velocidade da resposta (a última é quem ficou sem resposta) */
export const SPEED_BUCKETS = [
  { key: 'b5', label: 'até 5 min', max: 5 },
  { key: 'b15', label: '5–15 min', max: 15 },
  { key: 'b60', label: '15 min–1 h', max: 60 },
  { key: 'b240', label: '1–4 h', max: 240 },
  { key: 'bmax', label: 'mais de 4 h', max: Infinity },
  { key: 'none', label: 'sem resposta', max: null },
] as const;

export function speedBuckets(waits: Wait[]) {
  const counts = SPEED_BUCKETS.map(b => ({ ...b, n: 0 }));
  for (const w of waits) {
    if (w.minutes == null) { counts[counts.length - 1].n++; continue; }
    const i = SPEED_BUCKETS.findIndex(b => b.max != null && w.minutes! <= b.max);
    counts[i].n++;
  }
  return counts;
}

/** Mapa de calor: [dia da semana 0=dom][hora] = mensagens de clientes */
export function heatmap(msgs: StatMsg[]) {
  const grid = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
  for (const m of msgs) if (!m.from_me) { const d = new Date(m.sent_at); grid[d.getDay()][d.getHours()]++; }
  return grid;
}

/** Conversas (com mensagem do cliente) por dia, de `from` até `to` */
export function perDay(msgs: StatMsg[], from: Date, to: Date) {
  const days: { day: Date; chats: Set<string>; inbound: number; outbound: number }[] = [];
  for (let d = new Date(from); d < to; d.setDate(d.getDate() + 1)) {
    const x = new Date(d); x.setHours(0, 0, 0, 0);
    days.push({ day: x, chats: new Set(), inbound: 0, outbound: 0 });
  }
  const idx = (iso: string) => {
    const d = new Date(iso); d.setHours(0, 0, 0, 0);
    return days.findIndex(x => x.day.getTime() === d.getTime());
  };
  for (const m of msgs) {
    const i = idx(m.sent_at); if (i < 0) continue;
    if (m.from_me) days[i].outbound++; else { days[i].inbound++; days[i].chats.add(m.chat_id); }
  }
  return days.map(d => ({ day: d.day, chats: d.chats.size, inbound: d.inbound, outbound: d.outbound }));
}

/** Ranking de quem respondeu: mensagens, conversas e tempo mediano da resposta */
export function people(msgs: StatMsg[], waits: Wait[]) {
  const rows = new Map<string, { name: string; author: Author; msgs: number; chats: Set<string>; times: number[] }>();
  const keyOf = (m: { by: Author | null; byName: string | null }) => `${m.by}:${m.by === 'equipe' ? m.byName ?? 'Equipe' : m.by}`;
  for (const m of msgs) {
    if (!m.from_me) continue;
    const by = authorOf(m);
    const k = keyOf({ by, byName: m.sent_by_name });
    const r = rows.get(k) ?? { name: by === 'equipe' ? m.sent_by_name ?? 'Equipe' : AUTHOR_LABEL[by], author: by, msgs: 0, chats: new Set(), times: [] };
    r.msgs++; r.chats.add(m.chat_id); rows.set(k, r);
  }
  for (const w of waits) {
    if (w.minutes == null || !w.by) continue;
    rows.get(keyOf(w))?.times.push(w.minutes);
  }
  return [...rows.values()]
    .map(r => ({ name: r.name, author: r.author, msgs: r.msgs, chats: r.chats.size, median: median(r.times), answered: r.times.length }))
    .sort((a, b) => b.chats - a.chats || b.msgs - a.msgs);
}

/** "3 min", "1 h 20", "2 d" */
export function fmtMinutes(min: number | null) {
  if (min == null) return '—';
  if (min < 1) return '< 1 min';
  if (min < 60) return `${Math.round(min)} min`;
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  if (h < 24) return m ? `${h} h ${m}` : `${h} h`;
  return `${Math.round(h / 24)} d`;
}

/** Funil: conversas → respondidas → interessados → orçamento (OS depois do contato) → aprovado */
export function funnel(chatsInPeriod: StatChat[], waits: Wait[], os: StatOs[], firstContact: Map<string, number>) {
  const answered = new Set(waits.filter(w => w.minutes != null).map(w => w.chat_id));
  const leads = chatsInPeriod.filter(c => c.lead_at);
  // OS do cliente aberta depois do primeiro contato no período
  const osAfter = (c: StatChat) => os.filter(o => c.customer_id && o.customer_id === c.customer_id
    && new Date(o.created_at).getTime() >= (firstContact.get(c.id) ?? Infinity) - 3600000);
  const withOs = chatsInPeriod.filter(c => osAfter(c).length > 0);
  const approvedOs = withOs.flatMap(c => osAfter(c)).filter(o => ['approved', 'in_progress', 'completed'].includes(o.status) && !o.quote_status);
  const approvedChats = new Set(withOs.filter(c => osAfter(c).some(o => approvedOs.includes(o))).map(c => c.id));
  return {
    steps: [
      { key: 'conversas', label: 'Conversaram', n: chatsInPeriod.length },
      { key: 'respondidas', label: 'Foram respondidos', n: chatsInPeriod.filter(c => answered.has(c.id)).length },
      { key: 'interessados', label: 'Marcados interessados', n: leads.length },
      { key: 'orcamento', label: 'Viraram OS / orçamento', n: withOs.length },
      { key: 'aprovado', label: 'Aprovaram', n: approvedChats.size },
    ],
    approvedValue: approvedOs.reduce((s, o) => s + Number(o.price ?? 0), 0),
    leadsValue: leads.reduce((s, c) => s + Number(c.lead_value ?? 0), 0),
  };
}
