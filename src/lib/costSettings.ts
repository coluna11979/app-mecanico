/**
 * Parâmetros do custo real da equipe (por oficina): regime (define os encargos), benefícios mensais por mecânico
 * e o valor/hora do mecânico da plataforma no simulador de comparação.
 *
 * Encargos = provisões e contribuições que o empregador paga além do salário, em % do salário.
 * Percentuais padrão da legislação trabalhista — CONFIRME COM O CONTADOR antes de tratar como definitivo.
 */
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export type Regime = 'simples' | 'presumido';
export type CostCfg = { encargosPct: number; benefitsMonthly: number };

/** Encargos de quem está no Simples Nacional (sem INSS patronal) */
const BASE: [string, number][] = [
  ['FGTS', 8],
  ['13º salário (provisão)', 8.33],
  ['Férias + 1/3 (provisão)', 11.11],
  ['FGTS sobre 13º e férias', 1.56],
  ['Rescisão (multa de 40% do FGTS)', 3.2],
];
/** Lucro presumido/real: soma INSS patronal, RAT e terceiros */
const PRESUMIDO_EXTRA: [string, number][] = [
  ['INSS patronal', 20],
  ['RAT (seguro acidente)', 2],
  ['Terceiros (Sistema S)', 5.8],
];

export const REGIMES: Record<Regime, { label: string; items: [string, number][] }> = {
  simples: { label: 'Simples Nacional', items: BASE },
  presumido: { label: 'Lucro presumido / real', items: [...BASE, ...PRESUMIDO_EXTRA] },
};
export const encargosPctOf = (r: Regime) => Math.round(REGIMES[r].items.reduce((a, [, v]) => a + v, 0) * 100) / 100;

export type CostSettings = { regime: Regime; benefits_monthly: number; platform_hourly: number };
export const DEFAULT_SETTINGS: CostSettings = { regime: 'simples', benefits_monthly: 0, platform_hourly: 80 };

export const cfgOf = (s: CostSettings): CostCfg => ({ encargosPct: encargosPctOf(s.regime), benefitsMonthly: s.benefits_monthly });

/** Lê e grava os parâmetros da oficina (só o dono altera; sem registro usa o padrão) */
export function useCostSettings(wid: string | null | undefined) {
  const [settings, setSettings] = useState<CostSettings | null>(null);

  useEffect(() => {
    if (!wid) return;
    let alive = true;
    supabase.from('workshop_cost_settings').select('regime, benefits_monthly, platform_hourly').eq('workshop_id', wid).maybeSingle()
      .then(({ data }) => {
        if (!alive) return;
        const d = data as { regime: Regime; benefits_monthly: number; platform_hourly: number } | null;
        setSettings(d ? { regime: d.regime, benefits_monthly: Number(d.benefits_monthly), platform_hourly: Number(d.platform_hourly) } : DEFAULT_SETTINGS);
      });
    return () => { alive = false; };
  }, [wid]);

  const save = useCallback(async (patch: Partial<CostSettings>) => {
    if (!wid) return { error: null };
    const next = { ...(settings ?? DEFAULT_SETTINGS), ...patch };
    setSettings(next);
    return supabase.from('workshop_cost_settings').upsert({ workshop_id: wid, ...next, updated_at: new Date().toISOString() }, { onConflict: 'workshop_id' });
  }, [wid, settings]);

  return { settings, save };
}
