import { supabase } from '@/lib/supabase';

export const CATEGORIES: Record<string, string> = {
  equipe: 'Equipe',
  anuncios: 'Anúncios',
  sistemas: 'Sistemas',
  contador_juridico: 'Contador / jurídico',
  taxa_pagamento: 'Taxa do pagamento',
  impostos: 'Impostos',
  comissao_embaixadores: 'Comissão de embaixadores',
  outros: 'Outros',
};

export const INSTRUMENTS: Record<string, string> = {
  mutuo_conversivel: 'Mútuo conversível',
  investidor_anjo: 'Investidor-anjo',
};

export const NOTICE = 'Painel informativo. O número oficial é o do contador.';
export const PROJECTION_NOTICE =
  'Projeção é uma estimativa feita com premissas da empresa. Não é promessa nem garantia de retorno, e o resultado real pode ser menor ou maior.';

export type Valuation = { amount: number; ref_date: string; basis: string; note: string | null };
export type Projection = { scenario: string; month: string; revenue: number; costs: number; note: string | null };
export const SCENARIOS: Record<string, string> = { conservador: 'Conservador', base: 'Base', otimista: 'Otimista' };

/** Próximos `n` meses a partir do mês de `start` ('2026-11-01') */
export function monthsFrom(start: string, n = 12) {
  const [y, m] = start.split('-').map(Number);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(y, m - 1 + i, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  });
}

export type Investor = {
  id: string; user_id: string | null; name: string; email: string; amount: number; invested_at: string;
  instrument: string; conditions: string | null; share_pct: number; active: boolean;
  cpf?: string | null; rg?: string | null; nationality?: string | null; marital_status?: string | null;
  profession?: string | null; address?: string | null; phone?: string | null; pix_key?: string | null;
};
export type Closing = {
  month: string; revenue_apps: number; revenue_manual: number; costs: number; taxes: number; reserve: number;
  distributable: number; snapshot: { custos_por_categoria?: Record<string, number>; receitas_por_tipo?: Record<string, number> }; closed_at: string;
};

export const brl = (n: number | null | undefined) =>
  Number(n ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** '2026-10-01' → 'out/2026' (sem fuso: a data é só texto) */
export function monthLabel(m: string) {
  const [y, mo] = m.split('-');
  const names = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  return `${names[Number(mo) - 1]}/${y}`;
}

export const toNum = (s: string) => Number(s.replace(/\./g, '').replace(',', '.')) || 0;

/** Sobe um arquivo para o bucket privado e devolve o caminho */
export async function uploadFile(folder: string, file: File) {
  const safe = file.name.replace(/[^\w.\-]+/g, '_');
  const path = `${folder}/${Date.now()}_${safe}`;
  const { error } = await supabase.storage.from('investors').upload(path, file);
  if (error) throw error;
  return path;
}

/** Abre um arquivo privado por link temporário */
export async function openFile(path: string) {
  const { data, error } = await supabase.storage.from('investors').createSignedUrl(path, 120);
  if (error || !data) throw error ?? new Error('Arquivo não encontrado');
  window.open(data.signedUrl, '_blank', 'noopener');
}

/** Máscara ao digitar: milhar com ponto, decimal com vírgula (máx. 2): "100000" → "100.000", "1234,5" → "1.234,5" */
export function maskMoney(raw: string) {
  const cleaned = raw.replace(/[^\d,]/g, '');
  const [int, ...rest] = cleaned.split(',');
  const dec = rest.join('').slice(0, 2);
  const grouped = int.replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return rest.length ? `${grouped || '0'},${dec}` : grouped;
}

/** Número do banco → texto do campo ("1000000" → "1.000.000") */
export const numToInput = (n: number | string) =>
  Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 2 });

export const EXPANSION_STATUS: Record<string, string> = {
  operando: 'Em operação',
  proxima: 'Próxima',
  planejada: 'Planejada',
};
export type Expansion = { id: string; region: string; status: string; expected_date: string | null; note: string | null };

/** Participação estimada = aporte ÷ valuation (conta simples; teto e desconto do contrato não entram) */
export const participation = (amount: number, valuation: number | null | undefined) =>
  valuation && valuation > 0 ? (amount / valuation) * 100 : null;
export const pctLabel = (p: number) => `${p.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;
export const PARTICIPATION_NOTE =
  'Estimativa simples: aporte ÷ valuation. Não considera teto, desconto ou rodadas futuras; o que vale é o contrato.';
