import { useEffect, useState } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { supabase } from '@/lib/supabase';
import type { Profile, Mechanic, Workshop } from '@/types/database';

type Row = Profile & { mechanic?: Mechanic; workshop?: Workshop };

export default function AdminApprovals() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [deciding, setDeciding] = useState<string | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data: profiles } = await supabase
      .from('profiles')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    const result: Row[] = [];
    for (const p of (profiles ?? []) as Profile[]) {
      const row: Row = { ...p };
      if (p.role === 'mechanic') {
        const { data } = await supabase.from('mechanics').select('*').eq('profile_id', p.id).maybeSingle();
        row.mechanic = data as Mechanic;
      } else if (p.role === 'workshop') {
        const { data } = await supabase.from('workshops').select('*').eq('profile_id', p.id).maybeSingle();
        row.workshop = data as Workshop;
      }
      result.push(row);
    }
    setRows(result);
    setLoading(false);
  }

  async function decide(id: string, status: 'approved' | 'rejected') {
    setDeciding(id);
    await supabase.from('profiles').update({ status }).eq('id', id);
    setRows(rs => rs.filter(r => r.id !== id));
    setDeciding(null);
  }

  return (
    <AdminLayout>
      <h1 className="text-2xl lg:text-3xl font-bold tracking-tight mb-6">
        Aprovações pendentes
        {rows.length > 0 && (
          <span className="ml-3 text-lg font-normal text-brand-500">({rows.length})</span>
        )}
      </h1>

      {loading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => <div key={i} className="card h-28 animate-pulse bg-steel-100" />)}
        </div>
      ) : rows.length === 0 ? (
        <div className="card text-center py-16 text-steel-500">
          <div className="text-4xl mb-3">✨</div>
          <div className="font-semibold">Nenhuma aprovação pendente</div>
          <div className="text-sm mt-1">Tudo em dia!</div>
        </div>
      ) : (
        <div className="space-y-4">
          {rows.map(r => (
            <div key={r.id} className="card">
              {/* Header */}
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <span className={`badge text-xs mb-2 inline-block ${r.role === 'mechanic' ? 'badge-brand' : 'bg-steel-200 text-steel-700'}`}>
                    {r.role === 'mechanic' ? '🔧 Mecânico' : '🏪 Oficina'}
                  </span>
                  <h3 className="text-lg font-bold leading-tight">{r.full_name}</h3>
                  <div className="text-sm text-steel-500 mt-0.5">{r.phone}</div>
                  <div className="text-xs text-steel-400 mt-0.5">
                    {new Date(r.created_at).toLocaleDateString('pt-BR', {
                      day: '2-digit', month: 'long', year: 'numeric',
                    })}
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex gap-2 shrink-0">
                  <button
                    disabled={deciding === r.id}
                    onClick={() => decide(r.id, 'rejected')}
                    className="btn-ghost text-alert-600 border border-alert-200 hover:bg-alert-50 disabled:opacity-50 text-sm px-4 py-2"
                  >
                    Rejeitar
                  </button>
                  <button
                    disabled={deciding === r.id}
                    onClick={() => decide(r.id, 'approved')}
                    className="btn-primary disabled:opacity-50 text-sm px-4 py-2"
                  >
                    {deciding === r.id ? '…' : 'Aprovar'}
                  </button>
                </div>
              </div>

              {/* Mechanic details */}
              {r.mechanic && (
                <div className="mt-4 pt-4 border-t border-steel-100">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                    <div>
                      <div className="text-xs text-steel-400 uppercase tracking-wider">CPF</div>
                      <div className="font-medium mt-0.5">{r.mechanic.cpf}</div>
                    </div>
                    <div>
                      <div className="text-xs text-steel-400 uppercase tracking-wider">Experiência</div>
                      <div className="font-medium mt-0.5">{r.mechanic.experience_years} anos</div>
                    </div>
                    <div>
                      <div className="text-xs text-steel-400 uppercase tracking-wider">Valor/hora</div>
                      <div className="font-medium mt-0.5">R$ {r.mechanic.hourly_rate}/h</div>
                    </div>
                  </div>
                  {r.mechanic.skills?.length > 0 && (
                    <div className="flex gap-1.5 flex-wrap mt-3">
                      {r.mechanic.skills.map(s => (
                        <span key={s} className="badge bg-steel-100 text-steel-700">{s}</span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Workshop details */}
              {r.workshop && (
                <div className="mt-4 pt-4 border-t border-steel-100">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                    <div>
                      <div className="text-xs text-steel-400 uppercase tracking-wider">Razão social</div>
                      <div className="font-semibold mt-0.5">{r.workshop.business_name}</div>
                    </div>
                    <div>
                      <div className="text-xs text-steel-400 uppercase tracking-wider">CNPJ</div>
                      <div className="font-medium mt-0.5">{r.workshop.cnpj}</div>
                    </div>
                    <div className="sm:col-span-2">
                      <div className="text-xs text-steel-400 uppercase tracking-wider">Endereço</div>
                      <div className="font-medium mt-0.5">
                        {r.workshop.address}, {r.workshop.city}/{r.workshop.state}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </AdminLayout>
  );
}
