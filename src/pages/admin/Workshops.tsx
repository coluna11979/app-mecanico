import { useEffect, useState } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { supabase } from '@/lib/supabase';
import type { Workshop, Profile } from '@/types/database';

type Row = Workshop & { profile: Profile };

export default function AdminWorkshops() {
  const [rows, setRows] = useState<Row[]>([]);
  useEffect(() => {
    supabase.from('workshops').select('*, profile:profiles!inner(*)').order('created_at', { ascending: false })
      .then(({ data }) => setRows((data as unknown as Row[]) ?? []));
  }, []);

  async function setStatus(profileId: string, status: 'approved' | 'rejected' | 'pending') {
    await supabase.from('profiles').update({ status }).eq('id', profileId);
    setRows(rs => rs.map(r => r.profile_id === profileId ? { ...r, profile: { ...r.profile, status } } : r));
  }

  return (
    <AdminLayout>
      <h1 className="text-3xl font-bold tracking-tight mb-6">Oficinas ({rows.length})</h1>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-steel-500 border-b border-steel-200">
            <tr><th className="py-2 pr-4">Nome</th><th className="pr-4">CNPJ</th><th className="pr-4">Cidade</th><th className="pr-4">Jobs</th><th className="pr-4">Status</th><th></th></tr>
          </thead>
          <tbody className="divide-y divide-steel-100">
            {rows.map(r => (
              <tr key={r.id}>
                <td className="py-3 pr-4 font-semibold">{r.business_name}</td>
                <td className="pr-4 text-steel-500">{r.cnpj}</td>
                <td className="pr-4 text-steel-500">{r.city}/{r.state}</td>
                <td className="pr-4">{r.total_jobs}</td>
                <td className="pr-4">
                  <span className={r.profile.status === 'approved' ? 'badge-success' : r.profile.status === 'rejected' ? 'badge-alert' : 'badge-pending'}>{r.profile.status}</span>
                </td>
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
