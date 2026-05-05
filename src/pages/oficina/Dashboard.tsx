import { ChangeEvent, FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import WorkshopLayout from '@/components/layout/WorkshopLayout';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { Job, Workshop } from '@/types/database';

type NewJob = {
  title: string; description: string;
  price_per_hour: string; max_hours: string; scheduled_at: string;
};
type MechanicOption = { id: string; name: string; rating: number; total_jobs: number; hourly_rate: number };
type JobMode = 'open' | 'direct';

const EMPTY: NewJob = { title: '', description: '', price_per_hour: '', max_hours: '1', scheduled_at: '' };

export default function WorkshopDashboard() {
  const { user } = useAuth();
  const [shop, setShop]         = useState<Workshop | null>(null);
  const [active, setActive]     = useState<Job[]>([]);
  const [history, setHistory]   = useState<Job[]>([]);
  const [mechanics, setMechanics] = useState<MechanicOption[]>([]);
  const [modal, setModal]       = useState(false);
  const [form, setForm]         = useState<NewJob>(EMPTY);
  const [mode, setMode]         = useState<JobMode>('open');
  const [pickedMechanic, setPickedMechanic] = useState<string>('');
  const [mechSearch, setMechSearch] = useState('');
  const [saving, setSaving]     = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => { if (user) load(); }, [user]);

  async function load() {
    const { data: w } = await supabase.from('workshops').select('*').eq('profile_id', user!.id).maybeSingle();
    setShop(w as Workshop);
    if (w?.id) {
      await Promise.all([fetchJobs(w.id), fetchMechanics()]);
    }
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

  async function fetchMechanics() {
    const { data } = await supabase
      .from('mechanics')
      .select('id, rating, total_jobs, hourly_rate, is_available, profile:profiles!inner(full_name, status)')
      .eq('profile.status', 'approved')
      .eq('is_available', true)
      .order('rating', { ascending: false });
    const list = (data ?? []).map((m: any) => ({
      id: m.id,
      name: m.profile.full_name,
      rating: m.rating,
      total_jobs: m.total_jobs,
      hourly_rate: m.hourly_rate,
    }));
    setMechanics(list);
  }

  function resetModal() {
    setModal(false); setForm(EMPTY);
    setMode('open'); setPickedMechanic(''); setMechSearch(''); setFormError(null);
  }

  async function createJob(e: FormEvent) {
    e.preventDefault();
    setFormError(null);

    // Validação explícita (mobile não mostra o tooltip do browser)
    if (!form.title.trim()) return setFormError('Informe o título do serviço.');
    if (!form.description.trim()) return setFormError('Informe a descrição do serviço.');
    const pph = Number(form.price_per_hour);
    const mh  = Number(form.max_hours);
    if (!pph || pph < 1) return setFormError('Informe o valor por hora (mínimo R$ 1).');
    if (!mh  || mh  < 0.5) return setFormError('Informe o máximo de horas (mínimo 0,5h).');
    if (mode === 'direct' && !pickedMechanic) return setFormError('Selecione o mecânico para contratação direta.');
    if (!shop) return setFormError('Oficina não carregada. Recarregue a página.');

    setSaving(true);
    const isDirect = mode === 'direct' && !!pickedMechanic;
    const payload: Record<string, unknown> = {
      workshop_id:    shop.id,
      title:          form.title.trim(),
      description:    form.description.trim(),
      price_per_hour: pph,
      max_hours:      mh,
      price:          pph * mh,
      status:         isDirect ? 'assigned' : 'open',
      mechanic_id:    isDirect ? pickedMechanic : null,
    };
    if (form.scheduled_at) payload.scheduled_at = new Date(form.scheduled_at).toISOString();
    await supabase.from('jobs').insert(payload);
    setSaving(false);
    resetModal();
    await fetchJobs(shop.id);
  }

  function set(k: keyof NewJob) {
    return (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm(f => ({ ...f, [k]: e.target.value }));
  }

  const estimated = Number(form.price_per_hour) * Number(form.max_hours);
  const filteredMechanics = mechanics.filter(m =>
    m.name.toLowerCase().includes(mechSearch.toLowerCase())
  );

  return (
    <WorkshopLayout>
      {/* Header */}
      <div className="flex justify-between items-center mb-6 gap-3">
        <div className="min-w-0">
          <div className="text-sm text-steel-500">Olá,</div>
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight truncate">{shop?.business_name ?? '...'}</h1>
        </div>
        <button onClick={() => setModal(true)} className="btn-primary shrink-0">
          <span className="hidden sm:inline">+ Nova demanda</span>
          <span className="sm:hidden">+ Nova</span>
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3 mb-6">
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
                  <div className="text-xs text-steel-400 mt-1">
                    R$ {j.price_per_hour?.toFixed(0) ?? '—'}/h · máx {j.max_hours ?? '—'}h
                  </div>
                  {j.scheduled_at && (
                    <div className="text-xs text-steel-400 mt-0.5">
                      📅 {new Date(j.scheduled_at).toLocaleString('pt-BR', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' })}
                    </div>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <div className="text-xs text-steel-400">até</div>
                  <div className="text-lg font-bold font-display">R$ {j.price.toFixed(0)}</div>
                  {j.mechanic_id ? (
                    <Link to={`/oficina/job/${j.id}/tracking`} className="btn-primary text-xs mt-1 inline-block">
                      Ver no mapa
                    </Link>
                  ) : (
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
                  {j.actual_hours != null && (
                    <div className="text-xs text-steel-400">{j.actual_hours}h × R$ {j.price_per_hour}/h</div>
                  )}
                </div>
                <div className="text-right">
                  <div className="font-bold font-display">R$ {j.price.toFixed(2)}</div>
                  {j.actual_hours != null && <div className="text-xs text-signal-600">final</div>}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Modal nova demanda ── */}
      {modal && (
        <div className="fixed inset-0 bg-steel-900/70 z-50 flex items-end sm:items-center justify-center sm:p-4" onClick={resetModal}>
          <form
            onClick={e => e.stopPropagation()}
            onSubmit={createJob}
            className="bg-white w-full sm:rounded-2xl sm:max-w-lg sm:shadow-2xl rounded-t-3xl max-h-[92vh] flex flex-col"
          >
            {/* Sheet handle (mobile) */}
            <div className="flex justify-center pt-3 pb-1 sm:hidden">
              <div className="w-10 h-1 bg-steel-200 rounded-full" />
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto px-5 pb-2 pt-4 space-y-4">
              <div>
                <h2 className="text-xl font-bold tracking-tight">Nova demanda</h2>
                <p className="text-sm text-steel-500 mt-0.5">Descreva o serviço e escolha como publicar.</p>
              </div>

              {/* Título */}
              <div>
                <label className="label">Título do serviço *</label>
                <input className="input" required placeholder="Ex.: Troca de pastilha de freio — Civic"
                  value={form.title} onChange={set('title')} />
              </div>

              {/* Descrição */}
              <div>
                <label className="label">Descrição *</label>
                <textarea className="input" rows={3} required
                  placeholder="Descreva o problema, veículo, detalhes importantes…"
                  value={form.description} onChange={set('description')} />
              </div>

              {/* Precificação */}
              <div>
                <label className="label">Precificação por hora</label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-steel-400 text-sm">R$</span>
                      <input className="input !pl-9" type="number" min={1} required
                        placeholder="60" value={form.price_per_hour} onChange={set('price_per_hour')} />
                    </div>
                    <div className="text-xs text-steel-400 mt-1">Valor por hora</div>
                  </div>
                  <div>
                    <div className="relative">
                      <input className="input !pr-9" type="number" min={0.5} max={24} step={0.5} required
                        placeholder="2" value={form.max_hours} onChange={set('max_hours')} />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-steel-400 text-sm">h</span>
                    </div>
                    <div className="text-xs text-steel-400 mt-1">Máximo de horas</div>
                  </div>
                </div>
                {estimated > 0 && (
                  <div className="mt-2 bg-brand-50 border border-brand-200 rounded-xl px-4 py-2.5 flex justify-between items-center">
                    <span className="text-sm text-brand-700">Teto do orçamento</span>
                    <span className="font-bold text-brand-700 font-display">R$ {estimated.toFixed(2)}</span>
                  </div>
                )}
              </div>

              {/* Modo de publicação */}
              <div>
                <label className="label">Como publicar</label>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => { setMode('open'); setPickedMechanic(''); }}
                    className={`rounded-xl border-2 p-3 text-left transition active:scale-95 ${mode === 'open' ? 'border-brand-500 bg-brand-50' : 'border-steel-200'}`}>
                    <div className="text-lg mb-1">📢</div>
                    <div className="font-semibold text-sm">Para todos</div>
                    <div className="text-xs text-steel-500 mt-0.5">Mecânicos disponíveis verão e poderão aceitar</div>
                  </button>
                  <button type="button" onClick={() => setMode('direct')}
                    className={`rounded-xl border-2 p-3 text-left transition active:scale-95 ${mode === 'direct' ? 'border-brand-500 bg-brand-50' : 'border-steel-200'}`}>
                    <div className="text-lg mb-1">🎯</div>
                    <div className="font-semibold text-sm">Mecânico específico</div>
                    <div className="text-xs text-steel-500 mt-0.5">Convide diretamente e inicie o chat</div>
                  </button>
                </div>
              </div>

              {/* Picker de mecânico */}
              {mode === 'direct' && (
                <div>
                  <label className="label">Escolher mecânico *</label>
                  <input className="input mb-2" placeholder="Buscar por nome…"
                    value={mechSearch} onChange={e => setMechSearch(e.target.value)} />
                  <div className="space-y-2 max-h-44 overflow-y-auto">
                    {filteredMechanics.length === 0 ? (
                      <div className="text-sm text-steel-400 text-center py-4">
                        Nenhum mecânico disponível no momento
                      </div>
                    ) : filteredMechanics.map(m => (
                      <button key={m.id} type="button"
                        onClick={() => setPickedMechanic(m.id)}
                        className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 text-left transition active:scale-95 ${
                          pickedMechanic === m.id ? 'border-brand-500 bg-brand-50' : 'border-steel-100'
                        }`}>
                        <div className="h-10 w-10 rounded-full bg-brand-500/10 grid place-items-center text-brand-600 font-bold shrink-0">
                          {m.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold truncate">{m.name}</div>
                          <div className="text-xs text-steel-500">
                            ★ {m.rating.toFixed(1)} · {m.total_jobs} jobs · R$ {m.hourly_rate}/h
                          </div>
                        </div>
                        {pickedMechanic === m.id && <span className="text-brand-500 text-lg">✓</span>}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Data */}
              <div>
                <label className="label">Data / hora desejada</label>
                <input className="input" type="datetime-local"
                  value={form.scheduled_at} onChange={set('scheduled_at')} />
              </div>
            </div>

            {/* Sticky footer */}
            <div className="px-5 py-4 border-t border-steel-100 bg-white rounded-b-3xl sm:rounded-b-2xl space-y-3">
              {formError && (
                <div className="bg-alert-500/10 border border-alert-300 text-alert-700 text-sm font-semibold rounded-xl px-4 py-2.5 flex items-center gap-2">
                  <span>⚠️</span><span>{formError}</span>
                </div>
              )}
              <div className="flex gap-3">
                <button type="button" onClick={resetModal} className="btn-ghost flex-1">Cancelar</button>
                <button type="submit" className="btn-primary flex-1" disabled={saving}>
                  {saving ? 'Publicando…' : mode === 'direct' ? 'Convidar mecânico' : 'Publicar demanda'}
                </button>
              </div>
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
