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
  serviceOrderId: string; itemIds: string[]; title: string; description: string; total: number; hours: number;
  /** datetime-local ('' = o quanto antes) */
  scheduledAt: string;
}) {
  const hours = Math.max(0.5, draft.hours);
  // A demanda é "valor/hora × horas"; o campo de valor/hora só aceita inteiro, então arredonda para cima
  const pph = Math.max(1, Math.ceil(draft.total / hours));
  localStorage.setItem(jobDraftKey(wid), JSON.stringify({
    title: draft.title, description: draft.description,
    price_per_hour: String(pph), max_hours: String(hours), scheduled_at: draft.scheduledAt,
    service_order_id: draft.serviceOrderId, service_order_item_ids: draft.itemIds,
  }));
  localStorage.setItem(jobDraftOriginKey(wid), origin);
}
