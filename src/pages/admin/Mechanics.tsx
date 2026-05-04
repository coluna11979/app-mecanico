import { useEffect, useState } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { supabase } from '@/lib/supabase';
import type { Mechanic, Profile } from '@/types/database';

type Row = Mechanic & { profile: Profile };

export default function AdminMechanics() {
  const [rows, setRows] = useState<Row[]>([]);
  useEffect(() => {
    supabase.from('mechanics').select('*, profile:profiles!inner(*)').order('created_at', { ascending: false })
      .then(({ data }) => setRows((data as unknown as Row[]) ?? []));
  }, []);

  async function setStatus(profileId: string, status: 'approved' | 'rejected' | 'pending') {
    await supabase.from('profiles').update({ status }).eq('id', profileId);
    setRows(rs => rs.map(r => r.profile_id === profileId ? { ...r, profile: { ...r.profile, status } } : r));
  }

  return (
    <AdminLayout>
      <h1 className="text-3xl font-bold tracking-tight mb-6">Mecânicos ({rows.length})</h1>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-steel-500 border-b border-steel-200">
            <tr><th className="py-2 pr-4">Nome</th><th className="pr-4">CPF</th><th className="pr-4">Skills</th><th className="pr-4">R$/h</th><th className="pr-4">★</th><th className="pr-4">Status</th><th></th></tr>
          </thead>
          <tbody className="divide-y divide-steel-100">
            {rows.map(r => (
              <tr key={r.id}>
                <td className="py-3 pr-4 font-semibold">{r.profile.full_name}</td>
                <td className="pr-4 text-steel-500">{r.cpf}</td>
                <td className="pr-4 text-steel-500">{r.skills.slice(0,3).join(', ')}</td>
                <td className="pr-4">R$ {r.hourly_rate.toFixed(0)}</td>
                <td className="pr-4">{r.rating.toFixed(1)}</td>
                <td className="pr-4"><StatusBadge s={r.profile.status} /></td>
                <td>
                  <select className="input !py-1 !px-2 text-xs" value={r.profile.status}
                    onChange={e => setStatus(r.profile_id, e.target.value as 'approved' | 'rejected' | 'pending')}>
                    <option value="pending">Pendente</option>
                    <option value="approved">Aprovado</option>
                    <option value="rejected">Rejeitado</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminLayout>
  );
}

function StatusBadge({ s }: { s: string }) {
  return <span className={s === 'approved' ? 'badge-success' : s === 'rejected' ? 'badge-alert' : 'badge-pending'}>{s}</span>;
}
