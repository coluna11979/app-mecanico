import { CONFIG, wa } from '../config';
import { Button, Icon } from './ui';

/* =====================================================================
   2 · Hero — fundo preto absoluto, headline centralizada, um botão
   ===================================================================== */
export default function Hero() {
  return (
    <section id="topo" aria-labelledby="hero-title" className="relative flex min-h-[100svh] items-center justify-center overflow-hidden bg-black px-6 pb-24 pt-32 text-center">
      {/* brilho dourado quase imperceptível */}
      <div aria-hidden="true" className="pointer-events-none absolute left-1/2 top-[38%] h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-gold/[0.07] blur-[120px]" />

      <div className="relative mx-auto max-w-[980px]">
        <p className="inline-flex items-center gap-2 text-[13px] font-medium tracking-[-0.01em] text-mist motion-safe:animate-[fade_1.2s_ease-out_both]">
          <Icon.pin />
          <span>{CONFIG.endereco}<span className="hidden sm:inline"> · {CONFIG.regiao}</span></span>
        </p>

        <h1
          id="hero-title"
          className="mt-7 text-[clamp(36px,10.4vw,44px)] font-semibold leading-[1.02] tracking-[-0.045em] text-white motion-safe:animate-[rise_1.2s_cubic-bezier(0.28,0.11,0.32,1)_0.1s_both] sm:text-[64px] md:text-[80px] lg:text-[96px]"
        >
          <span className="whitespace-nowrap">Do óleo ao motor,</span>
          <br />
          <span className="whitespace-nowrap text-white/60">num endereço só.</span>
        </h1>

        <p className="mx-auto mt-8 max-w-[440px] text-[17px] leading-relaxed tracking-[-0.01em] text-mist/80 motion-safe:animate-[rise_1.2s_cubic-bezier(0.28,0.11,0.32,1)_0.25s_both] md:text-[19px]">
          Mecânica, diagnóstico e pneus para o carro do dia a dia. Atendimento de segunda a sábado.
        </p>

        <div className="mt-14 motion-safe:animate-[rise_1.2s_cubic-bezier(0.28,0.11,0.32,1)_0.4s_both]">
          <Button href={wa(CONFIG.mensagens.agendar)} id="wa_hero">
            Agendar atendimento
          </Button>
        </div>
      </div>

      {/* animações do hero (keyframes locais) */}
      <style>{`
        @keyframes rise { from { opacity: 0; transform: translateY(24px) } to { opacity: 1; transform: none } }
        @keyframes fade { from { opacity: 0 } to { opacity: 1 } }
      `}</style>
    </section>
  );
}
