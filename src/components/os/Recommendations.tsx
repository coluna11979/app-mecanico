import { FormEvent, useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from '@/components/ui/Toast';
import type { ServiceRecommendation } from '@/types/database';

/**
 * Serviços recomendados para o futuro deste cliente (pendentes).
 * Base da reativação: é o serviço que o cliente já sabe que precisa fazer.
 */
export default function Recommendations({ workshopId, customerId, vehicleId, osId }: {
  workshopId: string;
  customerId: string;
  vehicleId: string | null;
  osId: string;
}) {
  const [list, setList]     = useState<ServiceRecommendation[]>([]);
  const [adding, setAdding] = useState(false);
  const [text, setText]     = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from('service_recommendations').select('*')
      .eq('customer_id', customerId).eq('status', 'pending')
      .order('recommended_at', { ascending: false });
    setList((data as ServiceRecommendation[]) ?? []);
  }, [customerId]);

  useEffect(() => { load(); }, [load]);

  async function setStatus(r: ServiceRecommendation, status: 'done' | 'dismissed') {
    const { error } = await supabase.from('service_recommendations').update({ status }).eq('id', r.id);
    if (error) { toast.error('Erro: ' + error.message); return; }
    setList(l => l.filter(x => x.id !== r.id));
    toast.success(status === 'done' ? 'Marcada como feita ✓' : 'Recomendação descartada');
  }

  async function add(e: FormEvent) {
    e.preventDefault();
    const description = text.trim();
    if (!description) return;
    setSaving(true);
    const { error } = await supabase.from('service_recommendations').insert({
      workshop_id: workshopId, customer_id: customerId, vehicle_id: vehicleId,
      service_order_id: osId, description, source: 'app',
    });
    setSaving(false);
    if (error) { toast.error('Erro: ' + error.message); return; }
    setText(''); setAdding(false);
    load();
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10px] font-bold text-steel-500 uppercase tracking-widest">🔧 Recomendado para o futuro</div>
        {!adding && (
          <button onClick={() => setAdding(true)} className="text-xs text-brand-600 font-semibold hover:underline">+ Adicionar</button>
        )}
      </div>

      {list.length === 0 && !adding && (
        <p className="text-sm text-steel-400">Nenhuma recomendação pendente.</p>
      )}

      <ul className="space-y-2">
        {list.map(r => (
          <li key={r.id} className="bg-pending-50 border border-pending-200 rounded-xl px-3 py-2">
            <div className="text-sm font-medium text-steel-800">{r.description}</div>
            <div className="flex items-center justify-between mt-1">
              <span className="text-[11px] text-steel-500">
                desde {new Date(r.recommended_at).toLocaleDateString('pt-BR')}
                {r.vehicle_id && vehicleId && r.vehicle_id !== vehicleId && ' · outro veículo'}
              </span>
              <span className="flex gap-2">
                <button onClick={() => setStatus(r, 'done')} className="text-[11px] font-semibold text-signal-700 hover:underline">✓ Feito</button>
                <button onClick={() => setStatus(r, 'dismissed')} className="text-[11px] text-steel-400 hover:text-alert-600">Descartar</button>
              </span>
            </div>
          </li>
        ))}
      </ul>

      {adding && (
        <form onSubmit={add} className="mt-2 space-y-2">
          <input className="input !py-2 text-sm" autoFocus placeholder="Ex.: Trocar pastilhas em 5.000 km"
            value={text} onChange={e => setText(e.target.value)} />
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => { setAdding(false); setText(''); }} className="btn-ghost text-xs !py-1.5">Cancelar</button>
            <button className="btn-primary text-xs !py-1.5" disabled={saving || !text.trim()}>{saving ? '…' : 'Salvar'}</button>
          </div>
        </form>
      )}
    </div>
  );
}
