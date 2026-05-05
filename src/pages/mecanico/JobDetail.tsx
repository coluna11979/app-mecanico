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

        {/* Job header */}
        <div className="card !bg-steel-800">
          <div className="text-xs text-brand-400 uppercase tracking-wider font-bold">Job disponível</div>
          <h1 className="text-2xl font-bold mt-1">{job.title}</h1>
          <p className="mt-3 text-steel-300 leading-relaxed">{job.description}</p>
          {job.scheduled_at && (
            <div className="mt-3 flex items-center gap-2 text-sm text-steel-400">
              <span>📅</span>
              <span>{new Date(job.scheduled_at).toLocaleString('pt-BR', { weekday:'short', day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' })}</span>
            </div>
          )}
        </div>

        {/* Pricing breakdown */}
        {(() => {
          const pph = job.price_per_hour ?? 0;
          const mh  = job.max_hours ?? 1;
          const cap = pph * mh;
          return (
            <div className="card !bg-steel-800 grid grid-cols-3 divide-x divide-steel-700 text-center">
              <div className="px-2 py-1">
                <div className="text-[10px] text-steel-500 uppercase tracking-wider">R$/hora</div>
                <div className="text-xl font-bold text-brand-400 font-display mt-1">R$ {pph.toFixed(0)}</div>
              </div>
              <div className="px-2 py-1">
                <div className="text-[10px] text-steel-500 uppercase tracking-wider">Máx. horas</div>
                <div className="text-xl font-bold text-white font-display mt-1">{mh}h</div>
              </div>
              <div className="px-2 py-1">
                <div className="text-[10px] text-steel-500 uppercase tracking-wider">Teto</div>
                <div className="text-xl font-bold text-signal-400 font-display mt-1">R$ {cap.toFixed(0)}</div>
              </div>
            </div>
          );
        })()}

        {/* Workshop info */}
        {shop && (
          <div className="card !bg-steel-800">
            <div className="text-xs text-steel-500 uppercase tracking-wider mb-2">Oficina contratante</div>
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-xl bg-brand-500/20 grid place-items-center text-brand-400 text-xl shrink-0">🏭</div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-base">{shop.business_name}</div>
                <div className="text-sm text-steel-400 truncate">{shop.address}, {shop.city}/{shop.state}</div>
                <div className="text-xs text-steel-500 mt-0.5">★ {shop.rating.toFixed(1)} · {shop.total_jobs} jobs concluídos</div>
              </div>
            </div>
          </div>
        )}

        {/* Your cut */}
        {(() => {
          const cap = (job.price_per_hour ?? 0) * (job.max_hours ?? 1);
          return (
            <div className="card !bg-steel-800 border border-signal-500/20">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-steel-500 uppercase tracking-wider">Seu repasse (85%)</div>
                  <div className="text-2xl font-bold text-signal-400 font-display mt-1">R$ {(cap * 0.85).toFixed(2)}</div>
                  <div className="text-xs text-steel-500 mt-0.5">se cobrar as {job.max_hours}h máximas</div>
                </div>
                <div className="h-12 w-12 rounded-full bg-signal-500/10 grid place-items-center text-2xl">💸</div>
              </div>
              <div className="text-xs text-steel-600 mt-3">Liberado via PIX em até 24h após confirmação da oficina</div>
            </div>
          );
        })()}

        <div className="grid grid-cols-2 gap-2">
          <Link to="/mecanico/dashboard" className="btn-ghost btn-lg">Recusar</Link>
          <button onClick={accept} disabled={busy} className="btn-primary btn-lg">{busy ? '…' : 'Aceitar job'}</button>
        </div>
      </div>
    </MechanicLayout>
  );
}
