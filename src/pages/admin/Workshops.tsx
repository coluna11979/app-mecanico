import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import AdminLayout from '@/components/layout/AdminLayout';
import { supabase } from '@/lib/supabase';
import { timeAgo, isRecent } from '@/lib/relativeTime';
import type { Workshop, Profile } from '@/types/database';

type Row = Workshop & { profile: Profile };

const STATUS_LABEL: Record<string, string> = {
  approved:        'Aprovado',
  rejected:        'Rejeitado',
  under_review:    'Em análise',
  pending:         'Pendente',
  awaiting_region: 'Aguardando região',
};

type StatusFilter = 'all' | 'approved' | 'pending' | 'under_review' | 'awaiting_region' | 'rejected';
const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'all',             label: 'Todas' },
  { key: 'approved',        label: '✅ Ativas' },
  { key: 'pending',         label: '🆕 Pendentes' },
  { key: 'under_review',    label: '🔍 Em análise' },
  { key: 'awaiting_region', label: '📍 Aguardando região' },
  { key: 'rejected',        label: '❌ Rejeitadas' },
];

export default function AdminWorkshops() {
  const [rows, setRows] = useState<Row[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  useEffect(() => {
    supabase
      .from('workshops')
      .select('*, profile:profiles!inner(*)')
      .order('created_at', { ascending: false })
      .then(({ data }) => setRows((data as unknown as Row[]) ?? []));
  }, []);

  const filtered = rows.filter(r => {
    if (statusFilter !== 'all' && r.profile.status !== statusFilter) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    const hay = [
      r.business_name, r.cnpj,
      r.city, r.neighborhood, r.cep, r.state,
    ].filter(Boolean).join(' ').toLowerCase();
    return hay.includes(q);
  });

  const statusCounts = STATUS_FILTERS.reduce((acc, f) => {
    acc[f.key] = f.key === 'all' ? rows.length : rows.filter(r => r.profile.status === f.key).length;
    return acc;
  }, {} as Record<StatusFilter, number>);

  return (
    <AdminLayout>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">Oficinas ({rows.length})</h1>
        <input
          className="input max-w-xs"
          placeholder="Buscar por nome, CNPJ, cidade, bairro ou CEP…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Filtro por status */}
      <div className="flex gap-1 bg-steel-100 rounded-xl p-1 mb-6 overflow-x-auto">
        {STATUS_FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => setStatusFilter(f.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap ${
              statusFilter === f.key
                ? 'bg-white shadow text-steel-900'
                : 'text-steel-500 hover:text-steel-700'
            }`}
          >
            <span>{f.label}</span>
            <span className="text-[10px] text-steel-400">{statusCounts[f.key] ?? 0}</span>
          </button>
        ))}
      </div>

      {/* Desktop table */}
      <div className="card overflow-x-auto hidden md:block">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-steel-500 border-b border-steel-200">
            <tr>
              <th className="py-2 pr-4">Nome</th>
              <th className="pr-4">CNPJ</th>
              <th className="pr-4">Localização</th>
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
                <td className="pr-4 text-steel-500"><LocationCell cep={r.cep} neighborhood={r.neighborhood} city={r.city} state={r.state} /></td>
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
                <div className="text-xs text-steel-400 mt-1">
                  📍 <LocationCell cep={r.cep} neighborhood={r.neighborhood} city={r.city} state={r.state} />
                </div>
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

function LocationCell({ cep, neighborhood, city, state }: {
  cep: string | null; neighborhood: string | null; city: string | null; state: string | null;
}) {
  const parts: string[] = [];
  if (neighborhood) parts.push(neighborhood);
  if (city) parts.push(state ? `${city}/${state}` : city);
  const main = parts.join(' · ');
  if (!main && !cep) return <span className="text-steel-300">—</span>;
  return (
    <span className="inline-flex flex-col">
      {main && <span>{main}</span>}
      {cep && <span className="text-[11px] text-steel-400 font-mono">{cep}</span>}
    </span>
  );
}

function StatusBadge({ s }: { s: string }) {
  const cls =
    s === 'approved'        ? 'badge-success' :
    s === 'rejected'        ? 'badge-alert'   :
    s === 'under_review'    ? 'badge-pending' :
    s === 'awaiting_region' ? 'badge bg-steel-200 text-steel-700' :
                              'badge-pending';
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
