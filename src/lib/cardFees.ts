/**
 * Taxa de cartão (maquininha): custo estimado sobre os recebimentos em cartão do caixa.
 * Débito → taxa do débito; crédito de 1 a 6x → taxa baixa; crédito de 7x em diante → taxa alta.
 * PIX e dinheiro não têm taxa. As taxas são por oficina (workshop_cost_settings) e valem como estimativa:
 * o valor real vem no extrato da maquininha.
 */
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { PayMethod } from '@/lib/cash';
import type { FinEntry } from '@/lib/finance';
import type { Range } from '@/lib/workshopMetrics';

/** Percentuais (ex.: 3.06 = 3,06%) */
export type CardFees = { debit: number; creditLow: number; creditHigh: number };
export const NO_FEES: CardFees = { debit: 0, creditLow: 0, creditHigh: 0 };
export const hasFees = (f: CardFees) => f.debit > 0 || f.creditLow > 0 || f.creditHigh > 0;

export const feeRate = (f: CardFees, method: PayMethod, installments: number) =>
  method === 'debito' ? f.debit : method === 'credito' ? (installments >= 7 ? f.creditHigh : f.creditLow) : 0;

const r2 = (n: number) => Math.round(n * 100) / 100;

export type CardFeeRow = { key: 'debito' | 'credito_low' | 'credito_high'; label: string; rate: number; base: number; fee: number };

/** Taxa de cartão dos recebimentos do período, por faixa */
export function cardFeesOf(entries: FinEntry[], r: Range, f: CardFees) {
  const rows: CardFeeRow[] = [
    { key: 'debito', label: 'Débito', rate: f.debit, base: 0, fee: 0 },
    { key: 'credito_low', label: 'Crédito 1 a 6x', rate: f.creditLow, base: 0, fee: 0 },
    { key: 'credito_high', label: 'Crédito 7x ou mais', rate: f.creditHigh, base: 0, fee: 0 },
  ];
  for (const x of entries) {
    if (x.kind !== 'recebimento' || (x.method !== 'debito' && x.method !== 'credito')) continue;
    const t = new Date(x.created_at).getTime();
    if (t < r.from.getTime() || t >= r.to.getTime()) continue;
    const row = x.method === 'debito' ? rows[0] : Number(x.installments) >= 7 ? rows[2] : rows[1];
    row.base += Number(x.amount);
  }
  for (const row of rows) { row.base = r2(row.base); row.fee = r2(row.base * row.rate / 100); }
  const base = r2(rows.reduce((a, x) => a + x.base, 0));
  const total = r2(rows.reduce((a, x) => a + x.fee, 0));
  return { rows, base, total };
}

/** Lê e grava as taxas da oficina (só o dono altera) */
export function useCardFees(wid: string | null | undefined) {
  const [fees, setFees] = useState<CardFees | null>(null);

  useEffect(() => {
    if (!wid) return;
    let alive = true;
    supabase.from('workshop_cost_settings').select('card_debit_pct, card_credit_low_pct, card_credit_high_pct').eq('workshop_id', wid).maybeSingle()
      .then(({ data }) => {
        if (!alive) return;
        const d = data as { card_debit_pct: number; card_credit_low_pct: number; card_credit_high_pct: number } | null;
        setFees(d ? { debit: Number(d.card_debit_pct), creditLow: Number(d.card_credit_low_pct), creditHigh: Number(d.card_credit_high_pct) } : NO_FEES);
      });
    return () => { alive = false; };
  }, [wid]);

  const save = useCallback(async (next: CardFees) => {
    if (!wid) return { error: null };
    setFees(next);
    return supabase.from('workshop_cost_settings').upsert({
      workshop_id: wid, card_debit_pct: next.debit, card_credit_low_pct: next.creditLow, card_credit_high_pct: next.creditHigh,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'workshop_id' });
  }, [wid]);

  return { fees, save };
}
