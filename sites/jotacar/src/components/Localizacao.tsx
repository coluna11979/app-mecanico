import { CONFIG, diaSP, track, wa } from '../config';
import { Button, Eyebrow, Icon, Reveal } from './ui';

/* =====================================================================
   7 · Localização — fundo preto, endereço, horários, mapa, 2 botões
   ===================================================================== */
export default function Localizacao() {
  const hoje = diaSP();

  return (
    <section id="localizacao" aria-labelledby="loc-title" className="bg-black px-6 py-36 md:py-56">
      <div className="mx-auto grid max-w-[1120px] items-stretch gap-16 lg:grid-cols-2 lg:gap-24">
        <Reveal>
          <Eyebrow tone="gold">Localização</Eyebrow>
          <h2 id="loc-title" className="mt-3 text-[40px] font-semibold leading-[1.06] tracking-tighter text-white md:text-[56px]">
            Venha nos visitar.
          </h2>

          <address className="mt-14 not-italic">
            <p className="text-[24px] font-semibold tracking-[-0.02em] text-white">{CONFIG.endereco}</p>
            <p className="mt-1 text-[17px] text-mist">{CONFIG.cidade} · {CONFIG.regiao}</p>
          </address>

          <ul className="mt-12 border-t border-white/10" aria-label="Horário de funcionamento">
            {CONFIG.horarios.map((h) => {
              const eHoje = (h.semana as readonly number[]).includes(hoje);
              return (
                <li key={h.dias} className="flex justify-between border-b border-white/10 py-5 text-[17px] tracking-[-0.01em]">
                  <span className={eHoje ? 'text-white' : 'text-mist'}>{h.dias}{eHoje && <span className="ml-2 text-gold">· hoje</span>}</span>
                  <span className={eHoje ? 'text-white' : 'text-mist'}>{h.horas}</span>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-[13px] text-white/40">Em feriados, confirme pelo WhatsApp.</p>

          <div className="mt-14 flex flex-col gap-3 sm:flex-row">
            <Button href={wa(CONFIG.mensagens.geral)} id="wa_final"><Icon.wa />Falar com a Jota Car</Button>
            <Button href={CONFIG.rota} id="rota_google" variant="outline-dark">Como chegar</Button>
          </div>
          <div className="mt-6 flex flex-wrap gap-x-8 text-[15px]">
            <a href={CONFIG.waze} target="_blank" rel="noopener" onClick={() => track('rota_waze', CONFIG.waze)} className="inline-flex min-h-[44px] items-center text-mist transition-colors hover:text-white">Abrir no Waze</a>
            <a href={`tel:${CONFIG.tel}`} onClick={() => track('ligar', 'tel:')} className="inline-flex min-h-[44px] items-center text-mist transition-colors hover:text-white">Ligar · {CONFIG.telefone}</a>
          </div>
        </Reveal>

        <Reveal delay={150} className="min-h-[420px]">
          <div className="relative h-full min-h-[420px] overflow-hidden rounded-[32px] bg-white/[0.04] ring-1 ring-white/[0.08]">
            <iframe
              title={`Mapa: Jota Car na ${CONFIG.endereco}`}
              src={CONFIG.mapaEmbed}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              className="absolute inset-0 h-full w-full border-0 opacity-90 grayscale transition-all duration-700 ease-apple hover:opacity-100 hover:grayscale-0"
            />
          </div>
        </Reveal>
      </div>
    </section>
  );
}
