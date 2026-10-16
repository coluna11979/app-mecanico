import { useEffect, useRef, useState } from 'react';
import { toast } from '@/components/ui/Toast';
import { inboxCall, type InstanceStatus } from '@/lib/inbox';

type ConnectResult = { status: InstanceStatus; qrcode?: string | null; retry?: boolean; phone_number?: string | null };

/** Conecta o número da oficina: gera o QR code, renova a cada 30s e fecha sozinho quando o celular lê */
export default function ConnectWhatsApp({ workshopId, onClose, onConnected }: {
  workshopId: string; onClose: () => void; onConnected: () => void;
}) {
  const [qr, setQr] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const done = useRef(false);

  async function connect() {
    setLoading(true);
    setError(null);
    try {
      const r = await inboxCall<ConnectResult>('whatsapp-instance', { action: 'connect', workshop_id: workshopId });
      if (r.status === 'connected') { finish(); return; }
      setQr(r.qrcode ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  function finish() {
    if (done.current) return;
    done.current = true;
    toast.success('WhatsApp conectado ✓');
    onConnected();
  }

  useEffect(() => {
    connect();
    // QR do WhatsApp expira: gera outro a cada 30s
    const renew = setInterval(() => { if (!done.current) connect(); }, 30000);
    // Confere se o celular já leu
    const poll = setInterval(async () => {
      if (done.current) return;
      try {
        const r = await inboxCall<ConnectResult>('whatsapp-instance', { action: 'status', workshop_id: workshopId });
        if (r.status === 'connected') finish();
      } catch { /* tenta de novo no próximo ciclo */ }
    }, 4000);
    return () => { clearInterval(renew); clearInterval(poll); };
  }, [workshopId]); // eslint-disable-line react-hooks/exhaustive-deps

  const src = qr && (qr.startsWith('data:') ? qr : `data:image/png;base64,${qr}`);

  return (
    <div className="fixed inset-0 z-50 bg-steel-900/60 grid place-items-center p-4" onClick={onClose}>
      <div className="card max-w-md w-full" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold">Conectar o WhatsApp da oficina</h2>
          <button type="button" onClick={onClose} className="text-steel-400 hover:text-steel-700 text-xl">✕</button>
        </div>

        <ol className="text-sm text-steel-600 space-y-1 mb-4 list-decimal pl-5">
          <li>Abra o WhatsApp no celular da oficina</li>
          <li>Toque em <b>Mais opções ⋮</b> (ou <b>Configurações</b> no iPhone) → <b>Aparelhos conectados</b></li>
          <li>Toque em <b>Conectar um aparelho</b> e aponte para o código abaixo</li>
        </ol>

        <div className="aspect-square w-full max-w-[280px] mx-auto rounded-2xl border border-steel-200 bg-white grid place-items-center overflow-hidden">
          {error ? (
            <div className="p-4 text-center">
              <p className="text-sm text-alert-600 font-semibold">Não foi possível gerar o código</p>
              <p className="text-xs text-steel-500 mt-1 break-words">{error}</p>
              <button type="button" className="btn-secondary text-sm mt-3" onClick={connect}>Tentar de novo</button>
            </div>
          ) : src ? (
            <img src={src} alt="QR code para conectar o WhatsApp" className={`w-full h-full object-contain p-2 transition ${loading ? 'opacity-40' : ''}`} />
          ) : (
            <div className="text-center text-sm text-steel-500 px-4">
              <div className="h-8 w-8 mx-auto mb-2 rounded-full border-2 border-brand-500 border-t-transparent animate-spin" />
              Gerando o código…
            </div>
          )}
        </div>

        <p className="text-xs text-steel-500 text-center mt-3">
          O código muda a cada 30 segundos. Esta janela fecha sozinha quando o celular conectar.
        </p>
      </div>
    </div>
  );
}
