import { CSSProperties, useId, useState } from 'react';
import { ButtonLink } from './ui';

const WEEKS_PER_MONTH = 52 / 12;
const MIN = 1;
const MAX = 30;
const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

/**
 * Simulação simples: serviços perdidos/semana × ticket médio. Não é promessa de ganho.
 * Mobile: campos empilhados → resultado → CTA → observação. Desktop: campos | resultado.
 */
export function ImpactCalculator({ ctaTo }: { ctaTo: string }) {
  const [perWeek, setPerWeek] = useState(3);
  const [ticket, setTicket] = useState(450);
  const weekId = useId();
  const ticketId = useId();

  const month = perWeek * ticket * WEEKS_PER_MONTH;
  const year = perWeek * ticket * 52;
  const step = (d: number) => setPerWeek(v => Math.min(MAX, Math.max(MIN, v + d)));
  const fill = { '--fill': `${((perWeek - MIN) / (MAX - MIN)) * 100}%` } as CSSProperties;

  return (
    <div className="overflow-hidden rounded-3xl border border-steel-100 bg-white shadow-xl shadow-steel-900/5 lg:grid lg:grid-cols-2">
      <div className="space-y-7 p-5 sm:p-8">
        <div>
          <label htmlFor={weekId} className="block text-base font-bold text-steel-900">
            Serviços adiados ou recusados por semana
          </label>
          <div className="mt-3 flex items-center gap-3">
            <StepButton label="Diminuir" onClick={() => step(-1)} disabled={perWeek <= MIN}>−</StepButton>
            <output htmlFor={weekId} className="flex-1 text-center font-display text-4xl font-bold text-brand-600">{perWeek}</output>
            <StepButton label="Aumentar" onClick={() => step(1)} disabled={perWeek >= MAX}>+</StepButton>
          </div>
          <input id={weekId} type="range" min={MIN} max={MAX} step={1} value={perWeek}
            onChange={e => setPerWeek(Number(e.target.value))}
            style={fill} className="range-touch mt-2 w-full" />
          <div className="flex justify-between text-xs text-steel-500"><span>{MIN}</span><span>{MAX}</span></div>
        </div>

        <div>
          <label htmlFor={ticketId} className="block text-base font-bold text-steel-900">Ticket médio por serviço</label>
          <div className="mt-3 flex min-h-[56px] items-center rounded-xl border border-steel-200 bg-steel-50 px-4 focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/20">
            <span className="text-lg text-steel-500">R$</span>
            <input id={ticketId} type="number" inputMode="numeric" min={0} step={10} value={ticket}
              onChange={e => setTicket(Math.max(0, Number(e.target.value) || 0))}
              onFocus={e => e.target.select()}
              className="w-full bg-transparent px-2 py-3 font-display text-2xl font-bold text-steel-900 outline-none" />
          </div>
          <div className="mt-3 grid grid-cols-4 gap-1.5 sm:flex sm:flex-wrap sm:gap-2" role="group" aria-label="Valores rápidos de ticket">
            {[250, 450, 800, 1200].map(v => (
              <button key={v} type="button" onClick={() => setTicket(v)} aria-pressed={ticket === v}
                className={`min-h-[44px] whitespace-nowrap rounded-full border px-1 text-[13px] font-semibold transition sm:px-4 sm:text-sm ${
                  ticket === v ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-steel-200 text-steel-600 hover:border-steel-300'
                }`}>
                {brl(v)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-col bg-steel-900 p-5 text-white sm:p-8">
        <div aria-live="polite">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-400">Estimativa de faturamento perdido</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-1 lg:gap-5">
            <div>
              <p className="text-sm text-steel-300">Por mês</p>
              <p className="font-display text-[2.5rem] font-bold leading-none tracking-tight sm:text-5xl">{brl(month)}</p>
            </div>
            <div>
              <p className="text-sm text-steel-300">Por ano</p>
              <p className="font-display text-2xl font-bold leading-tight text-brand-400 sm:text-4xl">{brl(year)}</p>
            </div>
          </div>
        </div>
        <ButtonLink to={ctaTo} arrow className="mt-7 w-full lg:mt-auto">Cadastrar minha oficina</ButtonLink>
        <p className="mt-5 text-xs leading-relaxed text-steel-300">
          Simulação com base nos números que você informou. Não é garantia de faturamento:
          o resultado real depende da demanda da oficina e da disponibilidade de profissionais na região.
        </p>
      </div>
    </div>
  );
}

function StepButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled: boolean; children: string }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={label}
      className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-steel-200 text-2xl font-bold text-steel-700 transition hover:border-brand-300 hover:text-brand-600 active:scale-95 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
      {children}
    </button>
  );
}
