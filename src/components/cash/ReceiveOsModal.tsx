import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from '@/components/ui/Toast';
import { OsCommission, useOsCommission } from '@/components/cash/OsCommission';
import { ReceiveAssignments, useReceiveAssignments } from '@/components/cash/ReceiveAssignments';
import { METHODS, RECEIVE_METHODS, brl, moneyStr, parseMoney, type PayMethod } from '@/lib/cash';
import type { WorkshopMechanic } from '@/types/database';

/**
 * Receber uma OS: data do pagamento (hoje = entra no caixa aberto; dia anterior = fora do caixa),
 * formas de pagamento, desconto, troco e "pagar depois". Usado no Caixa e na Visão financeira.
 */
export type ReceiveOs = {
  id: string; number: number | null; title: string; price: number; paid_amount: number; counter_discount: number;
  status: string; completed_at: string | null; created_at: string;
  executor: 'workshop' | 'platform' | null; workshop_mechanic_id: string | null;
  customer: { full_name: string } | null; vehicle: { plate: string | null; make: string | null; model: string | null } | null;
  pay_later_due?: string | null; pay_later_note?: string | null;
};

/** Campos que o recebimento precisa (para buscar a OS) */
export const RECEIVE_OS_SELECT = 'id, number, title, price, paid_amount, counter_discount, status, completed_at, created_at, executor, workshop_mechanic_id, pay_later_due, pay_later_note, customer:customers(full_name), vehicle:vehicles(plate, make, model)';

const osNum = (o: { id: string; number: number | null }) => (o.number != null ? String(o.number).padStart(4, '0') : o.id.slice(0, 8));
const remainingOf = (o: ReceiveOs) => Math.round((o.price - o.counter_discount - o.paid_amount) * 100) / 100;

function Line({ label, value, cls = '' }: { label: string; value: string; cls?: string }) {
  return <div className="flex justify-between gap-3"><span className="text-steel-500">{label}</span><span className={`font-semibold ${cls}`}>{value}</span></div>;
}

/** 'depois' = Pagar depois: essa parte não entra no caixa agora, vira conta a receber com vencimento */
const LATER = 'depois' as const;
type Part = { method: PayMethod | typeof LATER; amount: string; installments: number };

export default function ReceiveOsModal({ os, wid, sid, canDiscount, team, cashClosed, onClose, onDone }: {
  os: ReceiveOs; wid: string; sid: string | null; canDiscount: boolean; team: WorkshopMechanic[];
  /** Aberto fora do Caixa sem caixa aberto: hoje não dá, só pagamento de dia anterior ou "pagar depois" */
  cashClosed?: boolean;
  onClose: () => void; onDone: (callPlatform: boolean) => void;
}) {
  const open = remainingOf(os);
  const who = useReceiveAssignments(os, team);
  const comm = useOsCommission(os.id, who, team);
  const [discount, setDiscount] = useState('');
  const [parts, setParts] = useState<Part[]>([{ method: 'dinheiro', amount: moneyStr(open), installments: 1 }]);
  const [given, setGiven] = useState('');
  const [busy, setBusy]   = useState(false);
  // "Pagar depois" (uma das formas): vencimento e observação
  const [dueDate, setDueDate] = useState(os.pay_later_due ?? (() => { const d = new Date(); d.setDate(d.getDate() + 7); return d.toISOString().slice(0, 10); })());
  const [laterNote, setLaterNote] = useState(os.pay_later_note ?? '');
  /** Data do pagamento: hoje (entra neste caixa) ou dia anterior (fora do caixa, com aquela data) */
  const todayYmd = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();
  const [payDay, setPayDay] = useState(todayYmd);
  const pastPay = payDay < todayYmd;

  const disc = parseMoney(discount);
  const due = Math.max(0, Math.round((open - disc) * 100) / 100);
  const total = Math.round(parts.reduce((a, p) => a + parseMoney(p.amount), 0) * 100) / 100;
  const missing = Math.round((due - total) * 100) / 100;
  /** Recebido agora (sem o "pagar depois") e o que fica para depois */
  const paidParts = parts.filter(p => p.method !== LATER && parseMoney(p.amount) > 0);
  const paidNow = Math.round(paidParts.reduce((a, p) => a + parseMoney(p.amount), 0) * 100) / 100;
  const laterAmount = Math.round((total - paidNow) * 100) / 100;
  const deferring = laterAmount > 0.004;
  const cashPart = parts.filter(p => p.method === 'dinheiro').reduce((a, p) => a + parseMoney(p.amount), 0);
  const givenN = parseMoney(given);
  const change = given ? Math.round((givenN - cashPart) * 100) / 100 : 0;

  const setPart = (i: number, patch: Partial<Part>) => setParts(ps => ps.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  function addPart() {
    const used = new Set(parts.map(p => p.method));
    const next = RECEIVE_METHODS.find(m => !used.has(m)) ?? 'pix';
    setParts(ps => [...ps, { method: next, amount: missing > 0 ? moneyStr(missing) : '', installments: 1 }]);
  }

  async function confirmReceive() {
    if (!who.valid) return toast.error('Informe quem fez cada serviço: mecânico da loja ou da plataforma');
    if (!comm.valid) return toast.error('Escolha quem recebe cada comissão');
    if (total <= 0) return toast.error('Informe o valor recebido');
    if (missing < -0.004) return toast.error('O total passa do valor em aberto');
    if (!pastPay && given && givenN < cashPart) return toast.error('O valor entregue é menor que a parte em dinheiro');
    if (deferring && !dueDate) return toast.error('Informe até quando o cliente vai pagar');
    if (deferring && missing > 0.004) return toast.error(`Falta ${brl(missing)} — some no "Pagar depois" ou em outra forma`);
    if (missing > 0.004 && !confirm(`Vai ficar faltando ${brl(missing)} nesta OS. Confirmar recebimento parcial?`)) return;
    setBusy(true);
    const { error: rErr } = await who.save();
    if (rErr) { setBusy(false); return toast.error('Não consegui salvar quem fez: ' + rErr.message); }
    const { error: cErr } = await comm.save(wid, sid);
    if (cErr) { setBusy(false); return toast.error('Não consegui salvar as comissões: ' + cErr.message); }
    if (paidNow > 0 && pastPay) {
      // Pago em dia anterior: fora do caixa de hoje, com a data em que o cliente pagou
      if (disc > 0) { setBusy(false); return toast.error('Desconto só no recebimento de hoje. Para pagamento antigo, ajuste o valor da OS.'); }
      const { error } = await supabase.rpc('cash_receive_os_past', {
        p_workshop: wid, p_session: sid, p_os: os.id,
        p_parts: paidParts.map(p => ({ method: p.method, amount: parseMoney(p.amount), installments: p.installments })),
        p_paid_at: new Date(`${payDay}T12:00:00`).toISOString(),
      });
      if (error) { setBusy(false); return toast.error(error.message); }
    } else if (paidNow > 0) {
      const { error } = await supabase.rpc('cash_receive_os', {
        p_workshop: wid, p_session: sid, p_os: os.id,
        p_parts: paidParts.map(p => ({ method: p.method, amount: parseMoney(p.amount), installments: p.installments })),
        p_discount: disc, p_cash_given: given ? givenN : null,
      });
      if (error) { setBusy(false); return toast.error(error.message); }
    }
    // Combinou pagar depois (ou desfez o combinado)
    if (deferring || os.pay_later_due) {
      const { error } = await supabase.rpc('cash_pay_later', {
        p_workshop: wid, p_session: sid, p_os: os.id,
        p_due: deferring ? dueDate : null, p_note: deferring ? laterNote : null,
      });
      if (error) { setBusy(false); return toast.error((paidNow > 0 ? 'Recebimento registrado, mas o "pagar depois" não foi salvo: ' : '') + error.message); }
    }
    setBusy(false);
    toast.success(deferring
      ? `${paidNow > 0 ? `Recebido ${brl(paidNow)} · ` : ''}${brl(laterAmount)} para pagar até ${new Date(`${dueDate}T12:00:00`).toLocaleDateString('pt-BR')}`
      : change > 0 ? `Recebido! Troco: ${brl(change)}` : 'Recebimento registrado');
    onDone(who.callPlatform);
  }

  return (
    <div className="fixed inset-0 z-50 bg-steel-900/60 grid place-items-center p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl w-full max-w-lg max-h-[92vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold">Receber OS nº {osNum(os)}</h2>
            <div className="text-sm text-steel-500">{os.customer?.full_name ?? 'Sem cliente'}{os.vehicle?.plate ? ` · ${os.vehicle.plate}` : ''}</div>
          </div>
          <button onClick={onClose} className="text-steel-400 hover:text-steel-700 text-xl leading-none" aria-label="Fechar">×</button>
        </div>

        <div className="rounded-2xl bg-steel-50 px-4 py-3 mt-4 space-y-1 text-sm">
          <Line label="Total da OS" value={brl(os.price)} />
          {os.counter_discount > 0 && <Line label="Desconto já dado" value={`− ${brl(os.counter_discount)}`} />}
          {os.paid_amount > 0 && <Line label="Já pago" value={`− ${brl(os.paid_amount)}`} />}
          {disc > 0 && <Line label="Desconto agora" value={`− ${brl(disc)}`} />}
          <div className="flex justify-between pt-1 border-t border-steel-200 text-base">
            <span className="font-semibold">A receber</span><span className="font-bold">{brl(due)}</span>
          </div>
        </div>

        <ReceiveAssignments a={who} team={team} />
        <OsCommission c={comm} team={team} />
        {who.callPlatform && (
          <p className="text-[11px] text-steel-500 mt-1">Depois de confirmar, abre a chamada do mecânico da plataforma com esses serviços.</p>
        )}

        {canDiscount && (
          <div className="mt-3">
            <div className="label mb-1">Desconto (R$)</div>
            <input className="input" inputMode="decimal" placeholder="0,00" value={discount} onChange={e => setDiscount(e.target.value)} />
          </div>
        )}

        <div className="mt-4 rounded-2xl border border-steel-200 px-3 py-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="label !mb-0">📅 Data do pagamento</span>
            <button type="button" onClick={() => setPayDay(todayYmd)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-full border ${!pastPay ? 'bg-steel-900 text-white border-steel-900' : 'bg-white text-steel-600 border-steel-200'}`}>
              Hoje
            </button>
            <input type="date" className="input !py-1.5 !text-xs !w-auto ml-auto" max={todayYmd} value={payDay}
              onChange={e => setPayDay(e.target.value && e.target.value <= todayYmd ? e.target.value : todayYmd)} />
          </div>
          {cashClosed && !pastPay && paidNow > 0 && (
            <p className="text-[11px] text-pending-800 mt-1.5">
              ⚠️ O caixa está fechado. Para receber com data de hoje, abra o caixa — ou escolha acima a data em que o cliente pagou.
            </p>
          )}
          {pastPay && (
            <p className="text-[11px] text-brand-700 mt-1.5">
              Pago em {new Date(`${payDay}T12:00:00`).toLocaleDateString('pt-BR')}: entra nessa data, <strong>fora do caixa de hoje</strong> (não conta na gaveta) e aparece nos Recebimentos daquele dia.
            </p>
          )}
        </div>

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
        <button onClick={addPart} className="text-sm font-semibold text-brand-600 mt-2">+ Adicionar outra forma</button>

        <div className={`mt-3 text-sm font-semibold ${Math.abs(missing) < 0.005 ? 'text-signal-700' : missing > 0 ? 'text-pending-800' : 'text-alert-600'}`}>
          {Math.abs(missing) < 0.005 ? '✓ Valor fechado' : missing > 0 ? `Falta ${brl(missing)}` : `Passou ${brl(-missing)} do valor em aberto`}
        </div>

        {/* Pagar depois (forma escolhida acima) */}
        {deferring && (
          <div className="mt-3 rounded-2xl border-2 border-brand-300 bg-brand-50/40 p-3">
            <div className="font-semibold text-sm">🕒 {brl(laterAmount)} para pagar depois</div>
            <div className="text-[11px] text-steel-500">Não entra na gaveta; fica em "Pagar depois" e no Financeiro até o cliente pagar.</div>
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

        {cashPart > 0 && !pastPay && (
          <div className="mt-4 grid grid-cols-2 gap-3 items-end">
            <div>
              <div className="label mb-1">Cliente entregou (R$)</div>
              <input className="input" inputMode="decimal" placeholder={moneyStr(cashPart)} value={given} onChange={e => setGiven(e.target.value)} />
            </div>
            <div className="rounded-xl bg-steel-50 px-3 py-2.5">
              <div className="text-[11px] text-steel-500">Troco</div>
              <div className={`text-lg font-bold ${change < 0 ? 'text-alert-600' : ''}`}>{brl(Math.max(0, change))}</div>
            </div>
          </div>
        )}

        <div className="flex gap-2 mt-6">
          <button onClick={onClose} className="btn-ghost flex-1">Cancelar</button>
          <button onClick={confirmReceive} disabled={busy || !who.valid || total <= 0 || missing < -0.004} className="btn-primary flex-[2] btn-lg">
            {busy ? 'Registrando…' : deferring ? (paidNow > 0 ? `Receber ${brl(paidNow)} · ${brl(laterAmount)} depois` : `Confirmar ${brl(laterAmount)} para depois`)
              : pastPay ? `Confirmar ${brl(total)} pago em ${new Date(`${payDay}T12:00:00`).toLocaleDateString('pt-BR')}` : `Confirmar ${brl(total)}`}
          </button>
        </div>
      </div>
    </div>
  );
}
