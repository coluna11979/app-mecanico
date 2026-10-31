import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { getSetting } from '@/lib/settings';

/* ── Carteira da oficina (0150) ───────────────────────────────────────────
   Saldo pré-pago para pagar demandas. cash = dinheiro que a oficina depositou;
   credit = crédito liberado pela plataforma (só vale para demandas). */

export type WalletBalance = { cash: number; credit: number; total: number };
export type WalletEntry = {
  id: string; workshop_id: string;
  kind: 'deposit' | 'credit' | 'job_payment' | 'refund' | 'withdrawal' | 'adjustment';
  bucket: 'cash' | 'credit';
  amount: number; job_id: string | null; note: string | null; created_at: string;
};
export type WalletConfig = { enabled: boolean; minDeposit: number; lowBalance: number };

export const KIND_LABEL: Record<WalletEntry['kind'], { label: string; icon: string }> = {
  deposit:     { label: 'Depósito',           icon: '⬆️' },
  credit:      { label: 'Crédito liberado',   icon: '🎁' },
  job_payment: { label: 'Demanda paga',       icon: '⚡' },
  refund:      { label: 'Estorno',            icon: '↩️' },
  withdrawal:  { label: 'Saque',              icon: '⬇️' },
  adjustment:  { label: 'Ajuste',             icon: '✏️' },
};

const num = (v: string, d: number) => Number(String(v).replace(',', '.')) || d;

export async function getWalletConfig(): Promise<WalletConfig> {
  const [enabled, min, low] = await Promise.all([
    getSetting('wallet_enabled', 'false'),
    getSetting('wallet_min_deposit', '50'),
    getSetting('wallet_low_balance', '100'),
  ]);
  return { enabled: enabled === 'true', minDeposit: num(min, 50), lowBalance: num(low, 100) };
}

export async function fetchWalletBalance(workshopId: string): Promise<WalletBalance> {
  const { data } = await supabase.rpc('wallet_balance', { p_workshop_id: workshopId });
  const row = (data as WalletBalance[] | null)?.[0];
  return { cash: Number(row?.cash ?? 0), credit: Number(row?.credit ?? 0), total: Number(row?.total ?? 0) };
}

/**
 * Configuração + saldo da oficina, atualizado sozinho a cada movimento (realtime no extrato).
 * `balance` fica null até carregar (e sempre null com a carteira desligada).
 */
export function useWallet(workshopId: string | null | undefined) {
  const [cfg, setCfg] = useState<WalletConfig | null>(null);
  const [balance, setBalance] = useState<WalletBalance | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => { getWalletConfig().then(setCfg); }, []);

  useEffect(() => {
    if (!workshopId || !cfg?.enabled) { setBalance(null); return; }
    let alive = true;
    fetchWalletBalance(workshopId).then(b => { if (alive) setBalance(b); });
    return () => { alive = false; };
  }, [workshopId, cfg?.enabled, tick]);

  useEffect(() => {
    if (!workshopId || !cfg?.enabled) return;
    const ch = supabase.channel(`wallet-${workshopId}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'workshop_wallet_entries', filter: `workshop_id=eq.${workshopId}` },
        () => setTick(t => t + 1))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [workshopId, cfg?.enabled]);

  return { cfg, balance, enabled: !!cfg?.enabled, refresh: () => setTick(t => t + 1) };
}
