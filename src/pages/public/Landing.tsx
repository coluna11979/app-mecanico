import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Logo } from '@/components/Logo';

type Persona = 'mechanic' | 'workshop';

const FONT_DISPLAY = "'Barlow Condensed', 'Space Grotesk', sans-serif";
const SKILLS = ['Motor', 'Suspensão', 'Freios', 'Elétrica', 'Injeção eletrônica', 'Câmbio automático', 'Ar-condicionado', 'Diagnóstico OBD', 'Motor diesel', 'Funilaria', 'Alinhamento', 'Balanceamento'];

export default function Landing() {
  const [persona, setPersona] = useState<Persona>('mechanic');
  const [scrolled, setScrolled] = useState(false);
  const [eta, setEta] = useState(12);
  const [online] = useState(142);

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
    <div className="min-h-screen bg-[#080C10] text-white overflow-x-hidden">

      {/* NAV */}
      <header
        style={{ transition: 'all 0.3s ease' }}
        className={`fixed top-0 left-0 right-0 z-50 ${scrolled ? 'bg-[#080C10]/95 backdrop-blur-xl border-b border-white/5' : 'bg-transparent'}`}
      >
        <div className="max-w-7xl mx-auto px-5 lg:px-10 flex h-16 items-center justify-between">
          <Logo />
          <nav className="flex items-center gap-3">
            <Link to="/login" className="text-white/50 hover:text-white text-sm font-medium transition-colors">Entrar</Link>
            <Link to="/cadastro/oficina" className="bg-brand-500 hover:bg-brand-600 active:scale-[.98] text-white text-sm font-bold px-5 py-2.5 rounded-xl transition-all shadow-brand">
              Cadastrar oficina
            </Link>
          </nav>
        </div>
      </header>

      {/* ══════════════ HERO ══════════════ */}
      <section className="relative min-h-screen flex items-center">

        {/* Background atmosphere */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div style={{
            backgroundImage: 'linear-gradient(rgba(255,92,10,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,92,10,0.04) 1px, transparent 1px)',
            backgroundSize: '64px 64px',
          }} className="absolute inset-0" />
          <div style={{ animation: 'glowPulse 6s ease-in-out infinite' }}
            className="absolute -bottom-32 -left-32 w-[700px] h-[700px] rounded-full bg-brand-500/10 blur-[140px]" />
          <div style={{ animation: 'glowPulse 8s ease-in-out infinite 2s' }}
            className="absolute top-0 right-1/4 w-[500px] h-[500px] rounded-full bg-brand-500/6 blur-[120px]" />
        </div>

        <div className="relative w-full max-w-7xl mx-auto px-5 lg:px-10 pt-24 pb-16">
          <div className="grid lg:grid-cols-[1fr_480px] gap-14 xl:gap-20 items-center">

            {/* ── LEFT: copy ── */}
            <div style={{ animation: 'fadeUp 0.7s cubic-bezier(0.16,1,0.3,1) both' }}>

              {/* Persona toggle */}
              <div className="inline-flex p-1 rounded-2xl bg-white/5 border border-white/8 mb-8">
                {(['mechanic', 'workshop'] as Persona[]).map(p => (
                  <button
                    key={p}
                    onClick={() => setPersona(p)}
                    style={{ transition: 'all 0.25s ease' }}
                    className={`px-5 py-2.5 rounded-xl text-sm font-bold tracking-wide ${
                      persona === p ? 'bg-brand-500 text-white shadow-brand' : 'text-white/35 hover:text-white/60'
                    }`}
                  >
                    {p === 'mechanic' ? 'Sou Mecânico' : 'Sou Oficina'}
                  </button>
                ))}
              </div>

              {/* Headline */}
              {persona === 'mechanic' ? (
                <h1
                  key="mech-title"
                  style={{ fontFamily: FONT_DISPLAY, lineHeight: 0.92, animation: 'fadeUp 0.5s cubic-bezier(0.16,1,0.3,1) both' }}
                  className="text-[clamp(3.8rem,9vw,7rem)] font-black uppercase tracking-tight"
                >
                  Seu talento<br />
                  merece<br />
                  <span className="text-brand-500">oportunidade.</span>
                </h1>
              ) : (
                <h1
                  key="shop-title"
                  style={{ fontFamily: FONT_DISPLAY, lineHeight: 0.92, animation: 'fadeUp 0.5s cubic-bezier(0.16,1,0.3,1) both' }}
                  className="text-[clamp(3.8rem,9vw,7rem)] font-black uppercase tracking-tight"
                >
                  Mecânicos<br />
                  qualificados,<br />
                  <span className="text-brand-500">agora.</span>
                </h1>
              )}

              {/* Description */}
              <p
                key={persona + '-desc'}
                style={{ animation: 'fadeUp 0.5s cubic-bezier(0.16,1,0.3,1) 0.1s both' }}
                className="mt-6 text-[1.05rem] text-white/45 max-w-md leading-relaxed"
              >
                {persona === 'mechanic'
                  ? <>Receba serviços de oficinas verificadas com pagamento garantido. Você fica com <strong className="text-white/70">85% do valor, sempre</strong>, via PIX em até 24h.</>
                  : <>Encontre profissionais verificados, acompanhe a chegada em tempo real e pague com segurança. <strong className="text-white/70">Para oficinas, 100% gratuito.</strong></>
                }
              </p>

              {/* CTAs */}
              <div
                style={{ animation: 'fadeUp 0.5s cubic-bezier(0.16,1,0.3,1) 0.2s both' }}
                className="mt-8 flex flex-wrap gap-3"
              >
                <Link
                  to={persona === 'mechanic' ? '/cadastro/mecanico' : '/cadastro/oficina'}
                  className="bg-brand-500 hover:bg-brand-600 active:scale-[.98] text-white font-bold px-8 py-4 rounded-2xl transition-all shadow-brand hover:shadow-[0_12px_32px_-8px_rgba(255,92,10,0.65)] text-base"
                >
                  {persona === 'mechanic' ? 'Quero ser parceiro →' : 'Cadastrar minha oficina →'}
                </Link>
                <Link
                  to="/login"
                  className="border border-white/12 hover:border-white/25 text-white/55 hover:text-white font-semibold px-8 py-4 rounded-2xl transition-all text-base"
                >
                  Já sou cadastrado
                </Link>
              </div>

              {/* Stats */}
              <div
                style={{ animation: 'fadeUp 0.5s cubic-bezier(0.16,1,0.3,1) 0.3s both' }}
                className="mt-12 flex items-center gap-8"
              >
                <StatNum n="85%" l="Repasse ao mecânico" accent />
                <div className="w-px h-10 bg-white/10" />
                <StatNum n="<24h" l="Liberação do PIX" />
                <div className="w-px h-10 bg-white/10" />
                <StatNum n="R$0" l="Para oficinas" />
              </div>
            </div>

            {/* ── RIGHT: mockup ── */}
            <div
              style={{ animation: 'fadeUp 0.7s cubic-bezier(0.16,1,0.3,1) 0.15s both' }}
              className="relative"
            >
              {/* Floating badge — online */}
              <div
                style={{ animation: 'floatCard 4s ease-in-out infinite', boxShadow: '0 20px 40px rgba(0,0,0,0.5)' }}
                className="absolute -top-5 -left-5 z-10 bg-[#0D1318] border border-white/10 rounded-2xl px-4 py-3"
              >
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-signal-500 animate-pulse-soft" />
                  <span className="text-signal-500 text-xs font-bold tracking-widest">ONLINE</span>
                </div>
                <div style={{ fontFamily: FONT_DISPLAY }}
                  className="text-white font-black text-3xl leading-none mt-0.5">{online}</div>
                <div className="text-white/35 text-[10px] uppercase tracking-wider">mecânicos agora</div>
              </div>

              {/* Main card */}
              <div
                style={{
                  animation: 'floatCard 6s ease-in-out infinite 1s',
                  background: 'linear-gradient(145deg, #131920, #0D1318)',
                  boxShadow: '0 40px 80px -20px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.05)',
                }}
                className="relative rounded-3xl overflow-hidden p-6"
              >
                {/* Map grid bg */}
                <div className="absolute inset-0 opacity-25" style={{
                  backgroundImage: 'linear-gradient(rgba(255,92,10,0.12) 1px, transparent 1px), linear-gradient(90deg, rgba(255,92,10,0.12) 1px, transparent 1px)',
                  backgroundSize: '28px 28px',
                }} />
                {/* Route simulation */}
                <div className="absolute top-1/3 left-1/2 w-[2px] h-28 bg-gradient-to-b from-brand-500/70 to-transparent rotate-[15deg] -translate-x-1/2 blur-[1px]" />

                {/* LIVE badge */}
                <div className="absolute top-4 right-4 flex items-center gap-1.5 bg-signal-500/10 border border-signal-500/25 rounded-full px-3 py-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-signal-500 animate-pulse" />
                  <span className="text-signal-500 text-[10px] font-black tracking-[0.15em]">AO VIVO</span>
                </div>

                <div className="relative flex flex-col gap-3 pt-2">

                  {/* Mechanic card */}
                  <div className="bg-white/6 backdrop-blur rounded-2xl p-4 border border-white/8">
                    <div className="flex items-center gap-3">
                      <div className="relative shrink-0">
                        <div style={{ fontFamily: FONT_DISPLAY }}
                          className="h-12 w-12 rounded-full bg-brand-500 grid place-items-center text-white font-black text-lg shadow-brand">
                          JS
                        </div>
                        <div className="absolute -inset-1.5 rounded-full border-2 border-brand-500/30 animate-ping" style={{ animationDuration: '2.5s' }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-white font-bold">João Silva</div>
                        <div className="text-white/40 text-xs mt-0.5">★ 4.9 · 248 jobs · R$ 120/h</div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-white/40 text-[10px] uppercase tracking-wider">Distância</div>
                        <div style={{ fontFamily: FONT_DISPLAY }} className="text-white font-black text-xl">8 km</div>
                      </div>
                    </div>
                    <div className="mt-3 flex gap-1.5 flex-wrap">
                      {['Motor', 'Freios', 'Elétrica'].map(s => (
                        <span key={s} className="text-[10px] font-semibold bg-white/5 border border-white/8 text-white/40 px-2.5 py-0.5 rounded-full">{s}</span>
                      ))}
                    </div>
                  </div>

                  {/* ETA card */}
                  <div
                    className="rounded-2xl p-5"
                    style={{ background: 'linear-gradient(135deg, #FF5C0A, #E64500)', boxShadow: '0 12px 40px -8px rgba(255,92,10,0.55)' }}
                  >
                    <div className="text-white/65 text-[10px] uppercase tracking-[0.2em] font-bold">A caminho · ETA</div>
                    <div className="flex items-end gap-1 mt-0.5">
                      <div style={{ fontFamily: FONT_DISPLAY, fontSize: '4.5rem', lineHeight: 1 }}
                        className="text-white font-black transition-all duration-700">{eta}</div>
                      <div className="text-white/60 text-xl font-semibold mb-2">min</div>
                    </div>
                    <div className="text-white/80 text-sm mt-1">Mecânico João Silva está chegando</div>
                    <div className="mt-3 bg-white/20 rounded-full h-1.5 overflow-hidden">
                      <div className="bg-white h-full rounded-full transition-all duration-[2800ms] ease-linear"
                        style={{ width: `${((12 - eta) / 12) * 100}%` }} />
                    </div>
                  </div>

                  {/* Escrow card */}
                  <div className="bg-white/4 border border-white/7 rounded-2xl p-4 flex items-center justify-between">
                    <div>
                      <div className="text-[10px] text-white/35 uppercase tracking-wider">Pagamento em escrow</div>
                      <div style={{ fontFamily: FONT_DISPLAY }} className="text-white font-black text-2xl mt-0.5">R$ 340,00</div>
                    </div>
                    <div className="text-right">
                      <div className="text-signal-500 text-xs font-bold">🔒 Protegido</div>
                      <div className="text-white/25 text-[10px] mt-0.5">Libera após aprovação</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════ MARQUEE ══════════════ */}
      <div className="border-y border-white/5 overflow-hidden py-3.5 bg-white/[0.02]">
        <div style={{ animation: 'marquee 24s linear infinite', display: 'flex', width: 'max-content' }}>
          {[...Array(3)].flatMap((_, i) =>
            SKILLS.map(s => (
              <span key={`${s}-${i}`} className="flex items-center gap-4 px-4 text-white/20 text-xs font-bold uppercase tracking-[0.2em] whitespace-nowrap">
                <span className="h-1 w-1 rounded-full bg-brand-500/50 shrink-0" />
                {s}
              </span>
            ))
          )}
        </div>
      </div>

      {/* ══════════════ COMO FUNCIONA ══════════════ */}
      <section className="relative border-b border-white/5">
        <div className="max-w-7xl mx-auto px-5 lg:px-10 py-24">
          <div className="text-center mb-16">
            <span className="inline-block text-brand-500 text-xs font-black uppercase tracking-[0.25em] border border-brand-500/30 bg-brand-500/8 px-4 py-1.5 rounded-full mb-4">
              Como funciona
            </span>
            <h2 style={{ fontFamily: FONT_DISPLAY }}
              className="text-[clamp(2.5rem,5vw,4rem)] font-black uppercase">
              Três passos. Zero burocracia.
            </h2>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <StepsCard
              title="Para Oficinas"
              accent
              steps={[
                ['Cadastre a oficina', 'Validamos seu CNPJ. Sempre gratuito.'],
                ['Encontre o mecânico', 'Filtre por especialidade, avaliação e distância.'],
                ['Acompanhe ao vivo', 'Veja o mecânico chegando em tempo real e libere o pagamento.'],
              ]}
            />
            <StepsCard
              title="Para Mecânicos"
              accent={false}
              steps={[
                ['Crie seu perfil', 'CPF, especialidades, valor por hora — leva 3 minutos.'],
                ['Aceite jobs próximos', 'Receba pedidos de oficinas verificadas no seu raio.'],
                ['Receba via PIX', 'Pagamento garantido em até 24h após o serviço aprovado.'],
              ]}
            />
          </div>
        </div>
      </section>

      {/* ══════════════ DIFERENCIAIS ══════════════ */}
      <section className="max-w-7xl mx-auto px-5 lg:px-10 py-24">
        <div className="text-center mb-16">
          <span className="inline-block text-brand-500 text-xs font-black uppercase tracking-[0.25em] border border-brand-500/30 bg-brand-500/8 px-4 py-1.5 rounded-full mb-4">
            Por que MecânicoApp
          </span>
          <h2 style={{ fontFamily: FONT_DISPLAY }}
            className="text-[clamp(2.5rem,5vw,4rem)] font-black uppercase">
            B2B verificado, não bagunça.
          </h2>
          <p className="mt-3 text-white/40 max-w-xl mx-auto text-base">
            Nascemos para resolver o problema real das oficinas brasileiras: encontrar mão-de-obra qualificada com confiança.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-4">
          {[
            ['🛡️', 'Escrow nativo', 'Oficina paga, plataforma segura, mecânico recebe só após aprovação. Zero calote.'],
            ['📍', 'Tracking ao vivo', "Veja o mecânico se aproximando no mapa, com ETA dinâmico. Sem mais 'tô chegando'."],
            ['✅', '100% verificado', 'CNPJ da oficina, CPF do mecânico, especialidades validadas. Profissionais de verdade.'],
            ['💰', 'Sem mensalidade', 'Oficina nunca paga nada. Mecânico só paga 15% quando o job é concluído.'],
            ['⚡', 'PIX em 24h', 'Pagamento liberado para o mecânico em até 24 horas após confirmação do serviço.'],
            ['🇧🇷', 'Feito no Brasil', 'Construído pensando na realidade da oficina brasileira, não copiado de gringo.'],
          ].map(([icon, title, desc]) => (
            <DiffCard key={title as string} icon={icon as string} title={title as string} desc={desc as string} />
          ))}
        </div>
      </section>

      {/* ══════════════ CTA FINAL ══════════════ */}
      <section className="max-w-7xl mx-auto px-5 lg:px-10 pb-24">
        <div
          className="relative rounded-3xl overflow-hidden p-12 lg:p-16"
          style={{ background: 'linear-gradient(135deg, #131920 0%, #0D1318 100%)', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          <div className="absolute -top-24 -right-16 w-96 h-96 rounded-full bg-brand-500/15 blur-[100px] pointer-events-none" />
          <div className="relative grid lg:grid-cols-2 gap-8 items-center">
            <div>
              <h2 style={{ fontFamily: FONT_DISPLAY }}
                className="text-[clamp(2.2rem,4.5vw,3.8rem)] font-black uppercase leading-[0.95]">
                Sua oficina<br />parada custa caro.
              </h2>
              <p className="mt-4 text-white/40 max-w-sm text-base">
                Cadastre-se em 2 minutos. Sem cartão. Sem fidelidade. Sem pegadinha.
              </p>
            </div>
            <div className="flex flex-wrap gap-3 lg:justify-end">
              <Link to="/cadastro/oficina"
                className="bg-brand-500 hover:bg-brand-600 active:scale-[.98] text-white font-bold px-8 py-4 rounded-2xl text-base transition-all shadow-brand hover:shadow-[0_12px_32px_-8px_rgba(255,92,10,0.65)]">
                Cadastrar oficina
              </Link>
              <Link to="/cadastro/mecanico"
                className="border border-white/15 hover:border-white/30 text-white/60 hover:text-white font-bold px-8 py-4 rounded-2xl text-base transition-all">
                Sou mecânico
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════ FOOTER ══════════════ */}
      <footer className="border-t border-white/5">
        <div className="max-w-7xl mx-auto px-5 lg:px-10 py-8 flex flex-wrap gap-4 justify-between items-center">
          <Logo />
          <div className="text-white/25 text-sm">© {new Date().getFullYear()} MecânicoApp · Marketplace B2B brasileiro</div>
        </div>
      </footer>
    </div>
  );
}

/* ─── Sub-components ─── */

function StatNum({ n, l, accent }: { n: string; l: string; accent?: boolean }) {
  return (
    <div>
      <div style={{ fontFamily: FONT_DISPLAY }}
        className={`text-[2.8rem] font-black leading-none ${accent ? 'text-brand-500' : 'text-white'}`}>
        {n}
      </div>
      <div className="text-[10px] text-white/35 uppercase tracking-[0.18em] mt-1">{l}</div>
    </div>
  );
}

function StepsCard({ title, steps, accent }: { title: string; steps: [string, string][]; accent: boolean }) {
  return (
    <div
      className="rounded-3xl p-8 border border-white/8"
      style={{ background: 'linear-gradient(145deg, #111820, #0D1318)' }}
    >
      <h3 style={{ fontFamily: FONT_DISPLAY }}
        className="text-2xl font-black uppercase mb-7 text-white">{title}</h3>
      <ol className="space-y-6">
        {steps.map(([t, d], i) => (
          <li key={t} className="flex gap-4">
            <span style={{ fontFamily: FONT_DISPLAY }}
              className={`shrink-0 h-9 w-9 rounded-full grid place-items-center font-black text-lg ${accent ? 'bg-brand-500 text-white shadow-brand' : 'bg-white/8 text-white/60 border border-white/10'}`}>
              {i + 1}
            </span>
            <div>
              <div className="font-bold text-white">{t}</div>
              <div className="text-white/35 text-sm mt-0.5">{d}</div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function DiffCard({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div
      className="rounded-2xl p-6 border border-white/6 hover:border-brand-500/30 transition-all duration-300 group cursor-default"
      style={{ background: 'linear-gradient(145deg, #111820, #0D1318)' }}
    >
      <div className="text-3xl mb-4">{icon}</div>
      <div style={{ fontFamily: FONT_DISPLAY }} className="font-black text-lg uppercase text-white group-hover:text-brand-500 transition-colors">{title}</div>
      <div className="mt-1.5 text-sm text-white/35 leading-relaxed">{desc}</div>
    </div>
  );
}
