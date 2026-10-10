import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import WorkshopLayout from '@/components/layout/WorkshopLayout';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/components/ui/Toast';
import { canDo, useOperator } from '@/lib/operators';
import { fmtBRL, moneyInput, parseMoney } from '@/components/os/osHelpers';
import {
  PART_CATEGORIES, UNITS, fmtPct, fmtQty, loadDefaultMargin, marginOf, partCategory, priceFromMargin,
  priceModeOf, salePriceOf, type PartCategory, type PriceMode, type WorkshopPart,
} from '@/lib/parts';
import { fmtDate, type StockMovement, type Supplier } from '@/lib/purchasing';
import {
  SITUATIONS, ago, costToConfirm, isBelowMin, isNegative, isZeroBought, loadStockData, matchSituation, osShortage,
  type Situation, type StockData,
} from '@/lib/stock';
import { addVehicleToParts, fitsVehicle, fmtVehicle, fmtYears, loadPartVehicles, markPartsUniversal, norm, partLabel, savePartVehicles, type PartVehicle, type VehicleDraft } from '@/lib/partVehicles';
import SupplierPicker from '@/components/parts/SupplierPicker';
import StockTabs, { useStockAccess } from '@/components/stock/StockTabs';
import { StockHistoryModal, StockMoveModal, type MoveMode } from '@/components/stock/StockModals';

const MOVE_LABEL: Record<StockMovement['kind'], string> = {
  compra: 'Compra', estorno_compra: 'Estorno de compra', os: 'Usada em OS', estorno_os: 'OS reaberta', ajuste: 'Ajuste',
};

const PAGE = 100;

export default function Pecas() {
  const { currentWorkshop } = useAuth();
  const wid = currentWorkshop?.id ?? null;
  const { balcao, session } = useOperator();
  const allowed = canDo(session, balcao, 'pecas_estoque');
  const access = useStockAccess();
  const [params, setParams] = useSearchParams();

  const [data, setData]         = useState<StockData | null>(null);
  const [margin, setMargin]     = useState<number | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [q, setQ]               = useState('');
  const [supplierF, setSupplierF] = useState('');
  const [cat, setCat]           = useState<PartCategory | ''>('');
  const [showInactive, setShowInactive] = useState(false);
  const [more, setMore]         = useState(false);
  const [limit, setLimit]       = useState(PAGE);
  const [editing, setEditing]   = useState<WorkshopPart | 'new' | null>(null);
  const [pricing, setPricing]   = useState(false);
  const [moving, setMoving]     = useState<{ part: WorkshopPart; mode: MoveMode } | null>(null);
  const [history, setHistory]   = useState<WorkshopPart | null>(null);
  const [menu, setMenu]         = useState<string | null>(null);
  const [vehicles, setVehicles] = useState<Map<string, PartVehicle[]>>(new Map());
  const [vBrand, setVBrand]     = useState('');
  const [vModel, setVModel]     = useState('');
  const [vYear, setVYear]       = useState('');
  const [noVehicle, setNoVehicle] = useState(false);
  const [bulk, setBulk]       = useState(false);

  const situation = (SITUATIONS.some(s => s.value === params.get('situacao')) ? params.get('situacao') : 'todas') as Situation;
  const setSituation = (s: Situation) => setParams(p => { const n = new URLSearchParams(p); if (s === 'todas') n.delete('situacao'); else n.set('situacao', s); return n; }, { replace: true });

  const load = useCallback(async () => {
    if (!wid) return;
    const [d, m, s, v] = await Promise.all([
      loadStockData(wid),
      loadDefaultMargin(wid),
      supabase.from('suppliers').select('*').eq('workshop_id', wid).order('name'),
      loadPartVehicles(wid),
    ]);
    setData(d);
    setVehicles(v);
    setMargin(m);
    setSuppliers((s.data as Supplier[]) ?? []);
  }, [wid]);

  useEffect(() => { if (allowed) load(); }, [load, allowed]);

  // Links do painel: ?peca=<id> abre a ficha, ?nova=1 abre o cadastro
  useEffect(() => {
    if (!data) return;
    const id = params.get('peca');
    const nova = params.get('nova');
    if (!id && !nova) return;
    if (nova) setEditing('new');
    else { const p = data.parts.find(x => x.id === id); if (p) setEditing(p); }
    setParams(p => { const n = new URLSearchParams(p); n.delete('peca'); n.delete('nova'); return n; }, { replace: true });
  }, [data, params, setParams]);

  useEffect(() => { setLimit(PAGE); }, [q, situation, supplierF, cat, showInactive, vBrand, vModel, vYear, noVehicle]);

  const parts = data?.parts ?? null;
  const supplierName = useMemo(() => new Map(suppliers.map(x => [x.id, x.name])), [suppliers]);

  const yearNum = /^\d{4}$/.test(vYear.trim()) ? Number(vYear.trim()) : null;
  const hasVehicleFilter = !!(vBrand.trim() || vModel.trim() || yearNum);

  // Sugestões de marca/modelo a partir do que já foi cadastrado
  const brandOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const l of vehicles.values()) for (const v of l) if (!m.has(norm(v.brand))) m.set(norm(v.brand), v.brand);
    return [...m.values()].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [vehicles]);
  const modelOptionsFor = (brand: string) => {
    const m = new Map<string, string>();
    for (const l of vehicles.values()) for (const v of l)
      if ((!brand.trim() || norm(v.brand) === norm(brand)) && !m.has(norm(v.model))) m.set(norm(v.model), v.model);
    return [...m.values()].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  };

  const list = useMemo(() => {
    if (!data || !parts) return [];
    const t = q.trim().toLowerCase();
    return parts.filter(p => (showInactive || p.active)
      && matchSituation(p, situation, data)
      && (!supplierF || p.supplier_id === supplierF)
      && (!cat || p.category === cat)
      && (!noVehicle || (!p.universal && !vehicles.get(p.id)?.length))
      && (!hasVehicleFilter || p.universal || fitsVehicle(vehicles.get(p.id), vBrand, vModel, yearNum))
      && (!t || p.name.toLowerCase().includes(t) || p.code?.toLowerCase().includes(t)
        || p.brand?.toLowerCase().includes(t) || (p.supplier_id && supplierName.get(p.supplier_id)?.toLowerCase().includes(t))
        || partCategory(p.category).label.toLowerCase().includes(t)))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }, [data, parts, q, showInactive, situation, supplierF, cat, supplierName, vehicles, vBrand, vModel, yearNum, hasVehicleFilter, noVehicle]);

  const counts = useMemo(() => {
    const c = {} as Record<Situation, number>;
    if (!data) return c;
    const act = data.parts.filter(p => p.active);
    for (const s of SITUATIONS) c[s.value] = act.filter(p => matchSituation(p, s.value, data)).length;
    return c;
  }, [data]);

  // Peças ativas por categoria (só as categorias que a oficina usa)
  const catCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of parts ?? []) if (p.active) m.set(p.category, (m.get(p.category) ?? 0) + 1);
    return PART_CATEGORIES.filter(c => m.has(c.value)).map(c => ({ ...c, n: m.get(c.value)! }));
  }, [parts]);

  if (!allowed) {
    return (
      <WorkshopLayout>
        <div className="max-w-md mx-auto card text-center py-12">
          <div className="text-4xl mb-2">🔒</div>
          <h1 className="text-lg font-bold">Peças e preços restrito</h1>
          <p className="text-sm text-steel-500 mt-1">Esta tela mostra o custo das peças. Peça ao gestor a permissão “Peças e estoque” em Acessos e funções.</p>
        </div>
      </WorkshopLayout>
    );
  }

  const inactiveCount = (parts ?? []).filter(p => !p.active).length;
  const usedSuppliers = suppliers.filter(s => (parts ?? []).some(p => p.supplier_id === s.id));
  const extraFilters = showInactive ? 1 : 0;
  const buyLink = (p: WorkshopPart) => `/oficina/compras/nova?peca=${p.id}${p.supplier_id ? `&fornecedor=${p.supplier_id}` : ''}`;
  const actions = (p: WorkshopPart) => [
    { label: '＋ Entrada', run: () => setMoving({ part: p, mode: 'entrada' }) },
    { label: '－ Saída', run: () => setMoving({ part: p, mode: 'saida' }) },
    { label: '⚖️ Ajustar estoque', run: () => setMoving({ part: p, mode: 'ajuste' }) },
    { label: '🕘 Histórico', run: () => setHistory(p) },
    { label: '✏️ Editar peça', run: () => setEditing(p) },
  ];

  return (
    <WorkshopLayout>
      <div className="max-w-6xl mx-auto space-y-4">
        <StockTabs title="Peças" subtitle="Custo, preço e quantidade. O orçamento puxa o preço daqui e a OS concluída dá baixa no estoque."
          actions={<>
            <button className="btn-ghost border border-steel-200 text-sm !py-2" onClick={() => setPricing(true)} title="Margem padrão da oficina">⚙️ Preços</button>
            {access.compras && <Link to="/oficina/compras/nova" className="btn-ghost border border-steel-200 text-sm !py-2">🧾 Lançar nota</Link>}
            <button className="btn-primary text-sm !py-2" onClick={() => setEditing('new')}>+ Nova peça</button>
          </>} />

        {/* Filtros */}
        <div className="space-y-2">
          <div className="flex flex-col sm:flex-row gap-2">
            <input className="input flex-1" placeholder="🔍 Buscar por nome, código, marca ou fornecedor" value={q} onChange={e => setQ(e.target.value)} />
            <div className="flex gap-2">
              <select className="input !py-2 flex-1 sm:!w-auto text-sm" value={situation} onChange={e => setSituation(e.target.value as Situation)}>
                {SITUATIONS.filter(s => s.value === 'todas' || s.value === situation || counts[s.value] > 0 || s.value === 'atencao')
                  .map(s => <option key={s.value} value={s.value}>{s.label}{s.value !== 'todas' && counts[s.value] != null ? ` (${counts[s.value]})` : ''}</option>)}
              </select>
              {usedSuppliers.length > 0 && (
                <select className="input !py-2 flex-1 sm:!w-auto text-sm" value={supplierF} onChange={e => setSupplierF(e.target.value)}>
                  <option value="">Todos os fornecedores</option>
                  {usedSuppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              )}
              <button onClick={() => setMore(v => !v)} className={`shrink-0 text-sm font-semibold px-3 rounded-xl border ${more || extraFilters ? 'border-steel-900 text-steel-900' : 'border-steel-200 text-steel-600'}`}>
                Mais filtros{extraFilters > 0 && ` (${extraFilters})`}
              </button>
            </div>
          </div>
          {more && (
            <div className="flex flex-wrap items-center gap-3 rounded-xl bg-steel-50 px-3 py-2">
              {inactiveCount > 0 ? (
                <label className="text-sm text-steel-600 flex items-center gap-2">
                  <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} />
                  Mostrar desativadas ({inactiveCount})
                </label>
              ) : <span className="text-sm text-steel-500">Nenhuma peça desativada.</span>}
            </div>
          )}

          {/* Atalhos: em falta, com estoque e categoria */}
          {data && parts && parts.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <QuickChip on={situation === 'todas'} onClick={() => setSituation('todas')}>Todas</QuickChip>
              <QuickChip on={situation === 'atencao'} warn={counts.atencao > 0} onClick={() => setSituation(situation === 'atencao' ? 'todas' : 'atencao')}>
                ⚠️ Em falta ({counts.atencao ?? 0})
              </QuickChip>
              <QuickChip on={situation === 'com_estoque'} onClick={() => setSituation(situation === 'com_estoque' ? 'todas' : 'com_estoque')}>
                Com estoque ({counts.com_estoque ?? 0})
              </QuickChip>
              {catCounts.length > 1 && (
                <select value={cat} onChange={e => setCat(e.target.value as PartCategory | '')}
                  className={`text-xs font-semibold pl-3 pr-7 py-1.5 rounded-full border bg-white ${cat ? 'border-steel-900 text-steel-900' : 'border-steel-200 text-steel-600'}`}>
                  <option value="">📂 Todas as categorias</option>
                  {catCounts.map(c => <option key={c.value} value={c.value}>{c.icon} {c.label} ({c.n})</option>)}
                </select>
              )}
              <span className="ml-auto text-xs text-steel-500">{list.length} peça{list.length === 1 ? '' : 's'}</span>
            </div>
          )}
          {data && parts && parts.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-steel-600">🚗 Serve em:</span>
              <input className="input !py-1.5 !w-32 text-sm" placeholder="Marca" list="pv-brands" value={vBrand} onChange={e => setVBrand(e.target.value)} />
              <input className="input !py-1.5 !w-36 text-sm" placeholder="Modelo" list="pv-models" value={vModel} onChange={e => setVModel(e.target.value)} />
              <input className="input !py-1.5 !w-20 text-sm" placeholder="Ano" inputMode="numeric" maxLength={4} value={vYear} onChange={e => setVYear(e.target.value.replace(/\D/g, ''))} />
              <datalist id="pv-brands">{brandOptions.map(b => <option key={b} value={b} />)}</datalist>
              <datalist id="pv-models">{modelOptionsFor(vBrand).map(m => <option key={m} value={m} />)}</datalist>
              {hasVehicleFilter && (
                <button className="text-xs font-semibold text-brand-700" onClick={() => { setVBrand(''); setVModel(''); setVYear(''); }}>limpar</button>
              )}
              <QuickChip on={noVehicle} onClick={() => setNoVehicle(v => !v)}>
                Sem veículo ({parts.filter(p => p.active && !p.universal && !vehicles.get(p.id)?.length).length})
              </QuickChip>
              {noVehicle && <button className="text-xs font-semibold text-brand-700" onClick={() => setBulk(true)}>🧩 Atribuir em lote</button>}
            </div>
          )}
          {hasVehicleFilter && yearNum != null && (
            <p className="text-xs text-steel-500">Peças cadastradas sem ano e peças universais aparecem junto: o sistema considera que servem em qualquer ano.</p>
          )}
          {situation === 'atencao' && (
            <p className="text-xs text-steel-500">Em falta: estoque negativo, faltando para OS aberta, abaixo do mínimo ou zerada depois de comprada. Peça que nunca foi comprada por nota não entra aqui.</p>
          )}
          {situation === 'custo' && (
            <p className="text-xs text-steel-500">Peças com estoque (ou sem custo) que nunca entraram por uma nota de compra. O custo veio do cadastro ou da importação: confira e lance a próxima compra pela nota.</p>
          )}
          {situation === 'parada' && data && counts.parada === 0 && (
            <p className="text-xs text-steel-500">Peças paradas aparecem quando houver 90 dias de histórico de estoque.</p>
          )}
        </div>

        {parts === null || margin === null || !data ? (
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
            Nenhuma peça encontrada{q.trim() ? ` para “${q}”` : ''} com esses filtros.
          </div>
        ) : (
          <>
            {/* Desktop: tabela compacta */}
            <div className="hidden md:block card !p-0">
              <div className="grid grid-cols-[minmax(0,2.4fr)_minmax(0,1fr)_88px_88px_88px_minmax(0,1.2fr)_96px_40px] gap-3 px-5 py-2 bg-steel-50 border-b border-steel-100 rounded-t-2xl text-[10px] font-bold text-steel-500 uppercase tracking-wider">
                <div>Peça</div><div>Código</div><div className="text-right">Estoque</div><div className="text-right">Custo</div>
                <div className="text-right">Preço</div><div>Fornecedor</div><div>Últ. mov.</div><div />
              </div>
              <ul className="divide-y divide-steel-100">
                {list.slice(0, limit).map(p => (
                  <li key={p.id} className={`grid grid-cols-[minmax(0,2.4fr)_minmax(0,1fr)_88px_88px_88px_minmax(0,1.2fr)_96px_40px] gap-3 px-5 py-2.5 items-center hover:bg-steel-50 ${p.active ? '' : 'opacity-50'}`}>
                    <button className="min-w-0 text-left" onClick={() => setEditing(p)}>
                      <div className="text-sm font-semibold truncate">{p.name}</div>
                      <Flags p={p} d={data} />
                      <VehicleLine list={vehicles.get(p.id)} universal={p.universal} />
                    </button>
                    <div className="text-xs text-steel-600 truncate">{p.code || <span className="text-steel-300">—</span>}</div>
                    <div className="text-right"><StockQty p={p} /></div>
                    <div className="text-right text-sm">{fmtBRL(p.cost)}</div>
                    <div className="text-right text-sm font-bold">{fmtBRL(salePriceOf(p, margin))}</div>
                    <div className="text-xs text-steel-600 truncate">{(p.supplier_id && supplierName.get(p.supplier_id)) || <span className="text-steel-300">—</span>}</div>
                    <div className="text-xs text-steel-500" title={data.lastMove.get(p.id) ? fmtDate(data.lastMove.get(p.id)!) : undefined}>{ago(data.lastMove.get(p.id))}</div>
                    <div className="relative text-right">
                      <button onClick={() => setMenu(menu === p.id ? null : p.id)} className="h-8 w-8 rounded-lg text-steel-500 hover:bg-steel-200" aria-label="Ações">⋯</button>
                      {menu === p.id && <ActionsMenu items={actions(p)} buy={access.compras ? buyLink(p) : null} onClose={() => setMenu(null)} />}
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            {/* Celular: cards */}
            <ul className="md:hidden space-y-2">
              {list.slice(0, limit).map(p => (
                <li key={p.id} className={`card !p-4 ${p.active ? '' : 'opacity-50'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <button className="min-w-0 text-left" onClick={() => setEditing(p)}>
                      <div className="text-sm font-semibold">{p.name}</div>
                      <div className="text-xs text-steel-500 truncate">
                        {[p.code, p.supplier_id && supplierName.get(p.supplier_id)].filter(Boolean).join(' · ') || partCategory(p.category).label}
                      </div>
                      <Flags p={p} d={data} />
                      <VehicleLine list={vehicles.get(p.id)} universal={p.universal} />
                    </button>
                    <div className="text-right shrink-0">
                      <StockQty p={p} big />
                      <div className="text-xs text-steel-500">{fmtBRL(salePriceOf(p, margin))}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-3">
                    <button onClick={() => setMoving({ part: p, mode: 'entrada' })} className="flex-1 text-sm font-semibold py-2 rounded-xl bg-steel-100 text-steel-800">＋ Entrada</button>
                    <button onClick={() => setMoving({ part: p, mode: 'saida' })} className="flex-1 text-sm font-semibold py-2 rounded-xl bg-steel-100 text-steel-800">－ Saída</button>
                    {access.compras && (isBelowMin(p) || isZeroBought(p, data) || osShortage(p, data) > 0 || isNegative(p)) && (
                      <Link to={buyLink(p)} className="flex-1 text-center text-sm font-semibold py-2 rounded-xl bg-brand-600 text-white">Comprar</Link>
                    )}
                    <div className="relative">
                      <button onClick={() => setMenu(menu === p.id ? null : p.id)} className="h-9 w-10 rounded-xl bg-steel-100 text-steel-700" aria-label="Mais ações">⋯</button>
                      {menu === p.id && <ActionsMenu items={actions(p).slice(2)} buy={access.compras ? buyLink(p) : null} onClose={() => setMenu(null)} />}
                    </div>
                  </div>
                  <div className="text-[11px] text-steel-400 mt-2">Custo {fmtBRL(p.cost)} · última movimentação {ago(data.lastMove.get(p.id))}</div>
                </li>
              ))}
            </ul>

            {list.length > limit && (
              <button onClick={() => setLimit(l => l + PAGE)} className="w-full py-3 text-sm font-semibold text-brand-700 rounded-2xl border border-steel-200 bg-white hover:bg-steel-50">
                Mostrar mais ({list.length - limit} restantes)
              </button>
            )}
          </>
        )}
      </div>

      {editing && wid && margin != null && (
        <PartForm wid={wid} part={editing === 'new' ? null : editing} defaultMargin={margin}
          vehicles={editing === 'new' ? [] : vehicles.get(editing.id) ?? []} brandOptions={brandOptions} modelOptionsFor={modelOptionsFor}
          onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
      )}
      {bulk && wid && parts && (
        <BulkVehicleModal wid={wid} parts={parts.filter(p => p.active && !p.universal && !vehicles.get(p.id)?.length)}
          brandOptions={brandOptions} modelOptionsFor={modelOptionsFor} onClose={() => setBulk(false)} onSaved={load} />
      )}
      {pricing && wid && margin != null && (
        <div className="fixed inset-0 bg-steel-900/60 z-50 flex items-end sm:items-center justify-center sm:p-4" onClick={() => setPricing(false)}>
          <div onClick={e => e.stopPropagation()} className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl shadow-2xl p-2">
            <div className="flex justify-end"><button onClick={() => setPricing(false)} className="h-8 w-8 rounded-lg grid place-items-center text-steel-500 hover:bg-steel-100">✕</button></div>
            <DefaultMargin wid={wid} value={margin} onSaved={v => setMargin(v)} />
          </div>
        </div>
      )}
      {moving && (
        <StockMoveModal part={moving.part} mode={moving.mode} canBuy={access.compras}
          onClose={() => setMoving(null)} onSaved={() => { setMoving(null); load(); }} />
      )}
      {history && <StockHistoryModal part={history} onClose={() => setHistory(null)} />}
    </WorkshopLayout>
  );
}

function QuickChip({ on, warn, onClick, children }: { on: boolean; warn?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition ${on ? 'bg-steel-900 text-white border-steel-900'
        : warn ? 'bg-alert-50 text-alert-700 border-alert-200' : 'bg-white text-steel-600 border-steel-200 hover:border-steel-300'}`}>
      {children}
    </button>
  );
}

function StockQty({ p, big }: { p: WorkshopPart; big?: boolean }) {
  const bad = isNegative(p) || isBelowMin(p);
  return (
    <div>
      <span className={`${big ? 'text-lg' : 'text-sm'} font-bold ${bad ? 'text-alert-600' : Number(p.stock_qty) === 0 ? 'text-steel-400' : ''}`}>
        {fmtQty(p.stock_qty)} <span className="text-xs font-normal text-steel-400">{p.unit}</span>
      </span>
      {Number(p.min_qty) > 0 && <span className={`block text-[10px] ${isBelowMin(p) ? 'text-alert-600' : 'text-steel-400'}`}>mín. {fmtQty(p.min_qty)}</span>}
    </div>
  );
}

/** Selos curtos do que pede atenção na peça */
function Flags({ p, d }: { p: WorkshopPart; d: StockData }) {
  const f: { t: string; c: string }[] = [];
  const short = osShortage(p, d);
  if (short > 0) f.push({ t: `faltam ${fmtQty(short)} p/ OS`, c: 'bg-alert-50 text-alert-700' });
  if (isNegative(p)) f.push({ t: 'negativo', c: 'bg-alert-50 text-alert-700' });
  else if (isBelowMin(p)) f.push({ t: 'abaixo do mínimo', c: 'bg-pending-50 text-pending-800' });
  else if (isZeroBought(p, d)) f.push({ t: 'zerada', c: 'bg-steel-100 text-steel-600' });
  if (costToConfirm(p, d)) f.push({ t: 'custo a confirmar', c: 'bg-pending-50 text-pending-800' });
  if (!p.active) f.push({ t: 'desativada', c: 'bg-steel-100 text-steel-500' });
  if (!f.length) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-0.5">
      {f.map(x => <span key={x.t} className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${x.c}`}>{x.t}</span>)}
    </div>
  );
}

function ActionsMenu({ items, buy, onClose }: { items: { label: string; run: () => void }[]; buy: string | null; onClose: () => void }) {
  return (
    <>
      <div className="fixed inset-0 z-30" onClick={onClose} />
      <div className="absolute right-0 top-full mt-1 z-40 w-48 rounded-xl border border-steel-200 bg-white shadow-lg py-1 text-left">
        {items.map(i => (
          <button key={i.label} onClick={() => { onClose(); i.run(); }} className="block w-full text-left px-3 py-2 text-sm hover:bg-steel-50">{i.label}</button>
        ))}
        {buy && <Link to={buy} className="block px-3 py-2 text-sm font-semibold text-brand-700 hover:bg-steel-50 border-t border-steel-100">🧾 Comprar (lançar nota)</Link>}
      </div>
    </>
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

function VehicleLine({ list, universal }: { list: PartVehicle[] | undefined; universal?: boolean }) {
  if (universal) return <div className="text-[11px] text-steel-500">🌐 Universal</div>;
  if (!list?.length) return null;
  const shown = list.slice(0, 2).map(v => `${v.brand} ${v.model}${v.year_from != null || v.year_to != null ? ` ${fmtYears(v)}` : ''}`);
  return <div className="text-[11px] text-steel-500 truncate">🚗 {shown.join(', ')}{list.length > 2 ? ` +${list.length - 2}` : ''}</div>;
}

function PartForm({ wid, part, defaultMargin, vehicles, brandOptions, modelOptionsFor, onClose, onSaved }: {
  wid: string; part: WorkshopPart | null; defaultMargin: number; vehicles: PartVehicle[];
  brandOptions: string[]; modelOptionsFor: (brand: string) => string[]; onClose: () => void; onSaved: () => void;
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
  const [universal, setUniversal] = useState(part?.universal ?? false);
  const [vList, setVList]       = useState<VehicleDraft[]>(vehicles.map(v => ({ brand: v.brand, model: v.model, year_from: v.year_from, year_to: v.year_to })));
  const [nBrand, setNBrand]     = useState('');
  const [nModel, setNModel]     = useState('');
  const [nFrom, setNFrom]       = useState('');
  const [nTo, setNTo]           = useState('');

  const yearOrNull = (t: string) => (/^\d{4}$/.test(t.trim()) ? Number(t.trim()) : null);
  function addVehicle() {
    if (!nBrand.trim() || !nModel.trim()) return toast.error('Informe a marca e o modelo');
    const from = yearOrNull(nFrom); const to = yearOrNull(nTo);
    if ((nFrom.trim() && from == null) || (nTo.trim() && to == null)) return toast.error('Ano com 4 dígitos (ex.: 2012)');
    if (from != null && to != null && to < from) return toast.error('O ano final é menor que o inicial');
    setVList(l => [...l, { brand: nBrand.trim(), model: nModel.trim(), year_from: from, year_to: to }]);
    setNModel(''); setNFrom(''); setNTo('');
  }

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
      universal,
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
    // Veículo digitado e não adicionado: entra junto, para não perder o que a pessoa escreveu
    const pending: VehicleDraft[] = nBrand.trim() && nModel.trim()
      ? [{ brand: nBrand.trim(), model: nModel.trim(), year_from: yearOrNull(nFrom), year_to: yearOrNull(nTo) }] : [];
    const ev = await savePartVehicles(wid, (data as { id: string }).id, [...vList, ...pending]);
    if (ev) { setSaving(false); return toast.error('Peça salva, mas os veículos não: ' + ev.message); }
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
              <label className="label">🚗 Serve em (veículos)</label>
              <p className="text-[11px] text-steel-400">Marca e modelo. O ano é opcional: em branco = serve em qualquer ano.</p>
            </div>
            <label className="flex items-center gap-2 text-sm text-steel-700">
              <input type="checkbox" checked={universal} onChange={e => setUniversal(e.target.checked)} />
              Universal (serve em qualquer veículo: óleo, pneu, abraçadeira…)
            </label>
            {vList.length > 0 && (
              <ul className="flex flex-wrap gap-2">
                {vList.map((v, i) => (
                  <li key={i} className="flex items-center gap-1 text-xs bg-steel-100 rounded-full pl-3 pr-1 py-1">
                    {fmtVehicle(v)}
                    <button type="button" aria-label="Remover" onClick={() => setVList(l => l.filter((_, j) => j !== i))}
                      className="h-5 w-5 rounded-full grid place-items-center text-steel-500 hover:bg-steel-200">✕</button>
                  </li>
                ))}
              </ul>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-[1fr_1fr_72px_72px_auto] gap-2 items-center">
              <input className="input !py-2 text-sm" placeholder="Marca" list="pf-brands" value={nBrand} onChange={e => setNBrand(e.target.value)} />
              <input className="input !py-2 text-sm" placeholder="Modelo" list="pf-models" value={nModel} onChange={e => setNModel(e.target.value)} />
              <input className="input !py-2 text-sm" placeholder="De" inputMode="numeric" maxLength={4} value={nFrom} onChange={e => setNFrom(e.target.value.replace(/\D/g, ''))} />
              <input className="input !py-2 text-sm" placeholder="Até" inputMode="numeric" maxLength={4} value={nTo} onChange={e => setNTo(e.target.value.replace(/\D/g, ''))} />
              <button type="button" onClick={addVehicle} className="btn-ghost border border-steel-200 text-sm !py-2 col-span-2 sm:col-span-1">＋ Adicionar</button>
              <datalist id="pf-brands">{brandOptions.map(b => <option key={b} value={b} />)}</datalist>
              <datalist id="pf-models">{modelOptionsFor(nBrand).map(m => <option key={m} value={m} />)}</datalist>
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

/** Atribui veículo (ou "universal") a várias peças de uma vez, agrupando pelo rótulo entre parênteses do nome. */
function BulkVehicleModal({ wid, parts, brandOptions, modelOptionsFor, onClose, onSaved }: {
  wid: string; parts: WorkshopPart[]; brandOptions: string[]; modelOptionsFor: (brand: string) => string[];
  onClose: () => void; onSaved: () => Promise<void> | void;
}) {
  const groups = useMemo(() => {
    const m = new Map<string, { title: string; parts: WorkshopPart[] }>();
    for (const p of parts) {
      const l = partLabel(p.name);
      const k = l ? norm(l) : '';
      const g = m.get(k) ?? { title: l ?? '', parts: [] };
      g.parts.push(p);
      m.set(k, g);
    }
    return [...m.entries()].sort((a, b) => (a[0] === '' ? 1 : b[0] === '' ? -1 : b[1].parts.length - a[1].parts.length));
  }, [parts]);

  return (
    <div className="fixed inset-0 bg-steel-900/60 z-50 flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="bg-white w-full sm:max-w-2xl rounded-t-3xl sm:rounded-2xl max-h-[94vh] flex flex-col shadow-2xl">
        <div className="px-6 pt-5 pb-3 border-b border-steel-100 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold">Atribuir veículo em lote</h2>
            <p className="text-xs text-steel-500">Peças sem veículo agrupadas pelo que está entre parênteses no nome. Escolha o veículo uma vez e vale para o grupo todo.</p>
          </div>
          <button type="button" onClick={onClose} className="h-8 w-8 rounded-lg grid place-items-center text-steel-500 hover:bg-steel-100">✕</button>
        </div>
        <div className="px-6 py-4 space-y-3 overflow-y-auto">
          {groups.length === 0 && <p className="text-sm text-steel-500 text-center py-6">Todas as peças já têm veículo ou estão marcadas como universais 🎉</p>}
          {groups.map(([k, g]) => (
            <BulkGroup key={k || 'sem'} wid={wid} title={g.title} parts={g.parts} selectable={k === ''}
              brandOptions={brandOptions} modelOptionsFor={modelOptionsFor} onSaved={onSaved} />
          ))}
        </div>
      </div>
    </div>
  );
}

function BulkGroup({ wid, title, parts, selectable, brandOptions, modelOptionsFor, onSaved }: {
  wid: string; title: string; parts: WorkshopPart[]; selectable: boolean;
  brandOptions: string[]; modelOptionsFor: (brand: string) => string[]; onSaved: () => Promise<void> | void;
}) {
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [from, setFrom]   = useState('');
  const [to, setTo]       = useState('');
  const [open, setOpen]   = useState(selectable);
  const [sel, setSel]     = useState<Set<string>>(new Set());
  const [busy, setBusy]   = useState(false);
  const ids = selectable ? parts.filter(p => sel.has(p.id)).map(p => p.id) : parts.map(p => p.id);
  const yr = (t: string) => (/^\d{4}$/.test(t.trim()) ? Number(t.trim()) : null);

  async function run(kind: 'veiculo' | 'universal') {
    if (!ids.length) return toast.error('Marque ao menos uma peça');
    let err;
    setBusy(true);
    if (kind === 'universal') err = await markPartsUniversal(ids, true);
    else {
      if (!brand.trim() || !model.trim()) { setBusy(false); return toast.error('Informe a marca e o modelo'); }
      if ((from.trim() && yr(from) == null) || (to.trim() && yr(to) == null)) { setBusy(false); return toast.error('Ano com 4 dígitos (ex.: 2012)'); }
      err = await addVehicleToParts(wid, ids, { brand, model, year_from: yr(from), year_to: yr(to) });
    }
    setBusy(false);
    if (err) return toast.error('Não foi possível salvar: ' + err.message);
    toast.success(`${ids.length} peça${ids.length === 1 ? '' : 's'} atualizada${ids.length === 1 ? '' : 's'} ✓`);
    await onSaved();
  }

  return (
    <div className="rounded-2xl border border-steel-200 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-bold truncate">{title ? `“${title}”` : 'Sem nada entre parênteses'}</div>
          <div className="text-xs text-steel-500">{parts.length} peça{parts.length === 1 ? '' : 's'}{selectable ? ' — marque as que quer atribuir' : ''}</div>
        </div>
        <button type="button" onClick={() => setOpen(v => !v)} className="text-xs font-semibold text-brand-700 shrink-0">{open ? 'Ocultar peças' : 'Ver peças'}</button>
      </div>
      {open && (
        <ul className="max-h-40 overflow-y-auto text-xs divide-y divide-steel-100 rounded-xl bg-steel-50 px-3">
          {selectable && (
            <li className="py-1.5 flex gap-3">
              <button type="button" className="font-semibold text-brand-700" onClick={() => setSel(new Set(parts.map(p => p.id)))}>marcar todas</button>
              <button type="button" className="font-semibold text-steel-500" onClick={() => setSel(new Set())}>limpar</button>
            </li>
          )}
          {parts.map(p => (
            <li key={p.id} className="py-1.5">
              {selectable ? (
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={sel.has(p.id)} onChange={e => setSel(s => { const n = new Set(s); if (e.target.checked) n.add(p.id); else n.delete(p.id); return n; })} />
                  <span className="truncate">{p.name}</span>
                </label>
              ) : <span className="truncate block">{p.name}</span>}
            </li>
          ))}
        </ul>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-[1fr_1fr_64px_64px] gap-2">
        <input className="input !py-2 text-sm" placeholder="Marca" list="bk-brands" value={brand} onChange={e => setBrand(e.target.value)} />
        <input className="input !py-2 text-sm" placeholder="Modelo" list={`bk-models-${title}`} value={model} onChange={e => setModel(e.target.value)} />
        <input className="input !py-2 text-sm" placeholder="De" inputMode="numeric" maxLength={4} value={from} onChange={e => setFrom(e.target.value.replace(/\D/g, ''))} />
        <input className="input !py-2 text-sm" placeholder="Até" inputMode="numeric" maxLength={4} value={to} onChange={e => setTo(e.target.value.replace(/\D/g, ''))} />
        <datalist id="bk-brands">{brandOptions.map(b => <option key={b} value={b} />)}</datalist>
        <datalist id={`bk-models-${title}`}>{modelOptionsFor(brand).map(m => <option key={m} value={m} />)}</datalist>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={() => run('veiculo')} className="btn-primary text-sm !py-2">
          {busy ? 'Salvando…' : `Aplicar a ${ids.length} peça${ids.length === 1 ? '' : 's'}`}
        </button>
        <button type="button" disabled={busy} onClick={() => run('universal')} className="btn-ghost border border-steel-200 text-sm !py-2">🌐 Marcar como universal</button>
      </div>
    </div>
  );
}
