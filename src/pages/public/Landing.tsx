import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Logo } from '@/components/Logo';

type Persona = 'mechanic' | 'workshop';

export default function Landing() {
  const [persona, setPersona] = useState<Persona>('mechanic');

  return (
    <div className="min-h-screen bg-steel-50 text-steel-800">
      {/* NAV */}
      <header className="border-b border-steel-200/70 backdrop-blur bg-white/80 sticky top-0 z-30">
        <div className="section flex h-16 items-center justify-between">
          <Logo />
          <nav className="flex items-center gap-2">
            <Link to="/login" className="btn-ghost">Entrar</Link>
            <Link to="/cadastro/oficina" className="btn-primary hidden sm:inline-flex">Cadastrar oficina</Link>
          </nav>
        </div>
      </header>

      {/* HERO */}
      <section className="section pt-14 pb-20 lg:pt-24 lg:pb-28">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <div className="inline-flex gap-1 p-1 rounded-full bg-steel-100 mb-6 text-sm font-semibold">
              <button
                onClick={() => setPersona('mechanic')}
                className={`px-4 py-1.5 rounded-full transition ${persona === 'mechanic' ? 'bg-steel-900 text-white' : 'text-steel-500'}`}
              >Sou Mecânico</button>
              <button
                onClick={() => setPersona('workshop')}
                className={`px-4 py-1.5 rounded-full transition ${persona === 'workshop' ? 'bg-brand-500 text-white' : 'text-steel-500'}`}
              >Sou Oficina</button>
            </div>

            {persona === 'mechanic' ? (
              <>
                <h1 className="text-4xl lg:text-6xl font-bold leading-[1.05] tracking-tight">
                  Seu talento merece <span className="text-brand-500">oportunidade.</span>
                </h1>
                <p className="mt-5 text-lg text-steel-600 max-w-xl">
                  Receba serviços de oficinas verificadas, com pagamento garantido por escrow e
                  recebimento via PIX em até 24h após o serviço aprovado. Você fica com 85%, sempre.
                </p>
                <div className="mt-8 flex flex-wrap gap-3">
                  <Link to="/cadastro/mecanico" className="btn-primary btn-lg">Quero ser mecânico parceiro</Link>
                  <Link to="/login" className="btn-ghost btn-lg">Já sou cadastrado</Link>
                </div>
              </>
            ) : (
              <>
                <h1 className="text-4xl lg:text-6xl font-bold leading-[1.05] tracking-tight">
                  Mecânicos qualificados, <span className="text-brand-500">na hora que você precisar.</span>
                </h1>
                <p className="mt-5 text-lg text-steel-600 max-w-xl">
                  Encontre profissionais autônomos verificados, acompanhe a chegada em tempo real
                  e pague com segurança. <strong>Para oficinas é sempre 100% gratuito.</strong>
                </p>
                <div className="mt-8 flex flex-wrap gap-3">
                  <Link to="/cadastro/oficina" className="btn-primary btn-lg">Cadastrar minha oficina</Link>
                  <Link to="/login" className="btn-ghost btn-lg">Já sou cadastrado</Link>
                </div>
              </>
            )}

            <div className="mt-10 flex gap-8 text-sm text-steel-500">
              <Stat n="85%" l="Repasse ao mecânico" />
              <Stat n="< 24h" l="Liberação do PIX" />
              <Stat n="100%" l="Gratuito p/ oficinas" />
            </div>
          </div>

          {/* Hero Visual */}
          <div className="relative">
            <div className="aspect-[4/5] rounded-3xl bg-gradient-to-br from-steel-900 to-steel-700 p-8 shadow-2xl relative overflow-hidden">
              <div className="absolute -top-20 -right-20 w-72 h-72 rounded-full bg-brand-500/30 blur-3xl" />
              <div className="absolute bottom-10 -left-10 w-60 h-60 rounded-full bg-brand-500/20 blur-3xl" />
              <div className="relative h-full flex flex-col justify-end gap-4">
                <div className="bg-white/10 backdrop-blur-md rounded-2xl p-5 border border-white/10">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-brand-500 grid place-items-center text-white font-bold">JS</div>
                    <div className="flex-1">
                      <div className="text-white font-semibold">João Silva</div>
                      <div className="text-steel-300 text-xs">★ 4.9 · 248 jobs · 8 km</div>
                    </div>
                    <span className="badge bg-signal-500/20 text-signal-500">Disponível</span>
                  </div>
                </div>
                <div className="bg-brand-500 text-white rounded-2xl p-5 shadow-brand">
                  <div className="text-xs uppercase tracking-wider opacity-80">A caminho · ETA</div>
                  <div className="text-4xl font-bold font-display">12 min</div>
                  <div className="text-sm opacity-90 mt-1">Mecânico João Silva está chegando</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* COMO FUNCIONA */}
      <section className="bg-white border-y border-steel-200">
        <div className="section py-20">
          <div className="text-center mb-14">
            <span className="badge-brand">Como funciona</span>
            <h2 className="mt-3 text-3xl lg:text-5xl font-bold tracking-tight">Três passos. Zero burocracia.</h2>
          </div>
          <div className="grid md:grid-cols-2 gap-10">
            <Steps
              title="Para Oficinas"
              accent="brand"
              steps={[
                ['Cadastre a oficina', 'Validamos seu CNPJ. Sempre gratuito.'],
                ['Encontre o mecânico', 'Filtre por especialidade, avaliação e distância.'],
                ['Acompanhe ao vivo', 'Veja o mecânico chegando em tempo real e libere o pagamento.'],
              ]}
            />
            <Steps
              title="Para Mecânicos"
              accent="steel"
              steps={[
                ['Crie seu perfil', 'CPF, especialidades, valor por hora — leva 3 minutos.'],
                ['Aceite jobs próximos', 'Receba pedidos de oficinas verificadas no seu raio.'],
                ['Receba via PIX', 'Pagamento garantido em até 24h após o serviço aprovado.'],
              ]}
            />
          </div>
        </div>
      </section>

      {/* DIFERENCIAIS */}
      <section className="section py-20">
        <div className="text-center mb-14">
          <span className="badge-brand">Por que MecânicoApp</span>
          <h2 className="mt-3 text-3xl lg:text-5xl font-bold tracking-tight">B2B verificado, não bagunça.</h2>
          <p className="mt-3 text-steel-500 max-w-2xl mx-auto">Nascemos para resolver o problema real das oficinas brasileiras: encontrar mão-de-obra qualificada com confiança.</p>
        </div>
        <div className="grid md:grid-cols-3 gap-5">
          <Diff icon="🛡️" title="Escrow nativo" desc="Oficina paga, plataforma segura, mecânico recebe só após aprovação. Zero calote." />
          <Diff icon="📍" title="Tracking ao vivo" desc="Veja o mecânico se aproximando no mapa, com ETA dinâmico. Sem mais 'tô chegando'." />
          <Diff icon="✅" title="100% verificado" desc="CNPJ da oficina, CPF do mecânico, especialidades validadas. Profissionais de verdade." />
          <Diff icon="💰" title="Sem mensalidade" desc="Oficina nunca paga nada. Mecânico só paga 15% quando o job é concluído." />
          <Diff icon="⚡" title="PIX em 24h" desc="Pagamento liberado para o mecânico em até 24 horas após confirmação do serviço." />
          <Diff icon="🇧🇷" title="Feito no Brasil" desc="Construído pensando na realidade da oficina brasileira, não copiado de gringo." />
        </div>
      </section>

      {/* CTA FINAL */}
      <section className="section pb-20">
        <div className="rounded-3xl bg-gradient-to-br from-steel-900 to-steel-800 p-10 lg:p-16 text-white relative overflow-hidden">
          <div className="absolute -top-32 -right-20 w-96 h-96 rounded-full bg-brand-500/30 blur-3xl" />
          <div className="relative grid lg:grid-cols-2 gap-8 items-center">
            <div>
              <h2 className="text-3xl lg:text-5xl font-bold tracking-tight">Sua oficina parada custa caro.</h2>
              <p className="mt-3 text-steel-300 max-w-lg">Cadastre-se em 2 minutos. Sem cartão. Sem fidelidade. Sem pegadinha.</p>
            </div>
            <div className="flex flex-wrap gap-3 lg:justify-end">
              <Link to="/cadastro/oficina" className="btn-primary btn-lg">Cadastrar oficina</Link>
              <Link to="/cadastro/mecanico" className="btn-secondary btn-lg">Sou mecânico</Link>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-steel-200">
        <div className="section py-8 flex flex-wrap gap-4 justify-between items-center text-sm text-steel-500">
          <Logo size={24} />
          <div>© {new Date().getFullYear()} MecânicoApp · Marketplace B2B brasileiro</div>
        </div>
      </footer>
    </div>
  );
}

function Stat({ n, l }: { n: string; l: string }) {
  return (
    <div>
      <div className="text-2xl font-bold text-steel-900 font-display">{n}</div>
      <div className="text-xs uppercase tracking-wider">{l}</div>
    </div>
  );
}

function Steps({ title, steps, accent }: { title: string; steps: [string, string][]; accent: 'brand' | 'steel' }) {
  return (
    <div className="card">
      <h3 className="text-2xl font-bold mb-6">{title}</h3>
      <ol className="space-y-5">
        {steps.map(([t, d], i) => (
          <li key={t} className="flex gap-4">
            <span className={`shrink-0 h-9 w-9 rounded-full grid place-items-center font-bold text-white ${accent === 'brand' ? 'bg-brand-500' : 'bg-steel-800'}`}>{i + 1}</span>
            <div>
              <div className="font-semibold">{t}</div>
              <div className="text-steel-500 text-sm mt-0.5">{d}</div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Diff({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div className="card hover:shadow-brand transition-shadow">
      <div className="text-3xl">{icon}</div>
      <div className="mt-3 font-bold">{title}</div>
      <div className="mt-1 text-sm text-steel-500">{desc}</div>
    </div>
  );
}
