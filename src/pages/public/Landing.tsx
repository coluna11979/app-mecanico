import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Logo } from '@/components/Logo';

type Persona = 'mechanic' | 'workshop';

const SKILLS = ['Motor', 'Suspensão', 'Freios', 'Elétrica', 'Injeção eletrônica', 'Câmbio automático', 'Ar-condicionado', 'Diagnóstico OBD', 'Motor diesel', 'Funilaria', 'Alinhamento', 'Balanceamento'];

export default function Landing() {
  const [persona, setPersona] = useState<Persona>('mechanic');
  const [scrolled, setScrolled] = useState(false);
  const [eta, setEta] = useState(12);

  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', h, { passive: true });
    return () => window.removeEventListener('scroll', h);
  }, []);

  useEffect(() => {
    const t = setInterval(() => setEta(e => (e <= 1 ? 12 : e - 1)), 2800);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="min-h-screen bg-[#09090B] text-white">

      {/* NAV */}
      <header className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${scrolled ? 'bg-[#09090B]/90 backdrop-blur-2xl border-b border-white/[0.06]' : ''}`}>
        <div className="max-w-6xl mx-auto px-6 lg:px-10 flex h-16 items-center justify-between">
          <Logo />
          <nav className="flex items-center gap-6">
            <Link to="/login" className="text-zinc-400 hover:text-white text-sm transition-colors">Entrar</Link>
            <Link to="/cadastro/oficina" className="bg-[#FF5C0A] hover:bg-[#e85200] text-white text-sm font-semibold px-5 py-2 rounded-full transition-colors">
              Cadastrar oficina
            </Link>
          </nav>
        </div>
      </header>

      {/* ── HERO ── */}
      <section className="relative min-h-screen flex items-center overflow-hidden">

        {/* Soft background glow */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-[#FF5C0A]/5 blur-[140px] rounded-full" />
          <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-[#FF5C0A]/4 blur-[120px] rounded-full" />
        </div>

        <div className="relative w-full max-w-6xl mx-auto px-6 lg:px-10 pt-24 pb-20">
          <div className="grid lg:grid-cols-2 gap-16 items-center">

            {/* Left */}
            <div style={{ animation: 'fadeUp 0.8s cubic-bezier(0.16,1,0.3,1) both' }}>

              {/* Persona pill */}
              <div className="inline-flex p-1 bg-white/[0.06] rounded-full mb-10">
                {(['mechanic', 'workshop'] as Persona[]).map(p => (
                  <button key={p} onClick={() => setPersona(p)}
                    className={`px-5 py-1.5 rounded-full text-sm font-medium transition-all duration-300 ${
                      persona === p
                        ? 'bg-white text-zinc-900'
                        : 'text-zinc-500 hover:text-zinc-300'
                    }`}>
                    {p === 'mechanic' ? 'Sou Mecânico' : 'Sou Oficina'}
                  </button>
                ))}
              </div>

              {/* Headline */}
              {persona === 'mechanic' ? (
                <div key="mech" style={{ animation: 'fadeUp 0.5s cubic-bezier(0.16,1,0.3,1) both' }}>
                  <h1 className="text-[2.8rem] lg:text-[3.6rem] font-bold leading-[1.1] tracking-[-0.02em] text-white">
                    Seu talento merece<br />
                    <span className="text-[#FF5C0A]">oportunidade.</span>
                  </h1>
                  <p className="mt-5 text-zinc-400 text-lg leading-relaxed max-w-md">
                    Receba serviços de oficinas verificadas com pagamento garantido.
                    Você fica com <span className="text-zinc-200 font-medium">85% do valor</span>, via PIX em até 24h.
                  </p>
                  <div className="mt-8 flex items-center gap-4">
                    <Link to="/cadastro/mecanico" className="bg-[#FF5C0A] hover:bg-[#e85200] text-white font-semibold px-7 py-3 rounded-full transition-colors text-sm">
                      Quero ser parceiro
                    </Link>
                    <Link to="/login" className="text-zinc-400 hover:text-white text-sm transition-colors flex items-center gap-1.5">
                      Já sou cadastrado <span className="opacity-50">→</span>
                    </Link>
                  </div>
                </div>
              ) : (
                <div key="shop" style={{ animation: 'fadeUp 0.5s cubic-bezier(0.16,1,0.3,1) both' }}>
                  <h1 className="text-[2.8rem] lg:text-[3.6rem] font-bold leading-[1.1] tracking-[-0.02em] text-white">
                    Mecânicos qualificados,<br />
                    <span className="text-[#FF5C0A]">na hora certa.</span>
                  </h1>
                  <p className="mt-5 text-zinc-400 text-lg leading-relaxed max-w-md">
                    Encontre profissionais verificados, acompanhe em tempo real e pague com segurança.
                    <span className="text-zinc-200 font-medium"> Para oficinas, sempre gratuito.</span>
                  </p>
                  <div className="mt-8 flex items-center gap-4">
                    <Link to="/cadastro/oficina" className="bg-[#FF5C0A] hover:bg-[#e85200] text-white font-semibold px-7 py-3 rounded-full transition-colors text-sm">
                      Cadastrar minha oficina
                    </Link>
                    <Link to="/login" className="text-zinc-400 hover:text-white text-sm transition-colors flex items-center gap-1.5">
                      Já sou cadastrado <span className="opacity-50">→</span>
                    </Link>
                  </div>
                </div>
              )}

              {/* Stats */}
              <div className="mt-12 flex items-center gap-8">
                <Stat n="85%" l="Repasse ao mecânico" />
                <div className="w-px h-8 bg-white/10" />
                <Stat n="< 24h" l="Liberação PIX" />
                <div className="w-px h-8 bg-white/10" />
                <Stat n="Grátis" l="Para oficinas" />
              </div>
            </div>

            {/* Right — App mockup */}
            <div style={{ animation: 'fadeUp 0.8s cubic-bezier(0.16,1,0.3,1) 0.12s both' }} className="relative">

              {/* Floating pill — online count */}
              <div style={{ animation: 'floatCard 5s ease-in-out infinite' }}
                className="absolute -top-4 -left-2 z-10 flex items-center gap-2.5 bg-[#18181B] rounded-2xl px-4 py-2.5 shadow-2xl">
                <span className="h-2 w-2 rounded-full bg-[#16C784] animate-pulse-soft" />
                <div>
                  <div className="text-white text-sm font-semibold leading-none">142</div>
                  <div className="text-zinc-500 text-[10px] mt-0.5">online agora</div>
                </div>
              </div>

              {/* Main card */}
              <div className="bg-[#18181B] rounded-3xl p-5 shadow-2xl">

                {/* Header */}
                <div className="flex items-center justify-between mb-4">
                  <span className="text-zinc-400 text-xs font-medium">Mechanic Live</span>
                  <span className="flex items-center gap-1.5 text-[#16C784] text-xs font-semibold">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#16C784] animate-pulse" />
                    Ao vivo
                  </span>
                </div>

                {/* Mechanic row */}
                <div className="flex items-center gap-3 bg-[#09090B] rounded-2xl p-3.5 mb-3">
                  <div className="relative shrink-0">
                    <div className="h-11 w-11 rounded-full bg-[#FF5C0A] flex items-center justify-center text-white font-bold text-base">
                      JS
                    </div>
                    <div className="absolute -inset-1.5 rounded-full border border-[#FF5C0A]/30 animate-ping" style={{ animationDuration: '2.5s' }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-white text-sm font-semibold">João Silva</div>
                    <div className="text-zinc-500 text-xs mt-0.5">★ 4.9 · 248 jobs · R$ 120/h</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-zinc-500 text-[10px]">distância</div>
                    <div className="text-white text-sm font-bold">8 km</div>
                  </div>
                </div>

                {/* Skills */}
                <div className="flex gap-1.5 mb-4">
                  {['Motor', 'Freios', 'Elétrica'].map(s => (
                    <span key={s} className="text-[10px] text-zinc-500 bg-white/[0.04] px-2.5 py-1 rounded-full">{s}</span>
                  ))}
                </div>

                {/* ETA */}
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

                {/* Payment */}
                <div className="flex items-center justify-between bg-[#09090B] rounded-2xl p-3.5">
                  <div>
                    <div className="text-zinc-500 text-[10px] uppercase tracking-wider">Escrow protegido</div>
                    <div className="text-white text-base font-bold mt-0.5">R$ 340,00</div>
                  </div>
                  <span className="text-[#16C784] text-xs font-semibold bg-[#16C784]/10 px-3 py-1.5 rounded-full">🔒 Seguro</span>
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ── MARQUEE ── */}
      <div className="border-y border-white/[0.05] overflow-hidden py-3 bg-white/[0.01]">
        <div style={{ animation: 'marquee 28s linear infinite', display: 'flex', width: 'max-content' }}>
          {[...Array(3)].flatMap((_, i) =>
            SKILLS.map(s => (
              <span key={`${s}-${i}`} className="flex items-center gap-4 px-5 text-zinc-600 text-[11px] font-medium uppercase tracking-[0.2em] whitespace-nowrap">
                <span className="h-1 w-1 rounded-full bg-[#FF5C0A]/40 shrink-0" />
                {s}
              </span>
            ))
          )}
        </div>
      </div>

      {/* ── COMO FUNCIONA ── */}
      <section className="max-w-6xl mx-auto px-6 lg:px-10 py-24">
        <div className="text-center mb-14">
          <p className="text-[#FF5C0A] text-xs font-semibold uppercase tracking-widest mb-3">Como funciona</p>
          <h2 className="text-3xl lg:text-4xl font-bold tracking-tight">Três passos. Zero burocracia.</h2>
        </div>
        <div className="grid md:grid-cols-2 gap-5">
          <StepsCard title="Para Oficinas" accent steps={[
            ['Cadastre a oficina', 'Validamos seu CNPJ. Sempre gratuito.'],
            ['Encontre o mecânico', 'Filtre por especialidade, avaliação e distância.'],
            ['Acompanhe ao vivo', 'Veja o mecânico chegando em tempo real e libere o pagamento.'],
          ]} />
          <StepsCard title="Para Mecânicos" accent={false} steps={[
            ['Crie seu perfil', 'CPF, especialidades, valor por hora — leva 3 minutos.'],
            ['Aceite jobs próximos', 'Receba pedidos de oficinas verificadas no seu raio.'],
            ['Receba via PIX', 'Pagamento garantido em até 24h após o serviço aprovado.'],
          ]} />
        </div>
      </section>

      {/* ── DIFERENCIAIS ── */}
      <section className="max-w-6xl mx-auto px-6 lg:px-10 pb-24">
        <div className="text-center mb-14">
          <p className="text-[#FF5C0A] text-xs font-semibold uppercase tracking-widest mb-3">Por que MecânicoApp</p>
          <h2 className="text-3xl lg:text-4xl font-bold tracking-tight">B2B verificado, não bagunça.</h2>
          <p className="mt-3 text-zinc-500 max-w-lg mx-auto">Nascemos para resolver o problema real das oficinas brasileiras: encontrar mão-de-obra qualificada com confiança.</p>
        </div>
        <div className="grid md:grid-cols-3 gap-4">
          {[
            ['🛡️', 'Escrow nativo', 'Oficina paga, plataforma segura, mecânico recebe só após aprovação. Zero calote.'],
            ['📍', 'Tracking ao vivo', "Veja o mecânico se aproximando no mapa com ETA dinâmico. Sem mais 'tô chegando'."],
            ['✅', '100% verificado', 'CNPJ da oficina, CPF do mecânico, especialidades validadas. Profissionais de verdade.'],
            ['💰', 'Sem mensalidade', 'Oficina nunca paga nada. Mecânico paga 15% apenas quando o job é concluído.'],
            ['⚡', 'PIX em 24h', 'Pagamento liberado para o mecânico em até 24 horas após confirmação do serviço.'],
            ['🇧🇷', 'Feito no Brasil', 'Construído para a realidade da oficina brasileira, não copiado de gringo.'],
          ].map(([icon, title, desc]) => (
            <DiffCard key={title as string} icon={icon as string} title={title as string} desc={desc as string} />
          ))}
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="max-w-6xl mx-auto px-6 lg:px-10 pb-24">
        <div className="relative bg-[#18181B] rounded-3xl p-10 lg:p-14 overflow-hidden">
          <div className="absolute -top-20 -right-10 w-80 h-80 bg-[#FF5C0A]/10 blur-[100px] rounded-full pointer-events-none" />
          <div className="relative grid lg:grid-cols-2 gap-8 items-center">
            <div>
              <h2 className="text-3xl lg:text-4xl font-bold tracking-tight">Sua oficina parada custa caro.</h2>
              <p className="mt-3 text-zinc-400">Cadastre-se em 2 minutos. Sem cartão, sem fidelidade.</p>
            </div>
            <div className="flex flex-wrap gap-3 lg:justify-end">
              <Link to="/cadastro/oficina" className="bg-[#FF5C0A] hover:bg-[#e85200] text-white font-semibold px-7 py-3 rounded-full transition-colors text-sm">
                Cadastrar oficina
              </Link>
              <Link to="/cadastro/mecanico" className="bg-white/[0.07] hover:bg-white/[0.1] text-white font-semibold px-7 py-3 rounded-full transition-colors text-sm">
                Sou mecânico
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="border-t border-white/[0.06]">
        <div className="max-w-6xl mx-auto px-6 lg:px-10 py-8 flex flex-wrap gap-4 justify-between items-center">
          <Logo />
          <p className="text-zinc-600 text-sm">© {new Date().getFullYear()} MecânicoApp · Marketplace B2B brasileiro</p>
        </div>
      </footer>
    </div>
  );
}

function Stat({ n, l }: { n: string; l: string }) {
  return (
    <div>
      <div className="text-white font-bold text-xl tracking-tight">{n}</div>
      <div className="text-zinc-600 text-xs mt-0.5">{l}</div>
    </div>
  );
}

function StepsCard({ title, steps, accent }: { title: string; steps: [string, string][]; accent: boolean }) {
  return (
    <div className="bg-[#18181B] rounded-2xl p-7">
      <h3 className="text-base font-semibold text-white mb-6">{title}</h3>
      <ol className="space-y-5">
        {steps.map(([t, d], i) => (
          <li key={t} className="flex gap-4 items-start">
            <span className={`shrink-0 h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold mt-0.5 ${
              accent ? 'bg-[#FF5C0A]/15 text-[#FF5C0A]' : 'bg-white/6 text-zinc-400'
            }`}>{i + 1}</span>
            <div>
              <div className="text-white text-sm font-medium">{t}</div>
              <div className="text-zinc-500 text-sm mt-0.5">{d}</div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function DiffCard({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div className="bg-[#18181B] hover:bg-[#1F1F23] rounded-2xl p-6 transition-colors group">
      <div className="text-2xl mb-3">{icon}</div>
      <div className="text-white text-sm font-semibold mb-1.5 group-hover:text-[#FF5C0A] transition-colors">{title}</div>
      <div className="text-zinc-500 text-sm leading-relaxed">{desc}</div>
    </div>
  );
}
