import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Logo } from '@/components/Logo';

type Persona = 'mechanic' | 'workshop';

const SKILLS = ['Motor','Suspensão','Freios','Elétrica','Injeção eletrônica','Câmbio automático','Ar-condicionado','Diagnóstico OBD','Motor diesel','Funilaria','Alinhamento','Balanceamento'];

/* ── Theme hook ── */
function useDark() {
  const [dark, setDark] = useState<boolean>(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('theme') : null;
    if (saved) return saved === 'dark';
    return typeof window !== 'undefined'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
      : true;
  });
  useEffect(() => { localStorage.setItem('theme', dark ? 'dark' : 'light'); }, [dark]);
  return [dark, setDark] as const;
}

export default function Landing() {
  const [persona, setPersona] = useState<Persona>('workshop');
  const [scrolled, setScrolled] = useState(false);
  const [eta, setEta] = useState(12);
  const [dark, setDark] = useDark();

  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', h, { passive: true });
    return () => window.removeEventListener('scroll', h);
  }, []);

  useEffect(() => {
    const t = setInterval(() => setEta(e => (e <= 1 ? 12 : e - 1)), 2800);
    return () => clearInterval(t);
  }, []);

  /* ── Theme tokens ── */
  const T = {
    page:      dark ? 'bg-[#09090B] text-white'       : 'bg-slate-50 text-zinc-900',
    nav:       dark ? 'bg-[#09090B]/90 border-white/[0.06]' : 'bg-slate-50/90 border-zinc-200',
    card:      dark ? 'bg-[#18181B]'                   : 'bg-white border border-zinc-100 shadow-sm',
    cardHover: dark ? 'hover:bg-[#1F1F23]'             : 'hover:bg-zinc-50',
    inner:     dark ? 'bg-[#09090B]'                   : 'bg-zinc-50 border border-zinc-100',
    badge:     dark ? 'bg-[#18181B] shadow-2xl'        : 'bg-white border border-zinc-100 shadow-lg',
    h:         dark ? 'text-white'                     : 'text-zinc-900',
    sub:       dark ? 'text-zinc-400'                  : 'text-zinc-600',
    muted:     dark ? 'text-zinc-500'                  : 'text-zinc-500',
    dim:       dark ? 'text-zinc-600'                  : 'text-zinc-400',
    pill:      dark ? 'bg-white/[0.06]'                : 'bg-zinc-100',
    pillOn:    dark ? 'bg-white text-zinc-900'         : 'bg-zinc-900 text-white',
    pillOff:   dark ? 'text-zinc-500 hover:text-zinc-300' : 'text-zinc-500 hover:text-zinc-700',
    divider:   dark ? 'border-white/[0.05] bg-white/[0.01]' : 'border-zinc-100 bg-zinc-50',
    tag:       dark ? 'bg-white/[0.04] text-zinc-500'  : 'bg-zinc-100 text-zinc-500',
    cta:       dark ? 'bg-[#18181B]'                   : 'bg-zinc-900',
    ctaBtn:    dark ? 'bg-white/[0.07] hover:bg-white/[0.1] text-white' : 'bg-white/10 hover:bg-white/20 text-white',
    footer:    dark ? 'border-white/[0.06]'            : 'border-zinc-200',
    toggle:    dark ? 'bg-white/[0.07] text-amber-300 hover:bg-white/[0.12]' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200',
    pain:      dark ? 'bg-[#18181B] border border-red-900/30' : 'bg-red-50 border border-red-100',
    painX:     dark ? 'text-red-400' : 'text-red-500',
    benefit:   dark ? 'bg-[#18181B] border border-green-900/30' : 'bg-green-50 border border-green-100',
    benefitV:  dark ? 'text-green-400' : 'text-green-600',
  };

  return (
    <div className={`min-h-screen ${T.page}`}>

      {/* ── NAV ── */}
      <header className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${scrolled ? `${T.nav} backdrop-blur-2xl border-b` : ''}`}>
        <div className="max-w-6xl mx-auto px-6 lg:px-10 flex h-16 items-center justify-between">
          <Logo />
          <nav className="flex items-center gap-3">
            {/* Dark / Light toggle */}
            <button
              onClick={() => setDark(d => !d)}
              className={`rounded-full w-9 h-9 flex items-center justify-center text-base transition-colors ${T.toggle}`}
              title={dark ? 'Modo claro' : 'Modo escuro'}
            >
              {dark ? '☀️' : '🌙'}
            </button>
            <Link to="/login" className={`${T.sub} hover:${T.h} text-sm transition-colors`}>Entrar</Link>
            <Link to="/cadastro/oficina" className="bg-[#FF5C0A] hover:bg-[#e85200] text-white text-sm font-semibold px-5 py-2 rounded-full transition-colors">
              Cadastrar oficina
            </Link>
          </nav>
        </div>
      </header>

      {/* ── HERO ── */}
      <section className="relative min-h-screen flex items-center overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-[#FF5C0A]/5 blur-[140px] rounded-full" />
          <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-[#FF5C0A]/4 blur-[120px] rounded-full" />
        </div>

        <div className="relative w-full max-w-6xl mx-auto px-6 lg:px-10 pt-24 pb-20">
          <div className="grid lg:grid-cols-2 gap-16 items-center">

            {/* Left */}
            <div style={{ animation: 'fadeUp 0.8s cubic-bezier(0.16,1,0.3,1) both' }}>

              {/* Persona pill */}
              <div className={`inline-flex p-1 ${T.pill} rounded-full mb-10`}>
                {(['workshop', 'mechanic'] as Persona[]).map(p => (
                  <button key={p} onClick={() => setPersona(p)}
                    className={`px-5 py-1.5 rounded-full text-sm font-medium transition-all duration-300 ${
                      persona === p ? T.pillOn : T.pillOff
                    }`}>
                    {p === 'mechanic' ? 'Sou Mecânico' : 'Sou Oficina'}
                  </button>
                ))}
              </div>

              {/* Headline por persona */}
              {persona === 'workshop' ? (
                <div key="shop" style={{ animation: 'fadeUp 0.5s cubic-bezier(0.16,1,0.3,1) both' }}>
                  <h1 className={`text-[2.8rem] lg:text-[3.6rem] font-bold leading-[1.1] tracking-[-0.02em] ${T.h}`}>
                    Chega de ficar<br />sem mecânico<br />
                    <span className="text-[#FF5C0A]">na hora H.</span>
                  </h1>
                  <p className={`mt-5 ${T.sub} text-lg leading-relaxed max-w-md`}>
                    Sua oficina não pode parar. Encontre profissionais verificados em minutos,{' '}
                    acompanhe no mapa em tempo real e pague com segurança total.{' '}
                    <span className={`${T.h} font-medium`}>Para a oficina, sempre gratuito.</span>
                  </p>
                  <div className="mt-8 flex items-center gap-4">
                    <Link to="/cadastro/oficina" className="bg-[#FF5C0A] hover:bg-[#e85200] text-white font-semibold px-7 py-3 rounded-full transition-colors text-sm">
                      Cadastrar minha oficina
                    </Link>
                    <Link to="/login" className={`${T.sub} hover:${T.h} text-sm transition-colors flex items-center gap-1.5`}>
                      Já tenho conta <span className="opacity-50">→</span>
                    </Link>
                  </div>
                  <div className="mt-12 flex items-center gap-8">
                    <Stat n="Grátis" l="Para a oficina" dark={dark} />
                    <div className={`w-px h-8 ${dark ? 'bg-white/10' : 'bg-zinc-200'}`} />
                    <Stat n="100%" l="Verificados" dark={dark} />
                    <div className={`w-px h-8 ${dark ? 'bg-white/10' : 'bg-zinc-200'}`} />
                    <Stat n="Ao vivo" l="No mapa" dark={dark} />
                  </div>
                </div>
              ) : (
                <div key="mech" style={{ animation: 'fadeUp 0.5s cubic-bezier(0.16,1,0.3,1) both' }}>
                  <h1 className={`text-[2.8rem] lg:text-[3.6rem] font-bold leading-[1.1] tracking-[-0.02em] ${T.h}`}>
                    Seu talento.<br />Seu horário.<br />
                    <span className="text-[#FF5C0A]">Seu dinheiro.</span>
                  </h1>
                  <p className={`mt-5 ${T.sub} text-lg leading-relaxed max-w-md`}>
                    Cadastro gratuito, sem investimento inicial, sem patrão.{' '}
                    Você escolhe quando e onde trabalhar.{' '}
                    <span className={`${T.h} font-medium`}>Receba via PIX, rápido e garantido.</span>
                  </p>
                  <div className="mt-8 flex items-center gap-4">
                    <Link to="/cadastro/mecanico" className="bg-[#FF5C0A] hover:bg-[#e85200] text-white font-semibold px-7 py-3 rounded-full transition-colors text-sm">
                      Quero me cadastrar — é grátis
                    </Link>
                    <Link to="/login" className={`${T.sub} hover:${T.h} text-sm transition-colors flex items-center gap-1.5`}>
                      Já tenho conta <span className="opacity-50">→</span>
                    </Link>
                  </div>
                  <div className="mt-12 flex items-center gap-8">
                    <Stat n="Grátis" l="Cadastro" dark={dark} />
                    <div className={`w-px h-8 ${dark ? 'bg-white/10' : 'bg-zinc-200'}`} />
                    <Stat n="Zero" l="Investimento" dark={dark} />
                    <div className={`w-px h-8 ${dark ? 'bg-white/10' : 'bg-zinc-200'}`} />
                    <Stat n="PIX" l="Garantido" dark={dark} />
                  </div>
                </div>
              )}
            </div>

            {/* Right — App mockup */}
            <div style={{ animation: 'fadeUp 0.8s cubic-bezier(0.16,1,0.3,1) 0.12s both' }} className="relative">
              <div style={{ animation: 'floatCard 5s ease-in-out infinite' }}
                className={`absolute -top-4 -left-2 z-10 flex items-center gap-2.5 ${T.badge} rounded-2xl px-4 py-2.5`}>
                <span className="h-2 w-2 rounded-full bg-[#16C784] animate-pulse-soft" />
                <div>
                  <div className={`${T.h} text-sm font-semibold leading-none`}>142</div>
                  <div className={`${T.dim} text-[10px] mt-0.5`}>mecânicos online</div>
                </div>
              </div>

              <div className={`${T.card} rounded-3xl p-5 shadow-2xl`}>
                <div className="flex items-center justify-between mb-4">
                  <span className={`${T.muted} text-xs font-medium`}>Mechanic Live</span>
                  <span className="flex items-center gap-1.5 text-[#16C784] text-xs font-semibold">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#16C784] animate-pulse" />
                    Ao vivo
                  </span>
                </div>

                <div className={`flex items-center gap-3 ${T.inner} rounded-2xl p-3.5 mb-3`}>
                  <div className="relative shrink-0">
                    <div className="h-11 w-11 rounded-full bg-[#FF5C0A] flex items-center justify-center text-white font-bold text-base">JS</div>
                    <div className="absolute -inset-1.5 rounded-full border border-[#FF5C0A]/30 animate-ping" style={{ animationDuration: '2.5s' }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={`${T.h} text-sm font-semibold`}>João Silva</div>
                    <div className={`${T.muted} text-xs mt-0.5`}>★ 4.9 · 248 jobs · R$ 120/h</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className={`${T.muted} text-[10px]`}>distância</div>
                    <div className={`${T.h} text-sm font-bold`}>8 km</div>
                  </div>
                </div>

                <div className="flex gap-1.5 mb-4">
                  {['Motor', 'Freios', 'Elétrica'].map(s => (
                    <span key={s} className={`text-[10px] ${T.tag} px-2.5 py-1 rounded-full`}>{s}</span>
                  ))}
                </div>

                <div className="bg-[#FF5C0A] rounded-2xl p-5 mb-3">
                  <div className="text-white/60 text-[10px] uppercase tracking-widest font-semibold mb-1">A caminho · ETA</div>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-white text-5xl font-bold leading-none transition-all duration-700">{eta}</span>
                    <span className="text-white/60 text-lg">min</span>
                  </div>
                  <p className="text-white/70 text-xs mt-2">João Silva está a caminho</p>
                  <div className="mt-3 h-1 bg-white/20 rounded-full overflow-hidden">
                    <div className="h-full bg-white rounded-full transition-all duration-[2800ms] ease-linear"
                      style={{ width: `${((12 - eta) / 12) * 100}%` }} />
                  </div>
                </div>

                <div className={`flex items-center justify-between ${T.inner} rounded-2xl p-3.5`}>
                  <div>
                    <div className={`${T.muted} text-[10px] uppercase tracking-wider`}>Escrow protegido</div>
                    <div className={`${T.h} text-base font-bold mt-0.5`}>R$ 340,00</div>
                  </div>
                  <span className="text-[#16C784] text-xs font-semibold bg-[#16C784]/10 px-3 py-1.5 rounded-full">🔒 Seguro</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── SKILLS MARQUEE ── */}
      <div className={`border-y ${T.divider} overflow-hidden py-3`}>
        <div style={{ animation: 'marquee 28s linear infinite', display: 'flex', width: 'max-content' }}>
          {[...Array(3)].flatMap((_, i) =>
            SKILLS.map(s => (
              <span key={`${s}-${i}`} className={`flex items-center gap-4 px-5 ${T.dim} text-[11px] font-medium uppercase tracking-[0.2em] whitespace-nowrap`}>
                <span className="h-1 w-1 rounded-full bg-[#FF5C0A]/40 shrink-0" />
                {s}
              </span>
            ))
          )}
        </div>
      </div>

      {/* ── DORES DA OFICINA ── */}
      <section className="max-w-6xl mx-auto px-6 lg:px-10 py-24">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Pain points */}
          <div>
            <p className="text-[#FF5C0A] text-xs font-semibold uppercase tracking-widest mb-3">Sua oficina sente isso?</p>
            <h2 className={`text-3xl lg:text-4xl font-bold tracking-tight ${T.h} mb-8`}>
              Todo dia a mesma<br />dor de cabeça.
            </h2>
            <div className="space-y-3">
              {[
                'Mecânico faltou sem avisar e o carro do cliente ficou parado',
                'Não sabe se o profissional é realmente qualificado',
                'Pagou adiantado e foi lesado — sem garantia nenhuma',
                'Alta demanda, pouca mão de obra disponível',
                'Carro parado = cliente insatisfeito = receita no ralo',
              ].map(p => (
                <div key={p} className={`flex gap-3 items-start ${T.pain} rounded-xl px-4 py-3`}>
                  <span className={`${T.painX} font-bold text-lg leading-none mt-0.5 shrink-0`}>✕</span>
                  <span className={`${T.sub} text-sm leading-snug`}>{p}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Solution */}
          <div>
            <p className="text-[#FF5C0A] text-xs font-semibold uppercase tracking-widest mb-3">Com o MecânicoApp</p>
            <h2 className={`text-3xl lg:text-4xl font-bold tracking-tight ${T.h} mb-8`}>
              Profissional certo,<br />na hora certa.
            </h2>
            <div className="space-y-3">
              {[
                ['Perfil 100% verificado', 'CPF, especialidade e avaliações reais antes de contratar'],
                ['Pagamento protegido', 'Oficina paga via PIX, mas o mecânico só recebe após sua aprovação'],
                ['Tracking ao vivo', 'Veja o mecânico chegando no mapa — ETA em tempo real'],
                ['Disponível imediatamente', 'Mecânicos parceiros prontos para atender na sua região'],
                ['Para sua oficina: sempre gratuito', 'Sem mensalidade, sem taxa, sem surpresa'],
              ].map(([t, d]) => (
                <div key={t} className={`flex gap-3 items-start ${T.benefit} rounded-xl px-4 py-3`}>
                  <span className={`${T.benefitV} font-bold text-lg leading-none mt-0.5 shrink-0`}>✓</span>
                  <div>
                    <div className={`${T.h} text-sm font-semibold`}>{t}</div>
                    <div className={`${T.muted} text-xs mt-0.5`}>{d}</div>
                  </div>
                </div>
              ))}
            </div>
            <Link to="/cadastro/oficina"
              className="mt-6 inline-flex bg-[#FF5C0A] hover:bg-[#e85200] text-white font-semibold px-7 py-3 rounded-full transition-colors text-sm">
              Quero resolver isso agora →
            </Link>
          </div>
        </div>
      </section>

      {/* ── BENEFÍCIOS DO MECÂNICO ── */}
      <section className={`border-y ${T.divider}`}>
        <div className="max-w-6xl mx-auto px-6 lg:px-10 py-24">
          <div className="grid lg:grid-cols-2 gap-12 items-center">

            {/* Benefits */}
            <div className="order-2 lg:order-1">
              <div className="grid sm:grid-cols-2 gap-3">
                {[
                  ['💼', 'Custo zero', 'Sem investimento inicial. Sem pagar nada pra começar. Só o seu conhecimento já é suficiente.'],
                  ['🚗', 'Sem precisar de carro', 'As ferramentas e o espaço já são da oficina. Você vai lá, trabalha e vai embora.'],
                  ['⏰', 'Seu horário', 'Aceite os jobs que quiser, quando quiser. Você define sua disponibilidade.'],
                  ['👑', 'Sem patrão', 'Ninguém manda em você. Você escolhe as oficinas, recusa o que não quiser.'],
                  ['📍', 'Jobs perto de você', 'Defina seu raio de atendimento e receba apenas ofertas na sua área.'],
                  ['💰', 'Receba via PIX', 'Pagamento garantido pela plataforma. Sem atraso, sem calote.'],
                ].map(([icon, title, desc]) => (
                  <div key={title as string} className={`${T.card} rounded-2xl p-5 ${T.cardHover} transition-colors`}>
                    <div className="text-2xl mb-2">{icon as string}</div>
                    <div className={`${T.h} text-sm font-semibold mb-1`}>{title as string}</div>
                    <div className={`${T.muted} text-xs leading-relaxed`}>{desc as string}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Text */}
            <div className="order-1 lg:order-2">
              <p className="text-[#FF5C0A] text-xs font-semibold uppercase tracking-widest mb-3">Para mecânicos</p>
              <h2 className={`text-3xl lg:text-4xl font-bold tracking-tight ${T.h} mb-5`}>
                Você já tem tudo<br />que precisa pra<br />
                <span className="text-[#FF5C0A]">ganhar mais.</span>
              </h2>
              <p className={`${T.sub} text-lg leading-relaxed mb-6`}>
                Sua habilidade é o seu negócio. Não precisa de carro, não precisa de ferramentas caras, não precisa de ponto fixo.
                Basta se cadastrar — gratuitamente — e começar a receber jobs de oficinas verificadas.
              </p>
              <div className={`${T.card} rounded-2xl p-5 mb-6 border-l-4 border-[#FF5C0A]`}>
                <p className={`${T.h} text-sm font-semibold`}>Cadastro 100% gratuito.</p>
                <p className={`${T.muted} text-xs mt-1`}>
                  Leva menos de 3 minutos. Depois de cadastrado, você conhece todos os detalhes de como funciona seu ganho.
                </p>
              </div>
              <Link to="/cadastro/mecanico"
                className="inline-flex bg-[#FF5C0A] hover:bg-[#e85200] text-white font-semibold px-7 py-3 rounded-full transition-colors text-sm">
                Quero me cadastrar — é grátis →
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── COMO FUNCIONA ── */}
      <section className="max-w-6xl mx-auto px-6 lg:px-10 py-24">
        <div className="text-center mb-14">
          <p className="text-[#FF5C0A] text-xs font-semibold uppercase tracking-widest mb-3">Como funciona</p>
          <h2 className={`text-3xl lg:text-4xl font-bold tracking-tight ${T.h}`}>Simples do começo ao fim.</h2>
        </div>
        <div className="grid md:grid-cols-2 gap-5">
          <StepsCard dark={dark} T={T} title="Para a Oficina" accent steps={[
            ['Cadastre a oficina grátis', 'Validamos seu CNPJ. Nenhum custo agora, nem depois.'],
            ['Encontre o mecânico ideal', 'Filtre por especialidade, avaliação e distância. Veja o perfil completo antes de contratar.'],
            ['Acompanhe e aprove', 'Veja o mecânico chegando em tempo real. Libere o pagamento só quando o serviço estiver pronto.'],
          ]} />
          <StepsCard dark={dark} T={T} title="Para o Mecânico" accent={false} steps={[
            ['Crie seu perfil grátis', 'Informe suas especialidades, valor por hora e disponibilidade. Leva 3 minutos.'],
            ['Receba e aceite jobs', 'Ofertas chegam no seu celular. Você decide o que aceitar — sem compromisso.'],
            ['Vá, trabalhe, receba', 'As ferramentas já estão lá. Você só precisa do seu talento. Receba via PIX rapidinho.'],
          ]} />
        </div>
      </section>

      {/* ── DIFERENCIAIS ── */}
      <section className="max-w-6xl mx-auto px-6 lg:px-10 pb-24">
        <div className="text-center mb-14">
          <p className="text-[#FF5C0A] text-xs font-semibold uppercase tracking-widest mb-3">Por que MecânicoApp</p>
          <h2 className={`text-3xl lg:text-4xl font-bold tracking-tight ${T.h}`}>Construído pra realidade<br />da oficina brasileira.</h2>
          <p className={`mt-3 ${T.muted} max-w-lg mx-auto`}>Não é cópia de modelo gringo. Nascemos aqui, sabemos os problemas daqui.</p>
        </div>
        <div className="grid md:grid-cols-3 gap-4">
          {[
            ['🛡️', 'Pagamento protegido', 'A oficina paga, a plataforma segura — mecânico recebe apenas após a aprovação do serviço. Sem calote dos dois lados.'],
            ['📍', 'Tracking ao vivo', "Veja o mecânico se aproximando no mapa com ETA dinâmico. Sem mais 'tô chegando' e nunca aparecer."],
            ['✅', 'Profissionais verificados', 'CNPJ da oficina, CPF do mecânico, avaliações reais de outros serviços. Zero de desconhecido.'],
            ['🆓', 'Gratuito para oficinas', 'A oficina nunca paga nada pra usar a plataforma. Nenhuma mensalidade, nenhuma taxa de adesão.'],
            ['⚡', 'PIX garantido', 'Pagamento liberado para o mecânico rapidamente após confirmação do serviço. Seguro e rastreável.'],
            ['🇧🇷', 'Feito no Brasil', 'Pensado para a realidade da oficina e do mecânico brasileiro. Suporte em português, do jeito certo.'],
          ].map(([icon, title, desc]) => (
            <DiffCard key={title as string} T={T} icon={icon as string} title={title as string} desc={desc as string} />
          ))}
        </div>
      </section>

      {/* ── CTA DUPLO ── */}
      <section className="max-w-6xl mx-auto px-6 lg:px-10 pb-24 grid md:grid-cols-2 gap-5">

        {/* Workshop CTA */}
        <div className={`relative ${T.cta} rounded-3xl p-8 lg:p-10 overflow-hidden`}>
          <div className="absolute -top-10 -right-10 w-48 h-48 bg-[#FF5C0A]/10 blur-[80px] rounded-full pointer-events-none" />
          <div className="relative">
            <div className="text-3xl mb-3">🏭</div>
            <h3 className="text-2xl font-bold text-white mb-2">Sua oficina parada<br />custa caro.</h3>
            <p className="text-zinc-400 text-sm mb-6">Cada hora sem mecânico é um cliente perdido. Cadastre-se em 2 minutos. Sem cartão, sem fidelidade.</p>
            <Link to="/cadastro/oficina"
              className="inline-flex bg-[#FF5C0A] hover:bg-[#e85200] text-white font-semibold px-6 py-3 rounded-full transition-colors text-sm">
              Cadastrar minha oficina →
            </Link>
          </div>
        </div>

        {/* Mechanic CTA */}
        <div className={`relative ${T.cta} rounded-3xl p-8 lg:p-10 overflow-hidden`}>
          <div className="absolute -top-10 -left-10 w-48 h-48 bg-[#FF5C0A]/8 blur-[80px] rounded-full pointer-events-none" />
          <div className="relative">
            <div className="text-3xl mb-3">🔧</div>
            <h3 className="text-2xl font-bold text-white mb-2">Seu próximo job<br />está te esperando.</h3>
            <p className="text-zinc-400 text-sm mb-6">Cadastro gratuito. Sem investimento. Sem patrão. Você começa a trabalhar hoje mesmo.</p>
            <Link to="/cadastro/mecanico"
              className="inline-flex bg-white/10 hover:bg-white/20 text-white font-semibold px-6 py-3 rounded-full transition-colors text-sm border border-white/20">
              Quero me cadastrar — grátis →
            </Link>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className={`border-t ${T.footer}`}>
        <div className="max-w-6xl mx-auto px-6 lg:px-10 py-8 flex flex-wrap gap-4 justify-between items-center">
          <Logo />
          <p className={`${T.dim} text-sm`}>© {new Date().getFullYear()} MecânicoApp · Marketplace B2B brasileiro</p>
        </div>
      </footer>

      <style>{`
        @keyframes fadeUp   { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes marquee  { from { transform: translateX(0); } to { transform: translateX(-33.333%); } }
        @keyframes floatCard{ 0%,100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
      `}</style>
    </div>
  );
}

/* ── Sub-components ── */
function Stat({ n, l, dark }: { n: string; l: string; dark: boolean }) {
  return (
    <div>
      <div className={`${dark ? 'text-white' : 'text-zinc-900'} font-bold text-xl tracking-tight`}>{n}</div>
      <div className={`${dark ? 'text-zinc-600' : 'text-zinc-400'} text-xs mt-0.5`}>{l}</div>
    </div>
  );
}

function StepsCard({ title, steps, accent, dark, T }: {
  title: string; steps: [string, string][]; accent: boolean; dark: boolean; T: Record<string, string>
}) {
  return (
    <div className={`${T.card} rounded-2xl p-7`}>
      <h3 className={`text-base font-semibold ${T.h} mb-6`}>{title}</h3>
      <ol className="space-y-5">
        {steps.map(([t, d], i) => (
          <li key={t} className="flex gap-4 items-start">
            <span className={`shrink-0 h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold mt-0.5 ${
              accent ? 'bg-[#FF5C0A]/15 text-[#FF5C0A]' : dark ? 'bg-white/6 text-zinc-400' : 'bg-zinc-100 text-zinc-500'
            }`}>{i + 1}</span>
            <div>
              <div className={`${T.h} text-sm font-medium`}>{t}</div>
              <div className={`${T.muted} text-sm mt-0.5`}>{d}</div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function DiffCard({ icon, title, desc, T }: { icon: string; title: string; desc: string; T: Record<string, string> }) {
  return (
    <div className={`${T.card} ${T.cardHover} rounded-2xl p-6 transition-colors group`}>
      <div className="text-2xl mb-3">{icon}</div>
      <div className={`${T.h} text-sm font-semibold mb-1.5 group-hover:text-[#FF5C0A] transition-colors`}>{title}</div>
      <div className={`${T.muted} text-sm leading-relaxed`}>{desc}</div>
    </div>
  );
}
