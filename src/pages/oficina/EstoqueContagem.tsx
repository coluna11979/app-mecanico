import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import WorkshopLayout from '@/components/layout/WorkshopLayout';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/components/ui/Toast';
import { fetchAll } from '@/lib/fetchAll';
import { parseMoney } from '@/components/os/osHelpers';
import { PART_CATEGORIES, fmtQty, partCategory, type PartCategory, type WorkshopPart } from '@/lib/parts';
import type { Supplier } from '@/lib/purchasing';
import StockTabs, { useStockAccess } from '@/components/stock/StockTabs';

const PAGE = 100;

/**
 * Contagem de estoque: digita quanto tem na prateleira de cada peça e salva tudo de uma vez.
 * Peça em branco não é mexida. Cada diferença vira um ajuste no histórico da peça (stock_adjust).
 * O que foi digitado fica guardado neste aparelho até salvar (contagem leva tempo).
 */
export default function EstoqueContagem() {
  const { currentWorkshop } = useAuth();
  const wid = currentWorkshop?.id ?? null;
  const access = useStockAccess();
  const draftKey = `contagem-estoque:${wid ?? ''}`;

  const [parts, setParts] = useState<WorkshopPart[] | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [bought, setBought] = useState<Set<string>>(new Set());
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<PartCategory | ''>('');
  const [supplierF, setSupplierF] = useState('');
  const [scope, setScope] = useState<'todas' | 'compradas' | 'com_estoque' | 'pendentes'>('todas');
  const [limit, setLimit] = useState(PAGE);
  const [saving, setSaving] = useState<{ done: number; total: number } | null>(null);

  useEffect(() => {
    if (!wid || !access.pecas) return;
    (async () => {
      const [p, s, it] = await Promise.all([
        fetchAll<WorkshopPart>((a, b) => supabase.from('workshop_parts').select('*').eq('workshop_id', wid).eq('active', true).order('id').range(a, b)),
        supabase.from('suppliers').select('*').eq('workshop_id', wid).order('name'),
        fetchAll<{ part_id: string }>((a, b) => supabase.from('purchase_items').select('part_id').eq('workshop_id', wid).order('id').range(a, b)),
      ]);
      setParts(p.data.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')));
      setSuppliers((s.data as Supplier[]) ?? []);
      setBought(new Set(it.data.map(i => i.part_id)));
    })();
    try { const raw = localStorage.getItem(draftKey); if (raw) setCounts(JSON.parse(raw)); } catch { /* ignora */ }
  }, [wid, access.pecas, draftKey]);

  useEffect(() => { try { localStorage.setItem(draftKey, JSON.stringify(counts)); } catch { /* ignora */ } }, [counts, draftKey]);
  useEffect(() => { setLimit(PAGE); }, [q, cat, supplierF, scope]);

  const valOf = (id: string) => { const s = counts[id]; if (s == null || s.trim() === '') return null; const n = parseMoney(s); return Number.isFinite(n) && n >= 0 ? n : NaN; };

  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (parts ?? []).filter(p => (!cat || p.category === cat) && (!supplierF || p.supplier_id === supplierF)
      && (scope === 'todas' || (scope === 'compradas' && bought.has(p.id)) || (scope === 'com_estoque' && Number(p.stock_qty) !== 0)
        || (scope === 'pendentes' && valOf(p.id) == null))
      && (!t || p.name.toLowerCase().includes(t) || p.code?.toLowerCase().includes(t) || p.brand?.toLowerCase().includes(t)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parts, q, cat, supplierF, scope, bought, scope === 'pendentes' ? counts : null]);

  const typed = (parts ?? []).filter(p => valOf(p.id) != null);
  const invalid = typed.filter(p => Number.isNaN(valOf(p.id)));
  const changes = typed.filter(p => !Number.isNaN(valOf(p.id)) && Math.abs((valOf(p.id) as number) - Number(p.stock_qty)) > 0.0005);

  async function save() {
    if (invalid.length) return toast.error(`${invalid.length} peça(s) com quantidade inválida`);
    if (!changes.length) { setCounts({}); return toast.success('Contagem conferida: tudo bate com o sistema ✓'); }
    if (!confirm(`Salvar a contagem? ${changes.length} peça(s) vão ter o estoque ajustado. Cada ajuste fica no histórico da peça.`)) return;
    const note = `Contagem de estoque ${new Date().toLocaleDateString('pt-BR')}`;
    setSaving({ done: 0, total: changes.length });
    const failed: string[] = [];
    for (const [i, p] of changes.entries()) {
      const { error } = await supabase.rpc('stock_adjust', { p_part: p.id, p_counted: valOf(p.id), p_note: note });
      if (error) failed.push(p.name);
      setSaving({ done: i + 1, total: changes.length });
    }
    setSaving(null);
    const savedIds = new Set(changes.filter(p => !failed.includes(p.name)).map(p => p.id));
    setParts(ps => (ps ?? []).map(p => (savedIds.has(p.id) ? { ...p, stock_qty: valOf(p.id) as number } : p)));
    // Limpa o que foi salvo (e o que já batia); fica só o que deu erro
    const failedIds = new Set(changes.filter(p => !savedIds.has(p.id)).map(p => p.id));
    setCounts(c => Object.fromEntries(Object.entries(c).filter(([id]) => failedIds.has(id))));
    if (failed.length) toast.error(`Não foi possível ajustar: ${failed.slice(0, 3).join(', ')}${failed.length > 3 ? '…' : ''}`);
    else toast.success(`Contagem salva ✓ ${changes.length} peça(s) ajustada(s)`);
  }

  if (!access.pecas) return <WorkshopLayout><div className="max-w-md mx-auto card text-center py-12 text-sm text-steel-500">Contagem de estoque pede a permissão “Peças e estoque”.</div></WorkshopLayout>;

  const usedSuppliers = suppliers.filter(s => (parts ?? []).some(p => p.supplier_id === s.id));
  const usedCats = PART_CATEGORIES.filter(c => (parts ?? []).some(p => p.category === c.value));

  return (
    <WorkshopLayout>
      <div className="max-w-5xl mx-auto space-y-4 pb-28">
        <StockTabs title="Contagem de estoque" subtitle="Digite quanto tem na prateleira. Peça em branco não muda. Ao salvar, cada diferença vira um ajuste no histórico."
          actions={<Link to="/oficina/pecas" className="btn-ghost border border-steel-200 text-sm !py-2">← Peças</Link>} />

        <div className="flex flex-col sm:flex-row gap-2">
          <input className="input flex-1" placeholder="🔍 Buscar peça, código ou marca" value={q} onChange={e => setQ(e.target.value)} />
          <div className="flex gap-2">
            <select className="input !py-2 flex-1 sm:!w-auto text-sm" value={scope} onChange={e => setScope(e.target.value as typeof scope)}>
              <option value="todas">Todas as peças</option>
              <option value="compradas">Só as que vieram de nota de compra</option>
              <option value="com_estoque">Só com estoque no sistema</option>
              <option value="pendentes">Ainda não contadas</option>
            </select>
            {usedCats.length > 1 && (
              <select className="input !py-2 flex-1 sm:!w-auto text-sm" value={cat} onChange={e => setCat(e.target.value as PartCategory | '')}>
                <option value="">Todas as categorias</option>
                {usedCats.map(c => <option key={c.value} value={c.value}>{c.icon} {c.label}</option>)}
              </select>
            )}
            {usedSuppliers.length > 0 && (
              <select className="input !py-2 flex-1 sm:!w-auto text-sm hidden md:block" value={supplierF} onChange={e => setSupplierF(e.target.value)}>
                <option value="">Todos os fornecedores</option>
                {usedSuppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            )}
          </div>
        </div>

        {parts === null ? (
          <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-14 bg-white rounded-2xl animate-pulse" />)}</div>
        ) : list.length === 0 ? (
          <div className="card text-center py-8 text-sm text-steel-500">Nenhuma peça com esses filtros.</div>
        ) : (
          <div className="card !p-0">
            <div className="hidden sm:grid grid-cols-[minmax(0,1fr)_90px_120px_80px] gap-3 px-5 py-2 bg-steel-50 border-b border-steel-100 rounded-t-2xl text-[10px] font-bold text-steel-500 uppercase tracking-wider">
              <div>Peça</div><div className="text-right">No sistema</div><div className="text-right">Contei</div><div className="text-right">Diferença</div>
            </div>
            <ul className="divide-y divide-steel-100">
              {list.slice(0, limit).map(p => {
                const v = valOf(p.id);
                const diff = v != null && !Number.isNaN(v) ? v - Number(p.stock_qty) : null;
                return (
                  <li key={p.id} className={`grid grid-cols-[minmax(0,1fr)_110px] sm:grid-cols-[minmax(0,1fr)_90px_120px_80px] gap-3 px-4 sm:px-5 py-2.5 items-center ${v != null ? 'bg-signal-50/40' : ''}`}>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold truncate">{p.name}</div>
                      <div className="text-[11px] text-steel-500 truncate">
                        {[p.code, partCategory(p.category).label].filter(Boolean).join(' · ')}
                        <span className="sm:hidden"> · sistema {fmtQty(p.stock_qty)} {p.unit}</span>
                        {diff != null && Math.abs(diff) > 0.0005 && (
                          <span className={`sm:hidden font-semibold ${diff > 0 ? 'text-signal-700' : 'text-alert-600'}`}> ({diff > 0 ? '+' : ''}{fmtQty(diff)})</span>
                        )}
                      </div>
                    </div>
                    <div className="hidden sm:block text-right text-sm text-steel-600">{fmtQty(p.stock_qty)} <span className="text-xs text-steel-400">{p.unit}</span></div>
                    <input inputMode="decimal" placeholder="—" value={counts[p.id] ?? ''}
                      onChange={e => setCounts(c => ({ ...c, [p.id]: e.target.value }))}
                      className={`input !py-2 text-right text-base font-semibold ${Number.isNaN(v) ? '!border-alert-500' : ''}`} />
                    <div className="hidden sm:block text-right text-sm font-semibold">
                      {diff == null ? <span className="text-steel-300">—</span>
                        : Math.abs(diff) < 0.0005 ? <span className="text-signal-700">ok</span>
                        : <span className={diff > 0 ? 'text-signal-700' : 'text-alert-600'}>{diff > 0 ? '+' : ''}{fmtQty(diff)}</span>}
                    </div>
                  </li>
                );
              })}
            </ul>
            {list.length > limit && (
              <button onClick={() => setLimit(l => l + PAGE)} className="w-full py-3 text-sm font-semibold text-brand-700 border-t border-steel-100 hover:bg-steel-50">
                Mostrar mais ({list.length - limit} restantes)
              </button>
            )}
          </div>
        )}
      </div>

      {/* Barra de salvar (fixa) */}
      <div className="fixed bottom-[60px] lg:bottom-0 inset-x-0 lg:left-64 z-30 border-t border-steel-200 bg-white/95 backdrop-blur px-4 py-3">
        <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm">
            <strong>{typed.length}</strong> contada{typed.length === 1 ? '' : 's'} · <strong className={changes.length ? 'text-pending-700' : ''}>{changes.length}</strong> com diferença
            {invalid.length > 0 && <span className="text-alert-600"> · {invalid.length} inválida{invalid.length === 1 ? '' : 's'}</span>}
            <span className="block text-[11px] text-steel-400">O que você digitou fica guardado neste aparelho até salvar.</span>
          </div>
          <div className="flex gap-2">
            {typed.length > 0 && !saving && (
              <button className="btn-ghost text-sm" onClick={() => { if (confirm('Apagar tudo que foi digitado nesta contagem?')) setCounts({}); }}>Limpar</button>
            )}
            <button className="btn-primary" onClick={save} disabled={!!saving || typed.length === 0}>
              {saving ? `Salvando ${saving.done}/${saving.total}…` : 'Salvar contagem'}
            </button>
          </div>
        </div>
      </div>
    </WorkshopLayout>
  );
}
