import PanelSlot from '@/components/paraVoce/PanelSlot';
import PanelBanners from '@/components/banners/PanelBanners';
import { ChangeEvent, FormEvent, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import WorkshopLayout from '@/components/layout/WorkshopLayout';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/components/ui/Toast';
import { isPlatformOnly, useWorkshopModules } from '@/lib/modules';
import { saveCharge } from '@/components/marketplace/CustomerCharge';
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
import { useStoredOpen } from '@/hooks/useStoredOpen';
import { splitJobVehicle } from '@/lib/jobDescription';
import RateMechanicModal from '@/components/marketplace/RateMechanic';
import { FavoriteMechanics, PlatformHero, StatusCounters, type HomeMechanic } from '@/components/marketplace/PlatformHome';
import { QuickCall, estimatePrice, medianRate, type ServiceShortcut } from '@/components/marketplace/QuickCall';
import {
  IconAlert, IconArchive, IconArrowLeft, IconArrowRight, IconBell, IconCalendar, IconCar, IconCheck, IconChevronDown, IconClipboardCheck,
  IconClock, IconFileText, IconInfo, IconLayers, IconMap, IconMegaphone, IconPencil, IconPlus, IconRepeat, IconSearch, IconStar,
  IconTarget, IconTrendingUp, IconWrench, IconX, IconZap,
} from '@/components/mecanico/icons';

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
  /** Quanto a oficina vai cobrar do cliente (só ela vê; oficina "Só mecânicos") */
  customer_charge?: string;
  /** Veio de Meus clientes ("Chamar mecânico para este carro"): de quem é a demanda */
  customer_id?: string | null;
  vehicle_id?: string | null;
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
    const hasContent = !!(d.title?.trim() || d.description?.trim() || d.price_per_hour || d.total || d.scheduled_at
      || d.vehicle?.trim() || d.customer_id);
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
  /** Preferidos da oficina (disponíveis ou não), para o card "Meus preferidos" */
  const [favMechanics, setFavMechanics] = useState<(HomeMechanic & { available: boolean })[]>([]);
  const [modal, setModal]       = useState(false);
  const [stackVer, setStackVer] = useState(0);
  /** Demanda sendo avaliada na janela (sem ir para o mapa) */
  const [rating, setRatingJob] = useState<Job | null>(null);
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
  /** Aguardando aceite fica recolhido (a oficina abre quando quiser) */
  const [waitingOpen, toggleWaiting] = useStoredOpen(currentWorkshop?.id ? `oficina_aguardando_open:${currentWorkshop.id}` : null);
  // Oficina "Só mecânicos": pode informar quanto vai cobrar do cliente (quem tem OS tem o valor pela OS)
  const platformOnly = useWorkshopModules(s => s.loaded && isPlatformOnly(s.off));
  /** Valor cobrado do cliente digitado no formulário (null = não informou) */
  const chargeOf = (f: NewJob) => {
    const raw = (f.customer_charge ?? '').trim().replace(',', '.');
    const n = raw === '' ? null : Number(raw);
    return n != null && n >= 0 ? n : null;
  };

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

  // Detalhes dos preferidos (mesmo offline): o card mostra quem está disponível agora
  useEffect(() => {
    const ids = [...favorites];
    if (!ids.length) { setFavMechanics([]); return; }
    supabase.from('mechanics')
      .select('id, rating, total_jobs, is_available, skills, profile:profiles!inner(full_name, status, avatar_url)')
      .in('id', ids).eq('profile.status', 'approved')
      .then(({ data }) => setFavMechanics((data ?? []).map((m: any) => ({
        id: m.id, name: m.profile.full_name, rating: Number(m.rating ?? 0), total_jobs: m.total_jobs ?? 0,
        skills: m.skills ?? [], avatar: m.profile.avatar_url ?? null, available: !!m.is_available,
      }))));
  }, [favorites]);

  /** "Chamar" num preferido: Nova demanda já como convite direto para ele */
  function openInvite(mechanicId: string) {
    if (hasPendingFees) return;
    openCreateModal();
    setMode('direct'); setPickedMechanic(mechanicId);
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
    const invited = [...new Set([
      ...(a ?? []).map(j => (j as Job).invited_mechanic_id),
      ...(h ?? []).flatMap(j => [(j as Job).invited_mechanic_id, (j as Job).mechanic_id]),
    ].filter((x): x is string => !!x))];
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
      { label: 'O quanto antes', value: '' },
      ...(now.getHours() < 13 ? [{ label: 'Hoje, 14h', value: at(0, 14) }] : []),
      { label: 'Amanhã, 8h', value: at(1, 8) },
      { label: 'Outro dia', value: null },
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

  /** Atalhos marcados: abre a demanda já escrita (um ou vários serviços para um mecânico), pelo serviço,
   *  com o tempo típico somado. O valor vem VAZIO: a estimativa aparece só como dica ("Usar") no passo 2,
   *  para ninguém empilhar/publicar um valor que não escolheu. */
  function openShortcut(list: ServiceShortcut[]) {
    if (hasPendingFees || !list.length) return;
    const hours = list.reduce((a, s) => a + s.hours, 0);
    const one = list.length === 1;
    const next: NewJob = {
      ...EMPTY,
      title: one ? list[0].title : `${list[0].title} + ${list.length - 1} serviço(s)`,
      description: one ? list[0].description : ['Serviços a realizar:', ...list.map(s => `• ${s.title} — ${s.description}`)].join('\n'),
      pricing: 'fixed', max_hours: String(hours), total: '',
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
    const t = splitJobVehicle(j.title, j.description);
    setForm({
      ...EMPTY,
      title: t.title,
      description: t.description,
      vehicle: t.vehicle ?? '',
      ...priceForm(j),
      scheduled_at: j.scheduled_at ? new Date(j.scheduled_at).toISOString().slice(0, 16) : '',
    });
    setMode('open'); setPickedMechanic(''); setMechSearch(''); setFormError(null);
    setModal(true);
  }

  /**
   * Histórico: abre uma demanda nova com o mesmo serviço e valor de uma antiga. O carro fica em branco
   * (repetir é quase sempre o mesmo serviço em outro carro). Com `sameMechanic`, vira convite direto
   * para quem fez da outra vez.
   */
  function openRepeat(j: Job, sameMechanic = false) {
    if (hasPendingFees) return;
    const t = splitJobVehicle(j.title, j.description);
    const next: NewJob = { ...EMPTY, title: t.title, description: t.description, ...priceForm(j) };
    setEditingId(null); setDraftRestored(false); setDraftOrigin(null); setFormError(null);
    setForm(next); persistDraft(next);
    const mech = sameMechanic ? j.mechanic_id ?? '' : '';
    setMode(mech ? 'direct' : 'open'); setPickedMechanic(mech); setMechSearch('');
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
      // O carro volta a ir junto no título e na descrição, como na criação
      const text = withVehicle(form);
      const updatePayload: Record<string, unknown> = {
        title:          text.title,
        description:    text.description,
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
    if (form.customer_id) { payload.customer_id = form.customer_id; payload.vehicle_id = form.vehicle_id ?? null; }
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
    // Quanto vai cobrar do cliente (só a oficina vê)
    const charge = chargeOf(form);
    if (platformOnly && charge != null && ins?.id) {
      const { error: chErr } = await saveCharge(currentShop.id, ins.id, charge, user?.id);
      if (chErr) toast.error('A demanda foi publicada, mas o valor cobrado não salvou: ' + chErr.message);
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
      customer_charge: platformOnly ? chargeOf(form) : null,
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

  /** Contadores de pedidos (linha no celular, cartão 2×2 na coluna lateral do computador) */
  const counters = (side = false) => (
    <StatusCounters side={side}
      searching={active.filter(j => !j.mechanic_id).length}
      accepted={active.filter(j => j.mechanic_id && !j.arrived_at && j.status !== 'in_progress').length}
      working={active.filter(j => j.mechanic_id && (j.arrived_at || j.status === 'in_progress')).length}
      done={shop?.total_jobs ?? 0}
      onPick={t => document.getElementById(t === 'ativas' ? 'minhas-solicitacoes' : 'historico')?.scrollIntoView({ behavior: 'smooth', block: 'start' })} />
  );

  return (
    <WorkshopLayout>
      

      {/* Computador: largura máxima e duas colunas (trabalho à esquerda, pedidos e mecânicos à direita).
          Celular: uma coluna só, na mesma ordem de antes. */}
      <div className="max-w-6xl mx-auto lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-5 lg:items-start">
      <div className="min-w-0">

      {/* Conteúdo do admin (banners, dicas, benefícios): posições em Marketing → Banners */}
      <PanelSlot panel="oficina_demandas" at="topo" className="mb-4" />

      {/* O que se faz aqui, em um botão */}
      <PlatformHero available={mechanics.length} onCall={() => openCreateModal()}
        disabled={shopLoading || hasPendingFees} locked={hasPendingFees} />
      <PanelSlot panel="oficina_demandas" at="apos-nova-demanda" className="mb-4" />

      {/* Banner de multa pendente — bloqueia novas demandas até quitar */}
      <PendingFeesBanner workshopId={currentWorkshop?.id ?? null} />

      {/* Serviços empilhados: esperando mecânico da plataforma (a gestão junta e gera a demanda) */}
      {currentWorkshop?.id && !hasPendingFees && <StackBoard wid={currentWorkshop.id} reloadKey={stackVer} onGenerate={() => openCreateModal(true)} />}

      {/* Como estão os pedidos (oficina que nunca pediu não vê quatro zeros) */}
      {!firstTime && <div className="lg:hidden">{counters()}</div>}
      <PanelSlot panel="oficina_demandas" at="apos-contadores" className="mb-4" />

      {/* Atalhos dos serviços mais pedidos (um toque abre a demanda pronta) */}
      <QuickCall mechanics={mechanics} disabled={shopLoading || hasPendingFees} onShortcut={openShortcut} compact
        storageKey={currentWorkshop?.id ? `oficina_atalhos_open:${currentWorkshop.id}` : null} />
      <PanelSlot panel="oficina_demandas" at="apos-atalhos" className="mb-4" />

      {/* Meus preferidos (recolhido): quem a oficina marcou com ⭐, com "Chamar" direto */}
      <div className="lg:hidden">
        <FavoriteMechanics mechanics={favMechanics} onCall={openInvite} disabled={shopLoading || hasPendingFees}
          storageKey={currentWorkshop?.id ? `oficina_preferidos_open:${currentWorkshop.id}` : null} />
      </div>
      <PanelSlot panel="oficina_demandas" at="apos-preferidos" className="mb-4" />

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
          <div className="bg-white border border-brand-300 rounded-xl p-4 sm:p-5">
            <div className="flex items-start gap-3 mb-3">
              <IconBell className="w-5 h-5 mt-0.5 shrink-0 text-brand-600" />
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-steel-900 text-base leading-tight">
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
                      {j.actual_hours != null && ` · ${j.actual_hours}h reais`}
                      {j.completed_at && ` · finalizado ${new Date(j.completed_at).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}`}
                    </div>
                  </div>
                  <span className="bg-brand-500 text-white text-xs font-bold rounded-lg px-3 py-1.5 shrink-0">
                    Confirmar
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
          <div className="bg-white border border-steel-200 rounded-xl p-4 sm:p-5">
            <div className="flex items-start gap-3 mb-3">
              <IconStar className="w-5 h-5 mt-0.5 shrink-0 text-steel-400" />
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
                <button
                  key={j.id}
                  type="button"
                  onClick={() => setRatingJob(j)}
                  className="w-full text-left flex items-center justify-between gap-3 bg-white rounded-xl px-3 py-2.5 min-h-[52px] hover:bg-steel-50 transition border border-steel-100"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-steel-900 truncate text-sm">{j.title}</div>
                    <div className="text-[11px] text-steel-500 mt-0.5">
                      Concluído {j.workshop_confirmed_at && new Date(j.workshop_confirmed_at).toLocaleDateString('pt-BR')}
                    </div>
                  </div>
                  <span className="text-steel-700 text-xs font-semibold shrink-0 inline-flex items-center gap-1">
                    <IconStar className="w-3.5 h-3.5 text-amber-500" />Avaliar
                  </span>
                </button>
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

      <PanelSlot panel="oficina_demandas" at="apos-avaliacoes" className="mb-6" />

      {/* Demandas ativas — agrupadas pela etapa em que estão */}
      {(() => {
        const buckets = groupActive(active);

        const renderCard = (j: Job) => (
          <div key={j.id} className="rounded-xl bg-white border border-steel-200 p-4 min-w-0">
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
                {firstName(inviteName(j))} ainda não respondeu. Você pode cancelar sem multa e{' '}
                <Link to="/oficina/buscar" className="font-bold underline">chamar outro mecânico</Link>.
              </div>
            )}
            {waitingNoAccept(j) && (
              <div className="mt-2 flex items-center justify-between gap-3 text-[12px] text-pending-800 bg-pending-50 border border-pending-200 rounded-lg px-2.5 py-2 leading-snug">
                <span className="flex items-start gap-1.5"><IconClock className="w-3.5 h-3.5 mt-0.5 shrink-0" /><span>Ninguém aceitou há <strong>{waitedLabel(j)}</strong>. Aumentar o valor costuma resolver.</span></span>
                <button type="button" onClick={() => openEditModal(j)}
                  className="shrink-0 h-9 px-3 rounded-lg bg-brand-500 text-white text-xs font-bold active:scale-95">Aumentar valor</button>
              </div>
            )}
            {j.scheduled_at && (
              <div className="text-xs text-steel-500 mt-1.5 flex items-center gap-1.5"><IconCalendar className="w-3.5 h-3.5" />{formatScheduled(j.scheduled_at)}</div>
            )}

            {/* Ações: a principal ocupa o espaço; editar só enquanto ninguém aceitou; cancelar sempre */}
            <div className="mt-3 pt-3 border-t border-steel-100 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                {j.mechanic_id && j.en_route_at ? (
                  <Link to={`/oficina/job/${j.id}/tracking`}
                    className="inline-flex items-center justify-center gap-1.5 w-full sm:w-auto h-10 px-4 rounded-xl bg-brand-500 text-white text-sm font-bold active:scale-[0.99]">
                    <IconMap className="w-4 h-4" />Ver no mapa
                  </Link>
                ) : j.mechanic_id ? (
                  <span className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full bg-signal-50 text-signal-700 text-xs font-bold"><IconCheck className="w-3.5 h-3.5" />Aceito</span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full bg-pending-50 text-pending-700 text-xs font-bold max-w-full">
                    <span className="h-1.5 w-1.5 rounded-full bg-pending-500 animate-pulse-soft shrink-0" />
                    <span className="truncate">{isPendingInvite(j) ? `Aguardando ${firstName(inviteName(j))} aceitar` : 'Aguardando aceite'}</span>
                  </span>
                )}
              </div>
              {j.status === 'open' && !j.mechanic_id && (
                <button type="button" onClick={() => openEditModal(j)}
                  className="shrink-0 h-10 px-2 inline-flex items-center gap-1 text-xs font-semibold text-brand-600 active:text-brand-700">
                  <IconPencil className="w-3.5 h-3.5" />Editar
                </button>
              )}
              <span className="shrink-0"><CancelJobButton job={j}
                onEdit={j.status === 'open' && !j.mechanic_id ? () => openEditModal(j) : undefined}
                onCancelled={() => { setStackVer(v => v + 1); if (currentWorkshop?.id) fetchJobs(currentWorkshop.id); }} /></span>
            </div>
          </div>
        );

        if (active.length === 0) {
          return (
            <section id="minhas-solicitacoes" className="mb-8 scroll-mt-4">
              <h2 className="text-[15px] lg:text-lg font-bold mb-3">Minhas solicitações</h2>
              <div className="rounded-xl bg-white border border-steel-200 text-center px-5 py-8">
                <IconClipboardCheck className="mx-auto w-7 h-7 text-steel-300" />
                <div className="font-semibold text-steel-900 mt-3">Nenhuma solicitação em andamento</div>
                <p className="text-sm text-steel-600 mt-1">Chame um mecânico e acompanhe tudo por aqui: aceite, chegada e serviço.</p>
                <button type="button" onClick={() => openCreateModal()} disabled={shopLoading || hasPendingFees}
                  className="mt-4 inline-flex items-center justify-center gap-2 h-12 px-6 rounded-xl bg-brand-500 text-white font-bold active:scale-[0.99] hover:bg-brand-600 transition disabled:opacity-50">
                  <IconPlus className="w-5 h-5" />Chamar mecânico agora
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
              // Aguardando aceite: recolhido, a oficina abre quando quiser (como o Histórico)
              if (g.key === 'waiting') {
                const late = jobs.filter(j => waitingNoAccept(j)).length;
                return (
                  <section key={g.key} className="mb-6">
                    <button type="button" onClick={toggleWaiting} aria-expanded={waitingOpen}
                      className="w-full rounded-xl bg-white border border-steel-200 px-4 py-3.5 flex items-center gap-3 text-left hover:bg-steel-50 transition">
                      <IconMegaphone className="w-5 h-5 shrink-0 text-steel-400" />
                      <span className="flex-1 min-w-0">
                        <span className="flex items-center gap-2">
                          <span className="font-semibold text-steel-900">Aguardando aceite</span>
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${g.badge}`}>{jobs.length}</span>
                        </span>
                        <span className={`block text-xs mt-0.5 ${late ? 'text-pending-700 font-semibold' : 'text-steel-500'}`}>
                          {late
                            ? `${late === 1 ? '1 sem aceite há muito tempo' : `${late} sem aceite há muito tempo`}: aumentar o valor costuma resolver`
                            : 'Publicadas para os mecânicos, esperando alguém aceitar'}
                        </span>
                      </span>
                      <IconChevronDown className={`w-4 h-4 text-steel-400 shrink-0 transition-transform ${waitingOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {waitingOpen && <div className="grid md:grid-cols-2 gap-3 mt-2.5">{jobs.map(renderCard)}</div>}
                  </section>
                );
              }
              return (
                <section key={g.key} className="mb-6">
                  <div className="flex items-center gap-2 mb-2.5">
                    <g.icon className="w-[18px] h-[18px] text-steel-500" />
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

      <PanelSlot panel="oficina_demandas" at="apos-solicitacoes" className="mb-6" />

      {/* Histórico — fechado por padrão; a oficina escolhe abrir */}
      <div id="historico" className="scroll-mt-4"><HistorySection history={history} workshopId={currentWorkshop?.id ?? null}
        names={inviteNames} onRepeat={hasPendingFees ? undefined : openRepeat} /></div>
      </div>

      {/* Coluna lateral (só no computador) */}
      <aside className="hidden lg:block space-y-4 sticky top-4">
        {!firstTime && counters(true)}
        <FavoriteMechanics mechanics={favMechanics} onCall={openInvite} disabled={shopLoading || hasPendingFees} list
          storageKey={currentWorkshop?.id ? `oficina_preferidos_open:${currentWorkshop.id}` : null} />
      </aside>
      </div>

      {/* Avaliar o mecânico sem sair da tela */}
      {rating && (
        <RateMechanicModal job={{ id: rating.id, title: rating.title }}
          onClose={() => setRatingJob(null)}
          onSaved={() => { setRatingJob(null); if (currentWorkshop?.id) fetchJobs(currentWorkshop.id); }} />
      )}

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
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-brand-600">
                    {editingId ? 'Editar demanda' : 'Nova demanda'}
                  </div>
                  <h2 className="text-xl font-bold tracking-tight text-steel-900 mt-0.5">
                    {editingId ? 'Ajuste os detalhes' : FORM_STEPS[step - 1].title}
                  </h2>
                  <p className="text-sm text-steel-500 mt-0.5 leading-snug">
                    {editingId ? 'Dá para alterar enquanto nenhum mecânico aceitou.' : FORM_STEPS[step - 1].sub}
                  </p>
                </div>
                <button type="button" onClick={resetModal} aria-label="Fechar"
                  className="shrink-0 -mr-1.5 h-11 w-11 rounded-full grid place-items-center text-steel-500 hover:bg-steel-100 active:bg-steel-200">
                  <IconX className="w-5 h-5" />
                </button>
              </div>

              {/* Etapas com nome: a oficina sabe onde está e o que falta */}
              {!editingId && (
                <ol className="grid grid-cols-3 gap-2" aria-label={`Passo ${step} de 3`}>
                  {FORM_STEPS.map((s, i) => {
                    const n = i + 1, done = n < step, on = n === step;
                    return (
                      <li key={s.short} className="min-w-0">
                        <span className={`block h-1 rounded-full ${n <= step ? 'bg-brand-500' : 'bg-steel-200'}`} />
                        <span className={`mt-1.5 flex items-center gap-1 text-xs font-semibold truncate ${on ? 'text-steel-900' : done ? 'text-brand-600' : 'text-steel-400'}`}>
                          {done && <IconCheck className="w-3.5 h-3.5 shrink-0" />}{s.short}
                        </span>
                      </li>
                    );
                  })}
                </ol>
              )}

              {showStep(1) && <>
              {draftRestored && !editingId && (
                <div className="flex items-center justify-between gap-3 rounded-xl bg-steel-50 ring-1 ring-steel-200 px-3 py-2.5 text-sm">
                  <span className="flex items-center gap-2 min-w-0 text-steel-700">
                    <IconFileText className="w-4 h-4 shrink-0 text-steel-500" />
                    <span className="min-w-0">{draftOrigin ? <>Preenchido com <strong className="text-steel-900">{draftOrigin}</strong>. Revise e publique.</> : 'Rascunho do último acesso restaurado.'}</span>
                  </span>
                  <button type="button" onClick={discardDraft} className="shrink-0 min-h-[36px] text-xs font-semibold text-steel-600 underline">
                    Descartar
                  </button>
                </div>
              )}

              {/* Título */}
              <div>
                <label className="label" htmlFor="job-title">Serviço</label>
                <input id="job-title" className="input" placeholder="Ex.: Troca de pastilha de freio" autoComplete="off"
                  value={form.title} onChange={set('title')} />
              </div>

              {/* Veículo: só na demanda avulsa (a que vem de OS/empilhados já traz os carros) */}
              {!editingId && !form.service_order_id && !form.stacked_service_ids?.length && (
                <div>
                  <label className="label" htmlFor="job-vehicle">Veículo</label>
                  <div className="relative">
                    <IconCar className="w-[18px] h-[18px] absolute left-3.5 top-1/2 -translate-y-1/2 text-steel-400" />
                    <input id="job-vehicle" className="input !pl-11" placeholder="Ex.: Gol prata 2015 · ABC1D23" autoComplete="off"
                      value={form.vehicle ?? ''} onChange={set('vehicle')} />
                  </div>
                  <div className="text-xs text-steel-500 mt-1.5">Modelo, cor e placa. O mecânico vê em qual carro vai trabalhar.</div>
                </div>
              )}

              {/* Descrição */}
              <div>
                <label className="label" htmlFor="job-details">Detalhes <span className="normal-case tracking-normal font-normal text-steel-400">· opcional</span></label>
                <textarea id="job-details" className="input" rows={3}
                  placeholder="Sintoma, peças que a oficina fornece, ferramenta necessária…"
                  value={form.description} onChange={set('description')} />
              </div>
              </>}

              {/* Passo 2: quanto */}
              {showStep(2) && (
              <div>
                {(editingId || hourOpt || form.pricing === 'hour') && <>
                <div className="label">Forma de pagamento</div>
                <div className="flex gap-1 bg-steel-100 rounded-xl p-1 mb-4">
                  {([['fixed', 'Pelo serviço'], ['hour', 'Por hora']] as const).map(([k, l]) => (
                    <button key={k} type="button"
                      onClick={() => setForm(f => { const next = { ...f, pricing: k }; persistDraft(next); return next; })}
                      className={`flex-1 min-h-[40px] rounded-lg py-2 text-sm font-semibold transition ${
                        (form.pricing ?? 'hour') === k ? 'bg-white shadow text-steel-900' : 'text-steel-500 hover:text-steel-700'}`}>
                      {l}
                    </button>
                  ))}
                </div>
                </>}
                {(() => {
                  const fixed = form.pricing === 'fixed';
                  return (
                    <div className="grid grid-cols-[1.4fr_1fr] gap-3">
                      <div>
                        <label className="label" htmlFor="job-price">{fixed ? 'Valor do serviço' : 'Valor por hora'}</label>
                        <div className="relative">
                          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-steel-500 text-sm font-semibold">R$</span>
                          <input id="job-price" className="input !pl-11 font-display !text-lg font-bold tabular-nums" type="number" inputMode="decimal"
                            min={1} step={fixed ? 0.01 : 1} required placeholder={fixed ? '150' : '60'}
                            value={fixed ? form.total ?? '' : form.price_per_hour} onChange={set(fixed ? 'total' : 'price_per_hour')} />
                        </div>
                      </div>
                      <div>
                        <label className="label" htmlFor="job-hours">Tempo{fixed && <span className="normal-case tracking-normal font-normal text-steel-400"> · opcional</span>}</label>
                        <div className="relative">
                          <input id="job-hours" className="input !pr-9 !text-lg tabular-nums" type="number" inputMode="decimal"
                            min={0.5} max={fixed ? 99 : 24} step={0.5} required={!fixed} placeholder={fixed ? '—' : '2'}
                            value={form.max_hours} onChange={set('max_hours')} />
                          <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-steel-500 text-sm">h</span>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Referências de preço: estimativa pelos disponíveis e faixa do estado (por hora) */}
                {((suggested && !editingId) || (marketRate && form.pricing !== 'fixed')) && (
                  <div className="mt-3 rounded-xl ring-1 ring-steel-200 divide-y divide-steel-100">
                    {suggested && !editingId && (
                      <div className="flex items-center gap-3 px-3 py-2.5">
                        <IconTrendingUp className="w-4 h-4 shrink-0 text-steel-500" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-steel-700">
                            Sugerido <strong className="text-steel-900 tabular-nums">R$ {formatBRL(suggested, { decimals: 0 })}{form.pricing === 'fixed' ? '' : '/h'}</strong>
                          </div>
                          <div className="text-xs text-steel-500 leading-snug">
                            {form.pricing === 'fixed'
                              ? `${String(estHours).replace('.', ',')}h × R$ ${Math.round(rateNow!)}/h, valor do meio entre ${mechanics.length} ${mechanics.length === 1 ? 'disponível' : 'disponíveis'}`
                              : `valor do meio entre ${mechanics.length} ${mechanics.length === 1 ? 'mecânico disponível' : 'mecânicos disponíveis'}`}
                          </div>
                        </div>
                        {typedPrice !== suggested && (
                          <button type="button"
                            onClick={() => setForm(f => {
                              const next = f.pricing === 'fixed' ? { ...f, total: String(suggested) } : { ...f, price_per_hour: String(suggested) };
                              persistDraft(next); return next;
                            })}
                            className="shrink-0 h-9 px-3 rounded-lg ring-1 ring-steel-300 text-steel-800 text-xs font-bold hover:bg-steel-50 active:scale-95">
                            Usar
                          </button>
                        )}
                      </div>
                    )}
                    {marketRate && form.pricing !== 'fixed' && (
                      <div className="flex items-center gap-3 px-3 py-2.5">
                        <IconInfo className="w-4 h-4 shrink-0 text-signal-600" />
                        <div className="text-xs text-steel-600 leading-snug">
                          <strong className="text-steel-800">Mercado em {currentWorkshop?.state}: R$ {Math.round(marketRate.low)}–{Math.round(marketRate.high)}/h</strong>
                          {' '}({marketRate.count} {marketRate.count === 1 ? 'referência' : 'referências'}). Dentro dessa faixa o aceite costuma ser mais rápido.
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Total que a oficina paga + o que "valor fechado" quer dizer */}
                <div className={`mt-3 rounded-xl px-4 py-3 ${estimated > 0 ? 'bg-steel-900 text-white' : 'bg-steel-50 ring-1 ring-steel-200'}`}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className={`text-sm font-semibold ${estimated > 0 ? 'text-steel-200' : 'text-steel-600'}`}>Valor fechado</span>
                    <span className={`font-display text-xl font-bold tabular-nums ${estimated > 0 ? '' : 'text-steel-300'}`}>
                      R$ {estimated > 0 ? formatBRL(estimated) : '0,00'}
                    </span>
                  </div>
                  <p className={`text-xs mt-1 leading-snug ${estimated > 0 ? 'text-steel-300' : 'text-steel-500'}`}>
                    {form.pricing === 'fixed'
                      ? 'Você paga esse valor, não importa quanto tempo o serviço leve.'
                      : 'Valor/hora × tempo previsto, mesmo se terminar antes ou levar mais.'}
                  </p>
                </div>
                {!editingId && !hourOpt && form.pricing !== 'hour' && (
                  <button type="button" onClick={() => setHourOpt(true)} className="mt-1 text-xs font-semibold text-brand-600 min-h-[40px]">
                    Prefere pagar por hora?
                  </button>
                )}

                {/* Quanto vai cobrar do cliente (só a oficina "Só mecânicos"; só ela vê) */}
                {platformOnly && !editingId && (
                  <div className="mt-3 rounded-xl ring-1 ring-steel-200 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-sm font-semibold text-steel-800" htmlFor="customer-charge">Quanto você vai cobrar do cliente?</label>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-steel-500 bg-steel-100 rounded-full px-2 py-0.5">só você vê</span>
                    </div>
                    <div className="relative mt-2">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-steel-400 text-sm">R$</span>
                      <input id="customer-charge" className="input !pl-9" type="number" inputMode="decimal" min={0} step={0.01}
                        placeholder="opcional" value={form.customer_charge ?? ''} onChange={set('customer_charge')} />
                    </div>
                    {(() => {
                      const c = chargeOf(form);
                      if (c == null || !(estimated > 0)) return <p className="text-xs text-steel-600 mt-1.5">Opcional. Com ele o Painel mostra quanto você ganha em cada serviço. O mecânico não vê.</p>;
                      const left = c - estimated;
                      return (
                        <p className={`text-xs font-semibold mt-1.5 ${left >= 0 ? 'text-signal-700' : 'text-alert-600'}`}>
                          Fica R$ {formatBRL(left)} com você ({c > 0 ? Math.round((left / c) * 100) : 0}% do cobrado)
                        </p>
                      );
                    })()}
                  </div>
                )}
              </div>
              )}

              {/* Passo 3: quando e para quem */}
              {showStep(3) && <>
              {!editingId && (
                <div>
                  <div className="label">Quando</div>
                  <div className="grid grid-cols-2 gap-2">
                    {dateOptions().map(o => {
                      const on = o.value === null ? pickDate : !pickDate && form.scheduled_at === o.value;
                      return (
                        <button key={o.label} type="button" aria-pressed={on}
                          onClick={() => {
                            if (o.value === null) { setPickDate(true); return; }
                            setPickDate(false);
                            setForm(f => { const next = { ...f, scheduled_at: o.value! }; persistDraft(next); return next; });
                          }}
                          className={`min-h-[48px] flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold text-left transition active:scale-[0.98] ${on ? 'border-brand-500 bg-brand-50 text-brand-800 ring-1 ring-brand-500' : 'border-steel-200 text-steel-700 hover:border-steel-300'}`}>
                          {o.value === '' ? <IconZap className="w-4 h-4 shrink-0" /> : o.value === null ? <IconCalendar className="w-4 h-4 shrink-0" /> : <IconClock className="w-4 h-4 shrink-0" />}
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
                  <div className="label">Para quem</div>
                  <div className="grid grid-cols-3 gap-2">
                    {([
                      { k: 'open' as const, icon: IconMegaphone, title: 'Todos', sub: mechanics.length ? `${mechanics.length} ${mechanics.length === 1 ? 'disponível' : 'disponíveis'}` : 'os disponíveis', off: false },
                      { k: 'favorites' as const, icon: IconStar, title: 'Preferidos', sub: favorites.size === 0 ? 'nenhum ainda' : `${favorites.size} na lista`, off: favorites.size === 0 },
                      { k: 'direct' as const, icon: IconTarget, title: 'Um mecânico', sub: 'convite direto', off: false },
                    ]).map(o => {
                      const on = mode === o.k;
                      return (
                        <button key={o.k} type="button" disabled={o.off} aria-pressed={on}
                          title={o.off ? 'Marque a estrela de um mecânico em "Um mecânico" ou em Buscar profissionais' : undefined}
                          onClick={() => { setMode(o.k); if (o.k !== 'direct') setPickedMechanic(''); }}
                          className={`min-h-[84px] rounded-xl border p-2.5 text-left transition active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed ${on ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-500' : 'border-steel-200 hover:border-steel-300'}`}>
                          <o.icon className={`w-5 h-5 mb-1.5 ${on ? 'text-brand-600' : 'text-steel-500'}`} />
                          <div className="font-semibold text-sm leading-tight text-steel-900">{o.title}</div>
                          <div className="text-[11px] text-steel-500 mt-0.5 leading-snug">{o.sub}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Picker de mecânico */}
              {mode === 'direct' && (
                <div>
                  <label className="label" htmlFor="mech-search">Escolha o mecânico</label>
                  <div className="relative mb-2">
                    <IconSearch className="w-[18px] h-[18px] absolute left-3.5 top-1/2 -translate-y-1/2 text-steel-400" />
                    <input id="mech-search" className="input !pl-11" placeholder="Buscar por nome…" autoComplete="off"
                      value={mechSearch} onChange={e => setMechSearch(e.target.value)} />
                  </div>
                  {pickedMechanic && !filteredMechanics.some(m => m.id === pickedMechanic) && (
                    <div className="mb-2 rounded-xl border border-brand-500 ring-1 ring-brand-500 bg-brand-50 p-3 flex items-center gap-2">
                      <IconCheck className="w-4 h-4 text-brand-600 shrink-0" />
                      <div className="min-w-0">
                        <div className="font-semibold text-sm truncate">{inviteNames[pickedMechanic] ?? favMechanics.find(m => m.id === pickedMechanic)?.name ?? 'Mecânico escolhido'}</div>
                        <div className="text-xs text-steel-600">recebe o convite direto</div>
                      </div>
                    </div>
                  )}
                  <div className="space-y-2 max-h-56 overflow-y-auto">
                    {filteredMechanics.length === 0 ? (
                      <div className="text-sm text-steel-500 text-center py-4">
                        {mechSearch ? 'Ninguém com esse nome entre os disponíveis' : 'Nenhum mecânico disponível no momento'}
                      </div>
                    ) : filteredMechanics.map(m => (
                      <div key={m.id} className={`rounded-xl border transition ${
                        pickedMechanic === m.id ? 'border-brand-500 ring-1 ring-brand-500 bg-brand-50' : 'border-steel-200'
                      }`}>
                        <div className="w-full flex items-center gap-2 p-3">
                          <button type="button"
                            onClick={() => setPickedMechanic(m.id)}
                            className="flex-1 min-w-0 flex items-center gap-3 text-left active:scale-[0.99]">
                            {m.avatar
                              ? <img src={m.avatar} alt="" loading="lazy" className="h-10 w-10 rounded-full object-cover bg-steel-100 shrink-0" />
                              : <span className="h-10 w-10 rounded-full bg-brand-50 grid place-items-center text-brand-700 text-sm font-bold shrink-0">{initialsOf(m.name)}</span>}
                            <div className="flex-1 min-w-0">
                              <div className="font-semibold text-steel-900 truncate">{m.name}</div>
                              <div className="text-xs text-steel-500 flex items-center gap-1 flex-wrap">
                                {Number(m.rating) > 0
                                  ? <><IconStar filled className="w-3 h-3 text-amber-500" />{Number(m.rating).toFixed(1).replace('.', ',')}</>
                                  : 'Novo'}
                                <span aria-hidden>·</span>{m.total_jobs} {m.total_jobs === 1 ? 'serviço' : 'serviços'}
                                {Number(m.hourly_rate) > 0 && <><span aria-hidden>·</span>R$ {formatBRL(Number(m.hourly_rate), { decimals: 0 })}/h</>}
                              </div>
                            </div>
                            {pickedMechanic === m.id && <IconCheck className="w-5 h-5 text-brand-600 shrink-0" />}
                          </button>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); toggleFavorite(m.id); }}
                            aria-label={favorites.has(m.id) ? 'Remover dos preferidos' : 'Adicionar aos preferidos'}
                            aria-pressed={favorites.has(m.id)}
                            className={`h-10 w-10 rounded-full grid place-items-center shrink-0 transition active:scale-90 ${
                              favorites.has(m.id)
                                ? 'text-amber-500 hover:bg-amber-50'
                                : 'text-steel-400 hover:text-amber-500 hover:bg-steel-50'
                            }`}
                          >
                            <IconStar filled={favorites.has(m.id)} className="w-5 h-5" />
                          </button>
                        </div>
                        <button type="button"
                          onClick={() => setReviewsOpen(reviewsOpen === m.id ? null : m.id)}
                          aria-expanded={reviewsOpen === m.id}
                          className="w-full min-h-[36px] text-xs text-steel-600 hover:text-steel-900 font-semibold border-t border-steel-100 py-1.5">
                          {reviewsOpen === m.id ? 'Ocultar avaliações' : 'Ver avaliações'}
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

              {/* Resumo: o que vai ser publicado, conferido antes do botão */}
              {!editingId && (() => {
                const picked = mechanics.find(m => m.id === pickedMechanic)?.name
                  ?? (pickedMechanic ? inviteNames[pickedMechanic] ?? favMechanics.find(m => m.id === pickedMechanic)?.name : undefined);
                const rows: [string, string][] = [
                  ['Serviço', form.title.trim() || '—'],
                  ...(form.vehicle?.trim() ? [['Veículo', form.vehicle.trim()] as [string, string]] : []),
                  ['Valor fechado', estimated > 0 ? `R$ ${formatBRL(estimated)}${form.pricing === 'hour' ? ` (${String(Number(form.max_hours)).replace('.', ',')}h)` : ''}` : '—'],
                  ['Quando', form.scheduled_at ? formatScheduled(new Date(form.scheduled_at).toISOString()) : 'O quanto antes'],
                  ['Para quem', mode === 'open' ? 'Todos os mecânicos disponíveis'
                    : mode === 'favorites' ? `Seus ${favorites.size} preferidos`
                    : picked ? `Convite para ${picked}` : 'Escolha o mecânico acima'],
                ];
                return (
                  <div className="rounded-xl bg-steel-50 ring-1 ring-steel-200 p-3.5">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-steel-500 mb-2">Resumo da demanda</div>
                    <dl className="space-y-1.5 text-sm">
                      {rows.map(([k, v]) => (
                        <div key={k} className="flex gap-3">
                          <dt className="w-24 shrink-0 text-steel-500">{k}</dt>
                          <dd className="flex-1 min-w-0 font-semibold text-steel-900 break-words">{v}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                );
              })()}
              </>}
            </div>

            {/* Sticky footer */}
            <div className="px-5 py-4 border-t border-steel-100 bg-white rounded-b-3xl sm:rounded-b-2xl space-y-3">
              {formError && (
                <div role="alert" className="bg-alert-500/10 border border-alert-300 text-alert-700 text-sm font-semibold rounded-xl px-4 py-2.5 flex items-center gap-2">
                  <IconAlert className="w-4 h-4 shrink-0" /><span>{formError}</span>
                </div>
              )}
              {/* Empilhar: só ao criar uma demanda avulsa (a que vem de OS/empilhados já tem o próprio caminho) */}
              {/* A partir do passo 2: já tem serviço e valor, e a data não importa para empilhar */}
              {!editingId && step >= 2 && mode !== 'direct' && !form.service_order_id && !form.stacked_service_ids?.length && (
                <button type="button" onClick={stackService} disabled={saving}
                  className="w-full min-h-[48px] flex items-center gap-3 rounded-xl border border-dashed border-steel-300 bg-white px-3.5 py-2 text-left hover:bg-steel-50 disabled:opacity-50">
                  <IconLayers className="w-5 h-5 text-steel-500 shrink-0" />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-steel-800">Empilhar e juntar com outros serviços</span>
                    <span className="block text-[11px] text-steel-500 leading-snug">Um mecânico faz vários numa demanda só e sai mais barato</span>
                  </span>
                </button>
              )}
              <div className="flex gap-3">
                {!editingId && step > 1
                  ? <button type="button" onClick={() => goStep((step - 1) as 1 | 2)} className="btn-ghost flex-1 min-h-[48px]"><IconArrowLeft className="w-4 h-4" />Voltar</button>
                  : <button type="button" onClick={resetModal} className="btn-ghost flex-1 min-h-[48px]">Cancelar</button>}
                {!editingId && step < 3 ? (
                  <button key="next" type="button" onClick={e => { e.preventDefault(); nextStep(); }} className="btn-primary flex-[2] min-h-[48px]">
                    Continuar<IconArrowRight className="w-4 h-4" />
                  </button>
                ) : (
                  <button key="submit" type="submit" className="btn-primary flex-[2] min-h-[48px]" disabled={saving}>
                    {saving
                      ? (editingId ? 'Salvando…' : 'Publicando…')
                      : editingId ? 'Salvar alterações'
                      : mode === 'direct' ? 'Enviar convite'
                      : 'Publicar demanda'}
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

/** Passos da Nova demanda: nome curto (barra de etapas), título e apoio */
const FORM_STEPS = [
  { short: 'Serviço', title: 'Qual serviço você precisa?', sub: 'Descreva o trabalho e o carro.' },
  { short: 'Valor',   title: 'Quanto você vai pagar?',     sub: 'Valor fechado: o mecânico sabe quanto recebe antes de aceitar.' },
  { short: 'Envio',   title: 'Quando e para quem?',        sub: 'Confira o resumo e publique.' },
];

const initialsOf = (name: string) => name.trim().split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase() ?? '').join('');

/* ── Demandas ativas: em que etapa cada uma está ── */
type ActiveGroup = 'service' | 'enroute' | 'scheduled' | 'waiting';

const ACTIVE_GROUPS: { key: ActiveGroup; title: string; icon: typeof IconWrench; badge: string }[] = [
  { key: 'service',   title: 'Em serviço',         icon: IconWrench,    badge: 'bg-signal-500/15 text-signal-700'   },
  { key: 'enroute',   title: 'Mecânico a caminho', icon: IconCar,       badge: 'bg-brand-500/15 text-brand-700'     },
  { key: 'scheduled', title: 'Agendados',          icon: IconCalendar,  badge: 'bg-pending-500/15 text-pending-700' },
  { key: 'waiting',   title: 'Aguardando aceite',  icon: IconMegaphone, badge: 'bg-steel-200 text-steel-700'        },
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
        Atrasado: o prazo era {formatDeadline(deadline)}. Você pode cancelar sem multa.
      </div>
    );
  }
  // Agendado para daqui a mais de 1 dia: o prazo ainda não é relevante
  if (deadline.getTime() - Date.now() > 24 * 60 * 60 * 1000) return null;
  return (
    <div className="mt-1 text-[11px] text-steel-500">
      Prazo de chegada: <strong className="text-steel-700">{formatDeadline(deadline)}</strong>
    </div>
  );
}

/* ── Histórico: recolhido por padrão, separado em Concluídos / Cancelados ── */
type HistTab = 'completed' | 'cancelled';
const HIST_PAGE = 10;

function HistorySection({ history, workshopId, names, onRepeat }: {
  history: Job[]; workshopId: string | null;
  /** id do mecânico → nome */
  names: Record<string, string>;
  /** Repetir a demanda (com o mesmo mecânico, se `same`) */
  onRepeat?: (j: Job, same?: boolean) => void;
}) {
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
    { key: 'completed', label: 'Concluídos', count: completed.length },
    { key: 'cancelled', label: 'Cancelados', count: cancelled.length },
  ];

  return (
    <section>
      <button
        type="button"
        onClick={toggle}
        className="w-full rounded-xl bg-white border border-steel-200 px-4 py-3.5 flex items-center gap-3 text-left hover:bg-steel-50 transition"
        aria-expanded={open}
      >
        <IconArchive className="w-5 h-5 shrink-0 text-steel-400" />
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-steel-900">Histórico</div>
          <div className="text-xs text-steel-500 mt-0.5">
            {history.length === 0
              ? 'Sem histórico ainda'
              : `${completed.length} concluído${completed.length !== 1 ? 's' : ''} · ${cancelled.length} cancelado${cancelled.length !== 1 ? 's' : ''}`}
          </div>
        </div>
        <IconChevronDown className={`w-4 h-4 text-steel-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
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
              {tab === 'completed' ? 'Nenhum serviço concluído ainda.' : 'Nenhum cancelamento.'}
            </div>
          ) : (
            <div className="divide-y divide-steel-100">
              {visible.map(j => <HistoryRow key={j.id} j={j} mechName={j.mechanic_id ? names[j.mechanic_id] : undefined} onRepeat={onRepeat} />)}
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

function HistoryRow({ j, mechName, onRepeat }: { j: Job; mechName?: string; onRepeat?: (j: Job, same?: boolean) => void }) {
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
          {j.actual_hours != null && <span> · {j.actual_hours}h reais</span>}
        </div>
        {/* Serviço que se repete: chama de novo sem digitar tudo */}
        {onRepeat && (
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" onClick={() => onRepeat(j)}
              className="h-9 px-3 inline-flex items-center gap-1.5 rounded-lg border border-brand-300 bg-white text-brand-700 text-xs font-bold active:scale-95 hover:bg-brand-50">
              <IconRepeat className="w-3.5 h-3.5" />Repetir
            </button>
            {!isCancelled && j.mechanic_id && (
              <button type="button" onClick={() => onRepeat(j, true)}
                className="h-9 px-3 inline-flex items-center gap-1.5 rounded-lg border border-steel-200 bg-white text-steel-800 text-xs font-bold active:scale-95 hover:bg-steel-50 max-w-full truncate">
                <IconTarget className="w-3.5 h-3.5 shrink-0" />Chamar {mechName ? firstName(mechName) : 'o mesmo mecânico'}
              </button>
            )}
          </div>
        )}
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
  if (j.status === 'in_progress') return 'Em serviço';
  // status === 'assigned'
  // Agendado aceito mas mecânico ainda não saiu (en_route_at null)
  if (!j.en_route_at && j.scheduled_at) {
    return `Agendado · ${formatScheduled(j.scheduled_at)}`;
  }
  if (!j.arrived_at)              return 'Mecânico a caminho';
  if (!j.pix_paid_at)             return 'Mecânico chegou, aguardando pagamento';
  if (!j.started_at)              return 'Pago, aguardando início do serviço';
  return 'Em serviço';
}

/** Valor da demanda no formato do formulário (pelo serviço ou por hora) */
function priceForm(j: Job): Pick<NewJob, 'pricing' | 'total' | 'price_per_hour' | 'max_hours'> {
  return j.pricing === 'fixed'
    ? { pricing: 'fixed', total: String(j.price_per_hour ?? ''), price_per_hour: '', max_hours: j.estimated_hours != null ? String(j.estimated_hours) : '' }
    : { pricing: 'hour', total: '', price_per_hour: String(j.price_per_hour ?? ''), max_hours: String(j.max_hours ?? '1') };
}

/** Demanda aberta (não convite) sem aceite há tempo demais: 20 min, ou 2 h se for agendada */
const NO_ACCEPT_MS = 20 * 60 * 1000;
const NO_ACCEPT_SCHEDULED_MS = 2 * 60 * 60 * 1000;
function waitingNoAccept(j: Job, now = Date.now()): boolean {
  if (j.status !== 'open' || j.mechanic_id || j.audience === 'invite') return false;
  return now - new Date(j.created_at).getTime() > (j.scheduled_at ? NO_ACCEPT_SCHEDULED_MS : NO_ACCEPT_MS);
}
function waitedLabel(j: Job, now = Date.now()): string {
  const min = Math.floor((now - new Date(j.created_at).getTime()) / 60000);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60), m = min % 60;
  return h >= 24 ? `${Math.floor(h / 24)} dia${h >= 48 ? 's' : ''}` : m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
}

function firstName(name: string): string {
  return name.split(' ')[0] || name;
}
