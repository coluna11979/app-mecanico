import { useEffect, useState } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { supabase } from '@/lib/supabase';
import type { Profile, Mechanic, Workshop } from '@/types/database';

type Row = Profile & { mechanic?: Mechanic; workshop?: Workshop };

export default function AdminApprovals() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, []);
  async function load() {
    setLoading(true);
    const { data: profiles } = await supabase.from('profiles').select('*').eq('status', 'pending').order('created_at', { ascending: false });
    const result: Row[] = [];
    for (const p of (profiles ?? []) as Profile[]) {
      const row: Row = p;
      if (p.role === 'mechanic') {
        const { data } = await supabase.from('mechanics').select('*').eq('profile_id', p.id).maybeSingle();
        row.mechanic = data as Mechanic;
      } else if (p.role === 'workshop') {
        const { data } = await supabase.from('workshops').select('*').eq('profile_id', p.id).maybeSingle();
        row.workshop = data as Workshop;
      }
      result.push(row);
    }
    setRows(result); setLoading(false);
  }

  async function decide(id: string, status: 'approved' | 'rejected') {
    await supabase.from('profiles').update({ status }).eq('id', id);
    setRows(rs => rs.filter(r => r.id !== id));
  }

  return (
    <AdminLayout>
      <h1 className="text-3xl font-bold tracking-tight mb-6">Aprovações pendentes</h1>
      {loading ? <div className="text-steel-500">Carregando…</div> :
        rows.length === 0 ? <div className="card text-center py-10 text-steel-500">Nenhuma aprovação pendente. ✨</div> :
        <div className="space-y-3">
          {rows.map(r => (
            <div key={r.id} className="card">
              <div className="flex justify-between items-start">
                <div>
                  <span className={`badge ${r.role === 'mechanic' ? 'badge-brand' : 'bg-steel-200 text-steel-700'}`}>
                    {r.role === 'mechanic' ? 'Mecânico' : 'Oficina'}
                  </span>
                  <h3 className="text-lg font-bold mt-2">{r.full_name}</h3>
                  <div className="text-sm text-steel-500">{r.phone}</div>
                  {r.mechanic && (
                    <div className="mt-3 text-sm text-steel-600">
                      <div>CPF: {r.mechanic.cpf} · Exp.: {r.mechanic.experience_years}a · R$ {r.mechanic.hourly_rate}/h</div>
                      <div className="mt-1 flex gap-1 flex-wrap">{r.mechanic.skills.map(s => <span key={s} className="badge bg-steel-100 text-steel-700">{s}</span>)}</div>
                    </div>
                  )}
                  {r.workshop && (
                    <div className="mt-3 text-sm text-steel-600">
                      <div className="font-semibold">{r.workshop.business_name}</div>
                      <div>CNPJ: {r.workshop.cnpj}</div>
                      <div>{r.workshop.address}, {r.workshop.city}/{r.workshop.state}</div>
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => decide(r.id, 'rejected')} className="btn-ghost text-alert-600">Rejeitar</button>
                  <button onClick={() => decide(r.id, 'approved')} className="btn-primary">Aprovar</button>
                </div>
              </div>
            </div>
          ))}
        </div>}
    </AdminLayout>
  );
}
