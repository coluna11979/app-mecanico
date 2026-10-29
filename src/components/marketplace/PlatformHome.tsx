import { Link } from 'react-router-dom';
import { useStoredOpen } from '@/hooks/useStoredOpen';
import { Logo } from '@/components/Logo';
import { IconChevronDown, IconPlus, IconStar } from '@/components/mecanico/icons';
import { TourHelpButton } from '@/components/marketplace/PanelTour';

/** Mecânico disponível com o que o carrossel mostra (foto e especialidades são opcionais) */
export type HomeMechanic = {
  id: string; name: string; rating: number; total_jobs: number;
  skills?: string[] | null; avatar?: string | null;
};

const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase() ?? '').join('');
const firstLast = (name: string) => { const p = name.trim().split(/\s+/); return p.length > 1 ? `${p[0]} ${p[p.length - 1]}` : p[0]; };

/** Topo da tela: título, quem está disponível e a ação principal */
export function PlatformHero({ available, onCall, disabled, locked, onHelp }: {
  available: number; onCall: () => void; disabled?: boolean;
  /** Multa pendente: não dá para publicar */
  locked?: boolean;
  /** "Como usar esta tela": reabre o guia */
  onHelp?: () => void;
}) {
  return (
    <header data-tour="hero" className="mb-4 sm:flex sm:items-end sm:justify-between sm:gap-4">
      <div className="min-w-0">
        {/* Marca no celular (no computador ela já está na barra lateral) */}
        <div className="lg:hidden mb-3 flex items-center gap-2">
          <Logo size={26} withText={false} />
          <span className="font-display text-base font-bold tracking-tight text-steel-900">Mecânico<span className="text-brand-500">App</span></span>
        </div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight text-steel-900">Demandas</h1>
          {onHelp && <TourHelpButton onClick={onHelp} />}
        </div>
        <p className="mt-1 flex items-center gap-1.5 text-sm text-steel-600">
          <span className={`h-2 w-2 rounded-full shrink-0 ${available > 0 ? 'bg-signal-500' : 'bg-steel-300'}`} aria-hidden />
          {available > 0
            ? `${available} ${available === 1 ? 'mecânico disponível' : 'mecânicos disponíveis'} agora`
            : 'Nenhum mecânico online agora. A demanda fica aberta até alguém aceitar.'}
        </p>
      </div>
      <button type="button" onClick={onCall} disabled={disabled}
        className="mt-3 sm:mt-0 w-full sm:w-auto shrink-0 inline-flex items-center justify-center gap-2 h-12 px-5 rounded-xl bg-brand-500 text-white text-[15px] font-semibold active:scale-[0.99] hover:bg-brand-600 transition disabled:opacity-60">
        {locked ? 'Quite a multa para publicar' : <><IconPlus className="w-5 h-5" />Nova demanda</>}
      </button>
    </header>
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
    { n: searching, label: 'Em busca',    dot: 'bg-pending-500', target: 'ativas' as const },
    { n: accepted,  label: 'Aceitas',     dot: 'bg-signal-500',  target: 'ativas' as const },
    { n: working,   label: 'Em execução', dot: 'bg-brand-500',   target: 'ativas' as const },
    { n: done,      label: 'Concluídas',  dot: 'bg-steel-400',   target: 'historico' as const },
  ];
  if (side) {
    return (
      <section className="rounded-2xl bg-white ring-1 ring-steel-200/70 p-4">
        <h2 className="text-sm font-bold text-steel-900 mb-3">Seus pedidos</h2>
        <div className="grid grid-cols-2 gap-2">
          {items.map(i => (
            <button key={i.label} type="button" onClick={() => onPick(i.target)}
              className="flex items-center gap-2.5 rounded-xl bg-steel-50 px-3 py-2.5 text-left hover:bg-brand-50 transition min-w-0">
              <span className={`h-2 w-2 shrink-0 rounded-full ${i.dot}`} aria-hidden />
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
    <div className="grid grid-cols-4 mb-3 rounded-xl bg-white border border-steel-200 divide-x divide-steel-200">
      {items.map(i => (
        <button key={i.label} type="button" onClick={() => onPick(i.target)}
          className="min-h-[64px] px-2 py-2.5 text-left active:bg-steel-50 transition min-w-0 first:rounded-l-xl last:rounded-r-xl">
          <div className={`font-display text-xl font-bold leading-none tabular-nums ${i.n ? 'text-steel-900' : 'text-steel-300'}`}>{i.n}</div>
          <div className="mt-1.5 flex items-center gap-1 text-[11px] font-medium text-steel-500 leading-tight min-w-0">
            <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${i.dot}`} aria-hidden /><span className="truncate">{i.label}</span>
          </div>
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

/**
 * ⭐ Meus preferidos — os mecânicos que a oficina marcou com estrela, recolhido como o Histórico.
 * Mostra se cada um está disponível agora e "Chamar" já abre a demanda como convite direto para ele.
 * `list` = coluna lateral do computador (lista vertical).
 */
export function FavoriteMechanics({ mechanics, storageKey, onCall, disabled, list }: {
  mechanics: (HomeMechanic & { available: boolean })[];
  storageKey: string | null;
  onCall: (mechanicId: string) => void;
  disabled?: boolean;
  list?: boolean;
}) {
  const [open, toggle] = useStoredOpen(storageKey);
  const online = mechanics.filter(m => m.available).length;
  const sorted = [...mechanics].sort((a, b) => Number(b.available) - Number(a.available) || b.rating - a.rating);

  return (
    <section className={`${list ? '' : 'mb-3'} rounded-xl bg-white border border-steel-200 overflow-hidden`}>
      <button type="button" onClick={toggle} aria-expanded={open}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-steel-50 transition">
        <IconStar className="w-5 h-5 shrink-0 text-steel-400" />
        <span className="flex-1 min-w-0">
          <span className="block font-semibold text-steel-900">Meus preferidos{mechanics.length ? ` · ${mechanics.length}` : ''}</span>
          <span className="block text-xs text-steel-500 mt-0.5 truncate">
            {!mechanics.length ? 'Marque a estrela nos mecânicos em quem você confia'
              : online ? `${online} ${online === 1 ? 'disponível' : 'disponíveis'} agora` : 'Nenhum disponível agora'}
          </span>
        </span>
        <IconChevronDown className={`w-4 h-4 text-steel-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="border-t border-steel-100 pt-3 pb-4">
          {!mechanics.length ? (
            <div className="px-4 text-sm text-steel-600">
              Toque na estrela de um mecânico em <Link to="/oficina/buscar" className="font-semibold text-brand-600 underline">Buscar profissionais</Link> ou
              ao escolher "Um mecânico" na demanda. Ele aparece aqui para chamar com um toque.
            </div>
          ) : (
            <ul className={list ? 'px-4 divide-y divide-steel-100' : 'flex gap-3 overflow-x-auto snap-x snap-mandatory px-4 pb-1 [scrollbar-width:none]'}>
              {sorted.map(m => {
                const skills = (m.skills ?? []).filter(Boolean).slice(0, list ? 2 : 3);
                const avatar = (size: string, text: string) => (
                  <span className="relative shrink-0">
                    {m.avatar
                      ? <img src={m.avatar} alt="" className={`${size} rounded-full object-cover bg-steel-100`} loading="lazy" />
                      : <span className={`${size} rounded-full bg-brand-50 grid place-items-center ${text} font-bold text-brand-700`}>{initials(m.name)}</span>}
                    <span className={`absolute bottom-0 right-0 h-3 w-3 rounded-full ring-2 ring-white ${m.available ? 'bg-signal-500' : 'bg-steel-300'}`} aria-hidden />
                  </span>
                );
                const call = (
                  <button type="button" disabled={disabled} onClick={() => onCall(m.id)}
                    className="shrink-0 h-10 px-3 rounded-lg bg-brand-500 text-white text-xs font-bold active:scale-95 hover:bg-brand-600 disabled:opacity-50">
                    Chamar
                  </button>
                );
                if (list) return (
                  <li key={m.id} className="flex items-center gap-3 py-2.5">
                    {avatar('h-10 w-10', 'text-sm')}
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-steel-900 truncate">{firstLast(m.name)}</span>
                      <span className="block text-xs text-steel-600 truncate">
                        {m.available ? 'Disponível' : 'Offline'} · {m.rating > 0 ? <><span className="text-amber-500">★</span> {m.rating.toFixed(1).replace('.', ',')}</> : 'Novo'}
                      </span>
                    </span>
                    {call}
                  </li>
                );
                return (
                  <li key={m.id} className="snap-start shrink-0 w-[230px] rounded-2xl ring-1 ring-steel-200/70 p-3.5">
                    <div className="flex items-center gap-3">
                      {avatar('h-14 w-14', 'text-base')}
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
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${m.available ? 'bg-signal-50 text-signal-700' : 'bg-steel-100 text-steel-600'}`}>
                        {m.available ? 'Disponível' : 'Offline'}
                      </span>
                      {call}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
