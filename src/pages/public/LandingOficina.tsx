import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Logo } from '@/components/Logo';

// Multiplicador médio de encargos CLT no Brasil (INSS patronal + FGTS + provisão de
// férias/13o + verbas rescisórias). Conservador.
const CLT_LOAD_FACTOR = 1.7;

/**
 * Landing de captura — APENAS para oficina.
 * Estilo claro, alto contraste, gatilhos pesados.
 */
export default function LandingOficina() {
  const [mechanicsCount, setMechanicsCount] = useState(3);
  const [avgSalary, setAvgSalary]           = useState(3000);
  const monthlyCLT = mechanicsCount * avgSalary * CLT_LOAD_FACTOR;
  const yearlyCLT  = monthlyCLT * 12;

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
            <Link to="/cadastro/oficina"
              className="bg-brand-500 text-white text-sm font-bold rounded-xl px-4 py-2 hover:bg-brand-600 transition shadow-sm">
              Cadastrar
            </Link>
          </div>
        </div>
      </header>

      {/* ── HERO ── */}
      <section className="relative pt-28 pb-16 lg:pt-40 lg:pb-24 px-5 lg:px-8 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/3 left-0 w-[600px] h-[600px] rounded-full bg-brand-500/10 blur-3xl" />
          <div className="absolute bottom-0 right-0 w-96 h-96 rounded-full bg-brand-600/5 blur-3xl" />
        </div>

        <div className="relative max-w-5xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">

            {/* Coluna esquerda — texto */}
            <div>
              <div className="inline-flex items-center gap-2 bg-brand-50 border border-brand-200 rounded-full px-3 py-1 text-xs font-bold text-brand-700 tracking-wider uppercase">
                🏪 Para donos de oficina
              </div>

              <h1 className="mt-6 text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.05] text-steel-900">
                Mecânico <span className="text-brand-500">em 1 hora.</span><br />
                Sem CLT. Sem encargos.
              </h1>

              <p className="mt-6 text-lg text-steel-600 leading-relaxed">
                Sua oficina nunca mais para por falta de mão de obra.<br />
                <strong className="text-steel-900">Pague só quando precisar</strong> — e ainda receba de bandeja
                um sistema de OS, controle de clientes e gestão multi-loja. <span className="text-brand-600 font-semibold">Tudo grátis.</span>
              </p>

              <div className="mt-8 flex flex-col sm:flex-row gap-3">
                <Link to="/cadastro/oficina"
                  className="bg-brand-500 text-white font-bold rounded-2xl px-6 py-4 hover:bg-brand-600 transition flex items-center justify-center gap-2 shadow-xl shadow-brand-500/30">
                  Cadastrar oficina grátis
                  <span>→</span>
                </Link>
                <Link to="/login" state={{ fresh: true }}
                  className="text-sm font-semibold text-steel-700 hover:text-steel-900 px-4 py-4 transition flex items-center justify-center">
                  Já sou cadastrado
                </Link>
              </div>

              <div className="mt-6 flex items-center gap-4 text-xs text-steel-500 flex-wrap">
                <span className="flex items-center gap-1.5"><span className="text-signal-500">✓</span> 100% gratuito</span>
                <span className="flex items-center gap-1.5"><span className="text-signal-500">✓</span> Sem mensalidade</span>
                <span className="flex items-center gap-1.5"><span className="text-signal-500">✓</span> Multi-loja inclusa</span>
              </div>
            </div>

            {/* Coluna direita — mock visual painel */}
            <div className="relative">
              <div className="bg-white rounded-3xl p-5 shadow-2xl border border-steel-100">
                {/* mini topbar */}
                <div className="flex items-center justify-between pb-3 border-b border-steel-100">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-lg bg-brand-500 grid place-items-center text-white font-bold text-sm">A</div>
                    <div>
                      <div className="text-xs font-bold text-steel-900 leading-tight">Auto Centro Veloz</div>
                      <div className="text-[9px] text-steel-500">São Paulo/SP</div>
                    </div>
                  </div>
                  <div className="text-[9px] text-steel-400">Oficina</div>
                </div>

                {/* OS card */}
                <div className="mt-3 p-3 bg-steel-50 rounded-xl">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-brand-600 uppercase tracking-widest">⚡ Em andamento</span>
                    <span className="text-[10px] text-steel-400">há 12 min</span>
                  </div>
                  <div className="mt-1 font-bold text-steel-900 text-sm">Troca de embreagem</div>
                  <div className="text-[11px] text-steel-500 mt-0.5">🔧 Carlos Souza · ★ 4.9</div>
                </div>

                {/* Active mechanic card */}
                <div className="mt-2 p-3 bg-brand-50 border border-brand-200 rounded-xl">
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <div className="h-8 w-8 rounded-full bg-brand-500 grid place-items-center text-white font-bold text-xs">RJ</div>
                      <div className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-signal-500 border-2 border-white animate-pulse" />
                    </div>
                    <div className="flex-1">
                      <div className="text-xs font-bold text-steel-900">Roberto J. a caminho</div>
                      <div className="text-[10px] text-steel-500">📍 Chega em ~14 min</div>
                    </div>
                    <div className="text-[10px] font-bold text-brand-600">2.3 km</div>
                  </div>
                </div>

                {/* Stats */}
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <div className="bg-steel-50 rounded-lg py-2">
                    <div className="text-[9px] text-steel-500 uppercase tracking-wider">Hoje</div>
                    <div className="text-sm font-bold text-steel-900 mt-0.5">8 OS</div>
                  </div>
                  <div className="bg-steel-50 rounded-lg py-2">
                    <div className="text-[9px] text-steel-500 uppercase tracking-wider">Ativos</div>
                    <div className="text-sm font-bold text-brand-500 mt-0.5">3</div>
                  </div>
                  <div className="bg-signal-50 border border-signal-200 rounded-lg py-2">
                    <div className="text-[9px] text-signal-700 uppercase tracking-wider">Faturado</div>
                    <div className="text-sm font-bold text-signal-700 mt-0.5">R$ 2.4k</div>
                  </div>
                </div>
              </div>

              {/* Floating tag */}
              <div className="absolute -top-3 -right-3 bg-signal-500 text-white rounded-2xl px-4 py-2 shadow-xl rotate-[3deg]">
                <div className="text-[10px] font-bold uppercase tracking-widest opacity-90">Ao vivo</div>
                <div className="text-sm font-bold">Mecânico chegou</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── DORES ── */}
      <section className="py-20 lg:py-28 px-5 lg:px-8 bg-steel-50">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <div className="text-xs font-bold text-brand-600 uppercase tracking-widest">A realidade da maioria das oficinas</div>
            <h2 className="mt-3 text-3xl lg:text-5xl font-bold tracking-tight text-steel-900">
              Reconhece esses problemas?
            </h2>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <Pain emoji="🔧" title="Mecânico bom é raro — e some"
              desc="Você treina, ensina, dá oportunidade. Quando ele fica bom mesmo, pede demissão e abre concorrência." />
            <Pain emoji="💸" title="CLT pesa toda hora"
              desc="Salário, INSS, FGTS, férias, 13º. Mesmo no mês mais fraco, a folha vence. E não tem como cortar." />
            <Pain emoji="📅" title="Falta gente, perde cliente"
              desc='"Posso deixar amanhã?" — "Vou ter que ver, mestre". Cliente vai embora pra concorrência mais ágil.' />
            <Pain emoji="📓" title="OS no caderninho"
              desc="Anotação no papel, perde história, perde garantia, perde cliente que não volta. Receita escapa." />
            <Pain emoji="🤷" title="Sem controle real"
              desc="Quanto cada serviço dá de margem? Quem é seu melhor cliente? Quanto fatura por mecânico? Não sabe." />
            <Pain emoji="📵" title="Marketing? Esquece"
              desc="Você sabe consertar carro. Mas não sabe achar cliente novo. E ninguém na oficina sabe também." />
          </div>
        </div>
      </section>

      {/* ── CALCULADORA DE ECONOMIA ── */}
      <section className="py-20 lg:py-28 px-5 lg:px-8">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10 max-w-3xl mx-auto">
            <div className="text-xs font-bold text-brand-600 uppercase tracking-widest">Calcule sua folha CLT</div>
            <h2 className="mt-3 text-3xl lg:text-5xl font-bold tracking-tight leading-tight text-steel-900">
              Quanto sua oficina paga<br />
              <span className="text-brand-500">só em mão de obra fixa?</span>
            </h2>
            <p className="mt-4 text-base text-steel-600">
              Salário é só a ponta. Encargos, férias, 13º, FGTS e provisões pesam ~70% em cima.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6 items-center bg-white rounded-3xl p-6 lg:p-8 shadow-xl border border-steel-100">
            {/* Inputs */}
            <div className="space-y-6">
              <div>
                <div className="flex items-baseline justify-between mb-2">
                  <span className="text-xs font-bold text-steel-500 uppercase tracking-wider">Mecânicos CLT hoje</span>
                  <span className="text-3xl font-bold text-brand-500 font-display">{mechanicsCount}</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={10}
                  step={1}
                  value={mechanicsCount}
                  onChange={e => setMechanicsCount(Number(e.target.value))}
                  className="w-full accent-brand-500 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-steel-400 font-semibold mt-1">
                  <span>1</span><span>5</span><span>10+</span>
                </div>
              </div>

              <div>
                <div className="flex items-baseline justify-between mb-2">
                  <span className="text-xs font-bold text-steel-500 uppercase tracking-wider">Salário médio mensal</span>
                  <span className="text-3xl font-bold text-brand-500 font-display">R$ {avgSalary.toLocaleString('pt-BR')}</span>
                </div>
                <input
                  type="range"
                  min={1500}
                  max={6000}
                  step={100}
                  value={avgSalary}
                  onChange={e => setAvgSalary(Number(e.target.value))}
                  className="w-full accent-brand-500 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-steel-400 font-semibold mt-1">
                  <span>R$ 1.500</span><span>R$ 3.500</span><span>R$ 6.000</span>
                </div>
              </div>
            </div>

            {/* Resultado */}
            <div className="bg-gradient-to-br from-steel-900 to-steel-800 rounded-2xl p-6 text-white shadow-xl">
              <div className="text-[10px] font-bold uppercase tracking-widest text-steel-400">Sua folha CLT estimada</div>
              <div className="mt-1 text-4xl lg:text-5xl font-bold font-display leading-none text-white">
                R$ {monthlyCLT.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
              </div>
              <div className="text-sm text-steel-300 mt-1">por mês — fixo, vence todo dia 5</div>

              <div className="mt-5 pt-5 border-t border-white/10 space-y-1">
                <div className="flex items-baseline justify-between text-sm text-steel-300">
                  <span>≈ por ano</span>
                  <span className="font-bold text-white">R$ {yearlyCLT.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</span>
                </div>
                <div className="flex items-baseline justify-between text-[11px] text-steel-400">
                  <span>Salário bruto</span>
                  <span>R$ {(mechanicsCount * avgSalary).toLocaleString('pt-BR')}</span>
                </div>
                <div className="flex items-baseline justify-between text-[11px] text-steel-400">
                  <span>+ Encargos (~70%)</span>
                  <span>R$ {(monthlyCLT - mechanicsCount * avgSalary).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</span>
                </div>
              </div>

              <div className="mt-5 pt-5 border-t border-white/10">
                <div className="text-[10px] font-bold uppercase tracking-widest text-brand-300">No app</div>
                <p className="text-sm text-white/90 mt-1 leading-relaxed">
                  Paga só pela hora trabalhada quando precisar.
                  <strong className="text-brand-300"> Zero custo fixo.</strong>
                  Sem férias, sem 13º, sem FGTS.
                </p>
              </div>
            </div>
          </div>

          <p className="mt-5 text-center text-xs text-steel-500 max-w-2xl mx-auto">
            ℹ️ Cálculo conservador (multiplicador de 1,7 sobre o salário, incluindo INSS patronal,
            FGTS, provisão de férias/13º e rescisão). Não substitui consultoria contábil.
          </p>
        </div>
      </section>

      {/* ── SOLUÇÃO ── */}
      <section className="py-20 lg:py-28 px-5 lg:px-8">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <div className="text-xs font-bold text-brand-600 uppercase tracking-widest">O que muda com o app</div>
            <h2 className="mt-3 text-3xl lg:text-5xl font-bold tracking-tight leading-tight text-steel-900">
              Tudo que falta. <span className="text-brand-500">Em um único painel.</span>
            </h2>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <Win emoji="⚡" title="Mecânico sob demanda"
              desc="Publica a demanda, mecânico aceita em minutos. Pronto, qualificado, com CPF e CNH validados." />
            <Win emoji="💰" title="Pague só pela hora trabalhada"
              desc="Sem CLT, sem encargos, sem mensalidade. Cobrou 2h? Você paga 2h. Cobrou 0? Não paga nada." />
            <Win emoji="🛡️" title="Pagamento intermediado"
              desc="Cliente paga por cartão ou PIX direto na plataforma. Você só libera depois do serviço aprovado." />
            <Win emoji="📋" title="OS digital grátis"
              desc="Cadastro de cliente, veículo, histórico, agendamento, mecânico interno. Adeus caderninho." />
            <Win emoji="🏪" title="Multi-loja na mesma conta"
              desc="Tem 2, 3, 5 oficinas? Gerencia tudo no mesmo login, troca entre lojas com 1 clique." />
            <Win emoji="📍" title="Rastreamento ao vivo"
              desc="Vê o mecânico chegando no mapa. Cliente vê também (transparência vira satisfação)." />
            <Win emoji="⭐" title="Reputação que vende sozinha"
              desc="Cada serviço bem feito vira nota pública. Sua oficina aparece pra cliente novo na cidade toda." />
            <Win emoji="📊" title="Gestão visível"
              desc="OS por status, faturamento, mecânicos ativos, clientes recorrentes. Tudo no painel, em tempo real." />
          </div>
        </div>
      </section>

      {/* ── COMO FUNCIONA ── */}
      <section className="py-20 lg:py-28 px-5 lg:px-8 bg-steel-50">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-14">
            <div className="text-xs font-bold text-brand-600 uppercase tracking-widest">Como funciona</div>
            <h2 className="mt-3 text-3xl lg:text-5xl font-bold tracking-tight leading-tight text-steel-900">
              4 passos. Sua oficina rodando.
            </h2>
          </div>

          <div className="space-y-3">
            <FlowStep n={1} title="Cadastra a oficina"
              desc="2 minutos. CNPJ, endereço, dados básicos. Aprovação em até 24h." />
            <FlowStep n={2} title="Publica demanda quando faltar gente"
              desc="Define o serviço, valor por hora, teto de horas. Marketplace dispara alerta pra mecânicos da região." />
            <FlowStep n={3} title="Mecânico aceita e executa"
              desc="Você acompanha tudo no mapa. Cliente paga via app. Mecânico chega, faz o serviço, registra horas." />
            <FlowStep n={4} title="Avalia e libera"
              desc="Confirma o serviço, dá nota. Plataforma libera o pagamento. Tudo registrado no histórico." />
          </div>
        </div>
      </section>

      {/* ── COMPARATIVO ── */}
      <section className="py-20 lg:py-28 px-5 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl lg:text-5xl font-bold tracking-tight leading-tight text-steel-900">
              Compare por conta própria.
            </h2>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            {/* Modelo antigo */}
            <div className="bg-white border border-steel-200 rounded-2xl p-6 shadow-sm">
              <div className="text-xs font-bold text-steel-500 uppercase tracking-widest">Modelo tradicional</div>
              <h3 className="mt-2 text-xl font-bold text-steel-700">Mecânico CLT</h3>
              <ul className="mt-4 space-y-2.5 text-sm text-steel-600">
                <ItemX>Folha fixa todo mês, mesmo sem serviço</ItemX>
                <ItemX>Encargos: ~75% sobre o salário</ItemX>
                <ItemX>Férias, 13º, FGTS, INSS</ItemX>
                <ItemX>Difícil contratar bom profissional</ItemX>
                <ItemX>Difícil dispensar quando não cabe mais</ItemX>
                <ItemX>OS no papel, sem histórico digital</ItemX>
              </ul>
            </div>

            {/* Com o app */}
            <div className="bg-gradient-to-br from-brand-50 to-white border-2 border-brand-200 rounded-2xl p-6 shadow-lg shadow-brand-500/10">
              <div className="text-xs font-bold text-brand-600 uppercase tracking-widest">Com o app</div>
              <h3 className="mt-2 text-xl font-bold text-steel-900">Mecânico sob demanda</h3>
              <ul className="mt-4 space-y-2.5 text-sm text-steel-700">
                <ItemCheck>Paga só pela hora efetivamente trabalhada</ItemCheck>
                <ItemCheck>Zero encargos. Zero CLT.</ItemCheck>
                <ItemCheck>Acessa profissionais qualificados em minutos</ItemCheck>
                <ItemCheck>Cresce ou contrai conforme a demanda</ItemCheck>
                <ItemCheck>Sistema de OS, clientes e veículos grátis</ItemCheck>
                <ItemCheck>Multi-loja na mesma conta</ItemCheck>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ── OBJEÇÕES / FAQ ── */}
      <section className="py-20 lg:py-28 px-5 lg:px-8 bg-steel-50">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <div className="text-xs font-bold text-brand-600 uppercase tracking-widest">"Mas e se..."</div>
            <h2 className="mt-3 text-3xl lg:text-5xl font-bold tracking-tight leading-tight text-steel-900">
              Toda objeção que você está pensando agora.
            </h2>
          </div>

          <div className="space-y-3">
            <Faq
              q="E se o mecânico não chegar ou for ruim?"
              a="CPF e CNH são validados manualmente antes da aprovação. Cada mecânico tem nota pública e histórico de jobs visíveis. Você acompanha a chegada no mapa em tempo real e só libera o pagamento depois de confirmar que o serviço ficou bom — se algo der errado, não paga."
            />
            <Faq
              q="E se o cliente não pagar?"
              a="O cliente paga via cartão ou PIX direto na plataforma ANTES do serviço começar. O valor fica em escrow e só é liberado quando você confirma a conclusão. Não tem como o serviço ser feito sem o dinheiro estar garantido."
            />
            <Faq
              q="Tem mensalidade ou taxa de cadastro?"
              a="Não. Zero. O cadastro da oficina é gratuito, o sistema de OS/clientes/veículos é gratuito, multi-loja é gratuito. Você só desembolsa quando precisa contratar mão de obra sob demanda — e nesse caso, paga o valor que combinou com o mecânico."
            />
            <Faq
              q="Posso continuar com meus mecânicos CLT?"
              a="Pode. O app é complementar — você usa quando precisar de reforço, quando alguém faltar, quando a demanda subir, ou quando quiser testar antes de contratar. Não exige exclusividade."
            />
            <Faq
              q="O que muda na minha rotina hoje?"
              a="Quase nada no começo. Você cadastra a oficina (2 min), aprova em 24h, e usa o painel quando precisar de mecânico extra. O sistema de gestão de OS você adota no seu ritmo — pode começar só com o marketplace."
            />
            <Faq
              q="Como sei que o mecânico é qualificado?"
              a="Toda aprovação é manual: validamos CPF, CNH, especialidades declaradas e checamos o histórico. Mecânicos novos começam com nota 0 e ganham reputação serviço a serviço. Você vê o ranking, as avaliações, e escolhe quem chamar."
            />
          </div>
        </div>
      </section>

      {/* ── NÚMEROS ── */}
      <section className="py-20 lg:py-28 px-5 lg:px-8">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard n="Sem CLT" label="zero encargos trabalhistas" />
            <StatCard n="24h" label="aprovação do cadastro" />
            <StatCard n="100%" label="pagamentos pré-pagos (escrow)" />
            <StatCard n="Grátis" label="OS, clientes e veículos no painel" />
          </div>
        </div>
      </section>

      {/* ── CTA FINAL ── */}
      <section className="py-24 lg:py-32 px-5 lg:px-8 bg-gradient-to-b from-white to-brand-50/30">
        <div className="max-w-3xl mx-auto text-center">
          <div className="text-xs font-bold text-brand-600 uppercase tracking-widest">Comece sem custo. Sem risco.</div>
          <h2 className="mt-3 text-4xl lg:text-6xl font-bold tracking-tight leading-tight text-steel-900">
            Cadastre sua oficina.<br />
            <span className="text-brand-500">Hoje. Em 2 minutos.</span>
          </h2>
          <p className="mt-6 text-lg text-steel-600">
            Você ganha um sistema de gestão completo, marketplace de mecânicos
            e pagamento intermediado. <strong className="text-steel-900">Sem pagar nada.</strong>
          </p>

          <Link to="/cadastro/oficina"
            className="inline-flex items-center gap-2 mt-10 bg-brand-500 text-white font-bold rounded-2xl px-8 py-5 text-lg hover:bg-brand-600 transition shadow-2xl shadow-brand-500/30">
            Cadastrar oficina grátis
            <span>→</span>
          </Link>

          <p className="mt-4 text-xs text-steel-500">
            Validamos seu CNPJ · Aprovação em até 24h
          </p>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="border-t border-steel-100 py-14 px-5 lg:px-8 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-8 mb-10">
            <div>
              <Logo />
              <p className="mt-3 text-xs text-steel-500 leading-relaxed max-w-[220px]">
                Mão de obra sob demanda + gestão de oficina, num único painel.
              </p>
            </div>

            <div>
              <div className="text-xs font-bold text-steel-900 uppercase tracking-widest mb-3">Para Oficinas</div>
              <ul className="space-y-2 text-sm text-steel-600">
                <li><Link to="/cadastro/oficina" className="hover:text-brand-600 transition">Cadastrar oficina</Link></li>
                <li><Link to="/login" state={{ fresh: true }} className="hover:text-brand-600 transition">Entrar</Link></li>
                <li><Link to="/" className="hover:text-brand-600 transition">Voltar para home</Link></li>
              </ul>
            </div>

            <div>
              <div className="text-xs font-bold text-steel-900 uppercase tracking-widest mb-3">Plataforma</div>
              <ul className="space-y-2 text-sm text-steel-600">
                <li><Link to="/mecanico" className="hover:text-brand-600 transition">Para mecânicos</Link></li>
                <li><Link to="/brandbook" className="hover:text-brand-600 transition">Brandbook</Link></li>
                <li><Link to="/termos" className="hover:text-brand-600 transition">Termos de uso</Link></li>
                <li><Link to="/privacidade" className="hover:text-brand-600 transition">Privacidade</Link></li>
              </ul>
            </div>

            <div>
              <div className="text-xs font-bold text-steel-900 uppercase tracking-widest mb-3">Confiança</div>
              <ul className="space-y-2 text-sm text-steel-600">
                <li>CPF e CNH verificados</li>
                <li>Pagamento em escrow</li>
                <li>Avaliações públicas</li>
                <li>Suporte por chat</li>
              </ul>
            </div>
          </div>

          <div className="pt-6 border-t border-steel-100 flex flex-col md:flex-row items-center justify-between gap-3 text-xs text-steel-500">
            <div>© MecânicoApp {new Date().getFullYear()} · Todos os direitos reservados</div>
            <div className="flex items-center gap-5">
              <span>CNPJ em validação</span>
              <span className="text-steel-300">·</span>
              <span>Feito no Brasil 🇧🇷</span>
            </div>
          </div>
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
    <div className="bg-gradient-to-br from-brand-50 to-white border-2 border-brand-100 rounded-2xl p-5 text-center shadow-sm">
      <div className="text-3xl lg:text-4xl font-bold text-brand-500 font-display leading-none">{n}</div>
      <div className="mt-2 text-xs text-steel-600 font-medium leading-snug">{label}</div>
    </div>
  );
}

function ItemCheck({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <span className="text-signal-500 shrink-0 mt-0.5 font-bold">✓</span>
      <span>{children}</span>
    </li>
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

function Faq({ q, a }: { q: string; a: string }) {
  return (
    <details className="group bg-white border border-steel-200 rounded-2xl px-5 py-4 shadow-sm hover:shadow-md hover:border-brand-200 transition open:border-brand-300 open:shadow-md">
      <summary className="flex items-center justify-between cursor-pointer list-none">
        <span className="font-bold text-base text-steel-900 leading-tight pr-4">{q}</span>
        <span className="shrink-0 h-7 w-7 rounded-full bg-brand-50 grid place-items-center text-brand-600 font-bold text-sm transition-transform group-open:rotate-45">
          +
        </span>
      </summary>
      <p className="mt-3 text-sm text-steel-600 leading-relaxed">{a}</p>
    </details>
  );
}
