import { Link } from 'react-router-dom';
import { Logo } from '@/components/Logo';

/**
 * Landing page de captura — APENAS para oficina.
 * Gatilhos pesados, dores reais do dono de oficina, benefícios claros, CTA único.
 */
export default function LandingOficina() {
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
            <Link to="/cadastro/oficina"
              className="bg-brand-500 text-white text-sm font-bold rounded-xl px-4 py-2 hover:bg-brand-600 transition">
              Cadastrar
            </Link>
          </div>
        </div>
      </header>

      {/* ── HERO ── */}
      <section className="relative pt-28 pb-16 lg:pt-40 lg:pb-24 px-5 lg:px-8">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/3 left-0 w-[600px] h-[600px] rounded-full bg-brand-500/20 blur-3xl" />
          <div className="absolute bottom-0 right-0 w-96 h-96 rounded-full bg-brand-600/10 blur-3xl" />
        </div>

        <div className="relative max-w-5xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">

            {/* Coluna esquerda — texto */}
            <div>
              <div className="inline-flex items-center gap-2 bg-brand-500/15 border border-brand-500/30 rounded-full px-3 py-1 text-xs font-bold text-brand-300 tracking-wider uppercase">
                🏪 Para donos de oficina
              </div>

              <h1 className="mt-6 text-5xl lg:text-6xl font-bold tracking-tight leading-[1.05]">
                Mecânico <span className="text-brand-400">em 1 hora.</span><br />
                Sem CLT. Sem encargos.
              </h1>

              <p className="mt-6 text-lg text-steel-300 leading-relaxed">
                Sua oficina nunca mais para por falta de mão de obra.<br />
                <strong className="text-white">Pague só quando precisar</strong> — e ainda receba de bandeja
                um sistema de OS, controle de clientes e gestão multi-loja. <span className="text-brand-300">Tudo grátis.</span>
              </p>

              {/* CTAs */}
              <div className="mt-8 flex flex-col sm:flex-row gap-3">
                <Link to="/cadastro/oficina"
                  className="bg-brand-500 text-white font-bold rounded-2xl px-6 py-4 hover:bg-brand-600 transition flex items-center justify-center gap-2 shadow-xl shadow-brand-500/30">
                  Cadastrar oficina grátis
                  <span>→</span>
                </Link>
                <Link to="/login"
                  className="text-sm font-semibold text-steel-300 hover:text-white px-4 py-4 transition flex items-center justify-center">
                  Já sou cadastrado
                </Link>
              </div>

              <div className="mt-6 flex items-center gap-4 text-xs text-steel-500 flex-wrap">
                <div className="flex items-center gap-1.5"><span className="text-signal-400">✓</span> 100% gratuito</div>
                <div className="flex items-center gap-1.5"><span className="text-signal-400">✓</span> Sem mensalidade</div>
                <div className="flex items-center gap-1.5"><span className="text-signal-400">✓</span> Multi-loja inclusa</div>
              </div>
            </div>

            {/* Coluna direita — mock visual painel */}
            <div className="relative">
              <div className="bg-white rounded-3xl p-5 shadow-2xl">
                {/* mini topbar */}
                <div className="flex items-center justify-between pb-3 border-b border-steel-100">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-lg bg-brand-500 grid place-items-center text-white font-bold text-sm">A</div>
                    <div>
                      <div className="text-xs font-bold text-steel-800 leading-tight">Auto Centro Veloz</div>
                      <div className="text-[9px] text-steel-500">São Paulo/SP</div>
                    </div>
                  </div>
                  <div className="text-[9px] text-steel-400">Oficina</div>
                </div>

                {/* OS card */}
                <div className="mt-3 p-3 bg-steel-50 rounded-xl">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-brand-500 uppercase tracking-widest">⚡ Em andamento</span>
                    <span className="text-[10px] text-steel-400">há 12 min</span>
                  </div>
                  <div className="mt-1 font-bold text-steel-800 text-sm">Troca de embreagem</div>
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
                      <div className="text-xs font-bold text-steel-800">Roberto J. a caminho</div>
                      <div className="text-[10px] text-steel-500">📍 Chega em ~14 min</div>
                    </div>
                    <div className="text-[10px] font-bold text-brand-600">2.3 km</div>
                  </div>
                </div>

                {/* Stats */}
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <div className="bg-steel-50 rounded-lg py-2">
                    <div className="text-[9px] text-steel-500 uppercase tracking-wider">Hoje</div>
                    <div className="text-sm font-bold text-steel-800 mt-0.5">8 OS</div>
                  </div>
                  <div className="bg-steel-50 rounded-lg py-2">
                    <div className="text-[9px] text-steel-500 uppercase tracking-wider">Ativos</div>
                    <div className="text-sm font-bold text-brand-500 mt-0.5">3</div>
                  </div>
                  <div className="bg-signal-500/15 rounded-lg py-2">
                    <div className="text-[9px] text-signal-700 uppercase tracking-wider">Faturado</div>
                    <div className="text-sm font-bold text-signal-700 mt-0.5">R$ 2.4k</div>
                  </div>
                </div>
              </div>

              {/* Floating tag */}
              <div className="absolute -top-3 -right-3 bg-signal-500 text-white rounded-2xl px-4 py-2 shadow-xl rotate-[3deg]">
                <div className="text-[10px] font-bold uppercase tracking-widest opacity-80">Ao vivo</div>
                <div className="text-sm font-bold">Mecânico chegou</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── DORES ── */}
      <section className="py-20 lg:py-28 px-5 lg:px-8 border-t border-steel-800">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <div className="text-xs font-bold text-brand-400 uppercase tracking-widest">A realidade da maioria das oficinas</div>
            <h2 className="mt-3 text-3xl lg:text-5xl font-bold tracking-tight">
              Reconhece esses problemas?
            </h2>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <Pain emoji="🔧" title="Mecânico bom é raro — e some"
              desc="Você treina, ensina, dá oportunidade. Quando ele fica bom mesmo, pede demissão e abre concorrência." />
            <Pain emoji="💸" title="CLT pesa toda hora"
              desc="Salário, INSS, FGTS, férias, 13º. Mesmo no mês mais fraco, a folha vence. E não tem como cortar." />
            <Pain emoji="📅" title="Falta gente, perde cliente"
              desc='"Posso deixar amanhã?" — "Vou ter que ver, mestre".  Cliente vai embora pra concorrência mais ágil.' />
            <Pain emoji="📓" title="OS no caderninho"
              desc="Anotação no papel, perde história, perde garantia, perde cliente que não volta. Receita escapa." />
            <Pain emoji="🤷" title="Sem controle real"
              desc="Quanto cada serviço dá de margem? Quem é seu melhor cliente? Quanto fatura por mecânico? Não sabe." />
            <Pain emoji="📵" title="Marketing? Esquece"
              desc="Você sabe consertar carro. Mas não sabe achar cliente novo. E ninguém na oficina sabe também." />
          </div>
        </div>
      </section>

      {/* ── SOLUÇÃO ── */}
      <section className="py-20 lg:py-28 px-5 lg:px-8 bg-gradient-to-b from-steel-950 via-steel-900 to-steel-950">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <div className="text-xs font-bold text-brand-400 uppercase tracking-widest">O que muda com o app</div>
            <h2 className="mt-3 text-3xl lg:text-5xl font-bold tracking-tight leading-tight">
              Tudo que falta. <span className="text-brand-400">Em um único painel.</span>
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
      <section className="py-20 lg:py-28 px-5 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-14">
            <div className="text-xs font-bold text-brand-400 uppercase tracking-widest">Como funciona</div>
            <h2 className="mt-3 text-3xl lg:text-5xl font-bold tracking-tight leading-tight">
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
      <section className="py-20 lg:py-28 px-5 lg:px-8 border-t border-steel-800">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl lg:text-5xl font-bold tracking-tight leading-tight">
              Compare por conta própria.
            </h2>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            {/* Modelo antigo */}
            <div className="bg-steel-900/40 border border-steel-800 rounded-2xl p-6">
              <div className="text-xs font-bold text-steel-500 uppercase tracking-widest">Modelo tradicional</div>
              <h3 className="mt-2 text-xl font-bold text-steel-300">Mecânico CLT</h3>
              <ul className="mt-4 space-y-2.5 text-sm text-steel-400">
                <ItemX>Folha fixa todo mês, mesmo sem serviço</ItemX>
                <ItemX>Encargos: ~75% sobre o salário</ItemX>
                <ItemX>Férias, 13º, FGTS, INSS</ItemX>
                <ItemX>Difícil contratar bom profissional</ItemX>
                <ItemX>Difícil dispensar quando não cabe mais</ItemX>
                <ItemX>OS no papel, sem histórico digital</ItemX>
              </ul>
            </div>

            {/* Com o app */}
            <div className="bg-gradient-to-br from-brand-500/15 to-brand-600/5 border border-brand-500/40 rounded-2xl p-6">
              <div className="text-xs font-bold text-brand-400 uppercase tracking-widest">Com o app</div>
              <h3 className="mt-2 text-xl font-bold text-white">Mecânico sob demanda</h3>
              <ul className="mt-4 space-y-2.5 text-sm text-steel-200">
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

      {/* ── PROVA / NÚMEROS ── */}
      <section className="py-20 lg:py-28 px-5 lg:px-8">
        <div className="max-w-5xl mx-auto">
          <div className="grid md:grid-cols-3 gap-4">
            <StatCard n="0" label="encargos trabalhistas" />
            <StatCard n="24h" label="prazo de aprovação do cadastro" />
            <StatCard n="∞" label="oficinas na mesma conta" />
          </div>
        </div>
      </section>

      {/* ── CTA FINAL ── */}
      <section className="py-24 lg:py-32 px-5 lg:px-8 border-t border-steel-800">
        <div className="max-w-3xl mx-auto text-center">
          <div className="text-xs font-bold text-brand-400 uppercase tracking-widest">Comece sem custo. Sem risco.</div>
          <h2 className="mt-3 text-4xl lg:text-6xl font-bold tracking-tight leading-tight">
            Cadastre sua oficina.<br />
            <span className="text-brand-400">Hoje. Em 2 minutos.</span>
          </h2>
          <p className="mt-6 text-lg text-steel-400">
            Você ganha um sistema de gestão completo, marketplace de mecânicos
            e pagamento intermediado. <strong className="text-white">Sem pagar nada.</strong>
          </p>

          <Link to="/cadastro/oficina"
            className="inline-flex items-center gap-2 mt-10 bg-brand-500 text-white font-bold rounded-2xl px-8 py-5 text-lg hover:bg-brand-600 transition shadow-2xl shadow-brand-500/30">
            Cadastrar oficina grátis
            <span>→</span>
          </Link>

          <p className="mt-4 text-xs text-steel-500">
            Validamos seu CNPJ. Aprovação em até 24h.
          </p>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="border-t border-steel-800 py-10 px-5 lg:px-8">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-steel-500">
          <Link to="/"><Logo light /></Link>
          <div className="flex items-center gap-6">
            <Link to="/" className="hover:text-white transition">Início</Link>
            <Link to="/mecanico" className="hover:text-white transition">Sou mecânico</Link>
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

function ItemCheck({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <span className="text-signal-400 shrink-0 mt-0.5">✓</span>
      <span>{children}</span>
    </li>
  );
}

function ItemX({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <span className="text-steel-600 shrink-0 mt-0.5">✗</span>
      <span>{children}</span>
    </li>
  );
}
