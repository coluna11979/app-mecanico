import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { fetchAll } from '@/lib/fetchAll';
import { brl } from '@/lib/cash';
import {
  COMMISSION_COLS, baseByMechanic, commissionFor, commissionRule,
  type CommissionBaseRow, type CommissionMech,
} from '@/lib/commission';
import { currentHalf, halfLabel, halfRange, payDate, shiftHalf, type Half } from '@/lib/commissionClosing';

/**
 * Comissão do próprio mecânico (modo balcão) — só leitura.
 * Mesma conta do fechamento da quinzena (os_commission_base + commissionFor), filtrada para ele.
 * Não entra a % sobre o faturamento da loja (é do gerente, no fechamento).
 */

const COLS = 'service_order_id, mechanic_id, labor, parts, customer_brought_parts, labor_only, done_at, rule_v2, svc_base, mo_base, manual, fixed';
const num = (r: CommissionBaseRow): CommissionBaseRow => ({
  ...r, labor: Number(r.labor), parts: Number(r.parts), labor_only: Number(r.labor_only ?? 0),
  svc_base: Number(r.svc_base ?? 0), mo_base: Number(r.mo_base ?? 0), manual: Number(r.manual ?? 0), fixed: Number(r.fixed ?? 0),
});

export type MyCommission = {
  mech: CommissionMech | null;
  /** Comissão por OS (só serviços finalizados) */
  byOs: Map<string, { value: number; doneAt: string | null }>;
  /** Quinzena atual e a anterior */
  halves: { competence: string; half: Half; value: number; count: number; closed: boolean }[];
  rule: string;
  loaded: boolean;
};

export function useMyCommission(wid: string | null | undefined, mechanicId: string | null): MyCommission {
  const [mech, setMech] = useState<CommissionMech | null>(null);
  const [rows, setRows] = useState<CommissionBaseRow[]>([]);
  const [closed, setClosed] = useState<{ competence: string; half: number }[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!wid || !mechanicId) { setLoaded(true); return; }
    let alive = true;
    (async () => {
      const [m, b, c] = await Promise.all([
        supabase.from('workshop_mechanics').select(`id, ${COMMISSION_COLS}`).eq('id', mechanicId).maybeSingle(),
        fetchAll((a, z) => supabase.from('os_commission_base').select(COLS)
          .eq('workshop_id', wid).eq('mechanic_id', mechanicId).not('done_at', 'is', null)
          .order('service_order_id').order('done_at').range(a, z)),
        supabase.from('commission_closings').select('competence, half').eq('workshop_id', wid).eq('mechanic_id', mechanicId),
      ]);
      if (!alive) return;
      setMech((m.data as CommissionMech | null) ?? null);
      setRows(((b.data ?? []) as CommissionBaseRow[]).map(num));
      setClosed((c.data ?? []) as { competence: string; half: number }[]);
      setLoaded(true);
    })();
    return () => { alive = false; };
  }, [wid, mechanicId]);

  return useMemo(() => {
    const valueOf = (rs: CommissionBaseRow[]) =>
      mech && mechanicId ? commissionFor(mech, baseByMechanic(rs).get(mechanicId), 0).commission : 0;
    const groups = new Map<string, CommissionBaseRow[]>();
    for (const r of rows) groups.set(r.service_order_id, [...(groups.get(r.service_order_id) ?? []), r]);
    const byOs = new Map<string, { value: number; doneAt: string | null }>();
    for (const [id, rs] of groups) byOs.set(id, { value: valueOf(rs), doneAt: rs[rs.length - 1]?.done_at ?? null });

    const cur = currentHalf();
    const prev = shiftHalf(cur.competence, cur.half, -1);
    const halves = [cur, prev].map(h => {
      const { from, to } = halfRange(h.competence, h.half);
      const rs = rows.filter(r => r.done_at && r.done_at >= from && r.done_at < to);
      return {
        ...h, value: valueOf(rs), count: new Set(rs.map(r => r.service_order_id)).size,
        closed: closed.some(c => c.competence === h.competence && c.half === h.half),
      };
    });
    // Regra dele sem a % do faturamento da loja (essa é do gerente e não entra aqui)
    const rule = mech ? commissionRule({ ...mech, commission_revenue_percent: 0 }, { worked: true }) : '';
    return { mech, byOs, halves, rule, loaded };
  }, [mech, mechanicId, rows, closed, loaded]);
}

/** Quinzena em que um serviço finalizado entra: "1ª quinzena 10/2026 · pagamento 15/10" */
export function halfOf(doneAt: string) {
  const d = new Date(doneAt);
  const competence = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const half: Half = d.getDate() <= 15 ? 1 : 2;
  const pay = payDate(competence, half);
  return `${halfLabel(competence, half)} · pagamento ${pay.slice(8, 10)}/${pay.slice(5, 7)}`;
}

/** Resumo no topo de "Minhas OS" */
export function MyCommissionSummary({ c }: { c: MyCommission }) {
  if (!c.loaded || !c.mech) return null;
  if (c.mech.no_commission) {
    return <div className="card !py-3 mb-4 text-sm text-steel-600">💰 Salário fixo — você não recebe comissão por OS.</div>;
  }
  return (
    <div className="card !py-3 mb-4 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-bold uppercase tracking-widest text-steel-500">💰 Suas comissões</div>
        <div className="text-[11px] text-steel-400 truncate">{c.rule}</div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {c.halves.map((h, i) => (
          <div key={`${h.competence}-${h.half}`} className={`rounded-xl px-3 py-2 ${i === 0 ? 'bg-signal-50' : 'bg-steel-50'}`}>
            <div className="text-[11px] font-semibold text-steel-500">{i === 0 ? 'Agora' : 'Anterior'} · {halfLabel(h.competence, h.half)}</div>
            <div className="text-xl font-bold font-display text-steel-900">{brl(h.value)}</div>
            <div className="text-[11px] text-steel-500">{h.count} {h.count === 1 ? 'OS' : 'OS'}{h.closed ? ' · ✓ fechada' : ' · prevista'}</div>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-steel-400">Conta quando o serviço é finalizado. Valor previsto até o gestor fechar a quinzena.</p>
    </div>
  );
}
