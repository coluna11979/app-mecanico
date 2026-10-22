import { useEffect, useState } from 'react';
import { enablePush, getPushState, syncPush, type PushState } from '@/lib/push';
import { IconBell } from '@/components/mecanico/icons';

/**
 * Convite para ativar o alerta no celular (push). Some quando já está ativo.
 * Mobile-first: botão grande, texto curto.
 */
export function PushAlertCard() {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy]   = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getPushState().then(s => {
      setState(s);
      if (s === 'on') syncPush();
    }).catch(() => setState('unsupported'));
  }, []);

  async function activate() {
    setBusy(true); setError('');
    try {
      setState(await enablePush());
    } catch {
      setError('Não foi possível ativar agora. Tente de novo em instantes.');
    } finally {
      setBusy(false);
    }
  }

  if (!state || state === 'on' || state === 'unsupported') return null;

  return (
    <div className="rounded-2xl border border-brand-500/40 bg-brand-500/10 p-4">
      <div className="flex items-start gap-3">
        <span className="h-10 w-10 rounded-xl bg-brand-500/20 text-brand-400 grid place-items-center shrink-0">
          <IconBell className="w-5 h-5" />
        </span>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-white leading-tight">Receba demandas com o celular bloqueado</div>
          {state === 'off' && (
            <div className="text-xs text-steel-300 mt-1">
              Ative o alerta e o celular toca quando surgir demanda perto de você, mesmo com o app fechado.
            </div>
          )}
          {state === 'ios-needs-install' && (
            <div className="text-xs text-steel-300 mt-1 leading-relaxed">
              No iPhone: toque em <strong className="text-white">Compartilhar</strong> →{' '}
              <strong className="text-white">Adicionar à Tela de Início</strong>, abra o MecânicoApp por lá e ative o alerta.
            </div>
          )}
          {state === 'denied' && (
            <div className="text-xs text-steel-300 mt-1 leading-relaxed">
              As notificações estão bloqueadas. Libere nas configurações do navegador (cadeado ao lado do endereço → Notificações → Permitir).
            </div>
          )}
        </div>
      </div>

      {state === 'off' && (
        <button onClick={activate} disabled={busy}
          className="mt-3 w-full h-12 rounded-xl bg-brand-500 text-white font-bold active:bg-brand-600 disabled:opacity-60 transition">
          {busy ? 'Ativando…' : 'Ativar alerta no celular'}
        </button>
      )}
      {error && <div className="mt-2 text-xs text-alert-400">{error}</div>}
    </div>
  );
}
