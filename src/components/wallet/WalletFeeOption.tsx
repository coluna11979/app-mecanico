import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { formatBRL } from '@/lib/payment';
import { useWallet } from '@/lib/wallet';

/**
 * "Pagar a multa com saldo": só com o saldo DEPOSITADO pela oficina.
 * O crédito liberado pela plataforma vale só para demandas, então não entra aqui.
 * Depositado cobre → botão de um toque; tem depositado mas não cobre → linha apagada; sem depositado → não aparece.
 */
export default function WalletFeeOption({ workshopId, amount, onPaid }: {
  workshopId: string; amount: number; onPaid: () => void;
}) {
  const { balance, enabled } = useWallet(workshopId);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!enabled || !balance || balance.cash <= 0) return null;

  if (balance.cash < amount) {
    return (
      <div className="rounded-2xl border-2 border-steel-100 bg-steel-50 px-4 py-3 opacity-70">
        <div className="font-bold text-steel-500">💰 Pagar a multa com saldo</div>
        <div className="text-xs text-steel-500 mt-0.5">Saldo depositado R$ {formatBRL(balance.cash)} · insuficiente para esta multa</div>
      </div>
    );
  }

  async function pay() {
    setPaying(true);
    setError(null);
    const { error: err } = await supabase.rpc('wallet_pay_fees', { p_workshop_id: workshopId });
    if (err) { setError(err.message || 'Não foi possível pagar com saldo. Tente de novo.'); setPaying(false); return; }
    onPaid();
  }

  return (
    <div className="space-y-2">
      <div className="rounded-2xl border-2 border-signal-500 bg-signal-500/5 p-4 space-y-3">
        <div>
          <div className="font-bold text-steel-900">💰 Pagar a multa com saldo</div>
          <div className="text-xs text-steel-500 mt-0.5">
            Saldo depositado: R$ {formatBRL(balance.cash)} · fica R$ {formatBRL(balance.cash - amount)}
          </div>
        </div>
        <button onClick={pay} disabled={paying} className="btn-primary w-full touch-manipulation disabled:opacity-60">
          {paying ? 'Pagando…' : `Pagar a multa: R$ ${formatBRL(amount)} com saldo`}
        </button>
        {error && <p className="text-sm text-alert-700 bg-alert-50 rounded-lg px-3 py-2">⚠️ {error}</p>}
      </div>
      <div className="flex items-center gap-3 text-[11px] text-steel-400 uppercase tracking-widest font-bold">
        <span className="h-px flex-1 bg-steel-200" />ou pague de outro jeito<span className="h-px flex-1 bg-steel-200" />
      </div>
    </div>
  );
}
