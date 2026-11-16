// Resumo de uma OS para o Orçamentista: valor dos serviços, custo das peças e comissão de cada pessoa.
// Função pura (sem banco): a comissão usa a MESMA conta da tela de Comissões a pagar da OS
// (OsCommission.tsx → serviceCommission + regras por item da loja), para os números baterem.
import { RULE, serviceCommission, type ItemRule } from './commissionRules.ts';

export type OsHead = {
  numero: number | null; status: string; titulo: string; preco: number; desconto: number;
  cliente_trouxe_peca: boolean; comissao_manual: boolean; cliente: string | null; carro: string | null;
};
export type OsItem = {
  id: string; kind: 'labor' | 'part'; description: string; quantity: number; unit_price: number;
  unit_cost: number | null; used_in_item_id: string | null; mechanic_id: string | null; executor: string | null;
  service_type: 'servico' | 'mao_de_obra' | null; commission_amount: number | null;
};
export type TeamMember = { id: string; name: string; no_commission?: boolean | null; commission_revenue_only?: boolean | null };

const r2 = (n: number) => Math.round(n * 100) / 100;
const money = (n: number) => `R$ ${n.toFixed(2).replace('.', ',')}`;
const lineTotal = (i: { quantity: number; unit_price: number }) => r2(Number(i.quantity) * Number(i.unit_price));
const costOf = (p: OsItem) => r2(Number(p.quantity) * Number(p.unit_cost ?? 0));

export function summarizeOs(os: OsHead, items: OsItem[], team: TeamMember[], rules: ItemRule[]) {
  const nameOf = new Map(team.map((t) => [t.id, t.name]));
  // Salário fixo / só % do faturamento: não ganha comissão por serviço (igual ao Caixa)
  const noComm = new Set(team.filter((t) => t.no_commission || t.commission_revenue_only).map((t) => t.id));
  const partsOf = (serviceId: string) => items.filter((p) => p.kind === 'part' && p.used_in_item_id === serviceId);
  const serviceIds = new Set(items.filter((i) => i.kind === 'labor').map((i) => i.id));

  const perPerson = new Map<string, { valor: number; como: string[] }>();
  const semResponsavel: string[] = [];
  const semComissao = new Set<string>();

  const itens = items.filter((i) => i.kind === 'labor').map((l, idx) => {
    const numero = idx + 1;
    const parts = partsOf(l.id);
    const tipo = l.service_type ?? (parts.length ? 'servico' : 'mao_de_obra');
    const plataforma = l.executor === 'platform';
    let comissao: number | null = null;
    let como = '';

    if (!l.mechanic_id && !plataforma) {
      semResponsavel.push(`${numero}. ${l.description}`);
    } else if (plataforma) {
      comissao = 0; como = 'mecânico da plataforma (sem comissão da equipe)';
    } else if (noComm.has(l.mechanic_id!)) {
      comissao = 0; como = 'sem comissão por serviço';
      semComissao.add(nameOf.get(l.mechanic_id!) ?? 'colaborador');
    } else if (l.commission_amount != null) {
      comissao = r2(Number(l.commission_amount)); como = `${money(comissao)} definido no item`;
    } else {
      const c = serviceCommission({
        service: l, parts, type: tipo, who: l.mechanic_id!, brought: os.cliente_trouxe_peca, rules, pct: RULE,
      });
      comissao = c.value; como = c.base;
    }
    if (comissao != null && comissao > 0 && l.mechanic_id) {
      const e = perPerson.get(l.mechanic_id) ?? { valor: 0, como: [] };
      e.valor = r2(e.valor + comissao);
      if (como) e.como.push(`item ${numero}: ${como}`);
      perPerson.set(l.mechanic_id, e);
    }
    return {
      numero, servico: l.description, valor: lineTotal(l),
      tipo: tipo === 'servico' ? 'serviço com peça (4% sobre serviço + peças)' : 'mão de obra (10%)',
      responsavel: l.mechanic_id ? (nameOf.get(l.mechanic_id) ?? 'colaborador') : plataforma ? 'plataforma' : null,
      comissao, como_calculou: como || null,
      pecas: parts.map((p) => ({ nome: p.description, qtd: Number(p.quantity), custo_unitario: Number(p.unit_cost ?? 0), custo_total: costOf(p) })),
      custo_pecas_do_item: r2(parts.reduce((s, p) => s + costOf(p), 0)),
    };
  });

  // Peças que não pertencem a nenhum serviço (avulsas)
  const avulsas = items.filter((p) => p.kind === 'part' && (!p.used_in_item_id || !serviceIds.has(p.used_in_item_id)));
  const semCusto = items.filter((p) => p.kind === 'part' && !(Number(p.unit_cost ?? 0) > 0)).map((p) => p.description);

  const valorServicos = r2(items.filter((i) => i.kind === 'labor').reduce((s, i) => s + lineTotal(i), 0));
  const valorPecasCobradas = r2(items.filter((i) => i.kind === 'part').reduce((s, i) => s + lineTotal(i), 0));
  const custoPecas = r2(items.filter((i) => i.kind === 'part').reduce((s, p) => s + costOf(p), 0));
  const comissoes = [...perPerson.entries()].map(([id, e]) => ({ colaborador: nameOf.get(id) ?? 'colaborador', valor: e.valor, como: e.como.join(' · ') }));
  const comissaoTotal = r2(comissoes.reduce((s, c) => s + c.valor, 0));

  const avisos: string[] = [];
  if (semResponsavel.length) avisos.push(`Itens sem responsável (sem comissão ainda): ${semResponsavel.join('; ')}.`);
  if (semComissao.size) avisos.push(`Sem comissão por serviço (salário fixo ou só % do faturamento): ${[...semComissao].join(', ')}.`);
  if (semCusto.length) avisos.push(`Peças sem custo informado (o custo de peças está incompleto): ${semCusto.join(', ')}.`);
  if (os.comissao_manual) avisos.push('Esta OS tem comissão digitada à mão no Caixa: os valores acima são só pela regra.');
  avisos.push('A comissão do gerente (% sobre o faturamento da loja) não entra nesta conta, igual à tela do Caixa.');

  return {
    os: { numero: os.numero, status: os.status, cliente: os.cliente, carro: os.carro, titulo: os.titulo },
    itens,
    ...(avulsas.length ? { pecas_avulsas: avulsas.map((p) => ({ nome: p.description, qtd: Number(p.quantity), valor: lineTotal(p), custo: costOf(p) })) } : {}),
    totais: {
      valor_servicos: valorServicos,
      ...(valorPecasCobradas > 0 ? { valor_pecas_cobradas: valorPecasCobradas } : {}),
      desconto: r2(Number(os.desconto ?? 0)),
      total_da_os: r2(Number(os.preco)),
      custo_de_pecas: custoPecas,
      comissoes: comissaoTotal,
    },
    comissoes,
    avisos,
  };
}
