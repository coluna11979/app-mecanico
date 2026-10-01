import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { METHODS, RECEIVE_METHODS, brl, moneyStr, parseMoney, type PayMethod } from '@/lib/cash';
import { toast } from '@/components/ui/Toast';

type PaymentRow = {
  id: string; amount: number; discount: number; change_given: number; created_at: string;
  cancelled_at: string | null; cancel_reason: string | null; operator_id: string | null;
  service_order: {
    id: string; number: number | null; title: string;
    executor: 'workshop' | 'platform' | null; workshop_mechanic_id: string | null; mechanic: { name: string } | null;
    items: { kind: 'part' | 'labor'; executor: 'workshop' | 'platform' | null; mechanic: { name: string } | null }[];
    customer: { full_name: string } | null; vehicle: { plate: string | null; make: string | null; model: string | null } | null;
  } | null;
  entries: { method: PayMethod; amount: number; installments: number; cancelled_at?: string | null }[];
};

type Filter =
  | { registerId: string }
  | { serviceOrderId: string }
  | { workshopId: string; from: string; to: string };

export type PaidOs = NonNullable<PaymentRow['service_order']>;

/** Responsáveis da OS paga: por serviço quando há serviços lançados, senão o responsável geral */
export function paidResponsibles(os: PaidOs): { label: string; missing: boolean } {
  const labor = (os.items ?? []).filter(i => i.kind === 'labor');
  if (!labor.length) {
    // Só peças (venda de balcão): não tem serviço, não precisa de responsável
    if ((os.items ?? []).length) return { label: '🛒 Venda de peças', missing: false };
    if (os.executor === 'platform') return { label: '🌐 Mecânico da plataforma', missing: false };
    return os.mechanic ? { label: `🔧 ${os.mechanic.name}`, missing: false } : { label: '⚠️ Sem responsável pelo serviço', missing: true };
  }
  const names = new Set<string>();
  let missing = false;
  for (const i of labor) {
    if (i.executor === 'platform') names.add('🌐 Plataforma');
    else if (i.mechanic?.name ?? os.mechanic?.name) names.add(`🔧 ${i.mechanic?.name ?? os.mechanic!.name}`);
    else if (os.executor === 'platform') names.add('🌐 Plataforma');
    else missing = true;
  }
  if (missing) names.add('⚠️ serviço sem responsável');
  return { label: [...names].join(' · '), missing };
}

const osNum = (o: { id: string; number: number | null }) => (o.number != null ? String(o.number).padStart(4, '0') : o.id.slice(0, 8));

/**
 * Histórico de recebimentos de OS: de qual OS veio, cliente, placa, formas de
 * pagamento, quem recebeu e quando. Cada linha leva para a OS.
 */
export default function PaymentsList({ filter, showOs = true, empty = 'Nenhum recebimento ainda.', reloadKey, title, action, fix, openFix }: {
  filter: Filter; showOs?: boolean; empty?: string | null; reloadKey?: unknown;
  /** Botão ao lado da linha (ex.: Caixa → definir responsável / chamar mecânico) */
  action?: (os: PaidOs) => ReactNode;
  /** Título mostrado acima da lista (some junto quando `empty` é null e não há nada) */
  title?: string;
  /** Mostra "✏️ Corrigir" em cada pagamento (trocar a forma sem reabrir a OS) */
  fix?: { wid: string; sid: string | null };
  /** Muda de valor → abre a correção (um pagamento só) ou rola até a lista para escolher */
  openFix?: number;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [fixing, setFixing] = useState<PaymentRow | null>(null);
  const [bump, setBump] = useState(0);
  const [rows, setRows] = useState<PaymentRow[] | null>(null);
  const [ops, setOps]   = useState<Record<string, string>>({});
  const fkey = JSON.stringify(filter);

  useEffect(() => {
    let alive = true;
    (async () => {
      let q = supabase.from('os_payments')
        .select('id, amount, discount, change_given, created_at, cancelled_at, cancel_reason, operator_id, workshop_id, '
          + 'service_order:service_orders(id, number, title, executor, workshop_mechanic_id, mechanic:workshop_mechanics!fk_so_workshop_mechanic(name), items:service_order_items!service_order_items_service_order_id_fkey(kind, executor, mechanic:workshop_mechanics(name)), customer:customers(full_name), vehicle:vehicles(plate, make, model)), '
          + 'entries:cash_entries(method, amount, installments, cancelled_at)')
        .order('created_at', { ascending: false }).limit(300);
      if ('registerId' in filter) q = q.eq('register_id', filter.registerId);
      else if ('serviceOrderId' in filter) q = q.eq('service_order_id', filter.serviceOrderId);
      else q = q.eq('workshop_id', filter.workshopId).gte('created_at', filter.from).lt('created_at', filter.to);
      const { data } = await q;
      if (!alive) return;
      const list = (data as unknown as (PaymentRow & { workshop_id: string })[]) ?? [];
      setRows(list);
      const wid = list[0]?.workshop_id;
      if (wid) {
        const { data: o } = await supabase.from('workshop_operators').select('id, name').eq('workshop_id', wid);
        if (alive) setOps(Object.fromEntries(((o as { id: string; name: string }[]) ?? []).map(x => [x.id, x.name])));
      }
    })();
    return () => { alive = false; };
  }, [fkey, reloadKey, bump]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!openFix || !rows) return;
    const active = rows.filter(r => !r.cancelled_at);
    if (active.length === 1) setFixing(active[0]);
    else if (active.length === 0) toast.info('Esta OS ainda não tem pagamento lançado — receba pelo Caixa.');
    else { boxRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); toast.info('Toque em ✏️ Corrigir no pagamento que quer mudar.'); }
  }, [openFix]); // eslint-disable-line react-hooks/exhaustive-deps

  if (rows === null) return empty === null ? null : <div className="space-y-2">{[1, 2].map(i => <div key={i} className="h-14 bg-white rounded-2xl animate-pulse" />)}</div>;
  if (rows.length === 0) {
    if (empty === null) return null;
    return <div>{title && <h2 className="text-sm font-bold text-steel-700 mb-2">{title}</h2>}<div className="card text-center py-8 text-sm text-steel-500">{empty}</div></div>;
  }

  const valid = rows.filter(r => !r.cancelled_at);
  return (
    <div ref={boxRef}>
    {title && (
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
        <h2 className="text-sm font-bold text-steel-700">{title}</h2>
        <span className="text-xs text-steel-500">{valid.length} recebimento{valid.length === 1 ? '' : 's'} · <strong className="text-steel-700">{brl(valid.reduce((a, r) => a + Number(r.amount), 0))}</strong></span>
      </div>
    )}
    <div className="card p-0 divide-y divide-steel-100">
      {rows.map(p => {
        const os = p.service_order;
        const cancelled = !!p.cancelled_at;
        // Pagamento corrigido: as partes antigas ficam estornadas — mostra só as atuais
        const forms = p.entries.filter(e => cancelled || !e.cancelled_at).map(e =>
          `${METHODS[e.method]?.icon ?? ''} ${METHODS[e.method]?.label ?? e.method}${e.installments > 1 ? ` ${e.installments}x` : ''} ${brl(e.amount)}`);
        const body = (
          <>
            <div className="text-xs text-steel-400 w-16 shrink-0 leading-tight">
              {new Date(p.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}<br />
              {new Date(p.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </div>
            <div className="flex-1 min-w-0">
              {showOs && os && (
                <div className={`text-sm font-semibold truncate ${cancelled ? 'line-through' : ''}`}>
                  OS nº {osNum(os)} · {os.customer?.full_name ?? 'Sem cliente'}
                  {os.vehicle?.plate ? <span className="font-normal text-steel-500"> · {os.vehicle.plate}</span> : null}
                </div>
              )}
              <div className="text-xs text-steel-500 truncate">{forms.join(' + ')}</div>
              {showOs && os && !cancelled && (() => {
                const r = paidResponsibles(os);
                return <div className={`text-[11px] truncate ${r.missing ? 'text-pending-800 font-semibold' : 'text-steel-500'}`}>{r.label}</div>;
              })()}
              <div className="text-[11px] text-steel-400 truncate">
                {[p.operator_id && ops[p.operator_id] ? `recebido por ${ops[p.operator_id]}` : null,
                  p.discount > 0 ? `desconto ${brl(p.discount)}` : null,
                  p.change_given > 0 ? `troco ${brl(p.change_given)}` : null,
                  cancelled ? `ESTORNADO: ${p.cancel_reason}` : null].filter(Boolean).join(' · ')}
              </div>
            </div>
            <div className={`font-bold shrink-0 ${cancelled ? 'text-steel-400 line-through' : 'text-signal-700'}`}>{brl(p.amount)}</div>
            {fix && !cancelled && (
              <button type="button" onClick={e => { e.preventDefault(); e.stopPropagation(); setFixing(p); }}
                className="btn-secondary text-xs !px-2.5 !py-1.5 shrink-0 whitespace-nowrap" title="Trocar a forma de pagamento sem reabrir a OS">✏️ Corrigir</button>
            )}
            {showOs && os && <span className="text-steel-300 shrink-0">›</span>}
          </>
        );
        return showOs && os ? (
          <div key={p.id} className="flex items-center">
            <Link to={`/oficina/os/${os.id}`} className={`flex-1 min-w-0 flex items-center gap-3 px-4 py-3 hover:bg-steel-50 transition ${cancelled ? 'opacity-60' : ''}`}>
              {body}
            </Link>
            {action && !cancelled && <div className="pr-4 shrink-0">{action(os)}</div>}
          </div>
        ) : (
          <div key={p.id} className={`flex items-center gap-3 px-4 py-3 ${cancelled ? 'opacity-60' : ''}`}>{body}</div>
        );
      })}
    </div>
    {fixing && fix && (
      <FixPaymentModal payment={fixing} wid={fix.wid} sid={fix.sid}
        onClose={() => setFixing(null)}
        onDone={() => { setFixing(null); setBump(b => b + 1); }} />
    )}
    </div>
  );
}

/** 'depois' = essa parte não foi paga: sai do recebimento e a OS fica em "Pagar depois" com vencimento */
const LATER = 'depois' as const;
type Part = { method: PayMethod | typeof LATER; amount: string; installments: number };

/** Corrigir as formas de um pagamento já lançado (mesma data, caixa e quem recebeu) */
function FixPaymentModal({ payment, wid, sid, onClose, onDone }: {
  payment: PaymentRow; wid: string; sid: string | null; onClose: () => void; onDone: () => void;
}) {
  const current = payment.entries.filter(e => !e.cancelled_at);
  const [parts, setParts] = useState<Part[]>(() => current.length
    ? current.map(e => ({ method: RECEIVE_METHODS.includes(e.method) ? e.method : 'pix', amount: moneyStr(Number(e.amount)), installments: e.installments || 1 }))
    : [{ method: 'pix', amount: moneyStr(Number(payment.amount)), installments: 1 }]);
  const [busy, setBusy] = useState(false);
  const [dueDate, setDueDate] = useState(() => { const d = new Date(); d.setDate(d.getDate() + 7); return d.toISOString().slice(0, 10); });
  const [laterNote, setLaterNote] = useState('');
  const total = Math.round(parts.reduce((a, p) => a + parseMoney(p.amount), 0) * 100) / 100;
  const paidParts = parts.filter(p => p.method !== LATER);
  const paidNow = Math.round(paidParts.reduce((a, p) => a + parseMoney(p.amount), 0) * 100) / 100;
  const laterAmount = Math.round((total - paidNow) * 100) / 100;
  const deferring = laterAmount > 0.004;
  const original = Number(payment.amount);
  const diff = Math.round((total - original) * 100) / 100;
  const setPart = (i: number, patch: Partial<Part>) => setParts(ps => ps.map((p, j) => (j === i ? { ...p, ...patch } : p)));

  async function save() {
    if (parts.some(p => !(parseMoney(p.amount) > 0))) return toast.error('Informe o valor de cada forma');
    if (deferring && !dueDate) return toast.error('Informe até quando o cliente vai pagar');
    if (Math.abs(diff) > 0.004 && !confirm(`O total muda de ${brl(original)} para ${brl(total)}. Confirmar?`)) return;
    setBusy(true);
    // Só o que foi pago de verdade fica no recebimento (vazio = nada foi pago)
    const { error } = await supabase.rpc('cash_fix_payment', {
      p_workshop: wid, p_session: sid, p_payment: payment.id,
      p_parts: paidParts.map(p => ({ method: p.method, amount: parseMoney(p.amount), installments: p.installments })),
    });
    if (error) { setBusy(false); return toast.error(error.message); }
    if (deferring && payment.service_order) {
      const { error: lErr } = await supabase.rpc('cash_pay_later', {
        p_workshop: wid, p_session: sid, p_os: payment.service_order.id, p_due: dueDate, p_note: laterNote,
      });
      if (lErr) { setBusy(false); return toast.error('Pagamento corrigido, mas o "pagar depois" não foi salvo: ' + lErr.message); }
    }
    setBusy(false);
    toast.success(deferring
      ? `Corrigido ✓ — ${brl(laterAmount)} para pagar até ${new Date(`${dueDate}T12:00:00`).toLocaleDateString('pt-BR')}`
      : 'Pagamento corrigido ✓');
    onDone();
  }

  return (
    <div className="fixed inset-0 z-50 bg-steel-900/60 grid place-items-center p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl w-full max-w-md max-h-[92vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold">✏️ Corrigir pagamento</h2>
            <div className="text-sm text-steel-500">
              {new Date(payment.created_at).toLocaleDateString('pt-BR')} · {brl(original)}
              {payment.service_order ? ` · OS nº ${osNum(payment.service_order)}` : ''}
            </div>
          </div>
          <button onClick={onClose} className="text-steel-400 hover:text-steel-700 text-xl leading-none" aria-label="Fechar">×</button>
        </div>
        <p className="text-[11px] text-steel-500 mt-2">A OS continua concluída; data, caixa e quem recebeu não mudam.</p>

        <div className="label mt-4 mb-2">Formas de pagamento</div>
        <div className="space-y-2">
          {parts.map((p, i) => (
            <div key={i} className="flex gap-2 items-center">
              <select className={`input flex-1 min-w-0 ${p.method === LATER ? '!border-brand-300 !bg-brand-50' : ''}`} value={p.method} onChange={e => setPart(i, { method: e.target.value as Part['method'], installments: 1 })}>
                {RECEIVE_METHODS.map(m => <option key={m} value={m}>{METHODS[m].icon} {METHODS[m].label}</option>)}
                <option value={LATER}>🕒 Pagar depois</option>
              </select>
              {p.method === 'credito' && (
                <select className="input !w-16 shrink-0 !px-2" value={p.installments} onChange={e => setPart(i, { installments: Number(e.target.value) })}>
                  {Array.from({ length: 12 }, (_, k) => k + 1).map(n => <option key={n} value={n}>{n}x</option>)}
                </select>
              )}
              <input className="input !w-28 shrink-0 text-right" inputMode="decimal" placeholder="0,00" value={p.amount} onChange={e => setPart(i, { amount: e.target.value })} />
              {parts.length > 1 && (
                <button onClick={() => setParts(ps => ps.filter((_, j) => j !== i))} className="text-steel-400 hover:text-alert-600 px-1" aria-label="Remover">✕</button>
              )}
            </div>
          ))}
        </div>
        <button onClick={() => setParts(ps => [...ps, { method: 'pix', amount: diff < 0 ? moneyStr(-diff) : '', installments: 1 }])}
          className="text-sm font-semibold text-brand-600 mt-2">+ Dividir em outra forma</button>

        <div className={`mt-3 text-sm font-semibold ${Math.abs(diff) < 0.005 ? 'text-signal-700' : 'text-pending-800'}`}>
          {Math.abs(diff) < 0.005 ? `✓ Total ${brl(total)} (igual ao lançado)` : `Total ${brl(total)} — ${diff > 0 ? 'a mais' : 'a menos'} ${brl(Math.abs(diff))} que o lançado`}
        </div>

        {deferring && (
          <div className="mt-3 rounded-2xl border-2 border-brand-300 bg-brand-50/40 p-3">
            <div className="font-semibold text-sm">🕒 {brl(laterAmount)} para pagar depois</div>
            <div className="text-[11px] text-steel-500">Sai do recebimento (não foi pago) e a OS fica em "Pagar depois" e no Financeiro → OS a receber.</div>
            <div className="grid sm:grid-cols-2 gap-2 mt-3">
              <label className="text-[11px] text-steel-500">Vai pagar até *
                <input type="date" className="input mt-0.5" value={dueDate} onChange={e => setDueDate(e.target.value)} />
              </label>
              <label className="text-[11px] text-steel-500">Observação (opcional)
                <input className="input mt-0.5" placeholder="Ex.: paga no dia 10" value={laterNote} onChange={e => setLaterNote(e.target.value)} />
              </label>
            </div>
          </div>
        )}

        <div className="flex gap-2 mt-6">
          <button onClick={onClose} className="btn-ghost flex-1">Cancelar</button>
          <button onClick={save} disabled={busy || total <= 0} className="btn-primary flex-[2]">
            {busy ? 'Salvando…' : deferring ? (paidNow > 0 ? `Salvar · ${brl(paidNow)} pago + ${brl(laterAmount)} depois` : `Salvar · ${brl(laterAmount)} para depois`) : 'Salvar correção'}
          </button>
        </div>
      </div>
    </div>
  );
}
