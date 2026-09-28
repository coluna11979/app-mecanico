import { supabase } from './supabase';

export type CheckupItemStatus = 'ok' | 'warn' | 'urgent' | 'na';

export interface VehicleCheckup {
  id: string;
  created_by: string;
  plate: string | null;
  make: string | null;
  model: string | null;
  year: number | null;
  km_reading: number | null;
  customer_name: string | null;
  customer_phone: string | null;
  score: number | null;
  status: 'draft' | 'completed';
  notes: string | null;
  public_token: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface CheckupItem {
  id: string;
  checkup_id: string;
  system: string;
  item_key: string;
  label: string;
  position: number;
  status: CheckupItemStatus | null;
  measurement: string | null;
  note: string | null;
  photo_path: string | null;
}

/* ─── Checklist padrão ─────────────────────────────────────────
   `measure` = placeholder do campo de medição (quando faz sentido). */
type TemplateItem = { key: string; label: string; measure?: string };
export const CHECKUP_TEMPLATE: { system: string; icon: string; items: TemplateItem[] }[] = [
  { system: 'Motor', icon: '🛢️', items: [
    { key: 'oleo_nivel',      label: 'Óleo do motor (nível e cor)' },
    { key: 'filtro_ar',       label: 'Filtro de ar' },
    { key: 'correia',         label: 'Correia (acessórios / dentada)' },
    { key: 'velas',           label: 'Velas e cabos' },
    { key: 'vazamentos',      label: 'Vazamentos (óleo, fluidos)' },
    { key: 'coxins',          label: 'Coxins do motor' },
  ]},
  { system: 'Arrefecimento', icon: '🌡️', items: [
    { key: 'fluido_arref',    label: 'Fluido de arrefecimento (nível e cor)' },
    { key: 'mangueiras',      label: 'Mangueiras e abraçadeiras' },
    { key: 'radiador',        label: 'Radiador e ventoinha' },
  ]},
  { system: 'Freios', icon: '🛑', items: [
    { key: 'pastilhas_diant', label: 'Pastilhas dianteiras', measure: '% restante' },
    { key: 'discos',          label: 'Discos de freio' },
    { key: 'freio_tras',      label: 'Freio traseiro (lonas/pastilhas)' },
    { key: 'fluido_freio',    label: 'Fluido de freio' },
    { key: 'freio_mao',       label: 'Freio de mão' },
  ]},
  { system: 'Suspensão e direção', icon: '🔧', items: [
    { key: 'amortecedores',   label: 'Amortecedores' },
    { key: 'pivos_bandejas',  label: 'Pivôs e buchas das bandejas' },
    { key: 'terminais',       label: 'Terminais e caixa de direção' },
    { key: 'homocineticas',   label: 'Coifas / homocinéticas' },
  ]},
  { system: 'Pneus', icon: '🛞', items: [
    { key: 'pneu_de',         label: 'Pneu dianteiro esquerdo', measure: 'sulco mm' },
    { key: 'pneu_dd',         label: 'Pneu dianteiro direito',  measure: 'sulco mm' },
    { key: 'pneu_te',         label: 'Pneu traseiro esquerdo',  measure: 'sulco mm' },
    { key: 'pneu_td',         label: 'Pneu traseiro direito',   measure: 'sulco mm' },
    { key: 'estepe',          label: 'Estepe, macaco e chave' },
  ]},
  { system: 'Elétrica', icon: '🔋', items: [
    { key: 'bateria',         label: 'Bateria', measure: 'volts' },
    { key: 'farois',          label: 'Faróis (baixo/alto)' },
    { key: 'lanternas',       label: 'Lanternas, freio e ré' },
    { key: 'setas',           label: 'Setas e pisca-alerta' },
    { key: 'painel',          label: 'Luzes de alerta no painel' },
  ]},
  { system: 'Interior e outros', icon: '🚗', items: [
    { key: 'ar_cond',         label: 'Ar-condicionado' },
    { key: 'limpadores',      label: 'Palhetas e esguicho' },
    { key: 'escapamento',     label: 'Escapamento' },
    { key: 'cintos',          label: 'Cintos de segurança' },
  ]},
];

export const TEMPLATE_BY_KEY: Record<string, TemplateItem> = Object.fromEntries(
  CHECKUP_TEMPLATE.flatMap(s => s.items.map(i => [i.key, i])),
);
export const SYSTEM_ICON: Record<string, string> = Object.fromEntries(
  CHECKUP_TEMPLATE.map(s => [s.system, s.icon]),
);

export const STATUS_META: Record<CheckupItemStatus, { label: string; short: string; dot: string }> = {
  ok:     { label: 'OK',       short: 'OK',      dot: '🟢' },
  warn:   { label: 'Atenção',  short: 'Atenção', dot: '🟡' },
  urgent: { label: 'Urgente',  short: 'Urgente', dot: '🔴' },
  na:     { label: 'Não se aplica', short: 'N/A', dot: '⚪' },
};

/* ─── Nota de saúde ───────────────────────────────────────────
   Começa em 100; cada 🟡 tira 4 e cada 🔴 tira 12 (mínimo 0).
   Qualquer 🔴 limita a nota a 69 — carro com item urgente nunca é "Bom estado". */
export function computeScore(items: Pick<CheckupItem, 'status'>[]) {
  const warn   = items.filter(i => i.status === 'warn').length;
  const urgent = items.filter(i => i.status === 'urgent').length;
  const score  = Math.max(0, 100 - warn * 4 - urgent * 12);
  return urgent > 0 ? Math.min(score, 69) : score;
}

export function scoreMeta(score: number) {
  if (score >= 80) return { label: 'Bom estado',       color: 'signal' as const };
  if (score >= 50) return { label: 'Requer atenção',   color: 'pending' as const };
  return               { label: 'Estado crítico',   color: 'alert' as const };
}

/** Linhas iniciais de checkup_items para um check-up novo. */
export function templateRows(checkupId: string) {
  let pos = 0;
  return CHECKUP_TEMPLATE.flatMap(s => s.items.map(i => ({
    checkup_id: checkupId,
    system:     s.system,
    item_key:   i.key,
    label:      i.label,
    position:   pos++,
  })));
}

/* ─── Fotos ──────────────────────────────────────────────────── */
const BUCKET = 'checkup-photos';

/** Path: {profileId}/{checkupId}/{itemKey}-{timestamp}.{ext} — a RLS usa a 1ª pasta como dono. */
export async function uploadCheckupPhoto(file: File, profileId: string, checkupId: string, itemKey: string) {
  const ext  = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const path = `${profileId}/${checkupId}/${itemKey}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type || 'image/jpeg',
    cacheControl: '3600',
    upsert: false,
  });
  if (error) throw error;
  return path;
}

export function checkupPhotoUrl(path: string) {
  if (path.startsWith('blob:')) return path; // pré-visualização local (demo)
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

/* ─── Compartilhamento ───────────────────────────────────────── */
export function publicReportUrl(token: string) {
  return `${window.location.origin}/checkup/${token}`;
}

export function whatsappLink(c: Pick<VehicleCheckup, 'customer_name' | 'customer_phone' | 'plate' | 'make' | 'model' | 'score' | 'public_token'>) {
  const first = c.customer_name?.trim().split(' ')[0];
  const car   = [c.make, c.model].filter(Boolean).join(' ') || 'seu veículo';
  const plate = c.plate ? ` (${c.plate})` : '';
  const text =
    `Olá${first ? ` ${first}` : ''}! Fiz o check-up do ${car}${plate}. ` +
    `Nota de saúde: ${c.score ?? '—'}/100.\n\n` +
    `Veja o relatório completo com fotos: ${publicReportUrl(c.public_token)}`;
  const digits = (c.customer_phone ?? '').replace(/\D/g, '');
  const phone  = digits ? (digits.length <= 11 ? `55${digits}` : digits) : '';
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}
