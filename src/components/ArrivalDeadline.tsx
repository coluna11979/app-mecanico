import { useEffect, useRef, useState } from 'react';
import type { Job } from '@/types/database';
import { supabase } from '@/lib/supabase';
import { playChatAlert } from '@/lib/alertSound';
import {
  ARRIVAL_WARNING_MS, arrivalDeadline, formatDeadline, formatRemaining, previewDeadline,
} from '@/lib/arrivalDeadline';

/** Re-renderiza periodicamente para a contagem regressiva andar. */
function useNow(intervalMs = 15000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

/**
 * ANTES do aceite — o mecânico fica ciente do prazo que vai assumir.
 * Tema escuro (telas do mecânico).
 */
export function AcceptDeadlineHint({ job, className = '' }: {
  job: Pick<Job, 'created_at' | 'scheduled_at'>;
  className?: string;
}) {
  useNow(30000);
  const deadline = previewDeadline(job);
  return (
    <div className={`text-[11px] text-steel-300 bg-steel-900/60 border border-steel-700 rounded-lg px-2.5 py-1.5 leading-snug ${className}`}>
      ⏱ {job.scheduled_at
        ? <>Chegue até <strong className="text-white">{formatDeadline(deadline)}</strong> (horário marcado + 30 min de tolerância). A oficina pode cancelar sem multa até 2h antes do horário.</>
        : <>Ao aceitar, você tem <strong className="text-white">45 min</strong> para chegar (até {formatDeadline(deadline)}).</>}
      {' '}Depois disso a oficina pode cancelar sem multa.
    </div>
  );
}

/**
 * DEPOIS do aceite — contagem regressiva até o prazo de chegada.
 * `tone="onBrand"` para cards laranja; padrão para fundo escuro.
 */
export function ArrivalCountdown({ job, tone = 'dark', className = '', chatHint = true }: {
  job: Job;
  tone?: 'dark' | 'onBrand';
  className?: string;
  /** Lembrete de avisar pelo chat quando o prazo está perto (a tela do serviço usa ArrivalDelayCard no lugar) */
  chatHint?: boolean;
}) {
  const now = useNow();
  if (job.status !== 'assigned') return null;
  const deadline = arrivalDeadline(job);
  if (!deadline) return null;

  const left = deadline.getTime() - now;
  // Agendado para daqui a mais de 1 dia: ainda não precisa de contagem
  if (left > 24 * 60 * 60 * 1000) return null;

  if (left <= 0) {
    return (
      <div className={`text-xs font-semibold rounded-lg px-2.5 py-1.5 leading-snug ${
        tone === 'onBrand' ? 'bg-white text-alert-700' : 'bg-alert-500/15 text-alert-300 border border-alert-500/40'
      } ${className}`}>
        ⚠️ Prazo de chegada passou ({formatDeadline(deadline)}). A oficina pode cancelar sem multa — avise pelo chat se estiver chegando.
      </div>
    );
  }

  const urgent = left <= ARRIVAL_WARNING_MS;
  return (
    <div className={`text-xs rounded-lg px-2.5 py-1.5 leading-snug ${
      tone === 'onBrand'
        ? 'bg-white/15 text-white'
        : urgent
          ? 'bg-pending-500/15 text-pending-300 border border-pending-500/40'
          : 'bg-steel-900/60 text-steel-300 border border-steel-700'
    } ${className}`}>
      ⏱ Chegue até <strong>{formatDeadline(deadline)}</strong> · faltam <strong>{formatRemaining(left)}</strong>
      {urgent && chatHint && <> · Vai atrasar? Avise a oficina pelo chat.</>}
    </div>
  );
}

const DELAY_MESSAGES = [
  { label: '🚗 Estou a caminho', text: 'Estou a caminho, já chego.' },
  { label: '🚦 Peguei trânsito', text: 'Peguei trânsito, mas estou a caminho. Chego em breve.' },
];

/**
 * Prazo de chegada perto (ou vencido): lembra o mecânico de manter contato com a oficina,
 * com mensagem pronta de um toque. É só aviso: a regra do prazo não muda.
 */
export function ArrivalDelayCard({ job, senderId, onOpenChat }: {
  job: Job;
  senderId: string | undefined;
  onOpenChat: () => void;
}) {
  const now = useNow();
  const [sending, setSending] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const alerted = useRef(false);

  const deadline = job.status === 'assigned' ? arrivalDeadline(job) : null;
  const left = deadline ? deadline.getTime() - now : null;
  const show = left !== null && left <= ARRIVAL_WARNING_MS;

  // Toca e vibra uma vez, para quem está com o celular na mão, mas sem olhar a tela
  useEffect(() => {
    if (!show || alerted.current) return;
    alerted.current = true;
    playChatAlert();
    try { navigator.vibrate?.([200, 100, 200]); } catch { /* aparelho sem vibração */ }
  }, [show]);

  if (!show || left === null || !deadline) return null;

  async function send(text: string) {
    if (!senderId || sending) return;
    setSending(text);
    setFailed(false);
    const { error } = await supabase.from('messages').insert({ job_id: job.id, sender_id: senderId, content: text });
    setSending(null);
    if (error) setFailed(true);
    else setSent(text);
  }

  const late = left <= 0;
  return (
    <div className={`rounded-2xl border p-4 space-y-3 ${late ? 'bg-alert-500/15 border-alert-500/40' : 'bg-pending-500/15 border-pending-500/40'}`}>
      <div>
        <div className="font-bold text-sm">
          {late ? '⚠️ Seu prazo de chegada passou' : `⏰ Faltam ${formatRemaining(left)} para o seu prazo de chegada`}
        </div>
        <p className="text-xs mt-1 leading-relaxed opacity-90">
          {late
            ? 'A oficina já pode cancelar sem multa e o atraso fica registrado. Se está chegando, avise agora pelo chat.'
            : `Chegue até ${formatDeadline(deadline)}. Vai atrasar? Avise a oficina pelo chat: mantendo contato, fica mais fácil ela esperar você.`}
        </p>
      </div>
      {sent ? (
        <div className="text-xs font-semibold text-signal-400">✅ Mensagem enviada: "{sent}"</div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {DELAY_MESSAGES.map(m => (
            <button key={m.text} type="button" onClick={() => send(m.text)} disabled={!!sending || !senderId}
              className="min-h-[44px] rounded-xl bg-steel-800 border border-steel-700 text-white text-xs font-semibold px-2 touch-manipulation disabled:opacity-60">
              {sending === m.text ? 'Enviando…' : m.label}
            </button>
          ))}
        </div>
      )}
      {failed && <div className="text-xs text-alert-300">Não deu para enviar. Tente de novo ou abra o chat.</div>}
      <button type="button" onClick={onOpenChat}
        className="w-full min-h-[44px] rounded-xl border border-steel-600 text-xs font-semibold touch-manipulation">
        💬 Abrir o chat e escrever
      </button>
    </div>
  );
}
