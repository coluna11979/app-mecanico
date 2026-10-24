import { supabase } from '@/lib/supabase';

/**
 * Recomendação vinda do check-up ("Me lembra depois") guarda um texto assim:
 *   "<item> — <observação> (cliente pediu para lembrar em 23/11)"
 * Para virar item da OS, o nome é só a primeira parte.
 */
export function recommendationName(description: string): string {
  const noRemind = description.replace(/\s*\(cliente pediu para lembrar em \d{2}\/\d{2}\)\s*$/i, '').trim();
  return (noRemind.split(' — ')[0] || noRemind).trim();
}

export type RecommendationQuote = { name: string; price: number | null };

/**
 * Nome do item e o valor que foi enviado ao cliente no orçamento do check-up (serviço + peças).
 * Recomendação anotada à mão (sem check-up) volta só com o nome, sem valor.
 */
export async function recommendationQuote(
  rec: { description: string; customer_id: string | null; vehicle_id: string | null; source?: string | null },
): Promise<RecommendationQuote> {
  const label = recommendationName(rec.description);
  if (!rec.customer_id || rec.source !== 'checkup') return { name: label, price: null };

  const { data } = await supabase.from('checkup_items')
    .select('label, quote_service, quote_labor, quote_parts, checkup:vehicle_checkups!inner(customer_id, vehicle_id, completed_at)')
    .eq('label', label).eq('customer_decision', 'remind')
    .eq('checkup.customer_id', rec.customer_id)
    .limit(20);

  type Row = { label: string | null; quote_service: string | null; quote_labor: number | null; quote_parts: number | null;
    checkup: { vehicle_id: string | null; completed_at: string | null } | { vehicle_id: string | null; completed_at: string | null }[] | null };
  const rows = ((data ?? []) as unknown as Row[]).map(r => ({ ...r, checkup: Array.isArray(r.checkup) ? r.checkup[0] ?? null : r.checkup }));
  // Mesmo veículo primeiro; entre eles, o check-up mais recente
  const best = rows
    .filter(r => !rec.vehicle_id || !r.checkup?.vehicle_id || r.checkup.vehicle_id === rec.vehicle_id)
    .sort((a, b) => (b.checkup?.completed_at ?? '').localeCompare(a.checkup?.completed_at ?? ''))[0];
  if (!best) return { name: label, price: null };

  const total = Math.round((Number(best.quote_labor ?? 0) + Number(best.quote_parts ?? 0)) * 100) / 100;
  return { name: (best.quote_service?.trim() || best.label?.trim() || label), price: total > 0 ? total : null };
}
