import { useCallback, useEffect, useMemo, useState } from 'react';
import WorkshopLayout from '@/components/layout/WorkshopLayout';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/components/ui/Toast';
import { canDo, useOperator } from '@/lib/operators';
import { fmtBRL, moneyInput, parseMoney } from '@/components/os/osHelpers';
import {
  UNITS, fmtPct, loadDefaultMargin, marginOf, priceFromMargin, priceModeOf, salePriceOf,
  type PriceMode, type WorkshopPart,
} from '@/lib/parts';

export default function Pecas() {
  const { currentWorkshop } = useAuth();
  const wid = currentWorkshop?.id ?? null;
  const { balcao, session } = useOperator();
  const allowed = canDo(session, balcao, 'ver_financeiro');

  const [parts, setParts]       = useState<WorkshopPart[] | null>(null);
  const [margin, setMargin]     = useState<number | null>(null);
  const [q, setQ]               = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing]   = useState<WorkshopPart | 'new' | null>(null);

  const load = useCallback(async () => {
    if (!wid) return;
    const [p, m] = await Promise.all([
      supabase.from('workshop_parts').select('*').eq('workshop_id', wid).order('name'),
      loadDefaultMargin(wid),
    ]);
    setParts((p.data as WorkshopPart[]) ?? []);
    setMargin(m);
  }, [wid]);

  useEffect(() => { if (allowed) load(); }, [load, allowed]);

  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (parts ?? []).filter(p => (showInactive || p.active) && (!t
      || p.name.toLowerCase().includes(t) || p.code?.toLowerCase().includes(t)
      || p.brand?.toLowerCase().includes(t) || p.supplier?.toLowerCase().includes(t)));
  }, [parts, q, showInactive]);

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
            <h1 className="text-3xl font-bold tracking-tight">🔩 Peças e preços</h1>
            <p className="text-sm text-steel-500 mt-1">Custo de compra e preço de venda. O orçamento puxa o preço daqui.</p>
          </div>
          <button className="btn-primary" onClick={() => setEditing('new')}>+ Nova peça</button>
        </div>

        {margin != null && wid && <DefaultMargin wid={wid} value={margin} onSaved={v => setMargin(v)} />}

        <div className="flex flex-wrap items-center gap-3">
          <input className="input !w-auto flex-1 min-w-[220px]" placeholder="Buscar por nome, código, marca ou fornecedor"
            value={q} onChange={e => setQ(e.target.value)} />
          {inactiveCount > 0 && (
            <label className="text-sm text-steel-600 flex items-center gap-2">
              <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} />
              Mostrar desativadas ({inactiveCount})
            </label>
          )}
        </div>

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
          <div className="card text-center py-8 text-sm text-steel-500">Nenhuma peça encontrada para “{q}”.</div>
        ) : (
          <div className="card !p-0 overflow-hidden">
            <div className="hidden md:grid grid-cols-12 gap-2 px-5 py-2 bg-steel-50 border-b border-steel-100 text-[10px] font-bold text-steel-500 uppercase tracking-wider">
              <div className="col-span-5">Peça</div>
              <div className="col-span-2 text-right">Custo</div>
              <div className="col-span-2 text-right">Margem</div>
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
                      <div className="col-span-12 md:col-span-5 min-w-0">
                        <div className="text-sm font-semibold truncate">{p.name}{!p.active && <span className="badge bg-steel-100 text-steel-500 ml-2">desativada</span>}</div>
                        <div className="text-xs text-steel-500 truncate">
                          {[p.code, p.brand, p.supplier].filter(Boolean).join(' · ') || `por ${p.unit}`}
                        </div>
                      </div>
                      <div className="col-span-4 md:col-span-2 text-right">
                        <span className="md:hidden text-[10px] text-steel-400 uppercase block">Custo</span>
                        <span className="text-sm">{fmtBRL(p.cost)}</span>
                      </div>
                      <div className="col-span-4 md:col-span-2 text-right">
                        <span className="md:hidden text-[10px] text-steel-400 uppercase block">Margem</span>
                        <span className="text-sm">{fmtPct(marginOf(Number(p.cost), price))}</span>
                        <span className="block text-[10px] text-steel-400">{mode === 'default' ? 'padrão' : mode === 'margin' ? 'própria' : 'preço fixo'}</span>
                      </div>
                      <div className="col-span-4 md:col-span-2 text-right">
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
  const [supplier, setSupplier] = useState(part?.supplier ?? '');
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

    const row = {
      workshop_id: wid,
      name: name.trim(),
      code: code.trim() || null,
      brand: brand.trim() || null,
      unit,
      supplier: supplier.trim() || null,
      cost: parseMoney(cost || '0'),
      margin_percent: mode === 'margin' ? m : null,
      sale_price: mode === 'fixed' ? f : null,
      active,
    };
    setSaving(true);
    const { error } = part
      ? await supabase.from('workshop_parts').update(row).eq('id', part.id)
      : await supabase.from('workshop_parts').insert(row);
    setSaving(false);
    if (error) return toast.error('Não foi possível salvar: ' + error.message);
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
              <input className="input" placeholder="Opcional" value={supplier} onChange={e => setSupplier(e.target.value)} />
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
