/**
 * Cálculo do repasse ao mecânico.
 *
 * REGRA DE COMUNICAÇÃO (importante):
 * Nenhuma tela voltada para o mecânico deve expor a porcentagem da taxa
 * da plataforma nem o valor "bruto" do contrato. O mecânico só vê o valor
 * que vai efetivamente cair no PIX dele. Isso evita confusão e alinha com
 * o padrão de mercado (Uber, iFood etc.).
 *
 * Esse fator (0.82) NÃO deve aparecer hardcoded na UI — sempre usar
 * mechanicNet() para que qualquer ajuste futuro seja centralizado aqui.
 */
const MECHANIC_SHARE = 0.82;

export function mechanicNet(gross: number): number {
  if (!gross || gross < 0) return 0;
  return gross * MECHANIC_SHARE;
}

export function formatBRL(value: number, opts: { decimals?: 0 | 2 } = {}): string {
  const decimals = opts.decimals ?? 2;
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}
