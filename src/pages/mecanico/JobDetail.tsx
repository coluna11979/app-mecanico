import { useEffect, useState } from 'react';
import JobDescription from '@/components/JobDescription';
import { useNavigate, useParams, Link } from 'react-router-dom';
import MechanicLayout from '@/components/layout/MechanicLayout';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { formatBRL, mechanicNet, hoursLabel } from '@/lib/payment';
import { isScheduled, formatScheduled } from '@/lib/scheduling';
import { WorkshopReviews } from '@/components/WorkshopReviews';
import { AcceptDeadlineHint, ArrivalCountdown } from '@/components/ArrivalDeadline';
import { declineInvite, isPendingInvite } from '@/lib/jobInvite';
import type { Job, Workshop } from '@/types/database';

export default function MechanicJobDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const nav = useNavigate();
  const [job, setJob] = useState<Job | null>(null);
  const [shop, setShop] = useState<Workshop | null>(null);
  const [busy, setBusy] = useState(false);
  const [showReviews, setShowReviews] = useState(false);
  const [myMechanicId, setMyMechanicId] = useState<string | null>(null);
  const [declining, setDeclining] = useState(false);
  const [declineReason, setDeclineReason] = useState('');

  useEffect(() => { if (id) load(); }, [id]);

  async function load() {
    const { data: j } = await supabase.from('jobs').select('*').eq('id', id).maybeSingle();
    setJob(j as Job);
    if (user) {
      const { data: m } = await supabase.from('mechanics').select('id').eq('profile_id', user.id).maybeSingle();
      setMyMechanicId(m?.id ?? null);
    }
    if (j) {
      const { data: w } = await supabase.from('workshops').select('*').eq('id', j.workshop_id).maybeSingle();
      setShop(w as Workshop);
    }
  }

  // Já aceitei esse job? (agendamento aceito aguardando o dia)
  const isMine = !!job?.mechanic_id && job.mechanic_id === myMechanicId;
  // Convite direto pra mim, ainda sem resposta
  const isInvite = !!job && isPendingInvite(job) && !!myMechanicId && job.invited_mechanic_id === myMechanicId;

  async function decline() {
    if (!job) return;
    setBusy(true);
    const { error } = await declineInvite(job.id, declineReason);
    setBusy(false);
    if (error) { alert('Erro ao recusar: ' + error.message); return; }
    nav('/mecanico/dashboard');
  }

  async function startDeparture() {
    if (!job) return;
    setBusy(true);
    await supabase.from('jobs').update({ en_route_at: new Date().toISOString() }).eq('id', job.id);
    setBusy(false);
    nav(`/mecanico/job/${job.id}/tracking`);
  }

  async function dropJob() {
    if (!job) return;
    const reason = prompt('Por que você quer desistir desse agendamento?\n(Desistências repetidas afetam sua reputação)');
    if (!reason || !reason.trim()) return;
    setBusy(true);
    const { data, error } = await supabase.functions.invoke('cancel-job', {
      body: { job_id: job.id, reason: reason.trim(), cancelled_by: 'mechanic' },
    });
    setBusy(false);
    if (error || (data as any)?.error) {
      alert('Erro ao desistir: ' + ((data as any)?.error ?? error?.message ?? 'tente novamente'));
      return;
    }
    nav('/mecanico/agenda');
  }

  async function accept() {
    if (!job || !user) return;
    setBusy(true);
    const { data: m } = await supabase.from('mechanics').select('id').eq('profile_id', user.id).maybeSingle();
    if (!m) { setBusy(false); return; }
    const scheduled = isScheduled(job);
    const { data: updated, error } = await supabase.from('jobs').update({
      status: 'assigned',
      mechanic_id: m.id,
      // Imediato já sai a caminho; agendado fica na Agenda (en_route_at null)
      en_route_at: scheduled ? null : new Date().toISOString(),
    }).eq('id', job.id).eq('status', 'open') // outro mecânico pode ter aceitado antes
      .select('id');
    if (error || !updated?.length) {
      setBusy(false);
      alert(error ? 'Erro ao aceitar: ' + error.message
        : job.audience === 'invite' ? 'Esse convite não está mais disponível.' : 'Esse job já foi aceito por outro mecânico.');
      nav('/mecanico/dashboard');
      return;
    }
    // Agendado: vai pra Agenda. Imediato: abre o tracking direto.
    nav(scheduled ? '/mecanico/agenda' : `/mecanico/job/${job.id}/tracking`);
  }

  if (!job) return <MechanicLayout><div className="p-6 text-steel-400">Carregando…</div></MechanicLayout>;

  return (
    <MechanicLayout>
      <div className="p-4 space-y-4">
        <Link to="/mecanico/dashboard" className="text-sm text-steel-400">← Voltar</Link>

        {/* Job header */}
        <div className="card !bg-steel-800">
          <div className="text-xs text-brand-400 uppercase tracking-wider font-bold">
            {isMine ? (job.en_route_at ? 'Job em andamento' : 'Agendamento aceito') : isInvite ? 'Convite para você' : 'Job disponível'}
          </div>
          <h1 className="text-2xl font-bold mt-1">{job.title}</h1>
          {/* Organizado por carro: em demanda com vários carros o mecânico não confunde o que é de cada um */}
          <JobDescription text={job.description} />
          {job.scheduled_at && (
            isScheduled(job) ? (
              <div className="mt-3 bg-pending-500/15 border border-pending-500/40 rounded-xl px-3 py-2 flex items-center gap-2 text-sm">
                <span className="text-lg">📅</span>
                <div>
                  <div className="text-pending-300 font-bold">Serviço agendado</div>
                  <div className="text-xs text-steel-400">{formatScheduled(job.scheduled_at)} · não é pra agora</div>
                </div>
              </div>
            ) : (
              <div className="mt-3 flex items-center gap-2 text-sm text-steel-400">
                <span>📅</span>
                <span>{formatScheduled(job.scheduled_at)}</span>
              </div>
            )
          )}
        </div>

        {isInvite && (
          <div className="rounded-2xl border border-brand-500/40 bg-brand-500/10 px-4 py-3 text-sm text-steel-200 leading-snug">
            <strong className="text-white">{shop?.business_name ?? 'A oficina'}</strong> escolheu você para este serviço.
            Aceite ou recuse — o prazo de chegada só começa depois que você aceitar.
          </div>
        )}

        {/* Pacote (sem expor R$/h ou bruto — só horas previstas) */}
        <div className="card !bg-steel-800 text-center">
          <div className="text-[10px] text-steel-500 uppercase tracking-wider">Pacote</div>
          <div className="text-xl font-bold text-white font-display mt-1">{hoursLabel(job) ?? 'Preço fechado'}</div>
          <div className="text-xs text-steel-500 mt-1">valor fechado · não muda com o tempo real</div>
        </div>

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
            <button
              type="button"
              onClick={() => setShowReviews(v => !v)}
              className="mt-3 w-full text-xs text-brand-400 hover:text-brand-300 font-semibold border-t border-steel-700 pt-2 transition"
            >
              {showReviews ? '▲ Ocultar avaliações' : '▼ Ver o que outros mecânicos falaram dessa oficina'}
            </button>
            {showReviews && (
              <div className="mt-2 pt-2 border-t border-steel-700">
                <WorkshopReviews workshopId={shop.id} />
              </div>
            )}
          </div>
        )}

        {/* Você recebe */}
        {(() => {
          const gross = (job.price_per_hour ?? 0) * (job.max_hours ?? 1);
          const net = mechanicNet(gross);
          return (
            <div className="card !bg-steel-800 border border-signal-500/20">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-steel-500 uppercase tracking-wider">Você recebe</div>
                  <div className="text-3xl font-bold text-signal-400 font-display mt-1">R$ {formatBRL(net)}</div>
                  <div className="text-xs text-steel-500 mt-1">no seu PIX</div>
                </div>
                <div className="h-12 w-12 rounded-full bg-signal-500/10 grid place-items-center text-2xl">💸</div>
              </div>
              <div className="text-xs text-steel-600 mt-3">Liberado depois que a oficina confirma a conclusão.</div>
            </div>
          );
        })()}

        {/* Prazo de chegada — o mecânico precisa saber antes e depois do aceite */}
        {isMine
          ? <ArrivalCountdown job={job} />
          : job.status === 'open' && <AcceptDeadlineHint job={job} />}

        {isMine ? (
          // Já aceitei. Se ainda não saí (agendado), posso ir agora ou desistir.
          job.en_route_at ? (
            <Link to={`/mecanico/job/${job.id}/tracking`} className="btn-primary btn-lg w-full text-center">
              Abrir acompanhamento →
            </Link>
          ) : (
            <div className="space-y-2">
              <button onClick={startDeparture} disabled={busy} className="btn-primary btn-lg w-full !bg-signal-500 disabled:opacity-50">
                {busy ? '…' : '🚗 Estou indo agora'}
              </button>
              <button
                onClick={dropJob}
                disabled={busy}
                className="btn-ghost btn-lg w-full !border-alert-500/40 !text-alert-400 disabled:opacity-50"
              >
                {busy ? '…' : 'Desistir do agendamento'}
              </button>
            </div>
          )
        ) : job.status !== 'open' ? (
          <div className="rounded-2xl bg-steel-800 border border-steel-700 px-4 py-4 text-center text-sm text-steel-300">
            {job.status === 'cancelled' ? 'Essa demanda foi cancelada.' : 'Essa demanda não está mais disponível.'}
          </div>
        ) : isInvite && declining ? (
          <div className="rounded-2xl bg-steel-800 border border-steel-700 p-4 space-y-3">
            <div className="font-bold text-white">Recusar o convite?</div>
            <textarea
              className="input !bg-steel-900 !text-white !border-steel-600 resize-none text-base"
              rows={2} placeholder="Motivo (opcional) — ex.: estou longe, sem horário…"
              value={declineReason} onChange={e => setDeclineReason(e.target.value)}
            />
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setDeclining(false)} disabled={busy} className="btn-ghost btn-lg">Voltar</button>
              <button onClick={decline} disabled={busy}
                className="btn-lg rounded-xl font-bold bg-alert-500 text-white disabled:opacity-50">
                {busy ? '…' : 'Recusar'}
              </button>
            </div>
            <div className="text-xs text-steel-400">A oficina é avisada e escolhe outro mecânico. Recusar não gera multa.</div>
          </div>
        ) : isInvite ? (
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setDeclining(true)} disabled={busy} className="btn-ghost btn-lg">Recusar</button>
            <button onClick={accept} disabled={busy} className="btn-primary btn-lg">
              {busy ? '…' : 'Aceitar convite'}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <Link to="/mecanico/dashboard" className="btn-ghost btn-lg">Recusar</Link>
            <button onClick={accept} disabled={busy} className="btn-primary btn-lg">
              {busy ? '…' : isScheduled(job) ? 'Aceitar agendamento' : 'Aceitar job'}
            </button>
          </div>
        )}
      </div>
    </MechanicLayout>
  );
}
