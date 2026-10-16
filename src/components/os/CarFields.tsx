import { useState } from 'react';
import { VEHICLE_CATALOG, VEHICLE_MAKES, vehicleYears } from '@/lib/vehicleCatalog';

const OTHER = '__other__';
const YEARS = vehicleYears();

export type CarValue = { make: string; model: string; year: string };

/**
 * Marca → Modelo → Ano para escolher em lista (sem digitar). O que não estiver na lista
 * se digita em "Outra marca…" / "Outro modelo…". A marca filtra os modelos.
 */
export default function CarFields({ value, onChange }: { value: CarValue; onChange: (v: CarValue) => void }) {
  const knownMake = !!VEHICLE_CATALOG[value.make];
  const models = knownMake ? VEHICLE_CATALOG[value.make] : [];
  // "Outro" fica ligado enquanto o valor digitado não é da lista (ou o usuário escolheu a opção)
  const [otherMake, setOtherMake] = useState<boolean>(() => !!value.make && !knownMake);
  const [otherModel, setOtherModel] = useState<boolean>(() => !!value.model && !!VEHICLE_CATALOG[value.make] && !VEHICLE_CATALOG[value.make].includes(value.model));

  const makeSel = otherMake ? OTHER : value.make;
  const modelSel = otherModel ? OTHER : value.model;

  return (
    <div className="grid grid-cols-2 gap-2">
      <div>
        <select className="input !py-2" value={makeSel} aria-label="Marca"
          onChange={e => {
            const v = e.target.value;
            setOtherModel(false);
            if (v === OTHER) { setOtherMake(true); onChange({ make: '', model: '', year: value.year }); }
            else { setOtherMake(false); onChange({ make: v, model: '', year: value.year }); }
          }}>
          <option value="">Marca…</option>
          {VEHICLE_MAKES.map(m => <option key={m} value={m}>{m}</option>)}
          <option value={OTHER}>Outra marca…</option>
        </select>
        {otherMake && (
          <input className="input !py-2 mt-1.5" placeholder="Digite a marca" value={value.make} autoFocus
            onChange={e => onChange({ ...value, make: e.target.value })} />
        )}
      </div>

      <div>
        {knownMake && !otherMake ? (
          <select className="input !py-2" value={modelSel} aria-label="Modelo"
            onChange={e => {
              const v = e.target.value;
              if (v === OTHER) { setOtherModel(true); onChange({ ...value, model: '' }); }
              else { setOtherModel(false); onChange({ ...value, model: v }); }
            }}>
            <option value="">Modelo…</option>
            {models.map(m => <option key={m} value={m}>{m}</option>)}
            <option value={OTHER}>Outro modelo…</option>
          </select>
        ) : (
          <input className="input !py-2" placeholder={otherMake || value.make ? 'Digite o modelo' : 'Escolha a marca primeiro'} value={value.model}
            disabled={!otherMake && !value.make} onChange={e => onChange({ ...value, model: e.target.value })} />
        )}
        {knownMake && !otherMake && otherModel && (
          <input className="input !py-2 mt-1.5" placeholder="Digite o modelo" value={value.model} autoFocus
            onChange={e => onChange({ ...value, model: e.target.value })} />
        )}
      </div>

      <select className="input !py-2 col-span-2 sm:col-span-1" value={value.year} aria-label="Ano"
        onChange={e => onChange({ ...value, year: e.target.value })}>
        <option value="">Ano…</option>
        {YEARS.map(y => <option key={y} value={String(y)}>{y}</option>)}
      </select>
    </div>
  );
}
