import { useEffect, useState } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { supabase } from '@/lib/supabase';
import type { Job } from '@/types/database';

export default function AdminJobs() {
  const [rows, setRows] = useState<Job[]>([]);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    let q = supabase.from('jobs').select('*').order('created_at', { ascending: false }).limit(200);
    if (filter) q = q.eq('status', filter);
    q.then(({ data }) => setRows((data as Job[]) ?? []));
  }, [filter]);

  return (
    <AdminLayout>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Jobs ({rows.length})</h1>
        <select className="input max-w-xs" value={filter} onChange={e => setFilter(e.target.value)}>
          <option value="">Todos os status</option>
          <option value="open">Abertos</option>
          <option value="assigned">Atribuídos</option>
          <option value="in_progress">Em andamento</option>
          <option value="completed">Concluídos</option>
          <option value="disputed">Em disputa</option>
          <option value="cancelled">Cancelados</option>
        </select>
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-steel-500 border-b border-steel-200">
            <tr><th className="py-2 pr-4">Título</th><th className="pr-4">Status</th><th className="pr-4">Preço</th><th className="pr-4">Criado em</th></tr>
          </thead>
          <tbody className="divide-y divide-steel-100">
            {rows.map(j => (
              <tr key={j.id}>
                <td className="py-3 pr-4 font-semibold">{j.title}</td>
                <td className="pr-4"><span className="badge bg-steel-100 text-steel-700">{j.status}</span></td>
                <td className="pr-4 font-display">R$ {j.price.toFixed(2)}</td>
                <td className="pr-4 text-steel-500">{new Date(j.created_at).toLocaleString('pt-BR')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminLayout>
  );
}
