import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { Logo } from '@/components/Logo';
import { maskMoney, toNum } from '@/lib/investors';

/** Formulário público de interesse do investidor (link para enviar: /investir).
 *  Coleta só perfil e contato. CPF, RG e endereço ficam para a hora do contrato. */

type Form = {
  name: string; email: string; phone: string; city: string;
  investor_type: string; sector: string; experience: string[]; goal: string;
  amount_range: string; amount: string; instrument: string; horizon: string;
  contact_pref: string; message: string; risk_ack: boolean; consent: boolean; website: string;
};
const EMPTY: Form = {
  name: '', email: '', phone: '', city: '', investor_type: '', sector: '', experience: [], goal: '',
  amount_range: '', amount: '30.000', instrument: 'mutuo_conversivel', horizon: '', contact_pref: 'whatsapp', message: '',
  risk_ack: false, consent: false, website: '',
};

const STEPS = ['Você', 'Perfil', 'Investimento', 'Finalizar'];

const maskPhone = (v: string) => {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
};

export default function InvestorInterest() {
  const [step, setStep] = useState(0);
  const [f, setF] = useState<Form>(EMPTY);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const source = useMemo(() => new URLSearchParams(window.location.search).get('o') ?? '', []);
  // Valuation só chega aqui se o admin ligou o simulador
  const [round, setRound] = useState<Round | null>(null);
  useEffect(() => {
    supabase.rpc('investor_public_round').then(({ data }) => {
      if (data) setRound({ valuation: Number(data.valuation), cap_pct: Number(data.cap_pct), sold: Number(data.sold) });
    });
  }, []);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => { setF(p => ({ ...p, [k]: v })); setError(''); };
  const toggleExp = (v: string) => set('experience', f.experience.includes(v) ? f.experience.filter(x => x !== v) : [...f.experience, v]);

  function validate(s: number): string {
    if (s === 0) {
      if (f.name.trim().length < 3) return 'Informe seu nome completo.';
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email.trim())) return 'Informe um e-mail válido.';
      if (f.phone.replace(/\D/g, '').length < 10) return 'Informe seu WhatsApp com DDD.';
    }
    if (s === 1 && (!f.investor_type || !f.sector || !f.goal)) return 'Escolha uma opção em cada pergunta.';
    if (s === 2) {
      if (toNum(f.amount) < MIN) return 'O valor mínimo é R$ 20.000.';
      if (round && roundAvailable(round)! < MIN) return 'A primeira rodada está completa no momento.';
      if (round && toNum(f.amount) > roundAvailable(round)!) return `O máximo disponível agora é ${brlInt(roundAvailable(round)!)}.`;
    }
    if (s === 3) {
      if (!f.risk_ack) return 'Confirme que leu o aviso de riscos.';
      if (!f.consent) return 'Autorize o uso dos seus dados para podermos falar com você.';
    }
    return '';
  }
  const next = () => { const e = validate(step); if (e) return setError(e); setError(''); setStep(step + 1); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const back = () => { setError(''); setStep(step - 1); window.scrollTo({ top: 0, behavior: 'smooth' }); };

  async function submit() {
    const e = validate(3);
    if (e) return setError(e);
    setSending(true);
    const { error: err } = await supabase.rpc('investor_interest_submit', {
      p: { ...f, amount: String(toNum(f.amount)), amount_range: rangeOf(toNum(f.amount)), source },
    });
    setSending(false);
    if (err) return setError(err.message);
    setDone(true);
    window.scrollTo({ top: 0 });
  }

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-steel-900 text-white">
      <style>{`
        @keyframes invIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
        .inv-in{animation:invIn .35s ease both}
        @keyframes invRise{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}
        .inv-rise{animation:invRise .7s cubic-bezier(.2,.7,.2,1) both}
        @media (prefers-reduced-motion: reduce){.inv-in,.inv-rise{animation:none}}
      `}</style>

      {/* Fundo: brilho laranja, luz fria e uma grade bem discreta */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-[760px]"
          style={{ background: 'radial-gradient(55% 60% at 78% 8%, rgba(255,92,10,.22), transparent 70%), radial-gradient(45% 50% at 8% 0%, rgba(148,163,184,.12), transparent 70%)' }} />
        <div className="absolute inset-x-0 top-0 h-[760px] opacity-[.35]"
          style={{
            backgroundImage: 'linear-gradient(rgba(255,255,255,.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.05) 1px, transparent 1px)',
            backgroundSize: '56px 56px',
            maskImage: 'radial-gradient(70% 60% at 50% 0%, #000 30%, transparent 75%)',
            WebkitMaskImage: 'radial-gradient(70% 60% at 50% 0%, #000 30%, transparent 75%)',
          }} />
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-500/60 to-transparent" />
      </div>

      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-6 pb-20">
        <header className="flex items-center justify-between gap-3">
          <Logo light size={44} />
          <span className="text-[11px] uppercase tracking-[.2em] text-steel-400 text-right leading-tight">Tecnologia<br />que conecta</span>
        </header>

        <div className="mt-10 lg:mt-16 grid gap-10 lg:gap-x-16 lg:gap-y-12 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,.92fr)] lg:grid-rows-[auto_1fr] items-start">
          {/* Apresentação: celular primeiro; computador à esquerda, em cima */}
          <section className="order-1 lg:order-none lg:col-start-1 lg:row-start-1">
            <div className="inv-rise inline-flex items-center gap-2 rounded-full border border-brand-500/30 bg-brand-500/10 px-3.5 py-1.5 text-[11px] uppercase tracking-[.18em] text-brand-400 font-semibold">
              <span aria-hidden className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full rounded-full bg-brand-500 opacity-60 animate-ping" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-500" />
              </span>
              Primeira rodada · vagas limitadas
            </div>
            <h1 className="inv-rise font-display mt-5 text-[1.8rem] leading-[1.1] sm:text-[2.6rem] lg:text-[2.9rem] font-bold tracking-[-0.02em] text-balance"
              style={{ animationDelay: '.08s' }}>
              Entre no lançamento da plataforma que conecta{' '}
              <span className="bg-gradient-to-r from-brand-400 via-brand-500 to-pending-400 bg-clip-text text-transparent">oficinas e mecânicos</span>
            </h1>
            <p className="inv-rise mt-5 max-w-xl text-steel-300 text-base sm:text-[17px] leading-relaxed" style={{ animationDelay: '.16s' }}>
              Uma primeira rodada para um grupo pequeno de donos de oficina e pessoas do setor. Quem entra agora entra no
              começo, com as condições da largada, e acompanha o crescimento de perto.
            </p>

            {/* Métricas: uma faixa só, com divisórias finas */}
            <dl className="inv-rise mt-8 grid grid-cols-3 max-w-xl rounded-2xl border border-white/10 bg-white/[.03] backdrop-blur-sm divide-x divide-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,.06)]"
              style={{ animationDelay: '.24s' }}>
              {[['R$ 20 mil', 'aporte mínimo'], ['20%', 'teto do valuation'], ['100%', 'reinvestido']].map(([v, l]) => (
                <div key={l} className="px-3 sm:px-5 py-4">
                  <dd className="font-display text-xl sm:text-2xl font-bold tracking-tight text-white tabular-nums whitespace-nowrap">{v}</dd>
                  <dt className="mt-1 text-[11px] sm:text-xs uppercase tracking-[.12em] text-steel-400 leading-snug">{l}</dt>
                </div>
              ))}
            </dl>
          </section>

          {/* Formulário: celular logo depois do título; computador à direita, acompanha a rolagem */}
          <main className="inv-rise order-2 lg:order-none lg:col-start-2 lg:row-start-1 lg:row-span-2 lg:sticky lg:top-6"
            style={{ animationDelay: '.2s' }}>
            <div className="relative">
              <div aria-hidden className="absolute -inset-px rounded-[28px] bg-gradient-to-b from-brand-500/50 via-white/10 to-white/5" />
              <div className="relative overflow-hidden rounded-[27px] bg-white text-steel-900 shadow-[0_30px_80px_-20px_rgba(0,0,0,.6)]">
                {!done && (
                  <div className="relative bg-steel-900 px-5 sm:px-7 pt-5 pb-5 text-white border-b border-white/5">
                    <div aria-hidden className="absolute inset-0 opacity-90"
                      style={{ background: 'radial-gradient(80% 140% at 100% 0%, rgba(255,92,10,.28), transparent 60%)' }} />
                    <div className="relative flex items-start justify-between gap-3">
                      <div>
                        <div className="font-display text-lg sm:text-xl font-bold leading-tight">Garanta sua conversa</div>
                        <p className="mt-1 text-[13px] text-steel-300">Deixe seu contato e a nossa equipe fala com você.</p>
                      </div>
                      <span className="shrink-0 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-steel-200 tabular-nums">
                        {step + 1}/{STEPS.length}
                      </span>
                    </div>
                  </div>
                )}
                <div className="p-5 sm:p-7">
            {done ? <Done name={f.name} contact={f.contact_pref} /> : (
              <>
                {/* progresso */}
                <div className="flex items-center gap-2" role="progressbar" aria-valuemin={1} aria-valuemax={4} aria-valuenow={step + 1}>
                  {STEPS.map((s, i) => (
                    <div key={s} className="flex-1">
                      <div className={`h-1.5 rounded-full transition-colors ${i <= step ? 'bg-brand-500' : 'bg-steel-200'}`} />
                      <div className={`mt-1.5 text-[11px] ${i === step ? 'font-semibold text-steel-900' : 'text-steel-400'}`}>{s}</div>
                    </div>
                  ))}
                </div>
  
                <div key={step} className="inv-in mt-5 space-y-5">
                  {step === 0 && (
                    <>
                      <Heading title="Vamos nos conhecer" sub="Só o essencial para entrarmos em contato." />
                      <Field label="Nome completo"><input className="input" autoComplete="name" value={f.name} onChange={e => set('name', e.target.value)} /></Field>
                      <Field label="E-mail"><input className="input" type="email" autoComplete="email" inputMode="email" value={f.email} onChange={e => set('email', e.target.value)} /></Field>
                      <Field label="WhatsApp com DDD"><input className="input" autoComplete="tel" inputMode="tel" placeholder="(11) 90000-0000" value={f.phone} onChange={e => set('phone', maskPhone(e.target.value))} /></Field>
                      <Field label="Cidade (opcional)"><input className="input" autoComplete="address-level2" value={f.city} onChange={e => set('city', e.target.value)} /></Field>
                    </>
                  )}
  
                  {step === 1 && (
                    <>
                      <Heading title="Seu perfil" sub="Ajuda a gente a conversar do jeito certo com você." />
                      <Group label="Você investe como">
                        <Choice on={f.investor_type === 'pessoa_fisica'} onClick={() => set('investor_type', 'pessoa_fisica')} title="Pessoa física" />
                        <Choice on={f.investor_type === 'empresa'} onClick={() => set('investor_type', 'empresa')} title="Empresa" />
                      </Group>
                      <Group label="Qual é a sua ligação com o setor?" col>
                        <Choice on={f.sector === 'dono_oficina'} onClick={() => set('sector', 'dono_oficina')} title="Tenho uma oficina" />
                        <Choice on={f.sector === 'setor_automotivo'} onClick={() => set('sector', 'setor_automotivo')} title="Trabalho no setor automotivo" />
                        <Choice on={f.sector === 'outro_setor'} onClick={() => set('sector', 'outro_setor')} title="Atuo em outro setor" />
                      </Group>
                      <div>
                        <Label>Onde você já investiu? <span className="text-steel-400 font-normal">(pode marcar vários)</span></Label>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {['Nunca investi', 'Renda fixa', 'Bolsa de valores', 'Startups ou empresas', 'Imóveis', 'Outros'].map(x => (
                            <Chip key={x} on={f.experience.includes(x)} onClick={() => toggleExp(x)}>{x}</Chip>
                          ))}
                        </div>
                      </div>
                      <Group label="O que mais pesa para você?" col>
                        <Choice on={f.goal === 'retorno'} onClick={() => set('goal', 'retorno')} title="Retorno financeiro" />
                        <Choice on={f.goal === 'apoiar'} onClick={() => set('goal', 'apoiar')} title="Apoiar um negócio do meu setor" />
                        <Choice on={f.goal === 'ambos'} onClick={() => set('goal', 'ambos')} title="Os dois" />
                      </Group>
                    </>
                  )}
  
                  {step === 2 && (
                    <>
                      <Heading title="Seu investimento" sub="Uma ideia aproximada já basta. Nada aqui é compromisso." />
                      <Simulator amount={f.amount} onChange={v => set('amount', v)} round={round} />
                      <ContractInfo />
                      <div>
                        <Label>Por quanto tempo você se sente confortável com o dinheiro investido?</Label>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {[['12', 'Até 12 meses'], ['24', 'Até 24 meses'], ['36', 'Até 36 meses'], ['mais', 'Mais de 36 meses']].map(([k, l]) => (
                            <Chip key={k} on={f.horizon === k} onClick={() => set('horizon', f.horizon === k ? '' : k)}>{l}</Chip>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
  
                  {step === 3 && (
                    <>
                      <Heading title="Quase lá" sub="Como prefere que a gente fale com você, e alguma dúvida que queira adiantar." />
                      <div>
                        <Label>Melhor forma de contato</Label>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {[['whatsapp', 'WhatsApp'], ['email', 'E-mail'], ['ligacao', 'Ligação']].map(([k, l]) => (
                            <Chip key={k} on={f.contact_pref === k} onClick={() => set('contact_pref', k)}>{l}</Chip>
                          ))}
                        </div>
                      </div>
                      <Field label="Dúvidas ou comentários (opcional)">
                        <textarea className="input" rows={4} maxLength={1500} value={f.message} onChange={e => set('message', e.target.value)} />
                      </Field>
  
                      {/* campo-isca contra robôs: escondido de pessoas */}
                      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
                        <label>Site<input tabIndex={-1} autoComplete="off" value={f.website} onChange={e => set('website', e.target.value)} /></label>
                      </div>
  
                      <Check on={f.risk_ack} onChange={v => set('risk_ack', v)}>
                        Li e entendi o <b>aviso de riscos</b>: investir em empresa em fase inicial pode gerar perda do valor
                        investido, e nenhum retorno é garantido. Este formulário é só uma manifestação de interesse, não é oferta
                        nem compromisso.
                      </Check>
                      <Check on={f.consent} onChange={v => set('consent', v)}>
                        Autorizo o uso dos meus dados (nome, e-mail, WhatsApp e respostas deste formulário) apenas para a equipe
                        entrar em contato sobre esta oportunidade, conforme a LGPD. Posso pedir a exclusão a qualquer momento.
                      </Check>
                    </>
                  )}
  
                  {error && <p role="alert" className="rounded-xl bg-red-50 text-red-700 text-sm px-4 py-3">{error}</p>}
  
                  <div className="flex gap-3 pt-1">
                    {step > 0 && <button type="button" onClick={back} className="btn-ghost min-h-[52px] px-5">Voltar</button>}
                    {step < 3
                      ? <button type="button" onClick={next} className="btn-primary flex-1 min-h-[52px] text-base">Continuar</button>
                      : <button type="button" onClick={submit} disabled={sending} className="btn-primary flex-1 min-h-[52px] text-base">{sending ? 'Enviando…' : 'Enviar meu interesse'}</button>}
                  </div>
                  {step === 0 && <p className="text-center text-xs text-steel-500">Leva 2 minutos e não é compromisso.</p>}
                </div>
              </>
            )}
                </div>
                {!done && (
                  <div className="flex items-center gap-2.5 border-t border-steel-100 bg-steel-50 px-5 sm:px-7 py-3.5 text-xs text-steel-500">
                    <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-steel-400" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
                    </svg>
                    <span>Sem burocracia agora: CPF, RG e endereço só na hora do contrato.</span>
                  </div>
                )}
              </div>
            </div>
          </main>

          {/* Motivos: celular depois do formulário; computador à esquerda, embaixo da apresentação */}
          <section className="order-3 lg:order-none lg:col-start-1 lg:row-start-2">
            <div className="flex items-center gap-3">
              <h2 className="text-xs uppercase tracking-[.2em] text-steel-400 font-semibold whitespace-nowrap">Por que entrar agora</h2>
              <span aria-hidden className="h-px flex-1 bg-gradient-to-r from-white/15 to-transparent" />
            </div>
            <ul className="mt-5 grid gap-x-8 gap-y-6 sm:grid-cols-2">
              {REASONS.map(([icon, b, t]) => (
                <li key={b} className="flex gap-3.5">
                  <span aria-hidden className="grid place-items-center h-10 w-10 shrink-0 rounded-xl border border-brand-500/25 bg-brand-500/10 text-brand-400">
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{ICONS[icon]}</svg>
                  </span>
                  <div className="min-w-0">
                    <div className="font-semibold text-white text-[15px] leading-snug">{b}</div>
                    <p className="mt-1 text-sm text-steel-400 leading-relaxed">{t}</p>
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-10 flex items-center gap-2 text-xs text-steel-500 border-t border-white/5 pt-5">
              <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z" />
              </svg>
              Seus dados ficam só com a nossa equipe e não são compartilhados com outros investidores.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

/* ── Motivos (só conteúdo já existente, em formato curto) ─────────────── */
const ICONS: Record<string, ReactNode> = {
  flag: <><path d="M5 21V4" /><path d="M5 4h11l-2 4 2 4H5" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  growth: <><path d="M4 19h16" /><path d="M6 15l4-4 3 3 5-6" /><path d="M14 8h4v4" /></>,
  wrench: <path d="M14.7 6.3a4 4 0 0 0-5.4 5.2L4 16.8V20h3.2l5.3-5.3a4 4 0 0 0 5.2-5.4l-2.4 2.4-2.6-.6-.6-2.6z" />,
  chart: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M8 16v-4M12 16V8M16 16v-6" /></>,
  equal: <><path d="M5 9h14M5 15h14" /></>,
};
const REASONS: [string, string, string][] = [
  ['flag', 'Condições de lançamento', 'Primeira rodada com o valuation da largada. Próximas rodadas, se houver, terão novas condições.'],
  ['clock', 'Vagas limitadas', 'A rodada vai até 20% do valuation. Quando completar, fecha.'],
  ['growth', '100% reinvestido', 'Plataforma, divulgação e expansão, com uma pequena parte em fundo de reserva.'],
  ['wrench', 'Você conhece o problema', 'Sabe como é difícil achar um mecânico bom na hora. Aqui você investe na solução.'],
  ['chart', 'Tudo às claras', 'Painel próprio com receitas, custos, resultado do mês e expansão por região.'],
  ['equal', 'Mesmas condições para todos', 'Aporte a partir de R$ 20 mil, pelo contrato de mútuo conversível.'],
];

/* ── Peças ────────────────────────────────────────────────────────────── */
const Label = ({ children }: { children: ReactNode }) => <div className="text-sm font-semibold text-steel-800">{children}</div>;
const Heading = ({ title, sub }: { title: string; sub: string }) => (
  <div><h2 className="text-xl font-bold">{title}</h2><p className="text-sm text-steel-500 mt-0.5">{sub}</p></div>
);
const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <label className="block"><span className="text-sm font-semibold text-steel-800">{label}</span><div className="mt-1.5">{children}</div></label>
);
const Group = ({ label, children, col }: { label: string; children: ReactNode; col?: boolean }) => (
  <div><Label>{label}</Label><div className={`mt-2 grid gap-2 ${col ? '' : 'grid-cols-2'}`}>{children}</div></div>
);
const Choice = ({ on, onClick, title, sub }: { on: boolean; onClick: () => void; title: string; sub?: string }) => (
  <button type="button" onClick={onClick} aria-pressed={on}
    className={`text-left rounded-2xl border-2 px-4 py-3 min-h-[52px] transition-all active:scale-[.99] ${on
      ? 'border-brand-500 bg-brand-500/10 shadow-sm' : 'border-steel-200 bg-white hover:border-steel-300'}`}>
    <div className="flex items-center gap-3">
      <span aria-hidden className={`grid place-items-center h-5 w-5 shrink-0 rounded-full border-2 ${on ? 'border-brand-500 bg-brand-500' : 'border-steel-300'}`}>
        {on && <span className="h-2 w-2 rounded-full bg-white" />}
      </span>
      <span><span className="block font-semibold text-[15px]">{title}</span>{sub && <span className="block text-xs text-steel-500 mt-0.5">{sub}</span>}</span>
    </div>
  </button>
);
const Chip = ({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) => (
  <button type="button" onClick={onClick} aria-pressed={on}
    className={`min-h-[44px] px-4 rounded-full text-sm font-semibold border-2 transition-colors ${on
      ? 'border-steel-900 bg-steel-900 text-white' : 'border-steel-200 bg-white text-steel-700'}`}>{children}</button>
);
const Check = ({ on, onChange, children }: { on: boolean; onChange: (v: boolean) => void; children: ReactNode }) => (
  <label className="flex gap-3 items-start text-sm text-steel-600 leading-relaxed cursor-pointer">
    <input type="checkbox" className="mt-1 h-5 w-5 shrink-0 accent-[#ff5c0a]" checked={on} onChange={e => onChange(e.target.checked)} />
    <span>{children}</span>
  </label>
);

const rangeOf = (n: number) => (n >= 20000 && n < 25000 ? '20_25' : n >= 25000 && n < 30000 ? '25_30' : n >= 30000 && n <= 40000 ? '30_40' : 'outro');
const MIN = 20000, STEP = 1000;
const pct = (n: number, v: number) => (n / v) * 100;
const pctText = (p: number) => `${p.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;
const brlInt = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
type Round = { valuation: number; cap_pct: number; sold: number };

/** Quanto ainda cabe na primeira rodada (teto = % do valuation, menos o que já foi reservado) */
const roundAvailable = (r: Round | null) => (r ? Math.max(0, Math.floor((r.valuation * r.cap_pct) / 100 - r.sold)) : null);

/** Simulador: o investidor aumenta ou diminui o valor (mínimo R$ 20 mil, máximo o que ainda está disponível)
 *  e vê a participação estimada e quanto da primeira rodada o valor ocupa. */
function Simulator({ amount, onChange, round }: { amount: string; onChange: (v: string) => void; round: Round | null }) {
  const n = toNum(amount);
  const avail = roundAvailable(round);
  const full = avail !== null && avail < MIN;
  const MAX = avail !== null ? Math.max(avail, MIN) : Infinity;
  const clamped = Math.min(MAX, Math.max(MIN, n || MIN));
  const fmt = (x: number) => x.toLocaleString('pt-BR');
  const bump = (d: number) => onChange(fmt(Math.min(MAX, Math.max(MIN, (n || MIN) + d))));
  const valuation = round?.valuation ?? null;
  const part = valuation && n > 0 ? pct(n, valuation) : null;
  const fill = MAX > MIN ? ((clamped - MIN) / (MAX - MIN)) * 100 : 100;
  const capAmount = round ? (round.valuation * round.cap_pct) / 100 : 0;
  const soldPct = round ? pct(round.sold, round.valuation) : 0;
  const availPct = round ? Math.max(0, round.cap_pct - soldPct) : 0;
  const tooHigh = avail !== null && n > avail;
  const tooLow = n > 0 && n < MIN;

  return (
    <div className="space-y-4">
      {round && (
        <div className="rounded-2xl bg-steel-900 text-white p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs uppercase tracking-[.14em] text-steel-300">Primeira rodada</div>
            <span className={`text-[11px] rounded-full px-2.5 py-1 font-semibold ${full ? 'bg-white/10 text-steel-200' : 'bg-brand-500 text-white'}`}>
              {full ? 'Completa' : 'Vagas abertas'}
            </span>
          </div>
          <p className="mt-2 text-sm text-steel-200">
            Esta fase capta recursos para escalar o negócio e reúne os primeiros investidores, com as mesmas condições para todos.
            O teto é de <b>{pctText(round.cap_pct)}</b> do valuation.
          </p>
          <div className="mt-3 h-3 rounded-full bg-white/10 overflow-hidden">
            <div className="h-full rounded-full bg-brand-500 transition-all duration-700"
              style={{ width: `${capAmount ? Math.min(100, (round.sold / capAmount) * 100) : 0}%` }} />
          </div>
          <div className="mt-2 flex justify-between text-xs text-steel-300">
            <span>{pctText(soldPct)} já reservado</span>
            <span>{full ? 'sem vagas no momento' : `${pctText(availPct)} disponível (até ${brlInt(avail ?? 0)})`}</span>
          </div>
        </div>
      )}

      {full ? (
        <p className="rounded-2xl border border-steel-200 bg-steel-50 p-4 text-sm text-steel-600">
          A primeira rodada está completa. Você ainda pode deixar seu contato: avisamos se abrirmos uma nova fase.
        </p>
      ) : (
        <div className="rounded-2xl border border-steel-200 bg-steel-50 p-4">
          <Label>Quanto você pensa em investir?</Label>
          <div className="mt-3 flex items-center justify-between gap-2">
            <button type="button" aria-label="Diminuir R$ 1.000" onClick={() => bump(-STEP)}
              className="h-12 w-12 shrink-0 rounded-full border-2 border-steel-300 bg-white text-2xl font-semibold active:scale-95">−</button>
            <div className="text-center min-w-0">
              <div className="text-3xl sm:text-4xl font-bold tabular-nums tracking-tight">R$ {n ? fmt(n) : '0'}</div>
            </div>
            <button type="button" aria-label="Aumentar R$ 1.000" onClick={() => bump(STEP)}
              className="h-12 w-12 shrink-0 rounded-full border-2 border-steel-300 bg-white text-2xl font-semibold active:scale-95">+</button>
          </div>

          {avail !== null ? (
            <>
              <input type="range" aria-label="Valor do investimento" min={MIN} max={MAX} step={STEP} value={clamped}
            onChange={e => onChange(fmt(Number(e.target.value)))}
            className="mt-4 w-full h-2 appearance-none rounded-full cursor-pointer accent-[#ff5c0a]"
            style={{ background: `linear-gradient(90deg,#ff5c0a ${fill}%,#e2e8f0 ${fill}%)` }} />
          <div className="mt-1 flex justify-between text-[11px] text-steel-500">
            <span>mínimo {brlInt(MIN)}</span><span>máximo disponível {brlInt(MAX)}</span>
          </div>
            </>
          ) : (
            <p className="mt-2 text-center text-[11px] text-steel-500">mínimo {brlInt(MIN)}</p>
          )}

          <label className="mt-3 block"><span className="text-xs text-steel-500">Ou digite outro valor (R$)</span>
            <input className="input mt-1" inputMode="decimal" value={amount} onChange={e => onChange(maskMoney(e.target.value))} /></label>
          {tooLow && <p role="alert" className="mt-2 text-xs text-red-600">O valor mínimo é {brlInt(MIN)}.</p>}
          {tooHigh && <p role="alert" className="mt-2 text-xs text-red-600">O máximo disponível agora é {brlInt(avail ?? 0)}.</p>}

          {valuation ? (
            <div className="mt-4 rounded-2xl bg-steel-900 text-white p-4">
              <div className="text-xs uppercase tracking-[.14em] text-steel-300">Sua fatia estimada da empresa</div>
              <div className="mt-1 text-4xl font-bold tabular-nums">{part === null ? '—' : pctText(part)}</div>
              <div className="mt-1 text-xs text-steel-300">R$ {n ? fmt(n) : '0'} sobre um valuation de R$ {valuation.toLocaleString('pt-BR')}</div>
              {capAmount > 0 && n > 0 && (
                <div className="mt-2 text-xs text-steel-200">
                  Esse valor ocupa <b>{pctText(Math.min(100, (n / capAmount) * 100))}</b> da primeira rodada.
                </div>
              )}
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                {[MIN, 30000, ...(avail !== null ? [MAX] : [40000])].filter((v, i, a) => v <= MAX && a.indexOf(v) === i).map(v => (
                  <button key={v} type="button" onClick={() => onChange(fmt(v))}
                    className={`rounded-xl px-2 py-2 text-xs ${n === v ? 'bg-brand-500 text-white' : 'bg-white/10 text-steel-200'}`}>
                    <div className="font-semibold">{brlInt(v)}</div><div>{pctText(pct(v, valuation))}</div>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <p className="mt-4 text-xs text-steel-500">Na conversa, mostramos quanto o seu valor representaria de participação.</p>
          )}
          <p className="mt-3 text-[11px] text-steel-500 leading-relaxed">
            Simulação informativa: é a participação que o valor teria <b>se for convertido</b>, na conta simples valor ÷ valuation.
            Não considera teto, desconto nem rodadas futuras, e não é promessa nem compromisso. O que vale é o contrato.
            Enquanto não houver conversão, você é credor da empresa, não sócio.
          </p>
        </div>
      )}
    </div>
  );
}

/** O contrato proposto é um só: mútuo conversível. Explicado em linguagem simples. */
function ContractInfo() {
  return (
    <div className="rounded-2xl border-2 border-brand-500/40 bg-brand-500/5 p-4">
      <div className="text-xs uppercase tracking-[.14em] text-brand-600 font-semibold">Tipo de contrato</div>
      <h3 className="mt-1 text-lg font-bold">Mútuo conversível</h3>
      <p className="mt-1 text-sm text-steel-600">
        Você empresta o valor para a empresa, e esse valor pode virar participação mais adiante, nas condições combinadas.
      </p>
      <details className="mt-2 group">
        <summary className="cursor-pointer text-sm font-semibold text-brand-600 min-h-[44px] flex items-center">Como funciona?</summary>
        <ol className="mt-1 space-y-2 text-sm text-steel-600 list-decimal pl-5">
          <li>Você entrega o valor à empresa, como um <b>empréstimo</b> (mútuo).</li>
          <li>Num momento combinado em contrato, como uma nova rodada de investimento ou uma data, o valor pode ser <b>convertido em participação</b>. As condições (valuation de referência, desconto, teto) ficam escritas antes.</li>
          <li>Se não houver conversão, o valor é <b>devolvido</b> nas condições do contrato.</li>
          <li>Enquanto não converter, você <b>não é sócio</b> e não administra a empresa.</li>
        </ol>
        <p className="mt-2 text-xs text-steel-500">Os detalhes finais ficam no contrato, revisado por advogado. Explicamos tudo na conversa.</p>
      </details>
    </div>
  );
}

function Done({ name, contact }: { name: string; contact: string }) {
  const how = contact === 'email' ? 'por e-mail' : contact === 'ligacao' ? 'por ligação' : 'pelo WhatsApp';
  return (
    <div className="inv-in text-center py-6">
      <div aria-hidden className="mx-auto grid place-items-center h-16 w-16 rounded-full bg-green-500/15 text-3xl">✓</div>
      <h2 className="mt-4 text-2xl font-bold">{name.trim().split(' ')[0]}, seu interesse na primeira rodada está registrado!</h2>
      <p className="mt-2 text-steel-600">
        Você está entre os primeiros a conversar com a gente. Nossa equipe vai falar com você {how} para apresentar a
        oportunidade e responder suas dúvidas.
      </p>
      <div className="mt-6 text-left rounded-2xl bg-steel-50 p-4 text-sm text-steel-600 space-y-2">
        <div className="font-semibold text-steel-800">O que acontece agora</div>
        <p>1. Conversamos e explicamos as condições e os riscos.</p>
        <p>2. Se fizer sentido para os dois lados, preparamos o contrato.</p>
        <p>3. Só nessa etapa pedimos seus dados pessoais completos (CPF, RG e endereço).</p>
      </div>
    </div>
  );
}
