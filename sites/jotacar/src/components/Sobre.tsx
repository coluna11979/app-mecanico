import { CONFIG } from '../config';
import { ArrowLink, Eyebrow, Reveal } from './ui';

/* =====================================================================
   5 · Sobre nós — fundo branco, foto da oficina + 01 · 02 · 03
   ===================================================================== */
const pilares = [
  { n: '01', titulo: 'Diagnóstico com equipamento', texto: 'Scanner para ler as falhas da central e achar o problema sem chute.' },
  { n: '02', titulo: 'Orçamento antes do serviço', texto: 'Você recebe o orçamento explicado. Nenhum serviço começa sem a sua aprovação.' },
  { n: '03', titulo: 'Mecânica e pneus juntos', texto: 'Alinhamento, balanceamento e pneus no mesmo endereço da mecânica.' },
];

export default function Sobre() {
  return (
    <section id="sobre" aria-labelledby="sobre-title" className="bg-white px-6 py-32 text-black md:py-44">
      <div className="mx-auto grid max-w-[1120px] items-center gap-16 lg:grid-cols-2 lg:gap-24">
        <Reveal>
          <figure>
            <div className="overflow-hidden rounded-3xl bg-snow">
              <img
                src={CONFIG.fotoFachada}
                alt="Fachada da Jota Car Serviços Automotivo na Estrada do M'Boi Mirim, 9000"
                width={1360}
                height={1020}
                loading="lazy"
                decoding="async"
                className="aspect-[4/5] w-full object-cover object-[36%_50%] transition-transform duration-[1.6s] ease-apple hover:scale-[1.02] max-lg:aspect-[4/3]"
              />
            </div>
            <figcaption className="mt-4 text-[13px] tracking-tight text-mist">Nossa oficina · {CONFIG.endereco}</figcaption>
          </figure>
        </Reveal>

        <div>
          <Reveal>
            <Eyebrow>Sobre nós</Eyebrow>
            <h2 id="sobre-title" className="mt-3 text-[40px] font-semibold leading-[1.06] tracking-tighter md:text-[52px]">
              Mais que cuidar do carro.
              <span className="text-mist"> Cuidamos da sua tranquilidade.</span>
            </h2>
            <p className="mt-8 text-[19px] leading-relaxed tracking-tight text-mist">
              Atendemos quem depende do carro todo dia. A conversa é direta, e você entende o que o carro tem antes de decidir.
            </p>
          </Reveal>

          <ol className="mt-14 space-y-10">
            {pilares.map((p, i) => (
              <Reveal key={p.n} delay={i * 100}>
                <li className="grid grid-cols-[56px_1fr] gap-4 md:grid-cols-[72px_1fr]">
                  <span className="text-[28px] font-light tracking-tighter text-mist md:text-[34px]">{p.n}</span>
                  <div>
                    <h3 className="text-[21px] font-semibold tracking-tight">{p.titulo}</h3>
                    <p className="mt-2 text-[17px] leading-relaxed text-mist">{p.texto}</p>
                  </div>
                </li>
              </Reveal>
            ))}
          </ol>

          <Reveal className="mt-14 flex flex-wrap gap-x-8 gap-y-2">
            <ArrowLink href={CONFIG.googleAvaliacoes} id="ver_avaliacoes_google" className="text-[15px] text-black">Avaliações no Google</ArrowLink>
            <ArrowLink href={CONFIG.instagram} id="instagram" className="text-[15px] text-black">Instagram</ArrowLink>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
