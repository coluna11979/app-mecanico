import { useRegisterSW } from 'virtual:pwa-register/react';

/**
 * Banner de atualização do PWA.
 *
 * Detecta nova versão do Service Worker e mostra um aviso pro usuário
 * com botão "Atualizar agora". Verifica updates automaticamente:
 *  - A cada 60 segundos
 *  - Sempre que o usuário volta pra aba (visibilitychange)
 *
 * Resolve o problema clássico de PWA com cache agressivo: usuário fica
 * preso na versão antiga até limpar o navegador.
 */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return;

      // Checa nova versão a cada 60 segundos
      const interval = setInterval(() => {
        registration.update().catch(() => { /* offline, ignora */ });
      }, 60_000);

      // E também quando o usuário volta pra aba
      const onVisibility = () => {
        if (document.visibilityState === 'visible') {
          registration.update().catch(() => { /* offline, ignora */ });
        }
      };
      document.addEventListener('visibilitychange', onVisibility);

      // Cleanup quando o app fecha
      window.addEventListener('beforeunload', () => {
        clearInterval(interval);
        document.removeEventListener('visibilitychange', onVisibility);
      }, { once: true });
    },
  });

  if (!needRefresh) return null;

  return (
    <div
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[1000] max-w-md w-[calc(100%-2rem)] animate-slide-up"
      role="alert"
    >
      <div className="bg-steel-900 text-white rounded-2xl shadow-2xl border border-brand-500/40 px-4 py-3 flex items-center gap-3">
        <span className="text-2xl shrink-0">🆕</span>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-sm">Nova versão disponível</div>
          <div className="text-xs text-steel-400">Atualize agora pra usar as últimas melhorias.</div>
        </div>
        <button
          onClick={() => setNeedRefresh(false)}
          className="text-steel-400 hover:text-white text-xs px-2 py-1 shrink-0"
        >
          Depois
        </button>
        <button
          onClick={() => updateServiceWorker(true)}
          className="bg-brand-500 hover:bg-brand-600 text-white font-bold text-xs px-4 py-2 rounded-xl shrink-0"
        >
          Atualizar
        </button>
      </div>
    </div>
  );
}
