import type { Lead } from '@/types/database';

export type Temperatura = 'quente' | 'morno' | 'frio' | 'convertido' | 'perdido';

/**
 * Classifica o lead em temperatura com base em sinais objetivos:
 * - convertido/perdido: sai do funil
 * - status cadastro_iniciado ou interessado: quente
 * - contato recente (<3 dias): quente
 * - contato médio (3-10 dias): morno
 * - sem contato há 10+ dias (ou nunca): frio
 */
export function calcTemperatura(l: Lead): Temperatura {
  if (l.status === 'convertido') return 'convertido';
  if (l.status === 'perdido')    return 'perdido';
  if (l.status === 'cadastro_iniciado' || l.status === 'interessado') return 'quente';

  const ref = l.last_contact_at ?? l.created_at;
  const dias = (Date.now() - new Date(ref).getTime()) / (1000 * 60 * 60 * 24);
  if (dias < 3)  return 'quente';
  if (dias < 10) return 'morno';
  return 'frio';
}

export const TEMPERATURA_META: Record<Temperatura, { emoji: string; label: string; badgeCls: string; dotCls: string }> = {
  quente:     { emoji: '🔥', label: 'Quente',     badgeCls: 'bg-alert-50 text-alert-700 border-alert-200',       dotCls: 'bg-alert-500' },
  morno:      { emoji: '🌤️', label: 'Morno',      badgeCls: 'bg-pending-500/10 text-pending-700 border-pending-300', dotCls: 'bg-pending-500' },
  frio:       { emoji: '❄️', label: 'Frio',       badgeCls: 'bg-blue-50 text-blue-700 border-blue-200',         dotCls: 'bg-blue-400' },
  convertido: { emoji: '✅', label: 'Convertido', badgeCls: 'bg-signal-500/10 text-signal-700 border-signal-300', dotCls: 'bg-signal-500' },
  perdido:    { emoji: '🚫', label: 'Perdido',    badgeCls: 'bg-steel-100 text-steel-600 border-steel-200',     dotCls: 'bg-steel-400' },
};
