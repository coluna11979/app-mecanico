import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import AdminLayout from '@/components/layout/AdminLayout';
import { supabase } from '@/lib/supabase';
import { timeAgo, isRecent } from '@/lib/relativeTime';
import type { Workshop, Profile } from '@/types/database';

type Row = Workshop & { profile: Profile };

const STATUS_LABEL: Record<string, string> = {
  approved:     'Aprovado',
  rejected:     'Rejeitado',
  under_review: 'Em análise',
  pending:      'Pendente',
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
              <th className="pr-4">Último acesso</th>
              <th className="pr-4">Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-steel-100">
            {filtered.map(r => (
              <tr key={r.id} className="hover:bg-steel-50 transition">
                <td className="py-3 pr-4 font-semibold">{r.business_name}</td>
                <td className="pr-4 text-steel-500">{r.cnpj}</td>
                <td className="pr-4 text-steel-500">{r.city}/{r.state}</td>
                <td className="pr-4">{r.total_jobs}</td>
                <td className="pr-4"><LastSeen iso={r.profile.last_seen_at} /></td>
                <td className="pr-4"><StatusBadge s={r.profile.status} /></td>
                <td className="pr-2">
                  <Link
                    to={`/admin/usuario/${r.profile_id}`}
                    className="btn-ghost !py-1 !px-3 text-xs border border-steel-200"
                  >
                    Ver →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="space-y-3 md:hidden">
        {filtered.map(r => (
          <Link key={r.id} to={`/admin/usuario/${r.profile_id}`} className="card block hover:shadow-md transition">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="font-bold truncate">{r.business_name}</div>
                <div className="text-xs text-steel-500 mt-0.5">{r.cnpj}</div>
                <div className="text-xs text-steel-400 mt-1">{r.city} / {r.state}</div>
              </div>
              <StatusBadge s={r.profile.status} />
            </div>
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-steel-100">
              <div className="text-sm text-steel-500">{r.total_jobs} jobs concluídos</div>
              <LastSeen iso={r.profile.last_seen_at} />
            </div>
          </Link>
        ))}
        {filtered.length === 0 && (
          <div className="card text-center py-10 text-steel-500">Nenhuma oficina encontrada.</div>
        )}
      </div>
    </AdminLayout>
  );
}

function StatusBadge({ s }: { s: string }) {
  const cls =
    s === 'approved'     ? 'badge-success' :
    s === 'rejected'     ? 'badge-alert'   :
    s === 'under_review' ? 'badge-pending' : 'badge-pending';
  return <span className={cls}>{STATUS_LABEL[s] ?? s}</span>;
}

function LastSeen({ iso }: { iso: string | null }) {
  const recent = isRecent(iso);
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs ${recent ? 'text-green-600 font-medium' : 'text-steel-400'}`}>
      {recent && <span className="h-1.5 w-1.5 rounded-full bg-green-500" />}
      {timeAgo(iso)}
    </span>
  );
}
