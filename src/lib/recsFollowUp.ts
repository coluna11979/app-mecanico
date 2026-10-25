import { supabase } from '@/lib/supabase';
import { recommendationName } from '@/lib/recommendations';

/** Recomendação pendente (serviço que o cliente pediu para lembrar) pronta para a oficina cobrar */
export type RecFollow = {
  id: string; customer_id: string | null; vehicle_id: string | null;
  description: string; recommended_at: string; source: string;
  customer: { full_name: string; phone: string | null } | null;
  vehicle: { make: string | null; model: string | null; plate: string | null } | null;
  /** Nome limpo do serviço (sem o "(cliente pediu para lembrar em …)") */
  name: string;
  /** Valor que foi orçado ao cliente no check-up (null = não se sabe) */
  price: number | null;
  /** Data combinada para lembrar (a que o cliente pediu) */
  remind: Date | null;
};

/** "… (cliente pediu para lembrar em 24/11)" → 24/11 do ano certo (o próximo, se já passou da data da recomendação) */
export function remindDateOf(description: string, recommendedAt: string): Date | null {
  const m = description.match(/lembrar em (\d{2})\/(\d{2})/i);
  if (!m) return null;
  const base = new Date(recommendedAt);
  let d = new Date(base.getFullYear(), Number(m[2]) - 1, Number(m[1]));
  if (d.getTime() < base.getTime() - 86400000) d = new Date(base.getFullYear() + 1, Number(m[2]) - 1, Number(m[1]));
  return d;
}

/** Dias até a data de lembrar (negativo = já passou). null = sem data */
export function daysToRemind(r: Pick<RecFollow, 'remind'>, now = new Date()): number | null {
  if (!r.remind) return null;
  const a = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((r.remind.getTime() - a) / 86400000);
}

/** Recomendações pendentes da oficina, com o valor orçado e a data de lembrar. Mais urgentes primeiro. */
export async function loadRecFollowUps(wid: string): Promise<RecFollow[]> {
  const { data } = await supabase.from('service_recommendations')
    .select('id, customer_id, vehicle_id, description, recommended_at, source, customer:customers(full_name, phone), vehicle:vehicles(make, model, plate)')
    .eq('workshop_id', wid).eq('status', 'pending').order('recommended_at', { ascending: false }).limit(500);
  const rows = (data ?? []) as unknown as RecFollow[];
  if (!rows.length) return [];

  // Valor enviado no orçamento do check-up (uma consulta para todas)
  const customerIds = [...new Set(rows.map(r => r.customer_id).filter(Boolean))] as string[];
  type Q = { label: string | null; quote_labor: number | null; quote_parts: number | null;
    checkup: { customer_id: string | null; vehicle_id: string | null; completed_at: string | null } | { customer_id: string | null; vehicle_id: string | null; completed_at: string | null }[] | null };
  let quotes: (Omit<Q, 'checkup'> & { checkup: { customer_id: string | null; vehicle_id: string | null; completed_at: string | null } | null })[] = [];
  if (customerIds.length) {
    const { data: q } = await supabase.from('checkup_items')
      .select('label, quote_labor, quote_parts, checkup:vehicle_checkups!inner(customer_id, vehicle_id, completed_at)')
      .eq('customer_decision', 'remind').in('checkup.customer_id', customerIds).limit(2000);
    quotes = ((q ?? []) as unknown as Q[]).map(x => ({ ...x, checkup: Array.isArray(x.checkup) ? x.checkup[0] ?? null : x.checkup }));
  }

  const out = rows.map(r => {
    const name = recommendationName(r.description);
    const best = r.source === 'checkup'
      ? quotes
          .filter(x => x.label?.trim() === name && x.checkup?.customer_id === r.customer_id
            && (!r.vehicle_id || !x.checkup?.vehicle_id || x.checkup.vehicle_id === r.vehicle_id))
          .sort((a, b) => (b.checkup?.completed_at ?? '').localeCompare(a.checkup?.completed_at ?? ''))[0]
      : undefined;
    const total = best ? Math.round((Number(best.quote_labor ?? 0) + Number(best.quote_parts ?? 0)) * 100) / 100 : 0;
    return { ...r, name, price: total > 0 ? total : null, remind: remindDateOf(r.description, r.recommended_at) } as RecFollow;
  });

  // Quem tem data primeiro (a mais próxima/vencida no topo); sem data por último, da mais antiga para a mais nova
  return out.sort((a, b) => {
    if (a.remind && b.remind) return a.remind.getTime() - b.remind.getTime();
    if (a.remind) return -1;
    if (b.remind) return 1;
    return a.recommended_at.localeCompare(b.recommended_at);
  });
}

/** Tudo o que um cliente pediu para lembrar: um contato só para fechar junto */
export type ClientRecs = {
  key: string;
  customer_id: string | null;
  customer: RecFollow['customer'];
  items: RecFollow[];
  /** Soma do que foi orçado (itens sem valor não entram) */
  total: number;
  /** Itens sem valor orçado */
  withoutPrice: number;
  /** Data de lembrar mais próxima (ou vencida) entre os itens */
  nextRemind: Date | null;
  /** Veículos citados (um cliente pode ter mais de um carro) */
  cars: string[];
};

const carOfRec = (r: RecFollow) => [[r.vehicle?.make, r.vehicle?.model].filter(Boolean).join(' '), r.vehicle?.plate].filter(Boolean).join(' · ');

/** Agrupa por cliente. Quem tem data mais próxima/vencida vem primeiro. */
export function groupByClient(list: RecFollow[]): ClientRecs[] {
  const map = new Map<string, ClientRecs>();
  for (const r of list) {
    const key = r.customer_id ?? `avulso-${r.id}`;
    const g = map.get(key) ?? { key, customer_id: r.customer_id, customer: r.customer, items: [], total: 0, withoutPrice: 0, nextRemind: null, cars: [] };
    g.items.push(r);
    if (r.price) g.total += r.price; else g.withoutPrice += 1;
    if (r.remind && (!g.nextRemind || r.remind < g.nextRemind)) g.nextRemind = r.remind;
    const c = carOfRec(r);
    if (c && !g.cars.includes(c)) g.cars.push(c);
    map.set(key, g);
  }
  return [...map.values()].sort((a, b) => {
    if (a.nextRemind && b.nextRemind) return a.nextRemind.getTime() - b.nextRemind.getTime();
    if (a.nextRemind) return -1;
    if (b.nextRemind) return 1;
    return a.items[0].recommended_at.localeCompare(b.items[0].recommended_at);
  });
}
