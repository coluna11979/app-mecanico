import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Logo } from '@/components/Logo';
import { mechanicNet } from '@/lib/payment';

/**
 * Landing de captura — APENAS para mecânico / profissional automotivo.
 *
 * Regras de copy (não quebrar):
 * - Serve tanto pra quem tem emprego (renda extra) quanto pra autônomo.
 *   Nada de "largue a CLT" ou discurso só pra desempregado.
 * - Ganho é SIMULAÇÃO, nunca promessa. Sem "PIX em 24h" nem "pagamento
 *   garantido" enquanto o repasse depender de processo manual.
 * - Não chamar o produto de "Uber dos mecânicos".
 * - Taxa da plataforma não aparece em %: o simulador usa mechanicNet().
 */

// Presets do simulador — pensados em rotina real de quem já trabalha.
const PRESETS = [
  { h: 8,  label: 'Só o sábado' },
  { h: 15, label: 'Sábado + 2 noites' },
  { h: 25, label: 'Meio período' },
];

export default function LandingMecanico() {
  const [hoursPerWeek, setHoursPerWeek] = useState(8);
  const [hourlyRate, setHourlyRate]     = useState(80);
  const weeklyNet  = Math.round(mechanicNet(hoursPerWeek * hourlyRate));
  const monthlyNet = weeklyNet * 4;

  return (
    <div className="min-h-screen bg-white text-steel-900 overflow-x-hidden">

      {/* ── NAV ── */}
      <header className="fixed top-0 inset-x-0 z-50 bg-white/90 backdrop-blur-xl border-b border-steel-100">
        <div className="max-w-6xl mx-auto px-5 lg:px-8 h-16 flex items-center justify-between">
          <Link to="/"><Logo /></Link>
          <div className="flex items-center gap-2">
            <Link to="/login" state={{ fresh: true }} className="text-sm font-semibold text-steel-700 hover:text-steel-900 px-3 py-2 transition">
              Entrar
            </Link>
            <Link to="/cadastro/mecanico"
              className="bg-brand-500 text-white text-sm font-bold rounded-xl px-4 py-2 hover:bg-brand-600 transition shadow-sm whitespace-nowrap">
              Cadastrar grátis
            </Link>
          </div>
        </div>
      </header>

      {/* ── HERO ── */}
      <section className="relative pt-28 pb-16 lg:pt-40 lg:pb-24 px-5 lg:px-8 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/3 right-0 w-[600px] h-[600px] rounded-full bg-brand-500/10 blur-3xl" />
          <div className="absolute bottom-0 left-0 w-96 h-96 rounded-full bg-brand-600/5 blur-3xl" />
        </div>

        <div className="relative max-w-5xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">

            <div>
              <div className="inline-flex items-center gap-2 bg-brand-50 border border-brand-200 rounded-full px-3 py-1 text-xs font-bold text-brand-700 tracking-wider uppercase">
                Para mecânicos e profissionais automotivos
              </div>

              <h1 className="mt-6 text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.05] text-steel-900">
                Ganhe mais usando a <span className="text-brand-500">experiência que você já tem.</span>
              </h1>

              <p className="mt-6 text-lg text-steel-600 leading-relaxed">
                Receba oportunidades de serviço em oficinas da sua região, nos horários que você tem livres.
                Use como renda extra, mesmo já tendo emprego, ou como mais uma fonte de trabalho.
                <strong className="text-steel-900"> Você escolhe o que aceita.</strong>
              </p>

              <div className="mt-8 flex flex-col sm:flex-row gap-3">
                <Link to="/cadastro/mecanico"
                  className="bg-brand-500 text-white font-bold rounded-2xl px-6 py-4 hover:bg-brand-600 transition flex items-center justify-center gap-2 shadow-xl shadow-brand-500/30">
                  Quero receber oportunidades
                  <span>→</span>
                </Link>
                <a href="#como-funciona"
                  className="text-sm font-semibold text-steel-700 hover:text-steel-900 px-4 py-4 transition flex items-center justify-center">
                  Ver como funciona
                </a>
              </div>

              <div className="mt-6 flex items-center gap-4 text-xs text-steel-500 flex-wrap">
                <span className="flex items-center gap-1.5"><span className="text-signal-500">✓</span> Cadastro gratuito</span>
                <span className="flex items-center gap-1.5"><span className="text-signal-500">✓</span> Sem mensalidade</span>
                <span className="flex items-center gap-1.5"><span className="text-signal-500">✓</span> Sem horário mínimo</span>
              </div>
            </div>

            <div className="relative">
              <HeroIllustration />

              <div className="absolute top-4 -left-2 bg-white/95 backdrop-blur rounded-2xl px-4 py-3 shadow-2xl rotate-[-2deg] border border-steel-100 max-w-[210px]">
                <div className="text-[10px] font-bold text-brand-600 uppercase tracking-widest">Nova oportunidade</div>
                <div className="text-sm font-bold text-steel-900 mt-0.5 leading-tight">Pastilha de freio</div>
                <div className="text-[11px] text-steel-500 mt-1">Sábado · 2h · ~3 km de você</div>
              </div>

              <div className="absolute -bottom-3 -right-2 bg-white rounded-2xl px-4 py-3 shadow-2xl rotate-[3deg] border border-steel-100 max-w-[210px]">
                <div className="text-[10px] font-bold text-signal-600 uppercase tracking-widest">Avaliação da oficina</div>
                <div className="text-lg text-amber-400 leading-none mt-1">★★★★★</div>
                <div className="text-[11px] text-steel-600 mt-1 leading-snug">"Serviço caprichado. Vamos chamar de novo."</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── PARA QUEM É ── */}
      <section className="py-20 lg:py-24 px-5 lg:px-8 bg-steel-50">
        <div className="max-w-5xl mx-auto">
          <SectionHead kicker="Para quem é"
            title={<>Feito pra quem <span className="text-brand-500">sabe trabalhar</span>, seja qual for a sua rotina.</>} />

          <div className="grid sm:grid-cols-2 gap-4">
            <Card title="Tem emprego e quer renda extra"
              desc="Use folgas, sábados ou o contraturno. Você continua no seu trabalho e soma uma renda complementar quando der." />
            <Card title="Já trabalha por conta"
              desc="Preencha os horários vagos da semana com serviços em oficinas, sem precisar correr atrás de cliente." />
            <Card title="Tem uma especialidade forte"
              desc="Injeção, elétrica, diesel, ar-condicionado, câmbio… Seja encontrado pelo que você faz de melhor." />
            <Card title="Quer construir nome no mercado"
              desc="Cada serviço avaliado vira histórico. Seu trabalho passa a falar por você com novas oficinas." />
          </div>

          <p className="mt-6 text-center text-xs text-steel-500 max-w-2xl mx-auto leading-relaxed">
            Tem carteira assinada? Vale conferir se o seu contrato tem cláusula de exclusividade.
            Na maioria dos casos, trabalhar no tempo livre é permitido.
          </p>
        </div>
      </section>

      {/* ── COMO FUNCIONA ── */}
      <section id="como-funciona" className="py-20 lg:py-28 px-5 lg:px-8 scroll-mt-16">
        <div className="max-w-4xl mx-auto">
          <SectionHead kicker="Como funciona"
            title="Você informa sua rotina. A gente mostra o que encaixa." />

          <div className="space-y-3">
            <FlowStep n={1} title="Monte seu perfil profissional"
              desc="Especialidades, anos de experiência, região onde mora, valor da sua hora e chave PIX. Leva poucos minutos e é gratuito." />
            <FlowStep n={2} title="Nossa equipe analisa o cadastro"
              desc="Conferimos os dados pra manter a rede confiável, para você e para as oficinas. Você recebe o aviso quando for aprovado." />
            <FlowStep n={3} title="Fique disponível quando puder"
              desc="Ativou, recebe alertas. Desativou, ninguém te chama. Pode ser só no sábado, só à noite ou a semana toda." />
            <FlowStep n={4} title="Escolha o serviço"
              desc="Antes de aceitar você vê o serviço, a oficina, a distância, as horas estimadas e o valor. Aceita o que fizer sentido, recusa o resto, sem penalidade." />
            <FlowStep n={5} title="Execute e registre"
              desc="Faz o serviço na oficina, com a estrutura dela. A oficina confirma, o valor entra no seu histórico de ganhos e o pagamento vai para a sua chave PIX." />
          </div>
        </div>
      </section>

      {/* ── BENEFÍCIOS ── */}
      <section className="py-20 lg:py-28 px-5 lg:px-8 bg-steel-50">
        <div className="max-w-5xl mx-auto">
          <SectionHead kicker="Por que usar"
            title={<>Mais trabalho, <span className="text-brand-500">do seu jeito.</span></>} />

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <Card title="Renda complementar"
              desc="Transforme horas livres em dinheiro, sem largar o que você já tem." />
            <Card title="Seus horários"
              desc="Sem jornada mínima. Disponibilidade parcial é bem-vinda: uma tarde por semana já conta." />
            <Card title="Sua região"
              desc="Você vê a distância de cada serviço e escolhe até onde vale a pena ir." />
            <Card title="Suas especialidades"
              desc="Cadastre o que você domina e receba oportunidades compatíveis com o seu conhecimento." />
            <Card title="Estrutura da oficina"
              desc="Elevador, ferramental e peças ficam por conta da oficina. Você entra com a mão de obra." />
            <Card title="Valor claro antes de aceitar"
              desc="Você vê quanto vai receber antes de dizer sim. Nada de combinar no fio do bigode." />
          </div>
        </div>
      </section>

      {/* ── SIMULADOR ── */}
      <section className="py-20 lg:py-28 px-5 lg:px-8">
        <div className="max-w-5xl mx-auto">
          <SectionHead kicker="Simulador"
            title={<>Quanto suas horas livres <span className="text-brand-500">podem render?</span></>}
            sub="Ajuste as horas e o valor da sua hora. É só uma simulação para você ter uma ideia." />

          <div className="grid md:grid-cols-2 gap-6 items-center bg-white rounded-3xl p-6 lg:p-8 shadow-xl border border-steel-100">
            <div className="space-y-7">
              <div>
                <div className="flex items-baseline justify-between mb-2">
                  <span className="text-xs font-bold text-steel-500 uppercase tracking-wider">Horas livres por semana</span>
                  <span className="text-3xl font-bold text-brand-500 font-display">{hoursPerWeek}h</span>
                </div>
                <input type="range" min={2} max={40} step={1} value={hoursPerWeek}
                  onChange={e => setHoursPerWeek(Number(e.target.value))}
                  aria-label="Horas livres por semana"
                  className="w-full accent-brand-500 cursor-pointer" />
                <div className="mt-3 flex flex-wrap gap-2">
                  {PRESETS.map(p => (
                    <button key={p.h} type="button" onClick={() => setHoursPerWeek(p.h)}
                      className={`text-xs font-semibold rounded-full px-3 py-1.5 border transition ${hoursPerWeek === p.h
                        ? 'bg-brand-500 border-brand-500 text-white'
                        : 'bg-white border-steel-200 text-steel-600 hover:border-brand-300'}`}>
                      {p.label} · {p.h}h
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-baseline justify-between mb-2">
                  <span className="text-xs font-bold text-steel-500 uppercase tracking-wider">Valor da sua hora</span>
                  <span className="text-3xl font-bold text-brand-500 font-display">R$ {hourlyRate}</span>
                </div>
                <input type="range" min={50} max={150} step={5} value={hourlyRate}
                  onChange={e => setHourlyRate(Number(e.target.value))}
                  aria-label="Valor da sua hora"
                  className="w-full accent-brand-500 cursor-pointer" />
              </div>
            </div>

            <div className="bg-gradient-to-br from-brand-500 to-brand-600 rounded-2xl p-6 text-white shadow-xl shadow-brand-500/30">
              <div className="text-[10px] font-bold uppercase tracking-widest text-white/80">Simulação · valor líquido</div>
              <div className="mt-1 text-4xl lg:text-5xl font-bold font-display leading-none">
                R$ {weeklyNet.toLocaleString('pt-BR')}
              </div>
              <div className="text-sm text-white/80 mt-1">por semana</div>
              <div className="mt-4 pt-4 border-t border-white/20 flex items-baseline justify-between">
                <span className="text-sm text-white/80">≈ por mês</span>
                <span className="text-xl font-bold font-display">R$ {monthlyNet.toLocaleString('pt-BR')}</span>
              </div>
            </div>
          </div>

          <p className="mt-5 text-center text-xs text-steel-500 max-w-2xl mx-auto leading-relaxed">
            Simulação ilustrativa, não é promessa nem garantia de ganho. Considera que todas as horas informadas
            foram preenchidas com serviços e já desconta a taxa da plataforma. O resultado real depende da demanda
            na sua região, dos serviços que você aceitar e do valor de cada um.
          </p>
        </div>
      </section>

      {/* ── REPUTAÇÃO E RELACIONAMENTO ── */}
      <section className="py-20 lg:py-28 px-5 lg:px-8 bg-steel-900 text-white">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14 max-w-3xl mx-auto">
            <div className="text-xs font-bold text-brand-400 uppercase tracking-widest">Reputação profissional</div>
            <h2 className="mt-3 text-3xl lg:text-5xl font-bold tracking-tight leading-tight">
              Seu trabalho bem feito <span className="text-brand-400">vira histórico.</span>
            </h2>
            <p className="mt-4 text-base text-steel-300">
              Hoje a sua competência depende de indicação boca a boca. Aqui ela fica registrada e é vista por cada oficina nova.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            <DarkCard title="Avaliação a cada serviço"
              desc="A oficina avalia o seu trabalho. A sua nota e os comentários formam o seu perfil profissional." />
            <DarkCard title="Histórico que acumula"
              desc="Serviços feitos, especialidades e anos de experiência ficam no seu perfil. É o seu currículo prático." />
            <DarkCard title="Oficinas que voltam a chamar"
              desc="Oficina que gosta do seu trabalho tende a chamar de novo. É assim que nasce um relacionamento recorrente." />
          </div>

          <p className="mt-8 text-center text-sm text-steel-400">
            E a avaliação vale nos dois sentidos: você também avalia a oficina.
          </p>
        </div>
      </section>

      {/* ── CONFIANÇA ── */}
      <section className="py-20 lg:py-28 px-5 lg:px-8">
        <div className="max-w-5xl mx-auto">
          <SectionHead kicker="Confiança"
            title="Tudo combinado e registrado." />

          <div className="grid sm:grid-cols-2 gap-4">
            <Card title="Oficinas analisadas"
              desc="Toda oficina passa por análise da nossa equipe antes de publicar serviços." />
            <Card title="Valor definido antes de começar"
              desc="Serviço, horas estimadas e valor ficam claros na tela antes de você aceitar." />
            <Card title="Horas e confirmação registradas"
              desc="Você registra as horas trabalhadas e a oficina confirma a conclusão. Fica tudo documentado na plataforma." />
            <Card title="Recebimento via PIX, com histórico"
              desc="O pagamento vai para a chave PIX do seu cadastro. Na área Ganhos você acompanha cada serviço e cada valor." />
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="py-20 lg:py-28 px-5 lg:px-8 bg-steel-50">
        <div className="max-w-3xl mx-auto">
          <SectionHead kicker="Dúvidas" title="Perguntas frequentes" />
          <div className="space-y-3">
            {FAQ.map(f => <FaqItem key={f.q} q={f.q} a={f.a} />)}
          </div>
        </div>
      </section>

      {/* ── CTA FINAL ── */}
      <section className="py-24 lg:py-32 px-5 lg:px-8 bg-gradient-to-b from-white to-brand-50/40">
        <div className="max-w-3xl mx-auto text-center">
          <div className="text-xs font-bold text-brand-600 uppercase tracking-widest">Comece no seu ritmo</div>
          <h2 className="mt-3 text-4xl lg:text-6xl font-bold tracking-tight leading-tight text-steel-900">
            Sua experiência<br />
            <span className="text-brand-500">vale mais do que você imagina.</span>
          </h2>
          <p className="mt-6 text-lg text-steel-600">
            Crie seu perfil grátis, informe suas especialidades e comece a receber oportunidades que cabem na sua rotina.
          </p>

          <Link to="/cadastro/mecanico"
            className="inline-flex items-center gap-2 mt-10 bg-brand-500 text-white font-bold rounded-2xl px-8 py-5 text-lg hover:bg-brand-600 transition shadow-2xl shadow-brand-500/30">
            Criar meu perfil grátis
            <span>→</span>
          </Link>

          <p className="mt-4 text-xs text-steel-500">
            Sem mensalidade · Sem horário mínimo · Sai quando quiser
          </p>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="border-t border-steel-100 py-10 px-5 lg:px-8 bg-white">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-steel-500">
          <Link to="/"><Logo /></Link>
          <div className="flex items-center gap-6 flex-wrap justify-center">
            <Link to="/" className="hover:text-steel-900 transition">Início</Link>
            <Link to="/termos" className="hover:text-steel-900 transition">Termos</Link>
            <Link to="/privacidade" className="hover:text-steel-900 transition">Privacidade</Link>
            <Link to="/login" state={{ fresh: true }} className="hover:text-steel-900 transition">Entrar</Link>
          </div>
          <div className="text-xs">© MecânicoApp {new Date().getFullYear()}</div>
        </div>
      </footer>
    </div>
  );
}

/* ─── FAQ ─── */

const FAQ: { q: string; a: string }[] = [
  { q: 'Posso usar mesmo tendo carteira assinada?',
    a: 'Pode. A plataforma foi pensada também pra quem quer renda extra no tempo livre: folgas, sábados, contraturno. Só vale conferir se o seu contrato tem cláusula de exclusividade.' },
  { q: 'Preciso ficar disponível um número mínimo de horas?',
    a: 'Não. Você fica disponível quando puder e desativa quando não puder. Não existe jornada mínima nem penalidade por recusar serviço.' },
  { q: 'Quanto custa?',
    a: 'O cadastro é gratuito e não tem mensalidade. A plataforma só fica com uma parte quando você faz um serviço, e o valor que aparece pra você antes de aceitar já é o que você recebe.' },
  { q: 'Quanto eu vou ganhar?',
    a: 'Depende da demanda na sua região, do valor da sua hora e de quantos serviços você aceitar. O simulador desta página dá uma ideia, mas não é uma garantia de ganho.' },
  { q: 'Como eu recebo?',
    a: 'Depois que a oficina confirma a conclusão do serviço, o valor entra no seu histórico de ganhos e o pagamento é feito na chave PIX do seu cadastro.' },
  { q: 'Preciso ter ferramenta ou oficina própria?',
    a: 'Não. O serviço é feito na oficina, com a estrutura dela: elevador, ferramental e peças. Você entra com a mão de obra e o conhecimento.' },
  { q: 'Como escolho a região e o tipo de serviço?',
    a: 'Você informa onde mora e quais são suas especialidades. Cada oportunidade mostra o serviço, a oficina e a distância, e você só aceita o que fizer sentido.' },
  { q: 'Quanto tempo leva a aprovação?',
    a: 'A nossa equipe analisa cada cadastro para manter a rede confiável. Você recebe o aviso assim que for aprovado.' },
  { q: 'Preciso de CNPJ ou MEI?',
    a: 'Para começar, não: o cadastro é feito com CPF. Se no futuro algum tipo de serviço exigir formalização, a gente avisa com antecedência.' },
  { q: 'Posso sair quando quiser?',
    a: 'Sim. Não há fidelidade nem multa. Basta parar de ficar disponível ou pedir a exclusão da conta.' },
];

/* ─── Componentes auxiliares ─── */

function SectionHead({ kicker, title, sub }: { kicker: string; title: ReactNode; sub?: string }) {
  return (
    <div className="text-center mb-12 max-w-3xl mx-auto">
      <div className="text-xs font-bold text-brand-600 uppercase tracking-widest">{kicker}</div>
      <h2 className="mt-3 text-3xl lg:text-5xl font-bold tracking-tight leading-tight text-steel-900">{title}</h2>
      {sub && <p className="mt-4 text-base text-steel-600">{sub}</p>}
    </div>
  );
}

function Card({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="relative bg-white border border-steel-200 rounded-2xl p-5 shadow-sm hover:shadow-lg hover:border-brand-300 transition">
      <div className="absolute left-0 top-5 bottom-5 w-0.5 bg-brand-500 rounded-r" />
      <h3 className="font-bold text-base leading-tight text-steel-900 pl-3">{title}</h3>
      <p className="mt-1.5 text-sm text-steel-600 leading-relaxed pl-3">{desc}</p>
    </div>
  );
}

function DarkCard({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="bg-steel-800/60 border border-steel-700 rounded-2xl p-5">
      <h3 className="font-bold text-base leading-tight text-white">{title}</h3>
      <p className="mt-1.5 text-sm text-steel-300 leading-relaxed">{desc}</p>
    </div>
  );
}

function FlowStep({ n, title, desc }: { n: number; title: string; desc: string }) {
  return (
    <div className="flex items-start gap-4 bg-white border border-steel-200 rounded-2xl p-5 shadow-sm hover:shadow-md hover:border-brand-200 transition">
      <div className="h-12 w-12 rounded-full bg-brand-500 grid place-items-center font-bold text-xl shrink-0 shadow-lg shadow-brand-500/30 text-white">
        {n}
      </div>
      <div>
        <h3 className="font-bold text-lg leading-tight text-steel-900">{title}</h3>
        <p className="mt-1 text-sm text-steel-600 leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}

function FaqItem({ q, a }: { q: string; a: string }) {
  return (
    <details className="group bg-white border border-steel-200 rounded-2xl px-5 py-4 shadow-sm open:border-brand-200">
      <summary className="flex items-center justify-between gap-4 cursor-pointer list-none font-bold text-steel-900">
        {q}
        <span className="text-brand-500 text-xl leading-none transition group-open:rotate-45">+</span>
      </summary>
      <p className="mt-3 text-sm text-steel-600 leading-relaxed">{a}</p>
    </details>
  );
}

/* ─── Ilustração do hero — cena estilizada com cidade ao entardecer,
   celular montado mostrando rota até a oficina ─── */
function HeroIllustration() {
  return (
    <svg
      viewBox="0 0 600 560"
      className="w-full h-auto rounded-3xl shadow-2xl"
      style={{ background: 'linear-gradient(180deg,#FF8042 0%,#E04E07 22%,#3A1A1F 60%,#0B1117 100%)' }}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="windowGlow" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFC890" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#FF5C0A" stopOpacity="0.6" />
        </linearGradient>
        <linearGradient id="phoneScreen" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1A2530" />
          <stop offset="100%" stopColor="#0B1117" />
        </linearGradient>
        <radialGradient id="sunGlow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="#FFE6CC" stopOpacity="1" />
          <stop offset="50%" stopColor="#FF8042" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#FF5C0A" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Sol no horizonte */}
      <circle cx="430" cy="200" r="130" fill="url(#sunGlow)" />
      <circle cx="430" cy="200" r="42" fill="#FFE6CC" opacity="0.95" />

      {/* Skyline distante (mais claro/desfocado) */}
      <g fill="#2A1820" opacity="0.85">
        <rect x="0"   y="220" width="50" height="110" />
        <rect x="48"  y="200" width="36" height="130" />
        <rect x="80"  y="180" width="48" height="150" />
        <rect x="124" y="210" width="32" height="120" />
        <rect x="152" y="170" width="58" height="160" />
        <rect x="206" y="200" width="40" height="130" />
        <rect x="244" y="190" width="44" height="140" />
        <rect x="286" y="220" width="34" height="110" />
        <rect x="318" y="200" width="46" height="130" />
        <rect x="500" y="200" width="38" height="130" />
        <rect x="534" y="180" width="44" height="150" />
        <rect x="572" y="210" width="28" height="120" />
      </g>

      {/* Skyline próximo (mais escuro) */}
      <g fill="#0B1117">
        <rect x="0"   y="280" width="70" height="100" rx="1" />
        <rect x="66"  y="250" width="56" height="130" rx="1" />
        <rect x="118" y="270" width="42" height="110" rx="1" />
        <rect x="158" y="240" width="62" height="140" rx="1" />
        <rect x="216" y="260" width="48" height="120" rx="1" />
        <rect x="260" y="230" width="68" height="150" rx="1" />
        <rect x="324" y="270" width="40" height="110" rx="1" />
        <rect x="500" y="260" width="50" height="120" rx="1" />
        <rect x="546" y="240" width="54" height="140" rx="1" />
      </g>

      {/* Janelas acesas — pontinhos quentes */}
      <g fill="url(#windowGlow)">
        {[
          [12,300],[18,320],[12,340],[24,300],[24,340],
          [80,270],[88,290],[80,310],[88,330],[80,350],
          [130,290],[138,310],[130,330],[138,350],
          [170,270],[178,290],[186,290],[170,310],[186,330],[178,350],
          [232,280],[240,300],[232,320],[248,300],[240,340],
          [276,250],[284,270],[292,270],[276,290],[300,290],[284,310],[300,330],[276,350],
          [510,280],[518,300],[510,320],[518,340],
          [556,260],[564,280],[572,280],[556,300],[572,320],[564,340],
        ].map(([x, y], i) => (
          <rect key={i} x={x} y={y} width="3.5" height="3.5" rx="0.5" />
        ))}
      </g>

      {/* Marcador da oficina (à direita, brilhando) */}
      <g transform="translate(388, 280)">
        <circle r="22" fill="#FF5C0A" opacity="0.25" />
        <circle r="14" fill="#FF5C0A" opacity="0.55" />
        <circle r="8" fill="#FFE6CC" />
        <text y="-26" textAnchor="middle" fontSize="9" fontWeight="700"
          fill="#FFE6CC" style={{ letterSpacing: '0.15em' }}>OFICINA</text>
      </g>

      {/* Estrada (visão em perspectiva — base larga, topo estreito) */}
      <polygon points="0,560 600,560 410,360 190,360" fill="#1A1F26" />
      <polygon points="0,560 600,560 410,360 190,360" fill="#0B1117" opacity="0.3" />

      {/* Faixas centrais da estrada (rota até a oficina) */}
      <g stroke="#FF5C0A" strokeWidth="4" strokeLinecap="round" fill="none">
        <line x1="300" y1="360" x2="305" y2="380" opacity="0.4" />
        <line x1="306" y1="395" x2="312" y2="420" opacity="0.55" />
        <line x1="313" y1="438" x2="320" y2="465" opacity="0.7" />
        <line x1="321" y1="485" x2="329" y2="515" opacity="0.85" />
        <line x1="330" y1="535" x2="338" y2="560" opacity="1" />
      </g>

      {/* Dashboard / painel do veículo na parte de baixo */}
      <path d="M 0 440 Q 300 460 600 440 L 600 560 L 0 560 Z" fill="#0B1117" />
      <path d="M 0 440 Q 300 470 600 440" stroke="#FF5C0A" strokeWidth="1" opacity="0.3" fill="none" />

      {/* Suporte do celular (haste curta saindo do dashboard) */}
      <rect x="146" y="430" width="6" height="22" fill="#0B1117" />
      <rect x="138" y="448" width="22" height="6" rx="2" fill="#0B1117" />

      {/* CELULAR montado no dashboard — protagonista da cena */}
      <g transform="translate(80, 280)">
        {/* moldura externa */}
        <rect x="0" y="0" width="200" height="170" rx="22" fill="#0B1117" stroke="#1F2A33" strokeWidth="1.5" />
        {/* tela */}
        <rect x="6" y="8" width="188" height="154" rx="16" fill="url(#phoneScreen)" />

        {/* status bar */}
        <rect x="14" y="14" width="40" height="3" rx="1.5" fill="#3A4452" />
        <circle cx="180" cy="16" r="2" fill="#16C784" />

        {/* "mapa" — área verde claro com rota */}
        <rect x="12" y="24" width="176" height="100" rx="8" fill="#1F2A33" />
        {/* "ruas" do mapa — linhas finas */}
        <g stroke="#2D3848" strokeWidth="1" fill="none">
          <line x1="12" y1="44" x2="188" y2="44" />
          <line x1="12" y1="74" x2="188" y2="74" />
          <line x1="12" y1="104" x2="188" y2="104" />
          <line x1="46" y1="24" x2="46" y2="124" />
          <line x1="100" y1="24" x2="100" y2="124" />
          <line x1="150" y1="24" x2="150" y2="124" />
        </g>
        {/* rota laranja desenhada no mapa */}
        <path d="M 30 110 Q 60 90, 80 80 T 130 60 T 170 40"
          stroke="#FF5C0A" strokeWidth="3" fill="none" strokeLinecap="round" />
        {/* ponto de origem (mecânico) */}
        <circle cx="30" cy="110" r="5" fill="#16C784" stroke="#fff" strokeWidth="1.5" />
        {/* ponto de destino (oficina) */}
        <circle cx="170" cy="40" r="6" fill="#FF5C0A" stroke="#fff" strokeWidth="1.5" />

        {/* card de detalhe abaixo do mapa */}
        <rect x="12" y="132" width="176" height="26" rx="6" fill="#1F2A33" />
        <circle cx="22" cy="145" r="5" fill="#FF5C0A" />
        <rect x="33" y="139" width="76" height="4" rx="1" fill="#E1E7EE" />
        <rect x="33" y="148" width="50" height="3" rx="1" fill="#6B7480" />
        <rect x="148" y="138" width="34" height="14" rx="3" fill="#FF5C0A" />
        <text x="165" y="148" textAnchor="middle" fontSize="7" fontWeight="700" fill="#fff">ACEITAR</text>
      </g>

      {/* leve brilho do farol no chão à frente */}
      <ellipse cx="300" cy="540" rx="170" ry="14" fill="#FF5C0A" opacity="0.08" />
    </svg>
  );
}
