import { useEffect, useState } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { supabase } from '@/lib/supabase';

const STATUS_OPTIONS = [
  { value: '',            label: 'Todos os status' },
  { value: 'open',        label: 'Abertos'         },
  { value: 'assigned',    label: 'Atribuídos'      },
  { value: 'in_progress', label: 'Em andamento'    },
  { value: 'completed',   label: 'Concluídos'      },
  { value: 'disputed',    label: 'Em disputa'      },
  { value: 'cancelled',   label: 'Cancelados'      },
];

const STATUS_LABEL: Record<string, string> = {
  open:        'Aberto',
  assigned:    'Atribuído',
  in_progress: 'Em andamento',
  completed:   'Concluído',
  disputed:    'Em disputa',
  cancelled:   'Cancelado',
};

interface JobRow {
  id: string;
  title: string;
  status: string;
  price: number;
  created_at: string;
  workshop: { business_name: string } | null;
  mechanic: { profile: { full_name: string } | null } | null;
}

export default function AdminJobs() {
  const [rows, setRows] = useState<JobRow[]>([]);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    let q = supabase
      .from('jobs')
      .select('id, title, status, price, created_at, workshop:workshops(business_name), mechanic:mechanics(profile:profiles(full_name))')
      .order('created_at', { ascending: false })
      .limit(200);
    if (filter) q = q.eq('status', filter);
    q.then(({ data }) => setRows((data as unknown as JobRow[]) ?? []));
  }, [filter]);

  return (
    <AdminLayout>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">Jobs ({rows.length})</h1>
        <select
          className="input max-w-xs"
          value={filter}
          onChange={e => setFilter(e.target.value)}
        >
          {STATUS_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* Desktop table */}
      <div className="card overflow-x-auto hidden md:block">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-steel-500 border-b border-steel-200">
            <tr>
              <th className="py-2 pr-4">Título</th>
              <th className="pr-4">Oficina</th>
              <th className="pr-4">Mecânico</th>
              <th className="pr-4">Status</th>
              <th className="pr-4">Preço</th>
              <th className="pr-4">Criado em</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-steel-100">
            {rows.map(j => (
              <tr key={j.id} className="hover:bg-steel-50 transition">
                <td className="py-3 pr-4 font-semibold">{j.title}</td>
                <td className="pr-4 text-steel-600">{j.workshop?.business_name ?? '—'}</td>
                <td className="pr-4 text-steel-600">{j.mechanic?.profile?.full_name ?? '—'}</td>
                <td className="pr-4">
                  <StatusBadge s={j.status} />
                </td>
                <td className="pr-4 font-display">R$ {j.price.toFixed(2)}</td>
                <td className="pr-4 text-steel-500">
                  {new Date(j.created_at).toLocaleString('pt-BR', {
                    day: '2-digit', month: '2-digit', year: '2-digit',
                    hour: '2-digit', minute: '2-digit',
                  })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <div className="text-center py-10 text-steel-500">Nenhum job encontrado.</div>
        )}
      </div>

      {/* Mobile cards */}
      <div className="space-y-3 md:hidden">
        {rows.map(j => (
          <div key={j.id} className="card">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="font-bold truncate">{j.title}</div>
                <div className="text-xs text-steel-500 mt-0.5">{j.workshop?.business_name ?? '—'}</div>
                {j.mechanic?.profile?.full_name && (
                  <div className="text-xs text-steel-400">{j.mechanic.profile.full_name}</div>
                )}
                <div className="text-xs text-steel-400 mt-1">
                  {new Date(j.created_at).toLocaleString('pt-BR', {
                    day: '2-digit', month: 'short', year: 'numeric',
                    hour: '2-digit', minute: '2-digit',
                  })}
                </div>
              </div>
              <div className="text-right shrink-0">
                <StatusBadge s={j.status} />
                <div className="font-bold font-display mt-1">R$ {j.price.toFixed(0)}</div>
              </div>
            </div>
          </div>
        ))}
        {rows.length === 0 && (
          <div className="card text-center py-10 text-steel-500">Nenhum job encontrado.</div>
        )}
      </div>
    </AdminLayout>
  );
}

function StatusBadge({ s }: { s: string }) {
  const color =
    s === 'completed'   ? 'bg-signal-100 text-signal-700' :
    s === 'in_progress' ? 'bg-brand-100 text-brand-700'   :
    s === 'assigned'    ? 'bg-blue-100 text-blue-700'     :
    s === 'disputed'    ? 'bg-alert-500/10 text-alert-600':
    s === 'cancelled'   ? 'bg-steel-100 text-steel-500'   :
    'bg-pending-100 text-pending-700';
  return <span className={`badge ${color}`}>{STATUS_LABEL[s] ?? s}</span>;
}
