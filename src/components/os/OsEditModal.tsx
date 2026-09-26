import { FormEvent, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from '@/components/ui/Toast';
import type { Customer, ServiceOrder, Vehicle, WorkshopMechanic } from '@/types/database';
import { OS_CATEGORIES } from './osHelpers';

function toLocalInput(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

interface Props {
  os: ServiceOrder;
  workshopId: string;
  onClose: () => void;
  onSaved: () => void;
}

export default function OsEditModal({ os, workshopId, onClose, onSaved }: Props) {
  const [form, setForm] = useState({
    title:                os.title,
    description:          os.description ?? '',
    category:             os.category ?? '',
    notes:                os.notes ?? '',
    customer_id:          os.customer_id ?? '',
    vehicle_id:           os.vehicle_id ?? '',
    workshop_mechanic_id: os.workshop_mechanic_id ?? '',
    km_reading:           os.km_reading != null ? String(os.km_reading) : '',
    estimated_hours:      os.estimated_hours != null ? String(os.estimated_hours) : '',
    scheduled_at:         toLocalInput(os.scheduled_at),
  });
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [vehicles, setVehicles]   = useState<Vehicle[]>([]);
  const [mechs, setMechs]         = useState<WorkshopMechanic[]>([]);
  const [saving, setSaving]       = useState(false);

  useEffect(() => {
    supabase.from('customers').select('*').eq('workshop_id', workshopId).order('full_name')
      .then(({ data }) => setCustomers((data as Customer[]) ?? []));
    supabase.from('workshop_mechanics').select('*').eq('workshop_id', workshopId).eq('active', true).order('name')
      .then(({ data }) => setMechs((data as WorkshopMechanic[]) ?? []));
  }, [workshopId]);

  useEffect(() => {
    if (!form.customer_id) { setVehicles([]); return; }
    supabase.from('vehicles').select('*').eq('customer_id', form.customer_id).eq('workshop_id', workshopId)
      .then(({ data }) => setVehicles((data as Vehicle[]) ?? []));
  }, [form.customer_id, workshopId]);

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) { toast.error('Informe o título da OS'); return; }
    const km = form.km_reading ? parseInt(form.km_reading.replace(/\D/g, ''), 10) : null;
    const hours = form.estimated_hours ? Number(form.estimated_hours.replace(',', '.')) : null;
    if (hours != null && (!Number.isFinite(hours) || hours < 0)) { toast.error('Tempo estimado inválido'); return; }

    setSaving(true);
    const { error } = await supabase.from('service_orders').update({
      title:                form.title.trim(),
      description:          form.description.trim() || null,
      category:             form.category || null,
      notes:                form.notes.trim() || null,
      customer_id:          form.customer_id || null,
      vehicle_id:           form.customer_id ? (form.vehicle_id || null) : null,
      workshop_mechanic_id: form.workshop_mechanic_id || null,
      km_reading:           km,
      estimated_hours:      hours,
      scheduled_at:         form.scheduled_at ? new Date(form.scheduled_at).toISOString() : null,
    }).eq('id', os.id);
    setSaving(false);
    if (error) {
      console.error('[OsEditModal] erro:', error);
      toast.error('Não foi possível salvar: ' + error.message);
      return;
    }
    toast.success('OS atualizada ✓');
    onSaved();
  }

  return (
    <div className="fixed inset-0 bg-steel-900/60 z-50 flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
      <form onSubmit={save} onClick={e => e.stopPropagation()}
        className="bg-white w-full sm:max-w-2xl rounded-t-3xl sm:rounded-2xl max-h-[92vh] flex flex-col shadow-2xl">
        <div className="px-6 pt-5 pb-3 border-b border-steel-100 flex items-center justify-between">
          <h2 className="text-xl font-bold">Editar OS</h2>
          <button type="button" onClick={onClose} className="text-steel-400 hover:text-steel-700 text-xl">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Serviço */}
          <section className="space-y-3">
            <div className="text-[10px] font-bold text-steel-500 uppercase tracking-widest">Serviço</div>
            <div>
              <label className="label">Título *</label>
              <input className="input" value={form.title} onChange={set('title')} required />
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="label">Categoria</label>
                <select className="input" value={form.category} onChange={set('category')}>
                  <option value="">— Sem categoria —</option>
                  {OS_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Mecânico responsável</label>
                <select className="input" value={form.workshop_mechanic_id} onChange={set('workshop_mechanic_id')}>
                  <option value="">— Nenhum —</option>
                  {mechs.map(m => <option key={m.id} value={m.id}>{m.name}{m.specialty ? ` · ${m.specialty}` : ''}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="label">Descrição / relato do cliente</label>
              <textarea className="input" rows={3} value={form.description} onChange={set('description')}
                placeholder="O que o cliente relatou, diagnóstico, detalhes do serviço…" />
            </div>
          </section>

          {/* Cliente e veículo */}
          <section className="space-y-3">
            <div className="text-[10px] font-bold text-steel-500 uppercase tracking-widest">Cliente e veículo</div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="label">Cliente</label>
                <select className="input" value={form.customer_id}
                  onChange={e => setForm(f => ({ ...f, customer_id: e.target.value, vehicle_id: '' }))}>
                  <option value="">— Sem cliente —</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.full_name}{c.phone ? ` · ${c.phone}` : ''}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Veículo</label>
                <select className="input" value={form.vehicle_id} onChange={set('vehicle_id')} disabled={!form.customer_id}>
                  <option value="">{form.customer_id ? (vehicles.length ? '— Selecionar —' : 'Cliente sem veículo') : 'Escolha o cliente'}</option>
                  {vehicles.map(v => <option key={v.id} value={v.id}>{v.plate} · {v.make} {v.model}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">KM atual</label>
                <input className="input" inputMode="numeric" value={form.km_reading} onChange={set('km_reading')} placeholder="67000" />
              </div>
              <div>
                <label className="label">Tempo estimado (h)</label>
                <input className="input" inputMode="decimal" value={form.estimated_hours} onChange={set('estimated_hours')} placeholder="2" />
              </div>
            </div>
          </section>

          {/* Agenda e notas */}
          <section className="space-y-3">
            <div className="text-[10px] font-bold text-steel-500 uppercase tracking-widest">Agenda e notas</div>
            <div>
              <label className="label">Agendada para</label>
              <input className="input" type="datetime-local" value={form.scheduled_at} onChange={set('scheduled_at')} />
            </div>
            <div>
              <label className="label">Notas internas <span className="normal-case text-steel-400">(não aparecem na impressão)</span></label>
              <textarea className="input" rows={2} value={form.notes} onChange={set('notes')} />
            </div>
          </section>
        </div>

        <div className="px-6 py-4 border-t border-steel-100 flex gap-3">
          <button type="button" onClick={onClose} className="btn-ghost flex-1">Cancelar</button>
          <button className="btn-primary flex-1" disabled={saving}>{saving ? 'Salvando…' : 'Salvar alterações'}</button>
        </div>
      </form>
    </div>
  );
}
