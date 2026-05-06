import { Link } from 'react-router-dom';
import { Logo } from '@/components/Logo';

/**
 * Landing page de captura — APENAS para mecânico.
 * Gatilhos pesados, dores reais, benefícios claros, CTA único: cadastro.
 */
export default function LandingMecanico() {
  return (
    <div className="min-h-screen bg-steel-950 text-white overflow-x-hidden">

      {/* ── NAV ── */}
      <header className="fixed top-0 inset-x-0 z-50 bg-steel-950/80 backdrop-blur-xl border-b border-steel-800">
        <div className="max-w-6xl mx-auto px-5 lg:px-8 h-16 flex items-center justify-between">
          <Link to="/"><Logo light /></Link>
          <div className="flex items-center gap-2">
            <Link to="/login" className="text-sm font-semibold text-steel-300 hover:text-white px-3 py-2 transition">
              Entrar
            </Link>
            <Link to="/cadastro/mecanico"
              className="bg-brand-500 text-white text-sm font-bold rounded-xl px-4 py-2 hover:bg-brand-600 transition">
              Cadastrar
            </Link>
          </div>
        </div>
      </header>

      {/* ── HERO ── */}
      <section className="relative pt-28 pb-16 lg:pt-40 lg:pb-24 px-5 lg:px-8">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/3 right-0 w-[600px] h-[600px] rounded-full bg-brand-500/20 blur-3xl" />
          <div className="absolute bottom-0 left-0 w-96 h-96 rounded-full bg-brand-600/10 blur-3xl" />
        </div>

        <div className="relative max-w-5xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">

            {/* Coluna esquerda — texto */}
            <div>
              <div className="inline-flex items-center gap-2 bg-brand-500/15 border border-brand-500/30 rounded-full px-3 py-1 text-xs font-bold text-brand-300 tracking-wider uppercase">
                🔧 Para mecânicos autônomos
              </div>

              <h1 className="mt-6 text-5xl lg:text-6xl font-bold tracking-tight leading-[1.05]">
                <span className="text-brand-400">82%</span> pra você.<br />
                Sempre.
              </h1>

              <p className="mt-6 text-lg text-steel-300 leading-relaxed">
                Pare de dividir <strong className="text-white">50/50</strong> com a oficina.
                Pare de cobrar cliente que some.
                Pare de aceitar trabalho desvalorizado.<br />
                <strong className="text-white">Sua hora vale mais — e aqui ela é paga direito.</strong>
              </p>

              {/* CTAs */}
              <div className="mt-8 flex flex-col sm:flex-row gap-3">
                <Link to="/cadastro/mecanico"
                  className="bg-brand-500 text-white font-bold rounded-2xl px-6 py-4 hover:bg-brand-600 transition flex items-center justify-center gap-2 shadow-xl shadow-brand-500/30">
                  Cadastrar grátis em 2 minutos
                  <span>→</span>
                </Link>
                <Link to="/login"
                  className="text-sm font-semibold text-steel-300 hover:text-white px-4 py-4 transition flex items-center justify-center">
                  Já tenho cadastro
                </Link>
              </div>

              <div className="mt-6 flex items-center gap-4 text-xs text-steel-500">
                <div className="flex items-center gap-1.5"><span className="text-signal-400">✓</span> Sem mensalidade</div>
                <div className="flex items-center gap-1.5"><span className="text-signal-400">✓</span> Sem fidelidade</div>
                <div className="flex items-center gap-1.5"><span className="text-signal-400">✓</span> Aprovação em 24h</div>
              </div>
            </div>

            {/* Coluna direita — mock visual */}
            <div className="relative">
              <div className="bg-gradient-to-br from-steel-800 to-steel-900 rounded-3xl p-6 shadow-2xl border border-steel-700">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-[10px] font-bold text-brand-400 uppercase tracking-widest">Job disponível</span>
                  <span className="text-[10px] text-steel-500">há 2 min</span>
                </div>
                <h3 className="text-2xl font-bold leading-tight">Troca de pastilha de freio + sangria</h3>
                <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                  <div className="bg-steel-800/60 rounded-xl py-2">
                    <div className="text-[9px] text-steel-500 uppercase tracking-wider">R$/h</div>
                    <div className="text-lg font-bold text-brand-400 mt-0.5">R$ 90</div>
                  </div>
                  <div className="bg-steel-800/60 rounded-xl py-2">
                    <div className="text-[9px] text-steel-500 uppercase tracking-wider">Máx</div>
                    <div className="text-lg font-bold text-white mt-0.5">2h</div>
                  </div>
                  <div className="bg-signal-500/15 border border-signal-500/30 rounded-xl py-2">
                    <div className="text-[9px] text-signal-400 uppercase tracking-wider">Você</div>
                    <div className="text-lg font-bold text-signal-400 mt-0.5">R$ 148</div>
                  </div>
                </div>
                <div className="mt-4 text-xs text-steel-400">
                  🏭 Auto Centro Veloz · Itaim Bibi
                </div>
                <button className="mt-4 w-full bg-brand-500 text-white font-bold rounded-xl py-3 text-sm">
                  Aceitar job
                </button>
              </div>

              {/* Floating cards */}
              <div className="absolute -bottom-4 -left-4 bg-signal-500 text-white rounded-2xl px-4 py-3 shadow-xl rotate-[-3deg]">
                <div className="text-[10px] font-bold uppercase tracking-widest opacity-80">PIX recebido</div>
                <div className="text-2xl font-bold">R$ 148,00</div>
                <div className="text-[10px] opacity-80">há 23h</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── DORES (problema) ── */}
      <section className="py-20 lg:py-28 px-5 lg:px-8 border-t border-steel-800">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <div className="text-xs font-bold text-brand-400 uppercase tracking-widest">Você não tá ganhando o que merece</div>
            <h2 className="mt-3 text-3xl lg:text-5xl font-bold tracking-tight">
              Cansado disso?
            </h2>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <Pain emoji="💸" title='"Te pago semana que vem"'
              desc="Cliente leva o carro, some. Você fica no prejuízo. De novo." />
            <Pain emoji="📉" title="Mês cheio, mês vazio"
              desc="Em janeiro sobra serviço. Em fevereiro, ninguém liga. Sem previsibilidade nenhuma." />
            <Pain emoji="✂️" title="Oficina fica com metade"
              desc="50/50 é o padrão. Você faz o serviço inteiro e só vê metade. Faz sentido?" />
            <Pain emoji="🤐" title="Sem reputação digital"
              desc="Faz 15 anos que mecânico de qualidade você é. Só que nenhum cliente novo sabe disso." />
            <Pain emoji="📵" title="Indicação ou nada"
              desc="Trabalho só vem por boca a boca. Quando seca a fonte, seca o caixa." />
            <Pain emoji="🚫" title="CLT te aprisiona"
              desc="Patrão fixo, hora fixa, salário fixo abaixo do que você produz. Não dá pra crescer assim." />
          </div>
        </div>
      </section>

      {/* ── SOLUÇÃO (com o app) ── */}
      <section className="py-20 lg:py-28 px-5 lg:px-8 bg-gradient-to-b from-steel-950 via-steel-900 to-steel-950">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <div className="text-xs font-bold text-brand-400 uppercase tracking-widest">Com o app, é assim</div>
            <h2 className="mt-3 text-3xl lg:text-5xl font-bold tracking-tight leading-tight">
              Você trabalha. <span className="text-brand-400">A gente garante.</span>
            </h2>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <Win emoji="💰" title="82% pra você. Não 50%."
              desc="A plataforma cobra 18%. O resto é seu. Sempre. Sem pegadinha, sem desconto extra." />
            <Win emoji="⚡" title="PIX em até 24h"
              desc="Oficina confirma o serviço, dinheiro cai na sua conta. Sem espera, sem cobrança." />
            <Win emoji="🛡️" title="Pagamento garantido"
              desc="O cliente paga ANTES do serviço começar — direto na plataforma. Você nunca mais corre atrás." />
            <Win emoji="📲" title="Job no celular"
              desc="Alerta sonoro toda vez que abre demanda na sua região. Aceita o que quiser. Recusa o que não quiser." />
            <Win emoji="⭐" title="Sua reputação digital"
              desc="Cada serviço bem feito vira nota. Ranking público. Você sobe na fila e ganha mais jobs." />
            <Win emoji="🗽" title="Liberdade total"
              desc="Sem patrão fixo. Sem CLT. Trabalha quando quer, com quem quer, do jeito que sabe fazer." />
          </div>
        </div>
      </section>

      {/* ── COMO FUNCIONA ── */}
      <section className="py-20 lg:py-28 px-5 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-14">
            <div className="text-xs font-bold text-brand-400 uppercase tracking-widest">Como funciona</div>
            <h2 className="mt-3 text-3xl lg:text-5xl font-bold tracking-tight leading-tight">
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

      {/* ── PROVA SOCIAL (mockada) ── */}
      <section className="py-20 lg:py-28 px-5 lg:px-8 border-t border-steel-800">
        <div className="max-w-5xl mx-auto">
          <div className="grid md:grid-cols-3 gap-4">
            <StatCard n="82%" label="do valor pra você" />
            <StatCard n="24h" label="prazo máximo do PIX" />
            <StatCard n="Zero" label="mensalidade ou taxa fixa" />
          </div>
        </div>
      </section>

      {/* ── CTA FINAL ── */}
      <section className="py-24 lg:py-32 px-5 lg:px-8">
        <div className="max-w-3xl mx-auto text-center">
          <div className="text-xs font-bold text-brand-400 uppercase tracking-widest">Sua próxima OS pode ser hoje</div>
          <h2 className="mt-3 text-4xl lg:text-6xl font-bold tracking-tight leading-tight">
            Cadastre-se.<br />
            <span className="text-brand-400">Comece a faturar.</span>
          </h2>
          <p className="mt-6 text-lg text-steel-400">
            Em 2 minutos você está dentro. Aprovado em 24h. Pronto pra aceitar jobs.
          </p>

          <Link to="/cadastro/mecanico"
            className="inline-flex items-center gap-2 mt-10 bg-brand-500 text-white font-bold rounded-2xl px-8 py-5 text-lg hover:bg-brand-600 transition shadow-2xl shadow-brand-500/30">
            Cadastrar grátis agora
            <span>→</span>
          </Link>

          <p className="mt-4 text-xs text-steel-500">
            Sem mensalidade. Sem fidelidade. Sem cartão de crédito.
          </p>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="border-t border-steel-800 py-10 px-5 lg:px-8">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-steel-500">
          <Link to="/"><Logo light /></Link>
          <div className="flex items-center gap-6">
            <Link to="/" className="hover:text-white transition">Início</Link>
            <Link to="/oficina" className="hover:text-white transition">Sou oficina</Link>
            <Link to="/login" className="hover:text-white transition">Entrar</Link>
          </div>
          <div className="text-xs">© MecânicoApp {new Date().getFullYear()}</div>
        </div>
      </footer>
    </div>
  );
}

/* ─── Componentes auxiliares ─── */

function Pain({ emoji, title, desc }: { emoji: string; title: string; desc: string }) {
  return (
    <div className="bg-steel-900/40 border border-steel-800 rounded-2xl p-5 flex gap-4">
      <div className="text-3xl shrink-0">{emoji}</div>
      <div>
        <h3 className="font-bold text-base leading-tight">{title}</h3>
        <p className="mt-1.5 text-sm text-steel-400 leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}

function Win({ emoji, title, desc }: { emoji: string; title: string; desc: string }) {
  return (
    <div className="bg-gradient-to-br from-steel-900/80 to-steel-900/40 border border-brand-500/20 rounded-2xl p-5 flex gap-4 hover:border-brand-500/40 transition">
      <div className="text-3xl shrink-0">{emoji}</div>
      <div>
        <h3 className="font-bold text-base leading-tight text-brand-300">{title}</h3>
        <p className="mt-1.5 text-sm text-steel-300 leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}

function FlowStep({ n, title, desc }: { n: number; title: string; desc: string }) {
  return (
    <div className="flex items-start gap-4 bg-steel-900/40 border border-steel-800 rounded-2xl p-5 hover:border-brand-500/30 transition">
      <div className="h-12 w-12 rounded-full bg-brand-500 grid place-items-center font-bold text-xl shrink-0 shadow-lg shadow-brand-500/30">
        {n}
      </div>
      <div>
        <h3 className="font-bold text-lg leading-tight">{title}</h3>
        <p className="mt-1 text-sm text-steel-400 leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}

function StatCard({ n, label }: { n: string; label: string }) {
  return (
    <div className="bg-gradient-to-br from-brand-500/10 to-transparent border border-brand-500/20 rounded-2xl p-6 text-center">
      <div className="text-5xl font-bold text-brand-400 leading-none">{n}</div>
      <div className="mt-2 text-sm text-steel-400">{label}</div>
    </div>
  );
}
