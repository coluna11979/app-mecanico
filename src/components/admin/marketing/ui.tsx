import { ReactNode } from 'react';

export const CHANNELS: { v: string; label: string; emoji: string }[] = [
  { v: 'instagram', label: 'Instagram', emoji: '📸' },
  { v: 'facebook',  label: 'Facebook',  emoji: '👍' },
  { v: 'google',    label: 'Google',    emoji: '🔎' },
  { v: 'whatsapp',  label: 'WhatsApp',  emoji: '💬' },
  { v: 'panfleto',  label: 'Panfleto / QR code', emoji: '🧾' },
  { v: 'evento',    label: 'Evento',    emoji: '🎪' },
  { v: 'email',     label: 'E-mail',    emoji: '✉️' },
  { v: 'outro',     label: 'Outro',     emoji: '🔗' },
];
export const channelLabel = (v: string) => CHANNELS.find(c => c.v === v) ?? { v, label: v, emoji: '🔗' };

export const AUDIENCES = [
  { v: 'all',      label: 'Todos' },
  { v: 'mechanic', label: 'Mecânicos' },
  { v: 'workshop', label: 'Oficinas' },
] as const;
export const audienceLabel = (v: string) => AUDIENCES.find(a => a.v === v)?.label ?? v;

export const UFS = ['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO'];

export const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const pct = (a: number, b: number) => (b > 0 ? `${((a / b) * 100).toFixed(0)}%` : '—');

/** Endereço público do app (links de campanha saem daqui). */
export const appOrigin = () => (typeof window !== 'undefined' ? window.location.origin : '');

export function slugify(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
}

export function Card({ title, subtitle, action, children }: { title: string; subtitle?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="bg-white border border-steel-200 rounded-2xl p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h3 className="font-bold text-steel-900">{title}</h3>
          {subtitle && <p className="text-xs text-steel-500 mt-0.5">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

export function Kpi({ label, value, hint, tone = 'steel' }: { label: string; value: ReactNode; hint?: string; tone?: 'steel' | 'brand' | 'signal' | 'pending' }) {
  const color = { steel: 'text-steel-900', brand: 'text-brand-600', signal: 'text-signal-700', pending: 'text-pending-700' }[tone];
  return (
    <div className="bg-white border border-steel-200 rounded-2xl p-4">
      <div className="text-xs font-semibold text-steel-500 uppercase tracking-wide">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${color}`}>{value}</div>
      {hint && <div className="text-xs text-steel-400 mt-0.5">{hint}</div>}
    </div>
  );
}

export function Empty({ emoji, title, text, action }: { emoji: string; title: string; text: string; action?: ReactNode }) {
  return (
    <div className="bg-white border border-dashed border-steel-300 rounded-2xl p-8 text-center">
      <div className="text-4xl mb-2">{emoji}</div>
      <p className="font-semibold text-steel-800">{title}</p>
      <p className="text-sm text-steel-500 mt-1 max-w-md mx-auto">{text}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-steel-100 px-5 py-4 flex items-center justify-between">
          <h3 className="font-bold text-steel-900">{title}</h3>
          <button onClick={onClose} className="h-10 w-10 grid place-items-center rounded-lg hover:bg-steel-100 text-steel-500" aria-label="Fechar">✕</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export async function copy(text: string) {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}
