import { useState, type ReactNode } from 'react';
import { LiveKitRoom, VideoConference, useIsRecording } from '@livekit/components-react';
import '@livekit/components-styles';

// Sala de vídeo do treinamento (LiveKit): a mesma para quem apresenta e quem assiste.
// O token já carrega as permissões — convidado não compartilha tela. Entrar não grava:
// só o apresentador liga a gravação, e todos veem o aviso enquanto ela roda.
export default function TrainingRoomView({
  token, wsUrl, title, host, onLeave, onRecord, topRight,
}: {
  token: string;
  wsUrl: string;
  title: string;
  host: boolean;
  onLeave: () => void;
  onRecord?: (on: boolean) => Promise<string | null>;
  topRight?: ReactNode;
}) {
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
