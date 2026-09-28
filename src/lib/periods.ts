/** Períodos dos painéis (Painel, Financeiro): Hoje, 7 dias, Este mês… */
import type { Range } from '@/lib/workshopMetrics';

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
export const toInput = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

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

export const periodLabel = (r: Range) =>
  `${r.from.toLocaleDateString('pt-BR')} a ${addDays(r.to, -1).toLocaleDateString('pt-BR')}`;
