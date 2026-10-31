import { useEffect, useRef, useState } from 'react';
import { Eyebrow, Icon, Reveal } from './ui';

/* =====================================================================
   6 · Como funciona — fundo claro, linha do tempo + FAQ em accordion
   ===================================================================== */
const passos = [
  { titulo: 'Entre em contato', texto: 'Chame no WhatsApp ou ligue.' },
  { titulo: 'Conte o que o carro precisa', texto: 'Modelo, ano e o que você percebeu.' },
  { titulo: 'Combine seu atendimento', texto: 'A oficina responde e marca o horário.' },
];

const faq = [
  { p: 'Preciso agendar?', r: 'Recomendamos chamar no WhatsApp antes de vir. A oficina já sabe o que o carro tem e combina o melhor horário. O horário fica confirmado quando a oficina responde.' },
  { p: 'Vocês passam o orçamento antes?', r: 'Sim. Depois da avaliação, você recebe o orçamento com o que precisa ser feito e quanto custa. Nenhum serviço começa sem a sua aprovação.' },
  { p: 'Dá para saber o defeito só pelo WhatsApp?', r: 'Pela conversa dá para entender o problema e orientar o próximo passo. O que precisa ser feito, e o preço, só se confirma com o carro avaliado na oficina.' },
  { p: 'Acendeu uma luz no painel. Posso continuar rodando?', r: 'Luz vermelha de óleo, temperatura ou freio pede para parar em local seguro e não seguir viagem. Luz amarela fixa, como a da injeção, normalmente dá tempo de agendar; se estiver piscando, evite rodar. Na dúvida, não arrisque.' },
  { p: 'Quais as formas de pagamento?', r: 'Parcelamos em até 10x sem juros. Para outras formas de pagamento, fale com a gente pelo WhatsApp.' },
  { p: 'Abrem aos sábados?', r: 'Sim, das 8h às 14h. De segunda a sexta, das 8h às 18h. Domingo fechado. Em feriados, confirme pelo WhatsApp.' },
];

export default function ComoFunciona() {
  const linha = useRef<HTMLOListElement>(null);
  const [ativo, setAtivo] = useState(false);
  const [aberto, setAberto] = useState<number | null>(null);

  // A linha do tempo se preenche quando aparece na tela
  useEffect(() => {
    const el = linha.current;
    if (!el || !('IntersectionObserver' in window)) { setAtivo(true); return; }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setAtivo(true); io.disconnect(); } }, { threshold: 0.4 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <section id="como-funciona" aria-labelledby="como-title" className="bg-snow px-6 py-32 text-black md:py-44">
      <div className="mx-auto max-w-[1120px]">
        <Reveal className="text-center">
          <Eyebrow>Como funciona</Eyebrow>
          <h2 id="como-title" className="mx-auto mt-3 max-w-[640px] text-[40px] font-semibold leading-[1.06] tracking-tighter md:text-[56px]">
            Simples do começo ao fim.
          </h2>
        </Reveal>

        {/* Linha do tempo: horizontal no desktop, vertical no celular */}
        <ol ref={linha} className="relative mt-20 grid gap-12 md:mt-24 md:grid-cols-3 md:gap-8">
          <span aria-hidden="true" className="absolute bottom-6 left-[19px] top-6 w-px bg-black/10 md:bottom-auto md:left-[16.66%] md:right-[16.66%] md:top-[19px] md:h-px md:w-auto" />
          <span
            aria-hidden="true"
            className={`absolute bottom-6 left-[19px] top-6 w-px origin-top bg-black transition-transform duration-[1.6s] ease-apple md:bottom-auto md:left-[16.66%] md:right-[16.66%] md:top-[19px] md:h-px md:w-auto md:origin-left ${ativo ? 'scale-100' : 'max-md:scale-y-0 md:scale-x-0'}`}
          />
          {passos.map((p, i) => (
            <li key={p.titulo} className="relative grid grid-cols-[40px_1fr] gap-5 md:block md:text-center">
              <span
                style={{ transitionDelay: `${300 + i * 450}ms` }}
                className={`relative z-10 grid h-10 w-10 place-items-center rounded-full text-[15px] font-semibold transition-colors duration-500 md:mx-auto ${ativo ? 'bg-black text-white' : 'bg-white text-black ring-1 ring-black/10'}`}
              >
                {i + 1}
              </span>
              <div className="md:mt-8">
                <h3 className="text-[21px] font-semibold tracking-tight">{p.titulo}</h3>
                <p className="mt-2 text-[17px] text-mist">{p.texto}</p>
              </div>
            </li>
          ))}
        </ol>

        <Reveal className="mx-auto mt-20 max-w-[620px] text-center">
          <p className="text-[17px] leading-relaxed text-mist">
            Na oficina você recebe o orçamento explicado e decide. <span className="text-black">Nenhum serviço começa sem a sua aprovação.</span>
          </p>
        </Reveal>

        {/* FAQ — accordion limpo */}
        <div className="mx-auto mt-28 max-w-[760px]">
          <Reveal>
            <h3 className="text-[28px] font-semibold tracking-tight">Perguntas frequentes</h3>
          </Reveal>
          <div className="mt-8 border-t border-black/10">
            {faq.map((f, i) => {
              const open = aberto === i;
              return (
                <div key={f.p} className="border-b border-black/10">
                  <button
                    type="button"
                    onClick={() => setAberto(open ? null : i)}
                    aria-expanded={open}
                    aria-controls={`faq-${i}`}
                    className="flex min-h-[64px] w-full items-center justify-between gap-6 py-5 text-left text-[17px] font-medium tracking-tight"
                  >
                    {f.p}
                    <span className={`shrink-0 text-mist transition-transform duration-300 ease-apple ${open ? 'rotate-45' : ''}`}><Icon.plus /></span>
                  </button>
                  <div id={`faq-${i}`} className={`grid transition-all duration-500 ease-apple ${open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
                    <p className="min-h-0 overflow-hidden pr-10 text-[17px] leading-relaxed text-mist">
                      <span className="block pb-6">{f.r}</span>
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
