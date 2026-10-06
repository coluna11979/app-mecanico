import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Logo } from '@/components/Logo';
import { useAuth } from '@/contexts/AuthContext';
import { LeadCaptureModal, isLeadCaptured } from '@/components/LeadCaptureModal';
import {
  Button, ButtonLink, Check, Container, FeatureCard, Icon, Kicker, PlaceholderTag, Reveal, Section, SectionHead,
} from '@/components/home/ui';
import {
  HeroProduct, ManagementMockup, MockCaption, NetworkMockup, PhoneFrame, PhoneOpportunity, ProfileMockup,
} from '@/components/home/mockups';
import { ImpactCalculator } from '@/components/home/ImpactCalculator';
import { PLATFORM_CONTACT_EMAIL } from '@/data/legal/termsContent';
import { FACTS, FAQ, METRICS, TESTIMONIALS, TESTIMONIAL_PLACEHOLDERS } from '@/components/home/content';

type Intent = 'mechanic' | 'workshop';

const SIGNUP_WORKSHOP = '/cadastro/oficina';
const SIGNUP_MECHANIC = '/cadastro/mecanico';

const NAV: { label: string; href?: string; intent?: Intent }[] = [
  { label: 'Para Oficinas',  intent: 'workshop' },
  { label: 'Para Mecânicos', intent: 'mechanic' },
  { label: 'Como funciona',  href: '#como-funciona' },
  { label: 'Segurança',      href: '#seguranca' },
  { label: 'Depoimentos',    href: '#depoimentos' },
  { label: 'FAQ',            href: '#faq' },
];

/**
 * Home institucional. Duas portas de entrada (oficina e mecânico), produto
 * como protagonista e nenhuma promessa que a operação ainda não sustenta.
 * Números e depoimentos vêm de `components/home/content.ts`.
 */
export default function Landing() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [gateIntent, setGateIntent] = useState<Intent | null>(null);
  const [showSticky, setShowSticky] = useState(false);
  const heroRef = useRef<HTMLElement>(null);
  const finalRef = useRef<HTMLElement>(null);
  const { user } = useAuth();
  const nav = useNavigate();

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 12);
      // Barra fixa de CTA (mobile): aparece depois do hero e some ao chegar no CTA final.
      const heroEnd = heroRef.current?.getBoundingClientRect().bottom ?? 0;
      const finalTop = finalRef.current?.getBoundingClientRect().top ?? Infinity;
      setShowSticky(heroEnd < 0 && finalTop > window.innerHeight);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Menu mobile: trava a rolagem do fundo e fecha com Esc.
  useEffect(() => {
    if (!menuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; document.removeEventListener('keydown', onKey); };
  }, [menuOpen]);

  useEffect(() => {
    const prev = document.title;
    document.title = 'MecânicoApp — Mão de obra automotiva para oficinas e oportunidades para mecânicos';
    return () => { document.title = prev; };
  }, []);

  /** Leva pra landing específica passando pelo gate de lead (se ainda não capturado). */
  function go(intent: Intent) {
    setMenuOpen(false);
    const target = intent === 'mechanic' ? '/mecanico' : '/oficina';
    if (user || isLeadCaptured(intent)) { nav(target); return; }
    setGateIntent(intent);
  }

  const hasMetrics = METRICS.some(m => m.value);
  const testimonials = TESTIMONIALS.length ? TESTIMONIALS : import.meta.env.DEV ? TESTIMONIAL_PLACEHOLDERS : [];

  return (
    <div className="min-h-screen overflow-x-hidden bg-white text-steel-900 antialiased">
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:shadow-lg">
        Pular para o conteúdo
      </a>

      {/* ── 1. HEADER ── */}
      <header className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
        scrolled || menuOpen ? 'border-b border-steel-100 bg-white/90 shadow-sm backdrop-blur-xl' : 'bg-transparent'
      }`}>
        <Container className="flex h-16 items-center justify-between gap-4">
          <Link to="/" aria-label="MecânicoApp — início"><Logo /></Link>

          <nav aria-label="Principal" className="hidden items-center gap-6 text-sm font-semibold text-steel-600 lg:flex">
            {NAV.map(item => item.intent ? (
              <button key={item.label} type="button" onClick={() => go(item.intent!)} className="transition hover:text-steel-900">{item.label}</button>
            ) : (
              <a key={item.label} href={item.href} className="transition hover:text-steel-900">{item.label}</a>
            ))}
          </nav>

          <div className="flex items-center gap-1.5 sm:gap-2">
            <Link to="/login" state={{ fresh: true }} className="hidden rounded-lg px-3 py-2 text-sm font-semibold text-steel-700 transition hover:text-steel-900 sm:inline-flex">
              Entrar
            </Link>
            <SignupMenu />
            <button type="button" onClick={() => setMenuOpen(o => !o)}
              aria-expanded={menuOpen} aria-controls="menu-mobile" aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'}
              className="-mr-2 grid h-11 w-11 place-items-center rounded-lg text-steel-800 hover:bg-steel-100 lg:hidden">
              <Icon name={menuOpen ? 'close' : 'menu'} />
            </button>
          </div>
        </Container>

        {menuOpen && (
          <nav id="menu-mobile" aria-label="Menu" className="h-[calc(100dvh-4rem)] animate-fade-in overflow-y-auto border-t border-steel-100 bg-white lg:hidden">
            <Container className="flex flex-col py-2">
              {NAV.map(item => item.intent ? (
                <button key={item.label} type="button" onClick={() => go(item.intent!)} className="flex min-h-[52px] items-center justify-between border-b border-steel-100 text-left text-lg font-semibold text-steel-900">
                  {item.label}<span aria-hidden className="text-steel-400">→</span>
                </button>
              ) : (
                <a key={item.label} href={item.href} onClick={() => setMenuOpen(false)} className="flex min-h-[52px] items-center border-b border-steel-100 text-lg font-semibold text-steel-900">{item.label}</a>
              ))}
              <div className="mt-6 flex flex-col gap-3">
                <ButtonLink to={SIGNUP_WORKSHOP} arrow>Cadastrar minha oficina</ButtonLink>
                <ButtonLink to={SIGNUP_MECHANIC} variant="dark" arrow>Quero ser mecânico</ButtonLink>
                <Link to="/login" state={{ fresh: true }} className="flex min-h-[48px] items-center justify-center text-base font-semibold text-steel-700">
                  Já tenho conta · Entrar
                </Link>
              </div>
            </Container>
          </nav>
        )}
      </header>

      <main id="conteudo">
        {/* ── 2. HERO ── */}
        <section ref={heroRef} className="relative overflow-hidden pb-12 pt-24 sm:pb-16 sm:pt-32 lg:pb-24 lg:pt-40" aria-labelledby="hero-title">
          <div aria-hidden className="pointer-events-none absolute inset-0">
            <div className="absolute -right-40 -top-40 hidden h-[560px] w-[560px] rounded-full bg-brand-500/10 blur-3xl sm:block" />
            <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[radial-gradient(circle,rgba(255,92,10,0.12),transparent_70%)] sm:hidden" />
            <div className="absolute inset-0 bg-[linear-gradient(to_right,#E8ECF1_1px,transparent_1px),linear-gradient(to_bottom,#E8ECF1_1px,transparent_1px)] bg-[size:56px_56px] opacity-40 [mask-image:radial-gradient(ellipse_at_top,black_20%,transparent_70%)]" />
          </div>

          <Container className="relative grid items-center gap-10 sm:gap-14 lg:grid-cols-2 lg:gap-12 [&>*]:min-w-0">
            <div>
              <Kicker>A ponte direta entre oficina e mecânico</Kicker>
              <h1 id="hero-title" className="mt-4 font-display text-[2.375rem] font-bold leading-[1.04] tracking-tight min-[400px]:text-[2.625rem] sm:mt-5 sm:text-6xl sm:leading-[1.02] lg:text-[3.6rem] xl:text-[4rem]">
                Nenhum serviço parado.<br />
                <span className="text-brand-500">Nenhuma hora desperdiçada.</span>
              </h1>
              <p className="mt-5 max-w-xl text-[17px] leading-relaxed text-steel-600 sm:mt-6 sm:text-lg">
                Sua oficina encontra profissionais disponíveis quando falta mão de obra.
                Você, mecânico, encontra serviços reais em oficinas da sua região, no horário que tem livre.
              </p>

              <div className="mt-7 flex flex-col gap-3 sm:mt-8 sm:flex-row">
                <ButtonLink to={SIGNUP_WORKSHOP} arrow className="sm:px-6">Cadastrar minha oficina</ButtonLink>
                <ButtonLink to={SIGNUP_MECHANIC} variant="dark" arrow className="sm:px-6">Quero ser mecânico</ButtonLink>
              </div>
              <p className="mt-4 text-sm text-steel-500">Cadastro gratuito · sem mensalidade · cada perfil é analisado pela nossa equipe</p>
            </div>

            <div className="animate-slide-up px-1 sm:px-0">
              <HeroProduct />
              <MockCaption />
            </div>
          </Container>
        </section>

        {/* ── 3. PROVA / NÚMEROS ── */}
        <section aria-label="MecânicoApp em números" className="border-y border-steel-100 bg-steel-50/60 py-8 sm:py-10">
          <Container>
            {hasMetrics ? (
              <dl className="grid grid-cols-2 gap-6 text-center md:grid-cols-4">
                {METRICS.filter(m => m.value).map(m => (
                  <div key={m.label}>
                    <dd className="font-display text-3xl font-bold text-steel-900 lg:text-4xl">{m.value}</dd>
                    <dt className="mt-1 text-sm text-steel-500">{m.label}</dt>
                  </div>
                ))}
              </dl>
            ) : (
              <>
                {import.meta.env.DEV && (
                  <div className="mb-6 flex flex-wrap items-center justify-center gap-3 text-xs text-steel-500">
                    <PlaceholderTag />
                    Faixa de métricas oculta até {METRICS.map(m => m.label).join(', ')} terem dados reais em content.ts
                  </div>
                )}
                <ul className="grid grid-cols-2 gap-x-4 gap-y-5 sm:gap-6 lg:grid-cols-4">
                  {FACTS.map(f => (
                    <li key={f.title} className="flex gap-2.5 sm:gap-3">
                      <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-500 text-white"><Icon name="check" size={14} /></span>
                      <div>
                        <p className="text-[15px] font-bold leading-snug text-steel-900 sm:text-base">{f.title}</p>
                        <p className="mt-0.5 hidden text-sm text-steel-500 sm:block">{f.desc}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Container>
        </section>

        {/* ── 4. OFICINAS ── */}
        <Section id="oficinas" labelledBy="oficinas-title">
          <Container className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16 [&>*]:min-w-0">
            <div>
              <SectionHead id="oficinas-title" kicker="Para oficinas"
                title={<>Mão de obra <span className="text-brand-500">quando você precisa.</span></>}
                sub="Faltou alguém, o pátio encheu ou chegou um serviço fora da especialidade do time? Publique a demanda e confirme um profissional com perfil, histórico e avaliações à vista." />
              <ul className="mt-6 grid gap-3 text-steel-700 sm:mt-8 sm:grid-cols-2">
                <Check>Publique demandas em poucos minutos</Check>
                <Check>Veja quem está disponível</Check>
                <Check>Analise perfil e especialidade</Check>
                <Check>Avalie depois do serviço</Check>
                <Check>Salve os melhores nos preferidos</Check>
                <Check>Atenda mais sem aumentar a folha fixa</Check>
              </ul>
              <div className="mt-6 rounded-2xl border-l-4 border-brand-500 bg-brand-50/60 p-4 sm:mt-8 sm:p-5">
                <p className="font-bold text-steel-900">Sua equipe continua sendo sua base.</p>
                <p className="mt-1 text-[15px] text-steel-600 sm:text-sm">O MecânicoApp entra quando você precisa de reforço. Sem exclusividade, sem mudar a rotina.</p>
              </div>
              <Button onClick={() => go('workshop')} variant="primary" arrow className="mt-7 w-full sm:mt-8 sm:w-auto">Conhecer solução para oficinas</Button>
            </div>
            <Reveal>
              <div className="relative">
                <div aria-hidden className="absolute -inset-3 -z-10 rounded-[2rem] sm:-inset-6 bg-gradient-to-br from-brand-50 to-steel-50" />
                <ProfileMockup />
                <MockCaption />
              </div>
            </Reveal>
          </Container>
        </Section>

        {/* ── 5. MECÂNICOS ── */}
        <Section id="mecanicos" tone="dark" labelledBy="mecanicos-title" className="relative overflow-hidden">
          <div aria-hidden className="pointer-events-none absolute -left-40 top-1/3 hidden h-[480px] w-[480px] rounded-full bg-brand-500/15 blur-3xl sm:block" />
          <Container className="relative grid items-center gap-12 lg:grid-cols-2 lg:gap-16 [&>*]:min-w-0">
            <Reveal className="order-2 flex justify-center lg:order-1">
              <div>
                <PhoneFrame><PhoneOpportunity /></PhoneFrame>
                <MockCaption dark />
              </div>
            </Reveal>
            <div className="order-1 lg:order-2">
              <SectionHead id="mecanicos-title" kicker="Para mecânicos" dark
                title={<>Sua hora. Sua agenda. <span className="text-brand-400">Seu dinheiro.</span></>}
                sub="Use a experiência que você já tem para ganhar mais. Em tempo integral, por conta própria ou nas folgas do seu emprego." />
              <div className="-mx-4 mt-6 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:mx-0 sm:mt-8 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 sm:pb-0 [&::-webkit-scrollbar]:hidden [&>*]:w-[80%] [&>*]:shrink-0 [&>*]:snap-start sm:[&>*]:w-auto">
                <FeatureCard dark icon="megaphone" title="Oportunidades de oficinas" desc="Serviços reais, perto de você, com valor visível antes de aceitar." />
                <FeatureCard dark icon="clock" title="Você escolhe o horário" desc="Fique disponível quando puder. Sem jornada mínima." />
                <FeatureCard dark icon="star" title="Reputação que acompanha você" desc="Cada avaliação fortalece seu perfil para as próximas oficinas." />
                <FeatureCard dark icon="repeat" title="Oficinas que chamam de novo" desc="Bom trabalho vira preferência e chamado direto." />
              </div>
              <p className="mt-2 text-xs text-steel-400 sm:hidden">Deslize para ver os 4 benefícios →</p>
              <ul className="mt-6 space-y-2.5 text-[15px] text-steel-200 sm:text-sm sm:text-steel-300">
                <Check dark>Dá para usar mesmo tendo carteira assinada</Check>
                <Check dark>Recebimento pela plataforma, depois que a oficina confirma o serviço</Check>
              </ul>
              <Button onClick={() => go('mechanic')} variant="white" arrow className="mt-7 w-full sm:mt-8 sm:w-auto">Conhecer solução para mecânicos</Button>
            </div>
          </Container>
        </Section>

        {/* ── 6. CALCULADORA ── */}
        <Section id="impacto" tone="muted" labelledBy="impacto-title">
          <Container>
            <SectionHead id="impacto-title" kicker="Simulador para oficinas" center
              title="Quanto sua oficina pode estar deixando de faturar por falta de mão de obra?"
              sub="Coloque seus números. Leva dez segundos." />
            <Reveal className="mx-auto mt-8 max-w-5xl sm:mt-12"><ImpactCalculator ctaTo={SIGNUP_WORKSHOP} /></Reveal>
          </Container>
        </Section>

        {/* ── 7. COMO FUNCIONA ── */}
        <Section id="como-funciona" labelledBy="como-title">
          <Container>
            <SectionHead id="como-title" kicker="Como funciona" center
              title="Do cadastro ao serviço feito, em quatro passos."
              sub="Sem leilão de preço e sem disputa entre profissionais." />
            <ol className="mt-8 grid gap-3 sm:mt-14 sm:gap-4 md:grid-cols-2 lg:grid-cols-4">
              {[
                { t: 'Cadastre sua oficina', d: 'Gratuito. Nossa equipe analisa e libera o acesso.' },
                { t: 'Publique sua demanda', d: 'Serviço, dia, horário e estimativa de tempo.' },
                { t: 'Escolha o profissional', d: 'Quem está disponível aceita. Você confirma quem entra.' },
                { t: 'Avalie e chame de novo', d: 'Gostou? Salve nos preferidos e chame direto da próxima vez.' },
              ].map((s, i) => (
                <Reveal key={s.t} delay={i * 80}>
                  <li className="relative flex h-full gap-4 rounded-2xl border border-steel-100 bg-white p-4 shadow-sm sm:block sm:p-6">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-50 font-display text-sm font-bold text-brand-600 sm:block sm:h-auto sm:w-auto sm:bg-transparent sm:text-brand-500">0{i + 1}</span>
                    <div>
                      <h3 className="text-lg font-bold leading-snug text-steel-900 sm:mt-3">{s.t}</h3>
                      <p className="mt-1 text-[15px] leading-relaxed text-steel-600 sm:mt-2 sm:text-sm">{s.d}</p>
                    </div>
                  </li>
                </Reveal>
              ))}
            </ol>
            <p className="mx-auto mt-6 max-w-md text-center text-[15px] text-steel-600 sm:mt-8 sm:text-sm sm:text-steel-500">
              Já tem um profissional de confiança? Pule direto para o passo 4: chame quem está nos seus preferidos.
            </p>
          </Container>
        </Section>

        {/* ── 8. CONFIANÇA ── */}
        <Section id="confianca" tone="muted" labelledBy="confianca-title">
          <Container>
            <div className="grid items-end gap-4 sm:gap-6 lg:grid-cols-2">
              <SectionHead id="confianca-title" kicker="Confiança"
                title={<>Você sabe quem está entrando <span className="text-brand-500">na sua oficina.</span></>} />
              <p className="text-base leading-relaxed text-steel-600 sm:text-lg lg:pb-2">
                Antes de confirmar, você vê tudo o que importa sobre o profissional.
                <strong className="block text-steel-900">E você decide com quem trabalha.</strong>
              </p>
            </div>
            <div className="mt-8 grid gap-3 sm:mt-12 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
              <FeatureCard icon="id" title="Perfil analisado" desc="Cada cadastro passa pela nossa equipe antes de ser liberado." />
              <FeatureCard icon="wrench" title="Especialidades declaradas" desc="Saiba em que tipo de serviço o profissional atua." />
              <FeatureCard icon="star" title="Avaliações de oficinas" desc="Notas deixadas por quem já trabalhou com ele na plataforma." />
              <FeatureCard icon="history" title="Histórico de serviços" desc="Quantos serviços fez e com quantas oficinas." />
              <FeatureCard icon="trend" title="Reputação construída" desc="Quem trabalha bem cresce no perfil, serviço a serviço." />
              <FeatureCard icon="heart" title="Seus preferidos" desc="Os profissionais que você aprovou ficam a um toque." />
            </div>
          </Container>
        </Section>

        {/* ── 9. REDE DE CONFIANÇA ── */}
        <Section id="rede" tone="dark" labelledBy="rede-title">
          <Container className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16 [&>*]:min-w-0">
            <div>
              <SectionHead id="rede-title" kicker="Rede de confiança" dark
                title={<>Comece conhecendo. <span className="text-brand-400">Construa sua rede.</span></>}
                sub="Com o tempo, sua oficina monta a própria equipe de reforço, com gente que você já conhece." />
              <ol className="mt-8 sm:mt-10">
                {[
                  ['Conheça', 'Trabalhe com um profissional pela primeira vez.'],
                  ['Avalie', 'Dê sua nota ao fim do serviço.'],
                  ['Adicione aos preferidos', 'Um toque e ele entra na sua lista.'],
                  ['Chame de novo', 'Na próxima demanda, chame direto quem você já aprovou.'],
                ].map(([t, d], i, arr) => (
                  <li key={t} className="relative flex gap-4 pb-6 last:pb-0">
                    {i < arr.length - 1 && <span aria-hidden className="absolute left-[17px] top-9 h-[calc(100%-2.25rem)] w-px bg-gradient-to-b from-brand-500/60 to-brand-500/10" />}
                    <span className={`relative grid h-9 w-9 shrink-0 place-items-center rounded-full font-display text-sm font-bold ${
                      i === arr.length - 1 ? 'bg-brand-500 text-white' : 'border border-brand-500/50 text-brand-400'
                    }`}>{i === arr.length - 1 ? <Icon name="repeat" size={16} /> : i + 1}</span>
                    <div className="pt-1"><p className="font-bold text-white">{t}</p><p className="text-[15px] text-steel-300 sm:text-sm">{d}</p></div>
                  </li>
                ))}
              </ol>
            </div>
            <Reveal>
              <NetworkMockup />
              <MockCaption dark />
            </Reveal>
          </Container>
        </Section>

        {/* ── 10. SISTEMA DE GESTÃO ── */}
        <Section id="gestao" labelledBy="gestao-title">
          <Container>
            <SectionHead id="gestao-title" kicker="Gestão integrada" center
              title={<>Mais que um marketplace. <span className="text-brand-500">Um sistema para sua oficina.</span></>}
              sub="Clientes, veículos, ordens de serviço e agenda no mesmo lugar onde você pede reforço. O profissional confirmado já aparece na OS." />
            <Reveal className="mx-auto mt-8 max-w-4xl sm:mt-12">
              <ManagementMockup />
              <MockCaption />
            </Reveal>
            <ul className="mx-auto mt-8 flex max-w-3xl flex-wrap justify-center gap-2 sm:mt-10">
              {['Clientes', 'Veículos', 'Ordens de serviço', 'Agenda', 'Demandas', 'Profissionais', 'Pagamentos'].map(m => (
                <li key={m} className="rounded-full border border-steel-200 px-3.5 py-1.5 text-sm font-semibold text-steel-700">{m}</li>
              ))}
            </ul>
            <p className="mt-4 text-center text-sm text-steel-500">Comece só chamando profissionais. Adote o resto no seu ritmo.</p>
          </Container>
        </Section>

        {/* ── 11. PROVA SOCIAL ── */}
        <Section id="depoimentos" tone="muted" labelledBy="depoimentos-title">
          <Container>
            <SectionHead id="depoimentos-title" kicker="Quem usa" center
              title="Oficinas e mecânicos, nas palavras deles." />
            {testimonials.length ? (
              <>
              <ul aria-label="Depoimentos" className="-mx-4 mt-8 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-3 [scrollbar-width:none] sm:-mx-6 sm:scroll-px-6 sm:px-6 md:mx-0 md:mt-12 md:grid md:grid-cols-3 md:gap-4 md:overflow-visible md:px-0 md:pb-0 [&::-webkit-scrollbar]:hidden">
                {testimonials.map((t, i) => (
                  <li key={i} className="flex w-[86%] shrink-0 snap-start flex-col rounded-2xl border border-steel-100 bg-white p-6 shadow-sm sm:w-[60%] md:w-auto">
                    {!TESTIMONIALS.length && <div className="mb-3"><PlaceholderTag /></div>}
                    <span className="text-xs font-bold uppercase tracking-widest text-brand-600">{t.side === 'oficina' ? 'Oficina' : 'Mecânico'}</span>
                    <blockquote className="mt-3 flex-1 text-steel-700">“{t.quote}”</blockquote>
                    <p className="mt-5 font-bold text-steel-900">{t.name}</p>
                    <p className="text-sm text-steel-500">{t.role}</p>
                  </li>
                ))}
              </ul>
              {testimonials.length > 1 && <p className="mt-2 text-center text-xs text-steel-500 md:hidden">Deslize para ver mais →</p>}
              </>
            ) : (
              <div className="mx-auto mt-8 max-w-2xl rounded-3xl border border-dashed border-steel-300 bg-white p-6 text-center sm:mt-10 sm:p-8">
                <p className="font-display text-xl font-bold text-steel-900">Estamos formando a primeira rede.</p>
                <p className="mt-2 text-steel-600">
                  As primeiras oficinas e profissionais ajudam a definir como o MecânicoApp evolui. Os relatos deles vão aparecer aqui.
                </p>
                <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
                  <ButtonLink to={SIGNUP_WORKSHOP}>Quero participar como oficina</ButtonLink>
                  <ButtonLink to={SIGNUP_MECHANIC} variant="outline">Quero participar como mecânico</ButtonLink>
                </div>
              </div>
            )}
          </Container>
        </Section>

        {/* ── 12. SEGURANÇA ── */}
        <Section id="seguranca" labelledBy="seguranca-title">
          <Container>
            <SectionHead id="seguranca-title" kicker="Segurança" center
              title="Cada serviço registrado. Cada parte protegida."
              sub="Construímos o MecânicoApp para que oficina e profissional trabalhem com clareza do começo ao fim." />
            <div className="mt-8 grid gap-3 sm:mt-12 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
              <FeatureCard icon="wallet" title="Pagamento pela plataforma" desc="O valor é combinado antes e o pagamento é processado por parceiro especializado. O mecânico recebe depois que a oficina confirma o serviço." />
              <FeatureCard icon="lock" title="Seus dados protegidos" desc="Tratamos dados conforme a LGPD e nossa Política de Privacidade." />
              <FeatureCard icon="id" title="Verificação de cadastro" desc="Oficinas e profissionais passam por análise antes de começar." />
              <FeatureCard icon="chat" title="Suporte de verdade" desc="Fale com o nosso time quando precisar." />
              <FeatureCard icon="history" title="Histórico completo" desc="Demanda, aceite, confirmação e avaliação ficam registrados." />
              <FeatureCard icon="shield" title="Reputação dos dois lados" desc="Oficinas também são avaliadas. Confiança vale para todos." />
            </div>
          </Container>
        </Section>

        {/* ── 13. MANIFESTO ── */}
        <section id="manifesto" aria-labelledby="manifesto-title" className="relative overflow-hidden bg-brand-500 py-16 text-white sm:py-24 lg:py-32">
          <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(255,255,255,0.18),transparent_45%),radial-gradient(circle_at_10%_90%,rgba(11,17,23,0.35),transparent_50%)]" />
          <Container className="relative">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/80">Manifesto</p>
            <h2 id="manifesto-title" className="mt-4 max-w-4xl font-display text-[2rem] font-bold leading-[1.08] tracking-tight sm:text-5xl sm:leading-[1.05] lg:text-6xl">
              O setor automotivo move bilhões. Quem move esse setor não pode continuar desconectado.
            </h2>
            <div className="mt-7 grid gap-5 text-[17px] leading-relaxed text-white sm:mt-10 sm:gap-8 sm:text-lg md:grid-cols-2">
              <p>
                Tem oficina recusando serviço porque faltou gente. E tem mecânico experiente com horas livres,
                esperando a próxima indicação. Os dois existem na mesma cidade, às vezes na mesma rua.
              </p>
              <p>
                O MecânicoApp existe para ligar essa capacidade à demanda real das oficinas.
                Com tecnologia simples, reputação construída no trabalho e respeito por quem vive da reparação automotiva.
              </p>
            </div>
          </Container>
        </section>

        {/* ── FAQ ── */}
        <Section id="faq" tone="muted" labelledBy="faq-title">
          <Container className="grid gap-6 sm:gap-10 lg:grid-cols-[1fr_1.6fr] lg:gap-16 [&>*]:min-w-0">
            <div>
              <SectionHead id="faq-title" kicker="Perguntas frequentes" title="Antes de começar." />
              <p className="mt-4 text-steel-600">Não achou sua dúvida? Veja a página da <button type="button" onClick={() => go('workshop')} className="font-semibold text-brand-600 underline-offset-2 hover:underline">oficina</button> ou do <button type="button" onClick={() => go('mechanic')} className="font-semibold text-brand-600 underline-offset-2 hover:underline">mecânico</button>.</p>
            </div>
            <div className="divide-y divide-steel-200 border-y border-steel-200">
              {FAQ.map(f => <FaqItem key={f.q} q={f.q} a={f.a} />)}
            </div>
          </Container>
        </Section>

        {/* ── 14. CTA FINAL ── */}
        <section ref={finalRef} aria-labelledby="final-title" className="bg-steel-900 py-16 text-white sm:py-24 lg:py-32">
          <Container className="text-center">
            <h2 id="final-title" className="mx-auto max-w-3xl font-display text-[2rem] font-bold leading-[1.08] tracking-tight sm:text-5xl sm:leading-[1.05] lg:text-6xl">
              Na próxima vez que precisar, <span className="text-brand-400">você já sabe onde encontrar.</span>
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-base text-steel-300 sm:mt-6 sm:text-lg">Cadastro gratuito, sem mensalidade e sem fidelidade.</p>
            <div className="mx-auto mt-8 flex max-w-lg flex-col gap-3 sm:mt-10 sm:flex-row">
              <ButtonLink to={SIGNUP_WORKSHOP} arrow className="flex-1">Cadastrar minha oficina</ButtonLink>
              <ButtonLink to={SIGNUP_MECHANIC} variant="white" arrow className="flex-1">Quero ser mecânico</ButtonLink>
            </div>
          </Container>
        </section>
      </main>

      {/* ── 15. FOOTER ── */}
      <footer className="border-t border-steel-800 bg-steel-900 pb-10 pt-12 text-steel-300 sm:pt-14">
        <Container>
          <div className="grid grid-cols-2 gap-x-6 gap-y-10 lg:grid-cols-4">
            <div className="col-span-2 lg:col-span-1">
              <Logo light />
              <p className="mt-4 max-w-[240px] text-sm leading-relaxed">
                A ponte direta entre oficina e mecânico. Feito no Brasil, para o setor automotivo.
              </p>
            </div>
            <FooterCol title="Produto">
              <li><button type="button" onClick={() => go('workshop')} className="hover:text-white">Para Oficinas</button></li>
              <li><button type="button" onClick={() => go('mechanic')} className="hover:text-white">Para Mecânicos</button></li>
              <li><a href="#como-funciona" className="hover:text-white">Como funciona</a></li>
              <li><a href="#seguranca" className="hover:text-white">Segurança</a></li>
            </FooterCol>
            <FooterCol title="Ajuda">
              <li><a href="#faq" className="hover:text-white">Perguntas frequentes</a></li>
              <li><a href={`mailto:${PLATFORM_CONTACT_EMAIL}`} className="hover:text-white">Contato</a></li>
              <li><a href={`mailto:${PLATFORM_CONTACT_EMAIL}?subject=Suporte`} className="hover:text-white">Suporte</a></li>
              <li><Link to="/login" state={{ fresh: true }} className="hover:text-white">Entrar</Link></li>
            </FooterCol>
            <FooterCol title="Legal">
              <li><Link to="/termos" className="hover:text-white">Termos de uso</Link></li>
              <li><Link to="/privacidade" className="hover:text-white">Privacidade</Link></li>
            </FooterCol>
          </div>
          <div className="mt-10 flex flex-col gap-2 border-t border-steel-800 pt-6 text-xs text-steel-400 sm:mt-12 sm:flex-row sm:justify-between">
            <p>© {new Date().getFullYear()} MecânicoApp. Todos os direitos reservados.</p>
            <p>Telas do produto nesta página são ilustrativas.</p>
          </div>
        </Container>
      </footer>

      <MobileStickyCta visible={showSticky && !menuOpen && !gateIntent} />

      <FaqJsonLd />

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

/* ─── Auxiliares ─── */

/** "Cadastrar grátis" do header: abre a escolha de lado em vez de adivinhar. */
function SignupMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', close); };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} aria-haspopup="menu"
        className="inline-flex min-h-[44px] items-center gap-1 rounded-xl bg-brand-500 px-3.5 text-sm font-bold sm:min-h-[40px] sm:gap-1.5 sm:px-4 text-white shadow-sm transition hover:bg-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2">
        Cadastrar<span className="hidden sm:inline">&nbsp;grátis</span> <Icon name="chevron" size={16} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 mt-2 w-64 animate-slide-down overflow-hidden rounded-2xl border border-steel-100 bg-white p-1.5 shadow-xl">
          <Link role="menuitem" to={SIGNUP_WORKSHOP} className="block min-h-[56px] rounded-xl px-4 py-3 hover:bg-steel-50">
            <p className="font-bold text-steel-900">Sou oficina</p>
            <p className="text-xs text-steel-500">Encontrar profissionais</p>
          </Link>
          <Link role="menuitem" to={SIGNUP_MECHANIC} className="block min-h-[56px] rounded-xl px-4 py-3 hover:bg-steel-50">
            <p className="font-bold text-steel-900">Sou mecânico</p>
            <p className="text-xs text-steel-500">Encontrar serviços em oficinas</p>
          </Link>
        </div>
      )}
    </div>
  );
}

/** Barra fixa de conversão no celular (some no desktop, no menu e ao chegar no CTA final). */
function MobileStickyCta({ visible }: { visible: boolean }) {
  return (
    <div aria-hidden={!visible}
      className={`fixed inset-x-0 bottom-0 z-40 border-t border-steel-100 bg-white/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-8px_24px_rgba(11,17,23,0.08)] backdrop-blur-xl transition duration-300 motion-reduce:transition-none lg:hidden ${
        visible ? 'translate-y-0' : 'pointer-events-none translate-y-full'
      }`}>
      <div className="mx-auto flex max-w-md gap-2">
        <Link to={SIGNUP_WORKSHOP} tabIndex={visible ? 0 : -1}
          className="flex min-h-[48px] flex-[1.4] items-center justify-center rounded-xl bg-brand-500 px-3 text-[15px] font-bold text-white shadow-lg shadow-brand-500/25 active:scale-[0.98]">
          <span className="min-[420px]:hidden">Cadastrar oficina</span>
          <span className="hidden min-[420px]:inline">Cadastrar minha oficina</span>
        </Link>
        <Link to={SIGNUP_MECHANIC} tabIndex={visible ? 0 : -1}
          className="flex min-h-[48px] flex-1 items-center justify-center rounded-xl bg-steel-900 px-3 text-[15px] font-bold text-white active:scale-[0.98]">
          Sou mecânico
        </Link>
      </div>
    </div>
  );
}

function FaqItem({ q, a }: { q: string; a: string }) {
  return (
    <details className="group [&_summary::-webkit-details-marker]:hidden">
      <summary className="flex min-h-[60px] cursor-pointer list-none items-center justify-between gap-4 py-4 text-[17px] font-bold leading-snug text-steel-900 sm:py-5 sm:text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2">
        {q}
        <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white text-steel-500 ring-1 ring-steel-200 transition group-open:rotate-45 group-open:text-brand-600">
          <Icon name="plus" size={14} />
        </span>
      </summary>
      <p className="animate-slide-up pb-5 pr-2 leading-relaxed text-steel-600 sm:pr-12">{a}</p>
    </details>
  );
}

function FooterCol({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-widest text-white">{title}</p>
      <ul className="mt-4 space-y-2.5 text-sm">{children}</ul>
    </div>
  );
}

/** FAQ estruturado pro Google (rich result). */
function FaqJsonLd() {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQ.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
  };
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />;
}
