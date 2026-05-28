import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Logo } from '@/components/Logo';
import { useAuth } from '@/contexts/AuthContext';
import { LeadCaptureModal, isLeadCaptured } from '@/components/LeadCaptureModal';

type Intent = 'mechanic' | 'workshop';

/**
 * Home institucional — direção editorial: base off-white, grafite,
 * tipografia grande, espaço negativo, laranja só como acento pontual.
 * Sem cards lustrosos, sem ilustrações decorativas, sem glow.
 */
export default function Landing() {
  const [scrolled, setScrolled] = useState(false);
  const [gateIntent, setGateIntent] = useState<Intent | null>(null);
  const { user } = useAuth();
  const nav = useNavigate();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  function go(intent: Intent) {
    const target = intent === 'mechanic' ? '/mecanico' : '/oficina';
    if (user || isLeadCaptured(intent)) { nav(target); return; }
    setGateIntent(intent);
  }

  return (
    <div className="min-h-screen bg-[#FAFAF7] text-steel-900 antialiased selection:bg-brand-500/20">

      {/* ── NAV ── */}
      <header className={`fixed top-0 inset-x-0 z-50 transition-colors duration-300 ${
        scrolled ? 'bg-[#FAFAF7]/90 backdrop-blur-md border-b border-steel-200/70' : 'bg-transparent'
      }`}>
        <div className="max-w-6xl mx-auto px-6 lg:px-10 h-16 flex items-center justify-between">
          <Logo />
          <div className="flex items-center gap-6">
            <Link to="/login" state={{ fresh: true }} className="text-sm font-medium text-steel-600 hover:text-steel-900 transition">
              Entrar
            </Link>
            <button
              type="button"
              onClick={() => go('mechanic')}
              className="text-sm font-semibold text-steel-900 border border-steel-300 rounded-lg px-4 py-2 hover:border-steel-900 transition">
              Começar
            </button>
          </div>
        </div>
      </header>

      {/* ── HERO ── */}
      <section className="px-6 lg:px-10 pt-36 lg:pt-52 pb-20 lg:pb-28">
        <div className="max-w-6xl mx-auto">
          <div className="font-mono text-[11px] tracking-[0.25em] uppercase text-steel-400">
            Plataforma de mão de obra automotiva
          </div>

          <h1 className="mt-8 font-display font-bold tracking-tight text-steel-900
                         text-[2.75rem] leading-[1.02] sm:text-6xl lg:text-[5.25rem] lg:leading-[0.96] max-w-4xl">
            Oficina e mecânico,
            <br />
            conectados em <span className="text-brand-500">tempo real.</span>
          </h1>

          <p className="mt-8 text-lg lg:text-xl text-steel-500 max-w-xl leading-relaxed">
            Quem precisa de mão de obra encontra quem sabe fazer — sem indicação,
            sem papel. Pagamento em custódia e rastreamento ao vivo do começo ao fim.
          </p>

          <div className="mt-10 flex flex-wrap items-center gap-x-7 gap-y-3">
            <button
              type="button"
              onClick={() => go('mechanic')}
              className="bg-brand-500 text-white font-semibold rounded-lg px-7 py-3.5 hover:bg-brand-600 transition">
              Começar agora
            </button>
            <Link to="/login" state={{ fresh: true }} className="text-sm font-medium text-steel-600 hover:text-steel-900 transition">
              Já tenho conta →
            </Link>
          </div>

          <div className="mt-16 lg:mt-24 pt-6 border-t border-steel-200 max-w-3xl
                          flex flex-wrap gap-x-10 gap-y-2 font-mono text-[11px] tracking-wide uppercase text-steel-400">
            <span>Cadastro gratuito</span>
            <span>Aprovação em 24h</span>
            <span>Sem mensalidade</span>
          </div>
        </div>
      </section>

      {/* ── PRA QUEM É — split editorial ── */}
      <section className="border-t border-steel-200 px-6 lg:px-10">
        <div className="max-w-6xl mx-auto grid md:grid-cols-2">
          <button
            type="button"
            onClick={() => go('mechanic')}
            className="group text-left py-14 lg:py-20 md:pr-14">
            <div className="font-mono text-[11px] tracking-[0.2em] uppercase text-steel-400">01 — Para mecânicos</div>
            <h2 className="mt-5 font-display font-bold text-3xl lg:text-4xl tracking-tight leading-tight text-steel-900">
              Trabalhe pra você.
              <br />Receba como profissional.
            </h2>
            <p className="mt-4 text-base text-steel-500 leading-relaxed max-w-md">
              Aceite serviços de oficinas verificadas, defina sua hora e receba
              via PIX. Sem patrão fixo, sem CLT, sem cobrar cliente.
            </p>
            <span className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-steel-900 group-hover:gap-3 transition-all">
              Sou mecânico <span className="text-brand-500">→</span>
            </span>
          </button>

          <button
            type="button"
            onClick={() => go('workshop')}
            className="group text-left py-14 lg:py-20 md:pl-14 border-t md:border-t-0 md:border-l border-steel-200">
            <div className="font-mono text-[11px] tracking-[0.2em] uppercase text-steel-400">02 — Para oficinas</div>
            <h2 className="mt-5 font-display font-bold text-3xl lg:text-4xl tracking-tight leading-tight text-steel-900">
              Mão de obra
              <br />sob demanda.
            </h2>
            <p className="mt-4 text-base text-steel-500 leading-relaxed max-w-md">
              Publique a demanda e um mecânico qualificado aceita em minutos.
              Sem entrevista, sem encargos, sem contrato fixo.
            </p>
            <span className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-steel-900 group-hover:gap-3 transition-all">
              Sou oficina <span className="text-brand-500">→</span>
            </span>
          </button>
        </div>
      </section>

      {/* ── COMO FUNCIONA ── */}
      <section id="como-funciona" className="border-t border-steel-200 px-6 lg:px-10 py-20 lg:py-28 scroll-mt-20">
        <div className="max-w-6xl mx-auto">
          <h2 className="font-display font-bold text-3xl lg:text-5xl tracking-tight leading-tight text-steel-900 max-w-2xl">
            Do cadastro ao pagamento.
          </h2>

          <div className="mt-14 grid md:grid-cols-3 border-t border-steel-200">
            <Step
              n="01"
              title="Cadastro e aprovação"
              desc="Validamos CNPJ da oficina e CPF/CNH do mecânico. Aprovação manual em até 24 horas." />
            <Step
              n="02"
              title="Demanda e aceite"
              desc="A oficina publica o serviço. Mecânico aceita, vai até o local, executa — tudo rastreado em tempo real."
              divided />
            <Step
              n="03"
              title="Confirmação e PIX"
              desc="A oficina confirma o serviço e o mecânico recebe via PIX em até 24h. Direto na conta."
              divided />
          </div>
        </div>
      </section>

      {/* ── CONFIANÇA + CTA ── */}
      <section className="border-t border-steel-200 px-6 lg:px-10 py-24 lg:py-36">
        <div className="max-w-4xl mx-auto">
          <div className="font-mono text-[11px] tracking-[0.25em] uppercase text-steel-400">Confiança</div>
          <h2 className="mt-6 font-display font-bold text-3xl lg:text-5xl tracking-tight leading-[1.08] text-steel-900">
            CNPJ, CPF e CNH verificados.<br />
            Pagamento em custódia até você confirmar.
          </h2>
          <p className="mt-6 text-lg text-steel-500 max-w-xl leading-relaxed">
            O dinheiro fica retido na plataforma e só é liberado ao mecânico
            depois que o serviço é aprovado. Sem calote, dos dois lados.
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-x-7 gap-y-3">
            <button
              type="button"
              onClick={() => go('mechanic')}
              className="bg-brand-500 text-white font-semibold rounded-lg px-7 py-3.5 hover:bg-brand-600 transition">
              Começar agora
            </button>
            <button
              type="button"
              onClick={() => go('workshop')}
              className="text-sm font-medium text-steel-600 hover:text-steel-900 transition">
              Sou oficina →
            </button>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="border-t border-steel-200 px-6 lg:px-10 py-14">
        <div className="max-w-6xl mx-auto">
          <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-8 mb-12">
            <div className="md:col-span-1">
              <Logo />
              <p className="mt-4 text-sm text-steel-500 leading-relaxed max-w-[220px]">
                A infraestrutura de mão de obra do setor automotivo brasileiro.
              </p>
            </div>
            <FooterCol title="Produto" items={[
              { label: 'Para mecânicos', onClick: () => go('mechanic') },
              { label: 'Para oficinas',  onClick: () => go('workshop') },
              { label: 'Entrar',         to: '/login', state: { fresh: true } },
            ]} />
            <FooterCol title="Plataforma" items={[
              { label: 'Como funciona', href: '#como-funciona' },
              { label: 'Brandbook',     to: '/brandbook' },
              { label: 'Termos de uso', to: '/termos' },
              { label: 'Privacidade',   to: '/privacidade' },
            ]} />
            <FooterCol title="Confiança" items={[
              { label: 'Verificação manual' },
              { label: 'Pagamento em custódia' },
              { label: 'Avaliações públicas' },
            ]} />
          </div>
          <div className="pt-6 border-t border-steel-200 flex flex-col md:flex-row items-start md:items-center justify-between gap-2 text-xs text-steel-400 font-mono uppercase tracking-wide">
            <span>© MecânicoApp {new Date().getFullYear()}</span>
            <span>Feito no Brasil</span>
          </div>
        </div>
      </footer>

      {/* ── Gate de captura de lead ── */}
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
    </div>
  );
}

/* ─── Componentes auxiliares ─── */

function Step({ n, title, desc, divided = false }: { n: string; title: string; desc: string; divided?: boolean }) {
  return (
    <div className={`py-8 md:py-10 md:px-8 first:md:pl-0 ${divided ? 'border-t md:border-t-0 md:border-l border-steel-200' : ''}`}>
      <div className="font-display font-bold text-4xl text-steel-200 leading-none">{n}</div>
      <h3 className="mt-5 font-semibold text-lg text-steel-900">{title}</h3>
      <p className="mt-2 text-sm text-steel-500 leading-relaxed">{desc}</p>
    </div>
  );
}

type FooterItem = { label: string; to?: string; href?: string; state?: any; onClick?: () => void };
function FooterCol({ title, items }: { title: string; items: FooterItem[] }) {
  return (
    <div>
      <div className="font-mono text-[10px] font-bold text-steel-900 uppercase tracking-[0.2em] mb-4">{title}</div>
      <ul className="space-y-2.5 text-sm text-steel-500">
        {items.map((item, i) => (
          <li key={i}>
            {item.onClick ? (
              <button type="button" onClick={item.onClick} className="hover:text-steel-900 transition text-left">{item.label}</button>
            ) : item.to ? (
              <Link to={item.to} state={item.state} className="hover:text-steel-900 transition">{item.label}</Link>
            ) : item.href ? (
              <a href={item.href} className="hover:text-steel-900 transition">{item.label}</a>
            ) : (
              <span>{item.label}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
