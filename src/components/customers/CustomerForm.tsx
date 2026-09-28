import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { toast } from '@/components/ui/Toast';
import { maskCpf, maskPhone, onlyDigits, plateNorm } from '@/lib/customers';
import type { Customer } from '@/types/database';

type Dup = { id: string; full_name: string; reason: string };

/** Procura no banco cadastros com o mesmo telefone, CPF ou placa */
export async function findDuplicatesRemote(workshopId: string, input: { phone?: string; cpf?: string; plate?: string }, excludeId?: string) {
  const out: Dup[] = [];
  const seen = new Set<string>();
  const add = (id: string, full_name: string, reason: string) => {
    if (id === excludeId || seen.has(id)) return;
    seen.add(id); out.push({ id, full_name, reason });
  };
  const phone = onlyDigits(input.phone).slice(-8);
  if (phone.length === 8) {
    const { data } = await supabase.from('customers').select('id, full_name, phone')
      .eq('workshop_id', workshopId).ilike('phone', `%${phone.slice(-4)}%`).limit(50);
    for (const c of data ?? []) if (onlyDigits(c.phone).slice(-8) === phone) add(c.id, c.full_name, 'mesmo telefone');
  }
  const cpf = onlyDigits(input.cpf);
  if (cpf.length === 11) {
    const { data } = await supabase.from('customers').select('id, full_name, cpf')
      .eq('workshop_id', workshopId).ilike('cpf', `%${cpf.slice(-2)}%`).limit(50);
    for (const c of data ?? []) if (onlyDigits(c.cpf) === cpf) add(c.id, c.full_name, 'mesmo CPF');
  }
  const plate = plateNorm(input.plate);
  if (plate.length >= 7) {
    const { data } = await supabase.from('vehicles').select('plate, customer:customers(id, full_name)')
      .eq('workshop_id', workshopId).ilike('plate', `%${plate.slice(-4)}%`).limit(50);
    for (const v of (data ?? []) as unknown as { plate: string; customer: { id: string; full_name: string } | null }[]) {
      if (v.customer && plateNorm(v.plate) === plate) add(v.customer.id, v.customer.full_name, `já tem a placa ${plate}`);
    }
  }
  return out;
}

export function DuplicateWarning({ dups, onIgnore, ignoreLabel }: { dups: Dup[]; onIgnore: () => void; ignoreLabel: string }) {
  return (
    <div className="bg-pending-50 border border-pending-200 rounded-xl p-3 text-sm space-y-2">
      <div className="font-semibold text-pending-900">⚠️ Parece que esse cliente já está cadastrado:</div>
      <ul className="space-y-1">
        {dups.map(d => (
          <li key={d.id} className="flex flex-wrap items-center justify-between gap-2">
            <span><strong>{d.full_name}</strong> <span className="text-xs text-steel-600">· {d.reason}</span></span>
            <Link to={`/oficina/clientes/${d.id}`} className="text-xs font-semibold text-brand-600 hover:underline">Abrir ficha →</Link>
          </li>
        ))}
      </ul>
      <button type="button" onClick={onIgnore} className="text-xs font-semibold text-steel-600 hover:underline">{ignoreLabel}</button>
    </div>
  );
}

const fromCustomer = (c?: Customer | null) => ({
  full_name: c?.full_name ?? '', phone: c?.phone ? maskPhone(c.phone) : '', email: c?.email ?? '',
  cpf: c?.cpf ? maskCpf(c.cpf) : '', birth_date: c?.birth_date ?? '', address: c?.address ?? '', city: c?.city ?? '',
  notes: c?.notes ?? '', contact_opt_out: !!c?.contact_opt_out,
  veh_plate: '', veh_make: '', veh_model: '', veh_year: '',
});

/** Cadastro (com carro opcional) ou edição de cliente */
export default function CustomerForm({ workshopId, customer, onClose, onSaved }: {
  workshopId: string; customer?: Customer | null;
  onClose: () => void; onSaved: (customerId: string) => void;
}) {
  const editing = !!customer;
  const [f, setF] = useState(() => fromCustomer(customer));
  const [saving, setSaving] = useState(false);
  const [dups, setDups] = useState<Dup[]>([]);
  const [ignoreDups, setIgnoreDups] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF(s => ({ ...s, [k]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!f.full_name.trim()) { toast.error('Informe o nome do cliente'); return; }
    const phoneDigits = onlyDigits(f.phone);
    if (phoneDigits && phoneDigits.length < 10) { toast.error('Telefone incompleto — coloque o DDD.'); return; }
    if (f.cpf && onlyDigits(f.cpf).length !== 11) { toast.error('CPF incompleto.'); return; }
    const withCar = !editing && f.veh_make.trim() && f.veh_model.trim();
    setSaving(true);

    if (!ignoreDups) {
      const found = await findDuplicatesRemote(workshopId, { phone: f.phone, cpf: f.cpf, plate: withCar ? f.veh_plate : '' }, customer?.id);
      if (found.length) { setDups(found); setSaving(false); return; }
    }

    const payload = {
      full_name: f.full_name.trim(), phone: f.phone.trim() || null, email: f.email.trim() || null,
      cpf: f.cpf.trim() || null, birth_date: f.birth_date || null, address: f.address.trim() || null,
      city: f.city.trim() || null, notes: f.notes.trim() || null, contact_opt_out: f.contact_opt_out,
    };
    if (editing) {
      const { error } = await supabase.from('customers').update(payload).eq('id', customer!.id);
      setSaving(false);
      if (error) { toast.error('Não foi possível salvar: ' + error.message); return; }
      toast.success('Cliente atualizado ✓');
      onSaved(customer!.id);
      return;
    }
    const { data, error } = await supabase.from('customers').insert({ ...payload, workshop_id: workshopId }).select('id').single();
    if (error || !data) { setSaving(false); toast.error('Não foi possível salvar: ' + (error?.message ?? '')); return; }
    if (withCar) {
      const { error: vErr } = await supabase.from('vehicles').insert({
        customer_id: data.id, workshop_id: workshopId,
        plate: plateNorm(f.veh_plate) || 'S/P', make: f.veh_make.trim(), model: f.veh_model.trim(),
        year: f.veh_year ? parseInt(f.veh_year, 10) : null,
      });
      if (vErr) toast.error('Cliente salvo, mas o carro não: ' + vErr.message);
    }
    setSaving(false);
    toast.success('Cliente cadastrado ✓');
    onSaved(data.id);
  }

  return (
    <div className="fixed inset-0 bg-steel-900/60 grid place-items-center p-4 z-50" onClick={onClose}>
      <form onSubmit={submit} onClick={e => e.stopPropagation()} className="card max-w-lg w-full space-y-4 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">{editing ? 'Editar cliente' : 'Novo cliente'}</h2>
          <button type="button" onClick={onClose} className="text-steel-400 hover:text-steel-700 text-xl">✕</button>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <label className="label">Nome completo *</label>
            <input className="input" required value={f.full_name} onChange={set('full_name')} placeholder="Maria da Silva" autoFocus={!editing} />
          </div>
          <div>
            <label className="label">Telefone / WhatsApp</label>
            <input className="input" inputMode="tel" value={f.phone} placeholder="(11) 99999-9999"
              onChange={e => { setF(s => ({ ...s, phone: maskPhone(e.target.value) })); setIgnoreDups(false); setDups([]); }} />
          </div>
          <div>
            <label className="label">E-mail</label>
            <input className="input" type="email" value={f.email} onChange={set('email')} placeholder="maria@email.com" />
          </div>
          <div>
            <label className="label">CPF</label>
            <input className="input" inputMode="numeric" value={f.cpf} placeholder="000.000.000-00"
              onChange={e => { setF(s => ({ ...s, cpf: maskCpf(e.target.value) })); setIgnoreDups(false); setDups([]); }} />
          </div>
          <div>
            <label className="label">Data de nascimento</label>
            <input className="input" type="date" value={f.birth_date} onChange={set('birth_date')} />
          </div>
          <div>
            <label className="label">Endereço</label>
            <input className="input" value={f.address} onChange={set('address')} placeholder="Rua das Flores, 123 — Centro" />
          </div>
          <div>
            <label className="label">Cidade</label>
            <input className="input" value={f.city} onChange={set('city')} placeholder="São Paulo" />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Observações internas</label>
            <textarea className="input" rows={2} value={f.notes} onChange={set('notes')} placeholder="Ex.: prefere contato à tarde · carro da empresa · sempre pede a peça trocada" />
          </div>
        </div>

        {editing && (
          <label className="flex items-start gap-2 text-sm cursor-pointer bg-steel-50 rounded-xl px-3 py-2">
            <input type="checkbox" className="mt-1 accent-brand-500" checked={f.contact_opt_out}
              onChange={e => setF(s => ({ ...s, contact_opt_out: e.target.checked }))} />
            <span><strong>Não quer receber mensagens</strong><span className="block text-xs text-steel-500">O cliente pediu para não ser contatado (LGPD).</span></span>
          </label>
        )}

        {!editing && (
          <div className="bg-steel-50 rounded-xl p-3 space-y-3">
            <div className="text-[10px] font-bold text-steel-500 uppercase tracking-widest">🚗 Carro (opcional — cadastra junto)</div>
            <div className="grid grid-cols-2 gap-3">
              <input className="input uppercase" value={f.veh_plate} placeholder="Placa ABC1D23"
                onChange={e => { setF(s => ({ ...s, veh_plate: e.target.value.toUpperCase() })); setIgnoreDups(false); setDups([]); }} />
              <input className="input" type="number" min={1950} max={2030} value={f.veh_year} onChange={set('veh_year')} placeholder="Ano" />
              <input className="input" value={f.veh_make} onChange={set('veh_make')} placeholder="Marca (ex.: Chevrolet)" />
              <input className="input" value={f.veh_model} onChange={set('veh_model')} placeholder="Modelo (ex.: Onix)" />
            </div>
          </div>
        )}

        {dups.length > 0 && !ignoreDups && (
          <DuplicateWarning dups={dups} ignoreLabel={editing ? 'Não é a mesma pessoa — salvar assim mesmo' : 'Não é a mesma pessoa — cadastrar assim mesmo'}
            onIgnore={() => { setIgnoreDups(true); setDups([]); }} />
        )}

        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onClose} className="btn-ghost flex-1">Cancelar</button>
          <button className="btn-primary flex-1" disabled={saving}>
            {saving ? 'Salvando…' : editing ? 'Salvar alterações' : ignoreDups ? 'Cadastrar assim mesmo' : 'Salvar cliente'}
          </button>
        </div>
      </form>
    </div>
  );
}
