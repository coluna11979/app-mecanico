import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import WorkshopLayout from '@/components/layout/WorkshopLayout';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/components/ui/Toast';
import { canDo, useOperator } from '@/lib/operators';
import { fmtBRL, moneyInput, parseMoney } from '@/components/os/osHelpers';
import {
  PART_CATEGORIES, UNITS, fmtPct, fmtQty, loadDefaultMargin, marginOf, needsRestock, partCategory, priceFromMargin,
  priceModeOf, salePriceOf, type PartCategory, type PriceMode, type WorkshopPart,
} from '@/lib/parts';
import { fmtDate, type StockMovement, type Supplier } from '@/lib/purchasing';
import SupplierPicker from '@/components/parts/SupplierPicker';

const MOVE_LABEL: Record<StockMovement['kind'], string> = {
  compra: 'Compra', estorno_compra: 'Estorno de compra', os: 'Usada em OS', estorno_os: 'OS reaberta', ajuste: 'Ajuste',
};

export default function Pecas() {
  const { currentWorkshop } = useAuth();
  const wid = currentWorkshop?.id ?? null;
  const { balcao, session } = useOperator();
  const allowed = canDo(session, balcao, 'ver_financeiro');

  const [parts, setParts]       = useState<WorkshopPart[] | null>(null);
  const [margin, setMargin]     = useState<number | null>(null);
  const [q, setQ]               = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [onlyRestock, setOnlyRestock] = useState(false);
  const [cat, setCat]           = useState<PartCategory | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [editing, setEditing]   = useState<WorkshopPart | 'new' | null>(null);

  const load = useCallback(async () => {
    if (!wid) return;
    const [p, m, s] = await Promise.all([
      supabase.from('workshop_parts').select('*').eq('workshop_id', wid).order('name'),
      loadDefaultMargin(wid),
      supabase.from('suppliers').select('*').eq('workshop_id', wid).order('name'),
    ]);
    setParts((p.data as WorkshopPart[]) ?? []);
    setMargin(m);
    setSuppliers((s.data as Supplier[]) ?? []);
  }, [wid]);

  useEffect(() => { if (allowed) load(); }, [load, allowed]);

  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    const supName = new Map(suppliers.map(x => [x.id, x.name.toLowerCase()]));
    return (parts ?? []).filter(p => (showInactive || p.active) && (!onlyRestock || needsRestock(p))
      && (!cat || p.category === cat) && (!t
      || p.name.toLowerCase().includes(t) || p.code?.toLowerCase().includes(t)
      || p.brand?.toLowerCase().includes(t) || (p.supplier_id && supName.get(p.supplier_id)?.includes(t))
      || partCategory(p.category).label.toLowerCase().includes(t)));
  }, [parts, q, showInactive, onlyRestock, cat, suppliers]);
  const supplierName = useMemo(() => new Map(suppliers.map(x => [x.id, x.name])), [suppliers]);
  const restockCount = (parts ?? []).filter(p => p.active && needsRestock(p)).length;

  // Quantas peças e quanto dinheiro parado (custo × estoque) em cada categoria
  const byCat = useMemo(() => {
    const m = new Map<string, { count: number; stock: number }>();
    for (const p of parts ?? []) {
      if (!p.active) continue;
      const e = m.get(p.category) ?? { count: 0, stock: 0 };
      e.count++;
      e.stock += Math.max(0, Number(p.stock_qty)) * Number(p.cost);
      m.set(p.category, e);
    }
    return PART_CATEGORIES.filter(c => m.has(c.value)).map(c => ({ ...c, ...m.get(c.value)! }));
  }, [parts]);
  const stockValue = byCat.reduce((s, c) => s + c.stock, 0);

  if (!allowed) {
    return (
      <WorkshopLayout>
        <div className="max-w-md mx-auto card text-center py-12">
          <div className="text-4xl mb-2">🔒</div>
          <h1 className="text-lg font-bold">Peças e preços restrito</h1>
          <p className="text-sm text-steel-500 mt-1">Esta tela mostra o custo das peças. Peça ao gestor a permissão “Ver financeiro” em Acessos e funções.</p>
        </div>
      </WorkshopLayout>
    );
  }

  const inactiveCount = (parts ?? []).filter(p => !p.active).length;

  return (
    <WorkshopLayout>
      <div className="max-w-5xl mx-auto space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">🔩 Peças e estoque</h1>
            <p className="text-sm text-steel-500 mt-1">Custo, preço de venda e quantidade. O orçamento puxa o preço daqui e a OS concluída dá baixa no estoque.</p>
          </div>
          <div className="flex gap-2">
            <Link to="/oficina/compras/nova" className="btn-ghost border border-steel-200">🧾 Lançar nota</Link>
            <button className="btn-primary" onClick={() => setEditing('new')}>+ Nova peça</button>
          </div>
        </div>

        {margin != null && wid && <DefaultMargin wid={wid} value={margin} onSaved={v => setMargin(v)} />}

        <div className="flex flex-wrap items-center gap-3">
          <input className="input !w-auto flex-1 min-w-[220px]" placeholder="Buscar por nome, código, marca ou fornecedor"
            value={q} onChange={e => setQ(e.target.value)} />
          {restockCount > 0 && (
            <button onClick={() => setOnlyRestock(v => !v)}
              className={`text-sm font-semibold px-3 py-2 rounded-full border transition ${onlyRestock ? 'bg-alert-600 text-white border-alert-600' : 'bg-alert-50 text-alert-700 border-alert-200'}`}>
              🛒 Comprar ({restockCount})
            </button>
          )}
          {inactiveCount > 0 && (
            <label className="text-sm text-steel-600 flex items-center gap-2">
              <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} />
              Mostrar desativadas ({inactiveCount})
            </label>
          )}
        </div>

        {byCat.length > 1 && (
          <div className="-mx-4 px-4 md:mx-0 md:px-0 overflow-x-auto">
            <div className="flex gap-2 w-max md:w-auto md:flex-wrap">
              <button onClick={() => setCat(null)}
                className={`shrink-0 text-left px-3 py-2 rounded-xl border transition ${cat === null ? 'bg-steel-900 text-white border-steel-900' : 'bg-white border-steel-200 hover:border-steel-300'}`}>
                <div className="text-sm font-semibold">Todas</div>
                <div className={`text-[11px] ${cat === null ? 'text-steel-300' : 'text-steel-500'}`}>{fmtBRL(stockValue)} em estoque</div>
              </button>
              {byCat.map(c => (
                <button key={c.value} onClick={() => setCat(cat === c.value ? null : c.value)}
                  className={`shrink-0 text-left px-3 py-2 rounded-xl border transition ${cat === c.value ? 'bg-steel-900 text-white border-steel-900' : 'bg-white border-steel-200 hover:border-steel-300'}`}>
                  <div className="text-sm font-semibold whitespace-nowrap">{c.icon} {c.label} <span className={cat === c.value ? 'text-steel-300' : 'text-steel-400'}>({c.count})</span></div>
                  <div className={`text-[11px] ${cat === c.value ? 'text-steel-300' : 'text-steel-500'}`}>{fmtBRL(c.stock)} em estoque</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {parts === null || margin === null ? (
          <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-16 bg-white rounded-2xl animate-pulse" />)}</div>
        ) : parts.length === 0 ? (
          <div className="card text-center py-12">
            <div className="text-4xl mb-2">🔩</div>
            <h2 className="text-lg font-bold">Cadastre as peças que você mais usa</h2>
            <p className="text-sm text-steel-500 mt-1 max-w-md mx-auto">
              Informe quanto você paga e o sistema calcula o preço de venda com a sua margem.
              No orçamento, é só digitar o nome que o preço vem sozinho.
            </p>
            <button className="btn-primary mt-5" onClick={() => setEditing('new')}>+ Cadastrar primeira peça</button>
          </div>
        ) : list.length === 0 ? (
          <div className="card text-center py-8 text-sm text-steel-500">
            Nenhuma peça encontrada{q.trim() ? ` para “${q}”` : ''}{cat ? ` em ${partCategory(cat).label}` : ''}.
          </div>
        ) : (
          <div className="card !p-0 overflow-hidden">
            <div className="hidden md:grid grid-cols-12 gap-2 px-5 py-2 bg-steel-50 border-b border-steel-100 text-[10px] font-bold text-steel-500 uppercase tracking-wider">
              <div className="col-span-4">Peça</div>
              <div className="col-span-2 text-right">Estoque</div>
              <div className="col-span-2 text-right">Custo</div>
              <div className="col-span-1 text-right">Margem</div>
              <div className="col-span-2 text-right">Venda</div>
              <div className="col-span-1" />
            </div>
            <ul className="divide-y divide-steel-100">
              {list.map(p => {
                const price = salePriceOf(p, margin);
                const mode = priceModeOf(p);
                return (
                  <li key={p.id}>
                    <button onClick={() => setEditing(p)}
                      className={`w-full text-left px-5 py-3 grid grid-cols-12 gap-2 items-center hover:bg-steel-50 transition ${p.active ? '' : 'opacity-50'}`}>
                      <div className="col-span-12 md:col-span-4 min-w-0">
                        <div className="text-sm font-semibold truncate">{p.name}{!p.active && <span className="badge bg-steel-100 text-steel-500 ml-2">desativada</span>}</div>
                        <div className="text-xs text-steel-500 truncate">
                          {!cat && <span className="text-steel-600">{partCategory(p.category).icon} {partCategory(p.category).label} · </span>}
                          {[p.code, p.brand, p.supplier_id && supplierName.get(p.supplier_id)].filter(Boolean).join(' · ') || `por ${p.unit}`}
                        </div>
                      </div>
                      <div className="col-span-3 md:col-span-2 text-right">
                        <span className="md:hidden text-[10px] text-steel-400 uppercase block">Estoque</span>
                        <span className={`text-sm font-semibold ${needsRestock(p) ? 'text-alert-600' : Number(p.stock_qty) < 0 ? 'text-alert-600' : ''}`}>
                          {fmtQty(p.stock_qty)} <span className="text-xs font-normal text-steel-400">{p.unit}</span>
                        </span>
                        {needsRestock(p) && <span className="block text-[10px] text-alert-600">mín. {fmtQty(p.min_qty)}</span>}
                      </div>
                      <div className="col-span-3 md:col-span-2 text-right">
                        <span className="md:hidden text-[10px] text-steel-400 uppercase block">Custo</span>
                        <span className="text-sm">{fmtBRL(p.cost)}</span>
                      </div>
                      <div className="col-span-3 md:col-span-1 text-right">
                        <span className="md:hidden text-[10px] text-steel-400 uppercase block">Margem</span>
                        <span className="text-sm">{fmtPct(marginOf(Number(p.cost), price))}</span>
                        <span className="block text-[10px] text-steel-400">{mode === 'default' ? 'padrão' : mode === 'margin' ? 'própria' : 'preço fixo'}</span>
                      </div>
                      <div className="col-span-3 md:col-span-2 text-right">
                        <span className="md:hidden text-[10px] text-steel-400 uppercase block">Venda</span>
                        <span className="text-sm font-bold">{fmtBRL(price)}</span>
                      </div>
                      <div className="hidden md:block col-span-1 text-right text-steel-300">›</div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      {editing && wid && margin != null && (
        <PartForm wid={wid} part={editing === 'new' ? null : editing} defaultMargin={margin}
          onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
      )}
    </WorkshopLayout>
  );
}

function DefaultMargin({ wid, value, onSaved }: { wid: string; value: number; onSaved: (v: number) => void }) {
  const [str, setStr] = useState(String(value));
  const [saving, setSaving] = useState(false);
  useEffect(() => { setStr(String(value)); }, [value]);
  const n = parseMoney(str);
  const dirty = Number.isFinite(n) && Math.abs(n - value) > 0.001;

  async function save() {
    if (!Number.isFinite(n) || n < 0 || n > 1000) return toast.error('Margem inválida');
    setSaving(true);
    const { error } = await supabase.from('workshop_pricing').upsert({ workshop_id: wid, part_margin_percent: n });
    setSaving(false);
    if (error) return toast.error('Não foi possível salvar a margem: ' + error.message);
    toast.success('Margem padrão salva ✓');
    onSaved(n);
  }

  return (
    <div className="card flex flex-wrap items-center justify-between gap-3">
      <div>
        <div className="text-sm font-semibold">Margem padrão da oficina</div>
        <div className="text-xs text-steel-500">
          Usada nas peças sem margem própria. Ex.: custo {fmtBRL(100)} → venda {fmtBRL(priceFromMargin(100, Number.isFinite(n) ? n : value))}.
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="relative w-28">
          <input className="input !py-2 !pr-8 text-right" inputMode="decimal" value={str} onChange={e => setStr(e.target.value)} />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-steel-400 text-sm">%</span>
        </div>
        {dirty && <button className="btn-primary !py-2 text-sm" onClick={save} disabled={saving}>{saving ? 'Salvando…' : 'Salvar'}</button>}
      </div>
    </div>
  );
}

function PartForm({ wid, part, defaultMargin, onClose, onSaved }: {
  wid: string; part: WorkshopPart | null; defaultMargin: number; onClose: () => void; onSaved: () => void;
}) {
  const [name, setName]         = useState(part?.name ?? '');
  const [code, setCode]         = useState(part?.code ?? '');
  const [brand, setBrand]       = useState(part?.brand ?? '');
  const [unit, setUnit]         = useState(part?.unit ?? 'un');
  // '' = automática: o banco escolhe pelo nome da peça
  const [category, setCategory] = useState<PartCategory | ''>(part?.category ?? '');
  const [supplierId, setSupplierId] = useState(part?.supplier_id ?? '');
  const [minQty, setMinQty]     = useState(part ? fmtQty(part.min_qty) : '0');
  const [stock, setStock]       = useState(part ? fmtQty(part.stock_qty) : '0');
  const [moves, setMoves]       = useState<StockMovement[]>([]);

  useEffect(() => {
    if (!part) return;
    supabase.from('stock_movements').select('*').eq('part_id', part.id).order('created_at', { ascending: false }).limit(10)
      .then(({ data }) => setMoves((data as StockMovement[]) ?? []));
  }, [part]);
  const [cost, setCost]         = useState(part ? moneyInput(Number(part.cost)) : '');
  const [mode, setMode]         = useState<PriceMode>(part ? priceModeOf(part) : 'default');
  const [marginStr, setMarginStr] = useState(part?.margin_percent != null ? String(part.margin_percent) : String(defaultMargin));
  const [fixed, setFixed]       = useState(part?.sale_price != null ? moneyInput(Number(part.sale_price)) : '');
  const [active, setActive]     = useState(part?.active ?? true);
  const [saving, setSaving]     = useState(false);

  const c = Number.isFinite(parseMoney(cost)) ? parseMoney(cost) : 0;
  const m = parseMoney(marginStr);
  const f = parseMoney(fixed);
  const price = mode === 'fixed' ? (Number.isFinite(f) ? f : 0) : priceFromMargin(c, mode === 'margin' && Number.isFinite(m) ? m : defaultMargin);
  const profit = price - c;
  const pct = marginOf(c, price);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return toast.error('Informe o nome da peça');
    if (!Number.isFinite(parseMoney(cost || '0')) || parseMoney(cost || '0') < 0) return toast.error('Custo inválido');
    if (mode === 'margin' && (!Number.isFinite(m) || m < 0 || m > 1000)) return toast.error('Margem inválida');
    if (mode === 'fixed' && (!Number.isFinite(f) || f < 0)) return toast.error('Preço de venda inválido');
    const min = parseMoney(minQty || '0');
    const counted = parseMoney(stock || '0');
    if (!Number.isFinite(min) || min < 0) return toast.error('Estoque mínimo inválido');
    if (!Number.isFinite(counted) || counted < 0) return toast.error('Quantidade em estoque inválida');

    const row = {
      workshop_id: wid,
      name: name.trim(),
      code: code.trim() || null,
      brand: brand.trim() || null,
      unit,
      category: category || null,
      supplier_id: supplierId || null,
      min_qty: min,
      cost: parseMoney(cost || '0'),
      margin_percent: mode === 'margin' ? m : null,
      sale_price: mode === 'fixed' ? f : null,
      active,
    };
    setSaving(true);
    const { data, error } = part
      ? await supabase.from('workshop_parts').update(row).eq('id', part.id).select('id').single()
      : await supabase.from('workshop_parts').insert(row).select('id').single();
    if (error) { setSaving(false); return toast.error('Não foi possível salvar: ' + error.message); }
    // Quantidade diferente da atual → ajuste de estoque (fica no histórico)
    if (Math.abs(counted - Number(part?.stock_qty ?? 0)) > 0.0005) {
      const { error: e2 } = await supabase.rpc('stock_adjust', {
        p_part: (data as { id: string }).id, p_counted: counted, p_note: part ? 'Contagem de estoque' : 'Estoque inicial',
      });
      if (e2) { setSaving(false); return toast.error('Peça salva, mas o estoque não foi ajustado: ' + e2.message); }
    }
    setSaving(false);
    toast.success(part ? 'Peça atualizada ✓' : 'Peça cadastrada ✓');
    onSaved();
  }

  return (
    <div className="fixed inset-0 bg-steel-900/60 z-50 flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
      <form onSubmit={save} onClick={e => e.stopPropagation()}
        className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl max-h-[94vh] flex flex-col shadow-2xl">
        <div className="px-6 pt-5 pb-3 border-b border-steel-100 flex items-center justify-between">
          <h2 className="text-lg font-bold">{part ? 'Editar peça' : 'Nova peça'}</h2>
          <button type="button" onClick={onClose} className="h-8 w-8 rounded-lg grid place-items-center text-steel-500 hover:bg-steel-100">✕</button>
        </div>

        <div className="px-6 py-4 space-y-4 overflow-y-auto">
          <div>
            <label className="label">Nome da peça *</label>
            <input className="input" autoFocus placeholder="Ex.: Pastilha de freio dianteira" value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div>
            <label className="label">Categoria</label>
            <select className="input" value={category} onChange={e => setCategory(e.target.value as PartCategory | '')}>
              <option value="">✨ Automática (pelo nome da peça)</option>
              {PART_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.icon} {c.label}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Código / referência</label>
              <input className="input" placeholder="Ex.: N-1234" value={code} onChange={e => setCode(e.target.value)} />
            </div>
            <div>
              <label className="label">Marca</label>
              <input className="input" placeholder="Ex.: Cobreq" value={brand} onChange={e => setBrand(e.target.value)} />
            </div>
            <div>
              <label className="label">Unidade</label>
              <select className="input" value={unit} onChange={e => setUnit(e.target.value)}>
                {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Fornecedor</label>
              <SupplierPicker wid={wid} value={supplierId || null} onChange={x => setSupplierId(x?.id ?? '')} placeholder="Buscar…" />
            </div>
          </div>

          <div className="rounded-2xl border border-steel-200 p-4 space-y-3">
            <div>
              <label className="label">Valor de compra (custo) por {unit}</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-steel-400 text-sm">R$</span>
                <input className="input !pl-9" inputMode="decimal" placeholder="0,00" value={cost}
                  onChange={e => setCost(e.target.value)}
                  onBlur={e => { const v = parseMoney(e.target.value); if (Number.isFinite(v)) setCost(moneyInput(v)); }} />
              </div>
            </div>

            <div>
              <label className="label">Preço de venda</label>
              <div className="grid grid-cols-3 gap-2">
                {([['default', `Margem padrão (${defaultMargin}%)`], ['margin', 'Margem própria'], ['fixed', 'Preço fixo']] as [PriceMode, string][]).map(([k, l]) => (
                  <button key={k} type="button" onClick={() => setMode(k)}
                    className={`text-xs font-semibold px-2 py-2 rounded-xl border transition ${
                      mode === k ? 'bg-steel-900 text-white border-steel-900' : 'bg-white text-steel-600 border-steel-200'}`}>
                    {l}
                  </button>
                ))}
              </div>
            </div>

            {mode === 'margin' && (
              <div className="relative w-32">
                <input className="input !pr-8 text-right" inputMode="decimal" value={marginStr} onChange={e => setMarginStr(e.target.value)} />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-steel-400 text-sm">%</span>
              </div>
            )}
            {mode === 'fixed' && (
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-steel-400 text-sm">R$</span>
                <input className="input !pl-9" inputMode="decimal" placeholder="0,00" value={fixed}
                  onChange={e => setFixed(e.target.value)}
                  onBlur={e => { const v = parseMoney(e.target.value); if (Number.isFinite(v)) setFixed(moneyInput(v)); }} />
              </div>
            )}

            <div className="grid grid-cols-3 gap-2 bg-steel-50 rounded-xl p-3 text-center">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-steel-500">Venda</div>
                <div className="text-lg font-bold font-display">{fmtBRL(price)}</div>
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-steel-500">Lucro</div>
                <div className={`text-lg font-bold font-display ${profit < 0 ? 'text-alert-600' : 'text-signal-700'}`}>{fmtBRL(profit)}</div>
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-steel-500">Margem</div>
                <div className="text-lg font-bold font-display">{fmtPct(pct)}</div>
              </div>
            </div>
            {profit < 0 && <p className="text-xs text-alert-600">⚠️ O preço de venda está abaixo do custo.</p>}
          </div>

          <div className="rounded-2xl border border-steel-200 p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">{part ? 'Quantidade em estoque' : 'Estoque inicial'}</label>
                <input className="input text-right" inputMode="decimal" value={stock} onChange={e => setStock(e.target.value)} />
                <p className="text-[11px] text-steel-400 mt-1">{part ? 'Mude só se contou e está diferente — fica registrado como ajuste.' : 'Quanto você já tem na prateleira.'}</p>
              </div>
              <div>
                <label className="label">Estoque mínimo</label>
                <input className="input text-right" inputMode="decimal" value={minQty} onChange={e => setMinQty(e.target.value)} />
                <p className="text-[11px] text-steel-400 mt-1">Abaixo disso aparece em “Comprar”. 0 = sem alerta.</p>
              </div>
            </div>
            {moves.length > 0 && (
              <div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-steel-500 mb-1">Últimas movimentações</div>
                <ul className="text-xs divide-y divide-steel-100">
                  {moves.map(m => (
                    <li key={m.id} className="py-1 flex justify-between gap-2">
                      <span className="min-w-0 truncate text-steel-600">{fmtDate(m.created_at)} · {MOVE_LABEL[m.kind]}{m.note ? ` · ${m.note}` : ''}</span>
                      <span className={`shrink-0 font-semibold ${Number(m.qty) > 0 ? 'text-signal-700' : 'text-alert-600'}`}>{Number(m.qty) > 0 ? '+' : ''}{fmtQty(m.qty)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {part && (
            <label className="flex items-center gap-2 text-sm text-steel-700">
              <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} />
              Peça ativa (desmarque para não aparecer mais no orçamento)
            </label>
          )}
        </div>

        <div className="px-6 py-4 border-t border-steel-100 flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
          <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Salvando…' : part ? 'Salvar' : 'Cadastrar peça'}</button>
        </div>
      </form>
    </div>
  );
}
