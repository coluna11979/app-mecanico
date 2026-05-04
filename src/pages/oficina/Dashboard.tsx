import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import WorkshopLayout from '@/components/layout/WorkshopLayout';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { Job, Workshop } from '@/types/database';

export default function WorkshopDashboard() {
  const { user } = useAuth();
  const [shop, setShop] = useState<Workshop | null>(null);
  const [active, setActive] = useState<Job[]>([]);
  const [history, setHistory] = useState<Job[]>([]);

  useEffect(() => { if (user) load(); }, [user]);
  async function load() {
    const { data: w } = await supabase.from('workshops').select('*').eq('profile_id', user!.id).maybeSingle();
    setShop(w as Workshop);
    if (w?.id) {
      const [{ data: a }, { data: h }] = await Promise.all([
        supabase.from('jobs').select('*').eq('workshop_id', w.id).in('status', ['open', 'assigned', 'in_progress']).order('created_at', { ascending: false }),
        supabase.from('jobs').select('*').eq('workshop_id', w.id).in('status', ['completed', 'disputed', 'cancelled']).order('created_at', { ascending: false }).limit(10),
      ]);
      setActive((a as Job[]) ?? []);
      setHistory((h as Job[]) ?? []);
    }
  }

  return (
    <WorkshopLayout>
      <div className="flex justify-between items-end mb-6">
        <div>
          <div className="text-sm text-steel-500">Olá,</div>
          <h1 className="text-3xl font-bold tracking-tight">{shop?.business_name ?? '...'}</h1>
        </div>
        <Link to="/oficina/buscar" className="btn-primary btn-lg">Buscar mecânicos</Link>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-8">
        <KPI label="Jobs ativos" value={active.length} />
        <KPI label="Concluídos" value={shop?.total_jobs ?? 0} />
        <KPI label="Avaliação" value={`★ ${(shop?.rating ?? 0).toFixed(1)}`} />
      </div>

      <section className="mb-8">
        <h2 className="text-lg font-bold mb-3">Em andamento</h2>
        {active.length === 0 ? (
          <div className="card text-center text-steel-500 py-10">
            Nenhum job ativo. <Link to="/oficina/buscar" className="text-brand-500 font-semibold">Contrate um mecânico →</Link>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-3">
            {active.map(j => (
              <div key={j.id} className="card flex justify-between items-center">
                <div>
                  <div className="font-bold">{j.title}</div>
                  <div className="text-sm text-steel-500 mt-0.5">{statusLabel(j.status)}</div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold font-display">R$ {j.price.toFixed(0)}</div>
                  {j.mechanic_id && (
                    <Link to={`/oficina/job/${j.id}/tracking`} className="btn-primary text-xs mt-1">Ver no mapa</Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-lg font-bold mb-3">Histórico</h2>
        {history.length === 0 ? <div className="card text-center text-steel-500 py-6">Sem histórico ainda.</div> : (
          <div className="card divide-y divide-steel-100">
            {history.map(j => (
              <div key={j.id} className="py-3 flex justify-between items-center">
                <div>
                  <div className="font-semibold">{j.title}</div>
                  <div className="text-xs text-steel-500">{statusLabel(j.status)} · {j.completed_at ? new Date(j.completed_at).toLocaleDateString('pt-BR') : '—'}</div>
                </div>
                <div className="font-bold font-display">R$ {j.price.toFixed(2)}</div>
              </div>
            ))}
          </div>
        )}
      </section>
    </WorkshopLayout>
  );
}

function KPI({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="card">
      <div className="text-xs text-steel-500 uppercase tracking-wider">{label}</div>
      <div className="text-3xl font-bold font-display mt-1">{value}</div>
    </div>
  );
}
function statusLabel(s: string) {
  return ({ open: 'Aguardando mecânico', assigned: 'Mecânico a caminho', in_progress: 'Em serviço', completed: 'Concluído', disputed: 'Em disputa', cancelled: 'Cancelado' } as Record<string, string>)[s] ?? s;
}
