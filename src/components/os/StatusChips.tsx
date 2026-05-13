import type { OsStatus } from '@/types/database';

type StatusValue = OsStatus | 'all';

interface StatusChipsProps {
  value: StatusValue;
  counts: Record<string, number>;
  total: number;
  onChange: (v: StatusValue) => void;
}

const ITEMS: Array<{ value: StatusValue; label: string; dot: string; active: string }> = [
  { value: 'all',         label: 'Todas',         dot: 'bg-steel-400',   active: 'bg-steel-800 text-white border-steel-800' },
  { value: 'open',        label: 'Abertas',       dot: 'bg-pending-500', active: 'bg-pending-100 text-pending-800 border-pending-300' },
  { value: 'in_progress', label: 'Em andamento',  dot: 'bg-brand-500',   active: 'bg-brand-100 text-brand-800 border-brand-300' },
  { value: 'completed',   label: 'Concluídas',    dot: 'bg-signal-500',  active: 'bg-signal-100 text-signal-800 border-signal-300' },
  { value: 'cancelled',   label: 'Canceladas',    dot: 'bg-steel-400',   active: 'bg-steel-200 text-steel-700 border-steel-300' },
];

export default function StatusChips({ value, counts, total, onChange }: StatusChipsProps) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-thin">
      {ITEMS.map((it) => {
        const isActive = value === it.value;
        const count = it.value === 'all' ? total : counts[it.value as string] ?? 0;
        return (
          <button
            key={it.value}
            onClick={() => onChange(it.value)}
            className={`shrink-0 inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-semibold transition ${
              isActive
                ? it.active
                : 'bg-white text-steel-600 border-steel-200 hover:border-steel-300'
            }`}
          >
            {it.value !== 'all' && <span className={`h-2 w-2 rounded-full ${it.dot}`} />}
            <span>{it.label}</span>
            <span
              className={`rounded-full px-1.5 py-px text-[10px] font-bold tabular-nums ${
                isActive ? 'bg-black/15' : 'bg-steel-100 text-steel-600'
              }`}
            >
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
