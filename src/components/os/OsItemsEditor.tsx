import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from '@/components/ui/Toast';
import type { OsItemKind, ServiceOrderItem } from '@/types/database';
import { fmtBRL, moneyInput, parseMoney } from './osHelpers';
import { DEFAULT_MARGIN, fmtPct, fmtQty, loadDefaultMargin, marginOf, salePriceOf, type WorkshopPart } from '@/lib/parts';
import QuickPartModal from '@/components/parts/QuickPartModal';

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
  /** Só serviços: 'servico' (leva peças → 4% sobre serviço + peças) · 'mao_de_obra' (sem peça → 10%) */
  stype: '' | 'servico' | 'mao_de_obra';
};

/** Peças pertencem ao serviço imediatamente acima delas (até o próximo serviço/mão de obra) */
function groupOf(rs: Row[]): Map<string, Row | null> {
  const g = new Map<string, Row | null>();
  let cur: Row | null = null;
  for (const r of rs) {
    if (r.kind === 'labor') cur = r;
    else g.set(r.key, cur);
  }
  return g;
}

/** Serviço sem tipo (OS antiga): com peça logo abaixo vira "Serviço", sem peça vira "Mão de obra" */
function withTypes(rs: Row[]): Row[] {
  return rs.map((r, i) => {
    if (r.kind !== 'labor' || r.stype) return r;
    let hasPart = false;
    for (let j = i + 1; j < rs.length && rs[j].kind !== 'labor'; j++) hasPart = true;
    return { ...r, stype: hasPart ? 'servico' : 'mao_de_obra' };
  });
}
const initRows = (items: ServiceOrderItem[]): Row[] => withTypes(items.map(toRow));

/** Valor do "Quem fez" para item feito por mecânico da plataforma (sem comissão da equipe) */
const PLATFORM_ITEM = 'platform';
const whoPatch = (v: string) => (v === PLATFORM_ITEM
  ? { workshop_mechanic_id: null, executor: 'platform' }
  : { workshop_mechanic_id: v || null, executor: v ? 'workshop' : null });

type TeamMember = { id: string; name: string; active: boolean };

type Suggestion = { description: string; kind: OsItemKind; unit_price: number; part_id?: string; cost?: number; stock?: number; unit?: string; fromTable?: boolean };

const KIND_LABEL: Record<OsItemKind, string> = { part: 'Peça', labor: 'Serviço' };
const rowLabel = (r: Pick<Row, 'kind' | 'stype'>) => (r.kind === 'part' ? 'Peça' : r.stype === 'mao_de_obra' ? 'Mão de obra' : 'Serviço + peças');

let keySeq = 0;
const newKey = () => `new-${++keySeq}`;

function toRow(i: ServiceOrderItem): Row {
  return {
    key: i.id, id: i.id, kind: i.kind, description: i.description,
    quantity: String(i.quantity).replace('.', ','), unit_price: moneyInput(i.unit_price),
    unit_cost: i.unit_cost != null ? moneyInput(Number(i.unit_cost)) : '', part_id: i.part_id ?? null,
    mechanic_id: i.executor === 'platform' ? PLATFORM_ITEM : i.workshop_mechanic_id ?? '',
    used_in: i.used_in_item_id ?? '',
    stype: i.kind === 'labor' ? i.service_type ?? '' : '',
  };
}

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
  onSaved: () => void;
}

export default function OsItemsEditor({ osId, workshopId, items, discount, legacy, readOnly, showCost, osLabel = 'OS', osMechanicId, canAssign, customerBroughtParts = false, onSaved }: Props) {
  const [rows, setRows]         = useState<Row[]>(() => initRows(items));
  const [discountStr, setDisc]  = useState(() => (discount ? moneyInput(discount) : ''));
  const [saving, setSaving]     = useState(false);
  const [suggestions, setSugg]  = useState<Suggestion[]>([]);
  const [margin, setMargin]     = useState(DEFAULT_MARGIN);
  /** Cadastro rápido de peça: key = linha que vai receber a peça (null = cria linha nova) */
  const [quick, setQuick]       = useState<{ key: string | null; name: string; qty: number } | null>(null);
  const [team, setTeam]         = useState<TeamMember[]>([]);

  // Equipe, para dizer quem fez cada item (comissão)
  useEffect(() => {
    supabase.from('workshop_mechanics').select('id, name, active').eq('workshop_id', workshopId).order('name')
      .then(({ data }) => setTeam((data as TeamMember[]) ?? []));
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

  /** OS fechada: troca quem fez direto no item (a caixa acerta a comissão na hora de receber) */
  async function assign(r: Row, mechanicId: string) {
    if (!r.id) return;
    setRows(rs => rs.map(x => x.key === r.key ? { ...x, mechanic_id: mechanicId } : x));
    const { error } = await supabase.from('service_order_items').update(whoPatch(mechanicId)).eq('id', r.id);
    if (error) { toast.error('Não foi possível trocar: ' + error.message); setRows(initRows(items)); return; }
    toast.success(mechanicId === PLATFORM_ITEM ? 'Item marcado para o mecânico da plataforma ✓' : 'Comissão deste item atualizada ✓');
    onSaved();
  }

  // Recarrega quando os itens salvos mudam (após salvar)
  useEffect(() => { setRows(initRows(items)); }, [items]);
  useEffect(() => { setDisc(discount ? moneyInput(discount) : ''); }, [discount]);

  // Sugestões: peças do cadastro (preço de venda atual) e itens que a oficina já usou (último preço cobrado)
  useEffect(() => {
    let alive = true;
    (async () => {
      const [cat, svc, hist, margin] = await Promise.all([
        supabase.from('workshop_parts').select('id, name, cost, margin_percent, sale_price, stock_qty, unit')
          .eq('workshop_id', workshopId).eq('active', true).order('name'),
        supabase.from('workshop_services').select('name, price')
          .eq('workshop_id', workshopId).eq('active', true).order('name'),
        supabase.from('service_order_items')
          .select('description, kind, unit_price, created_at')
          .eq('workshop_id', workshopId)
          .order('created_at', { ascending: false })
          .limit(300),
        loadDefaultMargin(workshopId),
      ]);
      if (!alive) return;
      const seen = new Map<string, Suggestion>();
      for (const p of (cat.data ?? []) as Pick<WorkshopPart, 'id' | 'name' | 'cost' | 'margin_percent' | 'sale_price' | 'stock_qty' | 'unit'>[]) {
        const k = p.name.trim().toLowerCase();
        if (!seen.has(k)) seen.set(k, { description: p.name.trim(), kind: 'part', unit_price: salePriceOf(p, margin), part_id: p.id, cost: Number(p.cost), stock: Number(p.stock_qty), unit: p.unit });
      }
      // Tabela de serviços da oficina: preço oficial da mão de obra
      for (const s of (svc.data ?? []) as { name: string; price: number }[]) {
        const k = s.name.trim().toLowerCase();
        if (!seen.has(k)) seen.set(k, { description: s.name.trim(), kind: 'labor', unit_price: Number(s.price), fromTable: true });
      }
      for (const d of (hist.data ?? []) as Suggestion[]) {
        const k = d.description.trim().toLowerCase();
        if (!seen.has(k)) seen.set(k, { description: d.description.trim(), kind: d.kind, unit_price: Number(d.unit_price) });
      }
      setSugg([...seen.values()]);
      setMargin(margin);
    })();
    return () => { alive = false; };
  }, [workshopId]);

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

  function addRow(kind: OsItemKind | 'mao_de_obra') {
    setRows(rs => [...rs, { key: newKey(), kind: kind === 'part' ? 'part' : 'labor', description: '', quantity: '1', unit_price: '', unit_cost: '', part_id: null, mechanic_id: '', used_in: '',
      stype: kind === 'mao_de_obra' ? 'mao_de_obra' : kind === 'labor' ? 'servico' : '' }]);
  }
  function update(key: string, patch: Partial<Row>) {
    setRows(rs => rs.map(r => {
      if (r.key !== key) return r;
      const next = { ...r, ...patch };
      // Escolheu um item já usado antes → completa tipo e preço (se vazio).
      // Peça do cadastro → também guarda de qual peça veio e o custo de agora.
      if (patch.description !== undefined) {
        const s = suggestions.find(x => x.description.toLowerCase() === patch.description!.trim().toLowerCase());
        if (s) {
          next.kind = s.kind;
          // Serviço da tabela sem preço fixo: o valor é digitado na OS
          if (!r.unit_price && s.unit_price > 0) next.unit_price = moneyInput(s.unit_price);
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
      return next;
    }));
  }
  function remove(key: string) { setRows(rs => rs.filter(r => r.key !== key)); }
  function move(key: string, dir: -1 | 1) {
    setRows(rs => {
      const i = rs.findIndex(r => r.key === key);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= rs.length) return rs;
      const copy = [...rs];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });
  }

  async function save() {
    // Validação
    for (const [i, r] of rows.entries()) {
      if (!r.description.trim()) return toast.error(`Item ${i + 1}: informe a descrição`);
      const q = parseMoney(r.quantity);
      if (!Number.isFinite(q) || q <= 0) return toast.error(`Item ${i + 1}: quantidade inválida`);
      const p = parseMoney(r.unit_price || '0');
      if (!Number.isFinite(p) || p < 0) return toast.error(`Item ${i + 1}: valor inválido`);
      if (r.kind === 'part' && r.unit_cost.trim()) {
        const c = parseMoney(r.unit_cost);
        if (!Number.isFinite(c) || c < 0) return toast.error(`Item ${i + 1}: custo inválido`);
      }
    }
    if (!Number.isFinite(disc) || disc < 0) return toast.error('Desconto inválido');
    if (disc > parts + labor && rows.length > 0) return toast.error('O desconto não pode ser maior que o total');

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
        ...whoPatch(r.kind === 'labor' ? r.mechanic_id : ''),
        // Peça → serviço logo acima (só se for "Serviço"; abaixo de "Mão de obra" fica sem serviço)
        used_in_item_id: (() => {
          if (r.kind !== 'part') return null;
          const svc = grp.get(r.key);
          return svc && svc.stype === 'servico' && laborKeys.has(svc.key) ? idOf.get(svc.key)! : null;
        })(),
        service_type: r.kind === 'labor' ? r.stype || 'servico' : null,
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

      toast.success('Itens salvos ✓');
      onSaved();
    } catch (e: any) {
      console.error('[OsItemsEditor] erro:', e);
      toast.error('Não foi possível salvar os itens: ' + (e?.message ?? 'erro'));
    } finally {
      setSaving(false);
    }
  }

  const hasLegacyValues = rows.length === 0 && items.length === 0
    && (legacy.parts != null || legacy.labor != null || legacy.price > 0);

  return (
    <div className="card !p-0 overflow-hidden">
      <div className="px-5 pt-5 pb-3 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-bold text-lg text-steel-900">Peças e serviços</h2>
          <p className="text-xs text-steel-500">O total da OS é calculado a partir destes itens.</p>
        </div>
        {!readOnly && (
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => addRow('labor')}
              title="Valor fechado: serviço com as peças incluídas (ex.: troca de óleo completa). Comissão 4% sobre o total."
              className="text-sm font-semibold px-3 py-2 rounded-xl bg-brand-500 hover:bg-brand-600 text-white transition">
              + Serviço + peças
            </button>
            <button type="button" onClick={() => addRow('mao_de_obra')}
              title="Só o serviço, sem peça (ex.: alinhamento). Comissão 10%."
              className="text-sm font-semibold px-3 py-2 rounded-xl bg-brand-50 hover:bg-brand-100 text-brand-700 border border-brand-200 transition">
              + Mão de obra
            </button>
            <button type="button" onClick={() => addRow('part')}
              title="Opcional: detalhar uma peça ou vender peça avulsa"
              className="text-sm font-semibold px-3 py-2 rounded-xl bg-steel-100 hover:bg-steel-200 text-steel-700 transition">
              + Peça
            </button>
            {showCost && (
              <button type="button" onClick={() => setQuick({ key: null, name: '', qty: 1 })}
                className="text-sm font-semibold px-3 py-2 rounded-xl bg-white hover:bg-steel-50 text-steel-700 border border-steel-200 transition">
                🔩 Cadastrar peça
              </button>
            )}
          </div>
        )}
      </div>

      {(!readOnly || canAssign || ownParts) && (
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

      {quick && (
        <QuickPartModal wid={workshopId} osLabel={osLabel} initialName={quick.name} quantity={quick.qty} defaultMargin={margin}
          onClose={() => setQuick(null)}
          onSaved={res => {
            setSugg(xs => [{ description: res.name, kind: 'part', unit_price: res.price, part_id: res.part_id, cost: res.cost, stock: 0, unit: res.unit },
              ...xs.filter(x => x.description.toLowerCase() !== res.name.toLowerCase())]);
            const filled = { description: res.name, part_id: res.part_id, unit_cost: res.cost > 0 ? moneyInput(res.cost) : '', unit_price: moneyInput(res.price) };
            setRows(rs => quick.key
              ? rs.map(x => x.key === quick.key ? { ...x, ...filled } : x)
              : [...rs, { key: newKey(), kind: 'part', quantity: String(res.quantity).replace('.', ','), mechanic_id: '', used_in: '', stype: '', ...filled }]);
            setQuick(null);
          }} />
      )}

      <datalist id={`os-items-sugg-${osId}`}>
        {suggestions.map(s => <option key={s.description} value={s.description}>{s.part_id ? `Peça cadastrada · ${fmtQty(s.stock)} ${s.unit} em estoque` : s.fromTable ? 'Tabela de serviços' : KIND_LABEL[s.kind]} · {s.unit_price > 0 ? fmtBRL(s.unit_price) : 'preço na OS'}</option>)}
      </datalist>

      <div className="divide-y divide-steel-100">
        {rows.map((r, idx) => (
          <div key={r.key} className="px-5 py-3 grid grid-cols-12 gap-2 items-center">
            {/* Tipo (cada lançamento = 1 item, como num cupom) */}
            <div className="col-span-6 md:col-span-2">
              <div className="text-[10px] font-bold text-steel-400 uppercase tracking-wider mb-0.5">Item {idx + 1}</div>
              {readOnly ? (
                <span className={`badge ${r.kind === 'part' ? 'bg-steel-100 text-steel-700' : 'bg-brand-50 text-brand-700'}`}>{rowLabel(r)}</span>
              ) : (
                <select className="input !py-2 !px-2 text-sm" value={r.kind === 'part' ? 'part' : r.stype === 'mao_de_obra' ? 'mao_de_obra' : 'servico'}
                  onChange={e => update(r.key, e.target.value === 'part'
                    ? { kind: 'part', stype: '' }
                    : { kind: 'labor', stype: e.target.value as 'servico' | 'mao_de_obra' })}>
                  <option value="servico">Serviço + peças</option>
                  <option value="mao_de_obra">Mão de obra</option>
                  <option value="part">Peça</option>
                </select>
              )}
            </div>
            {/* Ações (mobile: ao lado do tipo) */}
            {!readOnly && (
              <div className="col-span-6 md:hidden flex justify-end gap-1">
                <RowActions idx={idx} count={rows.length} onUp={() => move(r.key, -1)} onDown={() => move(r.key, 1)} onRemove={() => remove(r.key)} />
              </div>
            )}
            {/* Descrição */}
            <div className="col-span-12 md:col-span-4">
              {readOnly ? <span className="text-sm font-medium text-steel-800">{r.description}</span> : (
                <input className="input !py-2 text-sm" placeholder={r.kind === 'part' ? 'Ex.: Pastilha de freio dianteira' : r.stype === 'mao_de_obra' ? 'Ex.: Alinhamento' : 'Ex.: Troca de óleo completa (óleo + filtro)'}
                  list={`os-items-sugg-${osId}`} value={r.description}
                  onChange={e => update(r.key, { description: e.target.value })} />
              )}
              {!readOnly && r.kind === 'labor' && r.stype !== 'mao_de_obra'
                && !rows.some(x => x.kind === 'part' && groups.get(x.key)?.key === r.key) && (
                <div className="text-[11px] text-steel-500 mt-1">💡 Valor fechado, peças incluídas · comissão 4% do total. Detalhar as peças é opcional.</div>
              )}
              {!readOnly && r.kind === 'part' && !r.part_id && !r.description.trim() && showCost && (
                <div className="text-[11px] text-steel-500 mt-1 flex flex-wrap items-center gap-x-2">
                  <span>Digite para buscar no cadastro</span>
                  <button type="button" className="font-semibold text-brand-700 hover:underline"
                    onClick={() => setQuick({ key: r.key, name: '', qty: parseMoney(r.quantity) || 1 })}>
                    ➕ Cadastrar peça nova
                  </button>
                </div>
              )}
              {!readOnly && r.kind === 'part' && r.description.trim().length >= 2 && !r.part_id && (
                showCost ? (
                  <div className="text-[11px] text-steel-500 mt-1 flex flex-wrap items-center gap-x-2">
                    <span>Peça não cadastrada</span>
                    <button type="button" className="font-semibold text-brand-700 hover:underline"
                      onClick={() => setQuick({ key: r.key, name: r.description.trim(), qty: parseMoney(r.quantity) || 1 })}>
                      ➕ Cadastrar esta peça
                    </button>
                    <span className="text-steel-400">ou use só nesta OS (avulsa)</span>
                  </div>
                ) : (
                  <div className="text-[11px] text-steel-400 mt-1">Peça avulsa (não está no cadastro)</div>
                )
              )}
            </div>
            {/* Qtd */}
            <div className="col-span-3 md:col-span-1">
              <span className="md:hidden text-[10px] text-steel-400 uppercase">Qtd</span>
              {readOnly ? <div className="text-sm text-right">{r.quantity}</div> : (
                <input className="input !py-2 text-sm text-right" inputMode="decimal" value={r.quantity}
                  onChange={e => update(r.key, { quantity: e.target.value })} />
              )}
            </div>
            {/* Valor unit */}
            <div className="col-span-5 md:col-span-2">
              <span className="md:hidden text-[10px] text-steel-400 uppercase">Valor unit.</span>
              {readOnly ? <div className="text-sm text-right">R$ {r.unit_price}</div> : (
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
              <span className="text-sm font-bold text-steel-900">{fmtBRL(rowTotal(r))}</span>
            </div>
            {/* Ações (desktop) */}
            {!readOnly && (
              <div className="hidden md:flex col-span-1 justify-end gap-1">
                <RowActions idx={idx} count={rows.length} onUp={() => move(r.key, -1)} onDown={() => move(r.key, 1)} onRemove={() => remove(r.key)} />
              </div>
            )}
            {/* Quem fez (comissão) — só em serviço; peça conta para o responsável da OS */}
            {showWho && r.kind === 'labor' && (
              <div className="col-span-12 -mt-1 flex items-center gap-2 text-xs">
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
              </div>
            )}
            {/* Peça: pertence ao serviço logo acima (a comissão segue quem fez esse serviço) */}
            {r.kind === 'part' && rows.some(x => x.kind === 'labor') && (() => {
              const svc = groups.get(r.key);
              return svc && svc.stype === 'servico' ? (
                <div className="col-span-12 -mt-1 text-xs text-steel-500">
                  ↳ peça do serviço <strong className="text-steel-700">{svc.description.trim() || 'sem nome'}</strong> · {whoLabel(svc)}
                </div>
              ) : (
                <div className="col-span-12 -mt-1 text-xs text-pending-800">
                  ⚠️ {svc ? `Peça abaixo de uma “Mão de obra”` : 'Peça fora de um serviço'} — use as setas ↑↓ para colocá-la logo abaixo do “Serviço” em que foi usada{svc ? ', ou mude a mão de obra para “Serviço”' : ''}.
                </div>
              );
            })()}
            {/* Custo e margem da peça (só para quem vê o financeiro) */}
            {showCost && r.kind === 'part' && (
              <CostLine row={r} readOnly={readOnly} onCost={v => update(r.key, { unit_cost: v })} onPrice={v => update(r.key, { unit_price: v })} />
            )}
          </div>
        ))}
      </div>

      {rows.length === 0 && !hasLegacyValues && (
        <div className="px-5 pb-6 pt-2 text-center">
          <div className="text-3xl mb-1">🧾</div>
          <p className="text-sm text-steel-500">
            {readOnly ? 'Nenhum item nesta OS.' : 'Use “+ Serviço + peças” para lançar o serviço com as peças num valor só (ex.: troca de óleo completa). Peça separada é opcional.'}
          </p>
        </div>
      )}

      {/* Totais */}
      {(rows.length > 0 || items.length > 0) && (
        <div className="bg-steel-50 border-t border-steel-100 px-5 py-4">
          <div className="ml-auto max-w-xs space-y-1.5 text-sm">
            <div className="flex justify-between text-steel-600"><span>Itens</span><span>{rows.length}</span></div>
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
                  <span>Lucro nas peças</span>
                  <span className={costedSale - partsCost < 0 ? 'text-alert-600 font-semibold' : 'text-signal-700 font-semibold'}>
                    {fmtBRL(costedSale - partsCost)} · {fmtPct(marginOf(partsCost, costedSale))}
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
            <button type="button" onClick={save} className="btn-primary text-sm !py-2" disabled={saving}>
              {saving ? 'Salvando…' : '💾 Salvar itens'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function RowActions({ idx, count, onUp, onDown, onRemove }: {
  idx: number; count: number; onUp: () => void; onDown: () => void; onRemove: () => void;
}) {
  const btn = 'h-8 w-8 rounded-lg grid place-items-center text-xs transition disabled:opacity-30';
  return (
    <>
      <button type="button" onClick={onUp} disabled={idx === 0} className={`${btn} bg-steel-100 hover:bg-steel-200 text-steel-600`} title="Subir">↑</button>
      <button type="button" onClick={onDown} disabled={idx === count - 1} className={`${btn} bg-steel-100 hover:bg-steel-200 text-steel-600`} title="Descer">↓</button>
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
