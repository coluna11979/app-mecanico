import { supabase } from './supabase';

export type CheckupItemStatus = 'ok' | 'warn' | 'urgent' | 'na';

export interface VehicleCheckup {
  id: string;
  workshop_id: string;
  /** Mecânico da equipe da oficina que fez a inspeção */
  workshop_mechanic_id: string | null;
  service_order_id: string | null;
  customer_id: string | null;
  vehicle_id: string | null;
  created_by: string | null;
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
  /** Funil de venda (migration 0052) */
  quote_sent_at?: string | null;
  customer_viewed_at?: string | null;
  customer_responded_at?: string | null;
  customer_scheduled_at?: string | null;
  sale_os_id?: string | null;
  /** Link do mecânico (migration 0054) */
  mechanic_token?: string | null;
  mechanic_token_expires_at?: string | null;
  mechanic_link_sent_at?: string | null;
  mechanic_opened_at?: string | null;
  mechanic_started_at?: string | null;
  mechanic_finished_at?: string | null;
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
  /** Orçamento do item (serviço + peça) */
  quote_service?: string | null;
  quote_labor?: number | null;
  quote_part?: string | null;
  quote_part_id?: string | null;
  quote_parts?: number | null;
  /** Resposta do cliente no link */
  customer_decision?: CustomerDecision | null;
  remind_on?: string | null;
}

export type CustomerDecision = 'approve' | 'remind' | 'decline';

export const DECISION_META: Record<CustomerDecision, { label: string; short: string; icon: string; tone: string }> = {
  approve: { label: 'Pode fazer',        short: 'Aprovado',  icon: '✅', tone: 'text-signal-700' },
  remind:  { label: 'Me lembra depois',  short: 'Lembrar',   icon: '⏰', tone: 'text-pending-700' },
  decline: { label: 'Agora não',         short: 'Recusado',  icon: '❌', tone: 'text-steel-500' },
};

/** Valor orçado do item (serviço + peça) */
export const itemQuote = (i: { quote_labor?: number | null; quote_parts?: number | null }) =>
  Number(i.quote_labor ?? 0) + Number(i.quote_parts ?? 0);

/** Em que ponto da venda o check-up está */
export function saleStage(c: Pick<VehicleCheckup, 'status' | 'quote_sent_at' | 'customer_viewed_at' | 'customer_responded_at' | 'sale_os_id'>) {
  if (c.status !== 'completed') return 'draft' as const;
  if (c.sale_os_id) return 'won' as const;
  if (c.customer_responded_at) return 'answered' as const;
  if (c.customer_viewed_at) return 'viewed' as const;
  if (c.quote_sent_at) return 'sent' as const;
  return 'quote' as const;
}

/** Onde está o check-up enviado ao celular do mecânico (null = não foi enviado) */
export function mechanicStage(c: Pick<VehicleCheckup, 'status' | 'mechanic_link_sent_at' | 'mechanic_opened_at' | 'mechanic_started_at' | 'mechanic_finished_at'>) {
  if (!c.mechanic_link_sent_at) return null;
  if (c.mechanic_finished_at || c.status === 'completed') return 'finished' as const;
  if (c.mechanic_started_at) return 'started' as const;
  if (c.mechanic_opened_at) return 'opened' as const;
  return 'sent' as const;
}

export const MECHANIC_STAGE_META = {
  sent:     { label: 'Enviado ao mecânico', short: 'Enviado',      icon: '📲' },
  opened:   { label: 'Mecânico abriu',      short: 'Aberto',       icon: '👀' },
  started:  { label: 'Em andamento',        short: 'Em andamento', icon: '🔧' },
  finished: { label: 'Finalizado',          short: 'Finalizado',   icon: '✅' },
} as const;

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

/** Path: {workshopId}/{checkupId}/{itemKey}-{timestamp}.{ext} — a RLS usa a 1ª pasta como oficina. */
export async function uploadCheckupPhoto(file: File, workshopId: string, checkupId: string, itemKey: string) {
  const ext  = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const path = `${workshopId}/${checkupId}/${itemKey}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type || 'image/jpeg',
    cacheControl: '3600',
    upsert: false,
  });
  if (error) throw error;
  return path;
}

/** Foto enviada pelo link do mecânico (sem login): a pasta m-{upload_key} autoriza o envio. */
export async function uploadMechanicPhoto(file: File, workshopId: string, checkupId: string, uploadKey: string, itemKey: string) {
  const ext  = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const path = `${workshopId}/${checkupId}/m-${uploadKey}/${itemKey}-${Date.now()}.${ext}`;
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

export function whatsappLink(
  c: Pick<VehicleCheckup, 'customer_name' | 'customer_phone' | 'plate' | 'make' | 'model' | 'score' | 'public_token'>,
  workshopName?: string,
  quoteTotal = 0,
) {
  const first = c.customer_name?.trim().split(' ')[0];
  const car   = [c.make, c.model].filter(Boolean).join(' ') || 'seu veículo';
  const plate = c.plate ? ` (${c.plate})` : '';
  const text =
    `Olá${first ? ` ${first}` : ''}! Aqui é da ${workshopName || 'oficina'}. ` +
    `Fizemos o check-up do ${car}${plate}. ` +
    `Nota de saúde: ${c.score ?? '—'}/100.\n\n` +
    (quoteTotal > 0
      ? `Separamos o orçamento do que precisa de atenção. No link você vê as fotos, aprova o que quiser fazer e já escolhe o melhor horário para trazer o carro: ${publicReportUrl(c.public_token)}`
      : `Veja o relatório completo com fotos: ${publicReportUrl(c.public_token)}`);
  const digits = (c.customer_phone ?? '').replace(/\D/g, '');
  const phone  = digits ? (digits.length <= 11 ? `55${digits}` : digits) : '';
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}

/* ─── Link do mecânico ───────────────────────────────────────── */
export function mechanicLinkUrl(token: string) {
  return `${window.location.origin}/m/checkup/${token}`;
}

export function mechanicWhatsappLink(
  c: Pick<VehicleCheckup, 'plate' | 'make' | 'model'>,
  link: { token: string; mechanic_name: string | null; mechanic_phone: string | null },
) {
  const first = link.mechanic_name?.trim().split(' ')[0];
  const car   = [c.make, c.model].filter(Boolean).join(' ') || 'carro';
  const plate = c.plate ? ` ${c.plate}` : '';
  const text =
    `${first ? `${first}, ` : ''}check-up do ${car}${plate} pra você fazer. ` +
    `Abre no celular, marca os itens e tira as fotos: ${mechanicLinkUrl(link.token)}`;
  const digits = (link.mechanic_phone ?? '').replace(/\D/g, '');
  const phone  = digits ? (digits.length <= 11 ? `55${digits}` : digits) : '';
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}
