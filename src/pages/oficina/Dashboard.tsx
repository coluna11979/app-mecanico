import { ChangeEvent, FormEvent, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import WorkshopLayout from '@/components/layout/WorkshopLayout';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/components/ui/Toast';
import { localInput } from '@/lib/agenda';
import { PendingFeesBanner, usePendingFees } from '@/components/PendingFeesGate';
import { CancelJobButton } from '@/components/CancelJobButton';
import { MechanicReviews } from '@/components/MechanicReviews';
import { formatScheduled } from '@/lib/scheduling';
import { arrivalDeadline, formatDeadline, isArrivalLate } from '@/lib/arrivalDeadline';
import { inviteFields, inviteWaitingTooLong, isPendingInvite } from '@/lib/jobInvite';
import type { Job } from '@/types/database';
import { formatBRL, pricingLabel } from '@/lib/payment';
import { jobDraftKey, jobDraftOriginKey, markPlatformItems } from '@/lib/callMechanic';
import StackBoard from '@/components/marketplace/StackBoard';
import { MechanicCarousel, PlatformHero, StatusCounters } from '@/components/marketplace/PlatformHome';
import { QuickCall, estimatePrice, medianRate, type ServiceShortcut } from '@/components/marketplace/QuickCall';

type NewJob = {
  title: string; description: string;
  price_per_hour: string; max_hours: string; scheduled_at: string;
  /** fixed = preço pelo serviço (total); hour = valor/hora × horas. Em "fixed", max_hours é o tempo previsto (opcional) */
  pricing?: 'hour' | 'fixed';
  total?: string;
  /** Veio do Caixa ("Chamar mecânico"): a demanda fica ligada a essa OS */
  service_order_id?: string;
  /** Itens da OS que esse mecânico vai fazer (passam a "mecânico da plataforma") */
  service_order_item_ids?: string[];
  /** Demanda com serviços de várias OS (vindo dos empilhados) */
  service_order_ids?: string[];
  /** Serviços empilhados avulsos (sem OS) que viram esta demanda */
  stacked_service_ids?: string[];
  /** Veículo do serviço (texto livre). Vai na descrição e no título da demanda */
  vehicle?: string;
};
type MechanicOption = {
  id: string; name: string; rating: number; total_jobs: number; hourly_rate: number;
  skills?: string[] | null; avatar?: string | null;
};
type JobMode = 'open' | 'favorites' | 'direct';

const EMPTY: NewJob = { title: '', description: '', price_per_hour: '', max_hours: '1', scheduled_at: '', pricing: 'fixed', total: '', vehicle: '' };

/** Título e descrição com o veículo (o mecânico vê em qual carro vai trabalhar) */
function withVehicle(f: NewJob) {
  const v = (f.vehicle ?? '').trim();
  const title = f.title.trim(), description = f.description.trim() || title;
  if (!v) return { title, description };
  const model = v.split('·')[0].trim();
  return {
    title: (title.toLowerCase().includes(model.toLowerCase()) ? title : `${title} — ${model}`).slice(0, 120),
    description: `${description}${description ? '\n\n' : ''}Veículo: ${v}`,
  };
}

const draftKey = jobDraftKey;
function loadDraft(workshopId: string): NewJob | null {
  try {
    const raw = localStorage.getItem(draftKey(workshopId));
    if (!raw) return null;
    const d = JSON.parse(raw) as Partial<NewJob>;
    const hasContent = !!(d.title?.trim() || d.description?.trim() || d.price_per_hour || d.total || d.scheduled_at);
    if (!hasContent) return null;
    // Rascunho antigo (antes do "pelo serviço") era sempre por hora
    return { ...EMPTY, ...d, pricing: d.pricing ?? 'hour' };
  } catch { return null; }
}

export default function WorkshopDashboard() {
  const { user, currentWorkshop } = useAuth();
  const shop = currentWorkshop;
  const [active, setActive]     = useState<Job[]>([]);
  const [history, setHistory]   = useState<Job[]>([]);
  const [pendingConfirm, setPendingConfirm] = useState<Job[]>([]);
  const [pendingRate, setPendingRate] = useState<Job[]>([]);
  /* Nome de quem foi convidado (convite direto) — id do mecânico → nome */
  const [inviteNames, setInviteNames] = useState<Record<string, string>>({});
  const [mechanics, setMechanics] = useState<MechanicOption[]>([]);
  const [modal, setModal]       = useState(false);
  const [stackVer, setStackVer] = useState(0);
  const [form, setForm]         = useState<NewJob>(EMPTY);
  const [draftRestored, setDraftRestored] = useState(false);
  /* Rascunho montado no Caixa ("Chamar mecânico"): de qual OS veio */
  const [draftOrigin, setDraftOrigin] = useState<string | null>(null);
  const [marketRate, setMarketRate] = useState<{ low: number; high: number; count: number } | null>(null);
  const [mode, setMode]         = useState<JobMode>('open');
  const [pickedMechanic, setPickedMechanic] = useState<string>('');
  const [mechSearch, setMechSearch] = useState('');
  const [reviewsOpen, setReviewsOpen] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving]     = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const shopLoading = !currentWorkshop;
  const hasPendingFees = usePendingFees(currentWorkshop?.id ?? null);

  const inviteName = (j: Job) => (j.invited_mechanic_id && inviteNames[j.invited_mechanic_id]) || 'o mecânico';

  /* Convites recusados nas últimas 12h — a oficina escolhe outro mecânico */
  const declinedInvites = history.filter(j =>
    j.status === 'cancelled' && j.audience === 'invite' && j.cancelled_by === 'mechanic'
    && !!j.cancelled_at && Date.now() - new Date(j.cancelled_at).getTime() < 12 * 60 * 60 * 1000);

  // Recarrega jobs quando a oficina ativa mudar (troca pelo seletor)
  useEffect(() => {
    if (!user || !currentWorkshop) return;
    fetchJobs(currentWorkshop.id);
    fetchMechanics();
    fetchFavorites(currentWorkshop.id);
  }, [user, currentWorkshop?.id]);

  async function fetchFavorites(workshopId: string) {
    const { data } = await supabase
      .from('workshop_favorite_mechanics')
      .select('mechanic_id')
      .eq('workshop_id', workshopId);
    setFavorites(new Set((data ?? []).map(d => d.mechanic_id)));
  }

  async function toggleFavorite(mechanicId: string) {
    if (!currentWorkshop?.id) return;
    const isFav = favorites.has(mechanicId);
    setFavorites(prev => {
      const next = new Set(prev);
      if (isFav) next.delete(mechanicId); else next.add(mechanicId);
      return next;
    });
    if (isFav) {
      const { error } = await supabase
        .from('workshop_favorite_mechanics').delete()
        .eq('workshop_id', currentWorkshop.id).eq('mechanic_id', mechanicId);
      if (error) fetchFavorites(currentWorkshop.id);
    } else {
      const { error } = await supabase
        .from('workshop_favorite_mechanics')
        .insert({ workshop_id: currentWorkshop.id, mechanic_id: mechanicId });
      if (error) fetchFavorites(currentWorkshop.id);
    }
  }

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

  /* Polling de segurança (30s) caso o realtime caia. Pausa com a aba em segundo plano
     e atualiza na hora quando a oficina volta pra aba — economiza consultas no Supabase. */
  useEffect(() => {
    if (!currentWorkshop?.id) return;
    const wid = currentWorkshop.id;
    const t = setInterval(() => { if (!document.hidden) fetchJobs(wid); }, 30000);
    const onVisible = () => { if (!document.hidden) fetchJobs(wid); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVisible); };
  }, [currentWorkshop?.id]);

  async function fetchJobs(workshopId: string) {
    const [{ data: a }, { data: h }, { data: pc }, { data: pr }] = await Promise.all([
      // Em andamento
      supabase.from('jobs').select('*').eq('workshop_id', workshopId)
        .in('status', ['open', 'assigned', 'in_progress']).order('created_at', { ascending: false }),
      // Histórico
      supabase.from('jobs').select('*').eq('workshop_id', workshopId)
        .in('status', ['completed', 'disputed', 'cancelled']).order('created_at', { ascending: false }).limit(100),
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
    const invited = [...new Set([...(a ?? []), ...(h ?? [])]
      .map(j => (j as Job).invited_mechanic_id).filter((x): x is string => !!x))];
    if (invited.length) {
      const { data: ms } = await supabase.from('mechanics')
        .select('id, profile:profiles(full_name)').in('id', invited);
      setInviteNames(Object.fromEntries((ms ?? []).map((m: any) => [m.id, m.profile?.full_name ?? 'Mecânico'])));
    }
    setPendingConfirm((pc as Job[]) ?? []);
    setPendingRate((pr as Job[]) ?? []);
  }

  async function fetchMechanics() {
    const { data } = await supabase
      .from('mechanics')
      .select('id, rating, total_jobs, hourly_rate, is_available, skills, profile:profiles!inner(full_name, status, avatar_url)')
      .eq('profile.status', 'approved')
      .eq('is_available', true)
      .order('rating', { ascending: false });
    const list = (data ?? []).map((m: any) => ({
      id: m.id,
      name: m.profile.full_name,
      rating: m.rating,
      total_jobs: m.total_jobs,
      hourly_rate: m.hourly_rate,
      skills: m.skills ?? [],
      avatar: m.profile.avatar_url ?? null,
    }));
    setMechanics(list);
  }

  /* Nova demanda em 3 passos: 1 o quê · 2 quanto · 3 quando (a edição mostra tudo numa tela só) */
  const [step, setStep] = useState<1 | 2 | 3>(1);
  /** Mostrar "Pelo serviço / Por hora" */
  const [hourOpt, setHourOpt] = useState(false);
  const [pickDate, setPickDate] = useState(false);
  const formBody = useRef<HTMLDivElement>(null);
  useEffect(() => { if (modal) { setStep(1); setHourOpt(false); setPickDate(false); } }, [modal]);
  /** Até quando ignorar "publicar" (o toque em Continuar não pode virar publicação) */
  const submitLockUntil = useRef(0);
  const goStep = (n: 1 | 2 | 3) => {
    setFormError(null); setStep(n); formBody.current?.scrollTo({ top: 0 });
    if (n === 3) submitLockUntil.current = Date.now() + 800;
  };
  function nextStep() {
    if (step === 1) {
      if (!form.title.trim()) return setFormError('Diga qual é o serviço.');
      return goStep(2);
    }
    if (step === 2) {
      const price = priceOf();
      if (typeof price === 'string') return setFormError(price);
      return goStep(3);
    }
  }
  const showStep = (n: 1 | 2 | 3) => !!editingId || step === n;
  /** Botões de data: '' = o quanto antes; null = escolher no calendário */
  function dateOptions(): { label: string; value: string | null }[] {
    const now = new Date();
    const at = (days: number, h: number) => { const d = new Date(now); d.setDate(d.getDate() + days); d.setHours(h, 0, 0, 0); return localInput(d); };
    return [
      { label: '⚡ O quanto antes', value: '' },
      ...(now.getHours() < 13 ? [{ label: 'Hoje à tarde (14h)', value: at(0, 14) }] : []),
      { label: 'Amanhã cedo (8h)', value: at(1, 8) },
      { label: '📅 Outro dia', value: null },
    ];
  }

  function resetModal() {
    setModal(false); setForm(EMPTY);
    setMode('open'); setPickedMechanic(''); setMechSearch(''); setFormError(null);
    setDraftRestored(false);
    setEditingId(null);
  }

  /**
   * Abre a Nova demanda. Clique em "Chamar mecânico" = formulário limpo; só o que veio de uma OS
   * (Caixa/OS → ?nova=os) ou do "Gerar demanda" dos Empilhados (fromFlow) abre já preenchido.
   * Rascunho de OS/empilhados que ficou para trás é descartado; texto digitado e não enviado volta.
   */
  function openCreateModal(fromFlow = false) {
    setEditingId(null);
    if (currentWorkshop?.id) {
      const wid = currentWorkshop.id;
      if (!fromFlow && localStorage.getItem(jobDraftOriginKey(wid))) {
        localStorage.removeItem(draftKey(wid));
        localStorage.removeItem(jobDraftOriginKey(wid));
      }
      const draft = loadDraft(wid);
      if (draft) { setForm(draft); setDraftRestored(true); }
      else { setForm(EMPTY); setDraftRestored(false); }
      setDraftOrigin(draft ? localStorage.getItem(jobDraftOriginKey(currentWorkshop.id)) : null);
    }
    setMode('open'); setPickedMechanic(''); setMechSearch('');
    setModal(true);
  }

  /** Atalho de serviço: abre a demanda já escrita, pelo serviço, com o tempo típico e o preço estimado */
  function openShortcut(sc: ServiceShortcut) {
    if (hasPendingFees) return;
    const rate = medianRate(mechanics);
    const next: NewJob = {
      ...EMPTY, title: sc.title, description: sc.description, pricing: 'fixed',
      max_hours: String(sc.hours), total: rate ? String(estimatePrice(rate, sc.hours)) : '',
    };
    setEditingId(null); setDraftRestored(false); setDraftOrigin(null); setFormError(null);
    setForm(next); persistDraft(next);
    setMode('open'); setPickedMechanic(''); setMechSearch('');
    setModal(true);
  }

  // ?nova=1 = abrir a Nova demanda (limpa); ?nova=os = veio do Caixa/OS com o rascunho da OS preenchido
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const nova = searchParams.get('nova');
    if ((nova !== '1' && nova !== 'os') || !currentWorkshop?.id) return;
    setSearchParams(p => { p.delete('nova'); return p; }, { replace: true });
    if (!hasPendingFees) openCreateModal(nova === 'os');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, currentWorkshop?.id]);

  function openEditModal(j: Job) {
    setEditingId(j.id);
    setDraftRestored(false);
    setForm({
      title: j.title,
      description: j.description,
      ...(j.pricing === 'fixed'
        ? { pricing: 'fixed' as const, total: String(j.price_per_hour ?? ''), price_per_hour: '', max_hours: j.estimated_hours != null ? String(j.estimated_hours) : '' }
        : { pricing: 'hour' as const, total: '', price_per_hour: String(j.price_per_hour ?? ''), max_hours: String(j.max_hours ?? '1') }),
      scheduled_at: j.scheduled_at ? new Date(j.scheduled_at).toISOString().slice(0, 16) : '',
    });
    setMode('open'); setPickedMechanic(''); setMechSearch(''); setFormError(null);
    setModal(true);
  }

  function persistDraft(next: NewJob) {
    if (!currentWorkshop?.id) return;
    const hasContent = !!(next.title.trim() || next.description.trim() || next.price_per_hour || next.total || next.scheduled_at);
    if (hasContent) localStorage.setItem(draftKey(currentWorkshop.id), JSON.stringify(next));
    else localStorage.removeItem(draftKey(currentWorkshop.id));
  }

  function discardDraft() {
    if (currentWorkshop?.id) {
      localStorage.removeItem(draftKey(currentWorkshop.id));
      localStorage.removeItem(jobDraftOriginKey(currentWorkshop.id));
    }
    setForm(EMPTY);
    setDraftRestored(false);
    setDraftOrigin(null);
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
    if (!form.title.trim()) return setFormError('Informe qual é o serviço.');
    const price = priceOf();
    if (typeof price === 'string') return setFormError(price);
    const { fixed, pph, mh, est } = price;
    const pricingFields = { pricing: fixed ? 'fixed' : 'hour', estimated_hours: est };
    if (mode === 'direct' && !pickedMechanic) return setFormError('Selecione o mecânico para contratação direta.');

    if (!shop) return setFormError('Oficina não encontrada. Verifique seu cadastro ou recarregue a página.');
    const currentShop = shop;

    setSaving(true);

    if (editingId) {
      // Edição: só campos editáveis. Status, workshop_id e mechanic_id ficam intocados.
      const updatePayload: Record<string, unknown> = {
        title:          form.title.trim(),
        description:    form.description.trim() || form.title.trim(),
        price_per_hour: pph,
        max_hours:      mh,
        price:          pph * mh,
        ...pricingFields,
        scheduled_at:   form.scheduled_at ? new Date(form.scheduled_at).toISOString() : null,
      };
      const { error: upErr } = await supabase
        .from('jobs')
        .update(updatePayload)
        .eq('id', editingId)
        .eq('status', 'open'); // guarda dura: nunca edita job já aceito
      setSaving(false);
      if (upErr) { setFormError('Erro ao salvar alterações: ' + upErr.message); return; }
      resetModal();
      await fetchJobs(currentShop.id);
      return;
    }

    const isDirect    = mode === 'direct' && !!pickedMechanic;
    const isFavorites = mode === 'favorites' && favorites.size > 0;
    if (mode === 'favorites' && favorites.size === 0) {
      setSaving(false);
      return setFormError('Você ainda não tem mecânicos preferidos. Adicione pelo menos um antes de usar esse modo.');
    }
    const text = withVehicle(form);
    const payload: Record<string, unknown> = {
      workshop_id:    currentShop.id,
      title:          text.title,
      description:    text.description,
      price_per_hour: pph,
      max_hours:      mh,
      price:          pph * mh,
      ...pricingFields,
      // Mecânico específico = convite: só vira "aceito" quando ele aceitar
      ...(isDirect
        ? inviteFields(pickedMechanic)
        : { status: 'open', mechanic_id: null, audience: isFavorites ? 'favorites' : 'public' }),
    };
    if (form.service_order_id) payload.service_order_id = form.service_order_id;
    if (form.scheduled_at) payload.scheduled_at = new Date(form.scheduled_at).toISOString();
    const { data: ins, error: insErr } = await supabase.from('jobs').insert(payload).select('id').single();
    setSaving(false);
    if (insErr) {
      console.error('[createJob] erro:', insErr);
      setFormError('Erro ao publicar demanda: ' + insErr.message);
      return; // mantém o modal aberto e o rascunho salvo
    }
    localStorage.removeItem(draftKey(currentShop.id));
    localStorage.removeItem(jobDraftOriginKey(currentShop.id));
    // Serviços escolhidos passam a "mecânico da plataforma" (sem comissão da equipe) e ficam ligados
    // a esta demanda — assim se sabe qual mecânico fez cada serviço. A OS só vira "plataforma"
    // inteira se todos os serviços dela forem da plataforma.
    if (form.service_order_id) {
      const osIds = form.service_order_ids?.length ? form.service_order_ids : [form.service_order_id];
      await markPlatformItems(currentShop.id, osIds, form.service_order_item_ids ?? [], { jobId: ins?.id });
    }
    // Empilhados avulsos que viraram esta demanda saem da pilha
    if (form.stacked_service_ids?.length && ins?.id) {
      await supabase.from('stacked_services').update({ job_id: ins.id })
        .in('id', form.stacked_service_ids).eq('workshop_id', currentShop.id);
    }
    setStackVer(v => v + 1);
    resetModal();
    await fetchJobs(currentShop.id);
  }

  /** Preço do formulário (pelo serviço = valor × 1h; por hora = valor/hora × horas) ou a mensagem de erro */
  function priceOf(): { fixed: boolean; pph: number; mh: number; est: number | null } | string {
    const fixed = form.pricing === 'fixed';
    const pph = fixed ? Number(form.total) : Number(form.price_per_hour);
    const mh  = fixed ? 1 : Number(form.max_hours);
    const est = fixed && form.max_hours ? Number(form.max_hours) : null;
    if (fixed) {
      if (!pph || pph < 1) return 'Informe o valor do serviço (mínimo R$ 1).';
      if (est != null && !(est > 0 && est <= 99)) return 'Tempo previsto inválido.';
    } else {
      if (!pph || pph < 1) return 'Informe o valor por hora (mínimo R$ 1).';
      if (!mh  || mh  < 0.5) return 'Informe o máximo de horas (mínimo 0,5h).';
    }
    return { fixed, pph, mh, est };
  }

  /** 📚 Empilhar: guarda o serviço para juntar com outros numa demanda só (um mecânico, mais barato) */
  async function stackService() {
    setFormError(null);
    if (!form.title.trim()) return setFormError('Informe o título do serviço.');
    const price = priceOf();
    if (typeof price === 'string') return setFormError(price);
    if (!shop) return setFormError('Oficina não encontrada. Recarregue a página.');
    setSaving(true);
    const { error } = await supabase.from('stacked_services').insert({
      workshop_id: shop.id,
      title: form.title.trim(),
      description: form.description.trim(),
      vehicle: form.vehicle?.trim() || null,
      total: Math.round(price.pph * price.mh * 100) / 100,
      hours: price.fixed ? price.est : price.mh,
      created_by: user?.id ?? null,
    });
    setSaving(false);
    if (error) return setFormError('Não foi possível empilhar: ' + error.message);
    localStorage.removeItem(draftKey(shop.id));
    localStorage.removeItem(jobDraftOriginKey(shop.id));
    toast.success('Serviço empilhado 📚 — junte com outros em Empilhados e publique tudo para um mecânico só');
    setStackVer(v => v + 1);
    resetModal();
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
        .eq('pricing', 'hour') // preço pelo serviço não é valor/hora
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

  // Formulário aberto: o fundo não rola junto (no celular a tela "andava" atrás do formulário)
  useEffect(() => {
    if (!modal) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [modal]);

  const estimated = form.pricing === 'fixed' ? Number(form.total) : Number(form.price_per_hour) * Number(form.max_hours);
  // Estimativa pelo valor/hora dos mecânicos disponíveis × tempo previsto (o mesmo que a oficina pagaria contratando direto)
  const rateNow = medianRate(mechanics);
  const estHours = Number(form.max_hours) || 1;
  const suggested = rateNow ? (form.pricing === 'fixed' ? estimatePrice(rateNow, estHours) : Math.round(rateNow)) : null;
  const typedPrice = form.pricing === 'fixed' ? Number(form.total) : Number(form.price_per_hour);
  // Nunca contratou pela plataforma: a tela vende a primeira demanda
  const firstTime = !shopLoading && active.length === 0 && history.length === 0 && (shop?.total_jobs ?? 0) === 0;
  // Preferidos no topo; dentro de cada grupo mantém a ordem por nota do fetch
  const filteredMechanics = mechanics
    .filter(m => m.name.toLowerCase().includes(mechSearch.toLowerCase()))
    .sort((a, b) => Number(favorites.has(b.id)) - Number(favorites.has(a.id)));

  return (
    <WorkshopLayout>
      <h1 className="sr-only">Demandas · {shop?.business_name ?? ''}</h1>

      {/* O que se faz aqui, em um botão */}
      <PlatformHero available={mechanics.length} onCall={() => openCreateModal()}
        disabled={shopLoading || hasPendingFees} locked={hasPendingFees} />

      {/* Banner de multa pendente — bloqueia novas demandas até quitar */}
      <PendingFeesBanner workshopId={currentWorkshop?.id ?? null} />

      {/* Serviços empilhados: esperando mecânico da plataforma (a gestão junta e gera a demanda) */}
      {currentWorkshop?.id && !hasPendingFees && <StackBoard wid={currentWorkshop.id} reloadKey={stackVer} onGenerate={() => openCreateModal(true)} />}

      {/* Como estão os pedidos (oficina que nunca pediu não vê quatro zeros) */}
      {!firstTime && (
        <StatusCounters
          searching={active.filter(j => !j.mechanic_id).length}
          accepted={active.filter(j => j.mechanic_id && !j.arrived_at && j.status !== 'in_progress').length}
          working={active.filter(j => j.mechanic_id && (j.arrived_at || j.status === 'in_progress')).length}
          done={shop?.total_jobs ?? 0}
          onPick={t => document.getElementById(t === 'ativas' ? 'minhas-solicitacoes' : 'historico')?.scrollIntoView({ behavior: 'smooth', block: 'start' })} />
      )}

      {/* Atalhos dos serviços mais pedidos (um toque abre a demanda pronta) */}
      <QuickCall mechanics={mechanics} disabled={shopLoading || hasPendingFees} onShortcut={openShortcut} compact />

      {/* Quem está disponível agora: foto, nota, especialidades */}
      <MechanicCarousel mechanics={mechanics} />

      {/* Números do período (gasto, tempos, ranking) ficam no Painel da Plataforma: esta é a tela de trabalho */}

      {/* Convite recusado: avisa e leva para escolher outro mecânico */}
      {declinedInvites.length > 0 && (
        <section className="mb-6 space-y-2">
          {declinedInvites.map(j => (
            <div key={j.id} className="rounded-2xl border border-alert-200 bg-alert-500/5 p-4 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="font-bold text-steel-900 leading-snug">
                  {firstName(inviteName(j))} {j.cancellation_reason?.startsWith('Mecânico desistiu') ? 'desistiu do' : 'recusou o'} convite
                </div>
                <div className="text-sm text-steel-600 mt-0.5 break-words">
                  “{j.title}” foi cancelada sem multa. Escolha outro mecânico ou publique para todos.
                </div>
              </div>
              <Link to="/oficina/buscar"
                className="shrink-0 inline-flex items-center justify-center h-11 px-4 rounded-xl bg-brand-500 text-white text-sm font-bold active:scale-[0.99]">
                Escolher outro mecânico
              </Link>
            </div>
          ))}
        </section>
      )}

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
                      R$ {formatBRL(j.price ?? 0)} fechado
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

      {/* Demandas ativas — agrupadas pela etapa em que estão */}
      {(() => {
        const buckets = groupActive(active);

        const renderCard = (j: Job) => (
          <div key={j.id} className="rounded-2xl bg-white ring-1 ring-steel-200/70 p-4 min-w-0">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-steel-900 leading-snug line-clamp-2 break-words">{j.title}</div>
                <div className="text-[13px] text-steel-500 mt-0.5">
                  {isPendingInvite(j)
                    ? `Convite enviado para ${inviteName(j)} — aguardando ele aceitar`
                    : statusLabel(j)}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="font-display text-lg font-bold tabular-nums leading-tight">R$ {formatBRL(j.price, { decimals: 0 })}</div>
                <div className="text-[11px] text-steel-400 tabular-nums">
                  {pricingLabel(j)}
                </div>
              </div>
            </div>
            <ArrivalInfo j={j} />
            {inviteWaitingTooLong(j) && (
              <div className="mt-2 text-[12px] text-pending-700 bg-pending-50 border border-pending-200 rounded-lg px-2.5 py-2 leading-snug">
                ⏳ {firstName(inviteName(j))} ainda não respondeu. Você pode cancelar sem multa e{' '}
                <Link to="/oficina/buscar" className="font-bold underline">chamar outro mecânico</Link>.
              </div>
            )}
            {j.scheduled_at && (
              <div className="text-xs text-steel-500 mt-1.5">📅 {formatScheduled(j.scheduled_at)}</div>
            )}

            {/* Ações: a principal ocupa o espaço; editar só enquanto ninguém aceitou; cancelar sempre */}
            <div className="mt-3 pt-3 border-t border-steel-100 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                {j.mechanic_id && j.en_route_at ? (
                  <Link to={`/oficina/job/${j.id}/tracking`}
                    className="inline-flex items-center justify-center gap-1.5 w-full sm:w-auto h-10 px-4 rounded-xl bg-brand-500 text-white text-sm font-bold active:scale-[0.99]">
                    🗺️ Ver no mapa
                  </Link>
                ) : j.mechanic_id ? (
                  <span className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full bg-signal-50 text-signal-700 text-xs font-bold">✓ Aceito</span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full bg-pending-50 text-pending-700 text-xs font-bold max-w-full">
                    <span className="h-1.5 w-1.5 rounded-full bg-pending-500 animate-pulse-soft shrink-0" />
                    <span className="truncate">{isPendingInvite(j) ? `Aguardando ${firstName(inviteName(j))} aceitar` : 'Aguardando aceite'}</span>
                  </span>
                )}
              </div>
              {j.status === 'open' && !j.mechanic_id && (
                <button type="button" onClick={() => openEditModal(j)}
                  className="shrink-0 h-10 px-2 text-xs font-semibold text-brand-600 active:text-brand-700">
                  ✏️ Editar
                </button>
              )}
              <span className="shrink-0"><CancelJobButton job={j} onCancelled={() => currentWorkshop?.id && fetchJobs(currentWorkshop.id)} /></span>
            </div>
          </div>
        );

        if (active.length === 0) {
          return (
            <section id="minhas-solicitacoes" className="mb-8 scroll-mt-4">
              <h2 className="text-[15px] lg:text-lg font-bold mb-3">Minhas solicitações</h2>
              <div className="rounded-2xl bg-white ring-1 ring-steel-200/70 text-center px-5 py-8">
                <div className="text-3xl" aria-hidden>📋</div>
                <div className="font-semibold text-steel-900 mt-2">Nenhuma solicitação em andamento</div>
                <p className="text-sm text-steel-600 mt-1">Chame um mecânico e acompanhe tudo por aqui: aceite, chegada e serviço.</p>
                <button type="button" onClick={() => openCreateModal()} disabled={shopLoading || hasPendingFees}
                  className="mt-4 inline-flex items-center justify-center gap-2 h-12 px-6 rounded-xl bg-brand-500 text-white font-bold active:scale-[0.99] hover:bg-brand-600 transition disabled:opacity-50">
                  ＋ Chamar mecânico agora
                </button>
              </div>
            </section>
          );
        }

        return (
          <div id="minhas-solicitacoes" className="mb-8 scroll-mt-4">
            {ACTIVE_GROUPS.map(g => {
              const jobs = buckets[g.key];
              if (jobs.length === 0) return null;
              return (
                <section key={g.key} className="mb-6">
                  <div className="flex items-center gap-2 mb-2.5">
                    <h2 className="text-[15px] lg:text-lg font-bold">{g.title}</h2>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${g.badge}`}>{jobs.length}</span>
                  </div>
                  <div className="grid md:grid-cols-2 gap-3">{jobs.map(renderCard)}</div>
                </section>
              );
            })}
          </div>
        );
      })()}

      {/* Histórico — fechado por padrão; a oficina escolhe abrir */}
      <div id="historico" className="scroll-mt-4"><HistorySection history={history} workshopId={currentWorkshop?.id ?? null} /></div>

      {/* ── Modal nova demanda ── */}
      {modal && (
        <div className="fixed inset-0 bg-steel-900/70 z-50 flex items-end sm:items-center justify-center sm:p-4" onClick={resetModal}>
          <form
            onClick={e => e.stopPropagation()}
            onSubmit={e => {
              if (!editingId && step < 3) { e.preventDefault(); nextStep(); return; }
              if (!editingId && Date.now() < submitLockUntil.current) { e.preventDefault(); return; }
              createJob(e);
            }}
            className="bg-white w-full sm:rounded-2xl sm:max-w-lg sm:shadow-2xl rounded-t-3xl max-h-[92vh] flex flex-col"
          >
            {/* Sheet handle (mobile) */}
            <div className="flex justify-center pt-3 pb-1 sm:hidden">
              <div className="w-10 h-1 bg-steel-200 rounded-full" />
            </div>

            {/* Scrollable content */}
            <div ref={formBody} className="flex-1 overflow-y-auto px-5 pb-2 pt-4 space-y-4">
              {editingId ? (
                <div>
                  <h2 className="text-xl font-bold tracking-tight">Editar demanda</h2>
                  <p className="text-sm text-steel-500 mt-0.5">Ajuste o que precisar enquanto nenhum mecânico aceitou.</p>
                </div>
              ) : (
                <div>
                  <div className="flex gap-1.5 mb-3" aria-hidden>
                    {[1, 2, 3].map(n => <span key={n} className={`h-1.5 flex-1 rounded-full ${n <= step ? 'bg-brand-500' : 'bg-steel-200'}`} />)}
                  </div>
                  <div className="text-xs font-semibold text-steel-500">Passo {step} de 3</div>
                  <h2 className="text-xl font-bold tracking-tight mt-0.5">
                    {step === 1 ? 'Qual serviço?' : step === 2 ? 'Quanto você paga?' : 'Para quando?'}
                  </h2>
                </div>
              )}

              {showStep(1) && <>
              {draftRestored && !editingId && (
                <div className="flex items-center justify-between gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs">
                  <span className="text-amber-800">
                    {draftOrigin ? `🔧 Preenchido com ${draftOrigin} — revise e publique.` : '📝 Rascunho restaurado do último acesso.'}
                  </span>
                  <button type="button" onClick={discardDraft} className="text-amber-700 underline font-semibold whitespace-nowrap">
                    Descartar
                  </button>
                </div>
              )}

              {/* Título */}
              <div>
                <label className="label">Serviço</label>
                <input className="input" placeholder="Ex.: Troca de pastilha de freio"
                  value={form.title} onChange={set('title')} />
              </div>

              {/* Veículo: só na demanda avulsa (a que vem de OS/empilhados já traz os carros) */}
              {!editingId && !form.service_order_id && !form.stacked_service_ids?.length && (
                <div>
                  <label className="label">Veículo</label>
                  <input className="input" placeholder="Ex.: Gol prata 2015 · ABC1D23"
                    value={form.vehicle ?? ''} onChange={set('vehicle')} />
                  <div className="text-xs text-steel-400 mt-1">Modelo, cor e placa: o mecânico vê em qual carro vai trabalhar</div>
                </div>
              )}

              {/* Descrição */}
              <div>
                <label className="label">Detalhes <span className="font-normal text-steel-500">(opcional)</span></label>
                <textarea className="input" rows={3}
                  placeholder="Algo a mais que o mecânico precisa saber?"
                  value={form.description} onChange={set('description')} />
              </div>
              </>}

              {/* Passo 2: quanto */}
              {showStep(2) && (
              <div>
                {(editingId || hourOpt || form.pricing === 'hour') && <>
                <label className="label">Como cobrar</label>
                <div className="flex gap-1 bg-steel-100 rounded-xl p-1 mb-3">
                  {([['fixed', 'Pelo serviço'], ['hour', 'Por hora']] as const).map(([k, l]) => (
                    <button key={k} type="button"
                      onClick={() => setForm(f => { const next = { ...f, pricing: k }; persistDraft(next); return next; })}
                      className={`flex-1 rounded-lg py-2 text-sm font-semibold transition ${
                        (form.pricing ?? 'hour') === k ? 'bg-white shadow text-steel-900' : 'text-steel-500 hover:text-steel-700'}`}>
                      {l}
                    </button>
                  ))}
                </div>
                </>}
                {form.pricing === 'fixed' ? (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-steel-400 text-sm">R$</span>
                      <input className="input !pl-9" type="number" min={1} step={0.01} required
                        placeholder="150" value={form.total ?? ''} onChange={set('total')} />
                    </div>
                    <div className="text-xs text-steel-400 mt-1">Valor do serviço</div>
                  </div>
                  <div>
                    <div className="relative">
                      <input className="input !pr-9" type="number" min={0.5} max={99} step={0.5}
                        placeholder="opcional" value={form.max_hours} onChange={set('max_hours')} />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-steel-400 text-sm">h</span>
                    </div>
                    <div className="text-xs text-steel-400 mt-1">Tempo previsto (opcional)</div>
                  </div>
                </div>
                ) : (
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
                )}
                {suggested && !editingId && (
                  <div className="mt-2 rounded-xl border border-steel-200 px-3 py-2 text-xs text-steel-600 flex items-center gap-2">
                    <span className="text-sm shrink-0">🧮</span>
                    <div className="flex-1 min-w-0">
                      <strong className="text-steel-800">Estimativa: R$ {formatBRL(suggested, { decimals: 0 })}{form.pricing === 'fixed' ? '' : '/h'}</strong>
                      <div className="text-[11px] text-steel-500">
                        {form.pricing === 'fixed'
                          ? `${String(estHours).replace('.', ',')}h × R$ ${Math.round(rateNow!)}/h, valor do meio entre os ${mechanics.length} disponíveis`
                          : `valor do meio entre os ${mechanics.length} mecânicos disponíveis`}
                      </div>
                    </div>
                    {typedPrice !== suggested && (
                      <button type="button"
                        onClick={() => setForm(f => {
                          const next = f.pricing === 'fixed' ? { ...f, total: String(suggested) } : { ...f, price_per_hour: String(suggested) };
                          persistDraft(next); return next;
                        })}
                        className="shrink-0 h-9 px-3 rounded-lg bg-steel-900 text-white text-xs font-bold active:scale-95">
                        Usar
                      </button>
                    )}
                  </div>
                )}
                {marketRate && form.pricing !== 'fixed' && (
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
                <p className="text-xs text-steel-600 mt-2 leading-relaxed">
                  💡 <strong>Valor fechado:</strong> {form.pricing === 'fixed'
                    ? 'você paga esse valor e pronto, não importa quanto tempo leve.'
                    : 'você paga hora × tempo previsto, mesmo se ele terminar antes ou levar mais tempo.'}
                </p>
                {!editingId && !hourOpt && form.pricing !== 'hour' && (
                  <button type="button" onClick={() => setHourOpt(true)} className="mt-1 text-xs font-semibold text-brand-600 min-h-[36px]">
                    Prefere pagar por hora?
                  </button>
                )}
                {estimated > 0 && (
                  <div className="mt-2 bg-brand-50 border border-brand-200 rounded-xl px-4 py-2.5 flex justify-between items-center">
                    <span className="text-sm text-brand-700">Valor fechado da demanda</span>
                    <span className="font-bold text-brand-700 font-display">R$ {formatBRL(estimated)}</span>
                  </div>
                )}
              </div>
              )}

              {/* Passo 3: quando e para quem */}
              {showStep(3) && <>
              {!editingId && (
                <div>
                  <label className="label">Quando</label>
                  <div className="grid grid-cols-2 gap-2">
                    {dateOptions().map(o => {
                      const on = o.value === null ? pickDate : !pickDate && form.scheduled_at === o.value;
                      return (
                        <button key={o.label} type="button"
                          onClick={() => {
                            if (o.value === null) { setPickDate(true); return; }
                            setPickDate(false);
                            setForm(f => { const next = { ...f, scheduled_at: o.value! }; persistDraft(next); return next; });
                          }}
                          className={`min-h-[48px] rounded-xl border-2 px-3 py-2 text-sm font-semibold text-left transition active:scale-[0.98] ${on ? 'border-brand-500 bg-brand-50 text-brand-800' : 'border-steel-200 text-steel-700'}`}>
                          {o.label}
                        </button>
                      );
                    })}
                  </div>
                  {pickDate && (
                    <input className="input mt-2" type="datetime-local" value={form.scheduled_at} onChange={set('scheduled_at')} />
                  )}
                </div>
              )}

              {/* Para quem — só na criação */}
              {!editingId && (
                <div>
                  <label className="label">Para quem</label>
                  <div className="grid grid-cols-3 gap-2">
                    <button type="button" onClick={() => { setMode('open'); setPickedMechanic(''); }}
                      className={`min-h-[76px] rounded-xl border-2 p-2.5 text-left transition active:scale-95 ${mode === 'open' ? 'border-brand-500 bg-brand-50' : 'border-steel-200'}`}>
                      <div className="text-lg leading-none mb-1">📢</div>
                      <div className="font-semibold text-sm leading-tight">Todos</div>
                      <div className="text-[11px] text-steel-500 mt-0.5 leading-snug">os disponíveis</div>
                    </button>
                    <button type="button"
                      onClick={() => { setMode('favorites'); setPickedMechanic(''); }}
                      disabled={favorites.size === 0}
                      title={favorites.size === 0 ? 'Adicione preferidos em "Buscar mecânicos" ou no picker abaixo' : undefined}
                      className={`min-h-[76px] rounded-xl border-2 p-2.5 text-left transition active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${mode === 'favorites' ? 'border-brand-500 bg-brand-50' : 'border-steel-200'}`}>
                      <div className="text-lg leading-none mb-1">⭐</div>
                      <div className="font-semibold text-sm leading-tight">Preferidos</div>
                      <div className="text-[11px] text-steel-500 mt-0.5 leading-snug">
                        {favorites.size === 0 ? 'nenhum ainda' : `${favorites.size} na lista`}
                      </div>
                    </button>
                    <button type="button" onClick={() => setMode('direct')}
                      className={`min-h-[76px] rounded-xl border-2 p-2.5 text-left transition active:scale-95 ${mode === 'direct' ? 'border-brand-500 bg-brand-50' : 'border-steel-200'}`}>
                      <div className="text-lg leading-none mb-1">🎯</div>
                      <div className="font-semibold text-sm leading-tight">Um mecânico</div>
                      <div className="text-[11px] text-steel-500 mt-0.5 leading-snug">convite direto</div>
                    </button>
                  </div>
                </div>
              )}

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
                        <div className="w-full flex items-center gap-2 p-3">
                          <button type="button"
                            onClick={() => setPickedMechanic(m.id)}
                            className="flex-1 flex items-center gap-3 text-left active:scale-95">
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
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); toggleFavorite(m.id); }}
                            title={favorites.has(m.id) ? 'Remover dos preferidos' : 'Adicionar aos preferidos'}
                            className={`h-9 w-9 rounded-full grid place-items-center shrink-0 transition active:scale-90 ${
                              favorites.has(m.id)
                                ? 'bg-brand-500/15 text-brand-600 hover:bg-brand-500/25'
                                : 'bg-steel-100 text-steel-400 hover:text-brand-500 hover:bg-brand-50'
                            }`}
                          >
                            {favorites.has(m.id) ? '★' : '☆'}
                          </button>
                        </div>
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

              {/* Data (edição) */}
              {editingId && (
                <div>
                  <label className="label">Data / hora desejada</label>
                  <input className="input" type="datetime-local"
                    value={form.scheduled_at} onChange={set('scheduled_at')} />
                </div>
              )}
              </>}
            </div>

            {/* Sticky footer */}
            <div className="px-5 py-4 border-t border-steel-100 bg-white rounded-b-3xl sm:rounded-b-2xl space-y-3">
              {formError && (
                <div className="bg-alert-500/10 border border-alert-300 text-alert-700 text-sm font-semibold rounded-xl px-4 py-2.5 flex items-center gap-2">
                  <span>⚠️</span><span>{formError}</span>
                </div>
              )}
              {/* Empilhar: só ao criar uma demanda avulsa (a que vem de OS/empilhados já tem o próprio caminho) */}
              {/* A partir do passo 2: já tem serviço e valor, e a data não importa para empilhar */}
              {!editingId && step >= 2 && mode !== 'direct' && !form.service_order_id && !form.stacked_service_ids?.length && (
                <button type="button" onClick={stackService} disabled={saving}
                  className="w-full min-h-[44px] rounded-xl border border-steel-200 bg-white px-4 py-2 text-sm font-semibold text-steel-700 hover:bg-steel-50 disabled:opacity-50">
                  📚 Empilhar para juntar com outros serviços
                  <span className="block text-[11px] font-normal text-steel-500">Um mecânico faz vários serviços numa demanda só: sai mais barato</span>
                </button>
              )}
              <div className="flex gap-3">
                {!editingId && step > 1
                  ? <button type="button" onClick={() => goStep((step - 1) as 1 | 2)} className="btn-ghost flex-1">← Voltar</button>
                  : <button type="button" onClick={resetModal} className="btn-ghost flex-1">Cancelar</button>}
                {!editingId && step < 3 ? (
                  <button key="next" type="button" onClick={e => { e.preventDefault(); nextStep(); }} className="btn-primary flex-[2]">Continuar →</button>
                ) : (
                  <button key="submit" type="submit" className="btn-primary flex-[2]" disabled={saving}>
                    {saving
                      ? (editingId ? 'Salvando…' : 'Publicando…')
                      : editingId ? 'Salvar alterações'
                      : mode === 'direct' ? 'Convidar mecânico'
                      : '⚡ Publicar demanda'}
                  </button>
                )}
              </div>
            </div>
          </form>
        </div>
      )}
    </WorkshopLayout>
  );
}

/* ── Demandas ativas: em que etapa cada uma está ── */
type ActiveGroup = 'service' | 'enroute' | 'scheduled' | 'waiting';

const ACTIVE_GROUPS: { key: ActiveGroup; title: string; badge: string }[] = [
  { key: 'service',   title: '🔧 Em serviço',         badge: 'bg-signal-500/15 text-signal-700'   },
  { key: 'enroute',   title: '🚗 Mecânico a caminho', badge: 'bg-brand-500/15 text-brand-700'     },
  { key: 'scheduled', title: '📅 Agendados',          badge: 'bg-pending-500/15 text-pending-700' },
  { key: 'waiting',   title: '📢 Aguardando aceite',  badge: 'bg-steel-200 text-steel-700'        },
];

function groupOf(j: Job): ActiveGroup {
  if (j.status === 'in_progress' || j.arrived_at) return 'service';  // mecânico já está na oficina
  if (!j.mechanic_id) return 'waiting';                              // ninguém aceitou ainda
  if (j.en_route_at) return 'enroute';                               // aceitou e saiu
  if (j.scheduled_at) return 'scheduled';                            // aceitou, data marcada, ainda não saiu
  return 'enroute';                                                  // aceitou demanda imediata
}

function groupActive(jobs: Job[]): Record<ActiveGroup, Job[]> {
  const out: Record<ActiveGroup, Job[]> = { service: [], enroute: [], scheduled: [], waiting: [] };
  jobs.forEach(j => out[groupOf(j)].push(j));
  // Agendados em ordem de data (o mais próximo primeiro)
  out.scheduled.sort((a, b) => new Date(a.scheduled_at!).getTime() - new Date(b.scheduled_at!).getTime());
  return out;
}

/** Prazo de chegada do mecânico — passou do prazo, a oficina cancela sem multa */
function ArrivalInfo({ j }: { j: Job }) {
  if (j.status !== 'assigned') return null;
  const deadline = arrivalDeadline(j);
  if (!deadline) return null;

  if (isArrivalLate(j)) {
    return (
      <div className="mt-1.5 text-[11px] font-semibold text-alert-700 bg-alert-500/10 border border-alert-200 px-2 py-1 rounded-lg">
        ⏰ Atrasado — o prazo era {formatDeadline(deadline)}. Você pode cancelar sem multa.
      </div>
    );
  }
  // Agendado para daqui a mais de 1 dia: o prazo ainda não é relevante
  if (deadline.getTime() - Date.now() > 24 * 60 * 60 * 1000) return null;
  return (
    <div className="mt-1 text-[11px] text-steel-500">
      ⏱ Prazo de chegada: <strong className="text-steel-700">{formatDeadline(deadline)}</strong>
    </div>
  );
}

/* ── Histórico: recolhido por padrão, separado em Concluídos / Cancelados ── */
type HistTab = 'completed' | 'cancelled';
const HIST_PAGE = 10;

function HistorySection({ history, workshopId }: { history: Job[]; workshopId: string | null }) {
  const openKey = workshopId ? `oficina_hist_open:${workshopId}` : null;
  const [open, setOpen] = useState(false);
  const [tab, setTab]   = useState<HistTab>('completed');
  const [shown, setShown] = useState(HIST_PAGE);

  // Lembra se a oficina deixou o histórico aberto (só neste navegador)
  useEffect(() => {
    if (!openKey) return;
    try { setOpen(localStorage.getItem(openKey) === '1'); } catch { /* ignore */ }
  }, [openKey]);

  function toggle() {
    setOpen(o => {
      const next = !o;
      if (openKey) { try { localStorage.setItem(openKey, next ? '1' : '0'); } catch { /* ignore */ } }
      return next;
    });
  }

  // Disputa não é usada no fluxo atual; se aparecer, entra junto com os concluídos
  const completed = history.filter(j => j.status !== 'cancelled');
  const cancelled = history.filter(j => j.status === 'cancelled');
  const list    = tab === 'completed' ? completed : cancelled;
  const visible = list.slice(0, shown);

  const TABS: { key: HistTab; label: string; count: number }[] = [
    { key: 'completed', label: '✅ Concluídos', count: completed.length },
    { key: 'cancelled', label: '✕ Cancelados',  count: cancelled.length },
  ];

  return (
    <section>
      <button
        type="button"
        onClick={toggle}
        className="w-full card !py-4 flex items-center gap-3 text-left hover:bg-steel-50 transition"
        aria-expanded={open}
      >
        <span className="text-xl shrink-0">🗂️</span>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-steel-900">Histórico</div>
          <div className="text-xs text-steel-500 mt-0.5">
            {history.length === 0
              ? 'Sem histórico ainda'
              : `${completed.length} concluído${completed.length !== 1 ? 's' : ''} · ${cancelled.length} cancelado${cancelled.length !== 1 ? 's' : ''}`}
          </div>
        </div>
        <span className="text-xs font-semibold text-brand-600 shrink-0">{open ? 'Ocultar' : 'Ver histórico'}</span>
        <span className={`text-steel-400 text-xs transition-transform ${open ? 'rotate-180' : ''}`}>▼</span>
      </button>

      {open && history.length > 0 && (
        <div className="card mt-2">
          <div className="flex gap-2 mb-2">
            {TABS.map(t => (
              <button
                key={t.key}
                type="button"
                onClick={() => { setTab(t.key); setShown(HIST_PAGE); }}
                className={`text-sm font-semibold px-3 py-1.5 rounded-full border transition ${
                  tab === t.key
                    ? 'bg-brand-500 text-white border-brand-500'
                    : 'bg-white text-steel-600 border-steel-200 hover:border-brand-300'
                }`}
              >
                {t.label} <span className="opacity-80">({t.count})</span>
              </button>
            ))}
          </div>

          {list.length === 0 ? (
            <div className="text-center text-steel-500 text-sm py-6">
              {tab === 'completed' ? 'Nenhum serviço concluído ainda.' : 'Nenhum cancelamento. 👏'}
            </div>
          ) : (
            <div className="divide-y divide-steel-100">
              {visible.map(j => <HistoryRow key={j.id} j={j} />)}
            </div>
          )}

          {list.length > shown && (
            <button
              type="button"
              onClick={() => setShown(s => s + HIST_PAGE)}
              className="w-full mt-2 pt-3 border-t border-steel-100 text-sm font-semibold text-brand-600 hover:text-brand-700"
            >
              Mostrar mais ({list.length - shown} restantes)
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function HistoryRow({ j }: { j: Job }) {
  const isCancelled = j.status === 'cancelled';
  const fee  = Number(j.cancellation_fee ?? 0);
  const date = isCancelled ? (j.cancelled_at ?? j.created_at) : j.completed_at;
  return (
    <div className="py-3 flex justify-between items-center gap-3">
      <div className="min-w-0">
        <div className={`font-semibold truncate ${isCancelled ? 'text-steel-500' : ''}`}>{j.title}</div>
        <div className="text-xs text-steel-500">
          {date ? new Date(date).toLocaleDateString('pt-BR') : '—'}
        </div>
        {isCancelled && j.audience === 'invite' && j.cancelled_by === 'mechanic' && (
          <div className="text-xs text-alert-600">Convite recusado pelo mecânico</div>
        )}
        <div className="text-xs text-steel-400">
          Pacote: {pricingLabel(j)}
          {j.actual_hours != null && <span className="ml-2">⏱ {j.actual_hours}h reais</span>}
        </div>
      </div>
      <div className="text-right shrink-0">
        {isCancelled ? (
          <>
            <div className="font-display text-steel-400 line-through">R$ {formatBRL(j.price)}</div>
            <div className={`text-xs ${fee > 0 ? 'text-alert-600 font-semibold' : 'text-steel-500'}`}>
              {fee > 0 ? `multa R$ ${formatBRL(fee)}` : 'sem cobrança'}
            </div>
          </>
        ) : (
          <>
            <div className="font-bold font-display">R$ {formatBRL(j.price)}</div>
            <div className="text-xs text-steel-500">fechado</div>
          </>
        )}
      </div>
    </div>
  );
}

function KPI({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="min-w-0 px-3 py-3 text-center flex flex-col-reverse">
      <dt className="text-[11px] font-medium text-steel-500 truncate">{label}</dt>
      <dd className="font-display text-xl lg:text-2xl font-bold tabular-nums text-steel-900 truncate">{value}</dd>
    </div>
  );
}

/** Estado real do job considerando arrived_at, pix_paid_at e started_at */
function statusLabel(j: Job): string {
  if (j.status === 'completed')   return 'Concluído';
  if (j.status === 'disputed')    return 'Em disputa';
  if (j.status === 'cancelled')   return 'Cancelado';
  if (j.status === 'open')        return 'Aguardando aceite de um mecânico';
  if (j.status === 'in_progress') return '🔧 Em serviço';
  // status === 'assigned'
  // Agendado aceito mas mecânico ainda não saiu (en_route_at null)
  if (!j.en_route_at && j.scheduled_at) {
    return `📅 Agendado · ${formatScheduled(j.scheduled_at)}`;
  }
  if (!j.arrived_at)              return 'Mecânico a caminho';
  if (!j.pix_paid_at)             return 'Mecânico chegou — aguarda pagamento';
  if (!j.started_at)              return '✅ Pago — aguardando início do serviço';
  return 'Em serviço';
}

function firstName(name: string): string {
  return name.split(' ')[0] || name;
}
