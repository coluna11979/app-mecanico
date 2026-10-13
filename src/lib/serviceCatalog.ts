import { salesOf, type PanelItem, type PanelOs, type Range } from '@/lib/workshopMetrics';

/**
 * Oficina de serviços: o que sai nas OS como "peça" (par de disco c/ pastilha, bandejas, kit de embreagem…)
 * é, de fato, um serviço executado. Aqui cada item (peça ou mão de obra) é traduzido para o serviço
 * que ele representa. A primeira regra que casar vence — por isso as específicas vêm antes das gerais.
 */

const RULES: { name: string; re: RegExp }[] = [
  { name: 'Correia dentada / distribuição', re: /correia dentada|distribuicao|kit (da )?correia|tensor (da )?correia dentada/ },
  { name: 'Embreagem', re: /embreagem|(?:^|[^a-z])plato|atuador (de )?embreagem|cilindro (mestre|auxiliar|atuador)(.*)embreagem/ },
  { name: 'Freios (discos, pastilhas, lonas)', re: /pastilha|disco|(?:^|[^a-z])lona|tambor|sapata|pinca|freio|cilindro de roda|cilindro mestre|(?:^|[^a-z])servo/ },
  { name: 'Suspensão (amortecedores, bandejas, buchas)', re: /coxim (do |da |de )?(amortecedor|suspensao)|amortecedor|(?:^|[^a-z])mola|bandeja|pivo|bucha|estabilizadora|bieleta|batente|suspensao|rolamento (de |da )?roda|(?:^|[^a-z])cubo|kit (de )?coxim/ },
  { name: 'Coxins do motor e do câmbio', re: /coxim/ },
  { name: 'Transmissão e semieixos', re: /homocinetica|semi ?eixo|cardan|cambio|caixa de marcha|diferencial|trizeta|tulipa|transmissao|(?:^|[^a-z])atf(?:$|[^a-z])/ },
  { name: 'Direção (terminais, barras, caixa)', re: /direcao|terminal|barra axial|articulacao|hidraulic|cremalheira/ },
  { name: 'Ar-condicionado', re: /ar[ -]?condicionado|compressor|condensador|evaporador|higieniz|filtro (de )?(cabine|polen)|gas (r|134|1234)/ },
  { name: 'Arrefecimento (radiador, bomba d\'água)', re: /radiador|bomba d ?\'?agua|termostat|ventoinha|arrefec|aditivo|reservatorio|mangueira/ },
  { name: 'Correias do motor (acessórios)', re: /correia|poli ?v|tensor/ },
  { name: 'Escapamento', re: /escapamento|silencioso|catalisador|abafador|ponteira|flexivel/ },
  { name: 'Ignição e injeção', re: /(?:^|[^a-z])vela|bobina|(?:^|[^a-z])bico|injet|sonda|lambda|borboleta|sensor/ },
  { name: 'Elétrica e bateria', re: /bateria|alternador|motor de partida|arranque|lampada|farol|lanterna|fusivel|(?:^|[^a-z])rele(?:$|[^a-z])|chicote|eletric/ },
  { name: 'Pneus, alinhamento e balanceamento', re: /pneu|alinhamento|balanceamento|cambagem|calibragem|(?:^|[^a-z])roda|camara/ },
  { name: 'Motor (juntas, retentores, cabeçote)', re: /junta|retentor|cabecote|tampa de valvula|pistao|biela|(?:^|[^a-z])(?:anel|aneis)(?:$|[^a-z])|retifica|valvula|motor completo|vedacao/ },
  { name: 'Carroceria e acessórios', re: /palheta|limpador|parabrisa|retrovisor|para-?choque|vidro|macaneta|buzina/ },
  { name: 'Revisão e diagnóstico', re: /diagnostico|scanner|inspecao|check-?up/ },
  { name: 'Troca de óleo, filtros e revisão', re: /oleo|filtro|revisao|lubrificante/ },
];

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Serviço que a peça/mão de obra representa (null = ainda não identificado) */
export function serviceOf(description: string): string | null {
  const d = norm(description);
  return RULES.find(r => r.re.test(d))?.name ?? null;
}

export type ServiceExecuted = {
  name: string; orders: number; revenue: number; parts: number; labor: number;
  identified: boolean;
};
export const UNKNOWN_SERVICE = 'Serviço não identificado';

/**
 * Serviços executados no período. Mão de obra não é um serviço: é o que foi cobrado para executar um.
 * Cada item é ligado ao serviço que ele representa; o que não diz qual é (ex.: "Mão de obra") vai para o
 * serviço principal da própria OS — o de maior valor entre os itens identificados — ou, se nenhum item
 * se identifica, para o que o título da OS indica. A OS conta uma vez por serviço.
 * Ex.: "Par de disco c/ pastilha" + "Mão de obra" na mesma OS = 1 serviço de freios.
 */
export function servicesExecuted(list: PanelOs[], items: PanelItem[], r: Range, limit = 8) {
  const sales = new Map(salesOf(list, r).sales.map(o => [o.id, o]));
  const byOs = new Map<string, PanelItem[]>();
  for (const i of items) {
    if (!sales.has(i.service_order_id)) continue;
    const arr = byOs.get(i.service_order_id) ?? [];
    arr.push(i); byOs.set(i.service_order_id, arr);
  }
  const map = new Map<string, ServiceExecuted & { ids: Set<string> }>();
  let unmatchedItems = 0;
  for (const [osId, its] of byOs) {
    const tagged = its.map(i => ({ i, cat: serviceOf(i.description), value: Number(i.quantity) * Number(i.unit_price) }));
    const totals = new Map<string, number>();
    for (const t of tagged) if (t.cat) totals.set(t.cat, (totals.get(t.cat) ?? 0) + t.value);
    const main = [...totals.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? serviceOf(sales.get(osId)!.title ?? '');
    for (const t of tagged) {
      const name = t.cat ?? main ?? UNKNOWN_SERVICE;
      if (!t.cat && !main) unmatchedItems += 1;
      const cur = map.get(name) ?? { name, orders: 0, revenue: 0, parts: 0, labor: 0, identified: name !== UNKNOWN_SERVICE, ids: new Set<string>() };
      cur.revenue += t.value;
      if (t.i.kind === 'part') cur.parts += t.value; else cur.labor += t.value;
      cur.ids.add(osId);
      map.set(name, cur);
    }
  }
  const rows = [...map.values()].map(({ ids, ...x }) => ({ ...x, orders: ids.size }))
    // Pelo volume (quantas vezes o serviço foi feito); valor só desempata. "Não identificado" sempre por último.
    .sort((a, b) => Number(a.name === UNKNOWN_SERVICE) - Number(b.name === UNKNOWN_SERVICE) || b.orders - a.orders || b.revenue - a.revenue);
  return { rows: rows.slice(0, limit), unmatchedItems };
}
