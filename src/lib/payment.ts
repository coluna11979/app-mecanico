/**
 * Cálculo do repasse ao mecânico.
 *
 * REGRA DE COMUNICAÇÃO (importante):
 * Nenhuma tela voltada para o mecânico deve expor a porcentagem da taxa
 * da plataforma nem o valor "bruto" do contrato. O mecânico só vê o valor
 * que vai efetivamente cair no PIX dele. Isso evita confusão e alinha com
 * o padrão de mercado (Uber, iFood etc.).
 *
 * A taxa NÃO deve aparecer hardcoded na UI — sempre usar mechanicNet()
 * para que qualquer ajuste futuro seja centralizado aqui.
 * Mesmo valor de app_settings.platform_fee_percent (comissão do embaixador).
 */
export const PLATFORM_FEE = 0.20;
const MECHANIC_SHARE = 1 - PLATFORM_FEE;

export function mechanicNet(gross: number): number {
  if (!gross || gross < 0) return 0;
  return gross * MECHANIC_SHARE;
}

/** Valor fechado da demanda — o mesmo que a oficina paga (create-card-payment / create-pix-payment) */
export function jobGross(j: { price_per_hour?: number | null; max_hours?: number | null; price?: number | null }): number {
  const cap = Number(j.price_per_hour ?? 0) * Number(j.max_hours ?? 1);
  return cap > 0 ? cap : Number(j.price ?? 0);
}

/** Valor para o mecânico: sem centavos quando é redondo (R$ 82), com centavos quando não é (R$ 0,80) */
export function formatMoney(value: number): string {
  const v = Math.round((Number(value) || 0) * 100) / 100;
  return formatBRL(v, { decimals: Number.isInteger(v) ? 0 : 2 });
}

export function formatBRL(value: number, opts: { decimals?: 0 | 2 } = {}): string {
  const decimals = opts.decimals ?? 2;
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}
