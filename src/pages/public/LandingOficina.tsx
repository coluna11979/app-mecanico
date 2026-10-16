import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Logo } from '@/components/Logo';

// Semanas médias por mês (52 / 12)
const WEEKS_PER_MONTH = 4.3;

/**
 * Landing de captura — APENAS para oficina.
 * Foco: capacidade sob demanda + rede própria de mecânicos preferidos.
 * Evita promessas de prazo e o enquadramento "troque CLT pelo app".
 */
export default function LandingOficina() {
  const [refusedPerWeek, setRefusedPerWeek] = useState(3);
  const [avgTicket, setAvgTicket]           = useState(400);

  const monthlyLost = refusedPerWeek * avgTicket * WEEKS_PER_MONTH;
  const yearlyLost  = monthlyLost * 12;
  const brl = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 0 });

  return (
    <div className="min-h-screen bg-white text-steel-900 overflow-x-hidden pb-20 md:pb-0">

      {/* ── NAV ── */}
      <header className="fixed top-0 inset-x-0 z-50 bg-white/90 backdrop-blur-xl border-b border-steel-100">
        <div className="max-w-6xl mx-auto px-5 lg:px-8 h-16 flex items-center justify-between">
          <Link to="/"><Logo /></Link>
          <div className="flex items-center gap-2">
            <Link to="/login" state={{ fresh: true }} className="text-sm font-semibold text-steel-700 hover:text-steel-900 px-3 py-2 transition">
              Entrar
            </Link>
            <Link to="/cadastro/oficina"
              className="bg-brand-500 text-white text-sm font-bold rounded-xl px-4 py-2 hover:bg-brand-600 transition shadow-sm whitespace-nowrap">
              Cadastrar<span className="hidden sm:inline"> oficina</span>
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

            <div>
              <div className="inline-flex items-center gap-2 bg-brand-50 border border-brand-200 rounded-full px-3 py-1 text-xs font-bold text-brand-700 tracking-wider uppercase">
                Para donos de oficina
              </div>

              <h1 className="mt-6 text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.05] text-steel-900">
                A mão de obra que sua oficina precisa, <span className="text-brand-500">quando precisa.</span>
              </h1>

              <p className="mt-6 text-lg text-steel-600 leading-relaxed">
                Reforce sua equipe nos dias de pico, nas faltas e nos serviços que não cabem na agenda.
                Encontre mecânicos verificados na sua região e, com o tempo,{' '}
                <strong className="text-steel-900">monte a sua própria rede de profissionais de confiança.</strong>
              </p>

              <div className="mt-8 flex flex-col sm:flex-row gap-3">
                <Link to="/cadastro/oficina"
                  className="bg-brand-500 text-white font-bold rounded-2xl px-6 py-4 hover:bg-brand-600 transition flex items-center justify-center gap-2 shadow-xl shadow-brand-500/30">
                  Cadastrar minha oficina grátis
                  <span>→</span>
                </Link>
                <a href="#como-funciona"
                  className="text-sm font-semibold text-steel-700 hover:text-steel-900 border border-steel-200 hover:border-steel-300 rounded-2xl px-5 py-4 transition flex items-center justify-center">
                  Ver como funciona
                </a>
              </div>

              <div className="mt-6 flex items-center gap-4 text-xs text-steel-500 flex-wrap">
                <span className="flex items-center gap-1.5"><span className="text-signal-500">✓</span> Cadastro gratuito</span>
                <span className="flex items-center gap-1.5"><span className="text-signal-500">✓</span> Sem mensalidade</span>
                <span className="flex items-center gap-1.5"><span className="text-signal-500">✓</span> Sem exclusividade</span>
              </div>
            </div>

            {/* Mock: pedido indo primeiro para os preferidos */}
            <div className="relative">
              <div className="bg-white rounded-3xl p-5 shadow-2xl border border-steel-100">
                <div className="flex items-center justify-between pb-3 border-b border-steel-100">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-lg bg-brand-500 grid place-items-center text-white font-bold text-sm">O</div>
                    <div>
                      <div className="text-xs font-bold text-steel-900 leading-tight">Sua Oficina</div>
                      <div className="text-[9px] text-steel-500">Novo pedido de reforço</div>
                    </div>
                  </div>
                  <div className="text-[9px] text-steel-400">Painel</div>
                </div>

                <div className="mt-3 p-3 bg-steel-50 rounded-xl">
                  <div className="text-[10px] font-bold text-brand-600 uppercase tracking-widest">Pedido publicado</div>
                  <div className="mt-1 font-bold text-steel-900 text-sm">Suspensão dianteira · Gol 2015</div>
                  <div className="text-[11px] text-steel-500 mt-0.5">Hoje à tarde · valor combinado pelo serviço</div>
                  <div className="mt-2 inline-flex items-center gap-1 bg-brand-50 border border-brand-200 text-brand-700 rounded-full px-2 py-0.5 text-[10px] font-bold">
                    ★ Enviado para seus preferidos (4)
                  </div>
                </div>

                <div className="mt-3 text-[10px] font-bold text-steel-500 uppercase tracking-widest">2 respostas</div>
                <MockMechanic initials="CS" name="Carlos S." meta="★ 4,9 · 37 serviços" preferred />
                <MockMechanic initials="RM" name="Rafael M." meta="★ 4,8 · 21 serviços · Suspensão" preferred />

                <div className="mt-3 flex items-center gap-2 p-2.5 rounded-xl bg-signal-50 border border-signal-200 text-[11px] text-signal-800">
                  <span>🔒</span>
                  <span>Pagamento protegido até você confirmar o serviço</span>
                </div>
              </div>

              <div className="absolute -top-3 -right-3 bg-steel-900 text-white rounded-2xl px-4 py-2 shadow-xl rotate-[3deg]">
                <div className="text-[10px] font-bold uppercase tracking-widest text-brand-300">Sua rede</div>
                <div className="text-sm font-bold">★ Quem você já confia</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── DORES ── */}
      <section className="py-20 lg:py-28 px-5 lg:px-8 bg-steel-50">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <div className="text-xs font-bold text-brand-600 uppercase tracking-widest">A rotina de quem toca oficina</div>
            <h2 className="mt-3 text-3xl lg:text-5xl font-bold tracking-tight text-steel-900">
              Quando falta gente, a oficina inteira sente.
            </h2>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            <Pain title="Serviço recusado"
              desc='"Posso deixar pra semana que vem?" O cliente não espera, e vai pra outra oficina.' />
            <Pain title="Carro parado no box"
              desc="Um serviço travado ocupa o espaço de outros três. O pátio enche e o faturamento não sai." />
            <Pain title="Equipe no limite"
              desc="Nos dias de pico, todo mundo vira hora extra. Cai a qualidade, sobe o retrabalho, e o cansaço cobra a conta." />
            <Pain title="Contratar é difícil"
              desc="Achar mecânico bom leva semanas. E quando aparece, nem sempre a demanda justifica mais uma pessoa fixa." />
            <Pain title="Alguém faltou"
              desc="Atestado, férias, imprevisto. A agenda era pra quatro e só tem três." />
            <Pain title="Serviço fora da especialidade"
              desc="Chegou uma injeção eletrônica ou um câmbio automático e ninguém da equipe domina. Recusar é perder o cliente." />
          </div>

          <p className="mt-12 text-center text-xl lg:text-2xl font-bold text-steel-900">
            Não é falta de cliente. É falta de <span className="text-brand-500">mãos na hora certa.</span>
          </p>
        </div>
      </section>

      {/* ── CALCULADORA DE PERDA ── */}
      <section className="py-20 lg:py-28 px-5 lg:px-8">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10 max-w-3xl mx-auto">
            <div className="text-xs font-bold text-brand-600 uppercase tracking-widest">Simulação rápida</div>
            <h2 className="mt-3 text-3xl lg:text-5xl font-bold tracking-tight leading-tight text-steel-900">
              Quanto a falta de mão de obra <span className="text-brand-500">pode estar custando?</span>
            </h2>
            <p className="mt-4 text-base lg:text-lg text-steel-600 leading-relaxed">
              Responda duas perguntas e veja uma estimativa do faturamento que sua oficina deixa
              de realizar quando precisa adiar ou recusar serviços.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6 lg:gap-8 items-stretch bg-white rounded-3xl p-5 lg:p-8 shadow-xl border border-steel-100">
            {/* Perguntas */}
            <div className="flex flex-col justify-center gap-6">
              <CalcQuestion
                n={1}
                question="Quantos serviços sua oficina adia ou recusa por semana?"
                hint="Conte os que você não conseguiu atender na hora por falta de gente."
                value={refusedPerWeek} display={`${refusedPerWeek} ${refusedPerWeek === 1 ? 'serviço' : 'serviços'}`}
                min={1} max={20} step={1} onChange={setRefusedPerWeek}
                ticks={['1', '10', '20']}
              />
              <CalcQuestion
                n={2}
                question="Qual é o ticket médio desses serviços?"
                hint="Valor médio cobrado do cliente por serviço."
                value={avgTicket} display={`R$ ${brl(avgTicket)}`}
                min={100} max={3000} step={50} onChange={setAvgTicket}
                ticks={['R$ 100', 'R$ 1.500', 'R$ 3.000']}
              />
            </div>

            {/* Resultado */}
            <div className="bg-steel-900 rounded-2xl p-6 lg:p-7 text-white flex flex-col">
              <div className="text-sm font-semibold text-steel-300">Estimativa de faturamento perdido</div>
              <div className="mt-2 flex items-baseline gap-2 flex-wrap">
                <span className="text-5xl lg:text-6xl font-bold font-display leading-none text-brand-400">
                  R$ {brl(monthlyLost)}
                </span>
                <span className="text-lg text-steel-300">por mês</span>
              </div>
              <div className="mt-3 text-base text-steel-200">
                Cerca de <strong className="text-white">R$ {brl(yearlyLost)}</strong> por ano
              </div>

              <div className="mt-5 rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-xs text-steel-300 leading-relaxed">
                <div className="font-semibold text-steel-200">Como calculamos</div>
                {refusedPerWeek} {refusedPerWeek === 1 ? 'serviço' : 'serviços'} × R$ {brl(avgTicket)} × 4,3 semanas no mês
              </div>

              <p className="mt-5 text-sm text-white/85 leading-relaxed">
                É faturamento que deixa de entrar no caixa, não lucro. Com reforço de mão de obra quando
                precisar, sua oficina consegue aceitar mais desses serviços.
              </p>

              <div className="mt-auto pt-6">
                <Link to="/cadastro/oficina"
                  className="w-full bg-brand-500 text-white font-bold rounded-xl px-5 py-3.5 hover:bg-brand-600 transition flex items-center justify-center gap-2">
                  Quero atender mais serviços →
                </Link>
                <p className="mt-2 text-center text-[11px] text-steel-400">Cadastro gratuito · Sem mensalidade</p>
              </div>
            </div>
          </div>

          <p className="mt-5 text-center text-xs text-steel-500 max-w-2xl mx-auto leading-relaxed">
            Simulação com base nos números que você informou. Considera o valor cobrado do cliente, sem descontar
            peças e custos, e não é garantia de resultado.
          </p>
        </div>
      </section>

      {/* ── SOLUÇÃO ── */}
      <section className="py-20 lg:py-28 px-5 lg:px-8 bg-steel-50">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <div className="text-xs font-bold text-brand-600 uppercase tracking-widest">Como o MecânicoApp ajuda</div>
            <h2 className="mt-3 text-3xl lg:text-5xl font-bold tracking-tight leading-tight text-steel-900">
              Reforço sob demanda, <span className="text-brand-500">sem complicar sua rotina.</span>
            </h2>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <Win title="Mais capacidade nos picos"
              desc="Entrou mais serviço do que a equipe dá conta? Publique o pedido e receba mecânicos interessados da sua região." />
            <Win title="Cobertura para faltas"
              desc="Alguém faltou ou está de férias? Chame um reforço para o dia, sem refazer a agenda inteira." />
            <Win title="Especialistas quando precisar"
              desc="Ache profissionais com experiência no serviço que sua equipe não faz no dia a dia." />
            <Win title="Pague pelo serviço, não pela ociosidade"
              desc="Você combina o valor do serviço e paga por ele. Sem mensalidade e sem custo quando não usa." />
          </div>
        </div>
      </section>

      {/* ── REDE DE CONFIANÇA (destaque) ── */}
      <section className="py-20 lg:py-28 px-5 lg:px-8 bg-steel-900 text-white relative overflow-hidden">
        <div className="absolute -top-40 -right-40 w-[500px] h-[500px] rounded-full bg-brand-500/15 blur-3xl pointer-events-none" />
        <div className="relative max-w-5xl mx-auto">
          <div className="text-center mb-14 max-w-3xl mx-auto">
            <div className="text-xs font-bold text-brand-300 uppercase tracking-widest">O diferencial</div>
            <h2 className="mt-3 text-3xl lg:text-5xl font-bold tracking-tight leading-tight">
              Comece conhecendo.<br />
              <span className="text-brand-400">Termine com uma equipe de confiança.</span>
            </h2>
            <p className="mt-5 text-lg text-steel-300 leading-relaxed">
              Todo mecânico que trabalha bem na sua oficina pode entrar na sua lista de{' '}
              <strong className="text-white">★ Preferidos</strong>. Na próxima vez que faltar gente, você manda o
              pedido primeiro para eles, que já conhecem seu jeito de trabalhar.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            <NetworkStep n={1} title="Conheça"
              desc="Publique para a região e receba profissionais verificados, com nota e histórico." />
            <NetworkStep n={2} title="Avalie"
              desc="Depois do serviço, dê sua nota. Gostou do trabalho? Salve nos preferidos." />
            <NetworkStep n={3} title="Chame de novo"
              desc="Publique pedidos só para a sua rede. Quem já conhece sua oficina responde primeiro." />
          </div>

          <div className="mt-12 text-center">
            <p className="text-xl font-bold">É como ter uma equipe extra, que você chama só quando precisa.</p>
            <Link to="/cadastro/oficina"
              className="inline-flex items-center gap-2 mt-6 bg-brand-500 text-white font-bold rounded-2xl px-6 py-4 hover:bg-brand-600 transition shadow-xl shadow-brand-500/30">
              Começar minha rede →
            </Link>
          </div>
        </div>
      </section>

      {/* ── COMO FUNCIONA ── */}
      <section id="como-funciona" className="py-20 lg:py-28 px-5 lg:px-8 scroll-mt-16">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-14">
            <div className="text-xs font-bold text-brand-600 uppercase tracking-widest">Como funciona</div>
            <h2 className="mt-3 text-3xl lg:text-5xl font-bold tracking-tight leading-tight text-steel-900">
              Do pedido ao serviço pronto, em 4 passos.
            </h2>
          </div>

          <div className="space-y-3">
            <FlowStep n={1} title="Cadastre sua oficina"
              desc="Leva poucos minutos. Nossa equipe confere os dados e libera seu acesso." />
            <FlowStep n={2} title="Publique o que precisa"
              desc="Serviço, dia, valor e prazo. Escolha: só para seus preferidos ou para mecânicos verificados da região." />
            <FlowStep n={3} title="Escolha quem vai"
              desc="Veja nota, histórico e especialidades antes de confirmar. O pagamento fica protegido na plataforma." />
            <FlowStep n={4} title="Confirme e avalie"
              desc="Serviço feito, você confirma e o pagamento é liberado. Gostou? Salve nos preferidos." />
          </div>
        </div>
      </section>

      {/* ── SEGURANÇA ── */}
      <section className="py-20 lg:py-28 px-5 lg:px-8 bg-steel-50">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <div className="text-xs font-bold text-brand-600 uppercase tracking-widest">Confiança em cada etapa</div>
            <h2 className="mt-3 text-3xl lg:text-5xl font-bold tracking-tight leading-tight text-steel-900">
              Você sabe quem está entrando na sua oficina.
            </h2>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Trust icon="🪪" title="Cadastro verificado"
              desc="Todo mecânico passa por análise de documentos antes de ser aprovado." />
            <Trust icon="★" title="Reputação real"
              desc="Cada serviço gera uma avaliação. Você vê nota, número de serviços e especialidades." />
            <Trust icon="🔒" title="Pagamento protegido"
              desc="O valor fica guardado na plataforma e só é liberado depois que você confirma a conclusão." />
            <Trust icon="📋" title="Tudo registrado"
              desc="Histórico de cada serviço: quem fez, quanto custou e como foi avaliado." />
          </div>
        </div>
      </section>

      {/* ── GESTÃO INTEGRADA ── */}
      <section className="py-20 lg:py-28 px-5 lg:px-8">
        <div className="max-w-5xl mx-auto grid lg:grid-cols-2 gap-10 items-center">
          <div>
            <div className="text-xs font-bold text-brand-600 uppercase tracking-widest">De bônus</div>
            <h2 className="mt-3 text-3xl lg:text-4xl font-bold tracking-tight leading-tight text-steel-900">
              O reforço entra direto na rotina da oficina.
            </h2>
            <p className="mt-4 text-base text-steel-600 leading-relaxed">
              Além da mão de obra, sua oficina ganha um sistema de gestão gratuito. O serviço feito pelo
              profissional de fora fica no mesmo histórico da OS, do cliente e do veículo.
            </p>
          </div>
          <ul className="space-y-3">
            {[
              'Ordens de serviço, clientes e veículos',
              'Agenda e histórico de cada carro',
              'Várias lojas no mesmo login',
              'Comece só com o reforço de mão de obra e adote a gestão no seu ritmo',
            ].map(item => (
              <li key={item} className="flex items-start gap-3 bg-white border border-steel-200 rounded-xl p-4 shadow-sm">
                <span className="text-signal-500 font-bold">✓</span>
                <span className="text-sm text-steel-700">{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="py-20 lg:py-28 px-5 lg:px-8 bg-steel-50">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <div className="text-xs font-bold text-brand-600 uppercase tracking-widest">Dúvidas frequentes</div>
            <h2 className="mt-3 text-3xl lg:text-5xl font-bold tracking-tight leading-tight text-steel-900">
              Perguntas de quem toca oficina.
            </h2>
          </div>

          <div className="space-y-3">
            <Faq q="Preciso pagar para me cadastrar?"
              a="Não. O cadastro e o sistema de gestão são gratuitos, sem mensalidade. Você só paga pelos serviços que contratar." />
            <Faq q="Posso continuar com minha equipe atual?"
              a="Pode, e é para isso que o app existe. O MecânicoApp complementa sua equipe nos picos, nas faltas e em serviços específicos. Não tem exclusividade nem fidelidade." />
            <Faq q="Como sei se o mecânico é bom?"
              a="Todo profissional passa por análise de cadastro antes de ser aprovado. Cada serviço gera uma avaliação, e você vê nota, quantidade de serviços e especialidades antes de escolher." />
            <Faq q="O que são os mecânicos preferidos?"
              a="É a sua lista pessoal de profissionais de confiança. Gostou de um trabalho? Salve o mecânico. Depois, você pode publicar pedidos só para essa lista." />
            <Faq q="Como funciona o pagamento?"
              a="O valor combinado fica protegido na plataforma e só é liberado ao mecânico depois que você confirma que o serviço foi concluído." />
            <Faq q="Quanto tempo leva para achar um mecânico?"
              a="Depende da sua região, do dia e do tipo de serviço. Publicar com antecedência e ter uma lista de preferidos ajuda bastante. Quem já conhece sua oficina costuma responder primeiro." />
            <Faq q="O mecânico vira funcionário da minha oficina?"
              a="Não. Ele é um profissional independente que presta um serviço pontual pela plataforma. Para dúvidas trabalhistas do seu caso específico, consulte seu contador." />
            <Faq q="Atendem minha cidade?"
              a="Estamos crescendo região por região. Cadastre sua oficina e avisamos quando houver profissionais disponíveis perto de você." />
          </div>
        </div>
      </section>

      {/* ── CTA FINAL ── */}
      <section className="py-24 lg:py-32 px-5 lg:px-8 bg-gradient-to-b from-white to-brand-50/40">
        <div className="max-w-3xl mx-auto text-center">
          <div className="text-xs font-bold text-brand-600 uppercase tracking-widest">Comece hoje, use quando precisar</div>
          <h2 className="mt-3 text-4xl lg:text-6xl font-bold tracking-tight leading-tight text-steel-900">
            Na próxima vez que faltar gente,<br />
            <span className="text-brand-500">você já sabe quem chamar.</span>
          </h2>
          <p className="mt-6 text-lg text-steel-600">
            Cadastre sua oficina de graça. Não tem mensalidade nem exclusividade, e você só paga pelo serviço que contratar.
          </p>

          <Link to="/cadastro/oficina"
            className="inline-flex items-center gap-2 mt-10 bg-brand-500 text-white font-bold rounded-2xl px-8 py-5 text-lg hover:bg-brand-600 transition shadow-2xl shadow-brand-500/30">
            Cadastrar minha oficina grátis
            <span>→</span>
          </Link>

          <p className="mt-4 text-xs text-steel-500">
            Conferimos os dados de cada oficina antes de liberar o acesso.
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
                Mão de obra sob demanda e gestão para oficinas, num só lugar.
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
                <li><Link to="/termos" className="hover:text-brand-600 transition">Termos de uso</Link></li>
                <li><Link to="/privacidade" className="hover:text-brand-600 transition">Privacidade</Link></li>
              </ul>
            </div>

            <div>
              <div className="text-xs font-bold text-steel-900 uppercase tracking-widest mb-3">Confiança</div>
              <ul className="space-y-2 text-sm text-steel-600">
                <li>Cadastro verificado</li>
                <li>Pagamento protegido</li>
                <li>Avaliações reais</li>
                <li>Suporte por chat</li>
              </ul>
            </div>
          </div>

          <div className="pt-6 border-t border-steel-100 flex flex-col md:flex-row items-center justify-between gap-3 text-xs text-steel-500">
            <div>© MecânicoApp {new Date().getFullYear()} · Todos os direitos reservados</div>
            <div className="flex items-center gap-5">
              <span>Feito no Brasil 🇧🇷</span>
            </div>
          </div>
        </div>
      </footer>

      {/* ── CTA FIXO NO CELULAR ── */}
      <div className="md:hidden fixed bottom-0 inset-x-0 z-50 bg-white/95 backdrop-blur border-t border-steel-200 p-3">
        <Link to="/cadastro/oficina"
          className="w-full bg-brand-500 text-white font-bold rounded-xl px-5 py-3.5 flex items-center justify-center gap-2 shadow-lg shadow-brand-500/30">
          Cadastrar minha oficina grátis →
        </Link>
      </div>
    </div>
  );
}

/* ─── Componentes auxiliares ─── */

function MockMechanic({ initials, name, meta, preferred }: { initials: string; name: string; meta: string; preferred?: boolean }) {
  return (
    <div className="mt-2 p-3 bg-white border border-steel-200 rounded-xl flex items-center gap-3">
      <div className="h-9 w-9 rounded-full bg-steel-800 grid place-items-center text-white font-bold text-xs shrink-0">{initials}</div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-bold text-steel-900 flex items-center gap-1.5">
          {name}
          {preferred && <span className="text-[9px] font-bold text-brand-600 bg-brand-50 rounded px-1.5 py-0.5">★ Preferido</span>}
        </div>
        <div className="text-[10px] text-steel-500 truncate">{meta}</div>
      </div>
      <div className="text-[10px] font-bold text-white bg-brand-500 rounded-lg px-2.5 py-1.5">Escolher</div>
    </div>
  );
}

function CalcQuestion({ n, question, hint, value, display, min, max, step, onChange, ticks }: {
  n: number; question: string; hint: string; value: number; display: string;
  min: number; max: number; step: number; onChange: (v: number) => void; ticks: string[];
}) {
  return (
    <div className="rounded-2xl bg-steel-50 border border-steel-100 p-4 lg:p-5">
      <div className="flex items-start gap-3">
        <div className="h-7 w-7 rounded-full bg-steel-900 text-white grid place-items-center text-xs font-bold shrink-0">{n}</div>
        <div>
          <div className="font-bold text-steel-900 leading-snug">{question}</div>
          <div className="mt-0.5 text-xs text-steel-500 leading-snug">{hint}</div>
        </div>
      </div>
      <div className="mt-4 text-2xl font-bold text-steel-900 font-display">{display}</div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        aria-label={question}
        className="mt-2 w-full accent-brand-500 cursor-pointer"
      />
      <div className="flex justify-between text-[10px] text-steel-400 font-semibold mt-1">
        {ticks.map(t => <span key={t}>{t}</span>)}
      </div>
    </div>
  );
}

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

function NetworkStep({ n, title, desc }: { n: number; title: string; desc: string }) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
      <div className="h-10 w-10 rounded-full bg-brand-500 grid place-items-center font-bold text-lg text-white">{n}</div>
      <h3 className="mt-4 font-bold text-xl">{title}</h3>
      <p className="mt-2 text-sm text-steel-300 leading-relaxed">{desc}</p>
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

function Trust({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div className="bg-white border border-steel-200 rounded-2xl p-5 shadow-sm">
      <div className="h-10 w-10 rounded-xl bg-brand-50 grid place-items-center text-lg text-brand-600">{icon}</div>
      <h3 className="mt-3 font-bold text-base text-steel-900">{title}</h3>
      <p className="mt-1.5 text-sm text-steel-600 leading-relaxed">{desc}</p>
    </div>
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
