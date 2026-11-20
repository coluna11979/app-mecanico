import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from '@/components/ui/Toast';
import type { OsItemKind, ServiceOrderItem } from '@/types/database';
import { categoryFromServices, categoryParts, fmtBRL, moneyInput, parseMoney } from './osHelpers';
import { DEFAULT_MARGIN, fmtPct, fmtQty, loadAllParts, loadMargins, marginOf, salePriceOf, type Margins, type WorkshopPart } from '@/lib/parts';
import AddSheet, { type CarKit, type SheetMode } from './AddSheet';
import QuickPartModal from '@/components/parts/QuickPartModal';
import { RULE } from '@/lib/commission';
import { loadItemRules, serviceCommission, type ItemRule } from '@/lib/commissionRules';
import { groupBy, loadServiceCharges, norm, type PriceSummary } from '@/lib/servicePrices';
import { pickKitRows, type KitDbRow } from '@/lib/osKits';
import { useServiceCategories } from '@/lib/serviceCategories';
import { fitsVehicle, loadPartVehicles, type PartVehicle } from '@/lib/partVehicles';

/** Categoria do serviço (trecho do nome, sem acento) → categorias de peça do cadastro que fazem sentido nele */
const PART_FAMILIES: [string, string[]][] = [
  ['troca de oleo', ['oleos_filtros']],
  ['pneu', ['rodas']],
  ['rolament', ['rolamento', 'cubo']],
  ['cubo', ['cubo', 'rolamento']],
  ['freio', ['freios', 'cubo', 'rolamento']],
  ['suspens', ['suspensao', 'cubo', 'rolamento']],
  ['direc', ['suspensao']],
  ['arrefec', ['arrefecimento']],
  ['transmiss', ['transmissao']],
  ['embreag', ['transmissao']],
  ['cambio', ['transmissao']],
  ['injec', ['ignicao_injecao']],
  ['escapament', ['escapamento']],
  ['eletric', ['eletrica']],
  ['ar-condicionado', ['ar_condicionado']],
  ['ar condicionado', ['ar_condicionado']],
  ['motor', ['motor', 'ignicao_injecao', 'arrefecimento']],
  ['revisao', ['oleos_filtros', 'freios', 'ignicao_injecao', 'motor']],
];

/** Pneu/roda: nome vem como "205/70R15 Marca" */
const TIRE_RE = /\b(pneus?|camaras? de ar)\b|\b\d{3}\/\d{2} ?z?r ?\d{2}/;

/** Linha em edição (strings para os campos digitados) */
type Row = {
  key: string;
  id?: string;
  kind: OsItemKind;
  description: string;
  quantity: string;
  unit_price: string;
  /** Custo de compra do momento (só peças) */
  unit_cost: string;
  /** Peça do cadastro de onde veio */
  part_id: string | null;
  /** Quem fez (comissão); '' = responsável da OS · PLATFORM_ITEM = mecânico da plataforma */
  mechanic_id: string;
  /** Só peças: key da linha do serviço em que foi usada ('' = nenhum) — a comissão da peça segue quem fez esse serviço */
  used_in: string;
  /** Só peças: item próprio da OS (preço de venda), não fica dentro do serviço de cima */
  standalone?: boolean;
  /** Só serviços: 'servico' / 'mao_de_obra'. Com peça da loja abaixo → 4% sobre serviço + peças; sem peça → 10% */
  stype: '' | 'servico' | 'mao_de_obra';
  /** Só serviços: comissão digitada para quem fez (R$, substitui a regra deste serviço); '' = regra */
  comm: string;
};

/** Peças pertencem ao serviço imediatamente acima delas (até o próximo serviço/mão de obra) */
function groupOf(rs: Row[]): Map<string, Row | null> {
  const g = new Map<string, Row | null>();
  // Peças antes do primeiro serviço pertencem a esse primeiro serviço (nas notas o serviço costuma vir por último)
  let cur: Row | null = rs.find(r => r.kind === 'labor') ?? null;
  for (const r of rs) {
    if (r.kind === 'labor') cur = r;
    else if (r.standalone) g.set(r.key, null); // item próprio: não entra no serviço de cima
    else g.set(r.key, cur);
  }
  return g;
}

/** Item da OS = um serviço com as peças dele (ou uma peça avulsa, quando não há serviço) */
type Block = { svc: Row | null; parts: Row[] };
function buildBlocks(rs: Row[], g: Map<string, Row | null>): Block[] {
  const out: Block[] = [];
  for (const r of rs) {
    if (r.kind === 'labor') out.push({ svc: r, parts: rs.filter(x => x.kind === 'part' && g.get(x.key)?.key === r.key) });
    else if (!g.get(r.key)) out.push({ svc: null, parts: [r] });
  }
  return out;
}
const blockKey = (b: Block) => (b.svc ?? b.parts[0]).key;

/** Serviço sem tipo (OS antiga): com peça logo abaixo vira "Serviço", sem peça vira "Mão de obra" */
function withTypes(rs: Row[]): Row[] {
  return rs.map((r, i) => {
    if (r.kind !== 'labor' || r.stype) return r;
    let hasPart = false;
    for (let j = i + 1; j < rs.length && rs[j].kind !== 'labor'; j++) hasPart = true;
    // Primeiro serviço também leva as peças que vêm antes dele
    if (rs.findIndex(x => x.kind === 'labor') === i && rs.slice(0, i).some(x => x.kind === 'part')) hasPart = true;
    return { ...r, stype: hasPart ? 'servico' : 'mao_de_obra' };
  });
}
/** Tipo efetivo do serviço: com peça logo abaixo (ou marcado "inclui peças") vale 4% sobre serviço + peças; senão é só mão de obra (10%) */
function effType(r: Row, rs: Row[], g: Map<string, Row | null>): 'servico' | 'mao_de_obra' {
  if (r.stype === 'servico') return 'servico';
  return rs.some(x => x.kind === 'part' && g.get(x.key)?.key === r.key) ? 'servico' : 'mao_de_obra';
}
const initRows = (items: ServiceOrderItem[]): Row[] => withTypes(items.map(toRow));

/** Valor do "Quem fez" para item feito por mecânico da plataforma (sem comissão da equipe) */
export const PLATFORM_ITEM = 'platform';
export const whoPatch = (v: string) => (v === PLATFORM_ITEM
  ? { workshop_mechanic_id: null, executor: 'platform' }
  : { workshop_mechanic_id: v || null, executor: v ? 'workshop' : null });

type TeamMember = { id: string; name: string; active: boolean; no_commission?: boolean | null; commission_revenue_only?: boolean | null };

export type Suggestion = { description: string; kind: OsItemKind; unit_price: number; part_id?: string; code?: string | null; cost?: number; stock?: number; unit?: string; fromTable?: boolean; /** Serviço da Tabela que usa peça (0189) */ levaPeca?: boolean; qty?: number; category?: string; /** Categoria da peça no cadastro (freios, oleos_filtros…) */ pcat?: string; universal?: boolean; /** Palavras extras da busca (categoria, "pneu") */ search?: string };

let keySeq = 0;
const newKey = () => `new-${++keySeq}`;

function toRow(i: ServiceOrderItem): Row {
  return {
    key: i.id, id: i.id, kind: i.kind, description: i.description,
    quantity: String(i.quantity).replace('.', ','), unit_price: moneyInput(i.unit_price),
    unit_cost: i.unit_cost != null ? moneyInput(Number(i.unit_cost)) : '', part_id: i.part_id ?? null,
    mechanic_id: i.executor === 'platform' ? PLATFORM_ITEM : i.workshop_mechanic_id ?? '',
    used_in: i.used_in_item_id ?? '',
    standalone: i.kind === 'part' ? !!i.standalone : undefined,
    stype: i.kind === 'labor' ? i.service_type ?? '' : '',
    comm: i.kind === 'labor' && i.commission_amount != null ? moneyInput(Number(i.commission_amount)) : '',
  };
}

/** Peça dentro de um item e sem preço de venda: serve só para custo/estoque (não soma no valor da OS) */
const costOnly = (r: Row, nested: boolean) => r.kind === 'part' && nested && !(parseMoney(r.unit_price || '0') > 0);

function rowTotal(r: Row): number {
  const q = parseMoney(r.quantity);
  const p = parseMoney(r.unit_price);
  return Number.isFinite(q) && Number.isFinite(p) ? q * p : 0;
}

/** Custo total da linha (null quando a peça não tem custo informado) */
function rowCost(r: Row): number | null {
  if (r.kind !== 'part' || !r.unit_cost.trim()) return null;
  const q = parseMoney(r.quantity);
  const c = parseMoney(r.unit_cost);
  return Number.isFinite(q) && Number.isFinite(c) ? q * c : null;
}

interface Props {
  osId: string;
  workshopId: string;
  items: ServiceOrderItem[];
  discount: number;
  /** OS antiga sem itens: valores digitados à mão na criação */
  legacy: { parts: number | null; labor: number | null; price: number };
  readOnly?: boolean;
  /** Mostra custo e margem das peças (gestor / permissão "Ver financeiro") */
  showCost?: boolean;
  /** "OS nº 0123" — vai na observação da compra feita pelo cadastro rápido de peça */
  osLabel?: string;
  /** Responsável da OS — é quem fica com o item quando "quem fez" está vazio */
  osMechanicId?: string | null;
  /** Pode dizer quem fez cada item (gestor/caixa) — vale até com a OS concluída */
  canAssign?: boolean;
  /** Cliente trouxe a peça (comissão da mão de obra usa a % própria) */
  customerBroughtParts?: boolean;
  /** Venda de peças no balcão: só peças, sem serviço/mão de obra nem "cliente trouxe a peça" */
  saleMode?: boolean;
  /** OS ainda sendo montada (aberta/aprovação/aprovada): ninguém executou nada, então não pergunta "Quem fez" */
  planning?: boolean;
  /** Avisa a página quando há itens digitados ainda não salvos (o quadro de comissões só enxerga os salvos) */
  onDirtyChange?: (dirty: boolean) => void;
  /** Veículo da OS: o serviço sugere o preço já cobrado nesse modelo */
  vehicle?: { make?: string | null; model?: string | null; year?: number | null; tech_vehicle_id?: string | null } | null;
  onSaved: () => void;
}

type KitOffer = { name: string; serviceId: string | null; price: number; checked: boolean; parts: { description: string; quantity: number; part_id: string | null }[] };

export default function OsItemsEditor({ osId, workshopId, items, discount, legacy, readOnly, showCost, osLabel = 'OS', osMechanicId, canAssign, customerBroughtParts = false, saleMode = false, planning = false, vehicle = null, onDirtyChange, onSaved }: Props) {
  const [rows, setRows]         = useState<Row[]>(() => initRows(items));
  const [discountStr, setDisc]  = useState(() => (discount ? moneyInput(discount) : ''));
  const [saving, setSaving]     = useState(false);
  const [kitOffer, setKitOffer] = useState<KitOffer[] | null>(null);
  const [kitBusy, setKitBusy]   = useState(false);
  const [suggestions, setSugg]  = useState<Suggestion[]>([]);
  const [margin, setMargin]     = useState<Margins>({ base: DEFAULT_MARGIN, byCategory: {} });
  /** Cadastro rápido de peça: key = linha que vai receber a peça (null = cria linha nova) */
  const [quick, setQuick]       = useState<{ key: string | null; name: string; qty: number; cat?: string | null } | null>(null);
  const [team, setTeam]         = useState<TeamMember[]>([]);
  // Janela de "Adicionar": OS nova, sem itens, já abre nela
  const [sheet, setSheet] = useState<SheetMode | null>(() => (items.length === 0 && !readOnly && !saleMode ? { kind: 'top' } : null));
  /** Serviços mais lançados pela oficina (atalhos da janela de Adicionar) */
  const [topServices, setTopServices] = useState<string[]>([]);
  /** Regras por item da loja (ex.: alinhamento sem comissão) — para mostrar a comissão de cada serviço */
  const [itemRules, setItemRules] = useState<ItemRule[]>([]);
  /** Serviço com o campo de comissão aberto */
  const [commEdit, setCommEdit] = useState<string | null>(null);

  /** Preço já cobrado de cada serviço neste modelo de veículo (outras OS) — chave = nome normalizado */
  const [vehPrices, setVehPrices] = useState<Map<string, PriceSummary>>(new Map());
  // Categorias em que a peça é o que se vende (pneu): o item é só o cabeçalho e as peças entram como itens com preço de venda
  const { sellsSet, names: catNames } = useServiceCategories(workshopId);
  const sellsParts = (r: { kind: OsItemKind; description: string } | undefined) => !!r && r.kind === 'labor' && sellsSet.has(norm(r.description));
  const [partVeh, setPartVeh] = useState<Map<string, PartVehicle[]> | null>(null);
  const vehModel = vehicle?.model?.trim() || '';
  useEffect(() => {
    if (!vehModel || saleMode || readOnly) { setVehPrices(new Map()); return; }
    let alive = true;
    loadServiceCharges(workshopId, { model: vehModel, excludeOs: osId })
      .then(cs => { if (alive) setVehPrices(new Map(groupBy(cs, c => c.key).map(g => [g.key, g.sum]))); })
      .catch(() => { /* sem histórico: segue só com a tabela */ });
    return () => { alive = false; };
  }, [workshopId, osId, vehModel, saleMode, readOnly]);

  // Equipe, para dizer quem fez cada item (comissão)
  useEffect(() => {
    supabase.from('workshop_mechanics').select('id, name, active, no_commission, commission_revenue_only').eq('workshop_id', workshopId).order('name')
      .then(({ data }) => setTeam((data as TeamMember[]) ?? []));
    loadItemRules(workshopId).then(setItemRules);
  }, [workshopId]);
  const teamName = useMemo(() => new Map(team.map(m => [m.id, m.name])), [team]);
  // Com a opção "mecânico da plataforma", vale mostrar mesmo com um só colaborador
  const showWho = !!canAssign || team.filter(m => m.active).length > 1 || items.some(i => i.workshop_mechanic_id || i.executor === 'platform');

  const [ownParts, setOwnParts] = useState(customerBroughtParts);
  useEffect(() => { setOwnParts(customerBroughtParts); }, [customerBroughtParts]);
  async function toggleOwnParts(v: boolean) {
    setOwnParts(v);
    const { error } = await supabase.from('service_orders').update({ customer_brought_parts: v }).eq('id', osId);
    if (error) { setOwnParts(!v); toast.error('Não foi possível salvar: ' + error.message); return; }
    toast.success(v ? 'Marcado: cliente trouxe a peça' : 'Desmarcado: peça da loja');
    onSaved();
  }

  const whoLabel = (r: Row) => r.mechanic_id === PLATFORM_ITEM ? '🌐 plataforma'
    : (r.mechanic_id && teamName.get(r.mechanic_id)) || (osMechanicId && teamName.get(osMechanicId)) || 'responsável da OS';
  const groups = useMemo(() => groupOf(rows), [rows]);
  const blocks = useMemo(() => buildBlocks(rows, groups), [rows, groups]);

  /** OS fechada: troca quem fez direto no item (a caixa acerta a comissão na hora de receber) */
  async function assign(r: Row, mechanicId: string) {
    if (!r.id) return;
    setRows(rs => rs.map(x => x.key === r.key ? { ...x, mechanic_id: mechanicId } : x));
    const { error } = await supabase.from('service_order_items').update(whoPatch(mechanicId)).eq('id', r.id);
    if (error) { toast.error('Não foi possível trocar: ' + error.message); setRows(initRows(items)); return; }
    toast.success(mechanicId === PLATFORM_ITEM ? 'Item marcado para o mecânico da plataforma ✓' : 'Comissão deste item atualizada ✓');
    onSaved();
  }

  /** Comissão de cada serviço: valor digitado, ou a regra (4% serviço + peças · 10% mão de obra · regras da loja) */
  const commOf = (r: Row): { who: string | null; value: number; base: string; typed: boolean; none?: string } => {
    const who = r.mechanic_id === PLATFORM_ITEM ? PLATFORM_ITEM : r.mechanic_id || osMechanicId || '';
    if (who === PLATFORM_ITEM) return { who, value: 0, base: '', typed: false, none: 'mecânico da plataforma — sem comissão da equipe' };
    if (!who) return { who: null, value: 0, base: '', typed: false, none: 'escolha quem fez' };
    if (team.find(m => m.id === who)?.no_commission) return { who, value: 0, base: '', typed: false, none: 'salário fixo — sem comissão' };
    if (team.find(m => m.id === who)?.commission_revenue_only) return { who, value: 0, base: '', typed: false, none: 'ganha só % do faturamento — sem comissão por item' };
    if (r.comm.trim()) return { who, value: Math.max(0, parseMoney(r.comm)), base: 'definido na OS', typed: true };
    const parts = rows.filter(x => x.kind === 'part' && groups.get(x.key)?.key === r.key)
      .map(x => ({ description: x.description, quantity: parseMoney(x.quantity), unit_price: parseMoney(x.unit_price || '0') }));
    const c = serviceCommission({
      service: { description: r.description, quantity: parseMoney(r.quantity), unit_price: parseMoney(r.unit_price || '0') },
      parts, type: effType(r, rows, groups), who, brought: ownParts, rules: itemRules, pct: RULE,
    });
    return { who, value: c.value, base: c.base || 'item sem comissão pela regra da loja', typed: false };
  };

  /** OS fechada: grava a comissão do serviço direto no item */
  async function saveComm(r: Row, value: string) {
    if (!r.id) return;
    setRows(rs => rs.map(x => x.key === r.key ? { ...x, comm: value } : x));
    const { error } = await supabase.from('service_order_items')
      .update({ commission_amount: value.trim() ? Math.max(0, parseMoney(value)) : null }).eq('id', r.id);
    if (error) { toast.error('Não foi possível salvar a comissão: ' + error.message); setRows(initRows(items)); return; }
    toast.success(value.trim() ? 'Comissão do serviço salva ✓' : 'Comissão volta para a regra ✓');
    onSaved();
  }

  // Recarrega quando os itens salvos mudam (após salvar)
  useEffect(() => { setRows(initRows(items)); }, [items]);
  useEffect(() => { setDisc(discount ? moneyInput(discount) : ''); }, [discount]);

  // Sugestões: peças do cadastro (preço de venda atual) e itens que a oficina já usou (último preço cobrado)
  useEffect(() => {
    let alive = true;
    (async () => {
      const [cat, svc, hist, margin, pv] = await Promise.all([
        loadAllParts(workshopId, 'id, name, code, category, cost, margin_percent, sale_price, stock_qty, unit, universal').then(data => ({ data })),
        supabase.from('workshop_services').select('name, price, category, leva_peca')
          .eq('workshop_id', workshopId).eq('active', true).order('name'),
        supabase.from('service_order_items')
          .select('description, kind, unit_price, created_at')
          .eq('workshop_id', workshopId)
          .order('created_at', { ascending: false })
          .limit(300),
        loadMargins(workshopId),
        loadPartVehicles(workshopId).catch(() => null),
      ]);
      if (!alive) return;
      const seen = new Map<string, Suggestion>();
      for (const p of (cat.data ?? []) as Pick<WorkshopPart, 'id' | 'name' | 'code' | 'category' | 'cost' | 'margin_percent' | 'sale_price' | 'stock_qty' | 'unit' | 'universal'>[]) {
        // Mesmo nome com código diferente é outra peça (ex.: marcas diferentes)
        const k = `${p.name.trim().toLowerCase()}|${(p.code ?? '').trim()}`;
        if (!seen.has(k)) seen.set(k, { description: p.name.trim(), kind: 'part', unit_price: salePriceOf(p, margin), part_id: p.id, code: p.code, cost: Number(p.cost), stock: Number(p.stock_qty), unit: p.unit, category: p.category ?? undefined, pcat: p.category ?? undefined,
          search: `${p.category ?? ''} ${TIRE_RE.test(norm(p.name)) ? 'pneu pneus' : ''}`,
          // Pneu/roda serve em qualquer carro (a medida é escolhida na hora; o nome vem como "205/70R15 Marca"), mesmo sem estar marcado como universal
          universal: TIRE_RE.test(norm(p.name)) });
      }
      // Tabela de serviços da oficina: preço oficial da mão de obra
      for (const s of (svc.data ?? []) as { name: string; price: number; category: string | null; leva_peca?: boolean }[]) {
        const k = s.name.trim().toLowerCase();
        if (!seen.has(k)) seen.set(k, { description: s.name.trim(), kind: 'labor', unit_price: Number(s.price), fromTable: true, category: s.category ?? undefined, levaPeca: s.leva_peca !== false });
      }
      for (const d of (hist.data ?? []) as Suggestion[]) {
        // Peça só vem do catálogo ativo (com estoque e custo): peça usada antes, sem cadastro, não é sugerida
        if (d.kind === 'part') continue;
        const k = d.description.trim().toLowerCase();
        if (!seen.has(k)) seen.set(k, { description: d.description.trim(), kind: d.kind, unit_price: Number(d.unit_price) });
      }
      setSugg([...seen.values()]);
      // Mais usados: os serviços que mais aparecem nas OS recentes
      const freq = new Map<string, { n: number; name: string }>();
      for (const d of (hist.data ?? []) as Suggestion[]) {
        if (d.kind !== 'labor' || !d.description?.trim()) continue;
        const k = norm(d.description);
        freq.set(k, { n: (freq.get(k)?.n ?? 0) + 1, name: d.description.trim() });
      }
      setTopServices([...freq.values()].filter(f => f.n >= 2).sort((a, b) => b.n - a.n).map(f => f.name));
      setMargin(margin);
      setPartVeh(pv);
    })();
    return () => { alive = false; };
  }, [workshopId]);

  // Peças só do veículo da OS: as cadastradas para o carro (marca/modelo/ano) e as universais
  const vehMake = /^n(ã|a)o informad/i.test((vehicle?.make ?? '').trim()) ? '' : (vehicle?.make ?? '').trim();
  // Peça de nota recém-lançada ainda não tem veículo vinculado: vale também o nome ("... LOGAN SANDERO" serve no Sandero)
  const modelWord = norm(vehModel).split(/[^a-z0-9]+/).find(w => w.length >= 3) ?? '';
  const nameHasModel = (name: string) => !!modelWord && new RegExp(`(^|[^a-z0-9])${modelWord}([^a-z0-9]|$)`).test(norm(name));
  const makeWord = norm(vehMake).split(/[^a-z0-9]+/).find(w => w.length >= 3) ?? '';
  const nameHasMake = (name: string) => !!makeWord && new RegExp(`(^|[^a-z0-9])${makeWord}([^a-z0-9]|$)`).test(norm(name));
  const vehFits = vehModel && partVeh
    ? (s: Suggestion) => !s.part_id || !!s.universal || fitsVehicle(partVeh.get(s.part_id), vehMake, vehModel, vehicle?.year ?? null) || nameHasModel(s.description)
      // Peça nova, ainda sem veículo vinculado, com só a marca no nome ("... EMBREAGEM PEUGEOT")
      || (!partVeh.get(s.part_id)?.length && nameHasMake(s.description))
    : undefined;
  // Peça do item: só as da família dele (troca de óleo → óleos e filtros; freios → freios…), além do veículo
  const itemPartCats = (desc: string): string[] | null => {
    const d = norm(desc);
    const c = norm(suggestions.find(x => x.kind === 'labor' && norm(x.description) === d)?.category ?? catNames.find(n => norm(n) === d) ?? '');
    return PART_FAMILIES.find(([k]) => c.includes(k))?.[1] ?? null;
  };
  const partFits = (s: Suggestion, itemKey?: string) => {
    if (vehFits && !vehFits(s)) return false;
    const item = itemKey ? rows.find(r => r.key === itemKey) : undefined;
    const allowed = item ? itemPartCats(item.description) : null;
    return !allowed || !s.pcat || s.pcat === 'outros' || allowed.includes(s.pcat) || (!!s.universal && allowed.includes('rodas'));
  };

  // A Tabela de serviços pode mudar com a OS aberta (serviço novo, categoria nova): recarrega só os serviços
  // (leve) ao voltar para a aba e ao abrir o seletor — as peças, que são muitas, não são recarregadas
  async function refreshServices() {
    const { data } = await supabase.from('workshop_services').select('name, price, category, leva_peca').eq('workshop_id', workshopId).eq('active', true).order('name');
    if (!data) return;
    const fresh = (data as { name: string; price: number; category: string | null; leva_peca?: boolean }[]).map<Suggestion>(s => ({
      description: s.name.trim(), kind: 'labor', unit_price: Number(s.price), fromTable: true, category: s.category ?? undefined, levaPeca: s.leva_peca !== false }));
    const names = new Set(fresh.map(f => f.description.toLowerCase()));
    setSugg(prev => [...prev.filter(x => x.kind !== 'labor' || (!x.fromTable && !names.has(x.description.toLowerCase()))), ...fresh]);
  }
  useEffect(() => {
    const onFocus = () => { refreshServices(); };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [workshopId]); // eslint-disable-line react-hooks/exhaustive-deps

  const parts = rows.filter(r => r.kind === 'part').reduce((a, r) => a + rowTotal(r), 0);
  const labor = rows.filter(r => r.kind === 'labor').reduce((a, r) => a + rowTotal(r), 0);
  const disc  = Number.isFinite(parseMoney(discountStr)) ? parseMoney(discountStr) : 0;
  const total = Math.max(parts + labor - disc, 0);
  const partRows = rows.filter(r => r.kind === 'part');
  const costed = partRows.filter(r => rowCost(r) != null);
  const partsCost = costed.reduce((a, r) => a + (rowCost(r) ?? 0), 0);
  const costedSale = costed.reduce((a, r) => a + rowTotal(r), 0);

  const original = useMemo(() => JSON.stringify(initRows(items)), [items]);
  const dirty = JSON.stringify(rows) !== original
    || Math.abs(disc - (discount ?? 0)) > 0.001;
  useEffect(() => { onDirtyChange?.(dirty); return () => onDirtyChange?.(false); }, [dirty]);  // eslint-disable-line react-hooks/exhaustive-deps

  /** Peça já dentro de um serviço: entra logo abaixo dele (e das peças que ele já tem) */
  function addPartTo(serviceKey: string): string {
    const key = newKey();
    setRows(rs => {
      const i = rs.findIndex(r => r.key === serviceKey);
      let j = i + 1;
      while (j < rs.length && rs[j].kind === 'part') j++;
      const row: Row = { key, kind: 'part', description: '', quantity: '1', unit_price: '', unit_cost: '', part_id: null, mechanic_id: '', used_in: '', stype: '', comm: '',
        standalone: sellsParts(rs[i]) ? true : undefined };
      return [...rs.slice(0, j), row, ...rs.slice(j)];
    });
    return key;
  }
  /** Item escolhido no painel do catálogo: serviço entra como item; peça entra dentro do serviço escolhido (ou avulsa se não há serviço) */
  function addFromCatalog(sg: Suggestion, targetKey: string): string | undefined {
    const vp = sg.kind === 'labor' ? vehPrices.get(norm(sg.description)) : undefined;
    const price = vp ? moneyInput(vp.last) : sg.unit_price > 0 ? moneyInput(sg.unit_price) : '';
    if (sg.kind === 'labor') {
      // Serviço que já entrou na abertura da OS (chip "Troca de óleo", sem valor ainda): o catálogo completa esse item
      // em vez de criar outro, e as peças do kit entram nele
      const nd = norm(sg.description);
      const reuse = rows.find(r => r.kind === 'labor' && !r.standalone && !r.part_id && !(parseMoney(r.unit_price) > 0) && r.description.trim()
        && (norm(r.description) === nd || nd.startsWith(norm(r.description) + ' ')));
      if (reuse) {
        setRows(rs => rs.map(r => r.key === reuse.key ? { ...r, description: sg.description, unit_price: r.unit_price || price } : r));
        return reuse.key;
      }
      const key = newKey();
      setRows(rs => [...rs, { key, kind: 'labor', description: sg.description, quantity: '1', unit_price: price, unit_cost: '', part_id: null, mechanic_id: '', used_in: '', stype: 'servico', comm: '' }]);
      return key;
    }
    const row: Row = { key: newKey(), kind: 'part', description: sg.description, quantity: sg.qty && sg.qty > 0 ? String(sg.qty).replace('.', ',') : '1', unit_price: price,
      unit_cost: sg.cost ? moneyInput(sg.cost) : '', part_id: sg.part_id ?? null, mechanic_id: '', used_in: '', stype: '', comm: '' };
    setRows(rs => {
      const i = targetKey ? rs.findIndex(r => r.key === targetKey) : -1;
      if (i < 0) return [...rs, { ...row, standalone: rs.some(x => x.kind === 'labor') ? true : undefined }];
      let j = i + 1;
      while (j < rs.length && rs[j].kind === 'part') j++;
      // Pneu e rodas: a peça é vendida (item próprio, com o preço de venda do cadastro)
      if (sellsParts(rs[i])) return [...rs.slice(0, j), { ...row, standalone: true }, ...rs.slice(j)];
      // Dentro de um item, a peça é só custo: o preço que o cliente paga já está no item
      return [...rs.slice(0, j), { ...row, unit_price: '' }, ...rs.slice(j)];
    });
  }
  /** Kits prontos para o carro desta OS (um por serviço da Tabela que tem peças cadastradas) */
  async function loadCarKits(): Promise<CarKit[]> {
    const { data } = await supabase.from('workshop_service_parts')
      .select('description, quantity, part_id, position, vehicle_model, tech_vehicle_id, year_from, year_to, workshop_services!inner(name, active)')
      .eq('workshop_id', workshopId).eq('workshop_services.active', true).order('position').limit(5000);
    type R = KitDbRow & { workshop_services: { name: string } | { name: string }[] };
    const bySvc = new Map<string, R[]>();
    for (const r of (data ?? []) as unknown as R[]) {
      const ws = Array.isArray(r.workshop_services) ? r.workshop_services[0] : r.workshop_services;
      if (!ws?.name) continue;
      bySvc.set(ws.name, [...(bySvc.get(ws.name) ?? []), r]);
    }
    const out: CarKit[] = [];
    for (const [name, rs] of bySvc) {
      const picked = pickKitRows(rs, { model: vehModel, year: vehicle?.year ?? null, techId: vehicle?.tech_vehicle_id ?? null });
      if (!picked.rows.length) continue;
      const svc = suggestions.find(s => s.kind === 'labor' && s.fromTable && norm(s.description) === norm(name));
      if (!svc) continue;
      out.push({ svc, parts: picked.rows.map(r => r.description), model: picked.model });
    }
    // Kit do modelo do carro primeiro
    return out.sort((a, b) => Number(!a.model) - Number(!b.model) || a.svc.description.localeCompare(b.svc.description, 'pt-BR'));
  }
  /**
   * Peças do kit do serviço escolhido no catálogo (cadastradas na Tabela de serviços).
   * Se existe kit para o modelo do carro da OS, ele vale no lugar do kit geral.
   */
  async function kitFor(s: Suggestion): Promise<{ items: Suggestion[]; model: string | null }> {
    if (!s.fromTable) return { items: [], model: null };
    const esc = s.description.trim().replace(/[%_\\]/g, m => '\\' + m);
    const { data } = await supabase.from('workshop_service_parts')
      .select('description, quantity, part_id, position, vehicle_model, tech_vehicle_id, year_from, year_to, workshop_services!inner(name)')
      .eq('workshop_id', workshopId).ilike('workshop_services.name', esc).order('position');
    type KitDb = { description: string; quantity: number; part_id: string | null; vehicle_model: string | null; tech_vehicle_id: string | null; year_from: number | null; year_to: number | null };
    const rows = (data ?? []) as unknown as KitDb[];
    // Kit do carro (ficha técnica → modelo/ano → geral): mesma regra usada ao salvar kits na conclusão da OS
    const picked = pickKitRows(rows, { model: vehModel, year: vehicle?.year ?? null, techId: vehicle?.tech_vehicle_id ?? null });
    const items = picked.rows.map(k => {
      const cat = k.part_id ? suggestions.find(x => x.part_id === k.part_id) : undefined;
      return cat ? { ...cat, qty: Number(k.quantity) } : { description: k.description, kind: 'part' as const, unit_price: 0, qty: Number(k.quantity) };
    });
    return { items, model: picked.model };
  }
  function update(key: string, patch: Partial<Row>) {
    setRows(rs => rs.map(r => {
      if (r.key !== key) return r;
      const next = { ...r, ...patch };
      const insideItem = r.kind === 'part' && groupOf(rs).get(r.key) != null;
      // Escolheu um item já usado antes → completa tipo e preço (se vazio).
      // Peça do cadastro → também guarda de qual peça veio e o custo de agora.
      if (patch.description !== undefined) {
        // Item de serviço não vira peça só porque o nome (ex.: "Escapamento") bate com uma peça do cadastro
        const s = suggestions.find(x => x.description.toLowerCase() === patch.description!.trim().toLowerCase() && (r.kind !== 'labor' || x.kind === 'labor'));
        if (s) {
          next.kind = s.kind;
          if (r.kind === 'labor' && s.kind === 'part') { next.standalone = true; next.stype = ''; }
          // Serviço da tabela sem preço fixo: o valor é digitado na OS
          if (!r.unit_price && s.unit_price > 0) next.unit_price = moneyInput(s.unit_price);
          // Serviço já cobrado neste modelo de veículo: o último preço dele vale mais que o da tabela
          const vp = s.kind === 'labor' && !r.unit_price ? vehPrices.get(norm(s.description)) : undefined;
          if (vp) next.unit_price = moneyInput(vp.last);
          if (s.part_id && s.part_id !== r.part_id) {
            next.part_id = s.part_id;
            next.unit_price = moneyInput(s.unit_price);
            next.unit_cost = s.cost ? moneyInput(s.cost) : '';
          }
        } else if (r.part_id) {
          next.part_id = null;
        }
      }
      if (next.kind !== 'part') { next.part_id = null; next.unit_cost = ''; }
      // Peça dentro de um item que ainda não tem preço de venda continua só com custo
      if (patch.description !== undefined && next.kind === 'part' && insideItem && !(parseMoney(r.unit_price || '0') > 0)) next.unit_price = '';
      return next;
    }));
  }
  function remove(key: string) {
    // Tirar um serviço leva as peças dele junto (senão elas passariam para outro serviço)
    setRows(rs => {
      const g = groupOf(rs);
      return rs.filter(r => r.key !== key && !(r.kind === 'part' && g.get(r.key)?.key === key));
    });
  }
  /** Sobe/desce o item inteiro (serviço com as peças dele) */
  function moveBlock(key: string, dir: -1 | 1) {
    setRows(rs => {
      const bl = buildBlocks(rs, groupOf(rs));
      const i = bl.findIndex(b => blockKey(b) === key);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= bl.length) return rs;
      [bl[i], bl[j]] = [bl[j], bl[i]];
      return bl.flatMap(b => (b.svc ? [b.svc, ...b.parts] : b.parts));
    });
  }

  /** Serviços da OS com peças dentro, que ainda não têm kit para o carro desta OS */
  async function buildKitOffers(grp: ReturnType<typeof groupOf>): Promise<KitOffer[]> {
    const labors = rows.filter(r => r.kind === 'labor' && !r.standalone && r.description.trim());
    const withParts = labors.map(l => ({
      l, parts: rows.filter(p => p.kind === 'part' && grp.get(p.key)?.key === l.key && p.description.trim()),
    })).filter(x => x.parts.length > 0);
    if (!withParts.length) return [];
    const { data: tbl } = await supabase.from('workshop_services').select('id, name').eq('workshop_id', workshopId);
    const byName = new Map(((tbl ?? []) as { id: string; name: string }[]).map(t => [norm(t.name), t.id]));
    const ids = withParts.map(x => byName.get(norm(x.l.description))).filter(Boolean) as string[];
    const { data: kits } = ids.length
      ? await supabase.from('workshop_service_parts').select('service_id, vehicle_model, tech_vehicle_id').in('service_id', ids)
      : { data: [] as { service_id: string; vehicle_model: string | null; tech_vehicle_id: string | null }[] };
    const mk = norm(vehModel);
    const techId = vehicle?.tech_vehicle_id ?? null;
    const hasKit = (sid: string) => ((kits ?? []) as { service_id: string; vehicle_model: string | null; tech_vehicle_id: string | null }[])
      .some(k => k.service_id === sid && (techId || mk
        ? (techId && k.tech_vehicle_id === techId) || (mk && k.vehicle_model && norm(k.vehicle_model) === mk)
        : !k.vehicle_model));
    void techId;
    return withParts.flatMap(({ l, parts }) => {
      const sid = byName.get(norm(l.description)) ?? null;
      if (sid && hasKit(sid)) return [];
      return [{
        name: l.description.trim(), serviceId: sid, price: parseMoney(l.unit_price || '0') || 0, checked: true,
        parts: parts.map(p => ({ description: p.description.trim(), quantity: parseMoney(p.quantity) || 1, part_id: p.part_id })),
      }];
    });
  }
  async function saveKits() {
    if (!kitOffer) return;
    setKitBusy(true);
    try {
      const { data: cur } = await supabase.from('service_orders').select('category').eq('id', osId).single();
      const cat = categoryParts(cur?.category)[0] ?? 'Outro';
      for (const o of kitOffer.filter(x => x.checked)) {
        let sid = o.serviceId;
        if (!sid) {
          const { data, error } = await supabase.from('workshop_services')
            .insert({ workshop_id: workshopId, name: o.name, category: cat, price: o.price }).select('id').single();
          if (error) throw error;
          sid = data.id as string;
        }
        const { error } = await supabase.from('workshop_service_parts').insert(o.parts.map((p, i) => ({
          workshop_id: workshopId, service_id: sid, part_id: p.part_id, description: p.description, quantity: p.quantity, position: i,
          // Kit do MODELO (qualquer carro desse modelo, de qualquer cliente): sem ficha nem ano específicos
          vehicle_model: vehModel || null, tech_vehicle_id: null, vehicle_make: vehicle?.make ?? null,
          year_from: null, year_to: null,
        })));
        if (error) throw error;
      }
      toast.success('Kit salvo na Tabela de serviços ✓');
      setKitOffer(null);
    } catch (e: any) {
      toast.error('Não foi possível salvar o kit: ' + (e?.message ?? 'erro'));
    } finally {
      setKitBusy(false);
    }
  }

  async function save() {
    // Validação
    for (const r of rows) {
      const nameOf = r.description.trim() ? `“${r.description.trim()}”` : r.kind === 'part' ? 'Uma peça sem nome' : 'Um serviço sem nome';
      if (!r.description.trim()) return toast.error(`${nameOf}: informe a descrição`);
      const q = parseMoney(r.quantity);
      if (!Number.isFinite(q) || q <= 0) return toast.error(`${nameOf}: quantidade inválida`);
      const p = parseMoney(r.unit_price || '0');
      if (!Number.isFinite(p) || p < 0) return toast.error(`${nameOf}: valor inválido`);
      if (r.kind === 'part' && r.unit_cost.trim()) {
        const c = parseMoney(r.unit_cost);
        if (!Number.isFinite(c) || c < 0) return toast.error(`${nameOf}: custo inválido`);
      }
    }
    if (!Number.isFinite(disc) || disc < 0) return toast.error('Desconto inválido');
    if (disc > parts + labor && rows.length > 0) return toast.error('O desconto não pode ser maior que o total');

    // Regras da OS (não valem na venda de balcão). Só para linhas novas ou alteradas: OS antiga continua editável.
    //  · serviço só com nome da Tabela de serviços (nada de nome escrito na hora);
    //  · peça sempre dentro de um serviço, só com custo; preço próprio só para pneu (aparece na nota do cliente);
    //  · peça sem custo não entra (a não ser que o cliente tenha trazido a peça).
    if (!saleMode) {
      const orig = new Map(items.map(i => [i.id, i]));
      const changed = (r: Row) => {
        const o = r.id ? orig.get(r.id) : undefined;
        if (!o) return true;
        return o.description.trim() !== r.description.trim() || o.kind !== r.kind || !!o.standalone !== !!r.standalone
          || Math.abs(Number(o.unit_cost ?? 0) - (parseMoney(r.unit_cost || '0') || 0)) > 0.001;
      };
      const table = new Set(suggestions.filter(s => s.kind === 'labor' && s.fromTable).map(s => norm(s.description)));
      const g0 = groupOf(rows);
      const partsOf = (svc: Row) => rows.filter(x => x.kind === 'part' && g0.get(x.key)?.key === svc.key);
      let lastLabor: Row | undefined;
      for (const r of rows) {
        const nm = r.description.trim();
        if (r.kind === 'labor') {
          lastLabor = r;
          if (table.size > 0 && changed(r) && !table.has(norm(nm))) {
            return toast.error(`O serviço “${nm}” não está na Tabela de serviços. Escolha um serviço da lista; se faltar, o gestor cadastra em Serviços (com a categoria).`, 8000);
          }
          // Serviço que leva peça (marcado na Tabela) precisa da peça dentro: sem ela o custo não entra no DRE
          // e a comissão sai como mão de obra (10%) em vez de serviço com peça (4%)
          const ps = partsOf(r);
          const tab = suggestions.find(s => s.kind === 'labor' && s.fromTable && norm(s.description) === norm(nm));
          if (tab?.levaPeca && !ps.length && !customerBroughtParts && changed(r)) {
            return toast.error(`O serviço “${nm}” leva peça: coloque a peça dentro dele (com o custo) antes de salvar, ou marque “Cliente trouxe a peça”.`, 9000);
          }
          // Serviço com peças e valor zero: o cliente não paga nada e a OS fica no prejuízo
          if (ps.length && !(parseMoney(r.unit_price || '0') > 0) && (changed(r) || ps.some(changed))) {
            return toast.error(`O serviço “${nm}” está com valor R$ 0 e tem peças. Informe o valor que o cliente paga pelo serviço.`, 8000);
          }
          continue;
        }
        if (!changed(r)) continue;
        // Peça precisa estar no cadastro (com categoria e custo): nada de peça escrita na hora
        if (!r.part_id && !customerBroughtParts) {
          return toast.error(`A peça “${nm}” não está no cadastro. Toque em “Cadastrar esta peça” (com categoria e custo) ou escolha uma peça da lista.`, 8000);
        }
        const loose = !!r.standalone || !lastLabor;
        const tire = TIRE_RE.test(norm(nm)) || (!!lastLabor && sellsParts(lastLabor));
        if (loose && !tire) {
          return toast.error(`A peça “${nm}” está solta. Na OS a peça entra dentro de um serviço, só com o custo (o cliente paga o serviço). Só pneu entra com preço próprio. Venda de peça é pelo Caixa.`, 9000);
        }
        if (!customerBroughtParts && !(parseMoney(r.unit_cost || '0') > 0)) {
          return toast.error(`A peça “${nm}” está sem custo. Informe o custo de uma unidade.`, 7000);
        }
      }
    }

    setSaving(true);
    try {
      const keepIds = new Set(rows.filter(r => r.id).map(r => r.id!));
      const toDelete = items.filter(i => !keepIds.has(i.id)).map(i => i.id);
      if (toDelete.length) {
        const { error } = await supabase.from('service_order_items').delete().in('id', toDelete);
        if (error) throw error;
      }

      // Linha nova já ganha id aqui, para a peça poder apontar para um serviço que ainda vai ser criado
      const idOf = new Map(rows.map(r => [r.key, r.id ?? crypto.randomUUID()]));
      const laborKeys = new Set(rows.filter(r => r.kind === 'labor').map(r => r.key));
      const grp = groupOf(rows);
      const payload = rows.map((r, idx) => ({
        id: idOf.get(r.key)!,
        service_order_id: osId,
        workshop_id: workshopId, // o banco confere pela OS (trigger)
        kind: r.kind,
        description: r.description.trim(),
        quantity: parseMoney(r.quantity),
        unit_price: parseMoney(r.unit_price || '0'),
        unit_cost: r.kind === 'part' && r.unit_cost.trim() ? parseMoney(r.unit_cost) : null,
        part_id: r.kind === 'part' ? r.part_id : null,
        ...whoPatch(r.kind === 'labor' || (r.kind === 'part' && r.standalone) ? r.mechanic_id : ''),
        commission_amount: r.kind === 'labor' && r.comm.trim() ? Math.max(0, parseMoney(r.comm)) : null,
        // Peça → serviço/mão de obra logo acima (com peça, a comissão vira 4% sobre serviço + peças)
        used_in_item_id: (() => {
          if (r.kind !== 'part') return null;
          const svc = grp.get(r.key);
          return svc && laborKeys.has(svc.key) ? idOf.get(svc.key)! : null;
        })(),
        service_type: r.kind === 'labor' ? effType(r, rows, grp) : null,
        // Sempre manda o campo: o salvamento é em lote e linha sem o campo chegava vazia ao banco
        standalone: r.kind === 'part' && !!r.standalone,
        position: idx,
      }));
      const savedIds = new Set(rows.filter(r => r.id).map(r => r.id!));
      const created  = payload.filter(p => !savedIds.has(p.id));
      const existing = payload.filter(p => savedIds.has(p.id));
      // Novos primeiro: uma peça já salva pode passar a apontar para um serviço novo
      if (created.length) {
        const { error } = await supabase.from('service_order_items').insert(created);
        if (error) throw error;
      }
      if (existing.length) {
        const { error } = await supabase.from('service_order_items').upsert(existing);
        if (error) throw error;
      }

      // Desconto (o total é recalculado pelo banco)
      if (Math.abs(disc - (discount ?? 0)) > 0.001) {
        const { error } = await supabase.from('service_orders').update({ discount: disc }).eq('id', osId);
        if (error) throw error;
      }

      // Categoria da OS = serviços que ela tem de fato (não o chip escolhido na abertura)
      try {
        const [{ data: tbl }, { data: cur }] = await Promise.all([
          supabase.from('workshop_services').select('name, category').eq('workshop_id', workshopId),
          supabase.from('service_orders').select('title, category').eq('id', osId).single(),
        ]);
        const cat = categoryFromServices(rows.filter(r => r.kind === 'labor').map(r => r.description), (tbl ?? []) as { name: string; category: string | null }[]);
        if (cat && cur && cat !== cur.category) {
          const autoTitle = !cur.title || cur.title === cur.category || cur.title === 'Serviço a definir';
          await supabase.from('service_orders').update({ category: cat, ...(autoTitle ? { title: cat } : {}) }).eq('id', osId);
        }
      } catch (e) { console.warn('[OsItemsEditor] categoria não atualizada:', e); }

      toast.success('Itens salvos ✓');
      onSaved();
      // Pergunta se quer guardar como kit os serviços que levaram peças (e ainda não têm kit para este carro)
      try {
        const offers = await buildKitOffers(grp);
        if (offers.length) setKitOffer(offers);
      } catch (e) { console.warn('[OsItemsEditor] kit não sugerido:', e); }
    } catch (e: any) {
      console.error('[OsItemsEditor] erro:', e);
      toast.error('Não foi possível salvar os itens: ' + (e?.message ?? 'erro'));
    } finally {
      setSaving(false);
    }
  }

  const hasLegacyValues = rows.length === 0 && items.length === 0
    && (legacy.parts != null || legacy.labor != null || legacy.price > 0);

  const hideQty = (r: Row, bi: number) => r.kind === 'labor' && parseMoney(r.quantity) === 1
    && (sellsParts(r) || (blocks[bi]?.svc?.key === r.key && blocks[bi].parts.length > 0));
  const renderRow = (r: Row, num: number, nested: boolean, bi: number, bc: number) => (
          <div key={r.key} className={`${nested ? 'pl-9 pr-5 py-2 bg-steel-50/70' : 'px-5 py-3'} grid grid-cols-12 gap-2 items-center`}>
            {/* Tipo (cada lançamento = 1 item, como num cupom) */}
            <div className="col-span-6 md:col-span-2">
              {!nested && <div className="text-[10px] font-bold text-steel-400 uppercase tracking-wider mb-0.5">Item {num}</div>}
              {r.kind === 'part' && <span className="badge bg-steel-100 text-steel-700">{nested ? '↳ Peça' : 'Peça'}</span>}
            </div>
            {/* Ações (mobile: ao lado do tipo) */}
            {!readOnly && (
              <div className="col-span-6 md:hidden flex justify-end gap-1">
                <RowActions idx={bi} count={bc} nested={nested} onUp={() => moveBlock(r.key, -1)} onDown={() => moveBlock(r.key, 1)} onRemove={() => remove(r.key)} />
              </div>
            )}
            {/* Descrição */}
            <div className="col-span-12 md:col-span-4">
              {readOnly ? <span className="text-sm font-medium text-steel-800">{r.description}</span> : (
                <input className="input !py-2 text-sm font-medium" value={r.description} aria-label="Descrição"
                  placeholder={r.kind === 'labor' ? 'Nome do serviço' : 'Nome da peça'}
                  onChange={e => update(r.key, { description: e.target.value })} />
              )}
              {!readOnly && r.kind === 'labor' && (() => {
                const vp = vehPrices.get(norm(r.description));
                if (!vp || Math.abs(parseMoney(r.unit_price || '0') - vp.last) <= 0.001) return null;
                return (
                  <div className="text-[11px] text-steel-500 mt-1 truncate" title={`${vp.count}× neste ${vehModel} · de ${fmtBRL(vp.min)} a ${fmtBRL(vp.max)}`}>
                    🚗 {vehModel}: {fmtBRL(vp.last)}{' '}
                    <button type="button" className="font-semibold text-brand-700 hover:underline"
                      onClick={() => update(r.key, { unit_price: moneyInput(vp.last) })}>usar</button>
                  </div>
                );
              })()}
              {!readOnly && r.kind === 'part' && !r.part_id && !r.description.trim() && showCost && (
                <div className="text-[11px] text-steel-500 mt-1 flex flex-wrap items-center gap-x-2">
                  <span>Digite para buscar no cadastro</span>
                  <button type="button" className="font-semibold text-brand-700 hover:underline"
                    onClick={() => setQuick({ key: r.key, name: '', qty: parseMoney(r.quantity) || 1 })}>
                    ➕ Cadastrar peça nova
                  </button>
                </div>
              )}
              {/* Item separado com preço: só pneu (aparece na nota do cliente). As demais peças ficam dentro do serviço. */}
              {!readOnly && r.kind === 'part' && nested && TIRE_RE.test(norm(r.description)) && (
                <button type="button" className="text-[11px] font-semibold text-brand-700 hover:underline mt-1"
                  title="A peça deixa de ser só custo do item de cima e vira um item da OS, com preço de venda e estoque"
                  onClick={() => {
                    const sp = suggestions.find(x => x.part_id && x.part_id === r.part_id)?.unit_price;
                    update(r.key, { standalone: true, ...(sp && sp > 0 ? { unit_price: moneyInput(sp) } : {}) });
                  }}>
                  ⤴ Tornar item separado (com preço)
                </button>
              )}
              {!readOnly && r.kind === 'part' && r.description.trim().length >= 2 && !r.part_id && (
                showCost ? (
                  <div className="text-[11px] text-steel-500 mt-1 flex flex-wrap items-center gap-x-2">
                    <span>Peça não cadastrada</span>
                    <button type="button" className="font-semibold text-brand-700 hover:underline"
                      onClick={() => setQuick({ key: r.key, name: r.description.trim(), qty: parseMoney(r.quantity) || 1 })}>
                      ➕ Cadastrar esta peça
                    </button>
                    {!saleMode && <span className="text-alert-600">obrigatório para salvar (com categoria e custo)</span>}
                  </div>
                ) : (
                  <div className="text-[11px] text-steel-400 mt-1">Peça avulsa (não está no cadastro)</div>
                )
              )}
            </div>
            {/* Qtd */}
            <div className="col-span-3 md:col-span-1">
              {/* Serviço com peças dentro (ou cabeçalho de pneu) é sempre 1: a quantidade fica nas peças.
                  Serviço sem peça (balanceamento, cambagem, alinhamento) é por unidade e mostra a quantidade. */}
              {hideQty(r, bi) ? null : <span className="md:hidden text-[10px] text-steel-400 uppercase">Qtd</span>}
              {hideQty(r, bi) ? null : readOnly ? <div className="text-sm text-right">{r.quantity}</div> : (
                <input className="input !py-2 text-sm text-right" inputMode="decimal" value={r.quantity}
                  onChange={e => update(r.key, { quantity: e.target.value })} />
              )}
            </div>
            {/* Valor unit (peça dentro de um item: só o custo) */}
            <div className="col-span-5 md:col-span-2">
              <span className="md:hidden text-[10px] text-steel-400 uppercase">{costOnly(r, nested) ? 'Custo unit.' : 'Valor unit.'}</span>
              {costOnly(r, nested) ? (
                !showCost ? null : readOnly ? <div className="text-sm text-right text-steel-500">custo R$ {r.unit_cost || '—'}</div> : (
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-steel-400 text-[11px]">custo</span>
                    <input className="input !py-2 !pl-12 text-sm text-right" inputMode="decimal" placeholder="0,00" value={r.unit_cost}
                      onChange={e => update(r.key, { unit_cost: e.target.value })}
                      onBlur={e => { const v = parseMoney(e.target.value); if (Number.isFinite(v)) update(r.key, { unit_cost: moneyInput(v) }); }} />
                  </div>
                )
              ) : readOnly ? <div className="text-sm text-right">R$ {r.unit_price}</div> : (
                <div className="relative">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-steel-400 text-xs">R$</span>
                  <input className="input !py-2 !pl-8 text-sm text-right" inputMode="decimal" placeholder="0,00" value={r.unit_price}
                    onChange={e => update(r.key, { unit_price: e.target.value })}
                    onBlur={e => { const v = parseMoney(e.target.value); if (Number.isFinite(v)) update(r.key, { unit_price: moneyInput(v) }); }} />
                </div>
              )}
            </div>
            {/* Total */}
            <div className="col-span-4 md:col-span-2 text-right">
              <span className="md:hidden text-[10px] text-steel-400 uppercase block">Total</span>
              {costOnly(r, nested)
                ? (showCost ? <span className="text-xs text-steel-500">custo {fmtBRL(rowCost(r) ?? 0)}</span> : null)
                : <span className="text-sm font-bold text-steel-900">{fmtBRL(rowTotal(r))}</span>}
            </div>
            {/* Ações (desktop) */}
            {!readOnly && (
              <div className="hidden md:flex col-span-1 justify-end gap-1">
                <RowActions idx={bi} count={bc} nested={nested} onUp={() => moveBlock(r.key, -1)} onDown={() => moveBlock(r.key, 1)} onRemove={() => remove(r.key)} />
              </div>
            )}
            {/* Quem fez (comissão) — só em serviço; peça conta para o responsável da OS */}
            {showWho && !planning && r.kind === 'labor' && (
              <div className="col-span-12 -mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                <span className="text-steel-500 shrink-0">🔧 Quem fez:</span>
                {canAssign && (!readOnly || r.id) ? (
                  <select className="input !py-1 !px-2 !w-auto text-xs" value={r.mechanic_id}
                    onChange={e => readOnly ? assign(r, e.target.value) : update(r.key, { mechanic_id: e.target.value })}>
                    <option value="">{osMechanicId && teamName.get(osMechanicId) ? `${teamName.get(osMechanicId)} (responsável da OS)` : 'Responsável da OS'}</option>
                    {team.filter(m => (m.active || m.id === r.mechanic_id) && m.id !== osMechanicId).map(m => (
                      <option key={m.id} value={m.id}>{m.name}{m.active ? '' : ' (inativo)'}</option>
                    ))}
                    <option value={PLATFORM_ITEM}>🌐 Mecânico da plataforma</option>
                  </select>
                ) : (
                  <span className="font-semibold text-steel-700">
                    {r.mechanic_id === PLATFORM_ITEM ? '🌐 Mecânico da plataforma'
                      : (r.mechanic_id && teamName.get(r.mechanic_id)) || (osMechanicId && teamName.get(osMechanicId)) || 'Responsável da OS'}
                  </span>
                )}
                {/* Comissão de quem fez este serviço: pela regra, ou o valor digitado aqui */}
                {(() => {
                  const c = commOf(r);
                  const canEdit = !!canAssign && (!readOnly || !!r.id) && !c.none;
                  if (c.none) return <span className="text-steel-400">· {c.none}</span>;
                  if (commEdit === r.key) {
                    return (
                      <span className="flex items-center gap-1">
                        <span className="text-steel-500">💰 R$</span>
                        <input autoFocus className="input !py-1 !px-2 !w-20 text-xs" inputMode="decimal"
                          defaultValue={r.comm || moneyInput(c.value)}
                          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setCommEdit(null); }}
                          onBlur={e => {
                            const v = e.target.value;
                            setCommEdit(null);
                            if (readOnly) saveComm(r, v); else update(r.key, { comm: v });
                          }} />
                      </span>
                    );
                  }
                  return (
                    <span className="flex items-center gap-1.5">
                      <span className={`font-semibold ${c.typed ? 'text-brand-700' : 'text-signal-700'}`}>💰 {fmtBRL(c.value)}</span>
                      <span className="text-steel-400 hidden sm:inline">({c.base})</span>
                      {canEdit && (
                        <button type="button" onClick={() => setCommEdit(r.key)} className="text-brand-600 hover:underline">✏️ alterar</button>
                      )}
                      {canEdit && c.typed && (
                        <button type="button" onClick={() => (readOnly ? saveComm(r, '') : update(r.key, { comm: '' }))}
                          className="text-steel-500 hover:underline">↩ regra</button>
                      )}
                    </span>
                  );
                })()}
              </div>
            )}
            {/* Custo e margem da peça (só para quem vê o financeiro) */}
            {showCost && r.kind === 'part' && !costOnly(r, nested) && (
              <CostLine row={r} readOnly={readOnly} onCost={v => update(r.key, { unit_cost: v })} onPrice={v => update(r.key, { unit_price: v })} />
            )}
          </div>
  );

  return (
    <div className="card !p-0 overflow-hidden">
      <div className="px-5 pt-5 pb-3 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-bold text-lg text-steel-900">{saleMode ? 'Itens da venda' : 'Peças e serviços'}</h2>
          <p className="text-xs text-steel-500">{saleMode ? 'Peças vendidas no balcão.' : 'Uma linha para cada item da nota. O total da OS é a soma deles.'}</p>
        </div>
        {!readOnly && (
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => { refreshServices(); setSheet(saleMode ? { kind: 'sale' } : { kind: 'top' }); }}
              className="min-h-[44px] text-base font-bold px-5 rounded-xl bg-brand-500 hover:bg-brand-600 text-white transition">
              ＋ Adicionar
            </button>
            {showCost && (
              <button type="button" onClick={() => setQuick({ key: null, name: '', qty: 1 })}
                className="min-h-[44px] text-sm font-semibold px-3 rounded-xl bg-white hover:bg-steel-50 text-steel-600 border border-steel-200 transition">
                🔩 Cadastrar peça nova
              </button>
            )}
          </div>
        )}
      </div>

      {!saleMode && (!readOnly || canAssign || ownParts) && (
        <label className={`mx-5 mb-3 flex items-center gap-2 text-sm ${!readOnly || canAssign ? 'cursor-pointer' : ''}`}>
          <input type="checkbox" checked={ownParts} disabled={readOnly && !canAssign}
            onChange={e => toggleOwnParts(e.target.checked)} />
          <span>📦 <strong>Cliente trouxe a peça</strong></span>
          <span className="text-xs text-steel-500">— a comissão da mão de obra usa a % de “só serviço”</span>
        </label>
      )}

      {/* Marcou "cliente trouxe a peça" mas a OS ainda cobra peças: a caixa decide se tira */}
      {ownParts && !readOnly && rows.some(r => r.kind === 'part') && (
        <div className="mx-5 mb-3 rounded-xl bg-pending-50 border border-pending-200 px-3 py-2.5 text-sm text-pending-900">
          <div>
            ⚠️ O cliente trouxe a peça, mas esta OS ainda cobra{' '}
            <strong>{rows.filter(r => r.kind === 'part').map(r => r.description.trim() || 'peça').join(', ')}</strong>{' '}
            ({fmtBRL(rows.filter(r => r.kind === 'part').reduce((a, r) => a + rowTotal(r), 0))}).
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <button type="button" onClick={() => setRows(rs => rs.filter(r => r.kind !== 'part'))}
              className="btn-primary text-xs !py-1.5">Tirar as peças da OS</button>
            <span className="text-xs text-pending-800">Se alguma peça foi da loja, mantenha só ela e tire as outras no ✕.</span>
          </div>
        </div>
      )}

      {hasLegacyValues && (
        <div className="mx-5 mb-3 text-xs bg-pending-50 border border-pending-200 text-pending-800 rounded-xl px-3 py-2">
          Esta OS foi criada com valores digitados direto
          ({legacy.parts != null && <>peças {fmtBRL(legacy.parts)}</>}
          {legacy.parts != null && legacy.labor != null && ' · '}
          {legacy.labor != null && <>mão de obra {fmtBRL(legacy.labor)}</>}
          {legacy.parts == null && legacy.labor == null && <>total {fmtBRL(legacy.price)}</>}).
          Ao adicionar itens, o total passa a ser calculado por eles.
        </div>
      )}

      {/* Cabeçalho da tabela (desktop) */}
      {rows.length > 0 && (
        <div className="hidden md:grid grid-cols-12 gap-2 px-5 py-2 bg-steel-50 border-y border-steel-100 text-[10px] font-bold text-steel-500 uppercase tracking-wider">
          <div className="col-span-2">Tipo</div>
          <div className="col-span-4">Descrição</div>
          <div className="col-span-1 text-right">Qtd</div>
          <div className="col-span-2 text-right">Valor unit.</div>
          <div className="col-span-2 text-right">Total</div>
          <div className="col-span-1" />
        </div>
      )}

      {sheet && (
        <AddSheet mode={sheet} suggestions={suggestions} categories={catNames} topServices={topServices}
          loadKits={loadCarKits} kitOf={name => kitFor({ description: name, kind: 'labor', unit_price: 0, fromTable: true }).then(k => k.items)}
          partFits={partFits} wantsParts={name => sellsSet.has(norm(name)) || itemPartCats(name) != null}
          priceFor={sg => vehPrices.get(norm(sg.description))?.last ?? null}
          vehicleLabel={[vehMake, vehModel, vehicle?.year].filter(Boolean).join(' ')} showCost={!!showCost}
          onService={sg => addFromCatalog(sg, '')}
          onKit={sg => {
            const key = addFromCatalog(sg, '');
            kitFor(sg).then(k => { k.items.forEach(it => addFromCatalog(it, key ?? '')); if (k.items.length) toast.success(`${sg.description}: ${k.items.length} peça${k.items.length === 1 ? '' : 's'} do kit`); })
              .catch(() => { /* sem kit: fica só o serviço */ });
          }}
          onPart={(sg, target) => addFromCatalog(sg, target)}
          onFreeItem={name => addFromCatalog({ description: name, kind: 'labor', unit_price: 0 }, '')}
          onFreePart={(name, target) => addFromCatalog({ description: name, kind: 'part', unit_price: 0, qty: 1 }, target)}
          onNewPart={showCost ? (name, target) => { const k = target ? addPartTo(target) : null; const sv = rows.find(r => r.key === target); setSheet(null); setQuick({ key: k, name, qty: 1, cat: sv ? itemPartCats(sv.description)?.[0] ?? null : null }); } : undefined}
          onCombo={saleMode ? undefined : () => {
            const key = newKey();
            setRows(rs => [...rs, { key, kind: 'labor', description: 'Mão de obra', quantity: '1', unit_price: '', unit_cost: '', part_id: null, mechanic_id: '', used_in: '', stype: 'servico', comm: '' }]);
            return key;
          }}
          onClose={() => setSheet(null)} />
      )}

      {kitOffer && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-3" role="dialog" aria-modal="true">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-5 max-h-[90vh] overflow-y-auto">
            <h3 className="font-display font-bold text-steel-900 text-lg">📦 Criar kit {kitOffer.length > 1 ? 'dos itens' : 'do item'}?</h3>
            <p className="text-sm text-steel-600 mt-1">
              As peças lançadas ficam salvas como kit{vehModel ? <> do modelo <b>{vehModel}</b></> : ' geral'}, valendo para qualquer {vehModel ? 'carro desse modelo, de qualquer cliente' : 'carro'}. Na próxima OS, ao escolher o serviço, elas entram sozinhas.
            </p>
            <div className="mt-3 space-y-2">
              {kitOffer.map((o, i) => (
                <label key={o.name} className="block border border-steel-200 rounded-xl p-3 cursor-pointer">
                  <span className="flex items-center gap-2 font-semibold text-sm text-steel-900">
                    <input type="checkbox" checked={o.checked}
                      onChange={e => setKitOffer(ks => ks && ks.map((k, j) => j === i ? { ...k, checked: e.target.checked } : k))} />
                    {o.name}
                  </span>
                  <ul className="mt-1 pl-6 text-xs text-steel-600 list-disc">
                    {o.parts.map((p, j) => <li key={j}>{fmtQty(p.quantity)}× {p.description}</li>)}
                  </ul>
                </label>
              ))}
            </div>
            <div className="mt-4 flex gap-2 justify-end">
              <button type="button" className="btn-secondary" disabled={kitBusy} onClick={() => setKitOffer(null)}>Agora não</button>
              <button type="button" className="btn-primary" disabled={kitBusy || !kitOffer.some(k => k.checked)} onClick={saveKits}>
                {kitBusy ? 'Salvando…' : 'Criar kit'}
              </button>
            </div>
          </div>
        </div>
      )}

      {quick && (
        <QuickPartModal wid={workshopId} osLabel={osLabel} initialName={quick.name} quantity={quick.qty} defaultMargin={margin.base}
          margins={margin} vehicle={{ make: vehMake, model: vehModel }} defaultCategory={quick.cat ?? null}
          onClose={() => setQuick(null)}
          onSaved={res => {
            setSugg(xs => [{ description: res.name, kind: 'part', unit_price: res.price, part_id: res.part_id, cost: res.cost, stock: 0, unit: res.unit,
              category: res.category ?? undefined, pcat: res.category ?? undefined, universal: res.universal },
              ...xs.filter(x => x.description.toLowerCase() !== res.name.toLowerCase())]);
            // A peça nova já passa no filtro do carro da OS
            if (res.vehicle) setPartVeh(m => new Map(m ?? []).set(res.part_id, [{ id: 'new', workshop_id: workshopId, part_id: res.part_id, brand: res.vehicle!.brand, model: res.vehicle!.model, year_from: null, year_to: null }]));
            const filled = { description: res.name, part_id: res.part_id, unit_cost: res.cost > 0 ? moneyInput(res.cost) : '', unit_price: moneyInput(res.price) };
            setRows(rs => {
              if (!quick.key) return [...rs, { key: newKey(), kind: 'part', quantity: String(res.quantity).replace('.', ','), mechanic_id: '', used_in: '', stype: '', comm: '',
                standalone: rs.some(x => x.kind === 'labor') ? true : undefined, ...filled }];
              const g = groupOf(rs);
              // Peça dentro de um serviço (que não vende a peça) é só custo: o preço já está no serviço
              return rs.map(x => x.key !== quick.key ? x : { ...x, ...filled, ...(g.get(x.key) && !x.standalone ? { unit_price: '' } : {}) });
            });
            setQuick(null);
          }} />
      )}

      <div className="divide-y divide-steel-100">
        {blocks.map((b, bi) => {
          const head = b.svc ?? b.parts[0];
          const nestedParts = b.svc ? b.parts : [];
          const hasParts = nestedParts.length > 0;
          return (
            <div key={head.key}>
              {renderRow(head, bi + 1, false, bi, blocks.length)}
              {nestedParts.map(p => renderRow(p, 0, true, bi, blocks.length))}
              {b.svc && (!readOnly || hasParts) && (
                <div className="pl-9 pr-5 pb-3 pt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                  {!readOnly && (
                    <button type="button" onClick={() => { const sv = b.svc!; setSheet({ kind: 'part', key: sv.key, name: sv.description.trim() || 'item', sells: sellsParts(sv) }); }}
                      className="min-h-[40px] px-3 rounded-lg bg-white border border-steel-200 text-sm font-semibold text-brand-700 hover:bg-brand-50"
                      title={sellsParts(b.svc) ? 'A peça é vendida: entra como item da OS com o preço de venda do cadastro.' : 'Opcional: separe a peça para controlar estoque e custo. O valor do item continua sendo o fechado.'}>
                      {sellsParts(b.svc) ? '＋ pneu / peça vendida' : '＋ peça neste serviço'}
                    </button>
                  )}
                  {!readOnly && !hasParts && (
                    <label className="flex items-center gap-1.5 text-steel-500 cursor-pointer" title="Marque quando o item é só o serviço, sem peça (ex.: alinhamento). A comissão passa a ser a da mão de obra (10%) em vez dos 4% sobre o valor fechado.">
                      <input type="checkbox" checked={b.svc.stype === 'mao_de_obra'}
                        onChange={e => update(b.svc!.key, { stype: e.target.checked ? 'mao_de_obra' : 'servico' })} />
                      Só mão de obra (sem peça)
                    </label>
                  )}
                  {hasParts && (() => {
                    const value = rowTotal(b.svc) + nestedParts.reduce((a, x) => a + rowTotal(x), 0);
                    const cost = nestedParts.reduce((a, x) => a + (rowCost(x) ?? 0), 0);
                    const missing = nestedParts.filter(x => rowCost(x) == null).length;
                    const margin = value - cost;
                    return (
                      <span className="ml-auto text-steel-600 text-right">
                        Total do item <strong className="text-steel-900">{fmtBRL(value)}</strong>
                        {showCost && (
                          <>
                            {' · '}custo das peças <strong className="text-steel-800">{fmtBRL(cost)}</strong>
                            {' · '}margem{' '}
                            <strong className={margin < 0 ? 'text-alert-600' : 'text-signal-700'}>
                              {fmtBRL(margin)}{value > 0 ? ` (${Math.round((margin / value) * 100)}%)` : ''}
                            </strong>
                            {missing > 0 && <span className="text-pending-700"> · {missing} peça{missing === 1 ? '' : 's'} sem custo</span>}
                          </>
                        )}
                      </span>
                    );
                  })()}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {rows.length === 0 && !hasLegacyValues && (
        <div className="px-5 pb-6 pt-2 text-center">
          <div className="text-3xl mb-1">🧾</div>
          <p className="text-sm text-steel-500">
            {readOnly ? 'Nenhum item nesta OS.' : 'Toque em “＋ Adicionar” e escolha o serviço, o kit ou a peça.'}
          </p>
        </div>
      )}

      {/* Totais */}
      {(rows.length > 0 || items.length > 0) && (
        <div className="bg-steel-50 border-t border-steel-100 px-5 py-4">
          <div className="ml-auto max-w-xs space-y-1.5 text-sm">
            <div className="flex justify-between text-steel-600"><span>Itens</span><span>{blocks.length}</span></div>
            <div className="flex justify-between text-steel-600"><span>Peças</span><span>{fmtBRL(parts)}</span></div>
            <div className="flex justify-between text-steel-600"><span>Serviços</span><span>{fmtBRL(labor)}</span></div>
            <div className="flex justify-between items-center text-steel-600">
              <span>Desconto</span>
              {readOnly ? <span>− {fmtBRL(disc)}</span> : (
                <div className="relative w-32">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-steel-400 text-xs">− R$</span>
                  <input className="input !py-1.5 !pl-11 text-sm text-right" inputMode="decimal" placeholder="0,00" value={discountStr}
                    onChange={e => setDisc(e.target.value)}
                    onBlur={e => { const v = parseMoney(e.target.value); if (Number.isFinite(v)) setDisc(v ? moneyInput(v) : ''); }} />
                </div>
              )}
            </div>
            <div className="flex justify-between pt-2 border-t border-steel-200 text-base">
              <span className="font-bold text-steel-900">Total</span>
              <span className="font-bold font-display text-xl text-steel-900">{fmtBRL(total)}</span>
            </div>
            {showCost && partRows.length > 0 && (
              <div className="pt-2 mt-1 border-t border-dashed border-steel-200 space-y-1 text-xs">
                <div className="text-[10px] font-bold uppercase tracking-widest text-steel-400">Só a gestão vê</div>
                <div className="flex justify-between text-steel-600"><span>Custo das peças</span><span>{fmtBRL(partsCost)}</span></div>
                <div className="flex justify-between text-steel-600">
                  <span>Margem da OS (valor − custo das peças)</span>
                  <span className={total - partsCost < 0 ? 'text-alert-600 font-semibold' : 'text-signal-700 font-semibold'}>
                    {fmtBRL(total - partsCost)}{total > 0 ? ` · ${Math.round(((total - partsCost) / total) * 100)}%` : ''}
                  </span>
                </div>
                {costed.length < partRows.length && (
                  <div className="text-pending-700">{partRows.length - costed.length} peça{partRows.length - costed.length === 1 ? '' : 's'} sem custo informado</div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Barra de salvar */}
      {!readOnly && dirty && (
        <div className="sticky bottom-20 lg:bottom-0 bg-white border-t border-brand-200 px-5 py-3 flex items-center justify-between gap-3 shadow-[0_-8px_24px_-12px_rgba(0,0,0,0.15)]">
          <span className="text-xs text-steel-500">Alterações não salvas</span>
          <div className="flex gap-2">
            <button type="button" onClick={() => { setRows(initRows(items)); setDisc(discount ? moneyInput(discount) : ''); }}
              className="btn-ghost text-sm !py-2" disabled={saving}>
              Descartar
            </button>
            <button type="button" id="os-save-items" onClick={save} className="btn-primary text-sm !py-2" disabled={saving}>
              {saving ? 'Salvando…' : '💾 Salvar itens'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function RowActions({ idx, count, nested, onUp, onDown, onRemove }: {
  idx: number; count: number; nested?: boolean; onUp: () => void; onDown: () => void; onRemove: () => void;
}) {
  const btn = 'h-8 w-8 rounded-lg grid place-items-center text-xs transition disabled:opacity-30';
  return (
    <>
      {!nested && <button type="button" onClick={onUp} disabled={idx === 0} className={`${btn} bg-steel-100 hover:bg-steel-200 text-steel-600`} title="Subir">↑</button>}
      {!nested && <button type="button" onClick={onDown} disabled={idx === count - 1} className={`${btn} bg-steel-100 hover:bg-steel-200 text-steel-600`} title="Descer">↓</button>}
      <button type="button" onClick={onRemove} className={`${btn} bg-steel-100 hover:bg-alert-100 text-steel-500 hover:text-alert-600`} title="Remover">✕</button>
    </>
  );
}

function CostLine({ row, readOnly, onCost, onPrice }: {
  row: Row; readOnly?: boolean; onCost: (v: string) => void; onPrice: (v: string) => void;
}) {
  const cost = rowCost(row);
  const sale = rowTotal(row);
  const pct = cost != null ? marginOf(cost, sale) : null;
  const unitCost = parseMoney(row.unit_cost || '');
  // Margem digitada (enquanto edita); fora disso mostra a margem calculada
  const [mStr, setMStr] = useState<string | null>(null);
  const [changed, setChanged] = useState(false);
  const [saving, setSaving] = useState(false);

  function setMargin(v: string) {
    setMStr(v);
    const m = parseMoney(v);
    if (Number.isFinite(m) && m >= -100 && unitCost > 0) {
      onPrice(moneyInput(Math.round(unitCost * (1 + m / 100) * 100) / 100));
      setChanged(true);
    }
  }

  async function saveForPart() {
    const m = parseMoney(mStr ?? String(Math.round(pct ?? 0)));
    if (!row.part_id || !Number.isFinite(m) || m < 0) return;
    setSaving(true);
    const { error } = await supabase.from('workshop_parts').update({ margin_percent: m, sale_price: null }).eq('id', row.part_id);
    setSaving(false);
    if (error) return toast.error('Não foi possível salvar a margem da peça: ' + error.message);
    toast.success(`Margem de ${Math.round(m)}% salva na peça ✓ (próximas OS)`);
    setChanged(false);
  }

  return (
    <div className="col-span-12 md:col-start-3 md:col-span-9 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-steel-500 -mt-1">
      {row.part_id && <span className="badge bg-steel-100 text-steel-600">🔩 do cadastro</span>}
      <span className="flex items-center gap-1.5">
        Custo unit.
        {readOnly ? <strong className="text-steel-700">{row.unit_cost ? `R$ ${row.unit_cost}` : '—'}</strong> : (
          <span className="relative">
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-steel-400 text-[11px]">R$</span>
            <input className="input !py-1 !pl-7 !w-24 text-xs text-right" inputMode="decimal" placeholder="0,00" value={row.unit_cost}
              onChange={e => onCost(e.target.value)}
              onBlur={e => { const v = parseMoney(e.target.value); if (Number.isFinite(v)) onCost(moneyInput(v)); }} />
          </span>
        )}
      </span>
      {cost != null && (
        <span className="flex items-center gap-1.5">
          Margem
          {readOnly ? <strong className="text-steel-700">{fmtPct(pct)}</strong> : (
            <span className="relative">
              <input className="input !py-1 !pr-6 !w-20 text-xs text-right" inputMode="decimal"
                value={mStr ?? (pct == null ? '' : String(Math.round(pct)))}
                onChange={e => setMargin(e.target.value)}
                onBlur={() => setMStr(null)} />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-steel-400 text-[11px]">%</span>
            </span>
          )}
        </span>
      )}
      {cost != null && (
        <span className={sale - cost < 0 ? 'text-alert-600 font-semibold' : 'text-signal-700'}>
          lucro {fmtBRL(sale - cost)}
        </span>
      )}
      {!readOnly && row.part_id && changed && (
        <button type="button" onClick={saveForPart} disabled={saving}
          className="font-semibold text-brand-700 hover:underline" title="Grava esta margem na peça do cadastro">
          {saving ? 'Salvando…' : '💾 usar sempre nesta peça'}
        </button>
      )}
    </div>
  );
}
