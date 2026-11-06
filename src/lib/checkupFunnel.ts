/**
 * Funil de vendas do Check-up — cálculos puros (sem banco).
 * Cada check-up do período anda pelas etapas:
 *   Feitos → Terminados → Encontrou o que fazer → Orçamento enviado → Cliente abriu → Aprovou → Serviço feito
 * Check-up refeito (replaced_by) não conta: quem conta é o novo.
 */
import { itemQuote, modelOf, type CheckupModelKey } from '@/lib/checkup';
import type { PanelCheckup } from '@/lib/checkupPanel';

export type StageKey = 'feitos' | 'terminados' | 'oportunidade' | 'enviados' | 'abriu' | 'aprovou' | 'feito';

export const STAGES: { key: StageKey; label: string; hint: string }[] = [
  { key: 'feitos',       label: 'Check-ups feitos',        hint: 'Check-ups abertos no período' },
  { key: 'terminados',   label: 'Inspeção terminada',      hint: 'O mecânico terminou a inspeção' },
  { key: 'oportunidade', label: 'Encontrou o que fazer',   hint: 'Tem item em Atenção ou Urgente' },
  { key: 'enviados',     label: 'Orçamento enviado',       hint: 'Orçamento com preço enviado ao cliente' },
  { key: 'abriu',        label: 'Cliente abriu o link',    hint: 'O cliente abriu o orçamento' },
  { key: 'aprovou',      label: 'Aprovou',                 hint: 'Aprovou ao menos um item (virou OS)' },
  { key: 'feito',        label: 'Serviço feito',           hint: 'A OS aprovada foi concluída' },
];

type Ck = PanelCheckup;
const flagged = (c: Ck) => c.items.filter(i => i.status === 'warn' || i.status === 'urgent');
const priced = (c: Ck) => flagged(c).filter(i => itemQuote(i) > 0);
const approvedItems = (c: Ck) => flagged(c).filter(i => i.customer_decision === 'approve' && itemQuote(i) > 0);
const sum = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) * 100) / 100;

/** Em que etapas o check-up chegou */
export function reached(c: Ck): Record<StageKey, boolean> {
  const terminados = c.status === 'completed';
  const oportunidade = terminados && flagged(c).length > 0;
  const enviados = oportunidade && !!c.quote_sent_at && priced(c).length > 0;
  const aprovou = enviados && (!!c.sale_os_id || approvedItems(c).length > 0);
  const abriu = enviados && (!!c.customer_viewed_at || aprovou);
  const feito = aprovou && c.sale_os?.status === 'completed';
  return { feitos: true, terminados, oportunidade, enviados, abriu, aprovou, feito };
}

export type Funnel = {
  total: number;
  counts: Record<StageKey, number>;
  /** R$ orçado (enviados), aprovado e já feito */
  orcado: number; aprovado: number; executado: number;
  ticket: number;
  /** Aprovou ÷ check-ups feitos */
  conversao: number | null;
  /** Cliente pediu para lembrar depois: venda futura */
  lembrar: { n: number; valor: number };
  recusou: number;
  /** Para cobrar perda só de quem já teve tempo: check-up com 1 dia+ e aprovação com 7 dias+ */
  matured: { feitos: number; terminados: number; aprovou: number; feito: number };
};

const DAY = 86400000;

export function funnelOf(list: Ck[]): Funnel {
  const counts = Object.fromEntries(STAGES.map(s => [s.key, 0])) as Record<StageKey, number>;
  let orcado = 0, aprovado = 0, executado = 0, lembrarN = 0, lembrarV = 0, recusou = 0;
  const matured = { feitos: 0, terminados: 0, aprovou: 0, feito: 0 };
  const now = Date.now();
  for (const c of list) {
    const r = reached(c);
    if (now - new Date(c.created_at).getTime() >= DAY) { matured.feitos++; if (r.terminados) matured.terminados++; }
    if (r.aprovou && c.customer_responded_at && now - new Date(c.customer_responded_at).getTime() >= 7 * DAY) {
      matured.aprovou++; if (r.feito) matured.feito++;
    }
    for (const s of STAGES) if (r[s.key]) counts[s.key]++;
    if (r.enviados) orcado += sum(priced(c).map(itemQuote));
    const ap = sum(approvedItems(c).map(itemQuote));
    if (r.aprovou) aprovado += ap;
    if (r.feito) executado += ap;
    const rem = flagged(c).filter(i => i.customer_decision === 'remind');
    if (rem.length) { lembrarN++; lembrarV += sum(rem.map(itemQuote)); }
    if (r.enviados && c.customer_responded_at && !r.aprovou) recusou++;
  }
  return {
    total: list.length, counts,
    orcado: sum([orcado]), aprovado: sum([aprovado]), executado: sum([executado]),
    ticket: counts.aprovou ? Math.round((aprovado / counts.aprovou) * 100) / 100 : 0,
    conversao: list.length ? (counts.aprovou / list.length) * 100 : null,
    lembrar: { n: lembrarN, valor: sum([lembrarV]) }, recusou, matured,
  };
}

/* ─── Onde está perdendo ───────────────────────────────────────
   Cada passagem tem uma meta (o que uma oficina bem organizada consegue).
   "Encontrou o que fazer" não é perda: o carro pode estar bom. */
type Leak = {
  from: StageKey; to: StageKey; meta: number;
  title: string; action: string;
};
const LEAKS: Leak[] = [
  { from: 'feitos', to: 'terminados', meta: 90, title: 'Check-ups parados há mais de 1 dia',
    action: 'Cobre o mecânico pelo “Atenção agora” do Painel. Check-up parado esfria o cliente.' },
  { from: 'oportunidade', to: 'enviados', meta: 90, title: 'Encontrou problema e não mandou orçamento',
    action: 'Coloque o preço e envie no mesmo dia, com o carro ainda na oficina. Use a busca de serviço + peças.' },
  { from: 'enviados', to: 'abriu', meta: 80, title: 'Cliente não abriu o orçamento',
    action: 'Mande o link de novo pelo WhatsApp em 24 h, com uma frase sobre o item urgente.' },
  { from: 'abriu', to: 'aprovou', meta: 40, title: 'Cliente viu e não aprovou',
    action: 'Ligue para quem viu. Mostre as fotos dos urgentes e ofereça fazer só o urgente agora.' },
  { from: 'aprovou', to: 'feito', meta: 90, title: 'Aprovou há mais de 7 dias e o serviço não foi feito',
    action: 'Confirme o dia na Agenda e lembre o cliente na véspera.' },
];

export type LeakResult = Leak & {
  entrou: number; passou: number;
  /** % que passou */
  taxa: number;
  /** Carros a mais que teriam passado se batesse a meta */
  perdidos: number;
  ok: boolean;
};

export function leaksOf(f: Funnel): LeakResult[] {
  return LEAKS.map(l => {
    // Terminar e executar levam tempo: só conta quem já teve prazo
    const m = l.from === 'feitos' ? [f.matured.feitos, f.matured.terminados]
      : l.from === 'aprovou' ? [f.matured.aprovou, f.matured.feito] : null;
    const entrou = m ? m[0] : f.counts[l.from], passou = m ? m[1] : f.counts[l.to];
    const taxa = entrou ? (passou / entrou) * 100 : 0;
    const perdidos = entrou ? Math.max(0, Math.round(entrou * l.meta / 100 - passou)) : 0;
    return { ...l, entrou, passou, taxa, perdidos, ok: !entrou || taxa >= l.meta };
  });
}

/** Maior vazamento com motivo real (pelo número de carros perdidos acima da meta) */
export const worstLeaks = (f: Funnel) => leaksOf(f).filter(l => !l.ok && l.perdidos > 0).sort((a, b) => b.perdidos - a.perdidos);

/* ─── Por tipo de check-up ─────────────────────────────────────── */
export const typeOf = (c: Ck): CheckupModelKey => modelOf(c.template_key).key;

export function byType(list: Ck[]) {
  const groups = new Map<CheckupModelKey, Ck[]>();
  for (const c of list) groups.set(typeOf(c), [...(groups.get(typeOf(c)) ?? []), c]);
  return [...groups.entries()].map(([key, cs]) => ({ key, funnel: funnelOf(cs) }))
    .sort((a, b) => b.funnel.total - a.funnel.total);
}

/* ─── Itens: o que mais vende e o que mais recusam ─────────────── */
export type ItemStat = { key: string; label: string; ofertado: number; aprovado: number; recusado: number; lembrar: number; taxa: number; valor: number };

export function itemStats(list: Ck[]): ItemStat[] {
  const map = new Map<string, ItemStat>();
  for (const c of list) {
    if (!c.customer_responded_at) continue;
    for (const i of flagged(c)) {
      if (itemQuote(i) <= 0 || !i.customer_decision) continue;
      const key = i.item_key ?? i.label ?? '?';
      const s = map.get(key) ?? { key, label: i.label ?? key, ofertado: 0, aprovado: 0, recusado: 0, lembrar: 0, taxa: 0, valor: 0 };
      s.ofertado++;
      if (i.customer_decision === 'approve') { s.aprovado++; s.valor += itemQuote(i); }
      else if (i.customer_decision === 'remind') s.lembrar++;
      else s.recusado++;
      map.set(key, s);
    }
  }
  return [...map.values()].map(s => ({ ...s, taxa: (s.aprovado / s.ofertado) * 100 }));
}
