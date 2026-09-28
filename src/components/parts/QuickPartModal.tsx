import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from '@/components/ui/Toast';
import { useOperator } from '@/lib/operators';
import { fmtBRL, moneyInput, parseMoney } from '@/components/os/osHelpers';
import { UNITS, fmtPct, marginOf, priceFromMargin } from '@/lib/parts';
import { addDaysISO, todayISO, type Supplier } from '@/lib/purchasing';
import SupplierPicker from './SupplierPicker';

export type QuickPartResult = { part_id: string; name: string; cost: number; price: number; unit: string };

/**
 * Cadastrar uma peça sem sair da OS. Com "Comprei agora para esta OS" (o caso da
 * autopeças de pronta entrega): lança a compra — a peça entra no estoque (e sai
 * quando a OS for concluída) — e a conta: paga na hora ou para pagar depois.
 */
export default function QuickPartModal({ wid, osLabel, initialName, quantity, defaultMargin, onClose, onSaved }: {
  wid: string; osLabel: string; initialName: string; quantity: number; defaultMargin: number;
  onClose: () => void; onSaved: (r: QuickPartResult) => void;
}) {
  const { balcao, session } = useOperator();
  const sid = balcao ? session?.session_id ?? null : null;

  const [name, setName]         = useState(initialName);
  const [code, setCode]         = useState('');
  const [unit, setUnit]         = useState('un');
  const [cost, setCost]         = useState('');
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [bought, setBought]     = useState(true);
  const [qty, setQty]           = useState(String(quantity || 1).replace('.', ','));
  const [payNow, setPayNow]     = useState(true);
  const [from, setFrom]         = useState<'banco' | 'caixa'>('banco');
  const [due, setDue]           = useState(addDaysISO(todayISO(), 30));
  const [hasRegister, setHasRegister] = useState(false);
  const [saving, setSaving]     = useState(false);

  useEffect(() => {
    supabase.from('cash_registers').select('id').eq('workshop_id', wid).eq('status', 'open').maybeSingle()
      .then(({ data }) => setHasRegister(!!data));
  }, [wid]);
  // Prazo do fornecedor sugere o vencimento
  useEffect(() => { if (supplier) setDue(addDaysISO(todayISO(), supplier.payment_days || 30)); }, [supplier]);

  const c = Number.isFinite(parseMoney(cost)) ? parseMoney(cost) : 0;
  const q = Number.isFinite(parseMoney(qty)) ? parseMoney(qty) : 0;
  const price = priceFromMargin(c, defaultMargin);
  const total = Math.round(c * q * 100) / 100;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return toast.error('Informe o nome da peça');
    if (!(c > 0)) return toast.error('Informe o custo da peça');
    if (bought) {
      if (!supplier) return toast.error('Escolha ou cadastre a autopeças / fornecedor');
      if (!(q > 0)) return toast.error('Quantidade inválida');
      if (payNow && from === 'caixa' && !hasRegister) return toast.error('Abra o caixa para pagar com o dinheiro dele');
    }
    setSaving(true);
    try {
      const { data: part, error } = await supabase.from('workshop_parts')
        .insert({ workshop_id: wid, name: name.trim(), code: code.trim() || null, unit, cost: c, supplier_id: supplier?.id ?? null })
        .select('id').single();
      if (error) throw error;
      const partId = (part as { id: string }).id;

      if (bought && supplier) {
        const { data: inv, error: e2 } = await supabase.rpc('purchase_post', {
          p_workshop: wid, p_supplier: supplier.id, p_number: null, p_issue_date: todayISO(),
          p_freight: 0, p_discount: 0,
          p_items: [{ part_id: partId, quantity: q, unit_cost: c }],
          p_installments: [{ due_date: payNow ? todayISO() : due, amount: total }],
          p_notes: `Compra para a ${osLabel}`,
        });
        if (e2) throw e2;
        if (payNow) {
          const { data: pay } = await supabase.from('payables').select('id').eq('invoice_id', inv as string).limit(1).maybeSingle();
          if (pay) {
            const { error: e3 } = await supabase.rpc('payable_pay', { p_payable: (pay as { id: string }).id, p_from: from, p_paid_at: todayISO(), p_session: sid });
            if (e3) toast.warning('Peça e compra lançadas, mas o pagamento não: ' + e3.message + '. Pague em Contas a pagar.');
          }
        }
      }
      toast.success(bought ? 'Peça cadastrada e compra lançada ✓' : 'Peça cadastrada ✓');
      onSaved({ part_id: partId, name: name.trim(), cost: c, price, unit });
    } catch (err: unknown) {
      toast.error('Não foi possível salvar: ' + ((err as { message?: string })?.message ?? 'erro'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-steel-900/60 z-50 flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
      <form onSubmit={save} onClick={e => e.stopPropagation()}
        className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl max-h-[94vh] flex flex-col shadow-2xl">
        <div className="px-6 pt-5 pb-3 border-b border-steel-100 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold">Cadastrar peça</h2>
            <p className="text-xs text-steel-500">Fica no cadastro para as próximas OS.</p>
          </div>
          <button type="button" onClick={onClose} className="h-8 w-8 rounded-lg grid place-items-center text-steel-500 hover:bg-steel-100">✕</button>
        </div>

        <div className="px-6 py-4 space-y-4 overflow-y-auto">
          <div>
            <label className="label">Nome da peça *</label>
            <input className="input" value={name} onChange={e => setName(e.target.value)} autoFocus={!initialName} />
          </div>
          <div>
            <label className="label">Fornecedor / autopeças {bought && '*'}</label>
            <SupplierPicker wid={wid} value={supplier?.id ?? null} onChange={setSupplier} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-1">
              <label className="label">Custo unit. *</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-steel-400 text-sm">R$</span>
                <input className="input !pl-9 text-right" inputMode="decimal" placeholder="0,00" value={cost} autoFocus={!!initialName}
                  onChange={e => setCost(e.target.value)}
                  onBlur={e => { const v = parseMoney(e.target.value); if (Number.isFinite(v)) setCost(moneyInput(v)); }} />
              </div>
            </div>
            <div>
              <label className="label">Código</label>
              <input className="input" placeholder="Opcional" value={code} onChange={e => setCode(e.target.value)} />
            </div>
            <div>
              <label className="label">Unidade</label>
              <select className="input" value={unit} onChange={e => setUnit(e.target.value)}>
                {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 bg-steel-50 rounded-xl p-3 text-center">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-steel-500">Venda</div>
              <div className="text-lg font-bold font-display">{fmtBRL(price)}</div>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-steel-500">Lucro</div>
              <div className="text-lg font-bold font-display text-signal-700">{fmtBRL(price - c)}</div>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-steel-500">Margem</div>
              <div className="text-lg font-bold font-display">{fmtPct(marginOf(c, price))}</div>
            </div>
          </div>

          <label className="flex items-start gap-2 rounded-xl border border-steel-200 p-3 cursor-pointer">
            <input type="checkbox" className="mt-1" checked={bought} onChange={e => setBought(e.target.checked)} />
            <span>
              <span className="text-sm font-semibold">Comprei agora para esta OS</span>
              <span className="block text-xs text-steel-500">Lança a compra: entra no estoque, sai quando a OS for concluída, e a conta vai para o financeiro.</span>
            </span>
          </label>

          {bought && (
            <div className="rounded-2xl border border-steel-200 p-4 space-y-3">
              <div className="flex items-end gap-3">
                <div className="w-24">
                  <label className="label">Quantidade</label>
                  <input className="input text-right" inputMode="decimal" value={qty} onChange={e => setQty(e.target.value)} />
                </div>
                <div className="text-sm text-steel-600 pb-2.5">Total da compra: <strong>{fmtBRL(total)}</strong></div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setPayNow(true)}
                  className={`px-3 py-2 rounded-xl border text-sm font-semibold ${payNow ? 'bg-steel-900 text-white border-steel-900' : 'bg-white border-steel-200 text-steel-600'}`}>
                  Paguei na hora
                </button>
                <button type="button" onClick={() => setPayNow(false)}
                  className={`px-3 py-2 rounded-xl border text-sm font-semibold ${!payNow ? 'bg-steel-900 text-white border-steel-900' : 'bg-white border-steel-200 text-steel-600'}`}>
                  Vou pagar depois
                </button>
              </div>
              {payNow ? (
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setFrom('banco')}
                    className={`px-3 py-2 rounded-xl border text-xs font-semibold ${from === 'banco' ? 'bg-brand-50 border-brand-300 text-brand-700' : 'bg-white border-steel-200 text-steel-600'}`}>
                    🏦 PIX / cartão / banco
                  </button>
                  <button type="button" onClick={() => setFrom('caixa')} disabled={!hasRegister}
                    className={`px-3 py-2 rounded-xl border text-xs font-semibold disabled:opacity-40 ${from === 'caixa' ? 'bg-brand-50 border-brand-300 text-brand-700' : 'bg-white border-steel-200 text-steel-600'}`}>
                    💰 Dinheiro do caixa
                  </button>
                </div>
              ) : (
                <div>
                  <label className="label">Vencimento (conta na autopeças)</label>
                  <input type="date" className="input" value={due} onChange={e => setDue(e.target.value || todayISO())} />
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-steel-100 flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
          <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Salvando…' : bought ? 'Cadastrar e lançar compra' : 'Cadastrar peça'}</button>
        </div>
      </form>
    </div>
  );
}
