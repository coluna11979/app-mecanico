import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Logo } from '@/components/Logo';

// Faixa de hora média no estado (atualizar quando tivermos dados ao vivo)
// Mercado SP: mecânico autônomo cobra entre R$ 80–150/h. Usamos o piso (80) como base conservadora.
const AVG_HOURLY_BRL = 80;

/**
 * Landing de captura — APENAS para mecânico.
 * Estilo claro, alto contraste, gatilhos pesados.
 */
export default function LandingMecanico() {
  const [hoursPerWeek, setHoursPerWeek] = useState(30);
  // Cálculo do líquido — taxa da plataforma aplicada nos bastidores, sem exibir
  const weeklyNet  = Math.round(hoursPerWeek * AVG_HOURLY_BRL * 0.82);
  const monthlyNet = weeklyNet * 4;
  const showOverwork = hoursPerWeek > 40;

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
              className="bg-brand-500 text-white text-sm font-bold rounded-xl px-4 py-2 hover:bg-brand-600 transition shadow-sm">
              Cadastrar
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

            {/* Coluna esquerda — texto */}
            <div>
              <div className="inline-flex items-center gap-2 bg-brand-50 border border-brand-200 rounded-full px-3 py-1 text-xs font-bold text-brand-700 tracking-wider uppercase">
                Para mecânicos autônomos
              </div>

              <h1 className="mt-6 text-4xl sm:text-5xl lg:text-7xl font-bold tracking-tight leading-[1.02] text-steel-900">
                Sua hora.<br />
                Sua agenda.<br />
                <span className="text-brand-500">Seu dinheiro.</span>
              </h1>

              <p className="mt-6 text-lg text-steel-600 leading-relaxed">
                Aceite jobs de oficinas verificadas. Defina o valor da sua hora.
                Trabalhe quantas horas quiser, quando quiser.
                Receba via PIX em até 24h.<br />
                <strong className="text-steel-900">Sem patrão, sem CLT, sem cliente que some.</strong>
              </p>

              <div className="mt-8 flex flex-col sm:flex-row gap-3">
                <Link to="/cadastro/mecanico"
                  className="bg-brand-500 text-white font-bold rounded-2xl px-6 py-4 hover:bg-brand-600 transition flex items-center justify-center gap-2 shadow-xl shadow-brand-500/30">
                  Cadastrar grátis em 2 minutos
                  <span>→</span>
                </Link>
                <Link to="/login" state={{ fresh: true }}
                  className="text-sm font-semibold text-steel-700 hover:text-steel-900 px-4 py-4 transition flex items-center justify-center">
                  Já tenho cadastro
                </Link>
              </div>

              <div className="mt-6 flex items-center gap-4 text-xs text-steel-500 flex-wrap">
                <span className="flex items-center gap-1.5"><span className="text-signal-500">✓</span> Sem mensalidade</span>
                <span className="flex items-center gap-1.5"><span className="text-signal-500">✓</span> Sem fidelidade</span>
                <span className="flex items-center gap-1.5"><span className="text-signal-500">✓</span> Aprovação em 24h</span>
              </div>
            </div>

            {/* Coluna direita — ilustração full no estilo Uber */}
            <div className="relative">
              <HeroIllustration />

              {/* Cards flutuantes — sobrepondo a ilustração */}
              <div className="absolute top-4 -left-2 bg-white/95 backdrop-blur rounded-2xl px-4 py-3 shadow-2xl rotate-[-2deg] border border-steel-100 max-w-[200px]">
                <div className="text-[10px] font-bold text-brand-600 uppercase tracking-widest">Novo job</div>
                <div className="text-sm font-bold text-steel-900 mt-0.5 leading-tight">Pastilha de freio</div>
                <div className="text-[11px] text-steel-500 mt-1">2h · Itaim Bibi · ~3,2 km</div>
              </div>

              <div className="absolute -bottom-3 -right-2 bg-signal-500 text-white rounded-2xl px-4 py-3 shadow-2xl rotate-[3deg]">
                <div className="text-[10px] font-bold uppercase tracking-widest opacity-90">PIX recebido</div>
                <div className="text-2xl font-bold font-display">R$ 164,00</div>
                <div className="text-[10px] opacity-90">há 23h</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── CALCULADORA DE GANHOS ── */}
      <section className="py-20 lg:py-28 px-5 lg:px-8 bg-steel-50">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10 max-w-3xl mx-auto">
            <div className="text-xs font-bold text-brand-600 uppercase tracking-widest">Calcule sua renda</div>
            <h2 className="mt-3 text-3xl lg:text-5xl font-bold tracking-tight leading-tight text-steel-900">
              Quanto você quer <span className="text-brand-500">ganhar</span>?
            </h2>
            <p className="mt-4 text-base text-steel-600">
              Defina as horas que cabem na sua semana. Sem 44h obrigatórias, sem patrão fixando o horário.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6 items-center bg-white rounded-3xl p-6 lg:p-8 shadow-xl border border-steel-100">
            {/* Slider */}
            <div>
              <div className="flex items-baseline justify-between mb-2">
                <span className="text-xs font-bold text-steel-500 uppercase tracking-wider">Horas por semana</span>
                <span className="text-3xl font-bold text-brand-500 font-display">{hoursPerWeek}h</span>
              </div>
              <input
                type="range"
                min={5}
                max={48}
                step={1}
                value={hoursPerWeek}
                onChange={e => setHoursPerWeek(Number(e.target.value))}
                className="w-full accent-brand-500 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-steel-500 font-semibold uppercase tracking-wider mt-1">
                <button type="button" onClick={() => setHoursPerWeek(15)} className="hover:text-brand-600">15h<br /><span className="font-normal normal-case tracking-normal text-steel-400">Complementar</span></button>
                <button type="button" onClick={() => setHoursPerWeek(30)} className="hover:text-brand-600 font-bold text-brand-600">30h<br /><span className="font-normal normal-case tracking-normal text-steel-400">Renda principal</span></button>
                <button type="button" onClick={() => setHoursPerWeek(40)} className="hover:text-brand-600">40h<br /><span className="font-normal normal-case tracking-normal text-steel-400">Foco máximo</span></button>
              </div>

              {showOverwork && (
                <div className="mt-5 bg-pending-50 border border-pending-200 rounded-xl px-3 py-2 text-xs text-pending-800 leading-relaxed">
                  ⚠️ A gente não recomenda passar de 40h. Liberdade também é trabalhar menos quando precisa.
                </div>
              )}
            </div>

            {/* Resultado */}
            <div className="bg-gradient-to-br from-brand-500 to-brand-600 rounded-2xl p-6 text-white shadow-xl shadow-brand-500/30">
              <div className="text-[10px] font-bold uppercase tracking-widest text-white/80">Sua renda estimada</div>
              <div className="mt-1 text-4xl lg:text-5xl font-bold font-display leading-none">
                R$ {weeklyNet.toLocaleString('pt-BR')}
              </div>
              <div className="text-sm text-white/80 mt-1">por semana</div>
              <div className="mt-4 pt-4 border-t border-white/20 flex items-baseline justify-between">
                <span className="text-sm text-white/80">≈ por mês</span>
                <span className="text-xl font-bold font-display">R$ {monthlyNet.toLocaleString('pt-BR')}</span>
              </div>
              <p className="mt-4 text-[11px] text-white/70 leading-relaxed">
                📅 Aproximadamente {(hoursPerWeek / 6).toFixed(1)}h por dia, segunda a sábado.
                Oficina fecha domingo — sua folga é garantida, sem negociar.
              </p>
            </div>
          </div>

          <p className="mt-5 text-center text-xs text-steel-500 max-w-2xl mx-auto leading-relaxed">
            ℹ️ Estimativa baseada na faixa média de R$ {AVG_HOURLY_BRL}/h dos jobs ativos em SP.
            O seu valor depende dos jobs que aceitar e da sua produtividade.
            Sem mensalidade, sem fidelidade, sem multa pra entrar ou sair.
          </p>
        </div>
      </section>

      {/* ── DIFERENCIAL: ZERO INVESTIMENTO (versão enxuta) ── */}
      <section className="py-20 lg:py-28 px-5 lg:px-8">
        <div className="max-w-3xl mx-auto text-center">
          <div className="text-xs font-bold text-brand-600 uppercase tracking-widest">Zero investimento</div>
          <h2 className="mt-3 text-3xl lg:text-5xl font-bold tracking-tight leading-tight text-steel-900">
            Você só leva o que <span className="text-brand-500">ninguém pode replicar</span>:<br />
            seu talento.
          </h2>
          <p className="mt-6 text-lg text-steel-600 leading-relaxed">
            Ferramenta, elevador, peça — tudo da oficina. Você não compra nada, não financia nada,
            não corre atrás de cliente. Coloca a mão de obra, recebe pelo trabalho. Ponto.
          </p>
        </div>
      </section>

      {/* ── DORES ── */}
      <section className="py-20 lg:py-28 px-5 lg:px-8 bg-steel-50">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <div className="text-xs font-bold text-brand-600 uppercase tracking-widest">Você não tá ganhando o que merece</div>
            <h2 className="mt-3 text-3xl lg:text-5xl font-bold tracking-tight text-steel-900">
              Cansado disso?
            </h2>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <Pain title='"Te pago semana que vem"'
              desc="Cliente leva o carro, some. Você fica no prejuízo. De novo." />
            <Pain title="Mês cheio, mês vazio"
              desc="Em janeiro sobra serviço. Em fevereiro, ninguém liga. Sem previsibilidade nenhuma." />
            <Pain title="Oficina fica com metade"
              desc="50/50 é o padrão. Você faz o serviço inteiro e só vê metade. Faz sentido?" />
            <Pain title="Sem reputação digital"
              desc="Faz 15 anos que mecânico de qualidade você é. Só que nenhum cliente novo sabe disso." />
            <Pain title="Indicação ou nada"
              desc="Trabalho só vem por boca a boca. Quando seca a fonte, seca o caixa." />
            <Pain title="CLT te aprisiona"
              desc="Patrão fixo, hora fixa, salário fixo abaixo do que você produz. Não dá pra crescer assim." />
          </div>
        </div>
      </section>

      {/* ── SOLUÇÃO ── */}
      <section className="py-20 lg:py-28 px-5 lg:px-8">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <div className="text-xs font-bold text-brand-600 uppercase tracking-widest">Com o app, é assim</div>
            <h2 className="mt-3 text-3xl lg:text-5xl font-bold tracking-tight leading-tight text-steel-900">
              Você trabalha. <span className="text-brand-500">A gente garante.</span>
            </h2>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <Win title="Você define sua hora"
              desc="Coloca o R$/h que cobra. Aceita só jobs no seu valor. Sem dividir 50/50 com ninguém, sem cobrar cliente." />
            <Win title="PIX em até 24h"
              desc="Oficina confirma o serviço, dinheiro cai na sua conta. Sem espera, sem cobrança." />
            <Win title="Pagamento garantido"
              desc="A oficina paga antes do serviço começar — direto na plataforma. Você nunca mais corre atrás." />
            <Win title="Job no celular"
              desc="Alerta sonoro toda vez que abre demanda na sua região. Aceita o que quiser. Recusa o que não quiser." />
            <Win title="Sua reputação digital"
              desc="Cada serviço bem feito vira nota. Ranking público. Você sobe na fila e ganha mais jobs." />
            <Win title="Liberdade total"
              desc="Sem patrão fixo. Sem CLT. Trabalha quando quer, com quem quer, do jeito que sabe fazer." />
          </div>
        </div>
      </section>

      {/* ── COMO FUNCIONA ── */}
      <section className="py-20 lg:py-28 px-5 lg:px-8 bg-steel-50">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-14">
            <div className="text-xs font-bold text-brand-600 uppercase tracking-widest">Como funciona</div>
            <h2 className="mt-3 text-3xl lg:text-5xl font-bold tracking-tight leading-tight text-steel-900">
              4 passos. Do cadastro ao PIX.
            </h2>
          </div>

          <div className="space-y-3">
            <FlowStep n={1} title="Cadastra grátis"
              desc="2 minutos. CPF, CNH, suas habilidades, valor da hora. Aprovação em até 24h." />
            <FlowStep n={2} title="Aceita job"
              desc="Job aparece no mapa, você vê valor, distância e teto de horas. Aceita com um toque." />
            <FlowStep n={3} title="Executa o serviço"
              desc="Vai até a oficina (ou local marcado), executa, registra horas reais trabalhadas." />
            <FlowStep n={4} title="Recebe via PIX"
              desc="Oficina confirma, você recebe em até 24h. Direto na sua conta. Garantido." />
          </div>
        </div>
      </section>

      {/* ── NÚMEROS ── */}
      <section className="py-20 lg:py-28 px-5 lg:px-8">
        <div className="max-w-5xl mx-auto">
          <div className="grid md:grid-cols-3 gap-4">
            <StatCard n="100%" label="das demandas pré-pagas (escrow)" />
            <StatCard n="24h" label="prazo máximo do PIX" />
            <StatCard n="Sem" label="mensalidade · sem multa pra sair" />
          </div>
        </div>
      </section>

      {/* ── CTA FINAL ── */}
      <section className="py-24 lg:py-32 px-5 lg:px-8 bg-gradient-to-b from-white to-brand-50/30">
        <div className="max-w-3xl mx-auto text-center">
          <div className="text-xs font-bold text-brand-600 uppercase tracking-widest">Sua próxima OS pode ser hoje</div>
          <h2 className="mt-3 text-4xl lg:text-6xl font-bold tracking-tight leading-tight text-steel-900">
            Cadastre-se.<br />
            <span className="text-brand-500">Comece a faturar.</span>
          </h2>
          <p className="mt-6 text-lg text-steel-600">
            Em 2 minutos você está dentro. Aprovado em 24h. Pronto pra aceitar jobs.
          </p>

          <Link to="/cadastro/mecanico"
            className="inline-flex items-center gap-2 mt-10 bg-brand-500 text-white font-bold rounded-2xl px-8 py-5 text-lg hover:bg-brand-600 transition shadow-2xl shadow-brand-500/30">
            Cadastrar grátis agora
            <span>→</span>
          </Link>

          <p className="mt-4 text-xs text-steel-500">
            Sem mensalidade · Sem fidelidade · Sem cartão de crédito
          </p>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="border-t border-steel-100 py-10 px-5 lg:px-8 bg-white">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-steel-500">
          <Link to="/"><Logo /></Link>
          <div className="flex items-center gap-6">
            <Link to="/" className="hover:text-steel-900 transition">Início</Link>
            <Link to="/login" state={{ fresh: true }} className="hover:text-steel-900 transition">Entrar</Link>
          </div>
          <div className="text-xs">© MecânicoApp {new Date().getFullYear()}</div>
        </div>
      </footer>
    </div>
  );
}

/* ─── Componentes auxiliares ─── */

function Pain({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="relative bg-white border border-steel-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition">
      <div className="absolute left-0 top-5 bottom-5 w-0.5 bg-alert-300 rounded-r" />
      <h3 className="font-bold text-base leading-tight text-steel-900 pl-3">{title}</h3>
      <p className="mt-1.5 text-sm text-steel-600 leading-relaxed pl-3">{desc}</p>
    </div>
  );
}

function Win({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="relative bg-white border border-steel-200 rounded-2xl p-5 shadow-sm hover:shadow-lg hover:border-brand-300 transition">
      <div className="absolute left-0 top-5 bottom-5 w-0.5 bg-brand-500 rounded-r" />
      <h3 className="font-bold text-base leading-tight text-steel-900 pl-3">{title}</h3>
      <p className="mt-1.5 text-sm text-steel-600 leading-relaxed pl-3">{desc}</p>
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

function StatCard({ n, label }: { n: string; label: string }) {
  return (
    <div className="bg-gradient-to-br from-brand-50 to-white border-2 border-brand-100 rounded-2xl p-6 text-center shadow-sm">
      <div className="text-5xl font-bold text-brand-500 leading-none">{n}</div>
      <div className="mt-2 text-sm text-steel-600 font-medium">{label}</div>
    </div>
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
