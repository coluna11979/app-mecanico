import { useState } from 'react';
import { wa } from '../config';
import { ArrowLink, Eyebrow, Icon, Reveal } from './ui';

/* =====================================================================
   3 · Serviços — fundo branco, 4 cards limpos + lista completa discreta
   ===================================================================== */
const principais = [
  { icon: Icon.oil, titulo: 'Revisão e óleo', texto: 'Óleo e filtros no prazo. Motor protegido.', msg: 'revisão e troca de óleo' },
  { icon: Icon.brake, titulo: 'Freios e suspensão', texto: 'Segurança e conforto em cada frenagem.', msg: 'freios e suspensão' },
  { icon: Icon.chip, titulo: 'Injeção e diagnóstico', texto: 'Scanner para achar a falha sem chute.', msg: 'diagnóstico / injeção eletrônica' },
  { icon: Icon.tire, titulo: 'Pneus e alinhamento', texto: 'Direção firme, pneus gastando por igual.', msg: 'pneus, alinhamento e balanceamento' },
];

const todos = [
  'Revisão e troca de óleo e filtros',
  'Freios: pastilhas, discos, lonas e fluido',
  'Suspensão e direção',
  'Injeção eletrônica e limpeza de bicos',
  'Motor e mecânica geral',
  'Alinhamento, balanceamento e cambagem',
  'Troca e montagem de pneus',
  'Teste e troca de bateria',
];

export default function Services() {
  const [verTodos, setVerTodos] = useState(false);

  return (
    <section id="servicos" aria-labelledby="servicos-title" className="bg-white px-6 py-32 text-black md:py-44">
      <div className="mx-auto max-w-[1120px]">
        <Reveal>
          <Eyebrow>Serviços</Eyebrow>
          <h2 id="servicos-title" className="mt-3 max-w-[900px] text-[40px] font-semibold leading-[1.06] tracking-tighter md:text-[56px]">
            Tudo que o seu carro precisa.
            <span className="text-mist"> Sem rodar de oficina em oficina.</span>
          </h2>
        </Reveal>

        <div className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-4 md:mt-20">
          {principais.map((s, i) => (
            <Reveal key={s.titulo} delay={i * 80}>
              <article className="flex h-full flex-col rounded-3xl bg-snow p-8 transition-transform duration-500 ease-apple hover:-translate-y-1">
                <span className="text-black"><s.icon /></span>
                <h3 className="mt-14 text-[21px] font-semibold tracking-tight">{s.titulo}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-mist">{s.texto}</p>
                <div className="mt-auto pt-8">
                  <ArrowLink href={wa(`Olá, Jota Car! Vim pelo site e quero um orçamento de ${s.msg}.`)} id={`wa_servico_${i + 1}`} className="text-[15px] text-black">
                    Solicitar atendimento
                  </ArrowLink>
                </div>
              </article>
            </Reveal>
          ))}
        </div>

        {/* Lista completa, sem poluir a tela */}
        <Reveal className="mt-10">
          <button
            type="button"
            onClick={() => setVerTodos((v) => !v)}
            aria-expanded={verTodos}
            aria-controls="todos-servicos"
            className="inline-flex min-h-[44px] items-center gap-2 text-[15px] font-medium tracking-tight text-black"
          >
            {verTodos ? 'Ocultar' : 'Ver todos os serviços'}
            <span className={`transition-transform duration-300 ease-apple ${verTodos ? 'rotate-45' : ''}`}><Icon.plus /></span>
          </button>
          <div id="todos-servicos" className={`grid overflow-hidden transition-all duration-500 ease-apple ${verTodos ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
            <ul className="min-h-0 columns-1 gap-12 sm:columns-2">
              {todos.map((t) => (
                <li key={t} className="break-inside-avoid border-b border-black/[0.06] py-4 text-[17px] tracking-tight">{t}</li>
              ))}
            </ul>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
