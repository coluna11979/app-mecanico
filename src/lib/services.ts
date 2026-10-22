/**
 * Tabela de serviços (mão de obra) da oficina — migration 0048.
 * No orçamento/OS, digitar o nome traz o preço daqui.
 */
export type WorkshopService = {
  id: string; workshop_id: string; name: string; category: string | null;
  price: number; estimated_minutes: number | null; active: boolean;
  created_at: string; updated_at: string;
};

/** Ponto de partida para quem ainda não tem tabela (entra sem preço — a oficina define o dela) */
export const COMMON_SERVICES: { name: string; category: string; minutes: number }[] = [
  { name: 'Troca de óleo e filtro',              category: 'Troca de óleo',      minutes: 30 },
  { name: 'Alinhamento',                         category: 'Alinhamento',        minutes: 40 },
  { name: 'Balanceamento',                       category: 'Balanceamento',      minutes: 30 },
  { name: 'Cambagem',                            category: 'Alinhamento',        minutes: 40 },
  { name: 'Rodízio de pneus',                    category: 'Pneus',              minutes: 20 },
  { name: 'Montagem de pneu',                    category: 'Pneus',              minutes: 15 },
  { name: 'Troca de pastilhas dianteiras',       category: 'Freios',             minutes: 60 },
  { name: 'Troca de discos e pastilhas',         category: 'Freios',             minutes: 90 },
  { name: 'Troca de lonas / sapatas traseiras',  category: 'Freios',             minutes: 90 },
  { name: 'Sangria do sistema de freio',         category: 'Freios',             minutes: 40 },
  { name: 'Troca de amortecedores (par)',        category: 'Suspensão',          minutes: 120 },
  { name: 'Troca de bieletas',                   category: 'Suspensão',          minutes: 45 },
  { name: 'Troca de pivô',                       category: 'Suspensão',          minutes: 60 },
  { name: 'Troca de bandeja',                    category: 'Suspensão',          minutes: 90 },
  { name: 'Troca de terminal de direção',        category: 'Suspensão',          minutes: 60 },
  { name: 'Troca de correia dentada',            category: 'Motor',              minutes: 180 },
  { name: 'Troca de velas',                      category: 'Motor',              minutes: 30 },
  { name: 'Troca de fluido de arrefecimento',    category: 'Motor',              minutes: 45 },
  { name: 'Limpeza de bicos injetores',          category: 'Injeção eletrônica', minutes: 90 },
  { name: 'Limpeza do TBI',                      category: 'Injeção eletrônica', minutes: 40 },
  { name: 'Troca de embreagem',                  category: 'Embreagem',          minutes: 240 },
  { name: 'Troca de bateria',                    category: 'Elétrica',           minutes: 15 },
  { name: 'Diagnóstico com scanner',             category: 'Diagnóstico',        minutes: 30 },
  { name: 'Higienização do ar-condicionado',     category: 'Ar-condicionado',    minutes: 40 },
  { name: 'Carga de gás do ar-condicionado',     category: 'Ar-condicionado',    minutes: 60 },
  { name: 'Revisão geral',                       category: 'Revisão geral',      minutes: 180 },
];

/** "90" → "1h 30min" (tempo estimado) */
export function fmtMinutes(min: number | null | undefined) {
  if (!min) return '—';
  const h = Math.floor(min / 60), m = min % 60;
  return h ? (m ? `${h}h ${m}min` : `${h}h`) : `${m}min`;
}
