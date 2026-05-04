import { ChangeEvent, FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import WorkshopLayout from '@/components/layout/WorkshopLayout';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { Job, Workshop } from '@/types/database';

type NewJob = { title: string; description: string; price: string; scheduled_at: string };
const EMPTY: NewJob = { title: '', description: '', price: '', scheduled_at: '' };

export default function WorkshopDashboard() {
  const { user } = useAuth();
  const [shop, setShop]     = useState<Workshop | null>(null);
  const [active, setActive] = useState<Job[]>([]);
  const [history, setHistory] = useState<Job[]>([]);
  const [modal, setModal]   = useState(false);
  const [form, setForm]     = useState<NewJob>(EMPTY);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (user) load(); }, [user]);

  async function load() {
    const { data: w } = await supabase.from('workshops').select('*').eq('profile_id', user!.id).maybeSingle();
    setShop(w as Workshop);
    if (w?.id) await fetchJobs(w.id);
  }

  async function fetchJobs(workshopId: string) {
    const [{ data: a }, { data: h }] = await Promise.all([
      supabase.from('jobs').select('*').eq('workshop_id', workshopId)
        .in('status', ['open', 'assigned', 'in_progress']).order('created_at', { ascending: false }),
      supabase.from('jobs').select('*').eq('workshop_id', workshopId)
        .in('status', ['completed', 'disputed', 'cancelled']).order('created_at', { ascending: false }).limit(10),
    ]);
    setActive((a as Job[]) ?? []);
    setHistory((h as Job[]) ?? []);
  }

  async function createJob(e: FormEvent) {
    e.preventDefault();
    if (!shop) return;
    setSaving(true);
    const payload: Record<string, unknown> = {
      workshop_id: shop.id,
      title: form.title.trim(),
      description: form.description.trim(),
      price: Number(form.price),
      status: 'open',
    };
    if (form.scheduled_at) payload.scheduled_at = new Date(form.scheduled_at).toISOString();
    await supabase.from('jobs').insert(payload);
    setSaving(false);
    setModal(false);
    setForm(EMPTY);
    await fetchJobs(shop.id);
  }

  function set(k: keyof NewJob) {
    return (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm(f => ({ ...f, [k]: e.target.value }));
  }

  return (
    <WorkshopLayout>
      {/* Header */}
      <div className="flex justify-between items-end mb-6">
        <div>
          <div className="text-sm text-steel-500">Olá,</div>
          <h1 className="text-3xl font-bold tracking-tight">{shop?.business_name ?? '...'}</h1>
        </div>
        <button onClick={() => setModal(true)} className="btn-primary btn-lg">
          + Nova demanda
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <KPI label="Jobs ativos" value={active.length} />
        <KPI label="Concluídos"  value={shop?.total_jobs ?? 0} />
        <KPI label="Avaliação"   value={`★ ${(shop?.rating ?? 0).toFixed(1)}`} />
      </div>

      {/* Jobs em andamento */}
      <section className="mb-8">
        <h2 className="text-lg font-bold mb-3">Em andamento</h2>
        {active.length === 0 ? (
          <div className="card text-center text-steel-500 py-10">
            Nenhum job ativo.{' '}
            <button onClick={() => setModal(true)} className="text-brand-500 font-semibold">
              Criar uma demanda →
            </button>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-3">
            {active.map(j => (
              <div key={j.id} className="card flex justify-between items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="font-bold truncate">{j.title}</div>
                  <div className="text-sm text-steel-500 mt-0.5">{statusLabel(j.status)}</div>
                  {j.scheduled_at && (
                    <div className="text-xs text-steel-400 mt-1">
                      {new Date(j.scheduled_at).toLocaleString('pt-BR', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' })}
                    </div>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <div className="text-lg font-bold font-display">R$ {j.price.toFixed(0)}</div>
                  {j.mechanic_id && (
                    <Link to={`/oficina/job/${j.id}/tracking`} className="btn-primary text-xs mt-1 inline-block">
                      Ver no mapa
                    </Link>
                  )}
                  {j.status === 'open' && (
                    <div className="mt-1 text-xs text-pending-600 font-semibold">Aguardando mecânico…</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Histórico */}
      <section>
        <h2 className="text-lg font-bold mb-3">Histórico</h2>
        {history.length === 0 ? (
          <div className="card text-center text-steel-500 py-6">Sem histórico ainda.</div>
        ) : (
          <div className="card divide-y divide-steel-100">
            {history.map(j => (
              <div key={j.id} className="py-3 flex justify-between items-center">
                <div>
                  <div className="font-semibold">{j.title}</div>
                  <div className="text-xs text-steel-500">
                    {statusLabel(j.status)} · {j.completed_at ? new Date(j.completed_at).toLocaleDateString('pt-BR') : '—'}
                  </div>
                </div>
                <div className="font-bold font-display">R$ {j.price.toFixed(2)}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Modal nova demanda */}
      {modal && (
        <div className="fixed inset-0 bg-steel-900/70 grid place-items-center p-4 z-50" onClick={() => setModal(false)}>
          <form
            onClick={e => e.stopPropagation()}
            onSubmit={createJob}
            className="card max-w-lg w-full space-y-4"
          >
            <div>
              <h2 className="text-2xl font-bold tracking-tight">Nova demanda</h2>
              <p className="text-sm text-steel-500 mt-1">
                Descreva o serviço — mecânicos disponíveis vão ver e poderão aceitar.
              </p>
            </div>

            <div>
              <label className="label">Título do serviço *</label>
              <input className="input" required placeholder="Ex.: Troca de pastilha de freio"
                value={form.title} onChange={set('title')} />
            </div>

            <div>
              <label className="label">Descrição *</label>
              <textarea className="input" rows={3} required
                placeholder="Descreva o problema, veículo, detalhes importantes…"
                value={form.description} onChange={set('description')} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Valor estimado (R$) *</label>
                <input className="input" type="number" min={1} required
                  placeholder="0" value={form.price} onChange={set('price')} />
              </div>
              <div>
                <label className="label">Data / hora desejada</label>
                <input className="input" type="datetime-local"
                  value={form.scheduled_at} onChange={set('scheduled_at')} />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setModal(false)} className="btn-ghost flex-1">
                Cancelar
              </button>
              <button className="btn-primary flex-1 btn-lg" disabled={saving}>
                {saving ? 'Publicando…' : 'Publicar demanda'}
              </button>
            </div>
          </form>
        </div>
      )}
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
  return ({
    open:        'Aguardando mecânico',
    assigned:    'Mecânico a caminho',
    in_progress: 'Em serviço',
    completed:   'Concluído',
    disputed:    'Em disputa',
    cancelled:   'Cancelado',
  } as Record<string, string>)[s] ?? s;
}
