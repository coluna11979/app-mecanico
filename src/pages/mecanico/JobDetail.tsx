import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import MechanicLayout from '@/components/layout/MechanicLayout';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { Job, Workshop } from '@/types/database';

export default function MechanicJobDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const nav = useNavigate();
  const [job, setJob] = useState<Job | null>(null);
  const [shop, setShop] = useState<Workshop | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (id) load(); }, [id]);

  async function load() {
    const { data: j } = await supabase.from('jobs').select('*').eq('id', id).maybeSingle();
    setJob(j as Job);
    if (j) {
      const { data: w } = await supabase.from('workshops').select('*').eq('id', j.workshop_id).maybeSingle();
      setShop(w as Workshop);
    }
  }

  async function accept() {
    if (!job || !user) return;
    setBusy(true);
    const { data: m } = await supabase.from('mechanics').select('id').eq('profile_id', user.id).maybeSingle();
    if (!m) { setBusy(false); return; }
    await supabase.from('jobs').update({ status: 'assigned', mechanic_id: m.id }).eq('id', job.id);
    nav(`/mecanico/job/${job.id}/tracking`);
  }

  if (!job) return <MechanicLayout><div className="p-6 text-steel-400">Carregando…</div></MechanicLayout>;

  return (
    <MechanicLayout>
      <div className="p-4 space-y-4">
        <Link to="/mecanico/dashboard" className="text-sm text-steel-400">← Voltar</Link>

        <div className="card !bg-steel-800">
          <div className="text-xs text-brand-500 uppercase tracking-wider font-bold">Job disponível</div>
          <h1 className="text-2xl font-bold mt-1">{job.title}</h1>
          <div className="mt-2 text-3xl font-bold text-brand-500 font-display">R$ {job.price.toFixed(2)}</div>
          <p className="mt-4 text-steel-300 leading-relaxed">{job.description}</p>
        </div>

        {shop && (
          <div className="card !bg-steel-800">
            <div className="text-xs text-steel-400 uppercase tracking-wider mb-1">Oficina</div>
            <div className="font-bold text-lg">{shop.business_name}</div>
            <div className="text-sm text-steel-300 mt-1">{shop.address}, {shop.city}/{shop.state}</div>
            <div className="text-sm text-steel-400 mt-2">★ {shop.rating.toFixed(1)} · {shop.total_jobs} jobs</div>
          </div>
        )}

        <div className="card !bg-steel-800">
          <div className="text-xs text-steel-400 uppercase tracking-wider mb-1">Seu repasse (85%)</div>
          <div className="text-xl font-bold text-signal-500 font-display">R$ {(job.price * 0.85).toFixed(2)}</div>
          <div className="text-xs text-steel-400 mt-1">Liberado via PIX em até 24h após confirmação</div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Link to="/mecanico/dashboard" className="btn-ghost btn-lg">Recusar</Link>
          <button onClick={accept} disabled={busy} className="btn-primary btn-lg">{busy ? '…' : 'Aceitar job'}</button>
        </div>
      </div>
    </MechanicLayout>
  );
}
