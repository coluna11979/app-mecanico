import { FormEvent, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from '@/components/ui/Toast';
import { plateNorm } from '@/lib/customers';
import { DuplicateWarning, findDuplicatesRemote } from './CustomerForm';
import type { Vehicle } from '@/types/database';

/** Cadastro ou edição de carro de um cliente */
export default function VehicleForm({ workshopId, customerId, customerName, vehicle, onClose, onSaved }: {
  workshopId: string; customerId: string; customerName: string; vehicle?: Vehicle | null;
  onClose: () => void; onSaved: () => void;
}) {
  const editing = !!vehicle;
  const [f, setF] = useState({
    plate: vehicle?.plate ?? '', make: vehicle?.make ?? '', model: vehicle?.model ?? '',
    year: vehicle?.year ? String(vehicle.year) : '', color: vehicle?.color ?? '', notes: vehicle?.notes ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [dups, setDups] = useState<{ id: string; full_name: string; reason: string }[]>([]);
  const [ignoreDups, setIgnoreDups] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF(s => ({ ...s, [k]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    const plate = plateNorm(f.plate);
    if (!plate || !f.make.trim() || !f.model.trim()) { toast.error('Informe placa, marca e modelo.'); return; }
    setSaving(true);
    if (!ignoreDups && (!editing || plate !== plateNorm(vehicle!.plate))) {
      const found = (await findDuplicatesRemote(workshopId, { plate })).filter(d => d.id !== customerId || !editing);
      if (found.length) { setDups(found); setSaving(false); return; }
    }
    const payload = {
      plate, make: f.make.trim(), model: f.model.trim(), year: f.year ? Number(f.year) : null,
      color: f.color.trim() || null, notes: f.notes.trim() || null,
    };
    const { error } = editing
      ? await supabase.from('vehicles').update(payload).eq('id', vehicle!.id)
      : await supabase.from('vehicles').insert({ ...payload, customer_id: customerId, workshop_id: workshopId });
    setSaving(false);
    if (error) { toast.error('Não foi possível salvar: ' + error.message); return; }
    toast.success(editing ? 'Carro atualizado ✓' : 'Carro cadastrado ✓');
    onSaved();
  }

  return (
    <div className="fixed inset-0 bg-steel-900/60 grid place-items-center p-4 z-50" onClick={onClose}>
      <form onSubmit={submit} onClick={e => e.stopPropagation()} className="card max-w-md w-full space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">{editing ? 'Editar carro' : `Novo carro — ${customerName.split(' ')[0]}`}</h2>
          <button type="button" onClick={onClose} className="text-steel-400 hover:text-steel-700 text-xl">✕</button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">Placa *</label>
            <input className="input uppercase" required value={f.plate} placeholder="ABC1D23"
              onChange={e => { setF(s => ({ ...s, plate: e.target.value.toUpperCase() })); setIgnoreDups(false); setDups([]); }} /></div>
          <div><label className="label">Ano</label>
            <input className="input" type="number" min={1950} max={2030} value={f.year} onChange={set('year')} placeholder="2020" /></div>
          <div><label className="label">Marca *</label>
            <input className="input" required value={f.make} onChange={set('make')} placeholder="Chevrolet" /></div>
          <div><label className="label">Modelo *</label>
            <input className="input" required value={f.model} onChange={set('model')} placeholder="Onix" /></div>
          <div><label className="label">Cor</label>
            <input className="input" value={f.color} onChange={set('color')} placeholder="Prata" /></div>
          <div><label className="label">Obs. técnicas</label>
            <input className="input" value={f.notes} onChange={set('notes')} placeholder="Ex.: óleo 5W30 sintético" /></div>
        </div>
        {dups.length > 0 && !ignoreDups && (
          <DuplicateWarning dups={dups} ignoreLabel="Salvar assim mesmo" onIgnore={() => { setIgnoreDups(true); setDups([]); }} />
        )}
        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onClose} className="btn-ghost flex-1">Cancelar</button>
          <button className="btn-primary flex-1" disabled={saving}>{saving ? 'Salvando…' : 'Salvar'}</button>
        </div>
      </form>
    </div>
  );
}
