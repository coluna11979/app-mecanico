import { ReactNode } from 'react';
import { Icon } from './ui';

/*
 * Telas do produto em HTML/Tailwind (leves, nítidas em qualquer densidade e
 * sem imagem pra baixar). Nomes e valores são de exemplo — por isso todo
 * mockup sai com a legenda "Tela ilustrativa".
 * TODO(design): trocar por capturas reais quando o produto estiver estável.
 */

export function MockCaption({ dark = false }: { dark?: boolean }) {
  return (
    <p className={`mt-3 text-center text-[11px] ${dark ? 'text-steel-400' : 'text-steel-500'}`}>
      Tela ilustrativa · nomes e valores de exemplo
    </p>
  );
}

/* ── Molduras ── */

export function BrowserFrame({ children, title = 'mecanicoapp.com.br', className = '' }: {
  children: ReactNode; title?: string; className?: string;
}) {
  return (
    <div className={`overflow-hidden rounded-2xl border border-steel-200 bg-white shadow-2xl shadow-steel-900/10 ${className}`}>
      <div className="flex items-center gap-2 border-b border-steel-100 bg-steel-50 px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-steel-200" />
        <span className="h-2.5 w-2.5 rounded-full bg-steel-200" />
        <span className="h-2.5 w-2.5 rounded-full bg-steel-200" />
        <span className="ml-3 truncate rounded-md bg-white px-3 py-0.5 text-[10px] text-steel-400">{title}</span>
      </div>
      {children}
    </div>
  );
}

export function PhoneFrame({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`w-[248px] rounded-[2.2rem] bg-steel-900 p-2 shadow-2xl shadow-steel-900/30 ring-1 ring-white/10 ${className}`}>
      <div className="relative overflow-hidden rounded-[1.8rem] bg-steel-800">
        <div className="absolute left-1/2 top-2 h-4 w-20 -translate-x-1/2 rounded-full bg-steel-900" />
        <div className="px-3.5 pb-4 pt-9">{children}</div>
      </div>
    </div>
  );
}

/* ── Peças pequenas ── */

function Avatar({ initials, tone = 'steel' }: { initials: string; tone?: 'steel' | 'brand' }) {
  return (
    <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-bold ${
      tone === 'brand' ? 'bg-brand-100 text-brand-700' : 'bg-steel-100 text-steel-700'
    }`}>{initials}</span>
  );
}

function Rating({ value, dark = false }: { value: string; dark?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold ${dark ? 'text-steel-300' : 'text-steel-600'}`}>
      <Icon name="star" size={12} className="fill-pending-500 text-pending-500" />{value}
    </span>
  );
}

function Chip({ children, tone = 'steel' }: { children: ReactNode; tone?: 'steel' | 'brand' | 'signal' }) {
  const t = {
    steel:  'bg-steel-100 text-steel-600',
    brand:  'bg-brand-50 text-brand-700',
    signal: 'bg-signal-50 text-signal-700',
  }[tone];
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${t}`}>{children}</span>;
}

/* ── 1. Hero: oficina confirma, mecânico aceita ── */

export function HeroProduct() {
  return (
    <div className="relative mx-auto w-full max-w-[600px] pb-12">
      <BrowserFrame className="sm:mr-40">
        <div className="p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-steel-400">Demanda publicada</p>
              <p className="mt-1 font-display text-base font-bold text-steel-900 sm:text-lg">Troca de embreagem · Gol 1.6</p>
              <p className="text-xs text-steel-500">Hoje, 14h · estimativa de 3h</p>
            </div>
            <Chip tone="brand"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-500" />Aberta</Chip>
          </div>

          <p className="mt-5 text-[11px] font-semibold text-steel-500">2 profissionais aceitaram</p>
          <ul className="mt-2 space-y-2">
            <li className="flex items-center gap-3 rounded-xl border border-brand-200 bg-brand-50/50 p-3">
              <Avatar initials="AL" tone="brand" />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 truncate text-sm font-bold text-steel-900">
                  André L. <Icon name="heart" size={12} className="fill-brand-500 text-brand-500" />
                </p>
                <p className="truncate text-[11px] text-steel-500">Transmissão · 38 serviços</p>
              </div>
              <Rating value="4,9" />
              <span className="rounded-lg bg-steel-900 px-3 py-1.5 text-[11px] font-bold text-white">Confirmar</span>
            </li>
            <li className="flex items-center gap-3 rounded-xl border border-steel-100 p-3">
              <Avatar initials="MT" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-steel-900">Marcos T.</p>
                <p className="truncate text-[11px] text-steel-500">Mecânica geral · 12 serviços</p>
              </div>
              <Rating value="4,8" />
              <span className="rounded-lg border border-steel-200 px-3 py-1.5 text-[11px] font-bold text-steel-700">Ver perfil</span>
            </li>
          </ul>
        </div>
      </BrowserFrame>

      {/* Celular do mecânico, sobreposto */}
      <div className="absolute bottom-0 right-0 hidden origin-bottom-right scale-[0.78] sm:block">
        <PhoneFrame>
          <PhoneOpportunity compact />
        </PhoneFrame>
      </div>

      {/* Toast de confirmação */}
      <div className="absolute bottom-1 left-4 flex items-center gap-2 rounded-xl bg-white px-3 py-2 shadow-xl ring-1 ring-steel-100">
        <span className="grid h-6 w-6 place-items-center rounded-full bg-signal-500 text-white"><Icon name="check" size={14} /></span>
        <span className="text-xs font-bold text-steel-900">Profissional confirmado</span>
      </div>
    </div>
  );
}

/* ── 2. Celular do mecânico ── */

export function PhoneOpportunity({ compact = false }: { compact?: boolean }) {
  return (
    <div className="text-white">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-bold">Olá, André</p>
        <span className="inline-flex items-center gap-1 rounded-full bg-signal-500/15 px-2 py-0.5 text-[9px] font-bold text-signal-400">
          <span className="h-1.5 w-1.5 rounded-full bg-signal-400" />Disponível
        </span>
      </div>

      <div className="mt-3 rounded-2xl bg-steel-700/60 p-3 ring-1 ring-white/5">
        <p className="text-[9px] font-bold uppercase tracking-widest text-brand-400">Nova oportunidade</p>
        <p className="mt-1.5 text-sm font-bold leading-tight">Troca de embreagem</p>
        <p className="text-[11px] text-steel-300">Auto Center Exemplo · 4,2 km</p>
        <div className="mt-2.5 flex flex-wrap gap-1.5 text-[10px] text-steel-200">
          <span className="rounded-md bg-white/10 px-1.5 py-0.5">Hoje, 14h</span>
          <span className="rounded-md bg-white/10 px-1.5 py-0.5">~3h</span>
          <span className="rounded-md bg-white/10 px-1.5 py-0.5 font-bold text-white">R$ 210,00</span>
        </div>
        <div className="mt-3 rounded-xl bg-brand-500 py-2 text-center text-xs font-bold">Aceitar serviço</div>
      </div>

      {!compact && (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-steel-700/60 p-2.5 ring-1 ring-white/5">
              <p className="text-[9px] text-steel-400">Sua nota</p>
              <Rating value="4,9" dark />
            </div>
            <div className="rounded-xl bg-steel-700/60 p-2.5 ring-1 ring-white/5">
              <p className="text-[9px] text-steel-400">Oficinas que voltaram</p>
              <p className="text-sm font-bold">6</p>
            </div>
          </div>
          <div className="mt-2 rounded-xl bg-steel-700/60 p-2.5 ring-1 ring-white/5">
            <p className="text-[9px] text-steel-400">Chamado direto</p>
            <p className="text-[11px] font-semibold">Oficina Exemplo te adicionou aos preferidos</p>
          </div>
        </>
      )}
    </div>
  );
}

/* ── 3. Perfil do profissional (seção confiança) ── */

export function ProfileMockup() {
  return (
    <div className="mx-auto w-full max-w-sm rounded-2xl border border-steel-100 bg-white p-5 shadow-2xl shadow-steel-900/10">
      <div className="flex items-center gap-3">
        <span className="grid h-14 w-14 place-items-center rounded-2xl bg-brand-100 text-lg font-bold text-brand-700">AL</span>
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 font-display text-lg font-bold text-steel-900">
            André L.
            <span className="grid h-5 w-5 place-items-center rounded-full bg-signal-500 text-white" title="Perfil verificado">
              <Icon name="check" size={12} />
            </span>
          </p>
          <p className="text-xs text-steel-500">Perfil verificado · na plataforma desde 2026</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {['Transmissão', 'Embreagem', 'Suspensão', 'Freios'].map(s => <Chip key={s}>{s}</Chip>)}
      </div>

      <div className="mt-4 grid grid-cols-3 divide-x divide-steel-100 rounded-xl bg-steel-50 py-3 text-center">
        <div><p className="font-display text-lg font-bold text-steel-900">4,9</p><p className="text-[10px] text-steel-500">avaliação</p></div>
        <div><p className="font-display text-lg font-bold text-steel-900">38</p><p className="text-[10px] text-steel-500">serviços</p></div>
        <div><p className="font-display text-lg font-bold text-steel-900">6</p><p className="text-[10px] text-steel-500">oficinas</p></div>
      </div>

      <div className="mt-4 rounded-xl border border-steel-100 p-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold text-steel-900">Avaliação de oficina</p>
          <Rating value="5,0" />
        </div>
        <p className="mt-1 text-xs leading-relaxed text-steel-600">“Pontual, organizado e entregou no prazo combinado.”</p>
      </div>

      <div className="mt-4 flex gap-2">
        <span className="flex-1 rounded-xl bg-steel-900 py-2.5 text-center text-xs font-bold text-white">Confirmar profissional</span>
        <span className="grid w-11 place-items-center rounded-xl border border-brand-200 text-brand-600" title="Adicionar aos preferidos">
          <Icon name="heart" size={16} />
        </span>
      </div>
    </div>
  );
}

/* ── 4. Rede de preferidos ── */

export function NetworkMockup() {
  const pros = [
    { i: 'AL', n: 'André L.',  s: 'Transmissão',      times: 7 },
    { i: 'JP', n: 'Júlio P.',  s: 'Injeção eletrônica', times: 4 },
    { i: 'CS', n: 'Célia S.',  s: 'Suspensão e freios', times: 3 },
  ];
  return (
    <div className="mx-auto w-full max-w-md rounded-2xl border border-white/10 bg-steel-800 p-5 shadow-2xl">
      <div className="flex items-center justify-between">
        <p className="font-display font-bold text-white">Meus preferidos</p>
        <span className="text-[11px] text-steel-400">3 profissionais</span>
      </div>
      <ul className="mt-4 space-y-2">
        {pros.map(p => (
          <li key={p.i} className="flex items-center gap-3 rounded-xl bg-white/[0.04] p-3 ring-1 ring-white/5">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-500/20 text-xs font-bold text-brand-300">{p.i}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-white">{p.n}</p>
              <p className="truncate text-[11px] text-steel-400">{p.s} · {p.times} serviços com você</p>
            </div>
            <span className="rounded-lg bg-brand-500 px-2.5 py-1.5 text-[11px] font-bold text-white">Chamar</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ── 5. Sistema de gestão ── */

const MODULES: { icon: Parameters<typeof Icon>[0]['name']; label: string; active?: boolean }[] = [
  { icon: 'clipboard', label: 'Ordens de serviço', active: true },
  { icon: 'users',     label: 'Clientes' },
  { icon: 'car',       label: 'Veículos' },
  { icon: 'calendar',  label: 'Agenda' },
  { icon: 'megaphone', label: 'Demandas' },
  { icon: 'wrench',    label: 'Profissionais' },
  { icon: 'wallet',    label: 'Pagamentos' },
];

export function ManagementMockup() {
  const rows = [
    { os: '#1042', car: 'Onix 2019 · Revisão',    who: 'Equipe · Lucas',        st: 'Em execução', tone: 'brand' as const },
    { os: '#1043', car: 'Gol 1.6 · Embreagem',    who: 'Reforço · André L.',    st: 'Confirmado',  tone: 'signal' as const },
    { os: '#1044', car: 'HB20 · Freios',          who: 'Equipe · Rodrigo',      st: 'Agendado',    tone: 'steel' as const },
  ];
  return (
    <BrowserFrame>
      <div className="flex">
        <aside className="hidden w-44 shrink-0 border-r border-steel-100 bg-steel-50/60 p-3 sm:block">
          {MODULES.map(m => (
            <div key={m.label} className={`flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-semibold ${
              m.active ? 'bg-white text-steel-900 shadow-sm' : 'text-steel-500'
            }`}>
              <Icon name={m.icon} size={14} className={m.active ? 'text-brand-500' : ''} />{m.label}
            </div>
          ))}
        </aside>
        <div className="min-w-0 flex-1 p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <p className="font-display font-bold text-steel-900">Ordens de serviço · hoje</p>
            <span className="inline-flex items-center gap-1 rounded-lg bg-brand-500 px-2.5 py-1.5 text-[11px] font-bold text-white">
              <Icon name="plus" size={12} />Pedir reforço
            </span>
          </div>
          <ul className="mt-4 divide-y divide-steel-100 rounded-xl border border-steel-100">
            {rows.map(r => (
              <li key={r.os} className="flex items-center gap-3 px-3 py-2.5">
                <span className="w-10 shrink-0 font-mono text-[11px] text-steel-400">{r.os}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-bold text-steel-900">{r.car}</p>
                  <p className={`truncate text-[11px] ${r.who.startsWith('Reforço') ? 'font-semibold text-brand-600' : 'text-steel-500'}`}>{r.who}</p>
                </div>
                <Chip tone={r.tone}>{r.st}</Chip>
              </li>
            ))}
          </ul>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {[['8', 'OS abertas'], ['3', 'agendamentos'], ['1', 'reforço hoje']].map(([n, l]) => (
              <div key={l} className="rounded-xl bg-steel-50 p-2.5">
                <p className="font-display text-lg font-bold text-steel-900">{n}</p>
                <p className="text-[10px] text-steel-500">{l}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </BrowserFrame>
  );
}
