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
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setAtivo(true); io.disconnect(); } }, { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <section id="como-funciona" aria-labelledby="como-title" className="bg-snow px-6 py-36 text-black md:py-56">
      <div className="mx-auto max-w-[1120px]">
        <Reveal className="text-center">
          <Eyebrow>Como funciona</Eyebrow>
          <h2 id="como-title" className="mx-auto mt-4 max-w-[640px] text-[40px] font-semibold leading-[1.04] tracking-[-0.04em] md:text-[56px]">
            Simples do começo ao fim.
          </h2>
        </Reveal>

        {/* ---------------- Linha do tempo: horizontal no desktop, vertical no celular ---------------- */}
        <ol ref={linha} className="relative mt-24 grid gap-16 md:mt-32 md:grid-cols-3 md:gap-10">
          {/* trilho */}
          <span aria-hidden="true" className="absolute bottom-2 left-[4px] top-2 w-px bg-black/10 md:bottom-auto md:left-[16.66%] md:right-[16.66%] md:top-[4px] md:h-px md:w-auto" />
          {/* progresso */}
          <span
            aria-hidden="true"
            className={`absolute bottom-2 left-[4px] top-2 w-px origin-top bg-black/60 transition-transform duration-[1800ms] ease-apple md:bottom-auto md:left-[16.66%] md:right-[16.66%] md:top-[4px] md:h-px md:w-auto md:origin-left ${ativo ? 'scale-100' : 'max-md:scale-y-0 md:scale-x-0'}`}
          />
          {passos.map((p, i) => (
            <li key={p.titulo} className="relative grid grid-cols-[9px_1fr] gap-8 md:block md:text-center">
              <span
                aria-hidden="true"
                style={{ transitionDelay: `${300 + i * 500}ms` }}
                className={`relative z-10 mt-[6px] block h-[9px] w-[9px] rounded-full transition-colors duration-500 md:mx-auto md:mt-0 ${ativo ? 'bg-black' : 'bg-black/15'}`}
              />
              <div className="md:mt-10">
                <p className="text-[13px] font-medium tabular-nums tracking-[0.08em] text-mist">0{i + 1}</p>
                <h3 className="mt-2 text-[21px] font-semibold tracking-[-0.02em]">{p.titulo}</h3>
                <p className="mt-2 text-[17px] leading-relaxed text-mist">{p.texto}</p>
              </div>
            </li>
          ))}
        </ol>

        <Reveal className="mx-auto mt-24 max-w-[560px] text-center md:mt-28">
          <p className="text-[17px] leading-relaxed text-mist">
            Na oficina você recebe o orçamento explicado e decide. <span className="text-black">Nenhum serviço começa sem a sua aprovação.</span>
          </p>
        </Reveal>

        {/* ---------------- FAQ: accordion minimalista ---------------- */}
        <div className="mx-auto mt-36 max-w-[720px] md:mt-44">
          <Reveal>
            <h3 className="text-[28px] font-semibold tracking-[-0.03em] md:text-[32px]">Perguntas frequentes</h3>
          </Reveal>
          <div className="mt-10">
            {faq.map((f, i) => {
              const open = aberto === i;
              return (
                <div key={f.p} className="border-b border-black/[0.08]">
                  <button
                    type="button"
                    onClick={() => setAberto(open ? null : i)}
                    aria-expanded={open}
                    aria-controls={`faq-${i}`}
                    className="group flex min-h-[72px] w-full items-center justify-between gap-8 py-6 text-left text-[17px] font-medium tracking-[-0.01em] md:text-[19px]"
                  >
                    <span className="transition-colors duration-300 group-hover:text-black/70">{f.p}</span>
                    <span className={`shrink-0 text-mist transition-transform duration-500 ease-apple ${open ? 'rotate-45' : ''}`}><Icon.plus /></span>
                  </button>
                  <div id={`faq-${i}`} className={`grid transition-all duration-500 ease-apple ${open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
                    <div className="min-h-0 overflow-hidden">
                      <p className="max-w-[600px] pb-8 text-[17px] leading-relaxed text-mist">{f.r}</p>
                    </div>
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
