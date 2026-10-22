import { FormEvent, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from '@/components/ui/Toast';
import { brl, moneyStr, parseMoney } from '@/lib/cash';

/**
 * Serviços ou peças salvos (Meus cadastros do módulo Plataforma): só nome e preço.
 * Mesmas tabelas da Tabela de serviços (workshop_services) e de Peças (workshop_parts):
 * ligar esses módulos depois não precisa migrar nada. Remover = desativar (some das listas).
 */
export type CatalogItem = { id: string; name: string; brand?: string | null; price: number; cost: number; minutes: number | null };
/** Nome com a marca da peça ("Pastilha · Cobreq") */
export const catalogLabel = (i: CatalogItem) => [i.name, i.brand].filter(Boolean).join(' · ');

export async function loadCatalog(wid: string, kind: 'service' | 'part'): Promise<CatalogItem[]> {
  if (kind === 'service') {
    const { data } = await supabase.from('workshop_services').select('id, name, price, estimated_minutes')
      .eq('workshop_id', wid).eq('active', true).order('name').limit(2000);
    return (data ?? []).map(s => ({ id: s.id, name: s.name, price: Number(s.price ?? 0), cost: 0, minutes: s.estimated_minutes ?? null }));
  }
  const { data } = await supabase.from('workshop_parts').select('id, name, brand, sale_price, cost')
    .eq('workshop_id', wid).eq('active', true).order('name').limit(2000);
  return (data ?? []).map(p => ({
    id: p.id, name: p.name, brand: p.brand ?? null,
    price: Number(p.sale_price ?? 0), cost: Number(p.cost ?? 0), minutes: null,
  }));
}

export default function CatalogTab({ wid, kind }: { wid: string; kind: 'service' | 'part' }) {
  const [list, setList] = useState<CatalogItem[] | null>(null);
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<CatalogItem | 'new' | null>(null);
  const isService = kind === 'service';

  const load = () => loadCatalog(wid, kind).then(setList);
  useEffect(() => { load(); }, [wid, kind]); // eslint-disable-line react-hooks/exhaustive-deps

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (list ?? []).filter(i => !t || catalogLabel(i).toLowerCase().includes(t));
  }, [list, q]);

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input className="input flex-1" type="search" placeholder={isService ? '🔍 Buscar serviço' : '🔍 Buscar peça'} value={q} onChange={e => setQ(e.target.value)} />
        <button type="button" onClick={() => setEditing('new')}
          className="shrink-0 h-11 px-4 rounded-xl bg-brand-500 text-white text-sm font-bold active:scale-[0.98]">＋ {isService ? 'Serviço' : 'Peça'}</button>
      </div>

      {list != null && list.length === 0 ? (
        <div className="rounded-2xl bg-white ring-1 ring-steel-200/70 text-center px-5 py-8">
          <div className="text-3xl" aria-hidden>{isService ? '🔧' : '📦'}</div>
          <div className="font-semibold text-steel-900 mt-2">{isService ? 'Nenhum serviço salvo' : 'Nenhuma peça salva'}</div>
          <p className="text-sm text-steel-600 mt-1">
            {isService ? 'Salve os serviços que você mais faz com o preço que cobra. No orçamento é só tocar.' : 'Salve as peças que você mais usa com o preço de venda. No orçamento é só tocar.'}
          </p>
        </div>
      ) : (
        <ul className="rounded-2xl bg-white ring-1 ring-steel-200/70 divide-y divide-steel-100 overflow-hidden">
          {shown.map(i => (
            <li key={i.id}>
              <button type="button" onClick={() => setEditing(i)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-steel-50 min-h-[52px]">
                <span className="flex-1 min-w-0">
                  <span className="block font-semibold text-steel-900 truncate">{catalogLabel(i)}</span>
                  {isService && i.minutes != null && <span className="block text-xs text-steel-500">~{fmtMinutes(i.minutes)}</span>}
                  {!isService && i.cost > 0 && <span className="block text-xs text-steel-500">custo {brl(i.cost)}</span>}
                </span>
                <span className="shrink-0 font-bold text-steel-900">{i.price > 0 ? brl(i.price) : <span className="text-xs text-steel-400 font-normal">sem preço</span>}</span>
              </button>
            </li>
          ))}
          {list != null && shown.length === 0 && <li className="px-4 py-6 text-center text-sm text-steel-500">Nada encontrado para "{q}".</li>}
        </ul>
      )}

      {editing && (
        <CatalogForm wid={wid} kind={kind} item={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
      )}
    </div>
  );
}

const fmtMinutes = (m: number) => (m >= 60 ? `${String(Math.round((m / 60) * 10) / 10).replace('.', ',')} h` : `${m} min`);

function CatalogForm({ wid, kind, item, onClose, onSaved }: {
  wid: string; kind: 'service' | 'part'; item: CatalogItem | null; onClose: () => void; onSaved: () => void;
}) {
  const isService = kind === 'service';
  const [name, setName] = useState(item?.name ?? '');
  const [price, setPrice] = useState(item && item.price > 0 ? moneyStr(item.price) : '');
  const [cost, setCost] = useState(item && item.cost > 0 ? moneyStr(item.cost) : '');
  const [hours, setHours] = useState(item?.minutes != null ? String(Math.round((item.minutes / 60) * 10) / 10).replace('.', ',') : '');
  const [busy, setBusy] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return toast.error('Informe o nome');
    const p = parseMoney(price || '0');
    if (!(p >= 0)) return toast.error('Preço inválido');
    setBusy(true);
    const minutes = hours.trim() ? Math.round(parseMoney(hours) * 60) || null : null;
    const row = isService
      ? { name: name.trim(), price: p, estimated_minutes: minutes }
      // Peça editada aqui não mexe em marca/código/estoque (isso é do módulo Peças)
      : { name: name.trim(), sale_price: p || null, cost: parseMoney(cost || '0') || 0 };
    const table = isService ? 'workshop_services' : 'workshop_parts';
    const { error } = item
      ? await supabase.from(table).update(row).eq('id', item.id).eq('workshop_id', wid)
      : await supabase.from(table).insert({ ...row, workshop_id: wid });
    setBusy(false);
    if (error) return toast.error('Não foi possível salvar: ' + error.message);
    toast.success(isService ? 'Serviço salvo' : 'Peça salva');
    onSaved();
  }

  async function remove() {
    if (!item || !confirm(`Remover "${catalogLabel(item)}" da lista?`)) return;
    setBusy(true);
    const { error } = await supabase.from(isService ? 'workshop_services' : 'workshop_parts')
      .update({ active: false }).eq('id', item.id).eq('workshop_id', wid);
    setBusy(false);
    if (error) return toast.error('Não foi possível remover: ' + error.message);
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-[60] bg-steel-900/70 flex items-end sm:items-center justify-center sm:p-4" onClick={() => !busy && onClose()}>
      <form onSubmit={save} onClick={e => e.stopPropagation()}
        className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl p-5 space-y-3">
        <h2 className="text-lg font-bold text-steel-900">{item ? 'Editar' : 'Novo'} {isService ? 'serviço' : 'peça'}</h2>
        <div><label className="label">Nome *</label>
          <input className="input" value={name} onChange={e => setName(e.target.value)} autoFocus={!item}
            placeholder={isService ? 'Ex.: Troca de pastilha de freio' : 'Ex.: Pastilha dianteira Gol'} /></div>
        <div className="grid grid-cols-2 gap-2">
          <div><label className="label">{isService ? 'Preço ao cliente' : 'Preço de venda'}</label>
            <input className="input" inputMode="decimal" placeholder="R$ 0,00" value={price} onChange={e => setPrice(e.target.value)} /></div>
          {isService ? (
            <div><label className="label">Tempo (horas)</label>
              <input className="input" inputMode="decimal" placeholder="Ex.: 1,5" value={hours} onChange={e => setHours(e.target.value)} /></div>
          ) : (
            <div><label className="label">Custo (opcional)</label>
              <input className="input" inputMode="decimal" placeholder="R$ 0,00" value={cost} onChange={e => setCost(e.target.value)} /></div>
          )}
        </div>
        <div className="flex gap-2 pt-1">
          {item && <button type="button" onClick={remove} disabled={busy} className="btn-ghost text-alert-700">Remover</button>}
          <button type="button" onClick={onClose} disabled={busy} className="btn-ghost flex-1">Cancelar</button>
          <button type="submit" disabled={busy} className="btn-primary flex-1">{busy ? 'Salvando…' : 'Salvar'}</button>
        </div>
      </form>
    </div>
  );
}
