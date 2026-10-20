import { Link } from 'react-router-dom';

/** Mecânico disponível com o que o carrossel mostra (foto e especialidades são opcionais) */
export type HomeMechanic = {
  id: string; name: string; rating: number; total_jobs: number;
  skills?: string[] | null; avatar?: string | null;
};

const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase() ?? '').join('');
const firstLast = (name: string) => { const p = name.trim().split(/\s+/); return p.length > 1 ? `${p[0]} ${p[p.length - 1]}` : p[0]; };

/** Roda estilizada (decoração do cartão principal, sem foto) */
function WheelArt() {
  return (
    <svg viewBox="0 0 200 200" className="absolute -right-10 -bottom-12 w-56 h-56 sm:w-72 sm:h-72 lg:right-6 lg:-bottom-16 lg:w-80 lg:h-80 opacity-90 pointer-events-none" aria-hidden>
      <defs>
        <radialGradient id="ph-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ff6b1a" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#ff6b1a" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="100" cy="100" r="100" fill="url(#ph-glow)" />
      <circle cx="100" cy="100" r="78" fill="none" stroke="#2b2f36" strokeWidth="22" />
      <circle cx="100" cy="100" r="78" fill="none" stroke="#3a3f47" strokeWidth="2" strokeDasharray="6 7" />
      <circle cx="100" cy="100" r="52" fill="#1d2025" stroke="#4a505a" strokeWidth="3" />
      {Array.from({ length: 5 }, (_, i) => {
        const a = (i * 72 - 90) * (Math.PI / 180);
        return <line key={i} x1="100" y1="100" x2={100 + Math.cos(a) * 48} y2={100 + Math.sin(a) * 48} stroke="#5a616c" strokeWidth="9" strokeLinecap="round" />;
      })}
      <circle cx="100" cy="100" r="13" fill="#ff6b1a" />
    </svg>
  );
}

/** Topo da tela: o que se faz aqui, em um botão */
export function PlatformHero({ available, onCall, disabled, locked }: {
  available: number; onCall: () => void; disabled?: boolean;
  /** Multa pendente: não dá para publicar */
  locked?: boolean;
}) {
  return (
    <section className="relative overflow-hidden rounded-3xl bg-steel-900 text-white p-5 sm:p-7 mb-4">
      <WheelArt />
      <div className="relative max-w-md">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-500/15 ring-1 ring-brand-400/30 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-brand-300">
          {available > 0 && <span className="h-1.5 w-1.5 rounded-full bg-signal-400 animate-pulse-soft" />}
          {available > 0 ? `${available} ${available === 1 ? 'profissional disponível' : 'profissionais disponíveis'}` : 'Mecânicos sob demanda'}
        </span>
        <h2 className="font-display text-[28px] sm:text-4xl font-bold leading-[1.1] tracking-tight mt-3">
          Precisa de um mecânico agora?
        </h2>
        <p className="text-steel-300 text-[15px] mt-2 leading-snug">
          Profissionais verificados para atender sua oficina. Você paga só pelo serviço.
        </p>
        <button type="button" onClick={onCall} disabled={disabled}
          className="mt-5 w-full sm:w-auto inline-flex items-center justify-center gap-2 h-14 px-6 rounded-2xl bg-brand-500 text-white text-[17px] font-bold shadow-brand active:scale-[0.99] hover:bg-brand-600 transition disabled:opacity-60">
          {locked ? '🔒 Quite a multa para chamar' : <>＋ Chamar mecânico agora <span aria-hidden>→</span></>}
        </button>
      </div>
    </section>
  );
}

/** Em busca · Aceitas · Em execução · Concluídas */
export function StatusCounters({ searching, accepted, working, done, onPick, side }: {
  searching: number; accepted: number; working: number; done: number;
  onPick: (target: 'ativas' | 'historico') => void;
  /** Coluna lateral do computador: 2×2 compacto dentro de um cartão */
  side?: boolean;
}) {
  const items = [
    { n: searching, label: 'Em busca',    icon: '⏱️', tone: 'bg-pending-50',  target: 'ativas' as const },
    { n: accepted,  label: 'Aceitas',     icon: '✅', tone: 'bg-signal-50',   target: 'ativas' as const },
    { n: working,   label: 'Em execução', icon: '🔧', tone: 'bg-brand-50',    target: 'ativas' as const },
    { n: done,      label: 'Concluídas',  icon: '🏁', tone: 'bg-steel-100',   target: 'historico' as const },
  ];
  if (side) {
    return (
      <section className="rounded-2xl bg-white ring-1 ring-steel-200/70 p-4">
        <h2 className="text-sm font-bold text-steel-900 mb-3">Seus pedidos</h2>
        <div className="grid grid-cols-2 gap-2">
          {items.map(i => (
            <button key={i.label} type="button" onClick={() => onPick(i.target)}
              className="flex items-center gap-2.5 rounded-xl bg-steel-50 px-3 py-2.5 text-left hover:bg-brand-50 transition min-w-0">
              <span className={`grid place-items-center h-8 w-8 shrink-0 rounded-lg text-base ${i.tone}`} aria-hidden>{i.icon}</span>
              <span className="min-w-0">
                <span className={`block font-display text-lg font-bold leading-none tabular-nums ${i.n ? 'text-steel-900' : 'text-steel-300'}`}>{i.n}</span>
                <span className="block text-xs font-semibold text-steel-600 mt-0.5 leading-tight">{i.label}</span>
              </span>
            </button>
          ))}
        </div>
      </section>
    );
  }
  return (
    <div className="grid grid-cols-4 gap-2 sm:gap-3 mb-4">
      {items.map(i => (
        <button key={i.label} type="button" onClick={() => onPick(i.target)}
          className="min-h-[96px] rounded-2xl bg-white ring-1 ring-steel-200/70 p-2.5 sm:p-3.5 text-left active:scale-[0.98] hover:ring-brand-200 transition min-w-0">
          <span className={`inline-grid place-items-center h-8 w-8 sm:h-9 sm:w-9 rounded-xl text-base sm:text-lg ${i.tone}`} aria-hidden>{i.icon}</span>
          <div className={`font-display text-xl sm:text-2xl font-bold leading-none tabular-nums mt-2 ${i.n ? 'text-steel-900' : 'text-steel-300'}`}>{i.n}</div>
          <div className="text-xs font-semibold text-steel-600 mt-1 leading-tight">{i.label}</div>
        </button>
      ))}
    </div>
  );
}

/** Mecânicos disponíveis agora: foto, nota real, especialidades */
export function MechanicCarousel({ mechanics, list }: {
  mechanics: HomeMechanic[];
  /** Coluna lateral do computador: lista vertical em vez de carrossel */
  list?: boolean;
}) {
  if (!mechanics.length) return null;
  if (list) {
    return (
      <section className="rounded-2xl bg-white ring-1 ring-steel-200/70 p-4">
        <div className="flex items-center justify-between gap-2 mb-2">
          <h2 className="text-sm font-bold text-steel-900">Disponíveis agora</h2>
          <Link to="/oficina/buscar" className="text-xs font-semibold text-brand-600 hover:underline">Ver todos ›</Link>
        </div>
        <ul className="divide-y divide-steel-100">
          {mechanics.slice(0, 6).map(m => {
            const skills = (m.skills ?? []).filter(Boolean).slice(0, 2);
            return (
              <li key={m.id} className="flex items-center gap-3 py-2.5">
                <span className="relative shrink-0">
                  {m.avatar
                    ? <img src={m.avatar} alt="" className="h-10 w-10 rounded-full object-cover bg-steel-100" loading="lazy" />
                    : <span className="h-10 w-10 rounded-full bg-brand-50 grid place-items-center text-sm font-bold text-brand-700">{initials(m.name)}</span>}
                  <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-signal-500 ring-2 ring-white" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-steel-900 truncate">{firstLast(m.name)}</span>
                  <span className="block text-xs text-steel-600 truncate">
                    {m.rating > 0 ? <><span className="text-amber-500">★</span> {m.rating.toFixed(1).replace('.', ',')} · </> : 'Novo · '}
                    {skills.length ? skills.join(', ') : 'Mecânica geral'}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
        {mechanics.length > 6 && <Link to="/oficina/buscar" className="block text-center text-xs font-semibold text-brand-600 pt-2">+{mechanics.length - 6} disponíveis</Link>}
      </section>
    );
  }
  return (
    <section className="mb-5 rounded-2xl bg-white ring-1 ring-steel-200/70 py-4">
      <div className="flex items-center justify-between gap-2 px-4 mb-3">
        <h2 className="text-[15px] lg:text-lg font-bold text-steel-900">Mecânicos disponíveis agora</h2>
        <Link to="/oficina/buscar" className="text-sm font-semibold text-brand-600 min-h-[36px] inline-flex items-center">Ver todos ›</Link>
      </div>
      <ul className="flex gap-3 overflow-x-auto snap-x snap-mandatory px-4 pb-1 [scrollbar-width:none]">
        {mechanics.slice(0, 10).map(m => {
          const skills = (m.skills ?? []).filter(Boolean).slice(0, 3);
          return (
            <li key={m.id} className="snap-start shrink-0 w-[230px] rounded-2xl ring-1 ring-steel-200/70 p-3.5">
              <div className="flex items-center gap-3">
                <span className="relative shrink-0">
                  {m.avatar
                    ? <img src={m.avatar} alt="" className="h-14 w-14 rounded-full object-cover bg-steel-100" loading="lazy" />
                    : <span className="h-14 w-14 rounded-full bg-brand-50 grid place-items-center text-base font-bold text-brand-700">{initials(m.name)}</span>}
                  <span className="absolute bottom-0.5 right-0.5 h-3.5 w-3.5 rounded-full bg-signal-500 ring-2 ring-white" aria-hidden />
                </span>
                <div className="min-w-0">
                  <div className="font-semibold text-steel-900 text-[15px] leading-tight truncate">{firstLast(m.name)}</div>
                  <div className="text-xs text-steel-600 mt-0.5">
                    {m.rating > 0
                      ? <><span className="text-amber-500">★</span> {m.rating.toFixed(1).replace('.', ',')} <span className="text-steel-500">({m.total_jobs} {m.total_jobs === 1 ? 'serviço' : 'serviços'})</span></>
                      : 'Novo na plataforma'}
                  </div>
                </div>
              </div>
              <div className="text-xs text-steel-600 mt-2.5 min-h-[32px] leading-snug line-clamp-2">
                {skills.length ? skills.join(' · ') : 'Mecânica geral'}
              </div>
              <span className="mt-2 inline-flex items-center rounded-full bg-signal-50 px-2.5 py-1 text-xs font-semibold text-signal-700">Disponível</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
