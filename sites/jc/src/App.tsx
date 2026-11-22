import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { GRUPO, LOJAS, PACOTES, SERVICOS, SERVICOS_FORM, msgLoja, track, wa, type Loja } from './config';
import { Icon } from './icons';

/* =====================================================================
   Site das duas lojas: Jota Car (nº 9000) + JC Pneus (nº 10003)
   Estrutura: topo com escolha da loja · números · serviços · agendamento ·
   avaliações · unidades com mapa · dúvidas · rodapé
   ===================================================================== */

const Eyebrow = ({ children, dark = true }: { children: ReactNode; dark?: boolean }) => (
  <p className={`inline-flex items-center gap-2 text-[13px] font-bold uppercase tracking-[0.14em] ${dark ? 'text-gold' : 'text-[#8A6A00]'}`}>
    <span className="h-[2px] w-6 rounded bg-gold" />{children}
  </p>
);

function Stars({ nota }: { nota: string }) {
  const n = Math.round(parseFloat(nota.replace(',', '.')));
  return (
    <span className="inline-flex text-gold" aria-label={`${nota} de 5 estrelas`}>
      {[0, 1, 2, 3, 4].map((i) => <Icon.star key={i} className={`h-4 w-4 ${i < n ? '' : 'opacity-25'}`} />)}
    </span>
  );
}

/** Botão de WhatsApp de uma loja */
function WaButton({ loja, msg, id, children, variant = 'gold', className = '' }: { loja: Loja; msg: string; id: string; children: ReactNode; variant?: 'gold' | 'dark' | 'outline'; className?: string }) {
  const href = wa(loja.whatsapp, msg);
  const v = {
    gold: 'bg-gold text-ink hover:bg-gold-2 shadow-[0_10px_30px_-12px_rgba(255,193,7,.7)]',
    dark: 'bg-ink text-white hover:bg-panel',
    outline: 'text-white ring-1 ring-inset ring-white/25 hover:ring-white/60',
  }[variant];
  return (
    <a href={href} target="_blank" rel="noopener" onClick={() => track(id, href)}
      className={`inline-flex min-h-[52px] items-center justify-center gap-2 rounded-xl px-6 text-[16px] font-bold transition-all duration-200 active:scale-[0.98] ${v} ${className}`}>
      <Icon.wa />{children}
    </a>
  );
}

/* ---------------------------------------------------------------------
   Cabeçalho
   --------------------------------------------------------------------- */
const LINKS = [
  { href: '#pacotes', label: 'Pacotes' },
  { href: '#servicos', label: 'Serviços' },
  { href: '#agendar', label: 'Agendar' },
  { href: '#avaliacoes', label: 'Avaliações' },
  { href: '#unidades', label: 'Unidades' },
];

function Header() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', k);
    document.body.style.overflow = open ? 'hidden' : '';
    return () => document.removeEventListener('keydown', k);
  }, [open]);

  return (
    <>
      {/* faixa de contato das duas lojas */}
      <div className="hidden border-b border-line bg-black text-[13px] text-slate md:block">
        <div className="mx-auto flex h-9 max-w-[1200px] items-center justify-between px-6">
          <span>Duas lojas na Estrada do M'Boi Mirim · Zona Sul de São Paulo</span>
          <span className="flex gap-6">
            {LOJAS.map((l) => (
              <a key={l.id} href={`tel:+${l.whatsapp}`} onClick={() => track(`tel_topo_${l.id}`, 'tel:')} className="hover:text-white">
                <strong className="text-white">{l.apelido}:</strong> {l.telefone}
              </a>
            ))}
          </span>
        </div>
      </div>

      <header className="sticky top-0 z-50 border-b border-line bg-ink/95 backdrop-blur">
        <div className="mx-auto flex h-[72px] max-w-[1200px] items-center justify-between gap-4 px-6">
          <a href="#topo" className="flex items-center gap-3" aria-label="Jota Car e JC Pneus, voltar ao topo">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-gold font-display text-[17px] font-extrabold text-ink">JC</span>
            <span className="leading-tight">
              <span className="block font-display text-[16px] font-extrabold tracking-tight">Jota Car <span className="text-gold">+</span> JC Pneus</span>
              <span className="block text-[11px] font-semibold uppercase tracking-[0.16em] text-slate">Centro automotivo</span>
            </span>
          </a>
          <nav className="hidden items-center gap-1 lg:flex" aria-label="Seções">
            {LINKS.map((l) => (
              <a key={l.href} href={l.href} className="rounded-lg px-4 py-2 text-[15px] font-medium text-white/80 transition-colors hover:bg-white/5 hover:text-white">{l.label}</a>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <a href="#agendar" className="hidden min-h-[44px] items-center rounded-xl bg-gold px-5 text-[15px] font-bold text-ink transition-colors hover:bg-gold-2 sm:inline-flex">Agendar revisão</a>
            <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-controls="menu-cel" aria-label={open ? 'Fechar menu' : 'Abrir menu'}
              className="grid h-11 w-11 place-items-center rounded-xl ring-1 ring-line lg:hidden">
              <span className="relative block h-3 w-[18px]">
                <span className={`absolute left-0 block h-[2px] w-full bg-white transition-transform duration-300 ${open ? 'top-[5px] rotate-45' : 'top-0'}`} />
                <span className={`absolute left-0 block h-[2px] w-full bg-white transition-transform duration-300 ${open ? 'top-[5px] -rotate-45' : 'top-[10px]'}`} />
              </span>
            </button>
          </div>
        </div>
      </header>

      {/* menu do celular (fora do header: o backdrop-blur prenderia o fixed) */}
      <div id="menu-cel" className={`fixed inset-x-0 bottom-0 top-[72px] z-40 bg-ink transition-opacity duration-300 lg:hidden ${open ? 'visible opacity-100' : 'invisible opacity-0'}`}>
        <nav className="flex flex-col px-6 pt-6" aria-label="Seções">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} onClick={() => setOpen(false)} className="border-b border-line py-4 font-display text-[24px] font-bold">{l.label}</a>
          ))}
        </nav>
      </div>
    </>
  );
}

/* ---------------------------------------------------------------------
   Topo: proposta + escolha da loja (o coração do padrão)
   --------------------------------------------------------------------- */
function Hero() {
  return (
    <section id="topo" className="relative overflow-hidden" aria-labelledby="hero-title">
      <img src="/sites/jc/fotos/hero.webp" srcSet="/sites/jc/fotos/hero-900.webp 900w, /sites/jc/fotos/hero.webp 1672w" sizes="100vw"
        alt="" width={1672} height={941} {...{ fetchpriority: "high" }} className="absolute inset-0 -z-10 h-full w-full object-cover object-[50%_25%] opacity-30" />
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-ink/70 via-ink/90 to-ink" />
      <span className="absolute right-4 top-4 z-10 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-semibold text-white/80">Imagem ilustrativa</span>

      <div className="mx-auto grid max-w-[1200px] gap-12 px-6 pb-20 pt-14 lg:grid-cols-[1.1fr_.9fr] lg:items-center lg:pb-28 lg:pt-20">
        <div>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-gold/15 px-3 py-1.5 text-[12px] font-bold uppercase tracking-wide text-gold ring-1 ring-gold/30">{GRUPO.anos} anos de mercado</span>
            <span className="rounded-full bg-white/5 px-3 py-1.5 text-[12px] font-bold uppercase tracking-wide text-white/80 ring-1 ring-white/10">2 lojas na M'Boi Mirim</span>
          </div>
          <h1 id="hero-title" className="mt-6 text-[38px] font-extrabold leading-[1.05] tracking-tight sm:text-[52px] lg:text-[60px]">
            Mecânica, pneus e alinhamento <span className="text-gold">com quem conhece o seu carro.</span>
          </h1>
          <p className="mt-5 max-w-[560px] text-[18px] leading-relaxed text-slate">
            Duas lojas na Estrada do M'Boi Mirim, Zona Sul de São Paulo. Diagnóstico com scanner, orçamento explicado antes do serviço e atendimento de quem está no bairro há {GRUPO.anos} anos.
          </p>
          <ul className="mt-7 space-y-3 text-[16px]">
            {['Orçamento explicado antes de qualquer serviço', 'Diagnóstico computadorizado com scanner', 'Parcelamento em até 10x sem juros'].map((t) => (
              <li key={t} className="flex items-center gap-3"><span className="grid h-6 w-6 place-items-center rounded-full bg-gold/15 text-gold"><Icon.check /></span>{t}</li>
            ))}
          </ul>
        </div>

        {/* escolha da loja */}
        <div className="rounded-3xl bg-panel/90 p-6 ring-1 ring-line backdrop-blur sm:p-8">
          <div className="flex items-center justify-between gap-3">
            <p className="font-display text-[20px] font-bold">Fale direto no WhatsApp</p>
            <span className="inline-flex items-center gap-2 text-[12px] font-bold uppercase tracking-wide text-[#3DDC84]"><span className="h-2 w-2 animate-pulse rounded-full bg-[#3DDC84]" />Atendimento</span>
          </div>
          <p className="mt-2 text-[15px] text-slate">Escolha a loja mais perto de você:</p>
          <div className="mt-5 space-y-3">
            {LOJAS.map((l) => (
              <div key={l.id} className="rounded-2xl bg-ink p-4 ring-1 ring-line">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[12px] font-bold uppercase tracking-wide text-gold">Nº {l.numero}</p>
                    <p className="font-display text-[18px] font-bold">{l.apelido}</p>
                    <p className="mt-0.5 text-[14px] text-slate">{l.endereco}</p>
                  </div>
                  <span className="flex shrink-0 items-center gap-1 text-[13px] font-semibold"><Icon.star className="h-4 w-4 text-gold" />{l.google.nota}</span>
                </div>
                <WaButton loja={l} msg={msgLoja(l)} id={`wa_topo_${l.id}`} className="mt-4 w-full">Chamar a {l.apelido}</WaButton>
              </div>
            ))}
          </div>
          <a href="#agendar" className="mt-5 flex items-center justify-center gap-2 text-[15px] font-semibold text-white/80 hover:text-white">Ou monte o pedido de agendamento <Icon.arrow /></a>
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------------
   Faixa de números (só fatos verdadeiros)
   --------------------------------------------------------------------- */
function Numeros() {
  const itens = [
    { big: `+${GRUPO.anos}`, label: 'anos de mercado' },
    { big: '2', label: "lojas na Estrada do M'Boi Mirim" },
    { big: '10x', label: 'sem juros no cartão' },
    { big: 'Seg–Sáb', label: 'atendimento' },
  ];
  return (
    <section className="border-y border-line bg-black" aria-label="Números da oficina">
      <div className="mx-auto grid max-w-[1200px] grid-cols-2 lg:grid-cols-4">
        {itens.map((i, k) => (
          <div key={i.label} className={`px-6 py-8 ${k % 2 ? 'border-l border-line' : ''} ${k > 1 ? 'border-t border-line lg:border-t-0' : ''} ${k === 2 ? 'lg:border-l' : ''}`}>
            <p className="font-display text-[34px] font-extrabold text-gold">{i.big}</p>
            <p className="mt-1 text-[14px] text-slate">{i.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------------
   Pacotes de revisão (sem preço; orçamento pelo WhatsApp)
   --------------------------------------------------------------------- */
function Pacotes({ onAgendar }: { onAgendar: (servico: string) => void }) {
  return (
    <section id="pacotes" className="py-24" aria-labelledby="pac-title">
      <div className="mx-auto max-w-[1200px] px-6">
        <div className="max-w-[760px]">
          <Eyebrow>Carro-chefe</Eyebrow>
          <h2 id="pac-title" className="mt-3 text-[34px] font-extrabold leading-tight tracking-tight sm:text-[44px]">Pacotes de revisão preventiva.</h2>
          <p className="mt-4 text-[18px] text-slate">As manutenções essenciais num pacote só, nas duas lojas. O valor depende do óleo e das peças do seu carro: peça o orçamento e receba pelo WhatsApp.</p>
        </div>
        <div className="mt-12 grid gap-6 lg:grid-cols-2">
          {PACOTES.map((p, i) => {
            const nomeForm = i === 0 ? 'Pacote Revisão Completa (veículos leves)' : 'Pacote Revisão SUVs e Picapes';
            return (
              <article key={p.id} className={`relative flex flex-col rounded-3xl p-7 ring-1 sm:p-9 ${i === 0 ? 'bg-panel ring-gold/60' : 'bg-panel ring-line'}`}>
                <span className={`absolute -top-3 left-7 rounded-full px-3 py-1 text-[12px] font-bold uppercase tracking-wide ${i === 0 ? 'bg-gold text-ink' : 'bg-white text-ink'}`}>{p.selo}</span>
                <p className="text-[13px] font-bold uppercase tracking-[0.12em] text-gold">{p.publico}</p>
                <h3 className="mt-2 text-[28px] font-extrabold leading-tight">{p.titulo}</h3>
                <p className="mt-2 text-[15px] text-slate">{p.exemplos}</p>
                <div className="mt-6 rounded-2xl bg-ink p-5 ring-1 ring-line">
                  <p className="text-[13px] font-bold uppercase tracking-wide text-slate">Incluso no pacote</p>
                  <ul className="mt-4 space-y-3">
                    {p.itens.map((it) => (
                      <li key={it} className="flex gap-3 text-[15px]"><span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-gold/15 text-gold"><Icon.check className="h-3.5 w-3.5" /></span>{it}</li>
                    ))}
                  </ul>
                </div>
                <p className="mt-5 text-[14px] text-slate">Mão de obra inclusa · parcele em até 10x sem juros</p>
                <button type="button" onClick={() => onAgendar(nomeForm)}
                  className={`mt-6 inline-flex min-h-[54px] items-center justify-center gap-2 rounded-xl text-[16px] font-bold transition-colors ${i === 0 ? 'bg-gold text-ink hover:bg-gold-2' : 'bg-white text-ink hover:bg-cloud'}`}>
                  Pedir orçamento do pacote <Icon.arrow />
                </button>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------------
   Serviços
   --------------------------------------------------------------------- */
function Servicos({ onAgendar }: { onAgendar: (servico: string) => void }) {
  return (
    <section id="servicos" className="bg-cloud py-24 text-ink" aria-labelledby="svc-title">
      <div className="mx-auto max-w-[1200px] px-6">
        <div className="max-w-[720px]">
          <Eyebrow dark={false}>Mecânica completa</Eyebrow>
          <h2 id="svc-title" className="mt-3 text-[34px] font-extrabold leading-tight tracking-tight sm:text-[44px]">Do óleo ao motor, nas duas lojas.</h2>
          <p className="mt-4 text-[18px] text-[#4B5260]">Equipamento de diagnóstico e equipe que conhece o carro do dia a dia.</p>
        </div>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {SERVICOS.map((s) => {
            const I = Icon[s.icon];
            return (
              <article key={s.id} className="group flex flex-col rounded-2xl bg-white p-6 ring-1 ring-black/[0.06] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_20px_40px_-20px_rgba(0,0,0,.25)]">
                <span className="grid h-14 w-14 place-items-center rounded-2xl bg-ink text-gold transition-transform duration-300 group-hover:-rotate-6"><I /></span>
                <h3 className="mt-5 text-[19px] font-bold leading-snug">{s.titulo}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-[#4B5260]">{s.texto}</p>
                <button type="button" onClick={() => onAgendar(s.titulo)} className="mt-auto inline-flex min-h-[44px] items-center gap-2 pt-4 text-left text-[15px] font-bold text-ink">
                  <span className="border-b-2 border-gold">Agendar este serviço</span><Icon.arrow />
                </button>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------------
   Agendamento: escolhe loja, carro, serviço → WhatsApp da loja
   --------------------------------------------------------------------- */
function Agendar({ servicoInicial }: { servicoInicial: string }) {
  const [lojaId, setLojaId] = useState<Loja['id']>('jotacar');
  const [carro, setCarro] = useState('');
  const [servico, setServico] = useState(SERVICOS_FORM[0]);
  const [nome, setNome] = useState('');
  const [obs, setObs] = useState('');
  const loja = LOJAS.find((l) => l.id === lojaId)!;

  useEffect(() => {
    if (!servicoInicial) return;
    const achou = SERVICOS_FORM.find((s) => s === servicoInicial) ?? SERVICOS_FORM.find((s) => !s.startsWith('Pacote') && servicoInicial.toLowerCase().startsWith(s.toLowerCase().split(' ')[0]));
    setServico(achou ?? 'Outro / não sei');
  }, [servicoInicial]);

  const mensagem = useMemo(() => {
    const l = [`Olá, ${loja.apelido}! Vim pelo site.`];
    if (nome.trim()) l.push(`Meu nome: ${nome.trim()}.`);
    if (carro.trim()) l.push(`Carro: ${carro.trim()}.`);
    l.push(`Serviço: ${servico}.`);
    if (obs.trim()) l.push(`O que está acontecendo: ${obs.trim()}.`);
    l.push('Quero agendar um atendimento.');
    return l.join('\n');
  }, [loja, nome, carro, servico, obs]);
  const href = wa(loja.whatsapp, mensagem);

  const campo = 'mt-2 h-12 w-full rounded-xl bg-ink px-4 text-[16px] text-white ring-1 ring-line placeholder:text-white/30 outline-none focus:ring-2 focus:ring-gold';

  return (
    <section id="agendar" className="py-24" aria-labelledby="ag-title">
      <div className="mx-auto grid max-w-[1200px] gap-12 px-6 lg:grid-cols-[.9fr_1.1fr] lg:items-start">
        <div>
          <Eyebrow>Agilidade e praticidade</Eyebrow>
          <h2 id="ag-title" className="mt-3 text-[34px] font-extrabold leading-tight tracking-tight sm:text-[44px]">Agende sua revisão ou diagnóstico.</h2>
          <p className="mt-4 text-[18px] text-slate">Preencha os dados do carro e a mensagem vai pronta para o WhatsApp da loja escolhida. A loja responde e confirma o melhor horário.</p>
          <ul className="mt-8 space-y-4">
            {[
              { i: Icon.store, t: 'Escolha a loja', d: 'Jota Car (nº 9000) ou JC Pneus (nº 10003).' },
              { i: Icon.calendar, t: 'Combine o horário', d: 'O horário fica confirmado quando a loja responde.' },
              { i: Icon.shield, t: 'Orçamento antes', d: 'Você recebe o orçamento explicado e decide.' },
            ].map((x) => (
              <li key={x.t} className="flex gap-4">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-panel text-gold ring-1 ring-line"><x.i /></span>
                <div><p className="font-bold">{x.t}</p><p className="text-[15px] text-slate">{x.d}</p></div>
              </li>
            ))}
          </ul>
        </div>

        <form className="rounded-3xl bg-panel p-6 ring-1 ring-line sm:p-8" onSubmit={(e) => { e.preventDefault(); track('wa_agendar', href); window.open(href, '_blank', 'noopener'); }}>
          <fieldset>
            <legend className="text-[14px] font-bold">1. Loja</legend>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              {LOJAS.map((l) => (
                <label key={l.id} className={`flex cursor-pointer items-start gap-3 rounded-xl p-4 ring-1 transition-colors ${lojaId === l.id ? 'bg-gold/10 ring-gold' : 'bg-ink ring-line hover:ring-white/30'}`}>
                  <input type="radio" name="loja" value={l.id} checked={lojaId === l.id} onChange={() => setLojaId(l.id)} className="mt-1 accent-[#FFC107]" />
                  <span><span className="block font-bold">{l.apelido}</span><span className="block text-[13px] text-slate">{l.endereco}</span></span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <label className="block text-[14px] font-bold">2. Modelo e ano
              <input value={carro} onChange={(e) => setCarro(e.target.value)} placeholder="Ex.: Onix 2019" maxLength={60} autoComplete="off" className={campo} />
            </label>
            <label className="block text-[14px] font-bold">3. Serviço
              <select value={servico} onChange={(e) => setServico(e.target.value)} className={campo}>
                {SERVICOS_FORM.map((s) => <option key={s}>{s}</option>)}
              </select>
            </label>
          </div>
          <label className="mt-5 block text-[14px] font-bold">Seu nome <span className="font-normal text-slate">(opcional)</span>
            <input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={60} autoComplete="given-name" className={campo} />
          </label>
          <label className="mt-5 block text-[14px] font-bold">O que o carro está fazendo? <span className="font-normal text-slate">(opcional)</span>
            <textarea value={obs} onChange={(e) => setObs(e.target.value)} maxLength={300} rows={3} placeholder="Ex.: barulho ao frear, luz da injeção acesa…" className={`${campo} h-auto py-3`} />
          </label>

          <div className="mt-5 whitespace-pre-line rounded-xl bg-ink px-4 py-3 text-[14px] leading-relaxed text-white/80 ring-1 ring-line" aria-live="polite">
            <p className="mb-1 text-[12px] font-bold uppercase tracking-wide text-[#3DDC84]">Sua mensagem</p>{mensagem}
          </div>
          <a href={href} target="_blank" rel="noopener" onClick={() => track('wa_agendar', href)}
            className="mt-5 flex min-h-[56px] w-full items-center justify-center gap-2 rounded-xl bg-gold text-[17px] font-bold text-ink shadow-[0_10px_30px_-12px_rgba(255,193,7,.7)] transition-colors hover:bg-gold-2">
            <Icon.wa />Enviar para a {loja.apelido}
          </a>
          <p className="mt-3 text-center text-[13px] text-slate">Abre o WhatsApp com o texto pronto. Você revisa antes de enviar.</p>
        </form>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------------
   Avaliações (dados públicos do Google de cada loja)
   --------------------------------------------------------------------- */
function Avaliacoes() {
  return (
    <section id="avaliacoes" className="bg-cloud py-24 text-ink" aria-labelledby="av-title">
      <div className="mx-auto max-w-[1200px] px-6">
        <div className="max-w-[720px]">
          <Eyebrow dark={false}>Confiança</Eyebrow>
          <h2 id="av-title" className="mt-3 text-[34px] font-extrabold leading-tight tracking-tight sm:text-[44px]">O que dizem os motoristas da Zona Sul.</h2>
          <p className="mt-4 text-[18px] text-[#4B5260]">As avaliações são públicas no Google. Leia antes de decidir.</p>
        </div>
        <div className="mt-10 grid gap-5 md:grid-cols-2">
          {LOJAS.map((l) => (
            <a key={l.id} href={l.google.link} target="_blank" rel="noopener" onClick={() => track(`google_${l.id}`, l.google.link)}
              className="group flex items-center justify-between gap-6 rounded-2xl bg-white p-6 ring-1 ring-black/[0.06] transition-all hover:-translate-y-1 hover:shadow-[0_20px_40px_-20px_rgba(0,0,0,.25)]">
              <div>
                <p className="font-display text-[20px] font-bold">{l.apelido}</p>
                <p className="mt-1 text-[14px] text-[#4B5260]">{l.google.avaliacoes} avaliações no Google</p>
                <p className="mt-4 inline-flex items-center gap-2 text-[15px] font-bold"><span className="border-b-2 border-gold">Ler as avaliações</span><Icon.arrow /></p>
              </div>
              <div className="text-right">
                <p className="font-display text-[48px] font-extrabold leading-none">{l.google.nota}</p>
                <div className="mt-2"><Stars nota={l.google.nota} /></div>
              </div>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------------
   Unidades: endereço, horário, rota e mapa de cada loja
   --------------------------------------------------------------------- */
function Unidades() {
  return (
    <section id="unidades" className="py-24" aria-labelledby="un-title">
      <div className="mx-auto max-w-[1200px] px-6">
        <Eyebrow>Nossas unidades</Eyebrow>
        <h2 id="un-title" className="mt-3 text-[34px] font-extrabold leading-tight tracking-tight sm:text-[44px]">Duas lojas, a poucos minutos uma da outra.</h2>
        <div className="mt-12 grid gap-6 lg:grid-cols-2">
          {LOJAS.map((l) => (
            <article key={l.id} className="overflow-hidden rounded-3xl bg-panel ring-1 ring-line">
              {l.foto ? (
                <div className="relative">
                  <img src={l.foto} alt={`Fachada da ${l.apelido}, ${l.endereco}`} width={1360} height={1020} loading="lazy" decoding="async" className="aspect-[16/9] w-full object-cover object-[40%_45%]" />
                  <span className="absolute left-4 top-4 rounded-full bg-black/70 px-3 py-1 text-[12px] font-bold">Foto da loja</span>
                </div>
              ) : (
                <iframe title={`Mapa: ${l.apelido}`} src={l.mapa} loading="lazy" referrerPolicy="no-referrer-when-downgrade" className="aspect-[16/9] w-full border-0 grayscale-[.3]" />
              )}
              <div className="p-6 sm:p-8">
                <p className="text-[12px] font-bold uppercase tracking-wide text-gold">Nº {l.numero}</p>
                <h3 className="mt-1 text-[24px] font-extrabold">{l.nome}</h3>
                <p className="mt-1 text-[15px] text-slate">{l.foco}</p>
                <div className="mt-6 space-y-3 text-[15px]">
                  <p className="flex gap-3"><Icon.pin className="mt-0.5 h-5 w-5 shrink-0 text-gold" /><span>{l.endereco} · {l.bairro}<br /><span className="text-slate">São Paulo – SP · CEP {l.cep}</span></span></p>
                  <p className="flex gap-3"><Icon.clock className="mt-0.5 h-5 w-5 shrink-0 text-gold" />
                    {l.horarios.length ? (
                      <span>{l.horarios.map((h) => <span key={h.dias} className="block">{h.dias}: {h.horas}</span>)}<span className="text-slate">Domingo fechado · feriados, confirme pelo WhatsApp</span></span>
                    ) : (
                      <span>A partir das 8h · confirme o horário pelo WhatsApp</span>
                    )}
                  </p>
                  <p className="flex gap-3"><Icon.phone className="mt-0.5 h-5 w-5 shrink-0 text-gold" /><a href={`tel:+${l.whatsapp}`} onClick={() => track(`tel_${l.id}`, 'tel:')} className="hover:text-gold">{l.telefone}</a></p>
                </div>
                <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                  <WaButton loja={l} msg={msgLoja(l)} id={`wa_unidade_${l.id}`} className="flex-1">WhatsApp</WaButton>
                  <a href={l.rota} target="_blank" rel="noopener" onClick={() => track(`rota_${l.id}`, l.rota)}
                    className="inline-flex min-h-[52px] flex-1 items-center justify-center gap-2 rounded-xl px-6 text-[16px] font-bold ring-1 ring-inset ring-white/25 transition hover:ring-white/60">
                    <Icon.route />Como chegar
                  </a>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------------
   Dúvidas
   --------------------------------------------------------------------- */
const FAQ = [
  { p: 'Qual loja eu escolho?', r: "As duas ficam na Estrada do M'Boi Mirim, a poucos minutos uma da outra. Escolha a mais perto de você; na dúvida, chame qualquer uma pelo WhatsApp que a equipe orienta." },
  { p: 'Preciso agendar?', r: 'Recomendamos chamar no WhatsApp antes de vir. A loja já sabe o que o carro tem e combina o melhor horário.' },
  { p: 'Vocês passam o orçamento antes?', r: 'Sim. Depois da avaliação você recebe o orçamento com o que precisa ser feito e quanto custa. Nenhum serviço começa sem a sua aprovação.' },
  { p: 'Quais as formas de pagamento?', r: 'Parcelamos em até 10x sem juros no cartão. Para outras formas, fale com a loja pelo WhatsApp.' },
  { p: 'Acendeu uma luz no painel. Posso continuar rodando?', r: 'Luz vermelha de óleo, temperatura ou freio pede para parar em local seguro e não seguir viagem. Luz amarela fixa, como a da injeção, normalmente dá tempo de agendar. Na dúvida, não arrisque: fale com a gente.' },
];

function Duvidas() {
  const [aberto, setAberto] = useState<number | null>(0);
  return (
    <section className="bg-cloud py-24 text-ink" aria-labelledby="faq-title">
      <div className="mx-auto max-w-[820px] px-6">
        <Eyebrow dark={false}>Dúvidas frequentes</Eyebrow>
        <h2 id="faq-title" className="mt-3 text-[34px] font-extrabold tracking-tight sm:text-[44px]">Antes de trazer o carro</h2>
        <div className="mt-10 space-y-3">
          {FAQ.map((f, i) => {
            const open = aberto === i;
            return (
              <div key={f.p} className={`rounded-2xl ring-1 transition-colors ${open ? 'bg-white ring-black/10' : 'bg-white/60 ring-black/[0.06]'}`}>
                <button type="button" onClick={() => setAberto(open ? null : i)} aria-expanded={open} aria-controls={`f-${i}`}
                  className="flex min-h-[60px] w-full items-center justify-between gap-4 px-5 py-4 text-left text-[17px] font-bold">
                  {f.p}
                  <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full transition-all ${open ? 'rotate-45 bg-gold' : 'bg-ink text-gold'}`}>
                    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true"><path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" /></svg>
                  </span>
                </button>
                <div id={`f-${i}`} className={`grid transition-all duration-300 ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
                  <p className="min-h-0 overflow-hidden px-5 text-[16px] leading-relaxed text-[#4B5260]"><span className="block pb-5">{f.r}</span></p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------------
   Rodapé + botão flutuante de WhatsApp
   --------------------------------------------------------------------- */
function Rodape() {
  return (
    <footer className="border-t border-line bg-black pb-28 pt-14 text-[14px] text-slate sm:pb-14">
      <div className="mx-auto grid max-w-[1200px] gap-10 px-6 md:grid-cols-3">
        <div>
          <p className="font-display text-[18px] font-extrabold text-white">Jota Car <span className="text-gold">+</span> JC Pneus</p>
          <p className="mt-3">Mecânica, pneus e alinhamento na Estrada do M'Boi Mirim, Zona Sul de São Paulo. {GRUPO.anos} anos de mercado.</p>
        </div>
        {LOJAS.map((l) => (
          <div key={l.id}>
            <p className="font-bold text-white">{l.apelido}</p>
            <p className="mt-2">{l.endereco}<br />{l.bairro} · CEP {l.cep}</p>
            <a href={wa(l.whatsapp, msgLoja(l))} target="_blank" rel="noopener" onClick={() => track(`wa_rodape_${l.id}`, 'wa.me')} className="mt-2 inline-flex min-h-[40px] items-center hover:text-gold">WhatsApp {l.telefone}</a>
          </div>
        ))}
      </div>
      <p className="mx-auto mt-10 max-w-[1200px] border-t border-line px-6 pt-6 text-[12px] text-white/40">
        {GRUPO.razaoSocial} · CNPJ {GRUPO.cnpj} · © {new Date().getFullYear()} · Imagem do topo ilustrativa.
      </p>
    </footer>
  );
}

function BarraCelular() {
  return (
    <div className="fixed inset-x-3 bottom-3 z-40 grid grid-cols-2 gap-2 rounded-2xl bg-black/90 p-2 ring-1 ring-line backdrop-blur sm:hidden" role="region" aria-label="Contato rápido">
      {LOJAS.map((l) => (
        <a key={l.id} href={wa(l.whatsapp, msgLoja(l))} target="_blank" rel="noopener" onClick={() => track(`wa_barra_${l.id}`, 'wa.me')}
          className="flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-gold text-[14px] font-bold text-ink">
          <Icon.wa className="h-4 w-4" />{l.apelido}
        </a>
      ))}
    </div>
  );
}

export default function App() {
  const [servico, setServico] = useState('');
  const agendar = (s: string) => {
    setServico(s);
    document.getElementById('agendar')?.scrollIntoView({ behavior: 'smooth' });
  };
  return (
    <>
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-gold focus:px-4 focus:py-2 focus:font-bold focus:text-ink">Pular para o conteúdo</a>
      <Header />
      <main id="conteudo">
        <Hero />
        <Numeros />
        <Pacotes onAgendar={agendar} />
        <Servicos onAgendar={agendar} />
        <Agendar servicoInicial={servico} />
        <Avaliacoes />
        <Unidades />
        <Duvidas />
      </main>
      <Rodape />
      <BarraCelular />
    </>
  );
}
