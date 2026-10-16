import { useEffect } from 'react';
import { create } from 'zustand';

type ToastKind = 'success' | 'error' | 'info' | 'warning';

interface ToastItem {
  id: string;
  kind: ToastKind;
  message: string;
  duration: number;
}

interface ToastStore {
  items: ToastItem[];
  push: (kind: ToastKind, message: string, duration?: number) => void;
  remove: (id: string) => void;
}

const useToastStore = create<ToastStore>((set) => ({
  items: [],
  push: (kind, message, duration = 3500) => {
    const id = Math.random().toString(36).slice(2);
    set((s) => ({ items: [...s.items, { id, kind, message, duration }] }));
  },
  remove: (id) => set((s) => ({ items: s.items.filter((t) => t.id !== id) })),
}));

export const toast = {
  success: (m: string, d?: number) => useToastStore.getState().push('success', m, d),
  error:   (m: string, d?: number) => useToastStore.getState().push('error',   m, d),
  info:    (m: string, d?: number) => useToastStore.getState().push('info',    m, d),
  warning: (m: string, d?: number) => useToastStore.getState().push('warning', m, d),
};

const styles: Record<ToastKind, { bg: string; icon: string }> = {
  success: { bg: 'bg-signal-500 text-white', icon: '✓' },
  error:   { bg: 'bg-alert-500 text-white',  icon: '✕' },
  info:    { bg: 'bg-brand-500 text-white',  icon: 'ℹ' },
  warning: { bg: 'bg-pending-500 text-steel-900', icon: '⚠' },
};

function ToastItemView({ t }: { t: ToastItem }) {
  const remove = useToastStore((s) => s.remove);
  useEffect(() => {
    const id = setTimeout(() => remove(t.id), t.duration);
    return () => clearTimeout(id);
  }, [t.id, t.duration, remove]);

  const s = styles[t.kind];
  return (
    <div
      className={`${s.bg} shadow-card rounded-xl px-4 py-3 flex items-center gap-3 min-w-[260px] max-w-[420px] pointer-events-auto`}
      style={{ animation: 'fadeUp 200ms ease-out' }}
    >
      <span className="text-lg leading-none">{s.icon}</span>
      <span className="text-sm font-medium flex-1">{t.message}</span>
      <button
        onClick={() => remove(t.id)}
        className="text-lg leading-none opacity-70 hover:opacity-100"
        aria-label="Fechar"
      >
        ✕
      </button>
    </div>
  );
}

export function Toaster() {
  const items = useToastStore((s) => s.items);
  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
      {items.map((t) => (
        <ToastItemView key={t.id} t={t} />
      ))}
    </div>
  );
}
