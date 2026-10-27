import { useEffect, useMemo, useRef, useState } from 'react';
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
  const recent = useMemo(recentModels, []);

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
  const suggestions = focus ? searchModels(v.model, recent) : [];

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
            onFocus={() => setFocus(true)} onBlur={() => { setTimeout(() => setFocus(false), 150); if (v.model.trim()) rememberModel(v.model); }} />
        </div>
        <input ref={yearRef} className="input text-center" placeholder="Ano" inputMode="numeric" maxLength={4} autoComplete="off"
          aria-label="Ano do carro" value={v.year} onChange={e => update({ year: e.target.value.replace(/\D/g, '').slice(0, 4) })} />
      </div>
      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {suggestions.map(m => (
            // onMouseDown: escolhe antes do blur do campo esconder as sugestões
            <button key={m} type="button" onMouseDown={e => { e.preventDefault(); pick(m); }}
              className="min-h-[36px] rounded-full border border-steel-200 bg-white px-3 text-sm font-semibold text-steel-800 hover:border-brand-300 active:bg-brand-50">
              {m}
            </button>
          ))}
        </div>
      )}
      <input className="input uppercase" placeholder="Placa (opcional)" autoComplete="off"
        aria-label="Placa" value={v.plate} onChange={e => update({ plate: e.target.value })} />
    </div>
  );
}
