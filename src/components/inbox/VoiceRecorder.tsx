import { useEffect, useRef, useState } from 'react';
import { toast } from '@/components/ui/Toast';

/** Formato que o navegador grava (Chrome: webm/opus; Firefox e Safari: ogg ou mp4) */
function pickMime() {
  const options = ['audio/ogg;codecs=opus', 'audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'];
  return options.find(t => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)) ?? '';
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const MAX_SECONDS = 5 * 60;

/** Barra de gravação: aparece no lugar da caixa de mensagem enquanto grava */
export default function VoiceRecorder({ onDone, onCancel }: {
  onDone: (file: File) => void; onCancel: () => void;
}) {
  const [seconds, setSeconds] = useState(0);
  const [ready, setReady] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const cancelled = useRef(false);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch {
        toast.error('Sem acesso ao microfone. Libere o microfone para este site no navegador.');
        onCancel();
        return;
      }
      const mime = pickMime();
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      recorder.current = rec;
      rec.ondataavailable = e => { if (e.data.size) chunks.current.push(e.data); };
      rec.onstop = () => {
        stream?.getTracks().forEach(t => t.stop());
        if (cancelled.current) return;
        const type = (rec.mimeType || mime || 'audio/webm').split(';')[0];
        const ext = type.includes('ogg') ? 'ogg' : type.includes('mp4') ? 'm4a' : 'webm';
        const blob = new Blob(chunks.current, { type });
        if (blob.size < 1500) { toast.info('Áudio muito curto'); onCancel(); return; }
        onDone(new File([blob], `audio-${Date.now()}.${ext}`, { type }));
      };
      rec.start(250);
      setReady(true);
      timer = setInterval(() => setSeconds(s => {
        if (s + 1 >= MAX_SECONDS) rec.state === 'recording' && rec.stop();
        return s + 1;
      }), 1000);
    })();
    return () => {
      if (timer) clearInterval(timer);
      if (recorder.current?.state === 'recording') { cancelled.current = true; recorder.current.stop(); }
      stream?.getTracks().forEach(t => t.stop());
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function stop(send: boolean) {
    cancelled.current = !send;
    if (recorder.current?.state === 'recording') recorder.current.stop();
    if (!send) onCancel();
  }

  return (
    <div className="flex items-center gap-2 flex-1">
      <button type="button" onClick={() => stop(false)} className="h-10 w-10 shrink-0 rounded-xl text-lg text-steel-500 hover:bg-steel-100 grid place-items-center" title="Descartar">🗑️</button>
      <div className="flex-1 flex items-center gap-2 rounded-xl bg-alert-500/5 border border-alert-500/20 px-3 h-10">
        <span className={`h-2.5 w-2.5 rounded-full bg-alert-500 ${ready ? 'animate-pulse' : 'opacity-30'}`} />
        <span className="text-sm font-semibold text-steel-700 tabular-nums">{fmt(seconds)}</span>
        <span className="text-xs text-steel-500">{ready ? 'Gravando…' : 'Abrindo o microfone…'}</span>
      </div>
      <button type="button" onClick={() => stop(true)} disabled={!ready} className="btn-primary h-10 !px-4 shrink-0 disabled:opacity-40" title="Enviar áudio">➤</button>
    </div>
  );
}
