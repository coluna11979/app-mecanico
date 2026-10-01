import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { brl, moneyStr, parseMoney } from '@/lib/cash';
import { RULE } from '@/lib/commission';
import { PLATFORM } from '@/components/cash/ResponsiblePicker';
import type { useReceiveAssignments } from '@/components/cash/ReceiveAssignments';
import type { WorkshopMechanic } from '@/types/database';

/**
 * "Comissões a pagar nesta OS" — no Caixa, antes de fechar.
 * Mostra quanto cada um ganha pela regra (10% mão de obra · 4% serviço + peças), calculado
 * com os responsáveis escolhidos na tela. "Alterar" troca por valores digitados: eles SUBSTITUEM
 * a regra só nesta OS (set_os_commissions). A % do gerente sobre o faturamento fica por fora.
 */

type Assign = ReturnType<typeof useReceiveAssignments>;
type Team = Pick<WorkshopMechanic, 'id' | 'name'>[];
type Row = { key: number; mechanic_id: string; amount: string };

let seq = 0;
const r2 = (n: number) => Math.round(n * 100) / 100;
const amt = (i: { quantity: number; unit_price: number }) => r2(Number(i.quantity) * Number(i.unit_price));

export function useOsCommission(osId: string, a: Assign) {
  const [loaded, setLoaded]   = useState(false);
  const [wasManual, setWasManual] = useState(false);
  const [brought, setBrought] = useState(false);
  const [editing, setEditing] = useState(false);
  const [rows, setRows]       = useState<Row[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [o, ov] = await Promise.all([
          supabase.from('service_orders').select('commission_manual, customer_brought_parts').eq('id', osId).maybeSingle(),
          supabase.from('os_commission_overrides').select('mechanic_id, amount').eq('service_order_id', osId),
        ]);
        if (!alive) return;
        const os = o.data as { commission_manual?: boolean; customer_brought_parts?: boolean } | null;
        const manual = !!os?.commission_manual;
        setWasManual(manual);
        setBrought(!!os?.customer_brought_parts);
        if (manual) {
          setEditing(true);
          setRows(((ov.data as { mechanic_id: string; amount: number }[]) ?? [])
            .map(x => ({ key: ++seq, mechanic_id: x.mechanic_id, amount: moneyStr(Number(x.amount)) })));
        }
      } catch (e) {
        console.warn('[OsCommission] não carregou a comissão da OS:', e);
      } finally {
        if (alive) setLoaded(true);
      }
    })();
    return () => { alive = false; };
  }, [osId]);

  /** Pela regra, com os responsáveis da tela */
  const auto = useMemo(() => {
    const by = new Map<string, { value: number; base: string[] }>();
    for (const l of a.labor) {
      const w = a.who[l.id];
      if (!w || w === PLATFORM) continue;
      const parts = a.partsOf.get(l.id) ?? [];
      const type = l.service_type ?? (parts.length ? 'servico' : 'mao_de_obra');
      const e = by.get(w) ?? { value: 0, base: [] };
      if (type === 'servico' && !brought) {
        const base = amt(l) + parts.reduce((s, p) => s + amt(p), 0);
        e.value += base * RULE.service / 100;
        e.base.push(`${RULE.service}% de ${brl(base)}`);
      } else {
        e.value += amt(l) * RULE.labor / 100;
        e.base.push(`${RULE.labor}% de ${brl(amt(l))}`);
      }
      by.set(w, e);
    }
    return [...by.entries()].map(([id, e]) => ({ mechanic_id: id, value: r2(e.value), base: e.base.join(' + ') }));
  }, [a.labor, a.who, a.partsOf, brought]);

  function startEdit() {
    setRows(auto.length ? auto.map(x => ({ key: ++seq, mechanic_id: x.mechanic_id, amount: moneyStr(x.value) }))
      : [{ key: ++seq, mechanic_id: '', amount: '' }]);
    setEditing(true);
  }
  const backToRule = () => { setEditing(false); setRows([]); };

  const valid = !editing || rows.every(r => r.mechanic_id && parseMoney(r.amount) >= 0);
  const total = editing ? r2(rows.reduce((s, r) => s + parseMoney(r.amount), 0)) : r2(auto.reduce((s, x) => s + x.value, 0));

  async function save(wid: string, sid: string | null): Promise<{ error: { message: string } | null }> {
    if (!loaded || (!editing && !wasManual)) return { error: null };
    const { error } = await supabase.rpc('set_os_commissions', {
      p_workshop: wid, p_session: sid, p_os: osId, p_manual: editing,
      p_rows: editing ? rows.filter(r => r.mechanic_id).map(r => ({ mechanic_id: r.mechanic_id, amount: parseMoney(r.amount) })) : [],
    });
    return { error };
  }

  return { loaded, editing, rows, setRows, auto, startEdit, backToRule, valid, total, save };
}

export function OsCommission({ c, team }: { c: ReturnType<typeof useOsCommission>; team: Team }) {
  if (!c.loaded) return null;
  const name = (id: string) => team.find(t => t.id === id)?.name ?? 'Colaborador';
  const setRow = (key: number, patch: Partial<Row>) => c.setRows(rs => rs.map(r => r.key === key ? { ...r, ...patch } : r));

  return (
    <div className="mt-4 rounded-2xl border border-steel-200 px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <div className="label !mb-0">💰 Comissões a pagar nesta OS</div>
        {c.editing
          ? <button type="button" onClick={c.backToRule} className="text-xs font-semibold text-steel-500 hover:text-steel-800">↺ Voltar para a regra</button>
          : <button type="button" onClick={c.startEdit} className="text-xs font-semibold text-brand-600">✏️ Alterar</button>}
      </div>

      {!c.editing ? (
        <div className="mt-2 space-y-1 text-sm">
          {c.auto.length === 0 && <p className="text-xs text-steel-500">Ninguém da equipe ganha comissão pela regra nesta OS.</p>}
          {c.auto.map(x => (
            <div key={x.mechanic_id} className="flex justify-between gap-3">
              <span className="min-w-0 truncate">{name(x.mechanic_id)} <span className="text-[11px] text-steel-400">· {x.base}</span></span>
              <strong className="shrink-0">{brl(x.value)}</strong>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-2 space-y-2">
          {c.rows.map(r => (
            <div key={r.key} className="flex gap-2 items-center">
              <select className={`input !py-1.5 text-sm flex-1 min-w-0 ${r.mechanic_id ? '' : '!border-pending-400'}`} value={r.mechanic_id}
                onChange={e => setRow(r.key, { mechanic_id: e.target.value })}>
                <option value="">Quem recebe…</option>
                {team.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <input className="input !py-1.5 text-sm !w-28 shrink-0 text-right" inputMode="decimal" placeholder="0,00" value={r.amount}
                onChange={e => setRow(r.key, { amount: e.target.value })} />
              <button type="button" onClick={() => c.setRows(rs => rs.filter(x => x.key !== r.key))}
                className="text-steel-400 hover:text-alert-600 px-1" aria-label="Remover">✕</button>
            </div>
          ))}
          <button type="button" onClick={() => c.setRows(rs => [...rs, { key: ++seq, mechanic_id: '', amount: '' }])}
            className="text-sm font-semibold text-brand-600">+ Incluir pessoa</button>
          <p className="text-[11px] text-steel-500">Esses valores substituem a regra só nesta OS.</p>
        </div>
      )}

      <div className="flex justify-between text-sm pt-2 mt-2 border-t border-steel-100">
        <span className="text-steel-500">Total de comissões</span><strong>{brl(c.total)}</strong>
      </div>
      <p className="text-[11px] text-steel-400 mt-1">A % do gerente sobre o faturamento da loja entra à parte, automática.</p>
    </div>
  );
}
