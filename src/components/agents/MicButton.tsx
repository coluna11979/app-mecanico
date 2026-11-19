import { useEffect, useRef, useState } from 'react';
import { toast } from '@/components/ui/Toast';
import { supabase } from '@/lib/supabase';

const MAX_SECONDS = 120;
/** Formato que o navegador grava (Chrome/Android: webm; iPhone/Safari: mp4) */
function pickMime() {
  const opts = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
  if (typeof MediaRecorder === 'undefined') return null;
  return opts.find((m) => MediaRecorder.isTypeSupported?.(m)) ?? '';
}

/**
 * Botão de falar: toca para gravar, toca de novo para parar. O áudio vai para a transcrição (Soniox, no servidor)
 * e o texto volta para o campo, para conferir antes de enviar.
 */
export default function MicButton({ onText, disabled }: { onText: (text: string) => void; disabled?: boolean }) {
  const [state, setState] = useState<'idle' | 'rec' | 'busy'>('idle');
  const [secs, setSecs] = useState(0);
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<number | null>(null);
  const supported = typeof window !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && pickMime() !== null;

  useEffect(() => () => { if (timer.current) window.clearInterval(timer.current); rec.current?.stream.getTracks().forEach((t) => t.stop()); }, []);

  async function start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = pickMime() || undefined;
      const r = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunks.current = [];
      r.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
      r.onstop = () => { stream.getTracks().forEach((t) => t.stop()); upload(r.mimeType || mime || 'audio/webm'); };
      r.start();
      rec.current = r;
      setSecs(0);
      setState('rec');
      timer.current = window.setInterval(() => setSecs((s) => {
        if (s + 1 >= MAX_SECONDS) stop();
        return s + 1;
      }), 1000);
    } catch {
      toast.error('Não consegui usar o microfone. Libere o acesso ao microfone no navegador.');
    }
  }

  function stop() {
    if (timer.current) { window.clearInterval(timer.current); timer.current = null; }
    if (rec.current?.state === 'recording') rec.current.stop();
  }

  async function upload(mime: string) {
    setState('busy');
    try {
      const blob = new Blob(chunks.current, { type: mime });
      if (blob.size < 1500) { setState('idle'); return toast.error('Áudio muito curto. Segure um pouco mais.'); }
      const ext = mime.includes('mp4') ? 'm4a' : mime.includes('ogg') ? 'ogg' : 'webm';
      const fd = new FormData();
      fd.append('audio', blob, `fala.${ext}`);
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/transcribe-audio`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session?.access_token ?? ''}`, apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string },
        body: fd,
      });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.ok) throw new Error(j?.error ?? 'Não consegui transcrever o áudio');
      if (!j.text) toast.error('Não entendi o áudio. Tente falar mais perto do celular.');
      else onText(j.text as string);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não consegui transcrever o áudio');
    } finally {
      setState('idle');
    }
  }

  if (!supported) return null;
  const mm = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
  return (
    <button type="button" disabled={disabled || state === 'busy'} onClick={state === 'rec' ? stop : start}
      aria-label={state === 'rec' ? 'Parar e transcrever' : 'Falar em vez de digitar'}
      title={state === 'rec' ? 'Parar e transcrever' : 'Falar em vez de digitar'}
      className={`shrink-0 min-h-[44px] min-w-[44px] px-3 rounded-xl grid place-items-center text-sm font-semibold transition disabled:opacity-50 ${
        state === 'rec' ? 'bg-alert-600 text-white animate-pulse' : 'bg-steel-100 text-steel-700 hover:bg-steel-200'}`}>
      {state === 'busy' ? '…' : state === 'rec' ? <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-white" />{mm}</span> : '🎤'}
    </button>
  );
}
