import { FormEvent, useEffect, useState } from 'react';
import WorkshopLayout from '@/components/layout/WorkshopLayout';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { ServiceOrder, Customer, Vehicle, Workshop, OsStatus } from '@/types/database';

type OsRow = ServiceOrder & { customer: Customer | null; vehicle: Vehicle | null };

const STATUSES: OsStatus[] = ['open', 'in_progress', 'completed', 'cancelled'];
const EMPTY = { title: '', description: '', mechanic_name: '', price: '', customer_id: '', vehicle_id: '' };

export default function ServiceOrders() {
  const { user } = useAuth();
  const [shop, setShop]         = useState<Workshop | null>(null);
  const [list, setList]         = useState<OsRow[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [filter, setFilter]     = useState<OsStatus | 'all'>('all');
  const [modal, setModal]       = useState(false);
  const [detail, setDetail]     = useState<OsRow | null>(null);
  const [form, setForm]         = useState(EMPTY);
  const [saving, setSaving]     = useState(false);

  useEffect(() => { if (user) load(); }, [user]);

  async function load() {
    const { data: w } = await supabase.from('workshops').select('*').eq('profile_id', user!.id).maybeSingle();
    setShop(w as Workshop);
    if (w?.id) {
      await Promise.all([fetchOS(w.id), fetchCustomers(w.id)]);
    }
  }

  async function fetchOS(wid: string) {
    const { data } = await supabase
      .from('service_orders')
      .select('*, customer:customers(*), vehicle:vehicles(*)')
      .eq('workshop_id', wid)
      .order('created_at', { ascending: false });
    setList((data as OsRow[]) ?? []);
  }

  async function fetchCustomers(wid: string) {
    const { data } = await supabase.from('customers').select('*').eq('workshop_id', wid).order('full_name');
    setCustomers((data as Customer[]) ?? []);
  }

  async function loadVehicles(customerId: string) {
    if (!shop) return;
    const { data } = await supabase.from('vehicles').select('*').eq('customer_id', customerId).eq('workshop_id', shop.id);
    setVehicles((data as Vehicle[]) ?? []);
  }

  async function saveOS(e: FormEvent) {
    e.preventDefault();
    if (!shop) return;
    setSaving(true);
    await supabase.from('service_orders').insert({
      workshop_id:   shop.id,
      title:         form.title.trim(),
      description:   form.description.trim() || null,
      mechanic_name: form.mechanic_name.trim() || null,
      price:         Number(form.price) || 0,
      customer_id:   form.customer_id || null,
      vehicle_id:    form.vehicle_id  || null,
      status:        'open',
    });
    await fetchOS(shop.id);
    setModal(false); setForm(EMPTY); setVehicles([]);
    setSaving(false);
  }

  async function updateStatus(os: OsRow, status: OsStatus) {
    const extra = status === 'completed' ? { completed_at: new Date().toISOString() } : {};
    await supabase.from('service_orders').update({ status, ...extra }).eq('id', os.id);
    setList(prev => prev.map(o => o.id === os.id ? { ...o, status, ...extra } : o));
    if (detail?.id === os.id) setDetail(d => d ? { ...d, status, ...extra } : d);
  }

  function f(k: keyof typeof EMPTY) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm(p => ({ ...p, [k]: e.target.value }));
  }

  const filtered = filter === 'all' ? list : list.filter(o => o.status === filter);

  const counts = STATUSES.reduce((acc, s) => ({ ...acc, [s]: list.filter(o => o.status === s).length }), {} as Record<string, number>);

  return (
    <WorkshopLayout>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Ordens de Serviço</h1>
          <p className="text-sm text-steel-500 mt-1">{list.length} OS no total</p>
        </div>
        <button onClick={() => setModal(true)} className="btn-primary btn-lg">+ Nova OS</button>
      </div>

      {/* KPIs rápidos */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {STATUSES.map(s => (
          <button key={s} onClick={() => setFilter(prev => prev === s ? 'all' : s)}
            className={`card text-center transition hover:shadow-md ${filter === s ? 'ring-2 ring-brand-500' : ''}`}>
            <div className="text-2xl font-bold font-display">{counts[s] ?? 0}</div>
            <div className={`text-xs font-semibold mt-0.5 ${osColor(s).replace('badge-', 'text-').replace('pending', 'pending-600').replace('brand', 'brand-600').replace('success', 'signal-600').replace('alert', 'alert-600')}`}>
              {osLabel(s)}
            </div>
          </button>
        ))}
      </div>

      {/* Lista */}
      {filtered.length === 0 ? (
        <div className="card text-center text-steel-500 py-16">
          {list.length === 0
            ? <><p className="text-lg font-semibold">Nenhuma OS ainda</p><p className="text-sm mt-1">Crie a primeira ordem de serviço da sua oficina.</p></>
            : 'Nenhuma OS com esse status.'}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(os => (
            <button key={os.id} onClick={() => setDetail(os)}
              className="card w-full text-left hover:shadow-md transition hover:-translate-y-0.5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`badge ${osColor(os.status)}`}>{osLabel(os.status)}</span>
                    <span className="font-bold truncate">{os.title}</span>
                  </div>
                  <div className="text-sm text-steel-500 mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                    {os.customer && <span>👤 {os.customer.full_name}</span>}
                    {os.vehicle  && <span>🚗 {os.vehicle.plate} · {os.vehicle.make} {os.vehicle.model}</span>}
                    {os.mechanic_name && <span>🔧 {os.mechanic_name}</span>}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-lg font-bold font-display">R$ {os.price.toFixed(0)}</div>
                  <div className="text-xs text-steel-400">{new Date(os.created_at).toLocaleDateString('pt-BR')}</div>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Detalhe OS */}
      {detail && (
        <div className="fixed inset-0 bg-steel-900/60 grid place-items-center p-4 z-50" onClick={() => setDetail(null)}>
          <div onClick={e => e.stopPropagation()} className="card max-w-lg w-full space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <span className={`badge ${osColor(detail.status)} mb-2`}>{osLabel(detail.status)}</span>
                <h2 className="text-xl font-bold">{detail.title}</h2>
                <p className="text-xs text-steel-500">{new Date(detail.created_at).toLocaleString('pt-BR')}</p>
              </div>
              <button onClick={() => setDetail(null)} className="text-steel-400 hover:text-steel-700 text-xl">✕</button>
            </div>

            {detail.description && <p className="text-sm text-steel-600 bg-steel-50 rounded-xl p-3">{detail.description}</p>}

            <div className="grid grid-cols-2 gap-3 text-sm">
              {detail.customer && <div className="card !p-3"><div className="label">Cliente</div><div className="font-semibold">{detail.customer.full_name}</div></div>}
              {detail.vehicle  && <div className="card !p-3"><div className="label">Veículo</div><div className="font-semibold uppercase">{detail.vehicle.plate} · {detail.vehicle.make} {detail.vehicle.model}</div></div>}
              {detail.mechanic_name && <div className="card !p-3"><div className="label">Mecânico</div><div className="font-semibold">{detail.mechanic_name}</div></div>}
              <div className="card !p-3"><div className="label">Valor</div><div className="font-bold font-display text-lg">R$ {detail.price.toFixed(2)}</div></div>
            </div>

            {/* Alterar status */}
            {detail.status !== 'completed' && detail.status !== 'cancelled' && (
              <div>
                <div className="label mb-2">Alterar status</div>
                <div className="flex gap-2 flex-wrap">
                  {STATUSES.filter(s => s !== detail.status && s !== 'open').map(s => (
                    <button key={s} onClick={() => updateStatus(detail, s)}
                      className={`btn text-sm ${s === 'completed' ? 'btn-primary' : s === 'cancelled' ? 'btn-danger' : 'btn-secondary'}`}>
                      {osLabel(s)}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal nova OS */}
      {modal && (
        <div className="fixed inset-0 bg-steel-900/60 grid place-items-center p-4 z-50" onClick={() => setModal(false)}>
          <form onSubmit={saveOS} onClick={e => e.stopPropagation()} className="card max-w-lg w-full space-y-4 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold sticky top-0 bg-white py-1">Nova Ordem de Serviço</h2>

            <div><label className="label">Título do serviço *</label>
              <input className="input" required value={form.title} onChange={f('title')} placeholder="Ex.: Troca de correia dentada" /></div>

            <div><label className="label">Descrição / diagnóstico</label>
              <textarea className="input" rows={3} value={form.description} onChange={f('description')} placeholder="Descreva o problema, peças necessárias…" /></div>

            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Mecânico responsável</label>
                <input className="input" value={form.mechanic_name} onChange={f('mechanic_name')} placeholder="Nome do mecânico" /></div>
              <div><label className="label">Valor (R$)</label>
                <input className="input" type="number" min={0} value={form.price} onChange={f('price')} placeholder="0" /></div>
            </div>

            <div><label className="label">Cliente</label>
              <select className="input" value={form.customer_id} onChange={e => { f('customer_id')(e); setForm(p => ({ ...p, vehicle_id: '' })); if (e.target.value) loadVehicles(e.target.value); else setVehicles([]); }}>
                <option value="">— Selecionar cliente —</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}
              </select>
            </div>

            {form.customer_id && (
              <div><label className="label">Veículo</label>
                <select className="input" value={form.vehicle_id} onChange={f('vehicle_id')}>
                  <option value="">— Selecionar veículo —</option>
                  {vehicles.map(v => <option key={v.id} value={v.id}>{v.plate} · {v.make} {v.model}</option>)}
                </select>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => { setModal(false); setVehicles([]); }} className="btn-ghost flex-1">Cancelar</button>
              <button className="btn-primary flex-1 btn-lg" disabled={saving}>{saving ? '…' : 'Criar OS'}</button>
            </div>
          </form>
        </div>
      )}
    </WorkshopLayout>
  );
}

function osLabel(s: string) {
  return ({ open: 'Aberta', in_progress: 'Em andamento', completed: 'Concluída', cancelled: 'Cancelada' } as Record<string, string>)[s] ?? s;
}
function osColor(s: string) {
  return ({ open: 'badge-pending', in_progress: 'badge-brand', completed: 'badge-success', cancelled: 'badge-alert' } as Record<string, string>)[s] ?? '';
}
