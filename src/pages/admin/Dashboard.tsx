import { useEffect, useState } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { supabase } from '@/lib/supabase';

interface Stats {
  pendingProfiles: number;
  activeJobs: number;
  totalMechanics: number;
  totalWorkshops: number;
  completedJobs: number;
  volume: number;
}

export default function AdminDashboard() {
  const [s, setS] = useState<Stats | null>(null);

  useEffect(() => { load(); }, []);
  async function load() {
    const [{ count: pending }, { count: active }, { count: mech }, { count: shop }, { data: completed }] = await Promise.all([
      supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('jobs').select('*', { count: 'exact', head: true }).in('status', ['assigned', 'in_progress']),
      supabase.from('mechanics').select('*', { count: 'exact', head: true }),
      supabase.from('workshops').select('*', { count: 'exact', head: true }),
      supabase.from('jobs').select('price').eq('status', 'completed'),
    ]);
    const volume = (completed ?? []).reduce((a: number, j: { price: number }) => a + j.price, 0);
    setS({
      pendingProfiles: pending ?? 0, activeJobs: active ?? 0,
      totalMechanics: mech ?? 0, totalWorkshops: shop ?? 0,
      completedJobs: completed?.length ?? 0, volume,
    });
  }

  return (
    <AdminLayout>
      <h1 className="text-3xl font-bold tracking-tight mb-2">Dashboard</h1>
      <p className="text-steel-500 mb-8">Visão geral da plataforma</p>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        <Card label="Aprovações pendentes" value={s?.pendingProfiles ?? 0} accent="brand" />
        <Card label="Jobs ativos agora" value={s?.activeJobs ?? 0} />
        <Card label="Volume processado" value={`R$ ${(s?.volume ?? 0).toFixed(2)}`} accent="signal" />
        <Card label="Mecânicos cadastrados" value={s?.totalMechanics ?? 0} />
        <Card label="Oficinas cadastradas" value={s?.totalWorkshops ?? 0} />
        <Card label="Jobs concluídos" value={s?.completedJobs ?? 0} />
      </div>
    </AdminLayout>
  );
}

function Card({ label, value, accent }: { label: string; value: string | number; accent?: 'brand' | 'signal' }) {
  return (
    <div className="card">
      <div className="text-xs uppercase tracking-wider text-steel-500">{label}</div>
      <div className={`text-4xl font-bold font-display mt-2 ${accent === 'brand' ? 'text-brand-500' : accent === 'signal' ? 'text-signal-500' : ''}`}>{value}</div>
    </div>
  );
}
