import { useEffect, useState, type ReactNode } from 'react';
import { LiveKitRoom, VideoConference, useIsRecording, useRemoteParticipants } from '@livekit/components-react';
import '@livekit/components-styles';

// Sala de vídeo do treinamento (LiveKit): a mesma para quem apresenta e quem assiste.
// O token já carrega as permissões — convidado não compartilha tela. Entrar não grava:
// só o apresentador liga a gravação, e todos veem o aviso enquanto ela roda.
export default function TrainingRoomView({
  token, wsUrl, title, host, onLeave, onRecord, onScreen, topRight,
}: {
  token: string;
  wsUrl: string;
  title: string;
  host: boolean;
  onLeave: () => void;
  onRecord?: (on: boolean) => Promise<string | null>;
  onScreen?: (identity: string, on: boolean) => Promise<string | null>;
  topRight?: ReactNode;
}) {
  useHideOwnTabFromScreenShare();
  // Nome próprio na aba: fácil de achar e de não confundir com a aba do sistema ao compartilhar
  useEffect(() => {
    const before = document.title;
    document.title = `🎥 Sala: ${title}`;
    return () => { document.title = before; };
  }, [title]);
  return (
    <div data-lk-theme="default" className="h-[100dvh] bg-[#111]">
      <LiveKitRoom
        token={token}
        serverUrl={wsUrl}
        connect
        // Apresentador entra com microfone e câmera; convidado entra mudo e liga se quiser falar
        audio={host}
        video={host}
        onDisconnected={onLeave}
        className="h-full flex flex-col"
      >
        <header className="flex items-center gap-3 px-4 py-2 border-b border-white/10 text-white">
          <h1 className="font-bold truncate flex-1 text-sm sm:text-base">{title}</h1>
          {onScreen && <ScreenGrantControl onScreen={onScreen} />}
          <RecordingControl onRecord={onRecord} />
          {topRight}
        </header>
        <div className="flex-1 min-h-0">
          <VideoConference />
        </div>
      </LiveKitRoom>
    </div>
  );
}

function RecordingControl({ onRecord }: { onRecord?: (on: boolean) => Promise<string | null> }) {
  const recording = useIsRecording();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    if (!onRecord) return;
    setBusy(true); setError(null);
    const err = await onRecord(!recording);
    setBusy(false);
    if (err) setError(err);
  }

  return (
    <>
      {recording && (
        <span className="flex items-center gap-1.5 text-xs font-bold text-red-400 shrink-0">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" /> GRAVANDO
        </span>
      )}
      {error && <span className="text-xs text-red-300 truncate max-w-[40%]">{error}</span>}
      {onRecord && (
        <button
          onClick={toggle}
          disabled={busy}
          className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-bold disabled:opacity-60 ${
            recording ? 'bg-white text-steel-900' : 'border border-red-500 text-red-400 hover:bg-red-500/10'
          }`}
        >
          {busy ? 'Aguarde…' : recording ? '⏹ Parar gravação' : '⏺ Gravar'}
        </button>
      )}
    </>
  );
}

// Suporte: o convidado entra sem poder compartilhar a tela; o apresentador libera
// pessoa por pessoa e tira quando terminar.
function ScreenGrantControl({ onScreen }: { onScreen: (identity: string, on: boolean) => Promise<string | null> }) {
  const guests = useRemoteParticipants().filter((p) => p.identity.startsWith('guest-'));
  const [open, setOpen] = useState(false);
  const [allowed, setAllowed] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggle(identity: string) {
    const on = !allowed.has(identity);
    setBusy(identity); setError(null);
    const err = await onScreen(identity, on);
    setBusy(null);
    if (err) { setError(err); return; }
    setAllowed((prev) => {
      const next = new Set(prev);
      if (on) next.add(identity); else next.delete(identity);
      return next;
    });
  }

  return (
    <div className="relative shrink-0">
      <button
        onClick={() => setOpen((v) => !v)}
        className="rounded-lg border border-white/20 px-3 py-1.5 text-xs font-bold hover:bg-white/10"
      >
        🖥️ Liberar tela
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 z-50 w-72 max-w-[90vw] rounded-xl bg-[#1d1d1d] border border-white/10 shadow-xl p-2">
          <p className="px-2 py-1 text-xs text-white/60">Quem pode compartilhar a tela:</p>
          {guests.length === 0 && <p className="px-2 py-3 text-sm text-white/70">Ninguém entrou na sala ainda.</p>}
          {guests.map((p) => {
            const on = allowed.has(p.identity);
            return (
              <div key={p.identity} className="flex items-center gap-2 px-2 py-1.5">
                <span className="flex-1 truncate text-sm">{p.name || 'Convidado'}</span>
                <button
                  onClick={() => toggle(p.identity)}
                  disabled={busy === p.identity}
                  className={`min-h-[36px] rounded-lg px-3 text-xs font-bold disabled:opacity-60 ${
                    on ? 'bg-white text-steel-900' : 'bg-brand-600 text-white hover:bg-brand-700'
                  }`}
                >
                  {busy === p.identity ? 'Aguarde…' : on ? 'Tirar tela' : 'Liberar tela'}
                </button>
              </div>
            );
          })}
          {error && <p className="px-2 py-1 text-xs text-red-300">{error}</p>}
        </div>
      )}
    </div>
  );
}

// Na hora de compartilhar a tela, a aba da própria sala some da lista do Chrome:
// compartilhar ela mesma vira um "espelho infinito". O ControlBar do LiveKit não deixa
// passar essa opção, então ela entra no getDisplayMedia enquanto a sala está aberta.
function useHideOwnTabFromScreenShare() {
  useEffect(() => {
    const media = navigator.mediaDevices;
    if (!media?.getDisplayMedia) return;
    const original = media.getDisplayMedia.bind(media);
    media.getDisplayMedia = (opts?: DisplayMediaStreamOptions) =>
      // o ControlBar do LiveKit manda selfBrowserSurface: 'include' de propósito; aqui sempre exclui
      original({ ...opts, selfBrowserSurface: 'exclude' } as DisplayMediaStreamOptions);
    return () => { media.getDisplayMedia = original; };
  }, []);
}
