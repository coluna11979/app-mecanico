import { useEffect, useMemo, useState } from 'react';
import type { Range } from '@/lib/workshopMetrics';

/** Seletor de período (Hoje, 7 dias, Este mês, Mês passado, Personalizado) — usado nos painéis */
export type Preset = 'today' | '7d' | 'month' | 'lastMonth' | 'custom';

export const PRESETS: { key: Preset; label: string }[] = [
  { key: 'today',     label: 'Hoje' },
  { key: '7d',        label: '7 dias' },
  { key: 'month',     label: 'Este mês' },
  { key: 'lastMonth', label: 'Mês passado' },
  { key: 'custom',    label: 'Personalizado' },
];

export const PREV_LABEL: Record<Preset, string> = {
  today: 'vs. ontem', '7d': 'vs. 7 dias anteriores', month: 'vs. mesmo período antes',
  lastMonth: 'vs. mês retrasado', custom: 'vs. período anterior',
};

export const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
export const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const toInput = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function rangeOf(p: Preset, custom: { from: string; to: string }): Range {
  const today = startOfDay(new Date());
  switch (p) {
    case 'today':     return { from: today, to: addDays(today, 1) };
    case '7d':        return { from: addDays(today, -6), to: addDays(today, 1) };
    case 'month':     return { from: new Date(today.getFullYear(), today.getMonth(), 1), to: addDays(today, 1) };
    case 'lastMonth': return { from: new Date(today.getFullYear(), today.getMonth() - 1, 1), to: new Date(today.getFullYear(), today.getMonth(), 1) };
    case 'custom': {
      const from = custom.from ? new Date(`${custom.from}T00:00:00`) : addDays(today, -29);
      const to = custom.to ? addDays(new Date(`${custom.to}T00:00:00`), 1) : addDays(today, 1);
      return { from, to: to > from ? to : addDays(from, 1) };
    }
  }
}

/** Período escolhido (lembrado por tela no navegador) */
export function usePeriod(storageKey: string, fallback: Preset = 'month') {
  const [preset, setPreset] = useState<Preset>(() => {
    try { return (localStorage.getItem(storageKey) as Preset) || fallback; } catch { return fallback; }
  });
  const [custom, setCustom] = useState({ from: toInput(addDays(new Date(), -29)), to: toInput(new Date()) });
  useEffect(() => { try { localStorage.setItem(storageKey, preset); } catch { /* ignore */ } }, [storageKey, preset]);
  const range = useMemo(() => rangeOf(preset, custom), [preset, custom]);
  const label = `${range.from.toLocaleDateString('pt-BR')} a ${addDays(range.to, -1).toLocaleDateString('pt-BR')}`;
  return { preset, setPreset, custom, setCustom, range, label };
}

export default function PeriodPicker({ period }: { period: ReturnType<typeof usePeriod> }) {
  const { preset, setPreset, custom, setCustom } = period;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {PRESETS.map(p => (
        <button key={p.key} onClick={() => setPreset(p.key)}
          className={`text-sm font-semibold px-3 py-1.5 rounded-full border transition ${
            preset === p.key ? 'bg-steel-900 text-white border-steel-900' : 'bg-white text-steel-600 border-steel-200 hover:border-steel-300'}`}>
          {p.label}
        </button>
      ))}
      {preset === 'custom' && (
        <div className="flex items-center gap-1.5">
          <input type="date" className="input !py-1.5 !w-auto text-sm" value={custom.from} onChange={e => setCustom(c => ({ ...c, from: e.target.value }))} />
          <span className="text-steel-400 text-sm">a</span>
          <input type="date" className="input !py-1.5 !w-auto text-sm" value={custom.to} onChange={e => setCustom(c => ({ ...c, to: e.target.value }))} />
        </div>
      )}
    </div>
  );
}
