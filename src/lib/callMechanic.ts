/**
 * "Chamar mecânico" a partir da OS (Caixa): monta a demanda do marketplace já preenchida
 * com os serviços da OS e sugere quanto pagar ao mecânico autônomo.
 *
 * Sugestão = (mão de obra × %) + adicional de autônomo + deslocamento
 * - % da mão de obra: a fatia do serviço que vai para quem executa (padrão 40%)
 * - adicional de autônomo: ele não tem férias, 13º, FGTS nem encargos de CLT (padrão 20% sobre a fatia)
 * - deslocamento: valor fixo para ir até a oficina (padrão R$ 30)
 *
 * Os parâmetros ficam salvos por oficina neste navegador — cada oficina ajusta uma vez.
 */

import { supabase } from '@/lib/supabase';

export type CallMechanicParams = { laborPercent: number; autonomoPercent: number; travel: number };

export const DEFAULT_CALL_PARAMS: CallMechanicParams = { laborPercent: 40, autonomoPercent: 20, travel: 30 };

const paramsKey = (wid: string) => `call_mechanic_params_${wid}`;

export function loadCallParams(wid: string): CallMechanicParams {
  try {
    const raw = localStorage.getItem(paramsKey(wid));
    if (!raw) return DEFAULT_CALL_PARAMS;
    return { ...DEFAULT_CALL_PARAMS, ...(JSON.parse(raw) as Partial<CallMechanicParams>) };
  } catch { return DEFAULT_CALL_PARAMS; }
}

export function saveCallParams(wid: string, p: CallMechanicParams) {
  try { localStorage.setItem(paramsKey(wid), JSON.stringify(p)); } catch { /* sem storage: só não lembra */ }
}

export type CallSuggestion = { base: number; autonomo: number; travel: number; total: number };

export function suggestPay(labor: number, p: CallMechanicParams): CallSuggestion {
  const r = (n: number) => Math.round(n * 100) / 100;
  const base = r(Math.max(0, labor) * p.laborPercent / 100);
  const autonomo = r(base * p.autonomoPercent / 100);
  const travel = r(Math.max(0, p.travel));
  return { base, autonomo, travel, total: r(base + autonomo + travel) };
}

/* Mesma chave de rascunho da tela de Demandas (oficina/Dashboard): ela abre já preenchida */
export const jobDraftKey = (wid: string) => `draft_job_${wid}`;
export const jobDraftOriginKey = (wid: string) => `draft_job_origin_${wid}`;

export function saveJobDraft(wid: string, origin: string, draft: {
  /** '' = sem OS (só serviços empilhados avulsos) */
  serviceOrderId: string; itemIds: string[];
  /** Serviços empilhados avulsos (sem OS) que vão nesta demanda */
  stackedServiceIds?: string[];
  /** Quanto a oficina vai cobrar do cliente (soma dos empilhados que tinham o valor) */
  customerCharge?: number;
  /** Demanda com serviços de várias OS (vindo dos empilhados) */
  serviceOrderIds?: string[]; title: string; description: string; total: number; hours: number;
  /** datetime-local ('' = o quanto antes) */
  scheduledAt: string;
}) {
  const hours = Math.max(0.5, draft.hours);
  // Preço pelo serviço: o mecânico recebe exatamente o total sugerido, com o tempo previsto como informação
  localStorage.setItem(jobDraftKey(wid), JSON.stringify({
    title: draft.title, description: draft.description,
    pricing: 'fixed', total: String(Math.max(1, Math.round(draft.total * 100) / 100)), price_per_hour: '',
    max_hours: String(hours), scheduled_at: draft.scheduledAt,
    service_order_id: draft.serviceOrderId, service_order_item_ids: draft.itemIds,
    ...(draft.serviceOrderIds ? { service_order_ids: draft.serviceOrderIds } : {}),
    ...(draft.stackedServiceIds?.length ? { stacked_service_ids: draft.stackedServiceIds } : {}),
    ...(draft.customerCharge != null ? { customer_charge: String(draft.customerCharge) } : {}),
  }));
  localStorage.setItem(jobDraftOriginKey(wid), origin);
}

/**
 * Serviços que vão para o mecânico da plataforma (sem comissão da equipe).
 * stack = true: ficam "empilhados" (esperando a gestão gerar a demanda); false: já vão para uma demanda.
 * A OS inteira só vira "plataforma" quando todos os serviços dela são da plataforma.
 */
export async function markPlatformItems(wid: string, osIds: string[], itemIds: string[], opts: { stack?: boolean; jobId?: string } = {}) {
  if (itemIds.length) {
    const patch: Record<string, unknown> = { executor: 'platform', workshop_mechanic_id: null };
    if (opts.stack) patch.stacked_at = new Date().toISOString();
    if (opts.jobId) { patch.platform_job_id = opts.jobId; patch.stacked_at = null; }
    const { error } = await supabase.from('service_order_items').update(patch).in('id', itemIds).eq('workshop_id', wid);
    if (error) return { error };
  }
  for (const osId of osIds) {
    const { count } = await supabase.from('service_order_items').select('id', { count: 'exact', head: true })
      .eq('service_order_id', osId).eq('kind', 'labor').or('executor.is.null,executor.neq.platform');
    if (count === 0) {
      await supabase.from('service_orders').update({ executor: 'platform', workshop_mechanic_id: null }).eq('id', osId).eq('workshop_id', wid);
    }
  }
  return { error: null };
}
