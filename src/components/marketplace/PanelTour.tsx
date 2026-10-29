import { useCallback, useEffect, useLayoutEffect, useState, type CSSProperties } from 'react';
import { IconArrowLeft, IconArrowRight, IconX } from '@/components/mecanico/icons';

/** Um passo do tour: `target` é o valor de data-tour do bloco destacado (sem target = cartão no meio da tela) */
export type TourStep = { target?: string; title: string; body: string };

const PAD = 8;

/** Primeiro bloco visível com esse data-tour (celular e computador têm cópias diferentes, uma fica escondida) */
function findTarget(target?: string): HTMLElement | null {
  if (!target) return null;
  const all = document.querySelectorAll<HTMLElement>(`[data-tour="${target}"]`);
  for (const el of all) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return el;
  }
  return null;
}

/** Tour já visto por este usuário nesta tela (só conveniência: se o navegador não guardar, o tour reaparece) */
export function tourSeen(key: string) {
  try { return localStorage.getItem(key) === '1'; } catch { return true; }
}
function markSeen(key: string) {
  try { localStorage.setItem(key, '1'); } catch { /* sem armazenamento: tudo bem */ }
}

/**
 * Tour guiado: escurece a tela, destaca um bloco por vez e explica para que serve.
 * Passos cujo bloco não está na tela (ex.: Empilhados vazio) são pulados.
 * No celular o texto fica numa folha embaixo; no computador, num balão junto do bloco.
 */
export function PanelTour({ steps, storageKey, onClose }: {
  steps: TourStep[];
  storageKey: string;
  onClose: () => void;
}) {
  // Passos com bloco na tela, calculados uma vez depois que a tela montou
  const [visible, setVisible] = useState<TourStep[]>([]);
  useLayoutEffect(() => { setVisible(steps.filter(s => !s.target || findTarget(s.target))); }, [steps]);
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [vw, setVw] = useState(() => window.innerWidth);
  const step = visible[i] as TourStep | undefined;
  const last = i === visible.length - 1;
  const mobile = vw < 640;

  const close = useCallback(() => { markSeen(storageKey); onClose(); }, [storageKey, onClose]);

  // Leva o bloco para a tela e acompanha a posição dele (rolagem, tamanho da janela)
  useLayoutEffect(() => {
    const el = findTarget(step?.target);
    if (!el) { setRect(null); return; }
    el.style.scrollMarginTop = '72px';
    el.scrollIntoView({ behavior: 'smooth', block: mobile ? 'start' : 'center' });
    let raf = 0;
    const update = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => { setRect(el.getBoundingClientRect()); setVw(window.innerWidth); });
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('scroll', update, true); window.removeEventListener('resize', update); };
  }, [step?.target, mobile]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); last ? close() : setI(n => n + 1); }
      if (e.key === 'ArrowLeft') setI(n => Math.max(0, n - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close, last]);

  if (!step) return null;

  // Balão do computador: embaixo do bloco se couber, senão em cima; nunca sai da tela
  const CARD_W = 340, CARD_H = 210;
  let cardStyle: CSSProperties | undefined;
  if (!mobile && rect) {
    const below = rect.bottom + PAD + 12 + CARD_H < window.innerHeight;
    const top = below ? rect.bottom + PAD + 12 : Math.max(12, rect.top - PAD - 12 - CARD_H);
    const left = Math.min(Math.max(12, rect.left), window.innerWidth - CARD_W - 12);
    cardStyle = { top, left, width: CARD_W };
  }

  return (
    <div className="fixed inset-0 z-[110]" role="dialog" aria-modal="true" aria-label={`Guia da tela: ${step.title}`}>
      {/* Bloqueia cliques na tela enquanto o guia está aberto */}
      <div className="absolute inset-0" onClick={e => e.stopPropagation()} />

      {/* Destaque: um recorte claro em volta do bloco, o resto escurecido */}
      {rect ? (
        <div className="absolute rounded-2xl ring-2 ring-brand-500 transition-all duration-300 pointer-events-none"
          style={{
            top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2,
            boxShadow: '0 0 0 9999px rgba(15, 23, 42, 0.62)',
          }} />
      ) : <div className="absolute inset-0 bg-steel-900/60 pointer-events-none" />}

      <div key={i}
        className={mobile || !rect
          ? `absolute inset-x-0 bottom-0 sm:inset-x-auto sm:bottom-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-[380px]
             rounded-t-3xl sm:rounded-2xl bg-white shadow-2xl p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] animate-fade-in`
          : 'absolute rounded-2xl bg-white shadow-2xl p-5 animate-fade-in'}
        style={cardStyle}>
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-brand-600">{i + 1} de {visible.length}</div>
            <h2 className="mt-1 text-lg font-bold text-steel-900 leading-snug">{step.title}</h2>
          </div>
          <button type="button" onClick={close} aria-label="Fechar o guia"
            className="-mr-2 -mt-2 h-11 w-11 shrink-0 grid place-items-center rounded-full text-steel-400 hover:bg-steel-100 hover:text-steel-700 transition">
            <IconX className="w-5 h-5" />
          </button>
        </div>
        <p className="mt-2 text-sm text-steel-600 leading-relaxed">{step.body}</p>

        <div className="mt-5 flex items-center gap-2">
          <div className="flex-1 flex items-center gap-1.5" aria-hidden>
            {visible.map((_, n) => (
              <span key={n} className={`h-1.5 rounded-full transition-all ${n === i ? 'w-5 bg-brand-500' : 'w-1.5 bg-steel-200'}`} />
            ))}
          </div>
          {i > 0 ? (
            <button type="button" onClick={() => setI(n => n - 1)} aria-label="Passo anterior"
              className="h-11 w-11 grid place-items-center rounded-xl border border-steel-200 text-steel-700 hover:bg-steel-50 transition">
              <IconArrowLeft className="w-4 h-4" />
            </button>
          ) : (
            <button type="button" onClick={close}
              className="h-11 px-3 rounded-xl text-sm font-semibold text-steel-500 hover:text-steel-800 transition">
              Pular
            </button>
          )}
          <button type="button" onClick={() => (last ? close() : setI(n => n + 1))} autoFocus
            className="h-11 px-4 inline-flex items-center gap-1.5 rounded-xl bg-brand-500 text-white text-sm font-bold hover:bg-brand-600 active:scale-[0.98] transition">
            {last ? 'Entendi' : <>Próximo<IconArrowRight className="w-4 h-4" /></>}
          </button>
        </div>
      </div>
    </div>
  );
}
