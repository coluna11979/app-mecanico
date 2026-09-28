import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from '@/components/ui/Toast';
import type { OsItemKind, ServiceOrderItem } from '@/types/database';
import { fmtBRL, moneyInput, parseMoney } from './osHelpers';
import { fmtPct, loadDefaultMargin, marginOf, salePriceOf, type WorkshopPart } from '@/lib/parts';

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
};

type Suggestion = { description: string; kind: OsItemKind; unit_price: number; part_id?: string; cost?: number };

const KIND_LABEL: Record<OsItemKind, string> = { part: 'Peça', labor: 'Serviço' };

let keySeq = 0;
const newKey = () => `new-${++keySeq}`;

function toRow(i: ServiceOrderItem): Row {
  return {
    key: i.id, id: i.id, kind: i.kind, description: i.description,
    quantity: String(i.quantity).replace('.', ','), unit_price: moneyInput(i.unit_price),
    unit_cost: i.unit_cost != null ? moneyInput(Number(i.unit_cost)) : '', part_id: i.part_id ?? null,
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
  onSaved: () => void;
}

export default function OsItemsEditor({ osId, workshopId, items, discount, legacy, readOnly, showCost, onSaved }: Props) {
  const [rows, setRows]         = useState<Row[]>(() => items.map(toRow));
  const [discountStr, setDisc]  = useState(() => (discount ? moneyInput(discount) : ''));
  const [saving, setSaving]     = useState(false);
  const [suggestions, setSugg]  = useState<Suggestion[]>([]);

  // Recarrega quando os itens salvos mudam (após salvar)
  useEffect(() => { setRows(items.map(toRow)); }, [items]);
  useEffect(() => { setDisc(discount ? moneyInput(discount) : ''); }, [discount]);

  // Sugestões: peças do cadastro (preço de venda atual) e itens que a oficina já usou (último preço cobrado)
  useEffect(() => {
    let alive = true;
    (async () => {
      const [cat, hist, margin] = await Promise.all([
        supabase.from('workshop_parts').select('id, name, cost, margin_percent, sale_price')
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
      for (const p of (cat.data ?? []) as Pick<WorkshopPart, 'id' | 'name' | 'cost' | 'margin_percent' | 'sale_price'>[]) {
        const k = p.name.trim().toLowerCase();
        if (!seen.has(k)) seen.set(k, { description: p.name.trim(), kind: 'part', unit_price: salePriceOf(p, margin), part_id: p.id, cost: Number(p.cost) });
      }
      for (const d of (hist.data ?? []) as Suggestion[]) {
        const k = d.description.trim().toLowerCase();
        if (!seen.has(k)) seen.set(k, { description: d.description.trim(), kind: d.kind, unit_price: Number(d.unit_price) });
      }
      setSugg([...seen.values()]);
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

  const original = useMemo(() => JSON.stringify(items.map(toRow)), [items]);
  const dirty = JSON.stringify(rows) !== original
    || Math.abs(disc - (discount ?? 0)) > 0.001;

  function addRow(kind: OsItemKind) {
    setRows(rs => [...rs, { key: newKey(), kind, description: '', quantity: '1', unit_price: '', unit_cost: '', part_id: null }]);
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
          if (!r.unit_price) next.unit_price = moneyInput(s.unit_price);
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

      const payload = rows.map((r, idx) => ({
        ...(r.id ? { id: r.id } : {}),
        service_order_id: osId,
        workshop_id: workshopId, // o banco confere pela OS (trigger)
        kind: r.kind,
        description: r.description.trim(),
        quantity: parseMoney(r.quantity),
        unit_price: parseMoney(r.unit_price || '0'),
        unit_cost: r.kind === 'part' && r.unit_cost.trim() ? parseMoney(r.unit_cost) : null,
        part_id: r.kind === 'part' ? r.part_id : null,
        position: idx,
      }));
      const existing = payload.filter(p => 'id' in p);
      const created  = payload.filter(p => !('id' in p));
      if (existing.length) {
        const { error } = await supabase.from('service_order_items').upsert(existing);
        if (error) throw error;
      }
      if (created.length) {
        const { error } = await supabase.from('service_order_items').insert(created);
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
          <div className="flex gap-2">
            <button type="button" onClick={() => addRow('part')}
              className="text-sm font-semibold px-3 py-2 rounded-xl bg-steel-100 hover:bg-steel-200 text-steel-700 transition">
              + Peça
            </button>
            <button type="button" onClick={() => addRow('labor')}
              className="text-sm font-semibold px-3 py-2 rounded-xl bg-brand-50 hover:bg-brand-100 text-brand-700 border border-brand-200 transition">
              + Serviço
            </button>
          </div>
        )}
      </div>

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

      <datalist id={`os-items-sugg-${osId}`}>
        {suggestions.map(s => <option key={s.description} value={s.description}>{s.part_id ? 'Peça cadastrada' : KIND_LABEL[s.kind]} · {fmtBRL(s.unit_price)}</option>)}
      </datalist>

      <div className="divide-y divide-steel-100">
        {rows.map((r, idx) => (
          <div key={r.key} className="px-5 py-3 grid grid-cols-12 gap-2 items-center">
            {/* Tipo */}
            <div className="col-span-6 md:col-span-2">
              {readOnly ? (
                <span className={`badge ${r.kind === 'part' ? 'bg-steel-100 text-steel-700' : 'bg-brand-50 text-brand-700'}`}>{KIND_LABEL[r.kind]}</span>
              ) : (
                <select className="input !py-2 !px-2 text-sm" value={r.kind}
                  onChange={e => update(r.key, { kind: e.target.value as OsItemKind })}>
                  <option value="part">Peça</option>
                  <option value="labor">Serviço</option>
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
                <input className="input !py-2 text-sm" placeholder={r.kind === 'part' ? 'Ex.: Pastilha de freio dianteira' : 'Ex.: Troca de pastilhas'}
                  list={`os-items-sugg-${osId}`} value={r.description}
                  onChange={e => update(r.key, { description: e.target.value })} />
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
            {/* Custo e margem da peça (só para quem vê o financeiro) */}
            {showCost && r.kind === 'part' && (
              <CostLine row={r} readOnly={readOnly} onChange={v => update(r.key, { unit_cost: v })} />
            )}
          </div>
        ))}
      </div>

      {rows.length === 0 && !hasLegacyValues && (
        <div className="px-5 pb-6 pt-2 text-center">
          <div className="text-3xl mb-1">🧾</div>
          <p className="text-sm text-steel-500">
            {readOnly ? 'Nenhum item nesta OS.' : 'Adicione as peças e os serviços desta OS. O total é somado automaticamente.'}
          </p>
        </div>
      )}

      {/* Totais */}
      {(rows.length > 0 || items.length > 0) && (
        <div className="bg-steel-50 border-t border-steel-100 px-5 py-4">
          <div className="ml-auto max-w-xs space-y-1.5 text-sm">
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
            <button type="button" onClick={() => { setRows(items.map(toRow)); setDisc(discount ? moneyInput(discount) : ''); }}
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

function CostLine({ row, readOnly, onChange }: { row: Row; readOnly?: boolean; onChange: (v: string) => void }) {
  const cost = rowCost(row);
  const sale = rowTotal(row);
  const pct = cost != null ? marginOf(cost, sale) : null;
  return (
    <div className="col-span-12 md:col-start-3 md:col-span-9 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-steel-500 -mt-1">
      {row.part_id && <span className="badge bg-steel-100 text-steel-600">🔩 do cadastro</span>}
      <span className="flex items-center gap-1.5">
        Custo unit.
        {readOnly ? <strong className="text-steel-700">{row.unit_cost ? `R$ ${row.unit_cost}` : '—'}</strong> : (
          <span className="relative">
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-steel-400 text-[11px]">R$</span>
            <input className="input !py-1 !pl-7 !w-24 text-xs text-right" inputMode="decimal" placeholder="0,00" value={row.unit_cost}
              onChange={e => onChange(e.target.value)}
              onBlur={e => { const v = parseMoney(e.target.value); if (Number.isFinite(v)) onChange(moneyInput(v)); }} />
          </span>
        )}
      </span>
      {cost != null && (
        <span className={sale - cost < 0 ? 'text-alert-600 font-semibold' : 'text-signal-700'}>
          lucro {fmtBRL(sale - cost)} · margem {fmtPct(pct)}
        </span>
      )}
    </div>
  );
}
