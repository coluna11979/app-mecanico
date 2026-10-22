import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import WorkshopLayout from '@/components/layout/WorkshopLayout';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/components/ui/Toast';
import { jobDraftKey, jobDraftOriginKey } from '@/lib/callMechanic';
import { formatBRL } from '@/lib/payment';

type Vehicle = { id: string; make: string; model: string; year: number | null; plate: string; color: string | null };
type Customer = { id: string; full_name: string; phone: string | null; notes: string | null; created_at: string; vehicles: Vehicle[] };
type CustomerJob = { id: string; title: string; status: string; price: number | null; created_at: string; vehicle_id: string | null };

const STATUS: Record<string, string> = {
  open: 'Aguardando aceite', assigned: 'Aceita', in_progress: 'Em serviço',
  completed: 'Concluída', disputed: 'Em disputa', cancelled: 'Cancelada',
};

const onlyDigits = (s: string) => s.replace(/\D/g, '');
const carName = (v: Vehicle) => [v.make, v.model, v.year].filter(Boolean).join(' ');
/** "Gol prata 2015 · ABC1D23" — o mesmo texto do campo Veículo da Nova demanda */
const carLabel = (v: Vehicle) => [[carName(v), v.color].filter(Boolean).join(' '), v.plate].filter(Boolean).join(' · ');
const fmtPhone = (p: string) => {
  const d = onlyDigits(p);
  return d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : d.length === 10 ? `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}` : p;
};

type CarForm = { make: string; model: string; year: string; plate: string; color: string };
const EMPTY_CAR: CarForm = { make: '', model: '', year: '', plate: '', color: '' };

/**
 * 📇 Meus clientes — cadastro simples de clientes e carros para a oficina que usa só o módulo Plataforma.
 * Grava nas mesmas tabelas do módulo Clientes (customers / vehicles): se a oficina ligar Clientes ou OS
 * depois, os cadastros já estão lá. "Chamar mecânico" abre a Nova demanda com o carro preenchido.
 */
export default function PlataformaClientes() {
  const { currentWorkshop } = useAuth();
  const wid = currentWorkshop?.id ?? null;
  const nav = useNavigate();
  const [list, setList] = useState<Customer[] | null>(null);
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  /** Formulário: novo cliente, editar cliente ou novo carro de um cliente */
  const [form, setForm] = useState<null | { mode: 'new' | 'edit' | 'car'; id?: string }>(null);

  async function load() {
    if (!wid) return;
    const { data, error } = await supabase.from('customers')
      .select('id, full_name, phone, notes, created_at, vehicles(id, make, model, year, plate, color)')
      .eq('workshop_id', wid).order('full_name').limit(2000);
    if (error) { toast.error('Não foi possível carregar os clientes: ' + error.message); return; }
    setList((data ?? []) as Customer[]);
  }
  useEffect(() => { load(); }, [wid]); // eslint-disable-line react-hooks/exhaustive-deps

  const shown = useMemo(() => {
    const all = list ?? [];
    const t = q.trim().toLowerCase();
    if (!t) return all;
    const digits = onlyDigits(t);
    const plate = t.replace(/[^a-z0-9]/g, '');
    return all.filter(c => c.full_name.toLowerCase().includes(t)
      || (digits.length >= 3 && onlyDigits(c.phone ?? '').includes(digits))
      || c.vehicles.some(v => carName(v).toLowerCase().includes(t)
        || (plate.length >= 3 && v.plate.toLowerCase().replace(/[^a-z0-9]/g, '').includes(plate))));
  }, [list, q]);

  const current = list?.find(c => c.id === openId) ?? null;

  /** Nova demanda já com o carro e o cliente (o rascunho é aberto pelo ?nova=os do Demandas) */
  function callFor(c: Customer, v: Vehicle | null) {
    if (!wid) return;
    localStorage.setItem(jobDraftKey(wid), JSON.stringify({
      title: '', description: '', price_per_hour: '', max_hours: '', scheduled_at: '', pricing: 'fixed', total: '',
      vehicle: v ? carLabel(v) : '', customer_id: c.id, vehicle_id: v?.id ?? null,
    }));
    localStorage.setItem(jobDraftOriginKey(wid), 'cliente');
    nav('/oficina/dashboard?nova=os');
  }

  return (
    <WorkshopLayout>
      <div className="max-w-3xl mx-auto space-y-4">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-display text-2xl font-bold text-steel-900">📇 Meus clientes</h1>
            <p className="text-sm text-steel-500 mt-0.5">
              {list == null ? 'Carregando…' : `${list.length} ${list.length === 1 ? 'cliente' : 'clientes'} · busque por nome, telefone ou placa`}
            </p>
          </div>
          <button type="button" onClick={() => setForm({ mode: 'new' })}
            className="shrink-0 h-11 px-4 rounded-xl bg-brand-500 text-white text-sm font-bold active:scale-[0.98] hover:bg-brand-600">
            ＋ Novo cliente
          </button>
        </div>

        <input className="input" type="search" placeholder="🔍 Nome, telefone ou placa" value={q} onChange={e => setQ(e.target.value)} />

        {list != null && list.length === 0 ? (
          <div className="rounded-2xl bg-white ring-1 ring-steel-200/70 text-center px-5 py-8">
            <div className="text-3xl" aria-hidden>📇</div>
            <div className="font-semibold text-steel-900 mt-2">Nenhum cliente ainda</div>
            <p className="text-sm text-steel-600 mt-1">Cadastre o cliente e o carro uma vez. Depois é só tocar em "Chamar mecânico" que a demanda já vem com o carro.</p>
          </div>
        ) : (
          <ul className="rounded-2xl bg-white ring-1 ring-steel-200/70 divide-y divide-steel-100 overflow-hidden">
            {shown.map(c => (
              <li key={c.id}>
                <button type="button" onClick={() => setOpenId(c.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-steel-50 active:bg-steel-100 min-h-[60px]">
                  <span className="h-10 w-10 shrink-0 rounded-full bg-brand-50 grid place-items-center text-sm font-bold text-brand-700">
                    {c.full_name.trim().split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase()).join('')}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block font-semibold text-steel-900 truncate">{c.full_name}</span>
                    <span className="block text-xs text-steel-600 truncate">
                      {[c.phone ? fmtPhone(c.phone) : null, c.vehicles.map(v => `🚗 ${[v.model, v.plate].filter(Boolean).join(' ')}`).join('  ') || null].filter(Boolean).join(' · ') || 'Sem telefone nem carro'}
                    </span>
                  </span>
                  <span className="text-steel-400 shrink-0" aria-hidden>›</span>
                </button>
              </li>
            ))}
            {list != null && shown.length === 0 && (
              <li className="px-4 py-6 text-center text-sm text-steel-500">Nenhum cliente encontrado para "{q}".</li>
            )}
          </ul>
        )}
      </div>

      {current && !form && (
        <CustomerSheet c={current} onClose={() => setOpenId(null)} onCall={callFor}
          onEdit={() => setForm({ mode: 'edit', id: current.id })} onAddCar={() => setForm({ mode: 'car', id: current.id })} />
      )}

      {form && wid && (
        <CustomerForm wid={wid} mode={form.mode} customer={list?.find(c => c.id === form.id) ?? null}
          onClose={() => setForm(null)}
          onSaved={id => { setForm(null); setOpenId(id); load(); }} />
      )}
    </WorkshopLayout>
  );
}

/** Ficha do cliente: carros (cada um com "Chamar mecânico") e as demandas já feitas para ele */
function CustomerSheet({ c, onClose, onCall, onEdit, onAddCar }: {
  c: Customer; onClose: () => void; onCall: (c: Customer, v: Vehicle | null) => void; onEdit: () => void; onAddCar: () => void;
}) {
  const [jobs, setJobs] = useState<CustomerJob[] | null>(null);
  useEffect(() => {
    let alive = true;
    supabase.from('jobs').select('id, title, status, price, created_at, vehicle_id')
      .eq('customer_id', c.id).order('created_at', { ascending: false }).limit(30)
      .then(({ data }) => { if (alive) setJobs((data ?? []) as CustomerJob[]); });
    return () => { alive = false; };
  }, [c.id]);
  const phone = onlyDigits(c.phone ?? '');

  return (
    <div className="fixed inset-0 z-[60] bg-steel-900/70 flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[92vh] overflow-y-auto">
        <div className="p-5 space-y-4">
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <h2 className="text-xl font-bold text-steel-900 break-words">{c.full_name}</h2>
              {c.phone && <div className="text-sm text-steel-600 mt-0.5">{fmtPhone(c.phone)}</div>}
            </div>
            <button type="button" onClick={onClose} aria-label="Fechar" className="h-10 w-10 shrink-0 rounded-full bg-steel-100 grid place-items-center text-steel-600">✕</button>
          </div>

          <div className="flex gap-2">
            {phone.length >= 10 && (
              <a href={`https://wa.me/55${phone}`} target="_blank" rel="noreferrer"
                className="flex-1 h-11 rounded-xl border border-signal-300 text-signal-700 text-sm font-bold grid place-items-center">💬 WhatsApp</a>
            )}
            <button type="button" onClick={onEdit} className="flex-1 h-11 rounded-xl border border-steel-200 text-steel-800 text-sm font-bold">✏️ Editar</button>
          </div>

          {c.notes && <p className="text-sm text-steel-700 bg-steel-50 rounded-xl px-3 py-2 whitespace-pre-line">{c.notes}</p>}

          <div>
            <div className="text-xs font-semibold text-steel-500 uppercase tracking-wider mb-1.5">Carros</div>
            <div className="space-y-2">
              {c.vehicles.map(v => (
                <div key={v.id} className="flex items-center gap-3 rounded-xl ring-1 ring-steel-200 px-3 py-2.5">
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold text-steel-900 truncate">🚗 {[carName(v), v.color].filter(Boolean).join(' ')}</span>
                    {v.plate && <span className="block text-xs text-steel-600">{v.plate}</span>}
                  </span>
                  <button type="button" onClick={() => onCall(c, v)}
                    className="shrink-0 h-10 px-3 rounded-lg bg-brand-500 text-white text-xs font-bold active:scale-95">⚡ Chamar mecânico</button>
                </div>
              ))}
              {c.vehicles.length === 0 && (
                <button type="button" onClick={() => onCall(c, null)}
                  className="w-full h-11 rounded-xl bg-brand-500 text-white text-sm font-bold">⚡ Chamar mecânico</button>
              )}
              <button type="button" onClick={onAddCar} className="w-full h-10 rounded-xl border border-dashed border-steel-300 text-steel-700 text-sm font-semibold">＋ Adicionar carro</button>
            </div>
          </div>

          <div>
            <div className="text-xs font-semibold text-steel-500 uppercase tracking-wider mb-1.5">Demandas feitas</div>
            {jobs == null ? <div className="text-sm text-steel-500">Carregando…</div>
              : jobs.length === 0 ? <div className="text-sm text-steel-500">Nenhuma ainda. As que você chamar por aqui aparecem nesta lista.</div>
              : (
                <ul className="divide-y divide-steel-100 rounded-xl ring-1 ring-steel-200">
                  {jobs.map(j => {
                    const car = c.vehicles.find(v => v.id === j.vehicle_id);
                    return (
                      <li key={j.id} className="px-3 py-2.5 flex items-center justify-between gap-3">
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold text-steel-900 truncate">{j.title}</span>
                          <span className="block text-xs text-steel-500">
                            {new Date(j.created_at).toLocaleDateString('pt-BR')} · {STATUS[j.status] ?? j.status}{car ? ` · ${car.model}` : ''}
                          </span>
                        </span>
                        {j.price != null && <span className="shrink-0 text-sm font-bold text-steel-800">R$ {formatBRL(j.price, { decimals: 0 })}</span>}
                      </li>
                    );
                  })}
                </ul>
              )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Novo cliente (com o primeiro carro), editar cliente ou adicionar carro */
function CustomerForm({ wid, mode, customer, onClose, onSaved }: {
  wid: string; mode: 'new' | 'edit' | 'car'; customer: Customer | null;
  onClose: () => void; onSaved: (customerId: string) => void;
}) {
  const [name, setName] = useState(customer?.full_name ?? '');
  const [phone, setPhone] = useState(customer?.phone ?? '');
  const [notes, setNotes] = useState(customer?.notes ?? '');
  const [car, setCar] = useState<CarForm>(EMPTY_CAR);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const withCar = mode !== 'edit';
  const setC = (k: keyof CarForm) => (e: { target: { value: string } }) => setCar(s => ({ ...s, [k]: e.target.value }));

  async function save(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    if (mode !== 'car' && !name.trim()) return setErr('Informe o nome do cliente.');
    const anyCar = Object.values(car).some(x => x.trim());
    if (withCar && (anyCar || mode === 'car') && (!car.make.trim() || !car.model.trim())) return setErr('Informe a marca e o modelo do carro.');
    const year = car.year.trim() ? Number(car.year) : null;
    if (year != null && !(year >= 1950 && year <= new Date().getFullYear() + 1)) return setErr('Ano do carro inválido.');
    setBusy(true);
    let id = customer?.id ?? '';
    if (mode === 'new') {
      const { data, error } = await supabase.from('customers')
        .insert({ workshop_id: wid, full_name: name.trim(), phone: phone.trim() || null, notes: notes.trim() || null })
        .select('id').single();
      if (error || !data) { setBusy(false); return setErr('Não foi possível salvar: ' + (error?.message ?? '')); }
      id = data.id;
    } else if (mode === 'edit') {
      const { error } = await supabase.from('customers')
        .update({ full_name: name.trim(), phone: phone.trim() || null, notes: notes.trim() || null })
        .eq('id', id).eq('workshop_id', wid);
      if (error) { setBusy(false); return setErr('Não foi possível salvar: ' + error.message); }
    }
    if (withCar && car.make.trim() && car.model.trim()) {
      const { error } = await supabase.from('vehicles').insert({
        workshop_id: wid, customer_id: id, make: car.make.trim(), model: car.model.trim(), year,
        plate: car.plate.trim().toUpperCase(), color: car.color.trim() || null,
      });
      if (error) { setBusy(false); return setErr('Cliente salvo, mas o carro não: ' + error.message); }
    }
    setBusy(false);
    toast.success(mode === 'car' ? 'Carro adicionado' : 'Cliente salvo');
    onSaved(id);
  }

  return (
    <div className="fixed inset-0 z-[60] bg-steel-900/70 flex items-end sm:items-center justify-center sm:p-4" onClick={() => !busy && onClose()}>
      <form onSubmit={save} onClick={e => e.stopPropagation()}
        className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[92vh] overflow-y-auto p-5 space-y-3">
        <h2 className="text-lg font-bold text-steel-900">
          {mode === 'new' ? 'Novo cliente' : mode === 'edit' ? 'Editar cliente' : `Novo carro · ${customer?.full_name ?? ''}`}
        </h2>
        {mode !== 'car' && (
          <>
            <div><label className="label">Nome *</label>
              <input className="input" value={name} onChange={e => setName(e.target.value)} autoFocus placeholder="Ex.: João da Silva" /></div>
            <div><label className="label">WhatsApp</label>
              <input className="input" type="tel" inputMode="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="(11) 98888-7777" /></div>
          </>
        )}
        {withCar && (
          <div className="rounded-xl bg-steel-50 p-3 space-y-2">
            <div className="text-xs font-semibold text-steel-500 uppercase tracking-wider">Carro {mode === 'new' && <span className="normal-case font-normal">(opcional)</span>}</div>
            <div className="grid grid-cols-2 gap-2">
              <input className="input" placeholder="Marca (VW)" value={car.make} onChange={setC('make')} />
              <input className="input" placeholder="Modelo (Gol)" value={car.model} onChange={setC('model')} />
              <input className="input" placeholder="Ano" inputMode="numeric" value={car.year} onChange={setC('year')} />
              <input className="input uppercase" placeholder="Placa" value={car.plate} onChange={setC('plate')} />
            </div>
            <input className="input" placeholder="Cor (opcional)" value={car.color} onChange={setC('color')} />
          </div>
        )}
        {mode !== 'car' && (
          <div><label className="label">Observação</label>
            <textarea className="input resize-none" rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Opcional" /></div>
        )}
        {err && <div className="text-sm text-alert-700 bg-alert-50 rounded-lg px-3 py-2">⚠️ {err}</div>}
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} disabled={busy} className="btn-ghost flex-1">Cancelar</button>
          <button type="submit" disabled={busy} className="btn-primary flex-1">{busy ? 'Salvando…' : 'Salvar'}</button>
        </div>
      </form>
    </div>
  );
}
