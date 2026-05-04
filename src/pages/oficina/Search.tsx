import { FormEvent, useEffect, useState } from 'react';
import WorkshopLayout from '@/components/layout/WorkshopLayout';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { Mechanic, Profile, Workshop } from '@/types/database';

const ALL_SKILLS = ['Motor', 'Suspensão', 'Freios', 'Elétrica', 'Injeção eletrônica', 'Câmbio', 'Ar-condicionado', 'Diagnóstico', 'Diesel'];

type MechRow = Mechanic & { profile: Profile };

export default function WorkshopSearch() {
  const { user } = useAuth();
  const [shop, setShop] = useState<Workshop | null>(null);
  const [filter, setFilter] = useState({ skill: '', minRating: 0, maxRate: 500 });
  const [list, setList] = useState<MechRow[]>([]);
  const [loading, setLoading] = useState(true);

  // hire modal
  const [target, setTarget] = useState<MechRow | null>(null);
  const [job, setJob] = useState({ title: '', description: '', price: 0 });
  const [hiring, setHiring] = useState(false);

  useEffect(() => {
    supabase.from('workshops').select('*').eq('profile_id', user!.id).maybeSingle()
      .then(({ data }) => setShop(data as Workshop));
  }, [user]);

  useEffect(() => { search(); }, [filter]);

  async function search() {
    setLoading(true);
    let q = supabase.from('mechanics').select('*, profile:profiles!inner(*)').eq('is_available', true).gte('rating', filter.minRating).lte('hourly_rate', filter.maxRate);
    if (filter.skill) q = q.contains('skills', [filter.skill]);
    const { data } = await q.limit(50);
    const rows = (data as unknown as MechRow[] ?? []).filter(r => r.profile?.status === 'approved');
    setList(rows);
    setLoading(false);
  }

  async function hire(e: FormEvent) {
    e.preventDefault();
    if (!shop || !target) return;
    setHiring(true);
    await supabase.from('jobs').insert({
      workshop_id: shop.id, mechanic_id: target.id,
      title: job.title, description: job.description, price: job.price,
      status: 'assigned',
    });
    setHiring(false); setTarget(null);
    alert('Mecânico contratado! Acompanhe pelo dashboard.');
  }

  return (
    <WorkshopLayout>
      <h1 className="text-3xl font-bold tracking-tight mb-6">Buscar mecânicos disponíveis</h1>

      <div className="card mb-6 grid md:grid-cols-3 gap-4">
        <div>
          <label className="label">Especialidade</label>
          <select className="input" value={filter.skill} onChange={e => setFilter(f => ({ ...f, skill: e.target.value }))}>
            <option value="">Todas</option>
            {ALL_SKILLS.map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Avaliação mínima</label>
          <input type="number" min={0} max={5} step={0.5} className="input" value={filter.minRating}
            onChange={e => setFilter(f => ({ ...f, minRating: Number(e.target.value) }))} />
        </div>
        <div>
          <label className="label">Valor/hora máximo (R$)</label>
          <input type="number" className="input" value={filter.maxRate}
            onChange={e => setFilter(f => ({ ...f, maxRate: Number(e.target.value) }))} />
        </div>
      </div>

      {loading ? <div className="text-steel-500">Buscando…</div> :
        list.length === 0 ? <div className="card text-center text-steel-500 py-10">Nenhum mecânico encontrado.</div> :
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {list.map(m => (
            <div key={m.id} className="card flex flex-col">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-full bg-brand-500 grid place-items-center text-white font-bold">
                  {m.profile.full_name.charAt(0)}
                </div>
                <div className="flex-1">
                  <div className="font-bold">{m.profile.full_name}</div>
                  <div className="text-xs text-steel-500">★ {m.rating.toFixed(1)} · {m.total_jobs} jobs · {m.experience_years}a</div>
                </div>
                <span className="badge-success">●</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-1">
                {m.skills.slice(0, 4).map(s => <span key={s} className="badge bg-steel-100 text-steel-700">{s}</span>)}
              </div>
              <div className="mt-3 flex justify-between items-center">
                <div><span className="text-2xl font-bold font-display">R$ {m.hourly_rate.toFixed(0)}</span><span className="text-xs text-steel-500">/h</span></div>
                <button onClick={() => setTarget(m)} className="btn-primary">Contratar</button>
              </div>
            </div>
          ))}
        </div>}

      {target && (
        <div className="fixed inset-0 bg-steel-900/60 grid place-items-center p-4 z-50" onClick={() => setTarget(null)}>
          <form onClick={e => e.stopPropagation()} onSubmit={hire} className="card max-w-md w-full">
            <h3 className="text-xl font-bold">Contratar {target.profile.full_name}</h3>
            <p className="text-sm text-steel-500 mt-1">Valor referência: R$ {target.hourly_rate.toFixed(0)}/h</p>
            <div className="mt-4 space-y-3">
              <div><label className="label">Título do serviço</label>
                <input className="input" required value={job.title} onChange={e => setJob(j => ({ ...j, title: e.target.value }))} placeholder="Ex.: Troca de pastilha de freio" /></div>
              <div><label className="label">Descrição</label>
                <textarea className="input" rows={3} required value={job.description} onChange={e => setJob(j => ({ ...j, description: e.target.value }))} /></div>
              <div><label className="label">Valor total (R$)</label>
                <input type="number" min={1} className="input" required value={job.price} onChange={e => setJob(j => ({ ...j, price: Number(e.target.value) }))} /></div>
            </div>
            <div className="flex gap-2 mt-5">
              <button type="button" onClick={() => setTarget(null)} className="btn-ghost flex-1">Cancelar</button>
              <button className="btn-primary flex-1" disabled={hiring}>{hiring ? '…' : 'Contratar'}</button>
            </div>
          </form>
        </div>
      )}
    </WorkshopLayout>
  );
}
