import { CONFIG, wa } from '../config';
import { ArrowLink, Eyebrow, Reveal } from './ui';
import CheckupMockup from './CheckupMockup';

/* =====================================================================
   4 · Diagnóstico — fundo preto, texto + mockup iOS funcional
   ===================================================================== */
export default function Diagnostico() {
  return (
    <section id="diagnostico" aria-labelledby="diag-title" className="bg-black px-6 py-36 md:py-56">
      <div className="mx-auto grid max-w-[1120px] items-center gap-20 lg:grid-cols-2 lg:gap-28">
        <Reveal>
          <Eyebrow tone="gold">Diagnóstico</Eyebrow>
          <h2 id="diag-title" className="mt-4 text-[40px] font-semibold leading-[1.04] tracking-[-0.04em] text-white md:text-[56px]">
            Seu carro dá sinais.
            <br />
            <span className="text-mist">A gente ajuda a entender.</span>
          </h2>
          <p className="mt-8 max-w-[460px] text-[19px] leading-relaxed tracking-tight text-mist">
            Marque o que você percebeu ou toque na luz que acendeu. A mensagem chega pronta para a oficina, e o check-up confirma o que precisa ser feito.
          </p>
          <div className="mt-10">
            <ArrowLink href={wa('Olá, Jota Car! Vim pelo site e quero fazer um check-up no meu carro.')} id="wa_checkup" className="text-white">
              Agendar um check-up
            </ArrowLink>
          </div>
          <p className="mt-16 max-w-[420px] text-[13px] leading-relaxed text-white/40">
            As orientações daqui são gerais. Só a avaliação no carro, na {CONFIG.endereco}, confirma o diagnóstico.
          </p>
        </Reveal>

        <Reveal delay={150}>
          <CheckupMockup />
        </Reveal>
      </div>
    </section>
  );
}
