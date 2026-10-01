/**
 * Comissão da equipe.
 *
 * REGRA ATUAL — igual para todas as lojas, trabalho finalizado a partir de 01/10/2026 (migration 0062):
 * - "Mão de obra" (serviço sem peça) → 10% do valor, para quem fez;
 * - "Serviço" + as peças logo abaixo dele na OS → 4% sobre a soma, para quem fez o serviço;
 * - % sobre o faturamento da loja (gerente) continua vindo da ficha.
 * A view os_commission_base entrega svc_base (4%) e mo_base (10%) nas linhas rule_v2.
 *
 * REGRA ANTERIOR (até 30/09/2026, migration 0046) — usada para as quinzenas antigas:
 *
 * Cada colaborador tem três % que se somam (0 = não ganha naquela base):
 * - commission_percent          → sobre os serviços (mão de obra) que fez
 * - commission_parts_percent    → sobre as peças dos itens que fez
 * - commission_revenue_percent  → sobre o faturamento total da loja (ex.: gerente 1,5%)
 * Mão de obra "só serviço" usa commission_own_parts_percent (vazio = a mesma % de serviços):
 * - serviço sem peça da loja ligada a ele ("Usada em") — vale para OS concluídas a partir de 01/10/2026 (labor_only);
 * - ou a OS inteira quando o cliente trouxe a peça (service_orders.customer_brought_parts).
 *
 * "Quem fez" é por item da OS (service_order_items.workshop_mechanic_id); vazio = responsável da OS.
 * Serviço da plataforma não gera comissão para a equipe; peça segue o serviço em que foi usada.
 *
 * Quando conta: no momento em que o serviço é FINALIZADO (done_at da view) — o "Terminou" do relógio
 * do responsável na OS; sem isso, a conclusão da OS. Não precisa estar pago. OS cancelada não conta.
 * A view os_commission_base já entrega a OS dividida por colaborador.
 */
import { supabase } from '@/lib/supabase';
import { fetchAll } from '@/lib/fetchAll';

export type CommissionMech = {
  id: string;
  commission_percent?: number | null;
  commission_parts_percent?: number | null;
  commission_revenue_percent?: number | null;
  commission_own_parts_percent?: number | null;
};

export type CommissionBaseRow = {
  service_order_id: string; mechanic_id: string | null; labor: number; parts: number;
  /** OS em que o cliente trouxe a peça */
  customer_brought_parts?: boolean;
  /** Mão de obra de serviços sem peça da loja ("só serviço") */
  labor_only?: number;
  /** Quando esse trabalho conta para a comissão (serviço finalizado) */
  done_at?: string | null;
  /** Regra atual (10% mão de obra / 4% serviço + peças) */
  rule_v2?: boolean;
  /** Serviço + peças dele (4%) */
  svc_base?: number;
  /** Mão de obra sem peça (10%) */
  mo_base?: number;
};

/** Regra atual, igual para todas as lojas */
export const RULE = { service: 4, labor: 10 } as const;

/**
 * O que o colaborador fez no período.
 * Regra anterior: mão de obra normal, "só serviço" e peças (× % da ficha).
 * Regra atual: svc = serviço + peças (× 4%) e mo = mão de obra sem peça (× 10%).
 */
export type Done = {
  labor: number; laborOwn: number; parts: number; svc: number; mo: number;
  /** Regra atual: totais de mão de obra e peças só para mostrar (a comissão sai de svc/mo) */
  vLabor?: number; vParts?: number;
};

/** labor/parts = totais que o colaborador fez (para mostrar); svc/mo = bases da regra atual */
export type CommissionCalc = {
  labor: number; laborOwn: number; parts: number; svc: number; mo: number; revenue: number; commission: number;
};

/** Colunas de comissão para os selects de workshop_mechanics */
export const COMMISSION_COLS = 'commission_percent, commission_parts_percent, commission_revenue_percent, commission_own_parts_percent';

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Todo o histórico (quando o período é filtrado depois, na tela) */
export const ALL_TIME = { from: '1970-01-01T00:00:00Z', to: '2999-01-01T00:00:00Z' };

export const pcts = (m: CommissionMech) => ({
  labor:   Number(m.commission_percent ?? 0),
  /** Mão de obra quando o cliente traz a peça (vazio = igual à de serviços) */
  own:     m.commission_own_parts_percent != null ? Number(m.commission_own_parts_percent) : Number(m.commission_percent ?? 0),
  parts:   Number(m.commission_parts_percent ?? 0),
  revenue: Number(m.commission_revenue_percent ?? 0),
});

export const hasCommission = (m: CommissionMech) => {
  const p = pcts(m);
  return p.labor > 0 || p.own > 0 || p.parts > 0 || p.revenue > 0;
};

/** Base de comissão dos serviços finalizados no período, já dividida por quem fez */
export async function loadCommissionBase(wid: string, from: string, to: string): Promise<CommissionBaseRow[]> {
  const { data } = await fetchAll((a, b) => supabase.from('os_commission_base')
    .select('service_order_id, mechanic_id, labor, parts, customer_brought_parts, labor_only, done_at, rule_v2, svc_base, mo_base')
    .eq('workshop_id', wid).not('done_at', 'is', null)
    .gte('done_at', from).lt('done_at', to)
    .order('service_order_id').order('mechanic_id', { nullsFirst: true }).order('done_at').range(a, b));
  return ((data ?? []) as CommissionBaseRow[]).map(r => ({ ...r, labor: Number(r.labor), parts: Number(r.parts), labor_only: Number(r.labor_only ?? 0),
    svc_base: Number(r.svc_base ?? 0), mo_base: Number(r.mo_base ?? 0) }));
}

/** Soma o que cada colaborador fez (serviços e peças) */
export function baseByMechanic(rows: CommissionBaseRow[]) {
  const map = new Map<string, Done>();
  for (const r of rows) {
    if (!r.mechanic_id) continue;
    const e = map.get(r.mechanic_id) ?? { labor: 0, laborOwn: 0, parts: 0, svc: 0, mo: 0 };
    if (r.rule_v2) {
      e.svc += Number(r.svc_base ?? 0);
      e.mo += Number(r.mo_base ?? 0);
      e.vLabor = (e.vLabor ?? 0) + r.labor;
      e.vParts = (e.vParts ?? 0) + r.parts;
      map.set(r.mechanic_id, e);
      continue;
    }
    const only = Math.min(r.labor, Number(r.labor_only ?? 0));
    if (r.customer_brought_parts) e.laborOwn += r.labor;
    else { e.laborOwn += only; e.labor += r.labor - only; }
    e.parts += r.parts;
    map.set(r.mechanic_id, e);
  }
  return map;
}

/** Comissão de um colaborador: serviços que fez, peças que fez e faturamento da loja */
export function commissionFor(m: CommissionMech, done: Done | undefined, revenue: number): CommissionCalc {
  const p = pcts(m);
  const labor = r2(done?.labor ?? 0);
  const laborOwn = r2(done?.laborOwn ?? 0);
  const parts = r2(done?.parts ?? 0);
  const svc = r2(done?.svc ?? 0);
  const mo = r2(done?.mo ?? 0);
  const rev = p.revenue > 0 ? r2(revenue) : 0;
  return {
    labor: r2(labor + (done?.vLabor ?? 0)), laborOwn, parts: r2(parts + (done?.vParts ?? 0)), svc, mo, revenue: rev,
    commission: r2(labor * p.labor / 100 + laborOwn * p.own / 100 + parts * p.parts / 100
      + svc * RULE.service / 100 + mo * RULE.labor / 100 + rev * p.revenue / 100),
  };
}

const pctStr = (n: number) => `${n.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;

/** "10% serviços + 5% peças + 1,5% faturamento" */
export function commissionRule(m: CommissionMech) {
  const p = pcts(m);
  return [
    `${pctStr(RULE.service)} serviço + peças`,
    `${pctStr(RULE.labor)} mão de obra`,
    p.revenue > 0 && `${pctStr(p.revenue)} faturamento`,
  ].filter(Boolean).join(' + ');
}

/** Regra da ficha antes de 01/10/2026 (histórico) */
export function legacyCommissionRule(m: CommissionMech) {
  const p = pcts(m);
  return [
    p.labor > 0 && `${pctStr(p.labor)} serviços`,
    m.commission_own_parts_percent != null && p.own !== p.labor && `${pctStr(p.own)} só serviço`,
    p.parts > 0 && `${pctStr(p.parts)} peças`,
    p.revenue > 0 && `${pctStr(p.revenue)} faturamento`,
  ].filter(Boolean).join(' + ');
}
