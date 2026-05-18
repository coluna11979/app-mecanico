import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Logo } from '@/components/Logo';

// Faixa de hora média no estado (atualizar quando tivermos dados ao vivo)
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
                🔧 Para mecânicos autônomos
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

            {/* Coluna direita — mock visual (dark p/ contraste) */}
            <div className="relative">
              <div className="bg-gradient-to-br from-steel-900 to-steel-800 rounded-3xl p-6 shadow-2xl">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-[10px] font-bold text-brand-400 uppercase tracking-widest">Job disponível</span>
                  <span className="text-[10px] text-steel-400">há 2 min</span>
                </div>
                <h3 className="text-2xl font-bold leading-tight text-white">Troca de pastilha de freio + sangria</h3>
                <div className="mt-4 grid grid-cols-2 gap-2 text-center">
                  <div className="bg-white/10 rounded-xl py-2">
                    <div className="text-[9px] text-steel-300 uppercase tracking-wider">Horas previstas</div>
                    <div className="text-lg font-bold text-white mt-0.5">2h</div>
                  </div>
                  <div className="bg-signal-500/30 border border-signal-500/40 rounded-xl py-2">
                    <div className="text-[9px] text-signal-300 uppercase tracking-wider">Estimativa</div>
                    <div className="text-lg font-bold text-signal-300 mt-0.5">R$ 164</div>
                  </div>
                </div>
                <div className="mt-4 text-xs text-steel-300">
                  🏭 Auto Centro Veloz · Itaim Bibi · ~3,2 km
                </div>
                <button className="mt-4 w-full bg-brand-500 text-white font-bold rounded-xl py-3 text-sm">
                  Aceitar job
                </button>
              </div>

              {/* Floating PIX card */}
              <div className="absolute -bottom-4 -left-4 bg-signal-500 text-white rounded-2xl px-4 py-3 shadow-xl rotate-[-3deg]">
                <div className="text-[10px] font-bold uppercase tracking-widest opacity-90">PIX recebido</div>
                <div className="text-2xl font-bold">R$ 164,00</div>
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

      {/* ── DIFERENCIAL: ZERO INVESTIMENTO ── */}
      <section className="py-20 lg:py-28 px-5 lg:px-8">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12 max-w-3xl mx-auto">
            <div className="text-xs font-bold text-brand-600 uppercase tracking-widest">O grande diferencial</div>
            <h2 className="mt-3 text-3xl lg:text-5xl font-bold tracking-tight leading-tight text-steel-900">
              Você só leva o que <span className="text-brand-500">ninguém pode replicar</span>:<br />
              seu talento.
            </h2>
            <p className="mt-6 text-lg text-steel-600 leading-relaxed">
              Diferente de Uber, iFood ou atender cliente particular —
              aqui você <strong className="text-steel-900">não investe nada</strong>.
              Quem dá a estrutura é a oficina.
            </p>
          </div>

          {/* Comparativo 3 colunas */}
          <div className="grid md:grid-cols-3 gap-4">
            {/* Uber/iFood */}
            <div className="bg-white border border-steel-200 rounded-2xl p-5 shadow-sm">
              <div className="text-xs font-bold text-steel-500 uppercase tracking-widest">No Uber / iFood</div>
              <h3 className="mt-2 text-lg font-bold text-steel-700">Você é o capital</h3>
              <ul className="mt-4 space-y-2 text-sm text-steel-600">
                <ItemX>Carro/moto próprio</ItemX>
                <ItemX>Gasolina, IPVA, seguro</ItemX>
                <ItemX>Manutenção do veículo</ItemX>
                <ItemX>Depreciação</ItemX>
                <ItemX>Você assume todo o risco</ItemX>
              </ul>
            </div>

            {/* Atendimento particular */}
            <div className="bg-white border border-steel-200 rounded-2xl p-5 shadow-sm">
              <div className="text-xs font-bold text-steel-500 uppercase tracking-widest">Atendendo particular</div>
              <h3 className="mt-2 text-lg font-bold text-steel-700">Investimento alto</h3>
              <ul className="mt-4 space-y-2 text-sm text-steel-600">
                <ItemX>Caixa de ferramenta completa</ItemX>
                <ItemX>Carro pra ir até o cliente</ItemX>
                <ItemX>Comprar peça do bolso</ItemX>
                <ItemX>Achar cliente sozinho</ItemX>
                <ItemX>Cobrar e correr atrás</ItemX>
              </ul>
            </div>

            {/* MecânicoApp */}
            <div className="bg-gradient-to-br from-brand-500 to-brand-600 rounded-2xl p-5 shadow-xl shadow-brand-500/30 text-white">
              <div className="text-xs font-bold text-white/90 uppercase tracking-widest">No MecânicoApp</div>
              <h3 className="mt-2 text-lg font-bold">Só seu talento</h3>
              <ul className="mt-4 space-y-2 text-sm">
                <ItemCheckLight>Oficina dá ferramenta e elevador</ItemCheckLight>
                <ItemCheckLight>Peça já tá lá, é da oficina</ItemCheckLight>
                <ItemCheckLight>Você vai ao local indicado</ItemCheckLight>
                <ItemCheckLight>Cliente já pagou — sem cobrar</ItemCheckLight>
                <ItemCheckLight>Zero investimento. Zero risco.</ItemCheckLight>
              </ul>
            </div>
          </div>

          <div className="mt-8 text-center">
            <p className="text-sm text-steel-500 max-w-2xl mx-auto">
              💡 <strong>Você é o profissional. Não o investidor.</strong> Sua mão e sua experiência valem ouro — não faz sentido você ainda comprar ferramenta, carro e correr atrás de cliente.
            </p>
          </div>
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
            <Win emoji="💰" title="Você define sua hora"
              desc="Coloca o R$/h que cobra. Aceita só jobs no seu valor. Sem dividir 50/50 com ninguém, sem cobrar cliente." />
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
            <StatCard n="Zero" label="mensalidade ou taxa fixa" />
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
            <Link to="/oficina" className="hover:text-steel-900 transition">Sou oficina</Link>
            <Link to="/login" state={{ fresh: true }} className="hover:text-steel-900 transition">Entrar</Link>
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
    <div className="bg-white border border-steel-200 rounded-2xl p-5 flex gap-4 shadow-sm hover:shadow-md transition">
      <div className="text-3xl shrink-0">{emoji}</div>
      <div>
        <h3 className="font-bold text-base leading-tight text-steel-900">{title}</h3>
        <p className="mt-1.5 text-sm text-steel-600 leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}

function Win({ emoji, title, desc }: { emoji: string; title: string; desc: string }) {
  return (
    <div className="bg-white border-2 border-brand-100 rounded-2xl p-5 flex gap-4 shadow-sm hover:shadow-lg hover:border-brand-300 transition">
      <div className="text-3xl shrink-0">{emoji}</div>
      <div>
        <h3 className="font-bold text-base leading-tight text-brand-700">{title}</h3>
        <p className="mt-1.5 text-sm text-steel-700 leading-relaxed">{desc}</p>
      </div>
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

function ItemX({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <span className="text-steel-400 shrink-0 mt-0.5">✗</span>
      <span>{children}</span>
    </li>
  );
}

function ItemCheckLight({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <span className="text-white shrink-0 mt-0.5 font-bold">✓</span>
      <span>{children}</span>
    </li>
  );
}
