/**
 * Vitrine da oficina — opções dos formulários e cálculo de "quanto está completa".
 * Tudo é opcional; o progresso existe para motivar, não para bloquear.
 */
import { OS_CATEGORIES } from '@/components/os/osHelpers';

export type DayHours = { open: string; close: string; closed?: boolean };
export type Showcase = {
  workshop_id: string;
  services: string[]; vehicle_types: string[]; brands: string[];
  bays: number | null; lifts: number | null; equipment: string[]; amenities: string[];
  customer_types: string[]; price_tier: 'economica' | 'intermediaria' | 'premium' | null; service_area: string | null;
  hours: Record<string, DayHours>;
  whatsapp: string | null; instagram: string | null; google_url: string | null; website: string | null;
  founded_year: number | null; payment_methods: string[]; warranty_days: number | null;
  highlights: string | null; certifications: string | null;
  consent_at: string | null; consent_by: string | null;
  reminder_snoozed_until: string | null;
  updated_at?: string;
};

export type PhotoKind = 'facade' | 'reception' | 'service_area' | 'equipment' | 'team' | 'other';
export type ShowcasePhoto = { id: string; workshop_id: string; kind: PhotoKind; path: string; caption: string | null; position: number };

export const emptyShowcase = (workshopId: string): Showcase => ({
  workshop_id: workshopId,
  services: [], vehicle_types: [], brands: [],
  bays: null, lifts: null, equipment: [], amenities: [],
  customer_types: [], price_tier: null, service_area: null,
  hours: {}, whatsapp: null, instagram: null, google_url: null, website: null,
  founded_year: null, payment_methods: [], warranty_days: null,
  highlights: null, certifications: null,
  consent_at: null, consent_by: null, reminder_snoozed_until: null,
});

export const PHOTO_SLOTS: { kind: PhotoKind; label: string; tip: string; max: number }[] = [
  { kind: 'facade',       label: 'Fachada',              tip: 'De frente, de dia, mostrando o nome. Ajuda o cliente a te encontrar na rua.', max: 2 },
  { kind: 'reception',    label: 'Recepção / sala de espera', tip: 'Onde o cliente aguarda. Limpeza e conforto passam confiança.', max: 3 },
  { kind: 'service_area', label: 'Área de serviço',      tip: 'Boxes e elevadores com carros sendo atendidos, bem organizados.', max: 4 },
  { kind: 'equipment',    label: 'Equipamentos',         tip: 'Scanner, alinhamento, balanceadora… mostre o que você tem de melhor.', max: 4 },
  { kind: 'team',         label: 'Equipe',               tip: 'Sua equipe uniformizada. Gente de verdade gera confiança.', max: 3 },
];

export const SHOWCASE_SERVICES = OS_CATEGORIES.filter(c => c !== 'Outro' && c !== 'Avaliação');
export const VEHICLE_TYPES = ['Carros de passeio', 'SUVs e picapes', 'Motos', 'Utilitários / vans', 'Diesel', 'Caminhões', 'Híbridos e elétricos', 'Carros antigos / clássicos'];
export const BRAND_SUGGESTIONS = ['Todas as marcas', 'Nacionais', 'Importados', 'Fiat', 'Volkswagen', 'Chevrolet', 'Ford', 'Toyota', 'Honda', 'Hyundai', 'Renault', 'Nissan', 'Jeep', 'Peugeot / Citroën', 'BMW', 'Mercedes-Benz', 'Audi'];
export const EQUIPMENT = ['Scanner automotivo', 'Alinhamento 3D', 'Balanceadora', 'Elevadores', 'Recarga de ar-condicionado', 'Máquina de troca de óleo', 'Limpeza de bicos', 'Analisador de gases', 'Teste de bateria', 'Troca de fluido de câmbio automático', 'Dinamômetro', 'Cabine de pintura'];
export const AMENITIES = ['Sala de espera', 'Wi-Fi', 'Café / água', 'TV', 'Estacionamento', 'Leva e traz', 'Carro reserva', 'Acessibilidade', 'Banheiro para clientes', 'Área kids', 'Acompanhar o serviço por foto/vídeo'];
export const CUSTOMER_TYPES = ['Particulares', 'Motoristas de aplicativo', 'Frotas / empresas', 'Seguradoras', 'Locadoras', 'Táxis', 'Concessionárias (terceirizado)'];
export const PRICE_TIERS: { value: NonNullable<Showcase['price_tier']>; label: string; hint: string }[] = [
  { value: 'economica',     label: '💲 Econômica',     hint: 'Preço é o principal atrativo' },
  { value: 'intermediaria', label: '💲💲 Intermediária', hint: 'Bom custo-benefício' },
  { value: 'premium',       label: '💲💲💲 Premium',    hint: 'Serviço diferenciado, carros de maior valor' },
];
export const PAYMENT_METHODS = ['Pix', 'Dinheiro', 'Cartão de débito', 'Cartão de crédito', 'Parcelado no cartão', 'Boleto', 'Faturado para empresas'];
export const WEEK_DAYS: { key: string; label: string }[] = [
  { key: 'mon', label: 'Segunda' }, { key: 'tue', label: 'Terça' }, { key: 'wed', label: 'Quarta' },
  { key: 'thu', label: 'Quinta' }, { key: 'fri', label: 'Sexta' }, { key: 'sat', label: 'Sábado' }, { key: 'sun', label: 'Domingo' },
];

export type Section = 'photos' | 'services' | 'structure' | 'audience' | 'contact' | 'highlights';

/** Itens que compõem o progresso (soma = 100) e o "próximo passo" sugerido */
export function completeness(s: Showcase, photos: ShowcasePhoto[]) {
  const has = (k: PhotoKind) => photos.some(p => p.kind === k);
  const insideKinds = (['reception', 'service_area', 'equipment', 'team'] as PhotoKind[]).filter(has).length;
  const openDays = Object.values(s.hours ?? {}).filter(d => d && !d.closed && d.open && d.close).length;
  const items: { section: Section; label: string; points: number; done: boolean }[] = [
    { section: 'photos',     label: 'Adicione a foto da fachada',                        points: 15, done: has('facade') },
    { section: 'photos',     label: 'Mostre o lado de dentro (2 tipos de foto)',         points: 15, done: insideKinds >= 2 },
    { section: 'services',   label: 'Marque pelo menos 3 serviços que você faz',        points: 10, done: s.services.length >= 3 },
    { section: 'services',   label: 'Diga que tipos de veículo atende',                  points: 5,  done: s.vehicle_types.length > 0 },
    { section: 'services',   label: 'Informe as marcas que atende',                      points: 3,  done: s.brands.length > 0 },
    { section: 'structure',  label: 'Informe boxes e elevadores',                        points: 4,  done: s.bays != null || s.lifts != null },
    { section: 'structure',  label: 'Marque seus equipamentos',                          points: 6,  done: s.equipment.length >= 2 },
    { section: 'structure',  label: 'Marque as comodidades para o cliente',              points: 4,  done: s.amenities.length > 0 },
    { section: 'audience',   label: 'Diga que tipo de cliente você atende',             points: 5,  done: s.customer_types.length > 0 },
    { section: 'audience',   label: 'Escolha sua faixa de preço',                        points: 4,  done: !!s.price_tier },
    { section: 'audience',   label: 'Informe os bairros que atende',                     points: 4,  done: !!s.service_area?.trim() },
    { section: 'contact',    label: 'Preencha o horário de funcionamento',               points: 6,  done: openDays >= 1 },
    { section: 'contact',    label: 'Informe o WhatsApp comercial',                      points: 6,  done: (s.whatsapp ?? '').replace(/\D/g, '').length >= 10 },
    { section: 'contact',    label: 'Marque as formas de pagamento',                     points: 3,  done: s.payment_methods.length > 0 },
    { section: 'contact',    label: 'Informe a garantia dos serviços',                   points: 2,  done: s.warranty_days != null },
    { section: 'highlights', label: 'Conte por que o cliente deve escolher você',        points: 8,  done: (s.highlights ?? '').trim().length >= 40 },
  ];
  const percent = items.filter(i => i.done).reduce((a, i) => a + i.points, 0);
  const next = items.filter(i => !i.done).sort((a, b) => b.points - a.points)[0] ?? null;
  const bySection = (sec: Section) => {
    const its = items.filter(i => i.section === sec);
    return { done: its.filter(i => i.done).length, total: its.length };
  };
  return { percent, next, bySection };
}
