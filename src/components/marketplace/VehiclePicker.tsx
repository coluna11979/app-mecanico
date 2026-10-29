import { useEffect, useRef, useState } from 'react';
import { joinVehicle, recentModels, rememberModel, searchModels, splitVehicle } from '@/lib/carModels';

/**
 * Veículo da Nova demanda: Carro (busca o modelo, sem marca) + Ano, e a placa opcional.
 * Devolve o mesmo texto de sempre para o mecânico: "Gol prata 2015 · ABC1D23".
 */
export default function VehiclePicker({ value, onChange, icon }: {
  value: string; onChange: (v: string) => void; icon?: React.ReactNode;
}) {
  const [v, setV] = useState(() => splitVehicle(value));
  const [focus, setFocus] = useState(false);
  const yearRef = useRef<HTMLInputElement>(null);
  const [recent, setRecent] = useState<string[]>(recentModels);

  // Sempre parte do último valor (dois campos mudando antes de redesenhar não se atropelam)
  const latest = useRef(v);
  latest.current = v;

  // O texto mudou por fora (rascunho, cliente, editar): relê
  useEffect(() => {
    if (value !== joinVehicle(latest.current)) setV(splitVehicle(value));
  }, [value]);
  const update = (patch: Partial<typeof v>) => {
    const next = { ...latest.current, ...patch };
    latest.current = next;
    setV(next);
    onChange(joinVehicle(next));
  };
  const typed = v.model.trim().length > 0;
  // Campo vazio: os últimos carros usados (como os endereços recentes do Uber); digitando: a busca
  const suggestions = focus ? (typed ? searchModels(v.model, recent) : recent.slice(0, 6)) : [];

  function pick(model: string) {
    update({ model });
    rememberModel(model);
    setFocus(false);
    yearRef.current?.focus();
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[1fr_96px] gap-2">
        <div className="relative">
          {icon}
          <input id="job-vehicle" className={`input ${icon ? '!pl-11' : ''}`} placeholder="Carro (ex.: Gol)" autoComplete="off"
            value={v.model} onChange={e => update({ model: e.target.value })}
            onFocus={() => { setRecent(recentModels()); setFocus(true); }} onBlur={() => { setTimeout(() => setFocus(false), 150); if (v.model.trim()) rememberModel(v.model); }} />
          {/* Abre para baixo, por cima do resto do formulário */}
          {suggestions.length > 0 && (
            <div className="absolute left-0 right-0 top-full mt-1.5 z-30 rounded-xl border border-steel-200 bg-white shadow-xl overflow-hidden">
              {!typed && <div className="px-4 pt-2.5 pb-1 text-[11px] font-bold uppercase tracking-widest text-steel-400">Recentes</div>}
              {suggestions.map(m => (
                // onMouseDown: escolhe antes do blur do campo esconder a lista
                <button key={m} type="button" onMouseDown={e => { e.preventDefault(); pick(m); }}
                  className="w-full min-h-[48px] px-4 flex items-center gap-3 text-left border-t first:border-t-0 border-steel-100 hover:bg-steel-50 active:bg-brand-50">
                  <span className="h-8 w-8 shrink-0 rounded-full bg-steel-100 text-steel-500 grid place-items-center" aria-hidden>
                    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 17h14M6 17l1.5-6h9L18 17M7 17v2M17 17v2"/></svg>
                  </span>
                  <span className="text-sm font-semibold text-steel-900 truncate">{m}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <input ref={yearRef} className="input text-center" placeholder="Ano" inputMode="numeric" maxLength={4} autoComplete="off"
          aria-label="Ano do carro" value={v.year} onChange={e => update({ year: e.target.value.replace(/\D/g, '').slice(0, 4) })} />
      </div>
      <input className="input uppercase" placeholder="Placa (opcional)" autoComplete="off"
        aria-label="Placa" value={v.plate} onChange={e => update({ plate: e.target.value })} />
    </div>
  );
}
