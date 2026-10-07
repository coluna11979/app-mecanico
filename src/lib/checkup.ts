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
  /** Check-up refeito: aponta para o novo (migration 0078). O antigo fica no histórico e o link segue valendo. */
  replaced_by?: string | null;
  /** Modelo do check-up (migration 0079): null = completo */
  template_key?: string | null;
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

/** @deprecated a nota 0–100 saiu da interface (Estado geral em checkupStatus); a coluna score segue gravada */
export function scoreMeta(score: number) {
  if (score >= 80) return { label: 'Bom estado',       color: 'signal' as const };
  if (score >= 50) return { label: 'Requer atenção',   color: 'pending' as const };
  return               { label: 'Estado crítico',   color: 'alert' as const };
}

/* ─── Modelos de check-up ──────────────────────────────────────
   O modelo só escolhe quais itens do checklist padrão nascem no check-up.
   'custom' = montado na hora (só os sistemas que o cliente apontou). */
export type CheckupModelKey = 'completo' | 'revisao' | 'troca_oleo' | 'pre_viagem' | 'freios_suspensao' | 'usado' | 'custom';

type CheckupModel = {
  key: CheckupModelKey; label: string; icon: string; desc: string;
  /** Itens do modelo; null = todos */
  items: string[] | null;
  /** Inspeção parcial: o relatório fala dos "itens verificados", não do carro inteiro */
  partial: boolean;
};

const ALL_KEYS = CHECKUP_TEMPLATE.flatMap(s => s.items.map(i => i.key));
const PNEUS = ['pneu_de', 'pneu_dd', 'pneu_te', 'pneu_td'];
const FREIOS = ['pastilhas_diant', 'discos', 'freio_tras', 'fluido_freio', 'freio_mao'];
const SUSPENSAO = ['amortecedores', 'pivos_bandejas', 'terminais', 'homocineticas'];

export const CHECKUP_MODELS: CheckupModel[] = [
  { key: 'completo', label: 'Check-up completo', icon: '🩺', partial: false, items: null,
    desc: 'O carro inteiro, sistema por sistema' },
  { key: 'revisao', label: 'Revisão básica', icon: '🧰', partial: true,
    desc: 'Óleo, fluidos, pastilhas, pneus, bateria, luzes e palhetas',
    items: ['oleo_nivel', 'filtro_ar', 'fluido_arref', 'fluido_freio', 'pastilhas_diant', ...PNEUS, 'bateria', 'farois', 'lanternas', 'setas', 'limpadores'] },
  { key: 'troca_oleo', label: 'Troca de óleo', icon: '🛢️', partial: true,
    desc: 'Óleo, filtro de ar, vazamentos, arrefecimento e correia',
    items: ['oleo_nivel', 'filtro_ar', 'vazamentos', 'correia', 'fluido_arref', 'mangueiras', 'radiador'] },
  { key: 'pre_viagem', label: 'Pré-viagem', icon: '🛣️', partial: true,
    desc: 'Pneus e estepe, freios, luzes, palhetas, fluidos e bateria',
    items: ['oleo_nivel', 'fluido_arref', 'pastilhas_diant', 'discos', 'freio_tras', 'fluido_freio', 'amortecedores',
            ...PNEUS, 'estepe', 'bateria', 'farois', 'lanternas', 'setas', 'painel', 'limpadores'] },
  { key: 'freios_suspensao', label: 'Freios e suspensão', icon: '🛑', partial: true,
    desc: 'Freios, suspensão e direção, pneus',
    items: [...FREIOS, ...SUSPENSAO, ...PNEUS] },
  { key: 'usado', label: 'Veículo usado', icon: '🚙', partial: false, items: null,
    desc: 'Avaliação completa para compra e venda' },
  { key: 'custom', label: 'Montar na hora', icon: '✍️', partial: true, items: null,
    desc: 'Só os sistemas que o cliente apontou' },
];

export const MODEL_BY_KEY: Record<string, CheckupModel> = Object.fromEntries(CHECKUP_MODELS.map(m => [m.key, m]));

/** Modelo do check-up (null/desconhecido = completo) */
export const modelOf = (key: string | null | undefined) => MODEL_BY_KEY[key ?? ''] ?? MODEL_BY_KEY.completo;

/** Nome para mostrar: "Freios e suspensão"; montado na hora → os sistemas ("Freios + Pneus") */
export function modelLabel(key: string | null | undefined, systems?: string[]) {
  const m = modelOf(key);
  if (m.key === 'custom') return systems?.length ? systems.join(' + ') : 'Check-up personalizado';
  return m.label;
}

/** Itens que o modelo cria (custom: todos os itens dos sistemas escolhidos) */
export function modelItemKeys(key: CheckupModelKey, systems: string[] = []): string[] {
  const m = modelOf(key);
  if (m.key === 'custom') return CHECKUP_TEMPLATE.filter(s => systems.includes(s.system)).flatMap(s => s.items.map(i => i.key));
  return m.items ?? ALL_KEYS;
}

/** Modelo sugerido pela OS (categoria/título): freio → Freios e suspensão, óleo → Troca de óleo… */
export function suggestModel(text: string | null | undefined): CheckupModelKey {
  const t = (text ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (/freio|pastilha|suspens|amortec|direcao|pivo|bandeja/.test(t)) return 'freios_suspensao';
  if (/oleo|lubrific/.test(t)) return 'troca_oleo';
  if (/viagem/.test(t)) return 'pre_viagem';
  if (/revis/.test(t)) return 'revisao';
  if (/usado|vistoria|compra/.test(t)) return 'usado';
  return 'completo';
}

/** Linhas iniciais de checkup_items para um check-up novo (só os itens do modelo, se informado). */
export function templateRows(checkupId: string, itemKeys?: string[]) {
  const only = itemKeys ? new Set(itemKeys) : null;
  let pos = 0;
  return CHECKUP_TEMPLATE.flatMap(s => s.items.filter(i => !only || only.has(i.key)).map(i => ({
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
  c: Pick<VehicleCheckup, 'customer_name' | 'customer_phone' | 'plate' | 'make' | 'model' | 'score' | 'public_token' | 'template_key'>,
  workshopName?: string,
  quoteTotal = 0,
  /** Estado geral já montado (ex.: "Bom, com pontos de atenção — 28 OK, 3 atenção, 1 urgente") */
  summary?: string,
) {
  const first = c.customer_name?.trim().split(' ')[0];
  const car   = [c.make, c.model].filter(Boolean).join(' ') || 'seu veículo';
  const plate = c.plate ? ` (${c.plate})` : '';
  const text =
    `Olá${first ? ` ${first}` : ''}! Aqui é da ${workshopName || 'oficina'}. ` +
    (modelOf(c.template_key).partial
      ? `Fizemos a verificação (${modelLabel(c.template_key).toLowerCase()}) do ${car}${plate}. `
      : `Fizemos o check-up do ${car}${plate}. `) +
    (summary ? `Estado geral: ${summary}.\n\n` : '\n') +
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

/* ─── Criar ──────────────────────────────────────────────────── */
/** Cria o check-up + itens do checklist e devolve o id. `itemKeys` = só os itens do modelo escolhido. */
export async function createCheckup(payload: Partial<VehicleCheckup> & { workshop_id: string }, itemKeys?: string[]) {
  const { data: c, error } = await supabase.from('vehicle_checkups').insert(payload).select('id').single();
  if (error || !c) throw error ?? new Error('insert');
  const { error: itemsErr } = await supabase.from('checkup_items').insert(templateRows(c.id, itemKeys));
  if (itemsErr) throw itemsErr;
  return c.id as string;
}

/**
 * Check-up de uma OS (agendada ou aberta): devolve o que já existe ou cria um preenchido.
 * `mechanicId` (opcional) define quem vai inspecionar — senão usa o mecânico da OS.
 * Devolve null se a OS não existe.
 */
export async function checkupForOs(osId: string, mechanicId?: string | null) {
  const { data: existing } = await supabase.from('vehicle_checkups').select('id')
    .eq('service_order_id', osId).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (existing) return existing.id as string;
  const { data: os } = await supabase.from('service_orders')
    .select('id, workshop_id, customer_id, vehicle_id, workshop_mechanic_id, km_reading, title, category, customer:customers(full_name, phone), vehicle:vehicles(plate, make, model, year)')
    .eq('id', osId).maybeSingle();
  if (!os) return null;
  const cu = os.customer as unknown as { full_name: string; phone: string | null } | null;
  const ve = os.vehicle as unknown as { plate: string; make: string; model: string; year: number | null } | null;
  // Modelo sugerido pelo serviço da OS (dá para trocar na tela, antes de começar)
  const model = suggestModel(`${os.category ?? ''} ${os.title ?? ''}`);
  return createCheckup({
    workshop_id: os.workshop_id, service_order_id: os.id,
    customer_id: os.customer_id, vehicle_id: os.vehicle_id,
    workshop_mechanic_id: mechanicId ?? os.workshop_mechanic_id,
    km_reading: os.km_reading,
    customer_name: cu?.full_name ?? null, customer_phone: cu?.phone ?? null,
    plate: ve?.plate ?? null, make: ve?.make ?? null, model: ve?.model ?? null, year: ve?.year ?? null,
    template_key: model === 'completo' ? null : model,
  }, modelItemKeys(model));
}

/** Troca o modelo de um check-up que ainda não começou (nenhum item avaliado): refaz os itens. */
export async function changeCheckupModel(checkupId: string, key: CheckupModelKey, systems: string[] = []) {
  const keys = modelItemKeys(key, systems);
  if (!keys.length) throw new Error('Escolha ao menos um sistema');
  const { data: answered } = await supabase.from('checkup_items').select('id')
    .eq('checkup_id', checkupId).not('status', 'is', null).limit(1);
  if (answered?.length) throw new Error('Este check-up já começou — não dá para trocar o tipo');
  const { error: delErr } = await supabase.from('checkup_items').delete().eq('checkup_id', checkupId);
  if (delErr) throw delErr;
  const { error: insErr } = await supabase.from('checkup_items').insert(templateRows(checkupId, keys));
  if (insErr) throw insErr;
  const { error: upErr } = await supabase.from('vehicle_checkups')
    .update({ template_key: key === 'completo' ? null : key, updated_at: new Date().toISOString() }).eq('id', checkupId);
  if (upErr) throw upErr;
}
