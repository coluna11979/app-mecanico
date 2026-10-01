import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { fetchAll } from '@/lib/fetchAll';
import { fmtBRL } from '@/components/os/osHelpers';
import {
  COMMISSION_COLS, baseByMechanic, commissionFor, commissionRule, loadCommissionBase, pcts,
  type CommissionBaseRow, type CommissionMech,
} from '@/lib/commission';

type Mech = { id: string; name: string; active: boolean } & CommissionMech;
type OsInfo = {
  id: string; number: number | null; title: string; price: number; completed_at: string | null;
  customer: { full_name: string } | null; vehicle: { plate: string | null } | null;
};

type Line = { os: OsInfo | undefined; osId: string; labor: number; parts: number; own: boolean; manual?: boolean; commission: number; doneAt: string | null };
/** Linha da view com a data em que o trabalho conta (serviço finalizado ou OS concluída) */
type BaseRow = CommissionBaseRow & { done_at?: string | null };
const OS_COLS = 'id, number, title, price, completed_at, customer:customers(full_name), vehicle:vehicles(plate)';
type Person = {
  mech: Mech; rule: string; lines: Line[];
  labor: number; parts: number; revenueShare: number; commission: number;
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const osNum = (o: { id: string; number: number | null } | undefined, id: string) =>
  o?.number != null ? String(o.number).padStart(4, '0') : id.slice(0, 8);
const pctStr = (n: number) => `${n.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;

/**
 * Comissão detalhada por colaborador no intervalo: total, de onde veio e cada OS
 * (serviços e peças que ele fez × a % dele) + a parte sobre o faturamento da loja.
 */
export default function CommissionDetail({ wid, from, to }: { wid: string; from: Date; to: Date }) {
  const [base, setBase] = useState<CommissionBaseRow[] | null>(null);
  const [mechs, setMechs] = useState<Mech[]>([]);
  const [osById, setOsById] = useState<Map<string, OsInfo>>(new Map());
  const [revenue, setRevenue] = useState(0);
  const [revenueCount, setRevenueCount] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const fromIso = from.toISOString();
  const toIso = to.toISOString();

  useEffect(() => {
    let alive = true;
    setBase(null);
    (async () => {
      const [b, m, sales] = await Promise.all([
        loadCommissionBase(wid, fromIso, toIso),
        supabase.from('workshop_mechanics').select(`id, name, active, ${COMMISSION_COLS}`).eq('workshop_id', wid).order('name'),
        fetchAll((a, z) => supabase.from('service_orders')
          .select(OS_COLS)
          .eq('workshop_id', wid).eq('status', 'completed').is('quote_status', null)
          .gte('completed_at', fromIso).lt('completed_at', toIso).order('id').range(a, z)),
      ]);
      if (!alive) return;
      const list = (sales.data ?? []) as unknown as OsInfo[];
      const map = new Map(list.map(o => [o.id, o]));
      // Serviço finalizado em OS ainda em andamento: busca os dados dessa OS também
      const missing = [...new Set(b.map(r => r.service_order_id))].filter(id => !map.has(id));
      for (let i = 0; i < missing.length; i += 200) {
        const { data } = await supabase.from('service_orders').select(OS_COLS).in('id', missing.slice(i, i + 200));
        for (const o of (data ?? []) as unknown as OsInfo[]) map.set(o.id, o);
      }
      if (!alive) return;
      setOsById(map);
      // Faturamento da loja (para quem ganha % sobre ele): só OS concluídas no período
      setRevenue(r2(list.reduce((a, o) => a + Number(o.price), 0)));
      setRevenueCount(list.length);
      setMechs((m.data ?? []) as unknown as Mech[]);
      setBase(b);
    })();
    return () => { alive = false; };
  }, [wid, fromIso, toIso]);

  const people = useMemo<Person[]>(() => {
    if (!base) return [];
    const byMech = new Map<string, CommissionBaseRow[]>();
    for (const r of base) {
      if (!r.mechanic_id) continue;
      byMech.set(r.mechanic_id, [...(byMech.get(r.mechanic_id) ?? []), r]);
    }
    return mechs.map(mech => {
      const p = pcts(mech);
      // Uma linha por OS (o mesmo mecânico pode ter finalizado em horários diferentes)
      const perOs = new Map<string, BaseRow[]>();
      for (const r of (byMech.get(mech.id) ?? []) as BaseRow[]) perOs.set(r.service_order_id, [...(perOs.get(r.service_order_id) ?? []), r]);
      const lines: Line[] = [...perOs.entries()].map(([osId, rows]) => {
        // Mesma regra do Fechar comissões (lib/commission.ts)
        const commission = commissionFor(mech, baseByMechanic(rows).get(mech.id), 0).commission;
        const doneAt = rows.map(r => r.done_at ?? null).filter(Boolean).sort().pop() ?? osById.get(osId)?.completed_at ?? null;
        return {
          os: osById.get(osId), osId, doneAt, commission,
          labor: r2(rows.reduce((a, r) => a + r.labor, 0)),
          parts: r2(rows.reduce((a, r) => a + r.parts, 0)),
          own: rows.some(r => r.customer_brought_parts),
          manual: rows.some(r => Number(r.manual ?? 0) > 0),
        };
      }).sort((a, b) => (b.doneAt ?? '').localeCompare(a.doneAt ?? ''));
      const revenueShare = p.revenue > 0 ? r2(revenue * p.revenue / 100) : 0;
      return {
        mech, rule: commissionRule(mech, { worked: lines.some(l => l.commission > 0 || l.labor > 0 || l.parts > 0), manual: lines.some(l => l.manual) }), lines,
        labor: r2(lines.reduce((a, l) => a + l.labor, 0)),
        parts: r2(lines.reduce((a, l) => a + l.parts, 0)),
        revenueShare,
        commission: r2(lines.reduce((a, l) => a + l.commission, 0) + revenueShare),
      };
    }).filter(x => x.commission > 0 || x.lines.length > 0)
      .sort((a, b) => b.commission - a.commission);
  }, [base, mechs, osById, revenue]);

  const total = people.reduce((a, p) => a + p.commission, 0);

  if (base === null) return <div className="space-y-2">{[1, 2].map(i => <div key={i} className="h-12 bg-steel-50 rounded-xl animate-pulse" />)}</div>;

  if (!people.length) {
    return <p className="text-sm text-steel-400">Nenhum serviço finalizado com comissão no período. O % de cada um é definido na ficha do colaborador.</p>;
  }

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
        <div className="text-sm text-steel-600">
          {revenueCount} OS concluída{revenueCount === 1 ? "" : "s"} · faturamento {fmtBRL(revenue)}
        </div>
        <div className="text-sm">Total de comissões <strong className="text-base">{fmtBRL(total)}</strong></div>
      </div>

      <ul className="divide-y divide-steel-100 border border-steel-100 rounded-xl overflow-hidden">
        {people.map(p => {
          const isOpen = open === p.mech.id;
          const pc = pcts(p.mech);
          return (
            <li key={p.mech.id}>
              <button type="button" onClick={() => setOpen(isOpen ? null : p.mech.id)}
                className="w-full text-left px-4 py-3 flex items-center justify-between gap-3 hover:bg-steel-50">
                <div className="min-w-0">
                  <div className="font-semibold truncate">{p.mech.name}{!p.mech.active && <span className="badge bg-steel-100 text-steel-500 ml-2">inativo</span>}</div>
                  <div className="text-[11px] text-steel-500 truncate">
                    {p.lines.length} OS · serviços {fmtBRL(p.labor)} · peças {fmtBRL(p.parts)}
                    {p.rule && <span className="text-steel-400"> · {p.rule}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-base font-bold">{fmtBRL(p.commission)}</span>
                  <span className={`text-steel-400 transition ${isOpen ? 'rotate-90' : ''}`}>›</span>
                </div>
              </button>

              {isOpen && (
                <div className="bg-steel-50/70 px-4 pb-3">
                  {p.lines.length > 0 && (
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-[10px] uppercase tracking-wider text-steel-400">
                          <th className="text-left font-bold py-2">OS</th>
                          <th className="text-right font-bold py-2">Serviços</th>
                          <th className="text-right font-bold py-2">Peças</th>
                          <th className="text-right font-bold py-2">Comissão</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-steel-100">
                        {p.lines.map(l => (
                          <tr key={l.osId}>
                            <td className="py-1.5 pr-2">
                              <Link to={`/oficina/os/${l.osId}`} className="font-semibold text-steel-800 hover:text-brand-700">
                                OS {osNum(l.os, l.osId)} · {l.os?.title ?? '—'}
                              </Link>
                              <div className="text-steel-500">
                                {l.os?.customer?.full_name ?? 'Sem cliente'}{l.os?.vehicle?.plate ? ` · ${l.os.vehicle.plate}` : ''}
                                {l.doneAt && ` · ${new Date(l.doneAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`}
                                {l.os && !l.os.completed_at && <span className="text-brand-700"> · serviço finalizado (OS em andamento)</span>}
                                {l.own && <span className="text-pending-700"> · peça do cliente</span>}
                                {l.manual && <span className="text-brand-700"> · ✏️ comissão definida na OS</span>}
                              </div>
                            </td>
                            <td className="py-1.5 text-right whitespace-nowrap">
                              {fmtBRL(l.labor)}
                              {l.labor > 0 && <div className="text-steel-400">× {pctStr(l.own ? pc.own : pc.labor)}</div>}
                            </td>
                            <td className="py-1.5 text-right whitespace-nowrap">
                              {fmtBRL(l.parts)}
                              {l.parts > 0 && <div className="text-steel-400">× {pctStr(pc.parts)}</div>}
                            </td>
                            <td className="py-1.5 text-right font-semibold whitespace-nowrap">{fmtBRL(l.commission)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  {p.revenueShare > 0 && (
                    <div className="flex justify-between text-xs pt-2 mt-1 border-t border-steel-200">
                      <span className="text-steel-600">{pctStr(pc.revenue)} sobre o faturamento da loja ({fmtBRL(revenue)})</span>
                      <strong>{fmtBRL(p.revenueShare)}</strong>
                    </div>
                  )}
                  <div className="flex justify-between text-xs pt-2 mt-1 border-t border-steel-200">
                    <span className="font-semibold text-steel-700">Total de {p.mech.name.split(' ')[0]}</span>
                    <strong>{fmtBRL(p.commission)}</strong>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
