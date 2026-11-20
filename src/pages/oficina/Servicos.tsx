import { useCallback, useEffect, useMemo, useState } from 'react';
import WorkshopLayout from '@/components/layout/WorkshopLayout';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/components/ui/Toast';
import { canDo, useOperator } from '@/lib/operators';
import { fmtBRL, moneyInput, parseMoney } from '@/components/os/osHelpers';
import { useServiceCategories } from '@/lib/serviceCategories';
import CategoriesModal from '@/components/servicos/CategoriesModal';
import { COMMON_SERVICES, fmtMinutes, type WorkshopService } from '@/lib/services';
import { fmtDate } from '@/lib/purchasing';
import { DEFAULT_MARGIN, loadAllParts, loadMargins } from '@/lib/parts';
import QuickPartModal from '@/components/parts/QuickPartModal';
import { KitMoney, NewKitModal, PartSearch, kindOf, type KitCatPart } from '@/components/servicos/KitEditor';
import { planKitCopy } from '@/lib/kitCopy';
import {
  commonName, groupBy, loadServiceCharges, norm, vehicleLabel, type ServiceCharge,
} from '@/lib/servicePrices';
import { filterLabel, fmtLiters, fmtYearRange, loadSheet, partsForFilter, partsForFluid, searchTechVehicles, vehicleDetail, type TechVehicle } from '@/lib/techCatalog';

/** Serviço já lançado em OS mas que ainda não está na tabela */
type FromHistory = { name: string; price: number; uses: number };

export default function Servicos() {
  const { currentWorkshop } = useAuth();
  const wid = currentWorkshop?.id ?? null;
  const { balcao, session } = useOperator();
  const allowed = canDo(session, balcao, 'pecas_estoque');

  const [list, setList]       = useState<WorkshopService[] | null>(null);
  const [history, setHistory] = useState<FromHistory[]>([]);
  const [q, setQ]             = useState('');
  const [cat, setCat]         = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<WorkshopService | 'new' | null>(null);
  const [catsOpen, setCatsOpen] = useState(false);
  const categories = useServiceCategories(wid);
  const [busy, setBusy]       = useState(false);
  /** "Tabela" ou "Por veículo" (preços já cobrados em cada carro, vindos das OS) */
  const [tab, setTab]         = useState<'tabela' | 'veiculo' | 'kits'>('tabela');
  const [charges, setCharges] = useState<ServiceCharge[] | null>(null);

  // O histórico por veículo só é carregado quando alguém pede (aba ou ficha do serviço)
  const needCharges = tab === 'veiculo' || !!editing;
  useEffect(() => {
    if (!wid || !allowed || !needCharges || charges) return;
    loadServiceCharges(wid, { categories: true }).then(setCharges).catch(() => setCharges([]));
  }, [wid, allowed, needCharges, charges]);

  const load = useCallback(async () => {
    if (!wid) return;
    const [s, h] = await Promise.all([
      supabase.from('workshop_services').select('*').eq('workshop_id', wid).order('name'),
      supabase.from('service_order_items').select('description, unit_price, created_at')
        .eq('workshop_id', wid).eq('kind', 'labor').order('created_at', { ascending: false }).limit(2000),
    ]);
    const services = (s.data as WorkshopService[]) ?? [];
    setList(services);
    // Serviços que a oficina já cobrou nas OS (último preço) e ainda não estão na tabela
    const have = new Set(services.map(x => x.name.trim().toLowerCase()));
    const map = new Map<string, FromHistory>();
    for (const i of (h.data ?? []) as { description: string; unit_price: number }[]) {
      const k = i.description.trim().toLowerCase();
      if (!k || have.has(k)) continue;
      const e = map.get(k);
      if (e) e.uses++;
      else map.set(k, { name: i.description.trim(), price: Number(i.unit_price), uses: 1 });
    }
    setHistory([...map.values()].sort((a, b) => b.uses - a.uses));
  }, [wid]);

  useEffect(() => { if (allowed) load(); }, [load, allowed]);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (list ?? []).filter(s => (showInactive || s.active) && (!cat || (s.category ?? 'Outro') === cat)
      && (!t || s.name.toLowerCase().includes(t) || s.category?.toLowerCase().includes(t)));
  }, [list, q, cat, showInactive]);

  const cats = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of list ?? []) if (s.active) m.set(s.category ?? 'Outro', (m.get(s.category ?? 'Outro') ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [list]);
  const noPrice = (list ?? []).filter(s => s.active && !(Number(s.price) > 0)).length;
  const inactiveCount = (list ?? []).filter(s => !s.active).length;

  async function importHistory() {
    if (!wid || !history.length) return;
    if (!confirm(`Adicionar ${history.length} serviço${history.length === 1 ? '' : 's'} que você já lançou nas OS, com o último preço cobrado?`)) return;
    setBusy(true);
    const { error } = await supabase.from('workshop_services').insert(history.map(h => ({ workshop_id: wid, name: h.name, price: h.price })));
    setBusy(false);
    if (error) return toast.error('Não foi possível importar: ' + error.message);
    toast.success(`${history.length} serviço${history.length === 1 ? '' : 's'} adicionado${history.length === 1 ? '' : 's'} ✓`);
    load();
  }

  async function importCommon() {
    if (!wid) return;
    const have = new Set((list ?? []).map(x => x.name.trim().toLowerCase()));
    const rows = COMMON_SERVICES.filter(c => !have.has(c.name.toLowerCase()))
      .map(c => ({ workshop_id: wid, name: c.name, category: c.category, estimated_minutes: c.minutes, price: 0 }));
    if (!rows.length) return toast.info('Todos os serviços comuns já estão na sua tabela');
    setBusy(true);
    const { error } = await supabase.from('workshop_services').insert(rows);
    setBusy(false);
    if (error) return toast.error('Não foi possível adicionar: ' + error.message);
    toast.success(`${rows.length} serviços adicionados ✓`);
    load();
  }

  if (!allowed) {
    return (
      <WorkshopLayout>
        <div className="max-w-md mx-auto card text-center py-12">
          <div className="text-4xl mb-2">🔒</div>
          <h1 className="text-lg font-bold">Tabela de serviços restrita</h1>
          <p className="text-sm text-steel-500 mt-1">Peça ao gestor a permissão “Peças e estoque” em Acessos e funções.</p>
        </div>
      </WorkshopLayout>
    );
  }

  return (
    <WorkshopLayout>
      <div className="max-w-5xl mx-auto space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">🛠️ Tabela de serviços</h1>
            <p className="text-sm text-steel-500 mt-1">A mão de obra que a oficina cobra. Na OS, é só digitar o nome que o preço vem sozinho.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {history.length > 0 && (list?.length ?? 0) > 0 && (
              <button className="btn-ghost border border-steel-200 bg-white" onClick={importHistory} disabled={busy}>
                📥 Trazer das OS ({history.length})
              </button>
            )}
            <button className="btn-ghost border border-steel-200 bg-white" onClick={() => setCatsOpen(true)}>⚙️ Categorias</button>
            <button className="btn-primary" onClick={() => setEditing('new')}>+ Novo serviço</button>
          </div>
        </div>

        {list === null ? (
          <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-16 bg-white rounded-2xl animate-pulse" />)}</div>
        ) : list.length === 0 ? (
          <div className="card text-center py-10 space-y-4">
            <div className="text-4xl">🛠️</div>
            <div>
              <h2 className="text-lg font-bold">Monte a tabela de mão de obra da oficina</h2>
              <p className="text-sm text-steel-500 mt-1 max-w-lg mx-auto">
                Com a tabela pronta, o orçamento sai mais rápido e todo mundo cobra o mesmo preço pelo mesmo serviço.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 justify-center">
              {history.length > 0 && (
                <button className="btn-primary" onClick={importHistory} disabled={busy}>
                  📥 Trazer os {history.length} serviços que já lancei nas OS
                </button>
              )}
              <button className={history.length ? 'btn-ghost border border-steel-200' : 'btn-primary'} onClick={importCommon} disabled={busy}>
                📋 Começar com {COMMON_SERVICES.length} serviços comuns
              </button>
              <button className="btn-ghost border border-steel-200" onClick={() => setEditing('new')}>+ Cadastrar um por um</button>
            </div>
          </div>
        ) : (
          <>
            {noPrice > 0 && (
              <p className="text-xs text-steel-500">
                {noPrice} serviço{noPrice === 1 ? '' : 's'} sem preço fixo — o valor é colocado na OS, caso a caso.
                Se algum tem preço de tabela (ex.: alinhamento), coloque aqui que ele já vem preenchido.
              </p>
            )}

            <div className="inline-flex rounded-xl bg-steel-100 p-1">
              {([['tabela', '🛠️ Tabela de preços'], ['veiculo', '🚗 Histórico por veículo'], ['kits', '📦 Kits por modelo']] as const).map(([k, label]) => (
                <button key={k} onClick={() => setTab(k)}
                  className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition ${tab === k ? 'bg-white text-steel-900 shadow-sm' : 'text-steel-500 hover:text-steel-700'}`}>
                  {label}
                </button>
              ))}
            </div>

            {tab === 'kits' ? <KitsByModel wid={wid!} /> : tab === 'veiculo' ? <ByVehicle charges={charges} /> : <>
            <div className="flex flex-wrap items-center gap-3">
              <input className="input !w-auto flex-1 min-w-[220px]" placeholder="Buscar serviço"
                value={q} onChange={e => setQ(e.target.value)} />
              {inactiveCount > 0 && (
                <label className="text-sm text-steel-600 flex items-center gap-2">
                  <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} />
                  Mostrar desativados ({inactiveCount})
                </label>
              )}
            </div>

            {cats.length > 1 && (
              <div className="flex flex-wrap gap-2">
                <button onClick={() => setCat(null)}
                  className={`text-sm font-semibold px-3 py-1.5 rounded-full border transition ${cat === null ? 'bg-steel-900 text-white border-steel-900' : 'bg-white text-steel-600 border-steel-200'}`}>
                  Todos
                </button>
                {cats.map(([c, n]) => (
                  <button key={c} onClick={() => setCat(cat === c ? null : c)}
                    className={`text-sm font-semibold px-3 py-1.5 rounded-full border transition ${cat === c ? 'bg-steel-900 text-white border-steel-900' : 'bg-white text-steel-600 border-steel-200'}`}>
                    {c} <span className="opacity-60">({n})</span>
                  </button>
                ))}
              </div>
            )}

            {shown.length === 0 ? (
              <div className="card text-center py-8 text-sm text-steel-500">Nenhum serviço encontrado.</div>
            ) : (
              <div className="card !p-0 overflow-hidden">
                <div className="hidden md:grid grid-cols-12 gap-2 px-5 py-2 bg-steel-50 border-b border-steel-100 text-[10px] font-bold text-steel-500 uppercase tracking-wider">
                  <div className="col-span-6">Serviço</div>
                  <div className="col-span-2 text-right">Tempo estimado</div>
                  <div className="col-span-3 text-right">Preço</div>
                  <div className="col-span-1" />
                </div>
                <ul className="divide-y divide-steel-100">
                  {shown.map(s => (
                    <li key={s.id}>
                      <button onClick={() => setEditing(s)}
                        className={`w-full text-left px-5 py-3 grid grid-cols-12 gap-2 items-center hover:bg-steel-50 transition ${s.active ? '' : 'opacity-50'}`}>
                        <div className="col-span-12 md:col-span-6 min-w-0">
                          <div className="text-sm font-semibold truncate">{s.name}{!s.active && <span className="badge bg-steel-100 text-steel-500 ml-2">desativado</span>}</div>
                          <div className="text-xs text-steel-500">{s.category ?? 'Sem categoria'}</div>
                        </div>
                        <div className="col-span-6 md:col-span-2 text-sm md:text-right text-steel-600">⏱ {fmtMinutes(s.estimated_minutes)}</div>
                        <div className="col-span-6 md:col-span-3 text-right">
                          {Number(s.price) > 0
                            ? <span className="text-sm font-bold">{fmtBRL(Number(s.price))}</span>
                            : <span className="text-xs text-steel-400">preço na OS</span>}
                        </div>
                        <div className="hidden md:block col-span-1 text-right text-steel-300">›</div>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            </>}
          </>
        )}
      </div>

      {catsOpen && categories.ownerId && (
        <CategoriesModal ownerId={categories.ownerId} custom={categories.custom} cats={categories.cats}
          onClose={() => setCatsOpen(false)} onChanged={() => { categories.reload(); load(); }} />
      )}

      {editing && wid && (
        <ServiceForm wid={wid} categories={categories.names} service={editing === 'new' ? null : editing} charges={charges}
          onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
      )}
    </WorkshopLayout>
  );
}

function ServiceForm({ wid, categories, service, charges, onClose, onSaved }: {
  wid: string; categories: string[]; service: WorkshopService | null; charges: ServiceCharge[] | null; onClose: () => void; onSaved: () => void;
}) {
  const [name, setName]         = useState(service?.name ?? '');
  const [category, setCategory] = useState(service?.category ?? '');
  const [price, setPrice]       = useState(service && Number(service.price) > 0 ? moneyInput(Number(service.price)) : '');
  const [hours, setHours]       = useState(service?.estimated_minutes ? String(Math.floor(service.estimated_minutes / 60)) : '');
  const [mins, setMins]         = useState(service?.estimated_minutes ? String(service.estimated_minutes % 60) : '');
  const [active, setActive]     = useState(service?.active ?? true);
  const [levaPeca, setLevaPeca] = useState<boolean | null>(service ? !!service.leva_peca : null);
  const [saving, setSaving]     = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return toast.error('Informe o nome do serviço');
    if (levaPeca == null) return toast.error('Escolha se o serviço leva peça ou é só mão de obra');
    const p = price.trim() ? parseMoney(price) : 0;
    if (!Number.isFinite(p) || p < 0) return toast.error('Preço inválido');
    const total = (parseInt(hours || '0', 10) || 0) * 60 + (parseInt(mins || '0', 10) || 0);
    const row = {
      workshop_id: wid, name: name.trim(), category: category || null, price: p,
      estimated_minutes: total > 0 ? total : null, active, leva_peca: levaPeca,
    };
    setSaving(true);
    const { error } = service
      ? await supabase.from('workshop_services').update(row).eq('id', service.id)
      : await supabase.from('workshop_services').insert(row);
    setSaving(false);
    if (error) {
      return toast.error(error.code === '23505' ? 'Já existe um serviço com esse nome' : 'Não foi possível salvar: ' + error.message);
    }
    toast.success(service ? 'Serviço atualizado ✓' : 'Serviço cadastrado ✓');
    onSaved();
  }

  return (
    <div className="fixed inset-0 bg-steel-900/60 z-50 flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
      <form onSubmit={save} onClick={e => e.stopPropagation()}
        className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl max-h-[94vh] flex flex-col shadow-2xl">
        <div className="px-6 pt-5 pb-3 border-b border-steel-100 flex items-center justify-between">
          <h2 className="text-lg font-bold">{service ? 'Editar serviço' : 'Novo serviço'}</h2>
          <button type="button" onClick={onClose} className="h-8 w-8 rounded-lg grid place-items-center text-steel-500 hover:bg-steel-100">✕</button>
        </div>
        <div className="px-6 py-4 space-y-4 overflow-y-auto">
          <div>
            <label className="label">Nome do serviço *</label>
            <input className="input" autoFocus placeholder="Ex.: Troca de pastilhas dianteiras" value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div>
            <label className="label">Categoria</label>
            <select className="input" value={category} onChange={e => setCategory(e.target.value)}>
              <option value="">— Sem categoria —</option>
              {(service?.category && !categories.includes(service.category) ? [...categories, service.category] : categories).map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Preço (opcional)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-steel-400 text-sm">R$</span>
                <input className="input !pl-9 text-right" inputMode="decimal" placeholder="0,00" value={price}
                  onChange={e => setPrice(e.target.value)}
                  onBlur={e => { const v = parseMoney(e.target.value); if (Number.isFinite(v)) setPrice(moneyInput(v)); }} />
              </div>
            </div>
            <div>
              <label className="label">Tempo estimado</label>
              <div className="flex items-center gap-1">
                <input className="input text-right !px-2" inputMode="numeric" placeholder="0" value={hours} onChange={e => setHours(e.target.value.replace(/\D/g, ''))} />
                <span className="text-xs text-steel-500">h</span>
                <input className="input text-right !px-2" inputMode="numeric" placeholder="0" value={mins} onChange={e => setMins(e.target.value.replace(/\D/g, '').slice(0, 2))} />
                <span className="text-xs text-steel-500">min</span>
              </div>
            </div>
          </div>
          <p className="text-[11px] text-steel-400">Opcional. Se o preço varia de carro para carro, deixe vazio e coloque na OS. Se tiver preço, ele vem sugerido na OS e dá para mudar lá.</p>
          <div>
            <label className="label">Este serviço usa peça?</label>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setLevaPeca(true)}
                className={`min-h-[44px] rounded-xl border text-sm font-semibold ${levaPeca ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-steel-200 text-steel-600'}`}>
                🔩 Leva peça
              </button>
              <button type="button" onClick={() => setLevaPeca(false)}
                className={`min-h-[44px] rounded-xl border text-sm font-semibold ${levaPeca === false ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-steel-200 text-steel-600'}`}>
                🔧 Só mão de obra
              </button>
            </div>
            <p className="text-[11px] text-steel-400 mt-1">
              {levaPeca == null ? 'Escolha uma das opções.' : levaPeca
                ? 'A OS só conclui com a peça lançada dentro deste serviço (com o custo), ou com "Cliente trouxe a peça".'
                : 'Serviço sem peça (ex.: alinhamento, diagnóstico). Comissão de mão de obra.'}
            </p>
          </div>
          {service && <ServiceKit wid={wid} service={service} />}
          {service && <PricesByVehicle service={service} charges={charges} />}
          {service && (
            <label className="flex items-center gap-2 text-sm text-steel-700">
              <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} />
              Serviço ativo (desmarque para não aparecer mais na OS)
            </label>
          )}
        </div>
        <div className="px-6 py-4 border-t border-steel-100 flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
          <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Salvando…' : service ? 'Salvar' : 'Cadastrar serviço'}</button>
        </div>
      </form>
    </div>
  );
}


const fmtRange = (min: number, max: number) => (min === max ? fmtBRL(min) : `${fmtBRL(min)} – ${fmtBRL(max)}`);

/** Na ficha do serviço: quanto já foi cobrado em cada modelo de veículo */
function PricesByVehicle({ service, charges }: { service: WorkshopService; charges: ServiceCharge[] | null }) {
  const [all, setAll] = useState(false);
  const rows = useMemo(() => {
    if (!charges) return [];
    const k = norm(service.name);
    let mine = charges.filter(c => c.key === k);
    if (!mine.length && k.length >= 4) mine = charges.filter(c => c.key.includes(k) || k.includes(c.key));
    return groupBy(mine, c => c.vehicleKey);
  }, [charges, service.name]);

  return (
    <div className="rounded-xl border border-steel-200">
      <div className="px-3 py-2 border-b border-steel-100 text-xs font-bold text-steel-600">🚗 Já cobrado por veículo</div>
      {charges === null ? (
        <p className="px-3 py-3 text-xs text-steel-400">Carregando histórico…</p>
      ) : rows.length === 0 ? (
        <p className="px-3 py-3 text-xs text-steel-400">Esse serviço ainda não foi lançado em OS com veículo.</p>
      ) : (
        <>
          <ul className="divide-y divide-steel-100 max-h-56 overflow-y-auto">
            {(all ? rows : rows.slice(0, 6)).map(r => (
              <li key={r.key} className="px-3 py-2 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate">{commonName(r.items, c => vehicleLabel({ ...c, year: null }))}</div>
                  <div className="text-[11px] text-steel-500">{r.sum.count}× · último em {fmtDate(r.sum.lastDate.slice(0, 10))}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-bold">{fmtBRL(r.sum.last)}</div>
                  {r.sum.min !== r.sum.max && <div className="text-[11px] text-steel-500">{fmtRange(r.sum.min, r.sum.max)}</div>}
                </div>
              </li>
            ))}
          </ul>
          {rows.length > 6 && (
            <button type="button" onClick={() => setAll(v => !v)} className="w-full px-3 py-2 text-xs font-semibold text-brand-600 border-t border-steel-100">
              {all ? 'Mostrar menos' : `Ver todos os ${rows.length} modelos`}
            </button>
          )}
        </>
      )}
    </div>
  );
}

/** Faixa de preço do serviço neste veículo: ponto = último valor cobrado */
type KitListRow = {
  id: string; service_id: string; description: string; quantity: number; position: number; part_id: string | null;
  vehicle_engine?: string | null;
  vehicle_make: string | null; vehicle_model: string | null; year_from: number | null; year_to: number | null;
  workshop_services: { name: string; category: string | null; price?: number | null } | null;
};

/** Todos os kits criados, agrupados por marca → modelo → serviço, para acompanhar o que já foi montado */
function KitsByModel({ wid }: { wid: string }) {
  const [rows, setRows] = useState<KitListRow[] | null>(null);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [cat, setCat] = useState<string | null>(null);
  const [fMake, setFMake] = useState('');
  const [fModel, setFModel] = useState('');
  const [sure, setSure] = useState<string | null>(null);
  /** Peças do cadastro (para trocar/incluir peça no kit) */
  const [catalog, setCatalog] = useState<KitCatPart[]>([]);
  /** Peça do kit sendo trocada */
  const [swap, setSwap] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    loadAllParts<KitCatPart>(wid, 'id, name, code, cost, stock_qty, category, subcategory').then(setCatalog).catch(() => setCatalog([]));
  }, [wid]);

  useEffect(() => {
    let live = true;
    (async () => {
      const all: KitListRow[] = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase.from('workshop_service_parts')
          .select('id, service_id, description, quantity, position, part_id, vehicle_make, vehicle_model, vehicle_engine, year_from, year_to, workshop_services(name, category, price)')
          .eq('workshop_id', wid).order('position').range(from, from + 999);
        if (error) { toast.error('Não foi possível carregar os kits: ' + error.message); break; }
        all.push(...((data ?? []) as unknown as KitListRow[]));
        if ((data ?? []).length < 1000) break;
      }
      if (live) setRows(all);
    })();
    return () => { live = false; };
  }, [wid, nonce]);

  const tree = useMemo(() => {
    const t = norm(q);
    const makes = new Map<string, Map<string, Map<string, KitListRow[]>>>();
    for (const r of rows ?? []) {
      const make = r.vehicle_model ? (r.vehicle_make?.trim() || 'Sem marca') : 'Kit geral (qualquer carro)';
      const model = r.vehicle_model?.trim() || 'Todos os modelos';
      const svc = `${r.workshop_services?.name ?? 'Serviço'}${r.vehicle_engine ? ` · motor ${r.vehicle_engine}` : ''}`;
      if (cat && (r.workshop_services?.category ?? 'Outro') !== cat) continue;
      if (fMake && make !== fMake) continue;
      if (fModel && model !== fModel) continue;
      if (t && !norm(`${make} ${model} ${svc} ${r.description}`).includes(t)) continue;
      const mm = makes.get(make) ?? new Map(); makes.set(make, mm);
      const sm = mm.get(model) ?? new Map(); mm.set(model, sm);
      sm.set(svc, [...(sm.get(svc) ?? []), r]);
    }
    return [...makes.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [rows, q, cat, fMake, fModel]);

  // Marcas e modelos que têm kit (para os seletores)
  const makeOpts = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const r of rows ?? []) {
      const make = r.vehicle_model ? (r.vehicle_make?.trim() || 'Sem marca') : 'Kit geral (qualquer carro)';
      const model = r.vehicle_model?.trim() || 'Todos os modelos';
      m.set(make, (m.get(make) ?? new Set()).add(model));
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'));
  }, [rows]);
  const picked = !!(fMake || q.trim() || cat);

  const cats = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows ?? []) { const c = r.workshop_services?.category ?? 'Outro'; m.set(c, (m.get(c) ?? 0) + 1); }
    return [...m.keys()].sort((a, b) => a.localeCompare(b));
  }, [rows]);

  async function setQty(r: KitListRow, v: string) {
    const n = parseMoney(v);
    if (!Number.isFinite(n) || n <= 0 || n === Number(r.quantity)) return;
    const { error } = await supabase.from('workshop_service_parts').update({ quantity: n }).eq('id', r.id);
    if (error) return toast.error('Não foi possível salvar: ' + error.message);
    setRows(xs => (xs ?? []).map(x => x.id === r.id ? { ...x, quantity: n } : x));
  }
  /** Troca a peça do kit: do cadastro (vincula custo/estoque) ou texto livre */
  async function replacePart(r: KitListRow, description: string, part_id: string | null) {
    const d = description.trim();
    if (!d) return;
    const { error } = await supabase.from('workshop_service_parts').update({ description: d, part_id }).eq('id', r.id);
    if (error) return toast.error('Não foi possível trocar: ' + error.message);
    setRows(xs => (xs ?? []).map(x => x.id === r.id ? { ...x, description: d, part_id } : x));
    setSwap(null);
    toast.success('Peça trocada ✓');
  }
  async function removeParts(ids: string[]) {
    const { error } = await supabase.from('workshop_service_parts').delete().in('id', ids);
    if (error) return toast.error('Não foi possível remover: ' + error.message);
    setRows(xs => (xs ?? []).filter(x => !ids.includes(x.id)));
  }
  async function addPart(base: KitListRow, text: string, part_id: string | null = null) {
    const d = text.trim();
    if (!d) return;
    const { data, error } = await supabase.from('workshop_service_parts').insert({
      workshop_id: wid, service_id: base.service_id, description: d, quantity: 1, part_id, position: 999,
      vehicle_model: base.vehicle_model, vehicle_make: base.vehicle_make, vehicle_engine: base.vehicle_engine ?? null, year_from: base.year_from, year_to: base.year_to,
      tech_vehicle_id: null,
    }).select('id, service_id, description, quantity, position, part_id, vehicle_make, vehicle_model, vehicle_engine, year_from, year_to').single();
    if (error) return toast.error('Não foi possível adicionar: ' + error.message);
    setRows(xs => [...(xs ?? []), { ...(data as unknown as KitListRow), workshop_services: base.workshop_services }]);
  }

  if (rows === null) return <div className="text-sm text-steel-500 py-6">Carregando kits…</div>;
  const totalKits = tree.reduce((n, [, mm]) => n + [...mm.values()].reduce((m, sm) => m + sm.size, 0), 0);
  const toggle = (k: string) => setOpen(s => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input className="input !w-auto flex-1 min-w-[220px]" placeholder="Buscar marca, modelo, serviço ou peça"
          value={q} onChange={e => setQ(e.target.value)} />
        <span className="text-sm text-steel-500">{totalKits} kit{totalKits === 1 ? '' : 's'} em {tree.length} marca{tree.length === 1 ? '' : 's'}</span>
        <button type="button" className="btn-primary" onClick={() => setCreating(true)}>＋ Novo kit</button>
      </div>
      {creating && <NewKitModal wid={wid} parts={catalog} onClose={() => setCreating(false)}
        onSaved={() => { setCreating(false); setNonce(n => n + 1); }} />}
      <div className="flex flex-wrap items-center gap-2">
        <select className="input !w-auto min-w-[12rem]" value={fMake} aria-label="Marca"
          onChange={e => { setFMake(e.target.value); setFModel(''); }}>
          <option value="">Marca…</option>
          {makeOpts.map(([m, models]) => <option key={m} value={m}>{m} ({models.size})</option>)}
        </select>
        <select className="input !w-auto min-w-[12rem] disabled:bg-steel-50 disabled:text-steel-400" value={fModel} disabled={!fMake} aria-label="Modelo"
          onChange={e => setFModel(e.target.value)}>
          <option value="">{fMake ? 'Todos os modelos' : 'Escolha a marca antes'}</option>
          {[...(makeOpts.find(([m]) => m === fMake)?.[1] ?? [])].sort((a, b) => a.localeCompare(b, 'pt-BR')).map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        {(fMake || fModel) && <button type="button" className="text-xs font-semibold text-brand-700 hover:underline" onClick={() => { setFMake(''); setFModel(''); }}>limpar</button>}
      </div>
      {cats.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {[null, ...cats].map(c => (
            <button key={c ?? 'all'} type="button" onClick={() => setCat(c)}
              className={`px-3 py-1 rounded-full text-xs font-semibold border ${cat === c ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-steel-600 border-steel-200 hover:border-steel-400'}`}>
              {c ?? 'Todas as categorias'}
            </button>
          ))}
        </div>
      )}
      {!picked && (rows?.length ?? 0) > 0 && (
        <div className="card p-6 text-sm text-steel-600">Escolha a marca e o modelo (ou busque pelo nome) para ver os kits.</div>
      )}
      {picked && tree.length === 0 && (
        <div className="card p-6 text-sm text-steel-600">
          Nenhum kit ainda. Ao salvar uma OS com peças dentro de um serviço, o sistema pergunta se você quer criar o kit.
        </div>
      )}
      {picked && tree.map(([make, models]) => (
        <section key={make} className="card overflow-hidden">
          <h3 className="px-4 py-2.5 bg-steel-50 border-b border-steel-100 font-bold text-steel-900">
            {make} <span className="font-normal text-steel-500 text-sm">· {models.size} modelo{models.size === 1 ? '' : 's'}</span>
          </h3>
          <div className="divide-y divide-steel-100">
            {[...models.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([model, svcs]) => (
              <div key={model} className="px-4 py-3">
                <div className="font-semibold text-steel-800">{model} <span className="font-normal text-xs text-steel-500">· {svcs.size} kit{svcs.size === 1 ? '' : 's'}</span></div>
                <div className="mt-2 space-y-1.5">
                  {[...svcs.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([svc, parts]) => {
                    const k = `${make}|${model}|${svc}`;
                    const years = fmtYearRange(parts[0]) || null;
                    return (
                      <div key={k} className="rounded-lg border border-steel-200">
                        <button type="button" onClick={() => toggle(k)} className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-sm">
                          <span className="font-medium text-steel-900">{svc}{parts[0].workshop_services?.category && <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-wide text-steel-500 bg-steel-100 rounded px-1.5 py-0.5">{parts[0].workshop_services.category}</span>}{years && <span className="text-xs text-steel-500"> · {years}</span>}</span>
                          <span className="text-xs text-steel-500 shrink-0">{parts.length} peça{parts.length === 1 ? '' : 's'} {open.has(k) ? '▲' : '▼'}</span>
                        </button>
                        <div className="px-3 pb-2 -mt-1">
                          <KitMoney items={parts.map(x => ({ part_id: x.part_id, quantity: Number(x.quantity) }))} parts={catalog}
                            servicePrice={parts[0].workshop_services?.price ?? null} />
                        </div>
                        {open.has(k) && (
                          <div className="px-3 pb-3 space-y-1.5">
                            {parts.map(p => {
                              const cp = p.part_id ? catalog.find(c => c.id === p.part_id) : undefined;
                              return (
                                <div key={p.id} className="flex items-center gap-2">
                                  <input className="input !py-1.5 text-sm w-16 text-center shrink-0" defaultValue={String(Number(p.quantity)).replace('.', ',')}
                                    onBlur={e => setQty(p, e.target.value)} aria-label="Quantidade" />
                                  {swap === p.id ? (
                                    <PartSearch parts={catalog} model={p.vehicle_model} like={kindOf(catalog, p.description, p.part_id)} autoFocus placeholder={`Trocar “${p.description}” por… (ou digite para buscar)`}
                                      onPick={c => replacePart(p, c.name, c.id)} onText={t => replacePart(p, t, null)} onCancel={() => setSwap(null)} />
                                  ) : (
                                    <div className="flex-1 min-w-0 px-3 py-1.5 rounded-xl border border-steel-200 text-sm">
                                      <span className="block truncate text-steel-900">{p.description}</span>
                                      <span className={`block text-[11px] ${p.part_id ? 'text-steel-500' : 'text-pending-700'}`}>
                                        {p.part_id
                                          ? [cp?.code ? `cód. ${cp.code}` : null, cp?.cost != null ? `custo ${fmtBRL(Number(cp.cost))}` : null, cp ? `${Number(cp.stock_qty ?? 0)} em estoque` : 'do cadastro'].filter(Boolean).join(' · ')
                                          : 'sem cadastro: toque em Trocar para escolher a peça'}
                                      </span>
                                    </div>
                                  )}
                                  {swap === p.id
                                    ? <button type="button" className="text-xs font-semibold text-steel-500 hover:underline px-1" onClick={() => setSwap(null)}>Cancelar</button>
                                    : <button type="button" className="text-xs font-semibold text-brand-700 hover:underline px-1" onClick={() => setSwap(p.id)}>Trocar</button>}
                                  <button type="button" className="text-steel-400 hover:text-red-600 px-1" title="Tirar a peça do kit"
                                    onClick={() => removeParts([p.id])}>✕</button>
                                </div>
                              );
                            })}
                            <div className="flex items-center gap-2 pt-1">
                              <PartSearch parts={catalog} model={parts[0].vehicle_model} placeholder="＋ Adicionar peça ao kit (buscar no cadastro)"
                                onPick={c => addPart(parts[0], c.name, c.id)} onText={t => addPart(parts[0], t, null)} />
                            </div>
                            <div className="pt-1 text-right">
                              {sure === k
                                ? <span className="text-xs">Excluir este kit inteiro?{' '}
                                    <button type="button" className="font-bold text-red-600 hover:underline" onClick={() => { removeParts(parts.map(p => p.id)); setSure(null); }}>Sim, excluir</button>{' · '}
                                    <button type="button" className="text-steel-500 hover:underline" onClick={() => setSure(null)}>Não</button></span>
                                : <button type="button" className="text-xs text-steel-500 hover:text-red-600 hover:underline" onClick={() => setSure(k)}>Excluir kit</button>}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function PriceBar({ min, max, last }: { min: number; max: number; last: number }) {
  if (min === max) return <span className="text-[11px] text-steel-400">preço fixo</span>;
  const pos = Math.min(100, Math.max(0, ((last - min) / (max - min)) * 100));
  return (
    <div className="w-full max-w-[150px] ml-auto" title={`De ${fmtBRL(min)} a ${fmtBRL(max)} · último ${fmtBRL(last)}`}>
      <div className="relative h-1.5 rounded-full bg-steel-200">
        <div className="absolute inset-y-0 left-0 right-0 rounded-full bg-brand-100" />
        <div className="absolute top-1/2 h-3 w-3 -translate-y-1/2 -translate-x-1/2 rounded-full bg-brand-600 ring-2 ring-white" style={{ left: `${pos}%` }} />
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-steel-400"><span>{fmtBRL(min)}</span><span>{fmtBRL(max)}</span></div>
    </div>
  );
}

type Sel = { kind: 'model'; key: string; label: string } | { kind: 'plate'; plate: string; label: string };
type SortBy = 'vezes' | 'preco' | 'recente';

/** Aba "Por veículo": escolhe o carro e vê o que já foi feito nele e por quanto */
function ByVehicle({ charges }: { charges: ServiceCharge[] | null }) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<Sel | null>(null);
  const [focus, setFocus] = useState(false);
  const [hi, setHi] = useState(0);
  const [year, setYear] = useState<number | null>(null);
  const [sort, setSort] = useState<SortBy>('vezes');
  const [sq, setSq] = useState('');
  const [cat, setCat] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  // Modelos e placas conhecidos (vêm das OS)
  const models = useMemo(() => groupBy(charges ?? [], c => c.vehicleKey).map(g => ({
    key: g.key, label: commonName(g.items, c => vehicleLabel({ ...c, year: null })),
    os: new Set(g.items.map(i => i.osId)).size,
  })).sort((a, b) => b.os - a.os), [charges]);
  const plates = useMemo(() => {
    const m = new Map<string, { plate: string; label: string; os: Set<string> }>();
    for (const c of charges ?? []) {
      if (!c.plate) continue;
      const k = norm(c.plate), e = m.get(k);
      if (e) e.os.add(c.osId); else m.set(k, { plate: c.plate, label: vehicleLabel(c), os: new Set([c.osId]) });
    }
    return [...m.entries()].map(([k, v]) => ({ k, plate: v.plate, label: v.label, os: v.os.size }));
  }, [charges]);

  // "gol 2015": o ano vira filtro, o resto procura o modelo
  const terms = norm(q).split(' ').filter(Boolean);
  const yearTerm = terms.find(t => /^(19|20)\d{2}$/.test(t));
  const words = terms.filter(t => t !== yearTerm);
  const sugs = useMemo(() => {
    if (!words.length && !yearTerm) return [];
    const ms = words.length ? models.filter(m => words.every(t => m.key.includes(t))).slice(0, 6) : [];
    const ps = words.length ? plates.filter(p => words.every(t => p.k.includes(t))).slice(0, 3) : [];
    return [
      ...ms.map(m => ({ id: `m-${m.key}`, sel: { kind: 'model', key: m.key, label: m.label } as Sel, title: m.label, sub: `${m.os} OS` })),
      ...ps.map(p => ({ id: `p-${p.k}`, sel: { kind: 'plate', plate: p.plate, label: `${p.label} · ${p.plate}` } as Sel, title: p.plate, sub: `${p.label} · ${p.os} OS` })),
    ];
  }, [models, plates, q]);  // eslint-disable-line react-hooks/exhaustive-deps

  function pick(i: number) {
    const s = sugs[i];
    if (!s) return;
    setSel(s.sel); setYear(yearTerm ? Number(yearTerm) : null); setQ(''); setSq(''); setCat(null); setOpen(null); setFocus(false);
  }
  function clear() { setSel(null); setYear(null); setSq(''); setCat(null); setOpen(null); setQ(''); }

  // Tudo do veículo escolhido, depois ano e serviço
  const base = useMemo(() => !sel || !charges ? [] : charges.filter(c => sel.kind === 'model' ? c.vehicleKey === sel.key : norm(c.plate) === norm(sel.plate)), [charges, sel]);
  const years = useMemo(() => {
    const m = new Map<number, Set<string>>();
    for (const c of base) if (c.year) (m.get(c.year) ?? m.set(c.year, new Set()).get(c.year)!).add(c.osId);
    return [...m.entries()].sort((a, b) => b[0] - a[0]).map(([y, s]) => ({ y, n: s.size }));
  }, [base]);
  const found = useMemo(() => {
    const st = norm(sq);
    return base.filter(c => (!year || c.year === year) && (!st || c.key.includes(st)));
  }, [base, year, sq]);
  // Categorias do que foi feito neste veículo (com quantos serviços diferentes em cada)
  const cats = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const c of found) (m.get(c.category) ?? m.set(c.category, new Set()).get(c.category)!).add(c.key);
    return [...m.entries()].map(([name, s]) => ({ name, n: s.size }))
      .sort((a, b) => Number(a.name === 'Outro') - Number(b.name === 'Outro') || b.n - a.n);
  }, [found]);
  const shown = useMemo(() => (cat ? found.filter(c => c.category === cat) : found), [found, cat]);
  const groups = useMemo(() => {
    const g = groupBy(shown, c => c.key);
    if (sort === 'preco') g.sort((a, b) => b.sum.last - a.sum.last);
    else if (sort === 'recente') g.sort((a, b) => b.sum.lastDate.localeCompare(a.sum.lastDate));
    return g;
  }, [shown, sort]);
  // Com "Todas" escolhida, a lista sai separada por categoria (a que tem mais serviços primeiro)
  const sections = useMemo(() => {
    const m = new Map<string, typeof groups>();
    for (const g of groups) (m.get(g.items[0].category) ?? m.set(g.items[0].category, []).get(g.items[0].category)!).push(g);
    return [...m.entries()].sort((a, b) => Number(a[0] === 'Outro') - Number(b[0] === 'Outro') || b[1].length - a[1].length);
  }, [groups]);
  const stats = useMemo(() => ({
    os: new Set(found.map(c => c.osId)).size,
    last: found.reduce((m, c) => (c.date > m ? c.date : m), ''),
  }), [found]);

  if (charges === null) return <div className="h-40 bg-white rounded-2xl animate-pulse" />;
  if (charges.length === 0) {
    return <div className="card text-center py-8 text-sm text-steel-500">Ainda não há serviços lançados em OS com veículo — conforme as OS forem feitas, o histórico por carro aparece aqui.</div>;
  }

  const row = (g: (typeof groups)[number]) => (
    <li key={g.key}>
                    <button onClick={() => setOpen(open === g.key ? null : g.key)}
                      className="w-full text-left px-5 py-3 grid grid-cols-12 gap-x-3 gap-y-1 items-center hover:bg-steel-50 transition">
                      <div className="col-span-9 md:col-span-5 min-w-0">
                        <div className="text-sm font-semibold text-steel-900 truncate">{commonName(g.items, c => c.service)}</div>
                        <div className="text-[11px] text-steel-500 md:hidden">{g.sum.count}× · {fmtDate(g.sum.lastDate.slice(0, 10))}</div>
                      </div>
                      <div className="hidden md:block col-span-1 text-center text-sm text-steel-600">{g.sum.count}×</div>
                      <div className="col-span-3 md:col-span-2 text-right text-base font-bold text-steel-900">{fmtBRL(g.sum.last)}</div>
                      <div className="col-span-12 md:col-span-2 md:text-right"><PriceBar min={g.sum.min} max={g.sum.max} last={g.sum.last} /></div>
                      <div className="hidden md:flex col-span-2 items-center justify-end gap-2 text-xs text-steel-500">
                        {fmtDate(g.sum.lastDate.slice(0, 10))}<span className="text-steel-300">{open === g.key ? '▾' : '›'}</span>
                      </div>
                    </button>
                    {open === g.key && (
                      <ul className="bg-steel-50 px-5 py-2 divide-y divide-steel-100 text-sm">
                        {[...g.items].sort((a, b) => b.date.localeCompare(a.date)).map((c, i) => (
                          <li key={`${c.osId}-${i}`} className="py-1.5 flex items-center justify-between gap-3">
                            <span className="min-w-0 truncate">
                              {vehicleLabel(c)}{c.plate ? ` · ${c.plate}` : ''}
                              <span className="text-steel-400"> · {fmtDate(c.date.slice(0, 10))}{c.osNumber ? ` · OS ${c.osNumber}` : ''}</span>
                            </span>
                            <strong className="shrink-0">{fmtBRL(c.price)}</strong>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
  );

  return (
    <div className="space-y-4">
      {!sel ? (
        <>
          {/* Busca com sugestões */}
          <div className="relative">
            <div className="flex items-center gap-3 rounded-2xl border border-steel-200 bg-white px-4 py-3 shadow-sm focus-within:border-brand-400 focus-within:ring-4 focus-within:ring-brand-100 transition">
              <span className="text-lg text-steel-400" aria-hidden>🔎</span>
              <input className="flex-1 min-w-0 bg-transparent outline-none text-base placeholder:text-steel-400"
                placeholder="Qual veículo? Ex.: Gol, Civic 2015 ou a placa"
                value={q} autoComplete="off" spellCheck={false}
                onChange={e => { setQ(e.target.value); setHi(0); setFocus(true); }}
                onFocus={() => setFocus(true)} onBlur={() => setTimeout(() => setFocus(false), 120)}
                onKeyDown={e => {
                  if (e.key === 'ArrowDown') { e.preventDefault(); setHi(h => Math.min(h + 1, sugs.length - 1)); }
                  else if (e.key === 'ArrowUp') { e.preventDefault(); setHi(h => Math.max(h - 1, 0)); }
                  else if (e.key === 'Enter') { e.preventDefault(); pick(hi); }
                  else if (e.key === 'Escape') setFocus(false);
                }} />
              {q && <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => setQ('')} className="h-6 w-6 rounded-full grid place-items-center text-steel-400 hover:bg-steel-100" aria-label="Limpar">✕</button>}
            </div>
            {focus && q.trim() && (
              <div className="absolute z-20 left-0 right-0 mt-2 rounded-2xl border border-steel-200 bg-white shadow-xl overflow-hidden">
                {sugs.length === 0 ? (
                  <div className="px-4 py-3 text-sm text-steel-500">Nenhum veículo com “{q.trim()}” nas OS.</div>
                ) : sugs.map((s, i) => (
                  <button key={s.id} type="button" onMouseDown={e => e.preventDefault()} onMouseEnter={() => setHi(i)} onClick={() => pick(i)}
                    className={`w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left transition ${i === hi ? 'bg-brand-50' : ''}`}>
                    <span className="min-w-0 truncate"><span className="mr-2">{s.sel.kind === 'plate' ? '🔖' : '🚗'}</span><span className="font-semibold text-steel-900">{s.title}</span>
                      {s.sel.kind === 'plate' && <span className="text-sm text-steel-500"> · {s.sub.split(' · ')[0]}</span>}</span>
                    <span className="shrink-0 text-xs text-steel-500">{s.sel.kind === 'plate' ? s.sub.split(' · ').slice(-1)[0] : s.sub}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Atalhos */}
          <div>
            <div className="text-[11px] font-bold text-steel-500 uppercase tracking-wider mb-2">Mais atendidos</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {models.slice(0, 12).map(m => (
                <button key={m.key} onClick={() => { setSel({ kind: 'model', key: m.key, label: m.label }); setYear(null); setCat(null); }}
                  className="text-left rounded-xl border border-steel-200 bg-white px-3 py-2.5 hover:border-brand-300 hover:shadow-sm transition">
                  <div className="text-sm font-semibold text-steel-900 truncate">{m.label}</div>
                  <div className="text-[11px] text-steel-500">{m.os} OS</div>
                </button>
              ))}
            </div>
          </div>
        </>
      ) : (
        <>
          {/* Veículo escolhido */}
          <div className="card !p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-11 w-11 shrink-0 rounded-xl bg-brand-50 grid place-items-center text-xl">🚗</div>
              <div className="min-w-0">
                <div className="text-lg font-bold text-steel-900 truncate">{sel.label}{year ? ` · ${year}` : ''}</div>
                <div className="text-xs text-steel-500">
                  {stats.os} OS · {found.length} serviço{found.length === 1 ? '' : 's'}{stats.last ? ` · última vez em ${fmtDate(stats.last.slice(0, 10))}` : ''}
                </div>
              </div>
            </div>
            <button onClick={clear} className="text-sm font-semibold text-brand-700 px-3 py-1.5 rounded-lg border border-steel-200 bg-white hover:border-brand-300">Trocar veículo</button>
          </div>

          {(years.length > 1 || base.length > 8) && (
            <div className="flex flex-wrap items-center gap-2">
              {years.length > 1 && <>
                <button onClick={() => setYear(null)} className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition ${year === null ? 'bg-steel-900 text-white border-steel-900' : 'bg-white text-steel-600 border-steel-200'}`}>Todos os anos</button>
                {years.map(({ y, n }) => (
                  <button key={y} onClick={() => setYear(year === y ? null : y)}
                    className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition ${year === y ? 'bg-steel-900 text-white border-steel-900' : 'bg-white text-steel-600 border-steel-200'}`}>
                    {y} <span className="opacity-60">({n})</span>
                  </button>
                ))}
              </>}
              <input className="input !w-auto !py-1.5 text-sm ml-auto min-w-[180px]" placeholder="Filtrar serviço" value={sq} onChange={e => setSq(e.target.value)} />
            </div>
          )}

          {cats.length > 1 && (
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setCat(null)}
                className={`text-sm font-semibold px-3 py-1.5 rounded-full border transition ${cat === null ? 'bg-steel-900 text-white border-steel-900' : 'bg-white text-steel-600 border-steel-200'}`}>
                Todas
              </button>
              {cats.map(c => (
                <button key={c.name} onClick={() => setCat(cat === c.name ? null : c.name)}
                  className={`text-sm font-semibold px-3 py-1.5 rounded-full border transition ${cat === c.name ? 'bg-steel-900 text-white border-steel-900' : 'bg-white text-steel-600 border-steel-200'}`}>
                  {c.name} <span className="opacity-60">({c.n})</span>
                </button>
              ))}
            </div>
          )}

          {groups.length === 0 ? (
            <div className="card text-center py-8 text-sm text-steel-500">Nenhum serviço encontrado com esse filtro.</div>
          ) : (
            <div className="card !p-0 overflow-hidden">
              <div className="hidden md:grid grid-cols-12 gap-3 px-5 py-2 bg-steel-50 border-b border-steel-100 text-[10px] font-bold text-steel-500 uppercase tracking-wider items-center">
                <div className="col-span-5">Serviço</div>
                <div className="col-span-1 text-center">
                  <button onClick={() => setSort('vezes')} className={sort === 'vezes' ? 'text-brand-700' : 'hover:text-steel-700'}>Vezes{sort === 'vezes' ? ' ↓' : ''}</button>
                </div>
                <div className="col-span-2 text-right">
                  <button onClick={() => setSort('preco')} className={sort === 'preco' ? 'text-brand-700' : 'hover:text-steel-700'}>Último preço{sort === 'preco' ? ' ↓' : ''}</button>
                </div>
                <div className="col-span-2 text-right">Faixa cobrada</div>
                <div className="col-span-2 text-right">
                  <button onClick={() => setSort('recente')} className={sort === 'recente' ? 'text-brand-700' : 'hover:text-steel-700'}>Última vez{sort === 'recente' ? ' ↓' : ''}</button>
                </div>
              </div>
              {sections.map(([name, gs]) => (
                <div key={name}>
                  {!cat && cats.length > 1 && (
                    <div className="px-5 py-2 bg-steel-50/70 border-b border-t border-steel-100 flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-steel-600">
                      <span>{name}</span><span className="font-medium normal-case tracking-normal text-steel-400">{gs.length} serviço{gs.length === 1 ? '' : 's'}</span>
                    </div>
                  )}
                  <ul className="divide-y divide-steel-100">
                    {gs.map(g => row(g))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}


type KitRow = {
  id: string; part_id: string | null; description: string; quantity: number; vehicle_model: string | null;
  tech_vehicle_id: string | null; vehicle_make: string | null; vehicle_engine: string | null; year_from: number | null; year_to: number | null;
};
type CatPart = { id: string; name: string; code: string | null; brand: string | null; cost: number; unit: string | null; stock_qty: number };
type HistPart = { name: string; part_id: string | null; uses_all: number; uses_model: number; qty: number; unit_price: number };
/** Linha sugerida pelo catálogo técnico (óleo do motor e filtros do carro) — a oficina confere e ajusta */
type TechSug = { key: string; description: string; part_id: string | null; quantity: number; hint: string; checked: boolean };
/** Carro de um kit: ficha do catálogo técnico (marca, modelo, motor, anos) ou só o nome do modelo (kits antigos) */
type KitCar = { key: string; model: string; techId: string | null; make: string | null; engine: string | null; from: number | null; to: number | null };

const kitKey = (r: Pick<KitRow, 'tech_vehicle_id' | 'vehicle_model'>) => r.tech_vehicle_id ?? `m:${norm(r.vehicle_model ?? '')}`;
const carOfRow = (r: KitRow): KitCar => ({ key: kitKey(r), model: r.vehicle_model ?? '', techId: r.tech_vehicle_id, make: r.vehicle_make, engine: r.vehicle_engine, from: r.year_from, to: r.year_to });
const carOfTech = (v: TechVehicle): KitCar => ({ key: v.id, model: v.model, techId: v.id, make: v.make, engine: v.engine ?? v.version, from: v.year_from, to: v.year_to });
const carLabel = (c: KitCar) => [c.make, c.model, c.engine, fmtYearRange({ year_from: c.from, year_to: c.to })].filter(Boolean).join(' · ');

/** Busca no catálogo técnico por marca, modelo e ano ("fiesta 2010", "vw gol") */
async function searchCatalogCars(text: string): Promise<TechVehicle[]> {
  const yr = text.match(/\b(19|20)\d{2}\b/)?.[0];
  const words = text.replace(/\b(19|20)\d{2}\b/, ' ').split(/\s+/).map(w => w.replace(/[%_,()*\\]/g, '')).filter(w => w.length >= 2);
  if (!words.length) return [];
  let qy = supabase.from('tech_vehicles').select('*');
  for (const w of words) qy = qy.or(`model.ilike.%${w}%,make.ilike.%${w}%`);
  const { data } = await qy.order('make').order('model').order('year_from').limit(80);
  const y = yr ? Number(yr) : null;
  return ((data ?? []) as TechVehicle[]).filter(v => y == null || ((v.year_from == null || v.year_from <= y) && (v.year_to == null || v.year_to >= y)));
}

/** Na ficha do serviço: as peças que entram junto (ex.: Troca de óleo → óleo, filtro de óleo, junta do bujão) */
function ServiceKit({ wid, service }: { wid: string; service: WorkshopService }) {
  const [all, setAll] = useState<KitRow[] | null>(null);
  /** Carro cujo kit está aberto (null = kit geral, vale para todos os carros) */
  const [car, setCar] = useState<KitCar | null>(null);
  const model = car?.model ?? '';
  const [pick, setPick] = useState<{ text: string; results: TechVehicle[] | null } | null>(null);
  const [quick, setQuick] = useState<string | null>(null);
  const [baseMargin, setBaseMargin] = useState(DEFAULT_MARGIN);
  const [parts, setParts] = useState<CatPart[]>([]);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [hist, setHist] = useState<HistPart[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [techCars, setTechCars] = useState<TechVehicle[] | null>(null);
  const [tech, setTech] = useState<{ car: TechVehicle; rows: TechSug[]; unverified: boolean } | null>(null);
  /** Copiar este kit para outros carros: busca no catálogo + carros marcados */
  const [copy, setCopy] = useState<{ text: string; results: TechVehicle[] | null; sel: KitCar[] } | null>(null);
  useEffect(() => { setCopy(null); }, [car?.key]); // trocou de carro: fecha o painel de cópia

  const load = useCallback(async () => {
    const { data } = await supabase.from('workshop_service_parts')
      .select('id, part_id, description, quantity, vehicle_model, tech_vehicle_id, vehicle_make, vehicle_engine, year_from, year_to')
      .eq('service_id', service.id).order('position').order('created_at');
    setAll(((data ?? []) as KitRow[]).map(r => ({ ...r, quantity: Number(r.quantity) })));
  }, [service.id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadMargins(wid).then(m => setBaseMargin(m.base)).catch(() => { /* usa o padrão */ }); }, [wid]);
  const items = all === null ? null : all.filter(r => (car ? kitKey(r) === car.key : !r.vehicle_model));
  /** Carros que já têm kit próprio, sem repetir */
  const carsWithKit = [...new Map((all ?? []).filter(r => r.vehicle_model).map(r => [kitKey(r), carOfRow(r)])).values()];
  useEffect(() => {
    loadAllParts<CatPart>(wid, 'id, name, code, brand, cost, unit, stock_qty')
      .then(data => setParts(((data ?? []) as CatPart[]).map(p => ({ ...p, stock_qty: Number(p.stock_qty), cost: Number(p.cost) || 0 }))));
  }, [wid]);
  // Busca no catálogo enquanto digita
  useEffect(() => {
    if (!pick) return;
    const text = pick.text.trim();
    if (text.length < 2) return;
    let live = true;
    const t = setTimeout(() => { searchCatalogCars(text).then(r => { if (live) setPick(p => p && p.text.trim() === text ? { ...p, results: r } : p); }); }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [pick?.text]); // eslint-disable-line react-hooks/exhaustive-deps

  async function add(rows: { description: string; part_id: string | null; quantity: number }[]) {
    if (!rows.length) return;
    setBusy(true);
    const start = items?.length ?? 0;
    const { error } = await supabase.from('workshop_service_parts').insert(rows.map((r, i) => ({
      workshop_id: wid, service_id: service.id, part_id: r.part_id, description: r.description.trim(), quantity: r.quantity, position: start + i,
      vehicle_model: car?.model || null, tech_vehicle_id: car?.techId ?? null, vehicle_make: car?.make ?? null, vehicle_engine: car?.engine ?? null,
      year_from: car?.from ?? null, year_to: car?.to ?? null,
    })));
    setBusy(false);
    if (error) return toast.error('Não foi possível adicionar: ' + error.message);
    setQ('');
    load();
  }
  async function remove(id: string) {
    const { error } = await supabase.from('workshop_service_parts').delete().eq('id', id);
    if (error) return toast.error('Não foi possível remover: ' + error.message);
    setAll(xs => (xs ?? []).filter(x => x.id !== id));
  }
  async function setQty(row: KitRow, v: string) {
    const n = parseMoney(v);
    if (!Number.isFinite(n) || n <= 0 || n === row.quantity) return load();
    const { error } = await supabase.from('workshop_service_parts').update({ quantity: n }).eq('id', row.id);
    if (error) return toast.error('Não foi possível salvar a quantidade: ' + error.message);
    setAll(xs => (xs ?? []).map(x => x.id === row.id ? { ...x, quantity: n } : x));
  }
  async function loadHistory() {
    const { data, error } = await supabase.rpc('service_part_suggestions', { p_workshop: wid, p_service: service.name, p_model: model || null });
    if (error) return toast.error('Não foi possível buscar o histórico: ' + error.message);
    const have = new Set((items ?? []).map(i => norm(i.description)));
    setHist(((data ?? []) as HistPart[]).filter(h => !have.has(norm(h.name))));
    setPicked(new Set());
  }

  /** Sugerir pelo catálogo: se o kit já é de uma ficha, usa ela; se é só o nome do modelo, a oficina escolhe a versão */
  async function loadTechCars() {
    if (!car) return toast.error('Escolha o carro primeiro (➕ Outro carro). O catálogo técnico é por carro.');
    if (car.techId) return pickTechCar(car.techId, car.key);
    setBusy(true);
    const cars = await searchTechVehicles(model, null);
    setBusy(false);
    if (cars.length === 0) return toast.error(`O catálogo técnico ainda não tem ficha do ${model}.`);
    setTechCars(cars); setTech(null);
    if (cars.length === 1) pickTechCar(cars[0].id, car.key);
  }
  /** Monta a sugestão da ficha: óleo do motor e filtros, casando com o estoque quando dá */
  async function pickTechCar(techId: string, kitK: string) {
    setBusy(true);
    const sheet = await loadSheet(techId);
    setBusy(false);
    if (!sheet.vehicle) return toast.error('Ficha não encontrada no catálogo técnico.');
    const mine = (all ?? []).filter(r => kitKey(r) === kitK);
    const have = new Set(mine.map(i => norm(i.description)));
    const haveParts = new Set(mine.map(i => i.part_id).filter(Boolean));
    const rows: TechSug[] = [];
    const push = (r: TechSug) => { if (!have.has(norm(r.description)) && !(r.part_id && haveParts.has(r.part_id))) rows.push(r); };

    const oil = sheet.fluids.find(f => f.system === 'motor');
    if (oil?.viscosity) {
      const cands = partsForFluid(parts, oil).sort((a, b) => Number(b.stock_qty > 0) - Number(a.stock_qty > 0) || a.cost - b.cost);
      // A ficha traz a capacidade quebrada (4,5 L); óleo se vende e se separa em litro fechado, então o kit leva 5
      const need = Number(oil.capacity_liters) || 1;
      const liters = Math.ceil(need - 1e-9);
      const spec = [oil.viscosity, oil.spec].filter(Boolean).join(' · ');
      const qtyHint = need === liters ? fmtLiters(liters) : `ficha ${fmtLiters(need)} → kit ${fmtLiters(liters)}`;
      if (cands[0]) {
        const p = cands[0];
        push({ key: 'oleo', description: p.name, part_id: p.id, quantity: liters, checked: true,
          hint: `${spec} · ${qtyHint}${cands.length > 1 ? ` · mais ${cands.length - 1} opção(ões) no estoque` : ''}` });
      } else {
        push({ key: 'oleo', description: `Óleo do motor ${oil.viscosity}`, part_id: null, quantity: liters, checked: true,
          hint: `${spec} · ${qtyHint} · sem óleo ${oil.viscosity} no estoque, entra como avulsa` });
      }
    }
    const filterRow = (kind: 'oleo' | 'ar' | 'combustivel' | 'cabine', checked: boolean) => {
      const f = sheet.filters.find(x => x.kind === kind);
      if (!f) return;
      const hit = partsForFilter(parts, f)[0];
      push({ key: `f-${kind}`, description: hit ? hit.name : `${filterLabel(kind)} ${f.brand} ${f.code}`, part_id: hit?.id ?? null, quantity: 1, checked,
        hint: hit ? `${f.brand} ${f.code} · no estoque` : `${f.brand} ${f.code} · não cadastrada, entra como avulsa` });
    };
    filterRow('oleo', true); filterRow('ar', false); filterRow('combustivel', false); filterRow('cabine', false);

    if (rows.length === 0) toast.error('O catálogo técnico não trouxe nada novo para esse carro.');
    const unverified = [...sheet.fluids, ...sheet.filters].some(x => x.status !== 'verificado');
    setTechCars(null); setTech({ car: sheet.vehicle, rows, unverified });
  }

  // Busca no catálogo enquanto digita (painel "Copiar para outros carros")
  useEffect(() => {
    if (!copy) return;
    const text = copy.text.trim();
    if (text.length < 2) return;
    let live = true;
    const t = setTimeout(() => { searchCatalogCars(text).then(r => { if (live) setCopy(c => c && c.text.trim() === text ? { ...c, results: r } : c); }); }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [copy?.text]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggleCopy = (c: KitCar) => setCopy(st => st && ({ ...st, sel: st.sel.some(x => x.key === c.key) ? st.sel.filter(x => x.key !== c.key) : [...st.sel, c] }));

  /** Copia as peças deste kit para os carros marcados; o que o destino já tem é pulado (nada duplica) */
  async function copyKit() {
    if (!copy || !copy.sel.length || !items?.length) return;
    setBusy(true);
    const plan = planKitCopy({
      workshopId: wid, serviceId: service.id,
      source: items.map(i => ({ part_id: i.part_id, description: i.description, quantity: i.quantity })),
      targets: copy.sel.map(c => ({ car: c, existing: (all ?? []).filter(r => kitKey(r) === c.key) })),
    });
    if (!plan.rows.length) { setBusy(false); return toast.error('Esses carros já têm todas as peças deste kit.'); }
    const { error } = await supabase.from('workshop_service_parts').insert(plan.rows);
    setBusy(false);
    if (error) return toast.error('Não foi possível copiar: ' + error.message);
    toast.success(`Kit copiado para ${plan.carsTouched} carro(s)${plan.skipped ? ` · ${plan.skipped} peça(s) já existiam e foram puladas` : ''}`);
    setCopy(null);
    load();
  }

  async function copyFromGeneral() {
    const base = (all ?? []).filter(r => !r.vehicle_model);
    await add(base.map(r => ({ description: r.description, part_id: r.part_id, quantity: r.quantity })));
  }
  /** Abre o kit de um carro; se for ficha do catálogo e o kit estiver vazio, já mostra a sugestão de óleo e filtros */
  function openCar(c: KitCar) {
    setCar(c); setHist(null); setPick(null); setTech(null); setTechCars(null);
    if (c.techId && !(all ?? []).some(r => kitKey(r) === c.key)) pickTechCar(c.techId, c.key);
  }

  const inKit = new Set((items ?? []).map(i => i.part_id).filter(Boolean));
  const words = norm(q).split(' ').filter(Boolean);
  const matches = words.length ? parts.filter(p => !inKit.has(p.id) && words.every(w => norm(`${p.name} ${p.code ?? ''} ${p.brand ?? ''}`).includes(w))).slice(0, 8) : [];

  return (
    <div className="rounded-xl border border-steel-200">
      <div className="px-3 py-2 border-b border-steel-100">
        <div className="text-xs font-bold text-steel-600">🧰 Peças deste serviço</div>
        <div className="text-[11px] text-steel-400">Na OS, ao escolher este serviço no catálogo, essas peças são oferecidas para entrar junto. Se o carro tiver kit próprio, ele vale no lugar do geral.</div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {[{ c: null as KitCar | null, label: 'Todos os carros' }, ...carsWithKit.map(c => ({ c: c as KitCar | null, label: carLabel(c) }))].map(o => (
            <button key={o.c?.key ?? '_all'} type="button" onClick={() => { setCar(o.c); setHist(null); setPick(null); setTech(null); setTechCars(null); }}
              className={`min-h-[36px] px-3 rounded-lg text-xs font-semibold border ${(car?.key ?? '') === (o.c?.key ?? '') ? 'bg-brand-600 border-brand-600 text-white' : 'bg-white border-steel-200 text-steel-600 hover:bg-steel-50'}`}>
              {o.label}
            </button>
          ))}
          {car && !carsWithKit.some(c => c.key === car.key) && (
            <span className="min-h-[36px] px-3 rounded-lg text-xs font-semibold border border-brand-600 bg-brand-600 text-white inline-flex items-center">{carLabel(car)}</span>
          )}
          <button type="button" onClick={() => setPick(pick ? null : { text: '', results: null })}
            className="min-h-[36px] px-3 rounded-lg text-xs font-semibold border border-dashed border-steel-300 text-brand-700 hover:bg-brand-50">➕ Outro carro</button>
        </div>
        {pick && (
          <div className="mt-2 space-y-1.5">
            <input className="input !py-2 text-sm w-full" autoFocus placeholder="Marca, modelo e ano: Fiesta 2010, VW Gol, Onix 2016…" value={pick.text}
              onChange={e => setPick({ text: e.target.value, results: null })} />
            {pick.results && pick.results.length > 0 && (
              <ul className="max-h-64 overflow-y-auto rounded-lg border border-steel-200 divide-y divide-steel-100 bg-white">
                {pick.results.map(v => (
                  <li key={v.id}>
                    <button type="button" onClick={() => openCar(carOfTech(v))} className="w-full text-left px-3 py-2 hover:bg-brand-50">
                      <span className="block text-sm font-semibold text-steel-800">{v.make} {v.model}</span>
                      <span className="block text-[11px] text-steel-500">{vehicleDetail(v) || 'sem detalhes'}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {pick.results && pick.results.length === 0 && <p className="text-[11px] text-steel-500">Nenhum carro do catálogo técnico com esse nome.</p>}
            {pick.text.trim().length >= 2 && (
              <button type="button" onClick={() => { const t = pick.text.trim(); openCar({ key: `m:${norm(t)}`, model: t, techId: null, make: null, engine: null, from: null, to: null }); }}
                className="text-xs font-semibold text-brand-700 hover:underline">Não está no catálogo? Usar só “{pick.text.trim()}” como modelo</button>
            )}
          </div>
        )}
        {car && <div className="mt-2 text-[11px] text-steel-500">Peças que entram quando o carro da OS for <strong>{carLabel(car)}</strong>.</div>}
      </div>

      {items === null ? (
        <p className="px-3 py-3 text-xs text-steel-400">Carregando…</p>
      ) : items.length === 0 ? (
        <div className="px-3 py-3 text-xs text-steel-400 space-y-1.5">
          <p>{car ? `Nenhuma peça no kit do ${model} ainda. Enquanto estiver vazio, a OS usa o kit geral.` : 'Nenhuma peça no kit ainda.'}</p>
          {car && (all ?? []).some(r => !r.vehicle_model) && (
            <button type="button" disabled={busy} onClick={copyFromGeneral} className="font-semibold text-brand-700 hover:underline">Copiar do kit geral</button>
          )}
        </div>
      ) : (
        <ul className="divide-y divide-steel-100">
          {items.map(i => (
            <li key={i.id} className="px-3 py-2 flex items-center gap-2">
              <span className="flex-1 min-w-0 text-sm">
                <span className="block truncate">{i.description}{!i.part_id && <span className="ml-1.5 text-[10px] text-steel-400">avulsa</span>}</span>
                {i.part_id && (() => { const cp = parts.find(x => x.id === i.part_id); return cp ? <span className="block text-[11px] text-steel-500">{cp.cost > 0 ? `custo ${fmtBRL(cp.cost)}` : 'sem custo'} · {cp.stock_qty} em estoque</span> : null; })()}
              </span>
              <input className="input !py-1 !px-2 w-16 text-right text-sm" inputMode="decimal" defaultValue={String(i.quantity).replace('.', ',')}
                onBlur={e => setQty(i, e.target.value)} aria-label={`Quantidade de ${i.description}`} />
              <button type="button" onClick={() => remove(i.id)} className="h-7 w-7 rounded-lg grid place-items-center text-steel-400 hover:bg-alert-50 hover:text-alert-600" aria-label="Remover">✕</button>
            </li>
          ))}
        </ul>
      )}

      {items && items.length > 0 && (
        <div className="px-3 py-2 border-t border-steel-100 space-y-2">
          {!copy ? (
            <button type="button" onClick={() => setCopy({ text: '', results: null, sel: [] })}
              className="text-xs font-semibold text-brand-700 hover:underline">📋 Copiar este kit para outros carros</button>
          ) : (
            <div className="rounded-lg bg-steel-50 p-2 space-y-1.5">
              <p className="text-[11px] text-steel-600">
                Copiar as <strong>{items.length} peça(s)</strong> {car ? <>do kit do <strong>{carLabel(car)}</strong></> : 'do kit geral'} para outros carros.
                Peça que o carro já tem não é repetida.
              </p>
              <input className="input !py-2 text-sm w-full" autoFocus placeholder="Marca, modelo e ano: Prisma, Onix 2016, VW Gol…" value={copy.text}
                onChange={e => setCopy({ ...copy, text: e.target.value, results: null })} />
              {copy.results && copy.results.length > 0 && (
                <ul className="max-h-56 overflow-y-auto rounded-lg border border-steel-200 divide-y divide-steel-100 bg-white">
                  {copy.results.filter(v => v.id !== car?.key).map(v => {
                    const c = carOfTech(v);
                    const on = copy.sel.some(x => x.key === c.key);
                    const has = carsWithKit.some(k => k.key === c.key);
                    return (
                      <li key={v.id}>
                        <button type="button" onClick={() => toggleCopy(c)} aria-pressed={on}
                          className={`w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-brand-50 ${on ? 'bg-brand-50' : ''}`}>
                          <span className={`h-4 w-4 shrink-0 rounded border grid place-items-center text-[10px] ${on ? 'bg-brand-600 border-brand-600 text-white' : 'border-steel-300 bg-white'}`}>{on ? '✓' : ''}</span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-semibold text-steel-800">{v.make} {v.model}</span>
                            <span className="block text-[11px] text-steel-500">{vehicleDetail(v) || 'sem detalhes'}</span>
                          </span>
                          {has && <span className="text-[10px] text-steel-400 shrink-0">já tem kit</span>}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
              {copy.results && copy.results.length === 0 && <p className="text-[11px] text-steel-500">Nenhum carro do catálogo técnico com esse nome.</p>}
              {copy.text.trim().length >= 2 && (
                <button type="button" onClick={() => { const t = copy.text.trim(); toggleCopy({ key: `m:${norm(t)}`, model: t, techId: null, make: null, engine: null, from: null, to: null }); }}
                  className="text-xs font-semibold text-brand-700 hover:underline">Não está no catálogo? Marcar só “{copy.text.trim()}” como modelo</button>
              )}
              {copy.sel.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {copy.sel.map(c => (
                    <button key={c.key} type="button" onClick={() => toggleCopy(c)} title="Tirar da cópia"
                      className="text-[11px] px-2 py-1 rounded-lg bg-brand-600 text-white">{carLabel(c)} ✕</button>
                  ))}
                </div>
              )}
              <div className="flex gap-2 pt-0.5">
                <button type="button" disabled={busy || copy.sel.length === 0} onClick={copyKit}
                  className="btn-primary text-xs !py-1.5 disabled:opacity-50">Copiar para {copy.sel.length || ''} carro(s)</button>
                <button type="button" onClick={() => setCopy(null)} className="text-xs text-steel-500 hover:underline">Cancelar</button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="px-3 py-2 border-t border-steel-100 space-y-2">
        <div className="relative">
          <input className="input !py-2 text-sm" placeholder="Adicionar peça: buscar no estoque ou digitar o nome" value={q} onChange={e => setQ(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (matches[0]) add([{ description: matches[0].name, part_id: matches[0].id, quantity: 1 }]); else if (q.trim().length >= 2) add([{ description: q, part_id: null, quantity: 1 }]); } }} />
          {q.trim().length >= 2 && (
            <div className="absolute z-10 left-0 right-0 mt-1 rounded-xl border border-steel-200 bg-white shadow-lg overflow-hidden">
              {matches.map(p => (
                <button key={p.id} type="button" disabled={busy} onClick={() => add([{ description: p.name, part_id: p.id, quantity: 1 }])}
                  className="w-full flex items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-brand-50">
                  <span className="min-w-0">
                    <span className="block truncate">{p.name}</span>
                    <span className="block text-[11px] text-steel-500 truncate">{[p.code, p.brand].filter(Boolean).join(' · ') || 'já cadastrada'}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-xs font-bold text-steel-800">{p.cost > 0 ? `custo ${fmtBRL(p.cost)}` : 'sem custo'}</span>
                    <span className={`block text-[11px] ${p.stock_qty <= 0 ? 'text-alert-600 font-semibold' : 'text-steel-500'}`}>{p.stock_qty} {p.unit ?? ''} em estoque</span>
                  </span>
                </button>
              ))}
              <button type="button" disabled={busy} onClick={() => setQuick(q.trim())}
                className="w-full px-3 py-2 text-left text-sm text-brand-700 font-semibold hover:bg-brand-50 border-t border-steel-100">
                ✚ Cadastrar “{q.trim()}” agora (com custo e preço)
              </button>
              <button type="button" disabled={busy} onClick={() => add([{ description: q, part_id: null, quantity: 1 }])}
                className="w-full px-3 py-2 text-left text-sm text-steel-600 hover:bg-brand-50 border-t border-steel-100">
                {matches.length === 0 && <span className="block text-[11px] font-normal text-steel-500">Nenhuma peça cadastrada com esse nome.</span>}
              ➕ Adicionar “{q.trim()}” como peça avulsa (sem cadastro)
              </button>
            </div>
          )}
        </div>

        {/\b(oleo|filtro|revisao)/.test(norm(service.name)) && (
          techCars ? (
            <div className="rounded-lg bg-steel-50 p-2 space-y-1.5">
              <p className="text-[11px] text-steel-500">Qual versão do <strong>{model}</strong>?</p>
              <ul className="space-y-1">
                {techCars.slice(0, 12).map(c => (
                  <li key={c.id}><button type="button" disabled={busy} onClick={() => pickTechCar(c.id, car?.key ?? '')} className="w-full text-left text-sm px-2 py-1.5 rounded-lg bg-white border border-steel-200 hover:bg-brand-50">{vehicleDetail(c) || c.model}</button></li>
                ))}
              </ul>
              <button type="button" className="text-xs text-steel-500" onClick={() => setTechCars(null)}>Fechar</button>
            </div>
          ) : tech ? (
            <div className="rounded-lg bg-steel-50 p-2 space-y-1.5">
              <p className="text-[11px] text-steel-500">Do catálogo técnico: <strong>{tech.car.make} {tech.car.model}</strong> {vehicleDetail(tech.car)}. É sugestão — marque o que vale e ajuste a quantidade depois.{tech.unverified && <span className="block mt-0.5 font-semibold text-amber-700">Ficha ainda não verificada: confira óleo, litros e filtro antes de usar.</span>}</p>
              <ul className="space-y-1">
                {tech.rows.map(r => (
                  <li key={r.key}>
                    <label className="flex items-start gap-2 text-sm">
                      <input type="checkbox" className="mt-1" checked={r.checked} onChange={e => setTech(t => t && ({ ...t, rows: t.rows.map(x => x.key === r.key ? { ...x, checked: e.target.checked } : x) }))} />
                      <span className="flex-1 min-w-0"><span className="block truncate">{r.description}</span><span className="block text-[11px] text-steel-500">{r.hint}</span></span>
                    </label>
                  </li>
                ))}
              </ul>
              <div className="flex gap-3 pt-1">
                <button type="button" disabled={busy || !tech.rows.some(r => r.checked)} className="text-xs font-semibold text-brand-700 disabled:opacity-40"
                  onClick={async () => { await add(tech.rows.filter(r => r.checked)); setTech(null); }}>
                  Adicionar ao kit do {model}
                </button>
                <button type="button" className="text-xs text-steel-500" onClick={() => setTech(null)}>Fechar</button>
              </div>
            </div>
          ) : (
            <button type="button" disabled={busy} onClick={loadTechCars} className="block text-xs font-semibold text-brand-700 hover:underline">🔧 Sugerir pelo catálogo técnico (óleo e filtros do carro)</button>
          )
        )}

        {norm(service.name).length >= 4 && (
          hist === null ? (
            <button type="button" onClick={loadHistory} className="text-xs font-semibold text-brand-700 hover:underline">💡 Sugerir pelo histórico das OS</button>
          ) : hist.length === 0 ? (
            <p className="text-[11px] text-steel-400">Nada novo no histórico para este serviço.</p>
          ) : (
            <div className="rounded-lg bg-steel-50 p-2 space-y-1.5">
              <p className="text-[11px] text-steel-500">Peças que já saíram abaixo deste serviço nas OS. <strong>Confira antes de marcar:</strong> numa nota com vários serviços, nem tudo que aparece abaixo é deste.</p>
              <ul className="space-y-1">
                {hist.map(h => (
                  <li key={h.name}>
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={picked.has(h.name)} onChange={e => setPicked(s => { const n = new Set(s); if (e.target.checked) n.add(h.name); else n.delete(h.name); return n; })} />
                      <span className="flex-1 min-w-0 truncate">{h.name}</span>
                      <span className="shrink-0 text-[11px] text-steel-400">{h.uses_all}× · {fmtBRL(Number(h.unit_price))}</span>
                    </label>
                  </li>
                ))}
              </ul>
              <div className="flex gap-3 pt-1">
                <button type="button" disabled={busy || picked.size === 0} className="text-xs font-semibold text-brand-700 disabled:opacity-40"
                  onClick={async () => { await add(hist.filter(h => picked.has(h.name)).map(h => ({ description: h.name, part_id: h.part_id, quantity: Number(h.qty) || 1 }))); setHist(null); }}>
                  Adicionar {picked.size || ''} selecionada{picked.size === 1 ? '' : 's'}
                </button>
                <button type="button" className="text-xs text-steel-500" onClick={() => setHist(null)}>Fechar</button>
              </div>
            </div>
          )
        )}
      </div>
      {quick !== null && (
        <QuickPartModal wid={wid} osLabel="" registerOnly initialName={quick} quantity={1} defaultMargin={baseMargin}
          onClose={() => setQuick(null)}
          onSaved={res => {
            setParts(ps => [...ps, { id: res.part_id, name: res.name, code: null, brand: null, cost: res.cost, unit: res.unit, stock_qty: 0 }]);
            setQuick(null);
            add([{ description: res.name, part_id: res.part_id, quantity: 1 }]);
          }} />
      )}
    </div>
  );
}
