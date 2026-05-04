import { useEffect, useState } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { supabase } from '@/lib/supabase';
import type { Workshop, Profile } from '@/types/database';

type Row = Workshop & { profile: Profile };
type StatusVal = 'approved' | 'rejected' | 'pending';

const STATUS_LABEL: Record<string, string> = {
  approved: 'Aprovado',
  rejected: 'Rejeitado',
  pending:  'Pendente',
};

export default function AdminWorkshops() {
  const [rows, setRows] = useState<Row[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    supabase
      .from('workshops')
      .select('*, profile:profiles!inner(*)')
      .order('created_at', { ascending: false })
      .then(({ data }) => setRows((data as unknown as Row[]) ?? []));
  }, []);

  async function setStatus(profileId: string, status: StatusVal) {
    await supabase.from('profiles').update({ status }).eq('id', profileId);
    setRows(rs =>
      rs.map(r => r.profile_id === profileId ? { ...r, profile: { ...r.profile, status } } : r)
    );
  }

  const filtered = rows.filter(r =>
    r.business_name.toLowerCase().includes(search.toLowerCase()) ||
    r.cnpj?.includes(search) ||
    r.city?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <AdminLayout>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">Oficinas ({rows.length})</h1>
        <input
          className="input max-w-xs"
          placeholder="Buscar por nome, CNPJ ou cidade…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Desktop table */}
      <div className="card overflow-x-auto hidden md:block">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-steel-500 border-b border-steel-200">
            <tr>
              <th className="py-2 pr-4">Nome</th>
              <th className="pr-4">CNPJ</th>
              <th className="pr-4">Cidade</th>
              <th className="pr-4">Jobs</th>
              <th className="pr-4">Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-steel-100">
            {filtered.map(r => (
              <tr key={r.id}>
                <td className="py-3 pr-4 font-semibold">{r.business_name}</td>
                <td className="pr-4 text-steel-500">{r.cnpj}</td>
                <td className="pr-4 text-steel-500">{r.city}/{r.state}</td>
                <td className="pr-4">{r.total_jobs}</td>
                <td className="pr-4">
                  <span className={
                    r.profile.status === 'approved' ? 'badge-success' :
                    r.profile.status === 'rejected' ? 'badge-alert' : 'badge-pending'
                  }>
                    {STATUS_LABEL[r.profile.status] ?? r.profile.status}
                  </span>
                </td>
                <td>
                  <select
                    className="input !py-1 !px-2 text-xs"
                    value={r.profile.status}
                    onChange={e => setStatus(r.profile_id, e.target.value as StatusVal)}
                  >
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

      {/* Mobile cards */}
      <div className="space-y-3 md:hidden">
        {filtered.map(r => (
          <div key={r.id} className="card">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="font-bold truncate">{r.business_name}</div>
                <div className="text-xs text-steel-500 mt-0.5">{r.cnpj}</div>
                <div className="text-xs text-steel-400 mt-1">{r.city} / {r.state}</div>
              </div>
              <span className={
                r.profile.status === 'approved' ? 'badge-success' :
                r.profile.status === 'rejected' ? 'badge-alert' : 'badge-pending'
              }>
                {STATUS_LABEL[r.profile.status] ?? r.profile.status}
              </span>
            </div>
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-steel-100">
              <div className="text-sm text-steel-500">
                {r.total_jobs} jobs concluídos
              </div>
              <select
                className="input !py-1 !px-2 text-xs !w-auto"
                value={r.profile.status}
                onChange={e => setStatus(r.profile_id, e.target.value as StatusVal)}
              >
                <option value="pending">Pendente</option>
                <option value="approved">Aprovado</option>
                <option value="rejected">Rejeitado</option>
              </select>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="card text-center py-10 text-steel-500">Nenhuma oficina encontrada.</div>
        )}
      </div>
    </AdminLayout>
  );
}
