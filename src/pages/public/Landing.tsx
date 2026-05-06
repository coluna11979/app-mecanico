import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Logo } from '@/components/Logo';

/**
 * Home institucional — fundo claro, alto contraste, estilo fintech.
 * Apresenta o produto e segmenta visitante (mecânico ou oficina).
 */
export default function Landing() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="min-h-screen bg-white text-steel-900 overflow-x-hidden">

      {/* ── NAV ── */}
      <header className={`fixed top-0 inset-x-0 z-50 transition-all ${
        scrolled ? 'bg-white/90 backdrop-blur-xl shadow-sm border-b border-steel-100' : 'bg-white/80 backdrop-blur-sm'
      }`}>
        <div className="max-w-6xl mx-auto px-5 lg:px-8 h-16 flex items-center justify-between">
          <Logo />
          <div className="flex items-center gap-3">
            <Link to="/login" state={{ fresh: true }} className="text-sm font-semibold text-steel-700 hover:text-steel-900 px-4 py-2 transition">
              Entrar
            </Link>
          </div>
        </div>
      </header>

      {/* ── HERO ── */}
      <section className="relative pt-32 pb-20 lg:pt-40 lg:pb-28 px-5 lg:px-8">
        {/* Glow soft */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[900px] h-[900px] rounded-full bg-brand-500/10 blur-3xl" />
        </div>

        <div className="relative max-w-5xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-brand-50 border border-brand-100 rounded-full px-4 py-1.5 text-xs font-bold text-brand-700 tracking-widest uppercase">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-500 animate-pulse" />
            Plataforma de manutenção automotiva
          </div>

          <h1 className="mt-8 text-4xl sm:text-5xl lg:text-7xl font-bold tracking-tight leading-[1.05] text-steel-900">
            A plataforma que conecta<br />
            <span className="text-brand-500">oficinas e mecânicos</span><br />
            em tempo real.
          </h1>

          <p className="mt-6 text-lg lg:text-xl text-steel-600 max-w-2xl mx-auto leading-relaxed">
            Tecnologia simples para resolver um problema antigo:
            colocar quem tem o serviço e quem sabe fazer no mesmo lugar — com transparência, rastreamento e pagamento garantido.
          </p>

          {/* CTAs de segmentação */}
          <div className="mt-12 flex flex-col sm:flex-row gap-3 justify-center max-w-lg mx-auto">
            <Link to="/mecanico"
              className="group flex-1 bg-steel-900 text-white font-bold rounded-2xl px-6 py-4 hover:bg-steel-800 transition flex items-center justify-center gap-2 shadow-lg shadow-steel-900/10">
              <span className="text-2xl">🔧</span>
              <span>Sou mecânico</span>
              <span className="opacity-0 group-hover:opacity-100 transition">→</span>
            </Link>
            <Link to="/oficina"
              className="group flex-1 bg-brand-500 text-white font-bold rounded-2xl px-6 py-4 hover:bg-brand-600 transition flex items-center justify-center gap-2 shadow-lg shadow-brand-500/30">
              <span className="text-2xl">🏪</span>
              <span>Sou oficina</span>
              <span className="opacity-0 group-hover:opacity-100 transition">→</span>
            </Link>
          </div>

          <p className="mt-6 text-xs text-steel-500">
            Cadastro gratuito · Sem mensalidade · Sem fidelidade
          </p>
        </div>
      </section>

      {/* ── POR QUE EXISTE ── */}
      <section className="py-20 lg:py-28 px-5 lg:px-8 bg-steel-50">
        <div className="max-w-5xl mx-auto">
          <div className="text-center max-w-3xl mx-auto">
            <div className="text-xs font-bold text-brand-600 uppercase tracking-widest">Manifesto</div>
            <h2 className="mt-3 text-3xl lg:text-5xl font-bold tracking-tight leading-tight text-steel-900">
              Por que esse app existe.
            </h2>
            <p className="mt-6 text-lg text-steel-600 leading-relaxed">
              O setor automotivo move bilhões. Mas conexão entre quem precisa e quem entrega ainda acontece por indicação, telefone e papel.
              Decidimos digitalizar essa ponte — com a mesma clareza de um app de mobilidade,
              só que para serviço técnico de verdade.
            </p>
          </div>

          <div className="mt-14 grid md:grid-cols-3 gap-5">
            <Pillar
              icon="🔗"
              title="Conexão direta"
              desc="Quem demanda e quem executa se encontram sem intermediário e sem fricção."
            />
            <Pillar
              icon="🛡️"
              title="Confiança verificável"
              desc="Reputação, rastreamento ao vivo e histórico público de cada serviço prestado."
            />
            <Pillar
              icon="⚡"
              title="Tempo real"
              desc="Job aceito, mecânico a caminho, serviço em execução — tudo acompanhado em tempo real."
            />
          </div>
        </div>
      </section>

      {/* ── O QUE ELE FAZ ── */}
      <section className="py-20 lg:py-28 px-5 lg:px-8">
        <div className="max-w-5xl mx-auto">
          <div className="text-center max-w-3xl mx-auto mb-14">
            <div className="text-xs font-bold text-brand-600 uppercase tracking-widest">O que ele faz</div>
            <h2 className="mt-3 text-3xl lg:text-5xl font-bold tracking-tight leading-tight text-steel-900">
              Quatro pilares. Um único app.
            </h2>
          </div>

          <div className="grid md:grid-cols-2 gap-5">
            <Feature n="01" title="Marketplace de jobs"
              desc="Oficina publica a demanda. Mecânico aceita. Sem cadastro de currículo, sem entrevista, sem CLT." />
            <Feature n="02" title="Rastreamento ao vivo"
              desc="Mapa em tempo real. ETA preciso. Confirmação de chegada. A oficina sabe exatamente onde está o profissional." />
            <Feature n="03" title="Pagamento garantido"
              desc="Via cartão ou PIX, retido pela plataforma. Liberado ao mecânico só após confirmação do serviço pela oficina." />
            <Feature n="04" title="Gestão de OS"
              desc="Ordens de serviço, clientes, veículos, mecânicos internos, agendamentos — tudo digital, no mesmo painel." />
          </div>
        </div>
      </section>

      {/* ── COMO FUNCIONA ── */}
      <section className="py-20 lg:py-28 px-5 lg:px-8 bg-steel-50">
        <div className="max-w-4xl mx-auto">
          <div className="text-center max-w-3xl mx-auto mb-14">
            <div className="text-xs font-bold text-brand-600 uppercase tracking-widest">Como funciona</div>
            <h2 className="mt-3 text-3xl lg:text-5xl font-bold tracking-tight leading-tight text-steel-900">
              Do cadastro ao pagamento, em quatro passos.
            </h2>
          </div>

          <div className="space-y-3">
            <Step n={1} title="Cadastro e aprovação" desc="Validamos CNPJ da oficina e CPF/CNH do mecânico. Aprovação em até 24h." />
            <Step n={2} title="Job publicado" desc="A oficina cria a demanda com valor por hora e teto de horas. Mecânicos disponíveis na região recebem o alerta." />
            <Step n={3} title="Aceite e execução" desc="O profissional aceita, vai até o local, executa o serviço. Tudo rastreado em tempo real, com chat integrado." />
            <Step n={4} title="Confirmação e repasse" desc="A oficina avalia, libera o pagamento. PIX cai na conta do mecânico em até 24h." />
          </div>
        </div>
      </section>

      {/* ── CTA FINAL ── */}
      <section className="py-20 lg:py-28 px-5 lg:px-8">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl lg:text-5xl font-bold tracking-tight leading-tight text-steel-900">
            Pronto pra começar?
          </h2>
          <p className="mt-4 text-lg text-steel-600">
            Escolha seu perfil e descubra como o app trabalha pra você.
          </p>

          <div className="mt-10 flex flex-col sm:flex-row gap-3 max-w-lg mx-auto">
            <Link to="/mecanico"
              className="flex-1 bg-steel-900 text-white font-bold rounded-2xl px-6 py-4 hover:bg-steel-800 transition flex items-center justify-center gap-2 shadow-lg shadow-steel-900/10">
              <span className="text-2xl">🔧</span> Sou mecânico
            </Link>
            <Link to="/oficina"
              className="flex-1 bg-brand-500 text-white font-bold rounded-2xl px-6 py-4 hover:bg-brand-600 transition flex items-center justify-center gap-2 shadow-lg shadow-brand-500/30">
              <span className="text-2xl">🏪</span> Sou oficina
            </Link>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="border-t border-steel-100 py-10 px-5 lg:px-8 bg-white">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-steel-500">
          <Logo />
          <div className="flex items-center gap-6">
            <Link to="/login" state={{ fresh: true }} className="hover:text-steel-900 transition">Entrar</Link>
            <Link to="/mecanico" className="hover:text-steel-900 transition">Mecânico</Link>
            <Link to="/oficina" className="hover:text-steel-900 transition">Oficina</Link>
          </div>
          <div className="text-xs">© MecânicoApp {new Date().getFullYear()}</div>
        </div>
      </footer>
    </div>
  );
}

/* ─── Componentes auxiliares ─── */

function Pillar({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div className="bg-white border border-steel-200 rounded-2xl p-6 shadow-sm hover:shadow-lg hover:border-brand-300 transition">
      <div className="text-4xl">{icon}</div>
      <h3 className="mt-4 text-lg font-bold text-steel-900">{title}</h3>
      <p className="mt-2 text-sm text-steel-600 leading-relaxed">{desc}</p>
    </div>
  );
}

function Feature({ n, title, desc }: { n: string; title: string; desc: string }) {
  return (
    <div className="bg-white border border-steel-200 rounded-2xl p-6 shadow-sm hover:shadow-lg hover:border-brand-300 transition">
      <div className="text-xs font-bold text-brand-600 tracking-widest">{n}</div>
      <h3 className="mt-3 text-xl font-bold tracking-tight text-steel-900">{title}</h3>
      <p className="mt-2 text-sm text-steel-600 leading-relaxed">{desc}</p>
    </div>
  );
}

function Step({ n, title, desc }: { n: number; title: string; desc: string }) {
  return (
    <div className="flex gap-5 bg-white border border-steel-200 rounded-2xl p-5 shadow-sm hover:shadow-md hover:border-brand-200 transition">
      <div className="h-10 w-10 rounded-full bg-brand-50 border border-brand-200 grid place-items-center text-brand-600 font-bold shrink-0">
        {n}
      </div>
      <div>
        <h3 className="font-bold text-lg leading-tight text-steel-900">{title}</h3>
        <p className="mt-1 text-sm text-steel-600 leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}
