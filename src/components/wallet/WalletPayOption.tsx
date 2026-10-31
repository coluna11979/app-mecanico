import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { formatBRL } from '@/lib/payment';
import { useWallet } from '@/lib/wallet';

/**
 * "Pagar com saldo" no pagamento da chegada do mecânico.
 * Saldo cobre → botão de um toque; tem saldo mas não cobre → linha apagada; sem saldo → não aparece.
 * Depositar não fica aqui (só na Carteira). Quem fecha o modal é o Tracking, quando pix_paid_at chega.
 */
export default function WalletPayOption({ workshopId, jobId, amount, onPaid }: {
  workshopId: string; jobId: string; amount: number; onPaid?: () => void;
}) {
  const { balance, enabled } = useWallet(workshopId);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!enabled || !balance || balance.total <= 0) return null;

  if (balance.total < amount) {
    return (
      <div className="rounded-2xl border-2 border-steel-100 bg-steel-50 px-4 py-3 opacity-70">
        <div className="font-bold text-steel-500">💰 Pagar com saldo</div>
        <div className="text-xs text-steel-500 mt-0.5">Saldo R$ {formatBRL(balance.total)} · insuficiente para esta demanda</div>
      </div>
    );
  }

  async function pay() {
    setPaying(true);
    setError(null);
    const { error: err } = await supabase.rpc('wallet_pay_job', { p_job_id: jobId });
    if (err) { setError(err.message || 'Não foi possível pagar com saldo. Tente de novo.'); setPaying(false); return; }
    onPaid?.();
  }

  return (
    <div className="space-y-2">
      <div className="rounded-2xl border-2 border-signal-500 bg-signal-500/5 p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="font-bold text-steel-900">💰 Pagar com saldo</div>
            <div className="text-xs text-steel-500 mt-0.5">Disponível: R$ {formatBRL(balance.total)} · fica R$ {formatBRL(balance.total - amount)}</div>
          </div>
          <span className="text-[10px] font-bold uppercase tracking-wider bg-signal-100 text-signal-700 rounded-full px-2 py-0.5 shrink-0">Na hora</span>
        </div>
        <button onClick={pay} disabled={paying} className="btn-primary w-full touch-manipulation disabled:opacity-60">
          {paying ? 'Pagando…' : `Pagar R$ ${formatBRL(amount)} com saldo`}
        </button>
        {error && <p className="text-sm text-alert-700 bg-alert-50 rounded-lg px-3 py-2">⚠️ {error}</p>}
      </div>
      <div className="flex items-center gap-3 text-[11px] text-steel-400 uppercase tracking-widest font-bold">
        <span className="h-px flex-1 bg-steel-200" />ou pague de outro jeito<span className="h-px flex-1 bg-steel-200" />
      </div>
    </div>
  );
}
