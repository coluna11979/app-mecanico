/**
 * Sons de alerta via Web Audio API (sem arquivos externos).
 * Política do navegador: AudioContext começa suspenso e exige primeira
 * interação do usuário pra ser destravado. Por isso temos um listener
 * global que destrava no primeiro click/touch/keydown da sessão.
 */

let ctx: AudioContext | null = null;
let unlockListenerAttached = false;

/** Cria/retoma o AudioContext. Pode ser chamado a qualquer hora. */
export function unlockAudio() {
  try {
    if (!ctx) {
      const W = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
      const Ctor = W.AudioContext || W.webkitAudioContext;
      if (!Ctor) return;
      ctx = new Ctor();
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  } catch {
    /* ignora — não é crítico */
  }
}

/**
 * Registra listeners globais que destravam áudio no primeiro click/toque/tecla.
 * Idempotente — chame quando o usuário entra numa página que precisa de som.
 */
export function attachAutoUnlock() {
  if (unlockListenerAttached || typeof window === 'undefined') return;
  unlockListenerAttached = true;

  const handler = () => {
    unlockAudio();
    // Depois do primeiro disparo já deu — não precisa ouvir mais
    window.removeEventListener('pointerdown', handler);
    window.removeEventListener('keydown', handler);
    window.removeEventListener('touchstart', handler);
  };
  window.addEventListener('pointerdown', handler, { passive: true });
  window.addEventListener('keydown', handler);
  window.addEventListener('touchstart', handler, { passive: true });
}

/** Indica se o áudio já está pronto pra tocar */
export function isAudioReady(): boolean {
  return !!ctx && ctx.state === 'running';
}

/** Toca uma sequência de tons usando o AudioContext compartilhado */
function playTones(tones: { freq: number; start: number; duration?: number; volume?: number }[]) {
  if (!ctx || ctx.state !== 'running') {
    // Tenta destravar; se não conseguir agora, próxima vez funciona
    unlockAudio();
    if (!ctx || ctx.state !== 'running') return;
  }
  tones.forEach(({ freq, start, duration = 0.5, volume = 0.35 }) => {
    const osc  = ctx!.createOscillator();
    const gain = ctx!.createGain();
    osc.connect(gain);
    gain.connect(ctx!.destination);
    osc.type = 'sine';
    osc.frequency.value = freq;
    const t = ctx!.currentTime + start;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(volume, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.start(t);
    osc.stop(t + duration);
  });
}

/** 🔔 Novo job — dois "dings" agudos chamativos (A5 → C6) */
export function playJobAlert() {
  playTones([
    { freq: 880,  start: 0    },
    { freq: 1047, start: 0.18 },
  ]);
}

/** 💬 Nova mensagem de chat — "blip" único curto e suave (E5) */
export function playChatAlert() {
  playTones([
    { freq: 660, start: 0, duration: 0.25, volume: 0.22 },
  ]);
}
