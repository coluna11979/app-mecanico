import { FormEvent, useEffect, useState } from 'react';
import WorkshopLayout from '@/components/layout/WorkshopLayout';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { Customer, Vehicle, ServiceOrder } from '@/types/database';

type CustomerFull = Customer & { vehicles: (Vehicle & { service_orders: ServiceOrder[] })[] };

const EMPTY_C = { full_name: '', phone: '', email: '', cpf: '', address: '', city: '', birth_date: '', veh_make: '', veh_model: '', veh_plate: '', veh_year: '' };
const EMPTY_V = { plate: '', make: '', model: '', year: '', color: '', notes: '' };

export default function Customers() {
  const { user, currentWorkshop } = useAuth();
  const shop = currentWorkshop;
  const [list, setList]         = useState<CustomerFull[]>([]);
  const [search, setSearch]     = useState('');
  const [selected, setSelected] = useState<CustomerFull | null>(null);
  const [modalC, setModalC]     = useState(false);
  const [modalV, setModalV]     = useState(false);
  const [formC, setFormC]       = useState(EMPTY_C);
  const [formV, setFormV]       = useState(EMPTY_V);
  const [saving, setSaving]     = useState(false);

  useEffect(() => {
    if (!user || !currentWorkshop) return;
    fetchCustomers(currentWorkshop.id);
  }, [user, currentWorkshop?.id]);

  async function fetchCustomers(wid: string) {
    const { data } = await supabase
      .from('customers')
      .select('*, vehicles(*, service_orders(*))')
      .eq('workshop_id', wid)
      .order('created_at', { ascending: false });
    setList((data as CustomerFull[]) ?? []);
  }

  async function saveCustomer(e: FormEvent) {
    e.preventDefault();
    if (!shop) return;
    setSaving(true);
    const payload = {
      workshop_id: shop.id,
      full_name:   formC.full_name.trim(),
      phone:       formC.phone.trim()      || null,
      email:       formC.email.trim()      || null,
      cpf:         formC.cpf.trim()        || null,
      address:     formC.address.trim()    || null,
      city:        formC.city.trim()       || null,
      birth_date:  formC.birth_date        || null,
    };
    const { data: custData } = await supabase.from('customers').insert(payload).select('*').single();
    if (custData && formC.veh_make.trim() && formC.veh_model.trim()) {
      await supabase.from('vehicles').insert({
        customer_id: custData.id,
        workshop_id: shop.id,
        plate: formC.veh_plate.toUpperCase().trim() || 'S/P',
        make:  formC.veh_make.trim(),
        model: formC.veh_model.trim(),
        year:  formC.veh_year ? parseInt(formC.veh_year) : null,
      });
    }
    await fetchCustomers(shop.id);
    setModalC(false); setFormC(EMPTY_C);
    setSaving(false);
  }

  async function saveVehicle(e: FormEvent) {
    e.preventDefault();
    if (!shop || !selected) return;
    setSaving(true);
    await supabase.from('vehicles').insert({
      ...formV, year: formV.year ? Number(formV.year) : null,
      customer_id: selected.id, workshop_id: shop.id
    });
    await fetchCustomers(shop.id);
    const updated = list.find(c => c.id === selected.id);
    if (updated) setSelected(updated);
    setModalV(false); setFormV(EMPTY_V);
    setSaving(false);
  }

  const filtered = list.filter(c =>
    c.full_name.toLowerCase().includes(search.toLowerCase()) ||
    c.phone?.includes(search) ||
    c.vehicles.some(v => v.plate.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <WorkshopLayout>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Clientes</h1>
          <p className="text-sm text-steel-500 mt-1">{list.length} cliente{list.length !== 1 ? 's' : ''} cadastrado{list.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={() => setModalC(true)} className="btn-primary btn-lg">+ Novo cliente</button>
      </div>

      {/* Busca */}
      <input className="input mb-6 max-w-sm" placeholder="Buscar por nome, telefone ou placa…"
        value={search} onChange={e => setSearch(e.target.value)} />

      {/* Lista */}
      {filtered.length === 0 ? (
        <div className="card text-center text-steel-500 py-16">
          {list.length === 0
            ? <><p className="text-lg font-semibold">Nenhum cliente ainda</p><p className="text-sm mt-1">Cadastre seu primeiro cliente e comece a construir o histórico.</p></>
            : 'Nenhum resultado para essa busca.'}
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(c => (
            <button key={c.id} onClick={() => setSelected(c)}
              className="card text-left hover:shadow-lg transition hover:-translate-y-0.5 group">
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-full bg-brand-500/10 grid place-items-center text-brand-600 font-bold text-lg shrink-0">
                  {c.full_name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold truncate">{c.full_name}</div>
                  <div className="text-xs text-steel-500">{c.phone ?? '—'}</div>
                </div>
                <div className="text-xs text-steel-400 shrink-0">
                  {c.vehicles.length} veículo{c.vehicles.length !== 1 ? 's' : ''}
                </div>
              </div>
              {c.vehicles.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1">
                  {c.vehicles.slice(0, 3).map(v => (
                    <span key={v.id} className="badge bg-steel-100 text-steel-700 uppercase">{v.plate}</span>
                  ))}
                  {c.vehicles.length > 3 && <span className="badge bg-steel-100 text-steel-500">+{c.vehicles.length - 3}</span>}
                </div>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Drawer do cliente */}
      {selected && (
        <div className="fixed inset-0 z-40 flex" onClick={() => setSelected(null)}>
          <div className="flex-1 bg-steel-900/50" />
          <div className="w-full max-w-lg bg-white h-full overflow-y-auto shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-steel-100 flex items-start justify-between">
              <div>
                <div className="h-14 w-14 rounded-full bg-brand-500 grid place-items-center text-white font-bold text-2xl mb-3">
                  {selected.full_name.charAt(0).toUpperCase()}
                </div>
                <h2 className="text-2xl font-bold">{selected.full_name}</h2>
                <div className="text-sm text-steel-500 mt-1 space-y-0.5">
                  {selected.phone      && <div>📞 {selected.phone}</div>}
                  {selected.email      && <div>✉️ {selected.email}</div>}
                  {selected.cpf        && <div>🪪 {selected.cpf}</div>}
                  {selected.birth_date && <div>🎂 {new Date(selected.birth_date + 'T00:00:00').toLocaleDateString('pt-BR')}</div>}
                  {(selected.address || selected.city) && (
                    <div>📍 {[selected.address, selected.city].filter(Boolean).join(' · ')}</div>
                  )}
                </div>
              </div>
              <button onClick={() => setSelected(null)} className="text-steel-400 hover:text-steel-700 text-2xl leading-none">✕</button>
            </div>

            <div className="p-6 flex-1">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold text-lg">Veículos</h3>
                <button onClick={() => setModalV(true)} className="btn-primary !py-1.5 !px-3 text-sm">+ Veículo</button>
              </div>

              {selected.vehicles.length === 0 ? (
                <p className="text-sm text-steel-400">Nenhum veículo cadastrado ainda.</p>
              ) : (
                <div className="space-y-4">
                  {selected.vehicles.map(v => (
                    <div key={v.id} className="card !p-4 border border-steel-100">
                      <div className="flex items-center gap-3 mb-3">
                        <span className="text-2xl">🚗</span>
                        <div>
                          <div className="font-bold uppercase tracking-wide">{v.plate}</div>
                          <div className="text-sm text-steel-500">{v.make} {v.model} {v.year ? `(${v.year})` : ''} {v.color ? `· ${v.color}` : ''}</div>
                        </div>
                      </div>
                      {v.notes && <p className="text-xs text-steel-500 mb-3 italic">{v.notes}</p>}

                      <div className="text-xs font-semibold text-steel-400 uppercase tracking-wider mb-2">
                        Histórico de OS ({v.service_orders.length})
                      </div>
                      {v.service_orders.length === 0 ? (
                        <p className="text-xs text-steel-400">Nenhuma OS neste veículo.</p>
                      ) : (
                        <div className="space-y-1.5">
                          {v.service_orders.slice(0, 5).map(os => (
                            <div key={os.id} className="flex justify-between items-center py-1 border-b border-steel-50 last:border-0">
                              <div>
                                <div className="text-sm font-semibold">{os.title}</div>
                                <div className="text-xs text-steel-400">{new Date(os.created_at).toLocaleDateString('pt-BR')}</div>
                              </div>
                              <div className="text-right">
                                <div className="text-sm font-bold">R$ {os.price.toFixed(0)}</div>
                                <span className={`badge text-[10px] ${osColor(os.status)}`}>{osLabel(os.status)}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal novo cliente */}
      {modalC && (
        <div className="fixed inset-0 bg-steel-900/60 grid place-items-center p-4 z-50" onClick={() => setModalC(false)}>
          <form onSubmit={saveCustomer} onClick={e => e.stopPropagation()} className="card max-w-md w-full space-y-4 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold">Novo cliente</h2>

            {/* Identificação */}
            <div className="bg-steel-50 rounded-xl p-4 space-y-3">
              <div className="text-[10px] font-bold text-steel-500 uppercase tracking-widest">Identificação</div>
              <div>
                <label className="label">Nome completo *</label>
                <input className="input" required value={formC.full_name}
                  onChange={e => setFormC(f => ({ ...f, full_name: e.target.value }))}
                  placeholder="Maria da Silva" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">CPF</label>
                  <input className="input" value={formC.cpf}
                    onChange={e => setFormC(f => ({ ...f, cpf: e.target.value }))}
                    placeholder="000.000.000-00" />
                </div>
                <div>
                  <label className="label">Data de nascimento</label>
                  <input className="input" type="date" value={formC.birth_date}
                    onChange={e => setFormC(f => ({ ...f, birth_date: e.target.value }))} />
                </div>
              </div>
            </div>

            {/* Contato */}
            <div className="bg-steel-50 rounded-xl p-4 space-y-3">
              <div className="text-[10px] font-bold text-steel-500 uppercase tracking-widest">Contato</div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Telefone / WhatsApp</label>
                  <input className="input" value={formC.phone}
                    onChange={e => setFormC(f => ({ ...f, phone: e.target.value }))}
                    placeholder="(11) 9 9999-9999" />
                </div>
                <div>
                  <label className="label">E-mail</label>
                  <input className="input" type="email" value={formC.email}
                    onChange={e => setFormC(f => ({ ...f, email: e.target.value }))}
                    placeholder="maria@email.com" />
                </div>
              </div>
            </div>

            {/* Endereço */}
            <div className="bg-steel-50 rounded-xl p-4 space-y-3">
              <div className="text-[10px] font-bold text-steel-500 uppercase tracking-widest">Endereço (opcional)</div>
              <div>
                <label className="label">Rua, número, bairro</label>
                <input className="input" value={formC.address}
                  onChange={e => setFormC(f => ({ ...f, address: e.target.value }))}
                  placeholder="Rua das Flores, 123 — Centro" />
              </div>
              <div>
                <label className="label">Cidade</label>
                <input className="input" value={formC.city}
                  onChange={e => setFormC(f => ({ ...f, city: e.target.value }))}
                  placeholder="São Paulo" />
              </div>
            </div>

            {/* Veículo */}
            <div className="bg-steel-50 rounded-xl p-4 space-y-3">
              <div className="text-[10px] font-bold text-steel-500 uppercase tracking-widest">🚗 Veículo (opcional — cadastra junto)</div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Marca</label>
                  <input className="input" value={formC.veh_make}
                    onChange={e => setFormC(f => ({ ...f, veh_make: e.target.value }))}
                    placeholder="Honda" />
                </div>
                <div>
                  <label className="label">Modelo</label>
                  <input className="input" value={formC.veh_model}
                    onChange={e => setFormC(f => ({ ...f, veh_model: e.target.value }))}
                    placeholder="Civic" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Placa</label>
                  <input className="input uppercase" value={formC.veh_plate}
                    onChange={e => setFormC(f => ({ ...f, veh_plate: e.target.value.toUpperCase() }))}
                    placeholder="ABC1D23" />
                </div>
                <div>
                  <label className="label">Ano</label>
                  <input className="input" type="number" min={1950} max={2030} value={formC.veh_year}
                    onChange={e => setFormC(f => ({ ...f, veh_year: e.target.value }))}
                    placeholder="2020" />
                </div>
              </div>
              {formC.veh_make && formC.veh_model && (
                <p className="text-xs text-signal-600 font-semibold">✓ O veículo será cadastrado junto com o cliente</p>
              )}
            </div>

            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setModalC(false)} className="btn-ghost flex-1">Cancelar</button>
              <button className="btn-primary flex-1" disabled={saving}>
                {saving ? '…' : formC.veh_make && formC.veh_model ? 'Salvar cliente + veículo' : 'Salvar cliente'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal novo veículo */}
      {modalV && selected && (
        <div className="fixed inset-0 bg-steel-900/60 grid place-items-center p-4 z-50" onClick={() => setModalV(false)}>
          <form onSubmit={saveVehicle} onClick={e => e.stopPropagation()} className="card max-w-md w-full space-y-4">
            <h2 className="text-xl font-bold">Novo veículo — {selected.full_name}</h2>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Placa *</label>
                <input className="input uppercase" required value={formV.plate} onChange={e => setFormV(f => ({ ...f, plate: e.target.value.toUpperCase() }))} placeholder="ABC1D23" /></div>
              <div><label className="label">Ano</label>
                <input className="input" type="number" min={1950} max={2030} value={formV.year} onChange={e => setFormV(f => ({ ...f, year: e.target.value }))} placeholder="2020" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Marca *</label>
                <input className="input" required value={formV.make} onChange={e => setFormV(f => ({ ...f, make: e.target.value }))} placeholder="Honda" /></div>
              <div><label className="label">Modelo *</label>
                <input className="input" required value={formV.model} onChange={e => setFormV(f => ({ ...f, model: e.target.value }))} placeholder="Civic" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Cor</label>
                <input className="input" value={formV.color} onChange={e => setFormV(f => ({ ...f, color: e.target.value }))} placeholder="Prata" /></div>
              <div><label className="label">Obs. técnicas</label>
                <input className="input" value={formV.notes} onChange={e => setFormV(f => ({ ...f, notes: e.target.value }))} placeholder="Ex.: troca óleo 10k km" /></div>
            </div>
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setModalV(false)} className="btn-ghost flex-1">Cancelar</button>
              <button className="btn-primary flex-1" disabled={saving}>{saving ? '…' : 'Salvar'}</button>
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
