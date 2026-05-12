import { ChangeEvent, FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import WorkshopLayout from '@/components/layout/WorkshopLayout';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { PendingFeesBanner, usePendingFees } from '@/components/PendingFeesGate';
import { CancelJobButton } from '@/components/CancelJobButton';
import { MechanicReviews } from '@/components/MechanicReviews';
import type { Job } from '@/types/database';

type NewJob = {
  title: string; description: string;
  price_per_hour: string; max_hours: string; scheduled_at: string;
};
type MechanicOption = { id: string; name: string; rating: number; total_jobs: number; hourly_rate: number };
type JobMode = 'open' | 'direct';

const EMPTY: NewJob = { title: '', description: '', price_per_hour: '', max_hours: '1', scheduled_at: '' };

const draftKey = (workshopId: string) => `draft_job_${workshopId}`;
function loadDraft(workshopId: string): NewJob | null {
  try {
    const raw = localStorage.getItem(draftKey(workshopId));
    if (!raw) return null;
    const d = JSON.parse(raw) as Partial<NewJob>;
    const hasContent = !!(d.title?.trim() || d.description?.trim() || d.price_per_hour || d.scheduled_at);
    if (!hasContent) return null;
    return { ...EMPTY, ...d };
  } catch { return null; }
}

export default function WorkshopDashboard() {
  const { user, currentWorkshop } = useAuth();
  const shop = currentWorkshop;
  const [active, setActive]     = useState<Job[]>([]);
  const [history, setHistory]   = useState<Job[]>([]);
  const [pendingConfirm, setPendingConfirm] = useState<Job[]>([]);
  const [pendingRate, setPendingRate] = useState<Job[]>([]);
  const [mechanics, setMechanics] = useState<MechanicOption[]>([]);
  const [modal, setModal]       = useState(false);
  const [form, setForm]         = useState<NewJob>(EMPTY);
  const [draftRestored, setDraftRestored] = useState(false);
  const [marketRate, setMarketRate] = useState<{ low: number; high: number; count: number } | null>(null);
  const [mode, setMode]         = useState<JobMode>('open');
  const [pickedMechanic, setPickedMechanic] = useState<string>('');
  const [mechSearch, setMechSearch] = useState('');
  const [reviewsOpen, setReviewsOpen] = useState<string | null>(null);
  const [saving, setSaving]     = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const shopLoading = !currentWorkshop;
  const hasPendingFees = usePendingFees(currentWorkshop?.id ?? null);

  // Recarrega jobs quando a oficina ativa mudar (troca pelo seletor)
  useEffect(() => {
    if (!user || !currentWorkshop) return;
    fetchJobs(currentWorkshop.id);
    fetchMechanics();
  }, [user, currentWorkshop?.id]);

  /* ── Realtime — atualiza listas em tempo real (status, chegada, etc) ── */
  useEffect(() => {
    if (!currentWorkshop?.id) return;
    const wid = currentWorkshop.id;
    const ch = supabase.channel(`oficina:dashboard:${wid}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'jobs',
        filter: `workshop_id=eq.${wid}`,
      }, () => fetchJobs(wid))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [currentWorkshop?.id]);

  /* Polling fallback (8s) — caso realtime caia */
  useEffect(() => {
    if (!currentWorkshop?.id) return;
    const wid = currentWorkshop.id;
    const t = setInterval(() => fetchJobs(wid), 8000);
    return () => clearInterval(t);
  }, [currentWorkshop?.id]);

  async function fetchJobs(workshopId: string) {
    const [{ data: a }, { data: h }, { data: pc }, { data: pr }] = await Promise.all([
      // Em andamento
      supabase.from('jobs').select('*').eq('workshop_id', workshopId)
        .in('status', ['open', 'assigned', 'in_progress']).order('created_at', { ascending: false }),
      // Histórico
      supabase.from('jobs').select('*').eq('workshop_id', workshopId)
        .in('status', ['completed', 'disputed', 'cancelled']).order('created_at', { ascending: false }).limit(10),
      // Aguardando CONFIRMAÇÃO (mecânico finalizou, oficina ainda não confirmou)
      supabase.from('jobs').select('*').eq('workshop_id', workshopId)
        .eq('status', 'completed').is('workshop_confirmed_at', null)
        .order('completed_at', { ascending: false }),
      // Aguardando AVALIAÇÃO (oficina já confirmou, mas não avaliou ainda — opcional)
      supabase.from('jobs').select('*').eq('workshop_id', workshopId)
        .eq('status', 'completed').not('workshop_confirmed_at', 'is', null).is('mechanic_rating', null)
        .order('workshop_confirmed_at', { ascending: false }).limit(10),
    ]);
    setActive((a as Job[]) ?? []);
    setHistory((h as Job[]) ?? []);
    setPendingConfirm((pc as Job[]) ?? []);
    setPendingRate((pr as Job[]) ?? []);
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
    setDraftRestored(false);
  }

  function openCreateModal() {
    if (currentWorkshop?.id) {
      const draft = loadDraft(currentWorkshop.id);
      if (draft) { setForm(draft); setDraftRestored(true); }
      else { setForm(EMPTY); setDraftRestored(false); }
    }
    setModal(true);
  }

  function persistDraft(next: NewJob) {
    if (!currentWorkshop?.id) return;
    const hasContent = !!(next.title.trim() || next.description.trim() || next.price_per_hour || next.scheduled_at);
    if (hasContent) localStorage.setItem(draftKey(currentWorkshop.id), JSON.stringify(next));
    else localStorage.removeItem(draftKey(currentWorkshop.id));
  }

  function discardDraft() {
    if (currentWorkshop?.id) localStorage.removeItem(draftKey(currentWorkshop.id));
    setForm(EMPTY);
    setDraftRestored(false);
  }

  async function createJob(e: FormEvent) {
    e.preventDefault();
    setFormError(null);

    // Bloqueio de segurança contra multa pendente (mesmo se UI deixar passar)
    if (hasPendingFees) {
      setFormError('Você tem multa de cancelamento pendente. Quite antes de publicar nova demanda.');
      return;
    }

    // Validação explícita (mobile não mostra o tooltip do browser)
    if (!form.title.trim()) return setFormError('Informe o título do serviço.');
    if (!form.description.trim()) return setFormError('Informe a descrição do serviço.');
    const pph = Number(form.price_per_hour);
    const mh  = Number(form.max_hours);
    if (!pph || pph < 1) return setFormError('Informe o valor por hora (mínimo R$ 1).');
    if (!mh  || mh  < 0.5) return setFormError('Informe o máximo de horas (mínimo 0,5h).');
    if (mode === 'direct' && !pickedMechanic) return setFormError('Selecione o mecânico para contratação direta.');

    if (!shop) return setFormError('Oficina não encontrada. Verifique seu cadastro ou recarregue a página.');
    const currentShop = shop;

    setSaving(true);
    const isDirect = mode === 'direct' && !!pickedMechanic;
    const payload: Record<string, unknown> = {
      workshop_id:    currentShop.id,
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
    localStorage.removeItem(draftKey(currentShop.id));
    resetModal();
    await fetchJobs(currentShop.id);
  }

  function set(k: keyof NewJob) {
    return (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm(f => {
        const next = { ...f, [k]: e.target.value };
        persistDraft(next);
        return next;
      });
  }

  /* ── Sugestão de preço de mercado baseada no título + estado ── */
  useEffect(() => {
    if (!modal) return;
    const state = currentWorkshop?.state;
    const title = form.title.trim();
    if (!state || title.length < 4) { setMarketRate(null); return; }

    const keyword = title.split(/\s+/)[0].toLowerCase();
    if (keyword.length < 3) { setMarketRate(null); return; }

    let alive = true;
    const handle = window.setTimeout(async () => {
      const { data } = await supabase
        .from('jobs')
        .select('price_per_hour, workshop:workshops!inner(state)')
        .ilike('title', `%${keyword}%`)
        .in('status', ['assigned', 'in_progress', 'completed'])
        .eq('workshop.state', state)
        .gt('price_per_hour', 0)
        .limit(200);
      if (!alive) return;
      const prices = (data ?? []).map((d: any) => Number(d.price_per_hour)).filter(n => n > 0).sort((a, b) => a - b);
      if (prices.length < 3) { setMarketRate(null); return; }
      const p25 = prices[Math.floor(prices.length * 0.25)];
      const p75 = prices[Math.floor(prices.length * 0.75)];
      setMarketRate({ low: p25, high: p75, count: prices.length });
    }, 450);

    return () => { alive = false; clearTimeout(handle); };
  }, [form.title, modal, currentWorkshop?.state]);

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
        <button
          onClick={openCreateModal}
          disabled={shopLoading || hasPendingFees}
          title={hasPendingFees ? 'Quite a multa pendente para publicar nova demanda' : undefined}
          className="btn-primary shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {shopLoading ? '…' : hasPendingFees ? (
            <>🔒 Multa pendente</>
          ) : (
            <>
              <span className="hidden sm:inline">+ Nova demanda</span>
              <span className="sm:hidden">+ Nova</span>
            </>
          )}
        </button>
      </div>

      {/* Banner de multa pendente — bloqueia novas demandas até quitar */}
      <PendingFeesBanner workshopId={currentWorkshop?.id ?? null} />


      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <KPI label="Jobs ativos" value={active.length} />
        <KPI label="Concluídos"  value={shop?.total_jobs ?? 0} />
        <KPI label="Avaliação"   value={`★ ${(shop?.rating ?? 0).toFixed(1)}`} />
      </div>

      {/* 🔔 Confirmações pendentes — ação prioritária */}
      {pendingConfirm.length > 0 && (
        <section className="mb-6">
          <div className="bg-gradient-to-r from-brand-50 to-brand-100/40 border-2 border-brand-300 rounded-2xl p-4 sm:p-5">
            <div className="flex items-start gap-3 mb-3">
              <div className="text-3xl shrink-0 animate-pulse">🔔</div>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-brand-700 text-lg leading-tight">
                  {pendingConfirm.length === 1
                    ? '1 serviço aguardando confirmação'
                    : `${pendingConfirm.length} serviços aguardando confirmação`}
                </h3>
                <p className="text-sm text-steel-600 mt-1">
                  O mecânico finalizou — confirme a conclusão para fechar o ciclo.
                </p>
              </div>
            </div>
            <div className="space-y-2">
              {pendingConfirm.map(j => (
                <Link
                  key={j.id}
                  to={`/oficina/job/${j.id}/tracking`}
                  className="flex items-center justify-between gap-3 bg-white rounded-xl px-3 py-2.5 hover:bg-steel-50 transition border border-brand-100"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-steel-900 truncate">{j.title}</div>
                    <div className="text-xs text-steel-500 mt-0.5">
                      R$ {j.price?.toFixed(2)} fechado
                      {j.actual_hours != null && ` · ⏱ ${j.actual_hours}h reais`}
                      {j.completed_at && ` · finalizado ${new Date(j.completed_at).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}`}
                    </div>
                  </div>
                  <span className="bg-brand-500 text-white text-xs font-bold rounded-lg px-3 py-1.5 shrink-0">
                    Confirmar →
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ⭐ Avaliações pendentes — opcional, sem urgência */}
      {pendingRate.length > 0 && (
        <section className="mb-6">
          <div className="bg-steel-50 border border-steel-200 rounded-2xl p-4 sm:p-5">
            <div className="flex items-start gap-3 mb-3">
              <div className="text-2xl shrink-0">⭐</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-bold text-steel-800 text-base leading-tight">
                    Avaliações pendentes
                  </h3>
                  <span className="text-[10px] text-steel-500 uppercase tracking-wider font-bold bg-white px-2 py-0.5 rounded-full">
                    opcional
                  </span>
                </div>
                <p className="text-xs text-steel-500 mt-1">
                  Quando tiver um tempo, avalie os mecânicos. Ajuda a manter a qualidade da plataforma.
                </p>
              </div>
            </div>
            <div className="space-y-2">
              {pendingRate.slice(0, 3).map(j => (
                <Link
                  key={j.id}
                  to={`/oficina/job/${j.id}/tracking`}
                  className="flex items-center justify-between gap-3 bg-white rounded-xl px-3 py-2.5 hover:bg-steel-50 transition border border-steel-100"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-steel-900 truncate text-sm">{j.title}</div>
                    <div className="text-[11px] text-steel-500 mt-0.5">
                      Concluído {j.workshop_confirmed_at && new Date(j.workshop_confirmed_at).toLocaleDateString('pt-BR')}
                    </div>
                  </div>
                  <span className="text-steel-600 text-xs font-semibold shrink-0">
                    ⭐ Avaliar
                  </span>
                </Link>
              ))}
              {pendingRate.length > 3 && (
                <div className="text-[11px] text-steel-400 text-center pt-1">
                  +{pendingRate.length - 3} outros…
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Jobs em andamento */}
      <section className="mb-8">
        <h2 className="text-lg font-bold mb-3">Em andamento</h2>
        {active.length === 0 ? (
          <div className="card text-center text-steel-500 py-10">
            Nenhum job ativo.{' '}
            <button onClick={openCreateModal} className="text-brand-500 font-semibold">
              Criar uma demanda →
            </button>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-3">
            {active.map(j => (
              <div key={j.id} className="card">
                <div className="flex justify-between items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-bold truncate">{j.title}</div>
                    <div className="text-sm text-steel-500 mt-0.5">{statusLabel(j)}</div>
                    <div className="text-xs text-steel-400 mt-1">
                      {j.max_hours ?? '—'}h × R$ {j.price_per_hour?.toFixed(0) ?? '—'}/h
                    </div>
                    {j.scheduled_at && (
                      <div className="text-xs text-steel-400 mt-0.5">
                        📅 {new Date(j.scheduled_at).toLocaleString('pt-BR', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' })}
                      </div>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs text-steel-400">valor</div>
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
                {/* Botão de cancelar — disponível em qualquer estado pré-execução */}
                <div className="mt-3 pt-2 border-t border-steel-100 flex justify-end">
                  <CancelJobButton job={j} onCancelled={() => currentWorkshop?.id && fetchJobs(currentWorkshop.id)} />
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
                    {statusLabel(j)} · {j.completed_at ? new Date(j.completed_at).toLocaleDateString('pt-BR') : '—'}
                  </div>
                  <div className="text-xs text-steel-400">
                    Pacote: {j.max_hours}h × R$ {j.price_per_hour}/h
                    {j.actual_hours != null && <span className="ml-2">⏱ {j.actual_hours}h reais</span>}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-bold font-display">R$ {j.price.toFixed(2)}</div>
                  <div className="text-xs text-steel-500">fechado</div>
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

              {draftRestored && (
                <div className="flex items-center justify-between gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs">
                  <span className="text-amber-800">📝 Rascunho restaurado do último acesso.</span>
                  <button type="button" onClick={discardDraft} className="text-amber-700 underline font-semibold whitespace-nowrap">
                    Descartar
                  </button>
                </div>
              )}

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
                <label className="label">Precificação fechada</label>
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
                    <div className="text-xs text-steel-400 mt-1">Tempo previsto</div>
                  </div>
                </div>
                {marketRate && (
                  <div className="mt-2 bg-signal-50 border border-signal-200 rounded-xl px-3 py-2 text-xs text-signal-800 flex items-start gap-2">
                    <span className="text-sm shrink-0">📊</span>
                    <div className="flex-1">
                      <strong>Faixa de mercado em {currentWorkshop?.state}:</strong>{' '}
                      R$ {Math.round(marketRate.low)}–{Math.round(marketRate.high)}/h
                      <span className="text-signal-700/70 ml-1">({marketRate.count} {marketRate.count === 1 ? 'referência' : 'referências'})</span>
                      <div className="text-[10px] text-signal-700/80 mt-0.5">
                        Preços dentro dessa faixa costumam ser aceitos mais rápido.
                      </div>
                    </div>
                  </div>
                )}
                <p className="text-[11px] text-steel-500 mt-2 leading-relaxed">
                  💡 <strong>Valor fechado:</strong> a oficina paga o pacote (hora × tempo previsto) e o mecânico recebe esse valor mesmo se terminar antes ou levar mais tempo. O tempo real é registrado para análise.
                </p>
                {estimated > 0 && (
                  <div className="mt-2 bg-brand-50 border border-brand-200 rounded-xl px-4 py-2.5 flex justify-between items-center">
                    <span className="text-sm text-brand-700">Valor fechado da demanda</span>
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
                      <div key={m.id} className={`rounded-xl border-2 transition ${
                        pickedMechanic === m.id ? 'border-brand-500 bg-brand-50' : 'border-steel-100'
                      }`}>
                        <button type="button"
                          onClick={() => setPickedMechanic(m.id)}
                          className="w-full flex items-center gap-3 p-3 text-left active:scale-95">
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
                        <button type="button"
                          onClick={() => setReviewsOpen(reviewsOpen === m.id ? null : m.id)}
                          className="w-full text-[11px] text-brand-600 hover:text-brand-700 font-semibold border-t border-steel-100 py-1.5">
                          {reviewsOpen === m.id ? '▲ Ocultar avaliações' : '▼ Ver avaliações'}
                        </button>
                        {reviewsOpen === m.id && (
                          <div className="px-3 pb-3 bg-steel-50 border-t border-steel-100">
                            <div className="pt-2">
                              <MechanicReviews mechanicId={m.id} />
                            </div>
                          </div>
                        )}
                      </div>
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

/** Estado real do job considerando arrived_at, pix_paid_at e started_at */
function statusLabel(j: Job): string {
  if (j.status === 'completed')   return 'Concluído';
  if (j.status === 'disputed')    return 'Em disputa';
  if (j.status === 'cancelled')   return 'Cancelado';
  if (j.status === 'open')        return 'Aguardando mecânico';
  if (j.status === 'in_progress') return '🔧 Em serviço';
  // status === 'assigned'
  if (!j.arrived_at)              return 'Mecânico a caminho';
  if (!j.pix_paid_at)             return 'Mecânico chegou — aguarda pagamento';
  if (!j.started_at)              return '✅ Pago — aguardando início do serviço';
  return 'Em serviço';
}
