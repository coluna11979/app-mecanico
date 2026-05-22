import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import AdminLayout from '@/components/layout/AdminLayout';
import { supabase } from '@/lib/supabase';
import { timeAgo, isRecent } from '@/lib/relativeTime';
import type { Mechanic, Profile } from '@/types/database';

type Row = Mechanic & { profile: Profile };

const STATUS_LABEL: Record<string, string> = {
  approved:     'Aprovado',
  rejected:     'Rejeitado',
  under_review: 'Em análise',
  pending:      'Pendente',
};

export default function AdminMechanics() {
  const [rows, setRows] = useState<Row[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    supabase
      .from('mechanics')
      .select('*, profile:profiles!inner(*)')
      .order('created_at', { ascending: false })
      .then(({ data }) => setRows((data as unknown as Row[]) ?? []));
  }, []);

  const filtered = rows.filter(r =>
    r.profile.full_name.toLowerCase().includes(search.toLowerCase()) ||
    r.cpf?.includes(search)
  );

  return (
    <AdminLayout>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">Mecânicos ({rows.length})</h1>
        <input
          className="input max-w-xs"
          placeholder="Buscar por nome ou CPF…"
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
              <th className="pr-4">CPF</th>
              <th className="pr-4">Skills</th>
              <th className="pr-4">R$/h</th>
              <th className="pr-4">★</th>
              <th className="pr-4">Último acesso</th>
              <th className="pr-4">Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-steel-100">
            {filtered.map(r => (
              <tr key={r.id} className="hover:bg-steel-50 transition">
                <td className="py-3 pr-4 font-semibold">{r.profile.full_name}</td>
                <td className="pr-4 text-steel-500">{r.cpf}</td>
                <td className="pr-4 text-steel-500">{r.skills.slice(0, 3).join(', ')}</td>
                <td className="pr-4">R$ {r.hourly_rate.toFixed(0)}</td>
                <td className="pr-4">{r.rating.toFixed(1)}</td>
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
                <div className="font-bold truncate">{r.profile.full_name}</div>
                <div className="text-xs text-steel-500 mt-0.5">{r.cpf}</div>
                <div className="flex flex-wrap gap-1 mt-2">
                  {r.skills.slice(0, 4).map(s => (
                    <span key={s} className="badge bg-steel-100 text-steel-700">{s}</span>
                  ))}
                </div>
              </div>
              <StatusBadge s={r.profile.status} />
            </div>
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-steel-100">
              <div className="text-sm">
                <span className="font-semibold">R$ {r.hourly_rate.toFixed(0)}/h</span>
                <span className="text-steel-400 ml-2">★ {r.rating.toFixed(1)}</span>
              </div>
              <LastSeen iso={r.profile.last_seen_at} />
            </div>
          </Link>
        ))}
        {filtered.length === 0 && (
          <div className="card text-center py-10 text-steel-500">Nenhum mecânico encontrado.</div>
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
