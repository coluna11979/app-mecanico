import { useEffect, useMemo, useState } from 'react';
import { toast } from '@/components/ui/Toast';
import { supabase } from '@/lib/supabase';
import { brl, moneyStr, parseMoney } from '@/lib/cash';
import { RULE } from '@/lib/commission';
import { fixedFor, isExcluded, loadItemRules, type ItemRule } from '@/lib/commissionRules';
import { PLATFORM } from '@/components/cash/ResponsiblePicker';
import { useReceiveAssignments, type ReceiveOs } from '@/components/cash/ReceiveAssignments';
import type { WorkshopMechanic } from '@/types/database';

/**
 * "Comissões a pagar nesta OS" — no Caixa, antes de fechar.
 * Mostra quanto cada um ganha pela regra (10% mão de obra · 4% serviço + peças), calculado
 * com os responsáveis escolhidos na tela. "Alterar" troca por valores digitados: eles SUBSTITUEM
 * a regra só nesta OS (set_os_commissions). A % do gerente sobre o faturamento fica por fora.
 */

type Assign = ReturnType<typeof useReceiveAssignments>;
type Team = (Pick<WorkshopMechanic, 'id' | 'name'> & { no_commission?: boolean | null })[];
/** Como a comissão da pessoa é calculada: % padrão sobre o total da OS ou valor fechado */
type Mode = 'p10' | 'p4' | 'fixo';
const MODES: { key: Mode; label: string; pct: number | null }[] = [
  { key: 'p10', label: `${RULE.labor}%`, pct: RULE.labor },
  { key: 'p4', label: `${RULE.service}%`, pct: RULE.service },
  { key: 'fixo', label: 'Valor fechado', pct: null },
];
type Row = { key: number; mechanic_id: string; mode: Mode; amount: string };

let seq = 0;
const r2 = (n: number) => Math.round(n * 100) / 100;
const amt = (i: { quantity: number; unit_price: number }) => r2(Number(i.quantity) * Number(i.unit_price));
/** Valor salvo bate com uma % padrão do total? Senão é valor fechado */
const modeOf = (value: number, total: number): Mode =>
  total > 0 && Math.abs(value - r2(total * RULE.labor / 100)) < 0.01 ? 'p10'
    : total > 0 && Math.abs(value - r2(total * RULE.service / 100)) < 0.01 ? 'p4' : 'fixo';

export function useOsCommission(osId: string, a: Assign, team: Team = []) {
  /** Salário fixo não entra na comissão */
  const fixed = useMemo(() => new Set(team.filter(t => t.no_commission).map(t => t.id)), [team]);
  const [loaded, setLoaded]   = useState(false);
  const [wasManual, setWasManual] = useState(false);
  const [brought, setBrought] = useState(false);
  /** Total da OS — base das opções de % */
  const [osTotal, setOsTotal] = useState(0);
  /** Regras por item da loja (ex.: alinhamento sem comissão) */
  const [itemRules, setItemRules] = useState<ItemRule[]>([]);
  const [editing, setEditing] = useState(false);
  const [rows, setRows]       = useState<Row[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [o, ov] = await Promise.all([
          supabase.from('service_orders').select('commission_manual, customer_brought_parts, price, workshop_id').eq('id', osId).maybeSingle(),
          supabase.from('os_commission_overrides').select('mechanic_id, amount').eq('service_order_id', osId),
        ]);
        if (!alive) return;
        const os = o.data as { commission_manual?: boolean; customer_brought_parts?: boolean; price?: number; workshop_id?: string } | null;
        setOsTotal(Number(os?.price ?? 0));
        if (os?.workshop_id) loadItemRules(os.workshop_id).then(r => { if (alive) setItemRules(r); });
        const manual = !!os?.commission_manual;
        setWasManual(manual);
        setBrought(!!os?.customer_brought_parts);
        if (manual) {
          setEditing(true);
          setRows(((ov.data as { mechanic_id: string; amount: number }[]) ?? [])
            .map(x => ({ key: ++seq, mechanic_id: x.mechanic_id, mode: modeOf(Number(x.amount), Number(os?.price ?? 0)), amount: moneyStr(Number(x.amount)) })));
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
      if (!w || w === PLATFORM || fixed.has(w)) continue;
      const parts = a.partsOf.get(l.id) ?? [];
      const type = l.service_type ?? (parts.length ? 'servico' : 'mao_de_obra');
      const e = by.get(w) ?? { value: 0, base: [] };
      // Regra por item da loja: item com regra sai da conta; quem tiver valor fixo ganha o fixo
      const keepLabor = !isExcluded(l.description, itemRules);
      const keepParts = parts.filter(p => !isExcluded(p.description, itemRules));
      if (type === 'servico' && !brought) {
        const base = (keepLabor ? amt(l) : 0) + keepParts.reduce((s, p) => s + amt(p), 0);
        if (base > 0) { e.value += base * RULE.service / 100; e.base.push(`${RULE.service}% de ${brl(base)}`); }
      } else if (keepLabor) {
        e.value += amt(l) * RULE.labor / 100;
        e.base.push(`${RULE.labor}% de ${brl(amt(l))}`);
      }
      for (const it of [l, ...parts]) {
        const fx = fixedFor(it.description, w, Number(it.quantity), itemRules);
        if (fx > 0) { e.value += fx; e.base.push(`${brl(fx)} fixo (${it.description})`); }
      }
      if (e.value > 0 || e.base.length) by.set(w, e);
    }
    return [...by.entries()].filter(([, e]) => e.value > 0)
      .map(([id, e]) => ({ mechanic_id: id, value: r2(e.value), base: e.base.join(' + ') }));
  }, [a.labor, a.who, a.partsOf, brought, fixed, itemRules]);

  function startEdit() {
    setRows(auto.length ? auto.map(x => ({ key: ++seq, mechanic_id: x.mechanic_id, mode: modeOf(x.value, osTotal), amount: moneyStr(x.value) }))
      : [{ key: ++seq, mechanic_id: '', mode: 'fixo', amount: '' }]);
    setEditing(true);
  }
  const backToRule = () => { setEditing(false); setRows([]); };

  /** Valor da pessoa: % padrão sobre o total da OS, ou o valor fechado digitado */
  const valueOf = (r: Row) => {
    const pct = MODES.find(m => m.key === r.mode)?.pct;
    return pct != null ? r2(osTotal * pct / 100) : r2(parseMoney(r.amount));
  };
  const valid = !editing || rows.every(r => r.mechanic_id && valueOf(r) >= 0);
  const total = editing ? r2(rows.reduce((s, r) => s + valueOf(r), 0)) : r2(auto.reduce((s, x) => s + x.value, 0));

  async function save(wid: string, sid: string | null): Promise<{ error: { message: string } | null }> {
    if (!loaded || (!editing && !wasManual)) return { error: null };
    const { error } = await supabase.rpc('set_os_commissions', {
      p_workshop: wid, p_session: sid, p_os: osId, p_manual: editing,
      p_rows: editing ? rows.filter(r => r.mechanic_id).map(r => ({ mechanic_id: r.mechanic_id, amount: valueOf(r) })) : [],
    });
    return { error };
  }

  return { loaded, editing, wasManual, rows, setRows, auto, startEdit, backToRule, valid, total, save, osTotal, valueOf };
}

/** O que o quadro precisa (serve para a OS salva e para a conferência de nota, antes de a OS existir) */
type CommissionCtl = Pick<ReturnType<typeof useOsCommission>,
  'loaded' | 'editing' | 'rows' | 'setRows' | 'auto' | 'startEdit' | 'backToRule' | 'total' | 'osTotal' | 'valueOf'>;

export type AutoCommission = { mechanic_id: string; value: number; base: string };

/**
 * Comissão de uma OS que ainda vai ser criada (conferência de nota importada): mostra a regra,
 * permite alterar e só grava em save(), depois que a OS existir.
 */
export function useDraftCommission(auto: AutoCommission[], osTotal: number, defaultMechanic = '') {
  const [editing, setEditing] = useState(false);
  const [rows, setRows]       = useState<Row[]>([]);
  function startEdit() {
    setRows(auto.length ? auto.map(x => ({ key: ++seq, mechanic_id: x.mechanic_id, mode: modeOf(x.value, osTotal), amount: moneyStr(x.value) }))
      : [{ key: ++seq, mechanic_id: defaultMechanic, mode: 'fixo', amount: '' }]);
    setEditing(true);
  }
  const backToRule = () => { setEditing(false); setRows([]); };
  const valueOf = (r: Row) => {
    const pct = MODES.find(m => m.key === r.mode)?.pct;
    return pct != null ? r2(osTotal * pct / 100) : r2(parseMoney(r.amount));
  };
  const valid = !editing || rows.every(r => r.mechanic_id && valueOf(r) >= 0);
  const total = editing ? r2(rows.reduce((s, r) => s + valueOf(r), 0)) : r2(auto.reduce((s, x) => s + x.value, 0));
  async function save(wid: string, sid: string | null, osId: string): Promise<{ error: { message: string } | null }> {
    if (!editing) return { error: null };
    const { error } = await supabase.rpc('set_os_commissions', {
      p_workshop: wid, p_session: sid, p_os: osId, p_manual: true,
      p_rows: rows.filter(r => r.mechanic_id).map(r => ({ mechanic_id: r.mechanic_id, amount: valueOf(r) })),
    });
    return { error };
  }
  return { loaded: true, editing, rows, setRows, auto, startEdit, backToRule, valid, total, save, osTotal, valueOf };
}

export function OsCommission({ c, team, className = 'mt-4 rounded-2xl border border-steel-200 px-4 py-3', children }: {
  c: CommissionCtl; team: Team; className?: string; children?: React.ReactNode;
}) {
  if (!c.loaded) return null;
  const name = (id: string) => team.find(t => t.id === id)?.name ?? 'Colaborador';
  const setRow = (key: number, patch: Partial<Row>) => c.setRows(rs => rs.map(r => r.key === key ? { ...r, ...patch } : r));

  return (
    <div className={className}>
      <div className="flex items-center justify-between gap-2">
        <div className="label !mb-0">💰 Comissões a pagar nesta OS</div>
        {c.editing
          ? <button type="button" onClick={c.backToRule} className="text-xs font-semibold text-steel-500 hover:text-steel-800">↺ Voltar para a regra</button>
          : <button type="button" onClick={c.startEdit} className="text-xs font-semibold text-brand-600">✏️ Alterar ou digitar valor</button>}
      </div>

      {!c.editing ? (
        <div className="mt-2 space-y-1 text-sm">
          {c.auto.length === 0 && (
            <p className="text-xs text-steel-500">
              Ninguém ganha comissão pela regra nesta OS.{' '}
              <button type="button" onClick={c.startEdit} className="font-semibold text-brand-600">Digitar o valor da comissão →</button>
            </p>
          )}
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
            <div key={r.key} className="rounded-xl bg-steel-50 p-2 space-y-2">
              <div className="flex gap-2 items-center">
                <select className={`input !py-1.5 text-sm flex-1 min-w-0 ${r.mechanic_id ? '' : '!border-pending-400'}`} value={r.mechanic_id}
                  onChange={e => setRow(r.key, { mechanic_id: e.target.value })}>
                  <option value="">Quem recebe…</option>
                  {team.filter(t => !t.no_commission || t.id === r.mechanic_id).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                <button type="button" onClick={() => c.setRows(rs => rs.filter(x => x.key !== r.key))}
                  className="text-steel-400 hover:text-alert-600 px-1" aria-label="Remover">✕</button>
              </div>
              <div className="flex flex-wrap gap-1.5 items-center">
                {MODES.map(m => (
                  <button key={m.key} type="button"
                    onClick={() => setRow(r.key, { mode: m.key, amount: m.key === 'fixo' ? moneyStr(c.valueOf(r)) : r.amount })}
                    className={`text-xs font-semibold px-2.5 py-1.5 rounded-full border transition ${
                      r.mode === m.key ? 'bg-steel-900 text-white border-steel-900' : 'bg-white text-steel-600 border-steel-200'}`}>
                    {m.label}
                  </button>
                ))}
                {r.mode === 'fixo' ? (
                  <input className="input !py-1.5 text-sm !w-28 ml-auto text-right" inputMode="decimal" placeholder="0,00" value={r.amount} autoFocus
                    onChange={e => setRow(r.key, { amount: e.target.value })} />
                ) : (
                  <span className="ml-auto text-sm font-bold">{brl(c.valueOf(r))}</span>
                )}
              </div>
              {r.mode !== 'fixo' && <div className="text-[11px] text-steel-400">{MODES.find(m => m.key === r.mode)?.label} do total da OS ({brl(c.osTotal)})</div>}
            </div>
          ))}
          {c.rows.length === 0 && (
            <p className="text-xs text-pending-800">Ninguém vai receber comissão nesta OS. Toque em “+ Incluir pessoa” para digitar um valor.</p>
          )}
          <button type="button" onClick={() => c.setRows(rs => [...rs, { key: ++seq, mechanic_id: '', mode: 'fixo', amount: '' }])}
            className="text-sm font-semibold text-brand-600">+ Incluir pessoa</button>
          <p className="text-[11px] text-steel-500">Valor fechado = o valor que você digitar, independente do cadastro. Substitui a regra só nesta OS.</p>
        </div>
      )}

      <div className="flex justify-between text-sm pt-2 mt-2 border-t border-steel-100">
        <span className="text-steel-500">Total de comissões</span><strong>{brl(c.total)}</strong>
      </div>
      <p className="text-[11px] text-steel-400 mt-1">A % do gerente sobre o faturamento da loja entra à parte, automática.</p>
      {children}
    </div>
  );
}

/**
 * Mesmo quadro na página da OS (inclusive OS já paga ou importada), com botão de salvar.
 * Usa os responsáveis já salvos nos itens; trocou "Quem fez" → a página remonta o quadro (key).
 */
export function OsCommissionCard({ os, team, wid, sid }: { os: ReceiveOs; team: Team; wid: string; sid: string | null }) {
  const [ver, setVer] = useState(0);
  return <CardInner key={ver} os={os} team={team} wid={wid} sid={sid} onSaved={() => setVer(v => v + 1)} />;
}

function CardInner({ os, team, wid, sid, onSaved }: { os: ReceiveOs; team: Team; wid: string; sid: string | null; onSaved: () => void }) {
  const a = useReceiveAssignments(os, team);
  const c = useOsCommission(os.id, a, team);
  const [busy, setBusy] = useState(false);
  const pending = c.editing || c.wasManual;

  async function save() {
    if (!c.valid) return toast.error('Escolha quem recebe cada comissão');
    setBusy(true);
    const { error } = await c.save(wid, sid);
    setBusy(false);
    if (error) return toast.error('Não consegui salvar as comissões: ' + error.message);
    toast.success(c.editing ? 'Comissões desta OS salvas ✓' : 'Comissão voltou para a regra ✓');
    onSaved();
  }

  if (a.items === null || !c.loaded) return null;
  return (
    <OsCommission c={c} team={team} className="card">
      {pending && (
        <div className="flex justify-end mt-3">
          <button onClick={save} disabled={busy || !c.valid} className="btn-primary text-sm">
            {busy ? 'Salvando…' : c.editing ? '💾 Salvar comissões' : '💾 Confirmar volta para a regra'}
          </button>
        </div>
      )}
    </OsCommission>
  );
}
