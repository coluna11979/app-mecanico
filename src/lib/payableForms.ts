/**
 * Formulário de conta a pagar por categoria: quais campos aparecem, rótulos,
 * repetição sugerida e como a descrição é montada.
 */

/** De quem é a conta: fornecedor cadastrado, colaborador da equipe, nome livre ou ninguém */
export type PayeeKind = 'supplier' | 'employee' | 'text' | 'none';

export type CategoryForm = {
  payee: PayeeKind;
  payeeLabel?: string;
  payeePlaceholder?: string;
  payeeRequired?: boolean;
  /** Mês de referência (competência) */
  competence?: boolean;
  /** Código de barras / linha digitável */
  barcode?: boolean;
  /** Nº do documento, nota, contrato ou apólice */
  document?: string;
  /** Repetição mensal sugerida (meses) */
  repeat?: number;
  /** Nome curto usado na descrição automática */
  short?: string;
  hint?: string;
};

const F: Record<string, CategoryForm> = {
  // Fixas
  'Aluguel':             { payee: 'text', payeeLabel: 'Locador / imobiliária', payeePlaceholder: 'Ex.: Imobiliária Central', competence: true, barcode: true, repeat: 12 },
  'Energia':             { payee: 'text', payeeLabel: 'Concessionária', payeePlaceholder: 'Ex.: Enel', competence: true, barcode: true, document: 'Nº da instalação' },
  'Água':                { payee: 'text', payeeLabel: 'Concessionária', payeePlaceholder: 'Ex.: Sabesp', competence: true, barcode: true, document: 'Nº do fornecimento' },
  'Internet / telefone': { payee: 'text', payeeLabel: 'Operadora', payeePlaceholder: 'Ex.: Vivo', competence: true, barcode: true, repeat: 12, short: 'Internet/telefone' },
  'Contador':            { payee: 'supplier', payeeLabel: 'Escritório de contabilidade', competence: true, repeat: 12, short: 'Honorários contábeis' },
  'Sistemas':            { payee: 'supplier', payeeLabel: 'Empresa / sistema', competence: true, repeat: 12, short: 'Assinatura' },
  'Seguro':              { payee: 'supplier', payeeLabel: 'Seguradora', document: 'Nº da apólice', barcode: true, repeat: 12 },
  // Pessoal
  'Salários':            { payee: 'employee', payeeLabel: 'Colaborador', payeeRequired: true, competence: true, short: 'Salário' },
  'Comissões':           { payee: 'employee', payeeLabel: 'Colaborador', payeeRequired: true, competence: true, short: 'Comissão',
                           hint: 'Comissões quinzenais (dias 15 e 30) são geradas em Equipe → Fechar comissões.' },
  'Pró-labore':          { payee: 'text', payeeLabel: 'Sócio', payeePlaceholder: 'Nome do sócio', competence: true, repeat: 12 },
  'Encargos (INSS/FGTS)':{ payee: 'none', competence: true, barcode: true, short: 'INSS/FGTS', hint: 'Guia da folha do mês de competência.' },
  'Vale-transporte / alimentação': { payee: 'employee', payeeLabel: 'Colaborador (vazio = toda a equipe)', competence: true, short: 'Benefícios' },
  // Fornecedores
  'Fornecedor':          { payee: 'supplier', payeeLabel: 'Fornecedor / autopeças', payeeRequired: true, document: 'Nº da nota / pedido', barcode: true,
                           hint: 'Para dar entrada de peças no estoque, use “Lançar nota”: a conta entra aqui sozinha.' },
  // Impostos
  'Simples / DAS':       { payee: 'none', competence: true, barcode: true, short: 'DAS Simples Nacional' },
  'IPTU':                { payee: 'none', document: 'Inscrição do imóvel', barcode: true, repeat: 10 },
  'Impostos':            { payee: 'text', payeeLabel: 'Tributo', payeePlaceholder: 'Ex.: ISS, ICMS, taxa da prefeitura', competence: true, barcode: true, short: 'Imposto' },
  // Variáveis
  'Manutenção':          { payee: 'supplier', payeeLabel: 'Prestador / fornecedor', document: 'Nº do documento' },
  'Ferramentas':         { payee: 'supplier', payeeLabel: 'Fornecedor', document: 'Nº da nota' },
  'Marketing':           { payee: 'supplier', payeeLabel: 'Fornecedor / agência', competence: true },
  'Combustível':         { payee: 'supplier', payeeLabel: 'Posto', document: 'Nº do cupom' },
  'Outros':              { payee: 'supplier', payeeLabel: 'Favorecido', document: 'Nº do documento' },
};

const CUSTOM: CategoryForm = { payee: 'supplier', payeeLabel: 'Favorecido', document: 'Nº do documento' };

export const formOf = (category: string): CategoryForm => F[category] ?? CUSTOM;

/** "2026-09" → "09/2026" */
export const fmtCompetence = (c: string | null | undefined) => (c && /^\d{4}-\d{2}$/.test(c) ? `${c.slice(5)}/${c.slice(0, 4)}` : '');

export function addMonthsCompetence(c: string, n: number) {
  const [y, m] = c.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Descrição automática: "Salário · João Silva · 09/2026" */
export function autoDescription(category: string, payee: string, competence: string | null) {
  const f = formOf(category);
  return [f.short ?? category, payee.trim(), competence ? fmtCompetence(competence) : ''].filter(Boolean).join(' · ');
}

/** Só dígitos, agrupados de 5 em 5 para leitura */
export const fmtBarcode = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '').replace(/(\d{5})(?=\d)/g, '$1 ');
