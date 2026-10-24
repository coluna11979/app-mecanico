import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from '@/components/ui/Toast';
import type { ServiceOrderItem } from '@/types/database';
import { PLATFORM_ITEM, whoPatch } from './OsItemsEditor';
import { fmtBRL } from './osHelpers';

type Member = { id: string; name: string; active?: boolean };

/**
 * 🔧 Quem vai fazer — depois que a OS é aprovada, a gestão distribui os serviços.
 * Cada serviço começa com o responsável da OS; só se mexe no que for diferente.
 * Quem for escolhido passa a ver (e só ele) esse serviço no painel do mecânico.
 */
export default function ServiceAssign({ items, team, osMechanicId, onChanged }: {
  items: ServiceOrderItem[];
  team: Member[];
  osMechanicId: string | null;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const services = items.filter(i => i.kind === 'labor');
  if (!services.length) return null;
  const osName = osMechanicId ? team.find(m => m.id === osMechanicId)?.name : null;
  const valueOf = (i: ServiceOrderItem) => (i.executor === 'platform' ? PLATFORM_ITEM : i.workshop_mechanic_id ?? '');

  async function assign(i: ServiceOrderItem, v: string) {
    setBusy(i.id);
    const { error } = await supabase.from('service_order_items').update(whoPatch(v)).eq('id', i.id);
    setBusy(null);
    if (error) return toast.error('Não foi possível escolher: ' + error.message);
    onChanged();
  }

  return (
    <div className="rounded-xl border border-steel-200 divide-y divide-steel-100 mb-4">
      <div className="px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-steel-500">🔧 Quem vai fazer cada serviço</div>
      {services.map(i => (
        <div key={i.id} className="px-4 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <div className="flex-1 min-w-[160px]">
            <div className="text-sm font-medium text-steel-800 truncate">{i.description}</div>
            <div className="text-xs text-steel-500">{fmtBRL(Number(i.quantity) * Number(i.unit_price))}</div>
          </div>
          <select className="input !py-1.5 !px-2 !w-auto text-sm" value={valueOf(i)} disabled={busy === i.id}
            onChange={e => assign(i, e.target.value)}>
            <option value="">{osName ? `${osName} (responsável da OS)` : 'Escolher…'}</option>
            {team.filter(m => (m.active ?? true) && m.id !== osMechanicId).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            <option value={PLATFORM_ITEM}>🌐 Mecânico da plataforma</option>
          </select>
        </div>
      ))}
    </div>
  );
}
