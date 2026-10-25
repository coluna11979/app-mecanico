import { Link } from 'react-router-dom';
import type { GeoState } from '@/hooks/useGeoBroadcast';

/**
 * Aviso para o mecânico quando a oficina NÃO consegue ver a posição dele no mapa.
 * Só aparece com problema (bloqueado / sem sinal / sem GPS); quando está tudo certo não ocupa espaço.
 */
export function GeoProblemBanner({ state, className = '' }: { state: GeoState; className?: string }) {
  if (state !== 'denied' && state !== 'unavailable' && state !== 'unsupported') return null;
  const title = state === 'denied'
    ? 'A oficina não está vendo você no mapa'
    : state === 'unavailable' ? 'Sem sinal de GPS agora' : 'Este aparelho não tem GPS';
  return (
    <div role="alert" className={`rounded-2xl bg-alert-500/15 border border-alert-500/40 px-4 py-3 text-sm text-steel-100 ${className}`}>
      <div className="font-bold text-white">📍 {title}</div>
      {state === 'denied' && (
        <p className="mt-1 text-steel-200 leading-snug">
          Libere a localização: toque no <strong>cadeado</strong> ao lado do endereço do site → <strong>Permissões</strong> →
          <strong> Localização</strong> → <strong>Permitir</strong>. Depois toque em “Tentar de novo”.
        </p>
      )}
      {state === 'unavailable' && (
        <p className="mt-1 text-steel-200 leading-snug">Ligue a localização do celular e deixe o app aberto no caminho até a oficina.</p>
      )}
      {state === 'unsupported' && (
        <p className="mt-1 text-steel-200 leading-snug">Abra o app pelo celular para a oficina acompanhar o seu deslocamento.</p>
      )}
      {state !== 'unsupported' && (
        <button onClick={() => window.location.reload()}
          className="mt-2.5 h-11 px-4 rounded-xl bg-white text-steel-900 text-sm font-bold active:scale-95 transition">
          Tentar de novo
        </button>
      )}
    </div>
  );
}

/** Selo do topo do acompanhamento: mostra o estado REAL do GPS (antes dizia "Ao vivo" sempre) */
export function GeoPill({ state }: { state: GeoState }) {
  if (state === 'sharing') return (
    <div className="bg-brand-500 text-white text-xs font-semibold rounded-full px-3 py-2 flex items-center gap-2 shadow-brand">
      <span className="h-2 w-2 rounded-full bg-white animate-pulse-soft" />
      📍 Ao vivo
    </div>
  );
  if (state === 'waiting') return (
    <div className="bg-steel-800/90 backdrop-blur border border-steel-700 text-steel-200 text-xs font-semibold rounded-full px-3 py-2 flex items-center gap-2">
      <span className="h-2 w-2 rounded-full bg-steel-400 animate-pulse-soft" />
      Buscando GPS…
    </div>
  );
  if (state === 'idle') return null;
  return (
    <div className="bg-alert-500 text-white text-xs font-semibold rounded-full px-3 py-2 flex items-center gap-2">
      📍 GPS desligado
    </div>
  );
}

/** Faixa fina nas outras telas do app enquanto há uma viagem: confirma que a oficina está vendo */
export function GeoSharingBar({ jobId }: { jobId: string }) {
  return (
    <Link to={`/mecanico/job/${jobId}/tracking`}
      className="flex items-center gap-2 px-4 h-10 bg-brand-500/15 border-b border-brand-500/30 text-[13px] font-semibold text-brand-200 active:bg-brand-500/25">
      <span className="h-2 w-2 rounded-full bg-brand-400 animate-pulse-soft shrink-0" />
      <span className="flex-1 truncate">Compartilhando sua localização com a oficina</span>
      <span className="text-brand-300 shrink-0">Ver trajeto →</span>
    </Link>
  );
}
