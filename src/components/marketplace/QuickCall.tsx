import { useState } from 'react';
import { useStoredOpen } from '@/hooks/useStoredOpen';
import { formatBRL } from '@/lib/payment';
import {
  IconActivity, IconArrowRight, IconCheck, IconChevronDown, IconClipboardCheck, IconCog, IconDisc, IconDroplet,
  IconSearch, IconSnowflake, IconWrench, IconZap,
} from '@/components/mecanico/icons';

/** Mecânico disponível agora (mesmo formato da lista de Demandas) */
export type AvailableMechanic = { id: string; name: string; rating: number; total_jobs: number; hourly_rate: number };

/** Serviços mais pedidos: um toque abre a demanda já escrita, com tempo típico e preço estimado */
export type ServiceShortcut = { icon: (p: { className?: string }) => JSX.Element; label: string; title: string; description: string; hours: number };

export const SERVICE_SHORTCUTS: ServiceShortcut[] = [
  { icon: IconDroplet, label: 'Troca de óleo',  hours: 1,   title: 'Troca de óleo e filtros',
    description: 'Troca de óleo do motor e filtro de óleo (filtro de ar/combustível se precisar). Peças por conta da oficina.' },
  { icon: IconDisc, label: 'Freios',         hours: 1.5, title: 'Troca de pastilhas / discos de freio',
    description: 'Substituição de pastilhas e, se necessário, discos de freio. Conferir fluido e sangria.' },
  { icon: IconActivity, label: 'Suspensão',      hours: 2,   title: 'Serviço de suspensão',
    description: 'Troca de amortecedores, bandejas, buchas ou pivôs conforme diagnóstico.' },
  { icon: IconSearch, label: 'Diagnóstico',    hours: 1,   title: 'Diagnóstico com scanner',
    description: 'Leitura de falhas com scanner e diagnóstico do problema relatado pelo cliente.' },
  { icon: IconZap, label: 'Elétrica',       hours: 1.5, title: 'Serviço de elétrica automotiva',
    description: 'Diagnóstico e reparo elétrico (bateria, alternador, motor de arranque, chicote, iluminação).' },
  { icon: IconCog, label: 'Embreagem',      hours: 3,   title: 'Troca de kit de embreagem',
    description: 'Substituição do kit de embreagem (platô, disco e rolamento). Peças por conta da oficina.' },
  { icon: IconClipboardCheck, label: 'Revisão',        hours: 2,   title: 'Revisão preventiva',
    description: 'Revisão geral: fluidos, filtros, freios, suspensão, correias e itens de segurança.' },
  { icon: IconSnowflake, label: 'Ar-cond.', hours: 1.5, title: 'Serviço de ar-condicionado',
    description: 'Higienização, carga de gás ou diagnóstico do ar-condicionado.' },
];

/** Valor/hora "do meio" entre os mecânicos disponíveis (null = ninguém disponível) */
export function medianRate(mechanics: AvailableMechanic[]): number | null {
  const rates = mechanics.map(m => Number(m.hourly_rate)).filter(r => r > 0).sort((a, b) => a - b);
  if (!rates.length) return null;
  const mid = Math.floor(rates.length / 2);
  return rates.length % 2 ? rates[mid] : (rates[mid - 1] + rates[mid]) / 2;
}

/** Preço estimado arredondado de 5 em 5 (fica com cara de valor fechado) */
export const estimatePrice = (rate: number, hours: number) => Math.max(5, Math.round((rate * hours) / 5) * 5);

const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase() ?? '').join('');

/** Topo das Demandas: quem está disponível agora + atalhos dos serviços mais pedidos */
export function QuickCall({ mechanics, disabled, onShortcut, compact, storageKey }: {
  mechanics: AvailableMechanic[];
  disabled?: boolean;
  /** Abre a Nova demanda com os serviços marcados (um ou vários: um mecânico faz todos) */
  onShortcut: (list: ServiceShortcut[]) => void;
  /** Só os atalhos (quem está disponível aparece no cartão principal e no carrossel) */
  compact?: boolean;
  /** Com chave, os atalhos ficam recolhidos e a oficina abre quando quiser (lembra a escolha) */
  storageKey?: string | null;
}) {
  const collapsible = storageKey !== undefined;
  const [stored, toggleOpen] = useStoredOpen(storageKey ?? null);
  const open = !collapsible || stored;
  const rate = medianRate(mechanics);
  const rates = mechanics.map(m => Number(m.hourly_rate)).filter(r => r > 0);
  const rated = mechanics.filter(m => m.rating > 0);
  const avgRating = rated.length ? rated.reduce((s, m) => s + m.rating, 0) / rated.length : null;
  const n = mechanics.length;
  /** Atalhos marcados (na ordem em que foram tocados) */
  const [picked, setPicked] = useState<string[]>([]);
  const toggle = (label: string) => setPicked(p => (p.includes(label) ? p.filter(x => x !== label) : [...p, label]));
  const pickedList = picked.map(l => SERVICE_SHORTCUTS.find(s => s.label === l)!).filter(Boolean);

  return (
    <section className="mb-3 rounded-xl bg-white border border-steel-200 overflow-hidden">
      {/* Disponíveis agora */}
      {!compact && (
      <div className="px-4 py-3.5 flex items-center gap-3 border-b border-steel-100">
        {n > 0 ? (
          <div className="flex -space-x-2 shrink-0" aria-hidden>
            {mechanics.slice(0, 3).map(m => (
              <span key={m.id} className="h-9 w-9 rounded-full bg-brand-50 ring-2 ring-white grid place-items-center text-[11px] font-bold text-brand-700">
                {initials(m.name)}
              </span>
            ))}
            {n > 3 && (
              <span className="h-9 w-9 rounded-full bg-steel-100 ring-2 ring-white grid place-items-center text-[11px] font-bold text-steel-600">+{n - 3}</span>
            )}
          </div>
        ) : (
          <span className="h-9 w-9 rounded-full bg-steel-100 grid place-items-center shrink-0" aria-hidden>🔔</span>
        )}
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 font-semibold text-steel-900 text-[15px] leading-tight">
            {n > 0 && <span className="h-2 w-2 rounded-full bg-signal-500 animate-pulse-soft shrink-0" />}
            {n > 0 ? `${n} ${n === 1 ? 'mecânico disponível' : 'mecânicos disponíveis'} agora` : 'Publique e avisamos os mecânicos'}
          </div>
          <div className="text-xs text-steel-500 mt-0.5">
            {n > 0
              ? [avgRating != null && `★ ${avgRating.toFixed(1)} em média`,
                 rates.length && (Math.min(...rates) === Math.max(...rates)
                   ? `R$ ${Math.min(...rates).toFixed(0)}/h`
                   : `R$ ${Math.min(...rates).toFixed(0)}–${Math.max(...rates).toFixed(0)}/h`),
                 'verificados'].filter(Boolean).join(' · ')
              : 'Cada demanda nova chega na hora no celular deles.'}
          </div>
        </div>
      </div>
      )}

      {collapsible && (
        <button type="button" onClick={toggleOpen} aria-expanded={open}
          className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-steel-50 transition">
          <IconWrench className="w-5 h-5 shrink-0 text-steel-400" />
          <span className="flex-1 min-w-0">
            <span className="block font-semibold text-steel-900">Atalhos de serviço</span>
            <span className="block text-xs text-steel-500 mt-0.5">Os mais pedidos, com a descrição pronta</span>
          </span>
          
          <IconChevronDown className={`w-4 h-4 text-steel-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      )}

      {/* Atalhos: toque para marcar (um ou vários) e "Continuar" abre a demanda pronta */}
      {open && (
      <div className={`px-4 pb-4 ${collapsible ? 'pt-1 border-t border-steel-100' : 'pt-3'}`}>
        <div className={`flex items-baseline gap-2 mb-2 ${collapsible ? 'justify-end pt-2' : 'justify-between'}`}>
          {!collapsible && <div className="text-[11px] font-bold uppercase tracking-widest text-steel-500">Do que você precisa?</div>}
          <div className="text-[11px] text-steel-500">{picked.length ? `${picked.length} marcado${picked.length > 1 ? 's' : ''}` : 'marque um ou vários'}</div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {SERVICE_SHORTCUTS.map(s => {
            const on = picked.includes(s.label);
            return (
            <button
              key={s.label}
              type="button"
              disabled={disabled}
              onClick={() => toggle(s.label)}
              aria-pressed={on}
              className={`relative min-h-[52px] flex items-center gap-2.5 rounded-xl border px-3 py-2 text-left active:scale-[0.98] transition disabled:opacity-50 ${
                on ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-500' : 'border-steel-200 hover:border-brand-300'}`}
            >
              {on && <span className="absolute top-1.5 right-1.5 h-5 w-5 rounded-full bg-brand-500 text-white grid place-items-center" aria-hidden><IconCheck className="w-3 h-3" /></span>}
              <span className={`h-8 w-8 shrink-0 rounded-lg grid place-items-center ${on ? 'bg-brand-500 text-white' : 'bg-steel-100 text-steel-600'}`}><s.icon className="w-4 h-4" /></span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-steel-900 leading-tight">{s.label}</span>
              </span>
            </button>
            );
          })}
        </div>

        {/* Marcados: um mecânico faz todos numa demanda só */}
        {pickedList.length > 0 && (
          <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-brand-50 ring-1 ring-brand-200 px-3 py-2.5">
            <div className="min-w-0">
              <div className="text-sm font-bold text-steel-900">
                {pickedList.length} {pickedList.length === 1 ? 'serviço marcado' : 'serviços marcados'}
              </div>
              <div className="text-[11px] text-steel-600 leading-tight">
                {pickedList.length > 1 ? 'um mecânico faz todos · ' : ''}
                <button type="button" onClick={() => setPicked([])} className="underline">limpar</button>
              </div>
            </div>
            <button type="button" disabled={disabled} onClick={() => { onShortcut(pickedList); setPicked([]); }}
              className="shrink-0 h-11 px-4 inline-flex items-center gap-1.5 rounded-xl bg-brand-500 text-white text-sm font-bold active:scale-[0.98] hover:bg-brand-600 disabled:opacity-50">
              Continuar<IconArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
      )}
    </section>
  );
}

/** Oficina que nunca contratou: explica em 3 passos e puxa para a primeira demanda */
export function FirstDemandHero({ onCall, disabled }: { onCall: () => void; disabled?: boolean }) {
  const steps = [
    { n: 1, t: 'Publique o serviço', d: 'Em 1 minuto, com o valor fechado que você define.' },
    { n: 2, t: 'Um mecânico aceita', d: 'Verificado, com nota de outras oficinas. Você acompanha a chegada no mapa.' },
    { n: 3, t: 'Pague só pelo serviço', d: 'Sem CLT, sem encargos, sem salário parado no pátio vazio.' },
  ];
  return (
    <section className="mb-8 rounded-2xl bg-steel-900 text-white p-5 sm:p-6 overflow-hidden relative">
      <div className="text-[11px] font-bold uppercase tracking-widest text-brand-400">⚡ Mecânico sob demanda</div>
      <h2 className="font-display text-xl sm:text-2xl font-bold leading-tight mt-1.5">
        Pátio cheio ou mecânico faltou? Chame um profissional hoje.
      </h2>
      <ol className="mt-4 grid sm:grid-cols-3 gap-3">
        {steps.map(s => (
          <li key={s.n} className="flex gap-3 sm:block">
            <span className="h-7 w-7 shrink-0 rounded-full bg-brand-500 grid place-items-center text-sm font-bold">{s.n}</span>
            <span className="min-w-0 sm:block sm:mt-2">
              <span className="block font-semibold text-[15px] leading-tight">{s.t}</span>
              <span className="block text-sm text-steel-300 mt-0.5">{s.d}</span>
            </span>
          </li>
        ))}
      </ol>
      <button
        type="button"
        onClick={onCall}
        disabled={disabled}
        className="mt-5 w-full sm:w-auto inline-flex items-center justify-center gap-2 h-12 px-6 rounded-xl bg-brand-500 text-white font-bold active:scale-[0.99] hover:bg-brand-600 transition disabled:opacity-50"
      >
        ⚡ Publicar primeira demanda
      </button>
    </section>
  );
}
