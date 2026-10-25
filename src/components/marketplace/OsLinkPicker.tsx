import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { brl } from '@/lib/cash';

export type LinkedOs = {
  id: string; number: number | null; title: string;
  vehicle: { plate: string | null; make: string | null; model: string | null } | null;
};
export type LinkedOsItem = { id: string; text: string; amount: number };
/** OS escolhida + serviços (mão de obra) que o mecânico vai fazer */
export type OsLink = { os: LinkedOs; items: LinkedOsItem[]; itemIds: string[] };

const ACTIVE_OS = ['open', 'awaiting_approval', 'approved', 'in_progress'];

export const osNumber = (o: { id: string; number: number | null }) =>
  o.number != null ? String(o.number).padStart(4, '0') : o.id.slice(0, 8);
export const osCar = (o: LinkedOs) => [o.vehicle?.make, o.vehicle?.model].filter(Boolean).join(' ');

/**
 * "Ligar a uma OS" (opcional) na contratação: busca a OS aberta pelo número, placa ou carro
 * e marca quais serviços vão para o mecânico da plataforma — igual ao "Chamar mecânico" do Caixa.
 */
export default function OsLinkPicker({ wid, value, onChange }: {
  wid: string;
  value: OsLink | null;
  onChange: (v: OsLink | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [list, setList] = useState<LinkedOs[] | null>(null);
  const [loadingItems, setLoadingItems] = useState(false);

  useEffect(() => {
    if (!open || list) return;
    supabase.from('service_orders')
      .select('id, number, title, vehicle:vehicles(plate, make, model)')
      .eq('workshop_id', wid).in('status', ACTIVE_OS)
      .order('created_at', { ascending: false }).limit(60)
      .then(({ data }) => setList((data as unknown as LinkedOs[]) ?? []));
  }, [open, list, wid]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase().replace(/[\s-]/g, '');
    if (!list) return [];
    if (!t) return list.slice(0, 8);
    return list.filter(o =>
      [osNumber(o), String(o.number ?? ''), o.title, o.vehicle?.plate, o.vehicle?.make, o.vehicle?.model]
        .some(v => (v ?? '').toLowerCase().replace(/[\s-]/g, '').includes(t)),
    ).slice(0, 8);
  }, [list, q]);

  async function pick(os: LinkedOs) {
    setLoadingItems(true);
    const { data } = await supabase.from('service_order_items')
      .select('id, description, quantity, unit_price, executor')
      .eq('service_order_id', os.id).eq('kind', 'labor').order('position');
    setLoadingItems(false);
    const rows = (data as { id: string; description: string; quantity: number; unit_price: number; executor: string | null }[]) ?? [];
    const items = rows.map(r => ({
      id: r.id,
      text: Number(r.quantity) > 1 ? `${r.description} (${r.quantity}x)` : r.description,
      amount: Number(r.quantity) * Number(r.unit_price),
    }));
    // Se algum serviço já está marcado "plataforma", só esses vêm marcados
    const platform = rows.filter(r => r.executor === 'platform').map(r => r.id);
    onChange({ os, items, itemIds: platform.length ? platform : items.map(i => i.id) });
    setOpen(false); setQ('');
  }

  function toggleItem(id: string) {
    if (!value) return;
    const has = value.itemIds.includes(id);
    onChange({ ...value, itemIds: has ? value.itemIds.filter(x => x !== id) : [...value.itemIds, id] });
  }

  if (value) {
    const car = osCar(value.os);
    return (
      <div className="rounded-xl border border-steel-200 p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-semibold text-sm">🔗 OS nº {osNumber(value.os)}</div>
            <div className="text-xs text-steel-500 truncate">{[car, value.os.vehicle?.plate].filter(Boolean).join(' · ') || value.os.title}</div>
          </div>
          <button type="button" onClick={() => onChange(null)}
            className="shrink-0 h-9 px-2 text-xs font-semibold text-steel-500 active:text-steel-700">
            Remover
          </button>
        </div>
        {value.items.length > 0 ? (
          <div className="space-y-1">
            <div className="text-xs text-steel-500">Serviços que o mecânico vai fazer:</div>
            {value.items.map(i => (
              <label key={i.id} className="flex items-center gap-2 min-h-[40px] text-sm cursor-pointer">
                <input type="checkbox" className="h-5 w-5 accent-brand-500 shrink-0"
                  checked={value.itemIds.includes(i.id)} onChange={() => toggleItem(i.id)} />
                <span className="flex-1 min-w-0 truncate">{i.text}</span>
                <span className="text-xs text-steel-400 shrink-0">{i.amount > 0 ? brl(i.amount) : '—'}</span>
              </label>
            ))}
          </div>
        ) : (
          <div className="text-xs text-steel-500">Essa OS não tem serviços de mão de obra lançados.</div>
        )}
      </div>
    );
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
        className="w-full min-h-[44px] rounded-xl border border-dashed border-steel-300 px-3 text-sm font-semibold text-steel-600 active:bg-steel-50">
        🔗 Ligar a uma OS (opcional)
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-steel-200 p-3 space-y-2">
      <div className="flex gap-2">
        <input className="input flex-1" autoFocus placeholder="Nº da OS, placa ou carro…"
          value={q} onChange={e => setQ(e.target.value)} />
        <button type="button" onClick={() => { setOpen(false); setQ(''); }}
          className="shrink-0 h-11 px-3 text-sm font-semibold text-steel-500">Fechar</button>
      </div>
      {list === null || loadingItems ? (
        <div className="text-sm text-steel-400 py-2 text-center">Carregando…</div>
      ) : filtered.length === 0 ? (
        <div className="text-sm text-steel-400 py-2 text-center">Nenhuma OS aberta encontrada</div>
      ) : (
        <div className="max-h-48 overflow-y-auto divide-y divide-steel-100">
          {filtered.map(o => (
            <button key={o.id} type="button" onClick={() => pick(o)}
              className="w-full min-h-[44px] py-2 text-left flex items-center gap-2 active:bg-steel-50">
              <span className="font-semibold text-sm shrink-0">nº {osNumber(o)}</span>
              <span className="text-xs text-steel-500 truncate">
                {[osCar(o), o.vehicle?.plate].filter(Boolean).join(' · ') || o.title}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
