import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * Rede de segurança contra "tela branca".
 *
 * Caso clássico: saiu um deploy novo enquanto o app estava aberto. O app
 * antigo tenta baixar uma tela carregada sob demanda (ex.: Tracking) cujo
 * arquivo não existe mais → o import falha. Nesse caso recarregamos uma vez,
 * já na versão nova. Qualquer outro erro mostra uma tela com "Recarregar".
 */

const RELOAD_KEY = 'app:chunk-reload-at';

export function isChunkLoadError(err: unknown): boolean {
  const msg = String((err as { message?: string })?.message ?? err ?? '');
  return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Loading (CSS )?chunk|ChunkLoadError|is not a valid JavaScript MIME type/i.test(msg);
}

/** Recarrega a página, no máximo uma vez a cada 30 s (evita loop). Retorna se recarregou. */
export function reloadForNewVersion(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
    if (Date.now() - last < 30_000) return false;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    /* sem sessionStorage: recarrega mesmo assim */
  }
  window.location.reload();
  return true;
}

type State = { error: Error | null };

export class AppErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[AppErrorBoundary]', error, info.componentStack);
    if (isChunkLoadError(error)) reloadForNewVersion();
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="min-h-screen bg-steel-900 text-white grid place-items-center px-6">
        <div className="max-w-sm text-center">
          <div className="text-4xl">🔧</div>
          <h1 className="mt-4 text-xl font-bold">Algo deu errado nesta tela</h1>
          <p className="mt-2 text-sm text-steel-300">
            Pode ser uma versão nova do app chegando. Recarregue para continuar — o que você já fez está salvo.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="mt-6 w-full h-12 rounded-xl bg-brand-500 font-bold active:bg-brand-600 transition"
          >
            Recarregar
          </button>
          <a href="/" className="mt-3 inline-block text-sm text-steel-400 underline">Ir para o início</a>
        </div>
      </div>
    );
  }
}
