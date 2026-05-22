import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Logo } from '@/components/Logo';
import { useAuth } from '@/contexts/AuthContext';
import { LeadCaptureModal, isLeadCaptured } from '@/components/LeadCaptureModal';

type Intent = 'mechanic' | 'workshop';

/**
 * Home institucional — segmenta visitante (mecânico ou oficina) com
 * cards visuais, mostra cada produto em destaque e termina com CTA dupla.
 * Inspirada na home da Uber (mecanismo de dual-path) mas alinhada ao
 * nosso brandbook (direto, provocativo, sem startup jargon).
 */
export default function Landing() {
  const [scrolled, setScrolled] = useState(false);
  const [gateIntent, setGateIntent] = useState<Intent | null>(null);
  const { user } = useAuth();
  const nav = useNavigate();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  /** Acessar /mecanico ou /oficina passando pelo gate (a menos que já capturado ou logado). */
  function go(intent: Intent) {
    const target = intent === 'mechanic' ? '/mecanico' : '/oficina';
    if (user || isLeadCaptured(intent)) {
      nav(target);
      return;
    }
    setGateIntent(intent);
  }

  return (
    <div className="min-h-screen bg-white text-steel-900 overflow-x-hidden">

      {/* ── NAV ── */}
      <header className={`fixed top-0 inset-x-0 z-50 transition-all ${
        scrolled ? 'bg-white/95 backdrop-blur-xl shadow-sm border-b border-steel-100' : 'bg-white/80 backdrop-blur-sm'
      }`}>
        <div className="max-w-6xl mx-auto px-5 lg:px-8 h-16 flex items-center justify-between">
          <Logo />
          <nav className="hidden md:flex items-center gap-7 text-sm font-semibold text-steel-700">
            <button type="button" onClick={() => go('mechanic')} className="hover:text-brand-600 transition">Mecânico</button>
            <button type="button" onClick={() => go('workshop')} className="hover:text-brand-600 transition">Oficina</button>
            <a href="#como-funciona" className="hover:text-brand-600 transition">Como funciona</a>
            <a href="#manifesto" className="hover:text-brand-600 transition">Manifesto</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link to="/login" state={{ fresh: true }} className="text-sm font-semibold text-steel-700 hover:text-steel-900 px-3 py-2 transition">
              Entrar
            </Link>
            <button
              type="button"
              onClick={() => go('mechanic')}
              className="hidden sm:inline-flex bg-brand-500 text-white text-sm font-bold rounded-xl px-4 py-2 hover:bg-brand-600 transition shadow-sm">
              Começar
            </button>
          </div>
        </div>
      </header>

      {/* ── HERO ── */}
      <section className="relative pt-28 pb-20 lg:pt-36 lg:pb-24 px-5 lg:px-8 overflow-hidden">
        {/* Glow soft */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[900px] h-[900px] rounded-full bg-brand-500/10 blur-3xl" />
        </div>

        <div className="relative max-w-6xl mx-auto">
          <div className="text-center max-w-3xl mx-auto">
            <div className="inline-flex items-center gap-2 bg-brand-50 border border-brand-100 rounded-full px-4 py-1.5 text-xs font-bold text-brand-700 tracking-widest uppercase">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-500 animate-pulse" />
              Plataforma de manutenção automotiva
            </div>

            <h1 className="mt-8 text-4xl sm:text-5xl lg:text-7xl font-bold tracking-tight leading-[1.02] text-steel-900">
              A ponte direta entre<br />
              <span className="text-brand-500">oficina e mecânico.</span>
            </h1>

            <p className="mt-6 text-lg lg:text-xl text-steel-600 leading-relaxed">
              Quem precisa de mão de obra encontra quem sabe fazer.
              Sem indicação, sem papel, sem fricção.
              <strong className="block mt-1 text-steel-900">Tempo real, rastreamento e pagamento garantido.</strong>
            </p>
          </div>

          {/* Cards de segmentação — cada persona tem visual próprio */}
          <div className="mt-14 grid md:grid-cols-2 gap-5 max-w-5xl mx-auto">
            <button
              type="button"
              onClick={() => go('mechanic')}
              className="group relative bg-steel-900 text-white rounded-3xl p-6 lg:p-8 overflow-hidden shadow-xl hover:shadow-2xl transition-all hover:-translate-y-1 hover:scale-[1.01] text-left w-full">
              {/* Mini cena — escondida no mobile pra não tampar a copy */}
              <div className="hidden sm:block absolute -right-6 -bottom-8 w-56 h-56 opacity-90 pointer-events-none">
                <MiniMechanic />
              </div>
              <div className="relative">
                <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur rounded-full px-3 py-1 text-[10px] font-bold tracking-widest uppercase text-brand-300">
                  🔧 Para Mecânicos
                </div>
                <h2 className="mt-4 text-2xl lg:text-3xl font-bold leading-tight">
                  Trabalhe pra você.<br />Receba como profissional.
                </h2>
                <p className="mt-3 text-sm text-steel-300 max-w-[260px]">
                  Aceite jobs de oficinas verificadas. Sem patrão, sem CLT, sem cliente que some.
                </p>
                <div className="mt-6 inline-flex items-center gap-2 text-brand-400 font-bold text-sm group-hover:gap-3 transition-all">
                  Sou mecânico <span className="text-lg">→</span>
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => go('workshop')}
              className="group relative bg-gradient-to-br from-brand-500 to-brand-600 text-white rounded-3xl p-6 lg:p-8 overflow-hidden shadow-xl shadow-brand-500/30 hover:shadow-2xl transition-all hover:-translate-y-1 hover:scale-[1.01] text-left w-full">
              <div className="hidden sm:block absolute -right-6 -bottom-8 w-56 h-56 opacity-90 pointer-events-none">
                <MiniWorkshop />
              </div>
              <div className="relative">
                <div className="inline-flex items-center gap-2 bg-white/15 backdrop-blur rounded-full px-3 py-1 text-[10px] font-bold tracking-widest uppercase">
                  🏪 Para Oficinas
                </div>
                <h2 className="mt-4 text-2xl lg:text-3xl font-bold leading-tight">
                  Mão de obra<br />sob demanda.
                </h2>
                <p className="mt-3 text-sm text-white/90 max-w-[260px]">
                  Publique a demanda. Mecânico qualificado aceita em minutos. Sem entrevista, sem CLT.
                </p>
                <div className="mt-6 inline-flex items-center gap-2 text-white font-bold text-sm group-hover:gap-3 transition-all">
                  Sou oficina <span className="text-lg">→</span>
                </div>
              </div>
            </button>
          </div>

          <p className="mt-8 text-center text-xs text-steel-500">
            Cadastro gratuito · Sem mensalidade · Aprovação em até 24h
          </p>
        </div>
      </section>

      {/* ── NÚMEROS / CREDIBILIDADE ── */}
      <section className="border-y border-steel-100 bg-steel-50/50 py-12 px-5 lg:px-8">
        <div className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
          <Stat n="24h" label="aprovação do cadastro" />
          <Stat n="PIX" label="repasse em até 24h" />
          <Stat n="100%" label="demandas pré-pagas (escrow)" />
          <Stat n="Tempo real" label="rastreamento e chat" />
        </div>
      </section>

      {/* ── SEÇÃO: MECÂNICO ── */}
      <section id="mecanico" className="py-20 lg:py-28 px-5 lg:px-8 scroll-mt-20">
        <div className="max-w-6xl mx-auto grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          <div className="order-2 lg:order-1">
            <div className="text-xs font-bold text-brand-600 uppercase tracking-widest">Para Mecânicos</div>
            <h2 className="mt-3 text-3xl lg:text-5xl font-bold tracking-tight leading-tight text-steel-900">
              Sua hora. Sua agenda.<br />
              <span className="text-brand-500">Seu dinheiro.</span>
            </h2>
            <p className="mt-5 text-lg text-steel-600 leading-relaxed">
              Aceite jobs de oficinas verificadas, defina o valor da sua hora,
              trabalhe quantas horas quiser. Receba via PIX em até 24h após a conclusão.
            </p>
            <ul className="mt-6 space-y-3 text-steel-700">
              <Bullet>Zero investimento — oficina dá ferramenta, peça e local</Bullet>
              <Bullet>Cliente já pagou antes do serviço começar (escrow)</Bullet>
              <Bullet>Sem CLT, sem patrão fixo, sem cliente que some</Bullet>
              <Bullet>Reputação digital pública — seu trabalho vira nota</Bullet>
            </ul>
            <button
              type="button"
              onClick={() => go('mechanic')}
              className="mt-8 inline-flex items-center gap-2 bg-steel-900 text-white font-bold rounded-2xl px-6 py-4 hover:bg-steel-800 transition shadow-lg shadow-steel-900/10">
              Quero ser mecânico <span>→</span>
            </button>
          </div>
          <div className="order-1 lg:order-2 relative">
            <SceneMechanic />
          </div>
        </div>
      </section>

      {/* ── SEÇÃO: OFICINA ── */}
      <section id="oficina" className="py-20 lg:py-28 px-5 lg:px-8 bg-steel-50 scroll-mt-20">
        <div className="max-w-6xl mx-auto grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          <div className="relative">
            <SceneWorkshop />
          </div>
          <div>
            <div className="text-xs font-bold text-brand-600 uppercase tracking-widest">Para Oficinas</div>
            <h2 className="mt-3 text-3xl lg:text-5xl font-bold tracking-tight leading-tight text-steel-900">
              Mão de obra qualificada,<br />
              <span className="text-brand-500">quando você precisa.</span>
            </h2>
            <p className="mt-5 text-lg text-steel-600 leading-relaxed">
              Publique a demanda com valor por hora e teto de horas.
              Mecânicos disponíveis na região recebem o alerta na hora.
              Pagamento liberado só depois da sua confirmação.
            </p>
            <ul className="mt-6 space-y-3 text-steel-700">
              <Bullet>Sem CLT, sem encargos, sem contrato fixo</Bullet>
              <Bullet>Mecânicos verificados (CPF, CNH, histórico público)</Bullet>
              <Bullet>Você aprova o serviço antes do repasse ser liberado</Bullet>
              <Bullet>OS, clientes, veículos e agendamento no mesmo painel</Bullet>
            </ul>
            <button
              type="button"
              onClick={() => go('workshop')}
              className="mt-8 inline-flex items-center gap-2 bg-brand-500 text-white font-bold rounded-2xl px-6 py-4 hover:bg-brand-600 transition shadow-lg shadow-brand-500/30">
              Quero ser oficina <span>→</span>
            </button>
          </div>
        </div>
      </section>

      {/* ── COMO FUNCIONA ── */}
      <section id="como-funciona" className="py-20 lg:py-28 px-5 lg:px-8 scroll-mt-20">
        <div className="max-w-5xl mx-auto">
          <div className="text-center max-w-3xl mx-auto mb-14">
            <div className="text-xs font-bold text-brand-600 uppercase tracking-widest">Como funciona</div>
            <h2 className="mt-3 text-3xl lg:text-5xl font-bold tracking-tight leading-tight text-steel-900">
              Do cadastro ao PIX,<br />em quatro passos.
            </h2>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <Step n={1} title="Cadastro e aprovação"
              desc="Validamos CNPJ da oficina e CPF/CNH do mecânico. Aprovação em até 24h." />
            <Step n={2} title="Demanda publicada"
              desc="Oficina cria a demanda com valor e horas. Mecânicos disponíveis na região veem na hora." />
            <Step n={3} title="Aceite e execução"
              desc="Mecânico aceita, vai até o local, executa. Tudo rastreado em tempo real, com chat integrado." />
            <Step n={4} title="Confirmação e repasse"
              desc="Oficina confirma o serviço. Mecânico recebe via PIX em até 24h, direto na conta." />
          </div>
        </div>
      </section>

      {/* ── MANIFESTO ── */}
      <section id="manifesto" className="py-20 lg:py-28 px-5 lg:px-8 bg-steel-900 text-white scroll-mt-20">
        <div className="max-w-4xl mx-auto text-center">
          <div className="text-xs font-bold text-brand-400 uppercase tracking-widest">Manifesto</div>
          <h2 className="mt-3 text-3xl lg:text-5xl font-bold tracking-tight leading-tight">
            O setor automotivo move bilhões.<br />
            <span className="text-brand-400">Quem move o setor está sendo deixado pra trás.</span>
          </h2>
          <p className="mt-8 text-lg text-steel-300 leading-relaxed max-w-2xl mx-auto">
            Mecânico autônomo qualificado existe em todo lugar. Oficina precisando dele também.
            Mas a conexão ainda acontece por indicação, telefone, papel.
            <strong className="block mt-4 text-white">
              Decidimos digitalizar essa ponte — com a mesma clareza de um app de mobilidade,
              só que para serviço técnico de verdade.
            </strong>
          </p>

          <div className="mt-14 grid md:grid-cols-3 gap-4">
            <Pillar icon="🔗" title="Conexão direta"
              desc="Quem demanda e quem executa se encontram sem intermediário e sem fricção." />
            <Pillar icon="🛡️" title="Confiança verificável"
              desc="CNPJ, CPF, CNH conferidos. Avaliações públicas. Histórico de cada serviço." />
            <Pillar icon="⚡" title="Tempo real"
              desc="Aceite, deslocamento, chegada, execução, conclusão — tudo acompanhado ao vivo." />
          </div>
        </div>
      </section>

      {/* ── CTA FINAL ── */}
      <section className="py-24 lg:py-32 px-5 lg:px-8 bg-gradient-to-b from-white to-brand-50/30">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-4xl lg:text-6xl font-bold tracking-tight leading-tight text-steel-900">
            Escolha seu lado.<br />
            <span className="text-brand-500">Comece hoje.</span>
          </h2>
          <p className="mt-6 text-lg text-steel-600">
            Cadastro em 2 minutos. Aprovação em 24h. Sem cartão de crédito.
          </p>

          <div className="mt-10 flex flex-col sm:flex-row gap-3 max-w-lg mx-auto">
            <button
              type="button"
              onClick={() => go('mechanic')}
              className="flex-1 bg-steel-900 text-white font-bold rounded-2xl px-6 py-4 hover:bg-steel-800 transition flex items-center justify-center gap-2 shadow-lg shadow-steel-900/10">
              <span className="text-2xl">🔧</span> Sou mecânico
            </button>
            <button
              type="button"
              onClick={() => go('workshop')}
              className="flex-1 bg-brand-500 text-white font-bold rounded-2xl px-6 py-4 hover:bg-brand-600 transition flex items-center justify-center gap-2 shadow-lg shadow-brand-500/30">
              <span className="text-2xl">🏪</span> Sou oficina
            </button>
          </div>
        </div>
      </section>

      {/* ── Modal de captura de lead ── */}
      {gateIntent && (
        <LeadCaptureModal
          intent={gateIntent}
          onClose={() => setGateIntent(null)}
          onComplete={data => {
            const target = gateIntent === 'mechanic' ? '/mecanico' : '/oficina';
            setGateIntent(null);
            nav(target, data ? { state: { leadData: data } } : undefined);
          }}
        />
      )}

      {/* ── FOOTER ── */}
      <footer className="border-t border-steel-100 py-14 px-5 lg:px-8 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-8 mb-10">
            <div>
              <Logo />
              <p className="mt-3 text-xs text-steel-500 leading-relaxed max-w-[220px]">
                A infraestrutura de mão de obra do setor automotivo brasileiro.
              </p>
            </div>

            <FooterColumn title="Produto" items={[
              { label: 'Para mecânicos', onClick: () => go('mechanic') },
              { label: 'Para oficinas',  onClick: () => go('workshop') },
              { label: 'Entrar',         to: '/login', state: { fresh: true } },
            ]} />

            <FooterColumn title="Plataforma" items={[
              { label: 'Como funciona', href: '#como-funciona' },
              { label: 'Manifesto',     href: '#manifesto'     },
              { label: 'Brandbook',     to: '/brandbook'       },
            ]} />

            <FooterColumn title="Confiança" items={[
              { label: 'Pagamento garantido (escrow)' },
              { label: 'Verificação manual de cadastros' },
              { label: 'Suporte por chat' },
            ]} />
          </div>

          <div className="pt-6 border-t border-steel-100 flex flex-col md:flex-row items-center justify-between gap-3 text-xs text-steel-500">
            <div>© MecânicoApp {new Date().getFullYear()} · Todos os direitos reservados</div>
            <div className="flex items-center gap-5">
              <span>Feito no Brasil 🇧🇷</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ─── Componentes auxiliares ─── */

function Pillar({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur">
      <div className="text-3xl">{icon}</div>
      <h3 className="mt-3 text-lg font-bold text-white">{title}</h3>
      <p className="mt-2 text-sm text-steel-400 leading-relaxed">{desc}</p>
    </div>
  );
}

function Step({ n, title, desc }: { n: number; title: string; desc: string }) {
  return (
    <div className="flex gap-4 bg-white border border-steel-200 rounded-2xl p-5 shadow-sm hover:shadow-md hover:border-brand-200 transition">
      <div className="h-11 w-11 rounded-full bg-brand-500 grid place-items-center text-white font-bold shrink-0 shadow-lg shadow-brand-500/30">
        {n}
      </div>
      <div>
        <h3 className="font-bold text-lg leading-tight text-steel-900">{title}</h3>
        <p className="mt-1 text-sm text-steel-600 leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}

function Stat({ n, label }: { n: string; label: string }) {
  return (
    <div>
      <div className="text-3xl lg:text-4xl font-bold text-brand-500 font-display leading-none">{n}</div>
      <div className="mt-2 text-xs text-steel-500 font-medium">{label}</div>
    </div>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="h-5 w-5 rounded-full bg-brand-500/10 text-brand-600 grid place-items-center text-xs font-bold shrink-0 mt-0.5">✓</span>
      <span className="text-base">{children}</span>
    </li>
  );
}

type FooterItem = { label: string; to?: string; href?: string; state?: any; onClick?: () => void };
function FooterColumn({ title, items }: { title: string; items: FooterItem[] }) {
  return (
    <div>
      <div className="text-xs font-bold text-steel-900 uppercase tracking-widest mb-3">{title}</div>
      <ul className="space-y-2 text-sm text-steel-600">
        {items.map((item, i) => (
          <li key={i}>
            {item.onClick ? (
              <button type="button" onClick={item.onClick} className="hover:text-brand-600 transition text-left">{item.label}</button>
            ) : item.to ? (
              <Link to={item.to} state={item.state} className="hover:text-brand-600 transition">{item.label}</Link>
            ) : item.href ? (
              <a href={item.href} className="hover:text-brand-600 transition">{item.label}</a>
            ) : (
              <span>{item.label}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ─── Ilustrações SVG ─── */

function MiniMechanic() {
  // Mini phone com job notification — para o card do hero
  return (
    <svg viewBox="0 0 200 200" className="w-full h-full">
      <defs>
        <linearGradient id="mm-screen" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1A2530" />
          <stop offset="100%" stopColor="#0B1117" />
        </linearGradient>
      </defs>
      {/* glow circular */}
      <circle cx="100" cy="100" r="80" fill="#FF5C0A" opacity="0.15" />
      {/* phone tilted */}
      <g transform="translate(38, 24) rotate(-8 60 80)">
        <rect x="0" y="0" width="120" height="160" rx="18" fill="#0B1117" />
        <rect x="6" y="8" width="108" height="144" rx="13" fill="url(#mm-screen)" />
        {/* status */}
        <rect x="14" y="14" width="30" height="2.5" rx="1" fill="#3A4452" />
        <circle cx="106" cy="15" r="1.8" fill="#16C784" />
        {/* job card */}
        <rect x="12" y="26" width="96" height="50" rx="8" fill="#1F2A33" />
        <circle cx="22" cy="38" r="4" fill="#FF5C0A" />
        <rect x="30" y="34" width="50" height="3" rx="1" fill="#E1E7EE" />
        <rect x="30" y="41" width="40" height="2.5" rx="1" fill="#6B7480" />
        <rect x="12" y="56" width="56" height="3" rx="1" fill="#3A4452" />
        <rect x="12" y="63" width="40" height="3" rx="1" fill="#3A4452" />
        {/* accept button */}
        <rect x="12" y="84" width="96" height="22" rx="6" fill="#FF5C0A" />
        <text x="60" y="98" textAnchor="middle" fontSize="9" fontWeight="700" fill="#fff">ACEITAR</text>
        {/* pix line */}
        <rect x="12" y="116" width="96" height="32" rx="6" fill="#16C784" opacity="0.2" />
        <text x="60" y="130" textAnchor="middle" fontSize="7" fontWeight="700" fill="#16C784" letterSpacing="0.1em">PIX RECEBIDO</text>
        <text x="60" y="142" textAnchor="middle" fontSize="12" fontWeight="800" fill="#16C784">R$ 164</text>
      </g>
    </svg>
  );
}

function MiniWorkshop() {
  // Mini dashboard com OS — para o card do hero da oficina
  return (
    <svg viewBox="0 0 200 200" className="w-full h-full">
      <defs>
        <linearGradient id="mw-paper" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#F5F7FA" />
        </linearGradient>
      </defs>
      {/* clipboard */}
      <g transform="translate(30, 30) rotate(6 60 70)">
        <rect x="0" y="0" width="120" height="140" rx="8" fill="url(#mw-paper)" stroke="#E1E7EE" strokeWidth="1" />
        {/* header */}
        <rect x="12" y="12" width="60" height="6" rx="2" fill="#0B1117" />
        <rect x="12" y="24" width="40" height="3" rx="1" fill="#6B7480" />
        {/* job lines */}
        {[40, 60, 80].map((y, i) => (
          <g key={i}>
            <circle cx="20" cy={y + 4} r="3.5" fill={i === 0 ? '#FF5C0A' : '#16C784'} />
            <rect x="28" y={y} width="60" height="3" rx="1" fill="#0B1117" />
            <rect x="28" y={y + 6} width="40" height="2.5" rx="1" fill="#6B7480" />
            <rect x="92" y={y - 1} width="20" height="10" rx="3" fill={i === 0 ? '#FFE8DC' : '#DBF5E5'} />
          </g>
        ))}
        {/* total */}
        <line x1="12" y1="106" x2="108" y2="106" stroke="#E1E7EE" strokeWidth="1" />
        <rect x="12" y="114" width="40" height="3" rx="1" fill="#6B7480" />
        <rect x="78" y="111" width="30" height="10" rx="3" fill="#FF5C0A" />
      </g>
    </svg>
  );
}

function SceneMechanic() {
  // Cena maior — mecânico recebendo job no celular, com bg estilizado
  return (
    <svg viewBox="0 0 500 450" className="w-full h-auto rounded-3xl shadow-2xl"
      style={{ background: 'linear-gradient(180deg,#FF8042 0%,#3A1A1F 60%,#0B1117 100%)' }}>
      <defs>
        <radialGradient id="sm-sun" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="#FFE6CC" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#FF5C0A" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="380" cy="120" r="100" fill="url(#sm-sun)" />
      <circle cx="380" cy="120" r="34" fill="#FFE6CC" />

      {/* Skyline */}
      <g fill="#0B1117">
        <rect x="0"   y="180" width="60" height="120" />
        <rect x="56"  y="160" width="44" height="140" />
        <rect x="98"  y="140" width="56" height="160" />
        <rect x="152" y="170" width="40" height="130" />
        <rect x="190" y="130" width="56" height="170" />
        <rect x="244" y="165" width="44" height="135" />
        <rect x="286" y="155" width="48" height="145" />
        <rect x="430" y="160" width="50" height="140" />
        <rect x="478" y="140" width="22" height="160" />
      </g>
      <g fill="#FFC890" opacity="0.7">
        {[[14,210],[14,240],[24,200],[24,260],
          [68,200],[78,230],[68,260],[78,280],
          [110,180],[120,210],[110,240],[120,270],
          [162,210],[170,240],[200,170],[210,200],[222,230],[210,260],
          [256,205],[270,235],[256,270],[298,200],[310,230],[300,260],[316,275],
          [438,200],[450,225],[438,250],[450,275],
        ].map(([x, y], i) => <rect key={i} x={x} y={y} width="3" height="3" />)}
      </g>

      {/* destino oficina */}
      <g transform="translate(340, 240)">
        <circle r="20" fill="#FF5C0A" opacity="0.25" />
        <circle r="13" fill="#FF5C0A" opacity="0.6" />
        <circle r="7"  fill="#FFE6CC" />
        <text y="-22" textAnchor="middle" fontSize="8" fontWeight="700"
          fill="#FFE6CC" style={{ letterSpacing: '0.15em' }}>OFICINA</text>
      </g>

      {/* estrada perspectiva */}
      <polygon points="0,450 500,450 340,300 160,300" fill="#0B1117" opacity="0.8" />
      <g stroke="#FF5C0A" strokeWidth="3" strokeLinecap="round" fill="none">
        <line x1="250" y1="305" x2="255" y2="325" opacity="0.4" />
        <line x1="256" y1="340" x2="262" y2="365" opacity="0.55" />
        <line x1="263" y1="382" x2="270" y2="408" opacity="0.7" />
        <line x1="271" y1="425" x2="280" y2="450" opacity="0.9" />
      </g>

      {/* dashboard */}
      <path d="M 0 360 Q 250 380 500 360 L 500 450 L 0 450 Z" fill="#0B1117" />

      {/* phone */}
      <g transform="translate(70, 240)">
        <rect x="0" y="0" width="180" height="150" rx="20" fill="#0B1117" />
        <rect x="6" y="8" width="168" height="134" rx="15" fill="#1A2530" />
        <rect x="14" y="14" width="36" height="3" rx="1.5" fill="#3A4452" />
        {/* map */}
        <rect x="12" y="24" width="156" height="90" rx="8" fill="#1F2A33" />
        <g stroke="#2D3848" strokeWidth="1" fill="none">
          <line x1="12" y1="44" x2="168" y2="44" />
          <line x1="12" y1="74" x2="168" y2="74" />
          <line x1="12" y1="104" x2="168" y2="104" />
          <line x1="46" y1="24" x2="46" y2="114" />
          <line x1="92" y1="24" x2="92" y2="114" />
          <line x1="138" y1="24" x2="138" y2="114" />
        </g>
        <path d="M 28 100 Q 60 80, 80 70 T 130 50 T 158 36"
          stroke="#FF5C0A" strokeWidth="3" fill="none" strokeLinecap="round" />
        <circle cx="28" cy="100" r="5" fill="#16C784" stroke="#fff" strokeWidth="1.5" />
        <circle cx="158" cy="36" r="6" fill="#FF5C0A" stroke="#fff" strokeWidth="1.5" />
        {/* card */}
        <rect x="12" y="120" width="156" height="20" rx="5" fill="#1F2A33" />
        <circle cx="22" cy="130" r="4" fill="#FF5C0A" />
        <rect x="30" y="125" width="60" height="3" rx="1" fill="#E1E7EE" />
        <rect x="30" y="132" width="44" height="2.5" rx="1" fill="#6B7480" />
        <rect x="130" y="124" width="32" height="12" rx="3" fill="#FF5C0A" />
        <text x="146" y="133" textAnchor="middle" fontSize="6.5" fontWeight="700" fill="#fff">ACEITAR</text>
      </g>

      {/* floating PIX badge */}
      <g transform="translate(280, 70) rotate(-4)">
        <rect x="0" y="0" width="160" height="62" rx="14" fill="#16C784" />
        <text x="14" y="20" fontSize="9" fontWeight="700" fill="#fff" letterSpacing="0.1em">PIX RECEBIDO</text>
        <text x="14" y="44" fontSize="22" fontWeight="800" fill="#fff" fontFamily="ui-monospace, monospace">R$ 164,00</text>
        <text x="14" y="56" fontSize="8" fill="#fff" opacity="0.85">há 23h · Pastilha de freio</text>
      </g>
    </svg>
  );
}

function SceneWorkshop() {
  // Cena painel de gestão — visão da oficina com OS, mecânicos e mapa
  return (
    <svg viewBox="0 0 500 450" className="w-full h-auto rounded-3xl shadow-2xl bg-white">
      {/* fundo claro suave */}
      <rect width="500" height="450" fill="#F8FAFC" />

      {/* painel principal */}
      <g transform="translate(40, 40)">
        <rect x="0" y="0" width="420" height="370" rx="20" fill="#fff" stroke="#E1E7EE" strokeWidth="1.5" />
        {/* header */}
        <rect x="20" y="20" width="120" height="10" rx="3" fill="#0B1117" />
        <rect x="20" y="35" width="80" height="5" rx="2" fill="#6B7480" />
        <rect x="350" y="18" width="50" height="20" rx="6" fill="#FF5C0A" />
        <text x="375" y="32" textAnchor="middle" fontSize="9" fontWeight="700" fill="#fff">+ Nova</text>

        {/* KPIs */}
        <g transform="translate(20, 60)">
          {[
            ['12', 'Jobs ativos', '#FF5C0A'],
            ['4',  'Aguardando', '#F5A524'],
            ['28', 'Mecânicos',  '#0B1117'],
          ].map(([n, l, c], i) => (
            <g key={i} transform={`translate(${i * 130}, 0)`}>
              <rect x="0" y="0" width="120" height="56" rx="10" fill="#F5F7FA" />
              <text x="14" y="26" fontSize="20" fontWeight="800" fill={c as string}>{n}</text>
              <text x="14" y="42" fontSize="9" fill="#6B7480">{l}</text>
            </g>
          ))}
        </g>

        {/* lista de jobs */}
        <g transform="translate(20, 140)">
          <text x="0" y="0" fontSize="9" fontWeight="700" fill="#6B7480" letterSpacing="0.1em">EM ANDAMENTO</text>
          {[
            { title: 'Troca de pastilha', sub: 'Civic · 2h previstas', color: '#FF5C0A', label: 'A caminho' },
            { title: 'Suspensão completa', sub: 'Cruze · 4h previstas', color: '#16C784', label: 'Em execução' },
            { title: 'Diagnóstico elétrico', sub: 'Onix · 1.5h', color: '#F5A524', label: 'Aguardando' },
          ].map((j, i) => (
            <g key={i} transform={`translate(0, ${15 + i * 56})`}>
              <rect x="0" y="0" width="380" height="46" rx="10" fill="#F8FAFC" stroke="#E1E7EE" strokeWidth="1" />
              <circle cx="20" cy="22" r="8" fill={j.color} opacity="0.15" />
              <circle cx="20" cy="22" r="3" fill={j.color} />
              <text x="36" y="20" fontSize="10" fontWeight="700" fill="#0B1117">{j.title}</text>
              <text x="36" y="32" fontSize="8" fill="#6B7480">{j.sub}</text>
              <rect x="290" y="13" width="80" height="20" rx="5" fill={j.color} opacity="0.12" />
              <text x="330" y="26" textAnchor="middle" fontSize="8.5" fontWeight="700" fill={j.color}>{j.label}</text>
            </g>
          ))}
        </g>
      </g>

      {/* card flutuante "mecânico chegou" */}
      <g transform="translate(290, 360) rotate(3)">
        <rect x="0" y="0" width="180" height="62" rx="12" fill="#FF5C0A" />
        <text x="14" y="20" fontSize="8" fontWeight="700" fill="#fff" letterSpacing="0.1em">🔔 MECÂNICO CHEGOU</text>
        <text x="14" y="40" fontSize="13" fontWeight="800" fill="#fff">João S.</text>
        <text x="14" y="54" fontSize="9" fill="#fff" opacity="0.9">Pastilha · há 1 min</text>
      </g>
    </svg>
  );
}
