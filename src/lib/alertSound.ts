/**
 * Toca um "ding-ding" de notificação usando Web Audio API (sem arquivos externos).
 * Deve ser chamado após uma interação do usuário para contornar a política de autoplay.
 */

let ctx: AudioContext | null = null;

export function unlockAudio() {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === 'suspended') ctx.resume();
}

export function playJobAlert() {
  if (!ctx || ctx.state !== 'running') return;

  // Dois "dings" em sequência: A5 (880Hz) → C6 (1047Hz)
  const tones = [
    { freq: 880,  start: 0    },
    { freq: 1047, start: 0.18 },
  ];

  tones.forEach(({ freq, start }) => {
    const osc  = ctx!.createOscillator();
    const gain = ctx!.createGain();

    osc.connect(gain);
    gain.connect(ctx!.destination);

    osc.type = 'sine';
    osc.frequency.value = freq;

    const t = ctx!.currentTime + start;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.35, t + 0.01);   // attack rápido
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5); // decay suave

    osc.start(t);
    osc.stop(t + 0.5);
  });
}
