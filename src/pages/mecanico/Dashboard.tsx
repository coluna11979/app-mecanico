import PanelSlot from '@/components/paraVoce/PanelSlot';
import ParaVoceRows from '@/components/paraVoce/ParaVoceRows';
import PanelBanners from '@/components/banners/PanelBanners';
import { useEffect, useMemo, useRef, useState } from 'react';
import { jobSummary } from '@/lib/jobDescription';
import { raisedFrom } from '@/lib/jobRaise';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import MechanicLayout from '@/components/layout/MechanicLayout';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { unlockAudio, attachAutoUnlock } from '@/lib/alertSound';
import { useNewJobAlert } from '@/hooks/useNewJobAlert';
import { distKm, formatDistance } from '@/lib/geo';
import { mechanicNet, formatMoney, hoursLabel } from '@/lib/payment';
import { isScheduled, formatScheduled } from '@/lib/scheduling';
import { AcceptDeadlineHint, ArrivalCountdown } from '@/components/ArrivalDeadline';
import { PushAlertCard } from '@/components/mecanico/PushAlertCard';
import { declineInvite, isPendingInvite } from '@/lib/jobInvite';
import type { Job, Mechanic, Workshop } from '@/types/database';
import {
  IconAlert, IconBuilding, IconCalendar, IconChevronDown, IconChevronRight, IconClock, IconDollar,
  IconGift, IconInfo, IconMap, IconMapPin, IconNavigation, IconStar, IconWrench, IconX,
} from '@/components/mecanico/icons';

type Toast = { id: string; job: Job };

type WorkshopBrief = Pick<Workshop, 'business_name' | 'city' | 'state' | 'lat' | 'lng' | 'rating' | 'total_jobs'>;
type JobWithShop = Job & { workshop: WorkshopBrief | null };

type PendingRating = Job & { workshop_name?: string };

type JustEarned = { net: number; jobTitle: string };

export default function MechanicDashboard() {
  const { user } = useAuth();
  const location = useLocation();
  const nav = useNavigate();
  const [justEarned, setJustEarned] = useState<JustEarned | null>(null);

  useEffect(() => {
    const st = location.state as { justEarned?: JustEarned } | null;
    if (st?.justEarned) {
      setJustEarned(st.justEarned);
      nav(location.pathname, { replace: true, state: null });
    }
  }, [location.state, location.pathname, nav]);
  const [me, setMe]                       = useState<Mechanic | null>(null);
  const [openJobs, setOpenJobs]           = useState<JobWithShop[]>([]);
  const [activeJobs, setActiveJobs]       = useState<Job[]>([]);
  const [userPos, setUserPos]             = useState<[number, number] | null>(null);
  const [pendingRatings, setPendingRatings] = useState<PendingRating[]>([]);
  const [loading, setLoading]             = useState(true);
  const [accepting, setAccepting]         = useState<string | null>(null);
  // Rating state
  const [ratingJob, setRatingJob]         = useState<PendingRating | null>(null);
  const [stars, setStars]                 = useState(0);
  const [hovered, setHovered]             = useState(0);
  const [ratingNote, setRatingNote]       = useState('');
  const [submitting, setSubmitting]       = useState(false);
  const [toasts, setToasts]               = useState<Toast[]>([]);
  const toastTimer = useRef<Record<string, number>>({});

  useEffect(() => { if (user) load(); }, [user]);

  /* Destrava áudio na primeira interação (clique/toque/tecla) */
  useEffect(() => { attachAutoUnlock(); }, []);

  /* ── Alerta sonoro de novo job ── */
  useNewJobAlert({
    enabled: !!me?.is_available,
    onNewJob: async (job) => {
      // Mostra toast imediatamente
      const tid = job.id;
      setToasts(prev => [{ id: tid, job }, ...prev.slice(0, 2)]);
      toastTimer.current[tid] = window.setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== tid));
      }, 7000);
      // Re-busca com workshop para já vir com cidade/coords
      const { data: j } = await supabase
        .from('jobs')
        .select('*, workshop:workshops(business_name, city, state, lat, lng, rating, total_jobs)')
        .eq('id', job.id).maybeSingle();
      const enriched = (j as JobWithShop | null) ?? { ...job, workshop: null };
      setOpenJobs(prev => [enriched, ...prev.filter(x => x.id !== enriched.id)]);
    },
  });

  /* ── Geolocalização do mecânico para distância nos cards ── */
  useEffect(() => {
    if (!navigator.geolocation) return;
    const gotFix = (p: GeolocationPosition) =>
      setUserPos([p.coords.latitude, p.coords.longitude]);
    navigator.geolocation.getCurrentPosition(gotFix, () => { /* mantém null */ }, { timeout: 6000 });
  }, []);

  /* Fallback: posição salva do mecânico (atualizada pelo useGeoBroadcast em outras telas) */
  useEffect(() => {
    if (userPos) return;
    if (me?.current_lat && me?.current_lng) setUserPos([me.current_lat, me.current_lng]);
  }, [me, userPos]);

  async function load() {
    setLoading(true);
    const { data: m } = await supabase.from('mechanics').select('*').eq('profile_id', user!.id).maybeSingle();
    setMe(m as Mechanic);
    await fetchJobs(m?.id ?? '');
    setLoading(false);
  }

  async function fetchJobs(mechId: string) {
    const [{ data: open }, { data: mine }, { data: toRate }] = await Promise.all([
      supabase.from('jobs')
        .select('*, workshop:workshops(business_name, city, state, lat, lng, rating, total_jobs)')
        .eq('status', 'open')
        .order('created_at', { ascending: false })
        .limit(20),
      mechId
        ? supabase.from('jobs').select('*').eq('mechanic_id', mechId).in('status', ['assigned', 'in_progress'])
        : Promise.resolve({ data: [] }),
      mechId
        ? supabase.from('jobs')
            .select('*, workshop:workshops(business_name)')
            .eq('mechanic_id', mechId)
            .eq('status', 'completed')
            .not('workshop_confirmed_at', 'is', null)
            .is('workshop_rating', null)
            .order('completed_at', { ascending: false })
            .limit(5)
        : Promise.resolve({ data: [] }),
    ]);
    setOpenJobs((open as JobWithShop[]) ?? []);
    // "Em andamento" = só os que já estão a caminho ou em execução.
    // Agendados aceitos (assigned + en_route_at null) ficam na aba Agenda.
    setActiveJobs(((mine as Job[]) ?? []).filter(
      j => j.status === 'in_progress' || (j.status === 'assigned' && !!j.en_route_at)
    ));
    setPendingRatings(((toRate ?? []) as any[]).map(j => ({
      ...j, workshop_name: j.workshop?.business_name,
    })));
  }

  async function submitRating() {
    if (!ratingJob || stars === 0) return;
    setSubmitting(true);
    await supabase.from('jobs').update({
      workshop_rating:      stars,
      workshop_rating_note: ratingNote.trim() || null,
    }).eq('id', ratingJob.id);
    setPendingRatings(prev => prev.filter(j => j.id !== ratingJob.id));
    setRatingJob(null); setStars(0); setRatingNote(''); setHovered(0);
    setSubmitting(false);
  }

  async function toggleAvailable() {
    if (!me) return;
    unlockAudio(); // destrava AudioContext no clique do usuário
    const { data } = await supabase.from('mechanics').update({ is_available: !me.is_available }).eq('id', me.id).select().single();
    setMe(data as Mechanic);
  }

  /* Jobs decorados com distância (quando há posição) e ordenados por proximidade */
  // Convites diretos pra mim ficam numa seção própria (Aceitar / Recusar)
  const invites = useMemo(
    () => openJobs.filter(j => isPendingInvite(j) && !!me && j.invited_mechanic_id === me.id),
    [openJobs, me],
  );
  const decoratedJobs = useMemo(() => {
    const withDist = openJobs.filter(j => j.audience !== 'invite').map(j => {
      const ws = j.workshop;
      const km = (userPos && ws?.lat != null && ws?.lng != null)
        ? distKm(userPos[0], userPos[1], ws.lat, ws.lng)
        : null;
      return { job: j, km };
    });
    if (userPos) {
      withDist.sort((a, b) => {
        if (a.km == null && b.km == null) return 0;
        if (a.km == null) return 1;
        if (b.km == null) return -1;
        return a.km - b.km;
      });
    }
    // Valor aumentou: sobe para o topo
    return withDist.sort((a, b) => Number(raisedFrom(b.job) != null) - Number(raisedFrom(a.job) != null));
  }, [openJobs, userPos]);

  async function declineJob(job: Job) {
    if (!confirm(`Recusar o convite "${capitalize(job.title)}"? A oficina será avisada para escolher outro mecânico.`)) return;
    setAccepting(job.id);
    const { error } = await declineInvite(job.id);
    setAccepting(null);
    if (error) { alert('Erro ao recusar: ' + error.message); return; }
    setOpenJobs(prev => prev.filter(j => j.id !== job.id));
  }

  async function acceptJob(job: Job) {
    if (!me) return;
    setAccepting(job.id);
    const scheduled = isScheduled(job);
    const enRoute = scheduled ? null : new Date().toISOString();
    const { data: updated, error } = await supabase
      .from('jobs')
      .update({ mechanic_id: me.id, status: 'assigned', en_route_at: enRoute })
      .eq('id', job.id).eq('status', 'open')
      .select('id');
    if (!error && !updated?.length) {
      // Outro mecânico aceitou antes, ou a oficina cancelou o convite
      setOpenJobs(prev => prev.filter(j => j.id !== job.id));
      alert(job.audience === 'invite' ? 'Esse convite não está mais disponível.' : 'Esse job já foi aceito por outro mecânico.');
    } else if (!error) {
      setOpenJobs(prev => prev.filter(j => j.id !== job.id));
      if (scheduled) {
        nav('/mecanico/agenda');
      } else {
        setActiveJobs(prev => [{
          ...job, mechanic_id: me.id, status: 'assigned', en_route_at: enRoute,
          accepted_at: new Date().toISOString(), // o banco grava o mesmo via trigger
        }, ...prev]);
      }
    }
    setAccepting(null);
  }


  const online = !!me?.is_available;
  const missingPix = !!me && !(me as any).pix_key;

  return (
    <MechanicLayout>
      {/* ── Toasts de novo job ── */}
      <div className="fixed top-3 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 w-full max-w-sm px-3 pointer-events-none">
        {toasts.map(t => {
          const cap = (t.job.price_per_hour ?? 0) * (t.job.max_hours ?? 1);
          return (
            <div
              key={t.id}
              role="status"
              className="pointer-events-auto bg-brand-500 text-white rounded-2xl pl-4 pr-1 py-2 shadow-2xl flex items-center gap-3 animate-slide-down"
            >
              <IconWrench className="w-6 h-6 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-bold uppercase tracking-wide opacity-90">
                  {t.job.audience === 'invite' ? 'Convite para você' : 'Nova demanda'}
                </div>
                <div className="font-bold truncate">{capitalize(t.job.title)}</div>
                <div className="text-xs opacity-90">
                  R$ {formatMoney(mechanicNet(cap))} no seu PIX · {previstas(t.job)}
                </div>
              </div>
              <button
                onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))}
                aria-label="Fechar aviso"
                className="h-11 w-11 grid place-items-center shrink-0 opacity-80 active:opacity-100"
              >
                <IconX className="w-5 h-5" />
              </button>
            </div>
          );
        })}
      </div>

      <div className="px-4 pt-4 space-y-5">
        {/* Banners do admin (novidades, promoções) */}
        <PanelSlot panel="mecanico" at="topo" />

        {/* ── Status: a ação mais importante do dia, compacta e sempre no topo ── */}
        <div className={`rounded-2xl border px-4 py-3 flex items-center gap-3 transition-colors ${
          online ? 'bg-signal-500/10 border-signal-500/30' : 'bg-steel-800 border-steel-700'
        }`}>
          <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${online ? 'bg-signal-500' : 'bg-steel-400'}`} />
          <div className="flex-1 min-w-0">
            <div className="font-bold text-white leading-tight">{online ? 'Você está online' : 'Você está offline'}</div>
            <div className="text-xs text-steel-300 mt-0.5">
              {online ? 'Recebendo novos jobs' : 'Fique online para ver e aceitar jobs'}
            </div>
          </div>
          <button
            onClick={toggleAvailable}
            role="switch"
            aria-checked={online}
            aria-label="Disponível para jobs"
            className={`relative w-14 h-8 rounded-full shrink-0 transition ${online ? 'bg-signal-500' : 'bg-steel-600'}`}
          >
            <span className={`absolute top-1 left-1 h-6 w-6 rounded-full bg-white shadow transition-transform ${online ? 'translate-x-6' : ''}`} />
          </button>
        </div>

        <PanelSlot panel="mecanico" at="apos-status" />

        {/* ── Alerta no celular (push) ── */}
        <PushAlertCard />

        {/* ── Bloqueador: sem PIX não recebe ── */}
        {missingPix && (
          <Link to="/mecanico/perfil"
            className="flex items-center gap-3 rounded-2xl border border-alert-500/50 bg-alert-500/10 p-4 active:bg-alert-500/20 transition">
            <span className="h-10 w-10 rounded-xl bg-alert-500/20 text-alert-500 grid place-items-center shrink-0">
              <IconAlert className="w-5 h-5" />
            </span>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-white leading-tight">Cadastre sua chave PIX</div>
              <div className="text-xs text-steel-300 mt-0.5">Sem ela você não recebe o repasse dos jobs.</div>
            </div>
            <IconChevronRight className="w-5 h-5 text-steel-300 shrink-0" />
          </Link>
        )}

        {/* ── Convites diretos: a oficina escolheu você ── */}
        {invites.length > 0 && (
          <section className="space-y-2">
            <SectionTitle>{invites.length === 1 ? 'Convite para você' : `${invites.length} convites para você`}</SectionTitle>
            {invites.map(j => {
              const net = mechanicNet((j.price_per_hour ?? 0) * (j.max_hours ?? 1));
              const ws = j.workshop;
              return (
                <article key={j.id} className="rounded-2xl bg-steel-800 border-2 border-brand-500/60 overflow-hidden">
                  <Link to={`/mecanico/job/${j.id}`} className="block p-4 active:bg-steel-700/60 transition">
                    <div className="mb-2 inline-flex items-center gap-1 bg-brand-500/15 text-brand-300 text-xs font-bold px-2 py-0.5 rounded-full">
                      <IconStar className="w-3 h-3" filled /> {ws?.business_name ?? 'Uma oficina'} escolheu você
                    </div>
                    <div><RaisedBadge j={j} /></div>
                    <div className="flex justify-between items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-white leading-snug line-clamp-2">{capitalize(j.title)}</div>
                        {j.description && <div className="text-sm text-steel-300 line-clamp-2 mt-1">{jobSummary(j.description) ?? j.description}</div>}
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-signal-500 font-bold font-display text-2xl leading-tight">R$ {formatMoney(net)}</div>
                        <div className="text-xs text-steel-300">no seu PIX</div>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1.5 text-xs text-steel-300">
                      {ws && (
                        <span className="inline-flex items-center gap-1">
                          <IconMapPin className="w-3.5 h-3.5" /> {ws.city}{ws.state ? `/${ws.state}` : ''}
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1"><IconClock className="w-3.5 h-3.5" /> {previstas(j)}</span>
                      {j.scheduled_at && (
                        <span className="inline-flex items-center gap-1"><IconCalendar className="w-3.5 h-3.5" /> {formatScheduled(j.scheduled_at)}</span>
                      )}
                    </div>
                  </Link>
                  <div className="px-4 pb-4 space-y-2">
                    <AcceptDeadlineHint job={j} />
                    <div className="grid grid-cols-2 gap-2">
                      <button onClick={() => declineJob(j)} disabled={accepting === j.id}
                        className="btn-ghost h-12 text-base disabled:opacity-50">
                        Recusar
                      </button>
                      <button onClick={() => acceptJob(j)} disabled={accepting === j.id}
                        className="btn-primary h-12 text-base disabled:opacity-50">
                        {accepting === j.id ? '…' : 'Aceitar'}
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </section>
        )}

        {/* ── Em andamento ── */}
        {activeJobs.length > 0 && (
          <section className="space-y-2">
            <SectionTitle>Em andamento</SectionTitle>
            {activeJobs.map(j => {
              const enRoute = j.status === 'assigned';
              return (
                <Link key={j.id} to={`/mecanico/job/${j.id}/tracking`}
                  className="block rounded-2xl bg-brand-500 text-white p-4 shadow-brand active:scale-[0.99] transition">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold bg-white/20 rounded-full px-2.5 py-1">
                        {enRoute ? <IconNavigation className="w-3.5 h-3.5" /> : <IconWrench className="w-3.5 h-3.5" />}
                        {enRoute ? 'A caminho' : 'Em serviço'}
                      </span>
                      <div className="font-bold text-lg leading-snug mt-2 line-clamp-2">{capitalize(j.title)}</div>
                      <div className="text-sm text-white/80 mt-1 flex items-center gap-1">
                        <IconClock className="w-3.5 h-3.5" /> {previstas(j)}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs text-white/80">você recebe</div>
                      <div className="text-2xl font-bold font-display leading-tight">
                        R$ {formatMoney(mechanicNet((j.price_per_hour ?? 0) * (j.max_hours ?? 1)))}
                      </div>
                    </div>
                  </div>
                  <ArrivalCountdown job={j} tone="onBrand" className="mt-3" />
                  <div className="mt-3 pt-3 border-t border-white/20 flex items-center justify-between text-sm font-semibold">
                    Abrir mapa e chat
                    <IconChevronRight className="w-5 h-5" />
                  </div>
                </Link>
              );
            })}
          </section>
        )}

        <PanelSlot panel="mecanico" at="apos-andamento" />

        {/* ── Avaliações pendentes ── */}
        {pendingRatings.length > 0 && (
          <section className="space-y-2">
            <SectionTitle>
              {pendingRatings.length === 1 ? 'Avalie a oficina' : `${pendingRatings.length} oficinas para avaliar`}
            </SectionTitle>
            <div className="rounded-2xl bg-steel-800 border border-steel-700 divide-y divide-steel-700">
              {pendingRatings.map(j => (
                <button
                  key={j.id}
                  onClick={() => { setRatingJob(j); setStars(0); setRatingNote(''); }}
                  className="w-full min-h-[56px] px-4 py-3 flex items-center gap-3 text-left active:bg-steel-700 transition first:rounded-t-2xl last:rounded-b-2xl"
                >
                  <IconBuilding className="w-5 h-5 text-steel-300 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm text-white truncate">{j.workshop_name ?? 'Oficina'}</div>
                    <div className="text-xs text-steel-300 truncate">{capitalize(j.title)}</div>
                  </div>
                  <span className="inline-flex items-center gap-1 text-brand-400 text-sm font-bold shrink-0">
                    <IconStar className="w-4 h-4" /> Avaliar
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* ── Jobs disponíveis ── */}
        <section className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <SectionTitle>
              Jobs disponíveis{!loading && decoratedJobs.length > 0 ? ` · ${decoratedJobs.length}` : ''}
            </SectionTitle>
            {/* Lista ↔ Mapa (o Mapa saiu da barra de baixo) */}
            <div className="flex rounded-xl bg-steel-800 border border-steel-700 p-0.5 text-sm font-semibold">
              <span className="h-9 px-3 rounded-lg bg-steel-700 text-white grid place-items-center">Lista</span>
              <Link to="/mecanico/mapa" className="h-9 px-3 rounded-lg text-steel-300 flex items-center gap-1.5 active:bg-steel-700">
                <IconMap className="w-4 h-4" /> Mapa
              </Link>
            </div>
          </div>

          {loading ? <Skeleton /> : decoratedJobs.length === 0 ? (
            <div className="rounded-2xl bg-steel-800 border border-steel-700 text-center px-6 py-10">
              <IconWrench className="w-8 h-8 text-steel-400 mx-auto" />
              <div className="font-semibold text-white mt-3">Nenhum job aberto agora</div>
              <div className="text-sm text-steel-300 mt-1">
                {online
                  ? 'Quando chegar um novo, avisamos aqui e no seu celular, mesmo com o app fechado.'
                  : 'Fique online para ser avisado quando chegar um novo.'}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {decoratedJobs.map(({ job: j, km }) => {
                const gross = (j.price_per_hour ?? 0) * (j.max_hours ?? 1);
                const net = mechanicNet(gross);
                const ws = j.workshop;
                const region = ws ? `${ws.city}${ws.state ? `/${ws.state}` : ''}` : null;
                return (
                  <article key={j.id} className="rounded-2xl bg-steel-800 border border-steel-700 overflow-hidden">
                    <Link to={`/mecanico/job/${j.id}`} className="block p-4 active:bg-steel-700/60 transition">
                      <div className="flex flex-wrap gap-1.5">
                        {j.audience === 'favorites' && (
                          <div className="mb-2 inline-flex items-center gap-1 bg-brand-500/15 text-brand-300 text-xs font-bold px-2 py-0.5 rounded-full">
                            <IconStar className="w-3 h-3" filled /> Convite preferido
                          </div>
                        )}
                        <RaisedBadge j={j} />
                      </div>
                      <div className="flex justify-between items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-white leading-snug line-clamp-2">{capitalize(j.title)}</div>
                          {j.description && (
                            <div className="text-sm text-steel-300 line-clamp-2 mt-1">{jobSummary(j.description) ?? j.description}</div>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-signal-500 font-bold font-display text-2xl leading-tight">R$ {formatMoney(net)}</div>
                          <div className="text-xs text-steel-300">no seu PIX</div>
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1.5 text-xs text-steel-300">
                        {region && (
                          <span className="inline-flex items-center gap-1">
                            <IconMapPin className="w-3.5 h-3.5" /> {region}
                            {km != null && <strong className="text-brand-400 font-semibold">· {formatDistance(km)}</strong>}
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1">
                          <IconClock className="w-3.5 h-3.5" /> {previstas(j)}
                        </span>
                        {ws && (ws.rating > 0 || ws.total_jobs > 0) && (
                          <span className="inline-flex items-center gap-1">
                            <IconStar className="w-3.5 h-3.5 text-pending-500" filled /> {ws.rating.toFixed(1)}
                            <span className="text-steel-400">({ws.total_jobs})</span>
                          </span>
                        )}
                      </div>

                      {j.scheduled_at && (
                        <div className={`mt-2 inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${
                          isScheduled(j) ? 'bg-pending-500/15 text-pending-500' : 'bg-steel-700 text-steel-300'
                        }`}>
                          <IconCalendar className="w-3.5 h-3.5" />
                          {isScheduled(j) ? 'Agendado: ' : ''}{formatScheduled(j.scheduled_at)}
                        </div>
                      )}
                    </Link>
                    <div className="px-4 pb-4 space-y-2">
                      <AcceptDeadlineHint job={j} />
                      <button
                        onClick={() => acceptJob(j)}
                        disabled={accepting === j.id || !online}
                        className="btn-primary w-full h-12 text-base disabled:opacity-50"
                      >
                        {accepting === j.id ? 'Aceitando…' : !online ? 'Fique online para aceitar' : 'Aceitar job'}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <PanelSlot panel="mecanico" at="apos-disponiveis" />

        {/* ── Seu desempenho ── */}
        <section className="space-y-2">
          <SectionTitle>Seu desempenho</SectionTitle>
          <div className="rounded-2xl bg-steel-800 border border-steel-700 grid grid-cols-3 divide-x divide-steel-700 py-3">
            <Stat n={me?.total_jobs ?? 0} l="Jobs feitos" />
            <Stat n={(me?.rating ?? 0).toFixed(1)} l="Sua nota" />
            <Stat n={`R$ ${me?.hourly_rate?.toFixed(0) ?? 0}`} l="Por hora" />
          </div>
        </section>

        {/* ── Atalhos secundários: indicações + como você recebe ── */}
        <div className="rounded-2xl bg-steel-800 border border-steel-700 divide-y divide-steel-700">
          {(me as any)?.is_embaixador && (
            <Link to="/mecanico/embaixador"
              className="min-h-[56px] px-4 py-3 flex items-center gap-3 active:bg-steel-700 transition rounded-t-2xl">
              <span className="h-9 w-9 rounded-xl bg-brand-500/15 text-brand-400 grid place-items-center shrink-0">
                <IconGift className="w-5 h-5" />
              </span>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm text-white">Minhas indicações</div>
                <div className="text-xs text-steel-300">Quem você indicou e quanto já ganhou</div>
              </div>
              <IconChevronRight className="w-5 h-5 text-steel-400 shrink-0" />
            </Link>
          )}
          <details className="group">
            <summary className="min-h-[56px] px-4 py-3 flex items-center gap-3 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
              <span className="h-9 w-9 rounded-xl bg-signal-500/15 text-signal-500 grid place-items-center shrink-0">
                <IconInfo className="w-5 h-5" />
              </span>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm text-white">Como você recebe</div>
                <div className="text-xs text-steel-300">No seu PIX, depois que a oficina confirma</div>
              </div>
              <IconChevronDown className="w-5 h-5 text-steel-400 shrink-0 transition-transform group-open:rotate-180" />
            </summary>
            <ol className="px-4 pb-4 space-y-3">
              {[
                ['Aceita o job', 'O valor mostrado é o que cai no seu PIX — sem letra miúda.'],
                ['Faz o serviço', 'O pagamento da oficina passa pela plataforma — você não precisa cobrar ninguém.'],
                ['Recebe no PIX', 'Depois que a oficina confirma a conclusão, o valor vai para a sua chave PIX.'],
              ].map(([t, d], i) => (
                <li key={t} className="flex gap-3">
                  <span className="h-6 w-6 rounded-full bg-steel-700 text-white text-xs font-bold grid place-items-center shrink-0">{i + 1}</span>
                  <div>
                    <div className="text-sm font-semibold text-white">{t}</div>
                    <div className="text-xs text-steel-300">{d}</div>
                  </div>
                </li>
              ))}
            </ol>
          </details>
        </div>
        <PanelSlot panel="mecanico" at="fim" />
      </div>

      {/* Modal "Você ganhou R$ X" pós-finalização */}
      {justEarned && (
        <div className="fixed inset-0 bg-steel-900/85 flex items-end sm:items-center justify-center p-4 z-50">
          <div className="bg-steel-800 border border-signal-500/40 rounded-2xl p-6 max-w-sm w-full text-center space-y-4">
            <span className="h-14 w-14 rounded-full bg-signal-500/15 text-signal-500 grid place-items-center mx-auto">
              <IconDollar className="w-7 h-7" />
            </span>
            <div>
              <div className="text-xs uppercase tracking-wide text-signal-500 font-bold">Serviço concluído</div>
              <div className="text-sm text-steel-300 mt-1 line-clamp-2">{justEarned.jobTitle}</div>
            </div>
            <div className="bg-steel-900/60 rounded-xl py-4 border border-steel-700">
              <div className="text-xs uppercase tracking-wide text-steel-300 font-bold">Seu repasse</div>
              <div className="text-4xl font-bold text-signal-500 font-display mt-1">
                + R$ {justEarned.net.toFixed(2).replace('.', ',')}
              </div>
              <div className="text-xs text-steel-300 mt-1">crédito disponível no app</div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setJustEarned(null)} className="btn-ghost flex-1 h-12">Fechar</button>
              <Link to="/mecanico/ganhos" onClick={() => setJustEarned(null)} className="btn-primary flex-1 h-12">
                Ver ganhos
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Modal avaliação oficina — abre de baixo, perto do polegar */}
      {ratingJob && (
        <div className="fixed inset-0 bg-steel-900/80 flex items-end sm:items-center justify-center p-4 z-50">
          <div className="bg-steel-800 border border-steel-700 rounded-2xl p-6 max-w-sm w-full space-y-5">
            <div>
              <h3 className="text-lg font-bold text-white">Como foi a oficina?</h3>
              <p className="text-sm text-steel-300 mt-1">{ratingJob.workshop_name ?? 'Oficina'} · {ratingJob.title}</p>
            </div>
            <div className="flex justify-center gap-1" role="radiogroup" aria-label="Nota">
              {[1, 2, 3, 4, 5].map(n => (
                <button key={n} type="button"
                  role="radio" aria-checked={stars === n} aria-label={`${n} estrela${n > 1 ? 's' : ''}`}
                  onClick={() => setStars(n)}
                  className={`h-12 w-12 grid place-items-center rounded-xl active:scale-90 transition ${
                    n <= stars ? 'text-pending-500' : 'text-steel-500'
                  }`}>
                  <IconStar className="w-8 h-8" filled={n <= stars} />
                </button>
              ))}
            </div>
            {stars > 0 && (
              <p className="text-center text-sm font-semibold text-brand-400">
                {['', 'Ruim', 'Regular', 'Bom', 'Ótimo', 'Excelente'][stars]}
              </p>
            )}
            <textarea
              className="input !bg-steel-900 !text-white !border-steel-600 resize-none text-base"
              rows={2} placeholder="Comentário opcional…"
              value={ratingNote} onChange={e => setRatingNote(e.target.value)}
            />
            <div className="flex gap-3">
              <button onClick={() => setRatingJob(null)} className="btn-ghost flex-1 h-12">Agora não</button>
              <button onClick={submitRating} disabled={submitting || stars === 0}
                className="btn-primary flex-1 h-12 disabled:opacity-50">
                {submitting ? 'Enviando…' : 'Enviar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </MechanicLayout>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-sm font-bold text-steel-200">{children}</h2>;
}

function Stat({ n, l }: { n: string | number; l: string }) {
  return (
    <div className="text-center px-2">
      <div className="text-xl font-bold font-display text-white">{n}</div>
      <div className="text-xs text-steel-300 mt-0.5">{l}</div>
    </div>
  );
}
function Skeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map(i => <div key={i} className="rounded-2xl bg-steel-800 border border-steel-700 h-40 animate-pulse-soft" />)}
    </div>
  );
}

/** Oficina às vezes digita tudo minúsculo — "fazer motor…" vira "Fazer motor…" */
function capitalize(s: string | null | undefined) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}
/** "2h previstas" — ou "Preço fechado" na demanda pelo serviço sem tempo informado */
function previstas(j: Parameters<typeof hoursLabel>[0]) {
  return hoursLabel(j) ?? 'Preço fechado';
}

/** A oficina aumentou o valor (24 h): mostra quanto era, no líquido que o mecânico recebe */
function RaisedBadge({ j }: { j: Job }) {
  const from = raisedFrom(j);
  if (from == null) return null;
  return (
    <div className="mb-2 inline-flex items-center gap-1 bg-signal-500/15 text-signal-400 text-xs font-bold px-2 py-0.5 rounded-full">
      💰 Valor aumentou · era R$ {formatMoney(mechanicNet(from))}
    </div>
  );
}
