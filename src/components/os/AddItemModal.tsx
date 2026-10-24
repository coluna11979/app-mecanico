import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from '@/components/ui/Toast';
import { moneyInput, parseMoney, fmtBRL } from './osHelpers';
import { whoPatch } from './OsItemsEditor';

type Member = { id: string; name: string; active?: boolean };
type Sugg = { name: string; price: number };

/**
 * ➕ Incluir novo item — na OS já aprovada (ainda não concluída): serviço extra que apareceu durante
 * o trabalho. Entra com valor e responsável, o total da OS é recalculado e o mecânico vê o item novo.
 */
export default function AddItemModal({ osId, workshopId, position, team, osMechanicId, initialDescription = '', initialPrice, onAdded, onClose, onSaved }: {
  osId: string; workshopId: string;
  /** Posição do novo item (depois dos que já existem) */
  position: number;
  team: Member[];
  osMechanicId: string | null;
  /** Vindo de uma recomendação: já abre com o texto dela */
  initialDescription?: string;
  /** Vindo de uma recomendação: valor que foi enviado ao cliente */
  initialPrice?: number | null;
  /** Depois de incluir (ex.: marcar a recomendação como feita) */
  onAdded?: () => void | Promise<void>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [desc, setDesc] = useState(initialDescription);
  const [qty, setQty] = useState('1');
  const [price, setPrice] = useState(initialPrice ? moneyInput(initialPrice) : '');
  const [who, setWho] = useState('');
  const [busy, setBusy] = useState(false);
  const [sugg, setSugg] = useState<Sugg[]>([]);

  useEffect(() => {
    supabase.from('workshop_services').select('name, price').eq('workshop_id', workshopId).eq('active', true).order('name')
      .then(({ data }) => setSugg(((data ?? []) as { name: string; price: number }[]).map(s => ({ name: s.name.trim(), price: Number(s.price) }))));
  }, [workshopId]);

  const q = parseMoney(qty);
  const p = parseMoney(price || '0');
  const total = Number.isFinite(q) && Number.isFinite(p) ? q * p : 0;
  const osName = osMechanicId ? team.find(m => m.id === osMechanicId)?.name : null;

  function onDesc(v: string) {
    setDesc(v);
    const m = sugg.find(s => s.name.toLowerCase() === v.trim().toLowerCase());
    if (m && !price && m.price > 0) setPrice(moneyInput(m.price));
  }

  async function save() {
    if (!desc.trim()) return toast.error('Informe o que é o item');
    if (!Number.isFinite(q) || q <= 0) return toast.error('Quantidade inválida');
    if (!Number.isFinite(p) || p < 0) return toast.error('Valor inválido');
    setBusy(true);
    const { error } = await supabase.from('service_order_items').insert({
      service_order_id: osId, workshop_id: workshopId, kind: 'labor', service_type: 'servico',
      description: desc.trim(), quantity: q, unit_price: p, position, ...whoPatch(who),
    });
    setBusy(false);
    if (error) return toast.error('Não foi possível incluir: ' + error.message);
    await onAdded?.();
    toast.success('Item incluído ✓ — o total da OS foi atualizado');
    onSaved();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 bg-steel-900/60 grid place-items-center p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl w-full max-w-md max-h-[92vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 mb-1">
          <h2 className="text-xl font-bold">Incluir novo item</h2>
          <button onClick={onClose} className="h-10 w-10 -mt-2 -mr-2 text-steel-400 hover:text-steel-700 text-xl leading-none" aria-label="Fechar">×</button>
        </div>
        <p className="text-sm text-steel-500 mb-4">Serviço extra durante o trabalho. Avise o cliente do novo valor.</p>

        <label className="label">O que é *</label>
        <input className="input" list={`add-item-sugg-${osId}`} autoFocus value={desc} onChange={e => onDesc(e.target.value)}
          placeholder="Ex.: Troca de fluido de freio" />
        <datalist id={`add-item-sugg-${osId}`}>
          {sugg.map(s => <option key={s.name} value={s.name}>{s.price > 0 ? fmtBRL(s.price) : ''}</option>)}
        </datalist>

        <div className="grid grid-cols-2 gap-3 mt-3">
          <div>
            <label className="label">Quantidade</label>
            <input className="input" inputMode="decimal" value={qty} onChange={e => setQty(e.target.value)} />
          </div>
          <div>
            <label className="label">Valor</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-steel-400 text-sm">R$</span>
              <input className="input !pl-9" inputMode="decimal" placeholder="0,00" value={price} onChange={e => setPrice(e.target.value)}
                onBlur={e => { const v = parseMoney(e.target.value); if (Number.isFinite(v)) setPrice(moneyInput(v)); }} />
            </div>
          </div>
        </div>

        <label className="label mt-3">Quem faz</label>
        <select className="input" value={who} onChange={e => setWho(e.target.value)}>
          <option value="">{osName ? `${osName} (responsável da OS)` : 'Escolher depois'}</option>
          {team.filter(m => (m.active ?? true) && m.id !== osMechanicId).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>

        <div className="flex items-center justify-between mt-4 text-sm">
          <span className="text-steel-500">Total do item</span>
          <strong className="text-lg">{fmtBRL(total)}</strong>
        </div>

        <button onClick={save} disabled={busy} className="btn-primary w-full mt-4">{busy ? 'Incluindo…' : 'Incluir na OS'}</button>
      </div>
    </div>
  );
}
