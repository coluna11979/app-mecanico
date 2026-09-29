/**
 * Comissão da equipe (migration 0046).
 *
 * Cada colaborador tem três % que se somam (0 = não ganha naquela base):
 * - commission_percent          → sobre os serviços (mão de obra) que fez
 * - commission_parts_percent    → sobre as peças dos itens que fez
 * - commission_revenue_percent  → sobre o faturamento total da loja (ex.: gerente 1,5%)
 *
 * "Quem fez" é por item da OS (service_order_items.workshop_mechanic_id); vazio = responsável da OS.
 * A view os_commission_base já entrega a OS dividida por colaborador.
 */
import { supabase } from '@/lib/supabase';
import { fetchAll } from '@/lib/fetchAll';

export type CommissionMech = {
  id: string;
  commission_percent?: number | null;
  commission_parts_percent?: number | null;
  commission_revenue_percent?: number | null;
};

export type CommissionBaseRow = { service_order_id: string; mechanic_id: string | null; labor: number; parts: number };

export type CommissionCalc = { labor: number; parts: number; revenue: number; commission: number };

/** Colunas de comissão para os selects de workshop_mechanics */
export const COMMISSION_COLS = 'commission_percent, commission_parts_percent, commission_revenue_percent';

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Todo o histórico (quando o período é filtrado depois, na tela) */
export const ALL_TIME = { from: '1970-01-01T00:00:00Z', to: '2999-01-01T00:00:00Z' };

export const pcts = (m: CommissionMech) => ({
  labor:   Number(m.commission_percent ?? 0),
  parts:   Number(m.commission_parts_percent ?? 0),
  revenue: Number(m.commission_revenue_percent ?? 0),
});

export const hasCommission = (m: CommissionMech) => {
  const p = pcts(m);
  return p.labor > 0 || p.parts > 0 || p.revenue > 0;
};

/** Base de comissão das OS concluídas (vendas) no período, já dividida por quem fez */
export async function loadCommissionBase(wid: string, from: string, to: string): Promise<CommissionBaseRow[]> {
  const { data } = await fetchAll((a, b) => supabase.from('os_commission_base')
    .select('service_order_id, mechanic_id, labor, parts')
    .eq('workshop_id', wid).eq('status', 'completed').is('quote_status', null)
    .gte('completed_at', from).lt('completed_at', to)
    .order('service_order_id').order('mechanic_id', { nullsFirst: true }).range(a, b));
  return ((data ?? []) as CommissionBaseRow[]).map(r => ({ ...r, labor: Number(r.labor), parts: Number(r.parts) }));
}

/** Soma o que cada colaborador fez (serviços e peças) */
export function baseByMechanic(rows: CommissionBaseRow[]) {
  const map = new Map<string, { labor: number; parts: number }>();
  for (const r of rows) {
    if (!r.mechanic_id) continue;
    const e = map.get(r.mechanic_id) ?? { labor: 0, parts: 0 };
    e.labor += r.labor;
    e.parts += r.parts;
    map.set(r.mechanic_id, e);
  }
  return map;
}

/** Comissão de um colaborador: serviços que fez, peças que fez e faturamento da loja */
export function commissionFor(m: CommissionMech, done: { labor: number; parts: number } | undefined, revenue: number): CommissionCalc {
  const p = pcts(m);
  const labor = r2(done?.labor ?? 0);
  const parts = r2(done?.parts ?? 0);
  const rev = p.revenue > 0 ? r2(revenue) : 0;
  return {
    labor, parts, revenue: rev,
    commission: r2(labor * p.labor / 100 + parts * p.parts / 100 + rev * p.revenue / 100),
  };
}

const pctStr = (n: number) => `${n.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;

/** "10% serviços + 5% peças + 1,5% faturamento" */
export function commissionRule(m: CommissionMech) {
  const p = pcts(m);
  return [
    p.labor > 0 && `${pctStr(p.labor)} serviços`,
    p.parts > 0 && `${pctStr(p.parts)} peças`,
    p.revenue > 0 && `${pctStr(p.revenue)} faturamento`,
  ].filter(Boolean).join(' + ');
}
