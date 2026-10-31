import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from '@/components/ui/Toast';
import { fmtBRL, moneyInput, parseMoney } from '@/components/os/osHelpers';
import { todayISO } from '@/lib/purchasing';

/**
 * Vale pago FORA do caixa (PIX, transferência, banco). Vira uma conta da categoria "Vales" já paga pelo banco,
 * ligada ao colaborador — a Folha desconta do salário do mês, igual ao vale lançado no Caixa.
 * Vale em dinheiro da gaveta continua em Caixa → Movimentações → Vale.
 */
export default function BankValeModal({ wid, team, onClose, onDone }: {
  wid: string; team: { id: string; name: string }[]; onClose: () => void; onDone: () => void;
}) {
  const [mechanic, setMechanic] = useState(team[0]?.id ?? '');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  async function save() {
    const value = parseMoney(amount);
    const who = team.find(t => t.id === mechanic);
    if (!who) return toast.error('Escolha o colaborador');
    if (!Number.isFinite(value) || value <= 0) return toast.error('Informe o valor do vale');
    if (!date) return toast.error('Informe a data');
    setBusy(true);
    const { data, error } = await supabase.from('payables').insert({
      workshop_id: wid, category: 'Vales', mechanic_id: mechanic, competence: date.slice(0, 7),
      description: `Vale · ${who.name}`, amount: value, due_date: date, notes: note.trim() || null,
    }).select('id').single();
    if (error || !data) { setBusy(false); return toast.error('Não foi possível registrar: ' + (error?.message ?? 'erro')); }
    const id = (data as { id: string }).id;
    const { error: e2 } = await supabase.rpc('payable_pay', { p_payable: id, p_from: 'banco', p_paid_at: date, p_session: null });
    if (e2) {
      // Não deixa uma conta de vale solta e sem pagamento
      await supabase.from('payables').update({ cancelled_at: new Date().toISOString() }).eq('id', id);
      setBusy(false);
      return toast.error('Não foi possível registrar: ' + e2.message);
    }
    setBusy(false);
    toast.success(`Vale de ${fmtBRL(value)} para ${who.name} registrado ✓ — será descontado na folha`);
    onDone();
  }

  return (
    <div className="fixed inset-0 z-50 bg-steel-900/60 grid place-items-center p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl w-full max-w-md max-h-[92vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold">Registrar vale</h2>
            <p className="text-sm text-steel-500 mt-0.5">Pago pelo banco ou PIX, fora do caixa. Entra no desconto da folha.</p>
          </div>
          <button onClick={onClose} className="text-steel-400 hover:text-steel-700 text-xl leading-none" aria-label="Fechar">×</button>
        </div>

        <div className="mt-4 space-y-3">
          <label className="block text-xs text-steel-500">Colaborador
            <select className="input mt-1" value={mechanic} onChange={e => setMechanic(e.target.value)}>
              {team.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs text-steel-500">Valor (R$)
              <input className="input mt-1 text-right" inputMode="decimal" placeholder="0,00" value={amount}
                onChange={e => setAmount(e.target.value)} onBlur={e => { const v = parseMoney(e.target.value); if (Number.isFinite(v) && v > 0) setAmount(moneyInput(v)); }} />
            </label>
            <label className="block text-xs text-steel-500">Data do vale
              <input type="date" className="input mt-1" value={date} onChange={e => setDate(e.target.value)} />
            </label>
          </div>
          <label className="block text-xs text-steel-500">Observação (opcional)
            <input className="input mt-1" placeholder="Ex.: adiantamento do dia 20 por PIX" value={note} onChange={e => setNote(e.target.value)} />
          </label>
          <p className="text-[11px] text-steel-400">Vale em dinheiro da gaveta: lance em Caixa → Movimentações → Vale. O vale vai para o mês da data escolhida.</p>
        </div>

        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="btn-ghost flex-1">Cancelar</button>
          <button onClick={save} disabled={busy} className="btn-primary flex-[2]">{busy ? 'Registrando…' : 'Registrar vale'}</button>
        </div>
      </div>
    </div>
  );
}
