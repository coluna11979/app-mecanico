import { useState } from 'react';
import VehiclePicker from '@/components/parts/VehiclePicker';
import { PART_CATEGORIES, partCategory, type PartCategory } from '@/lib/parts';
import { fmtYears, isAnyModel, type VehicleDraft } from '@/lib/partVehicles';

// Estáveis: o seletor de carros reconstrói a lista só quando isto muda
const NO_BRANDS: string[] = [];
const NO_MODELS = () => NO_BRANDS;

const carText = (v: VehicleDraft) =>
  `${v.brand}${isAnyModel(v.model) ? ' (todos)' : ` ${v.model}`}${v.year_from != null || v.year_to != null ? ` ${fmtYears(v)}` : ''}`;

/**
 * Na conferência da nota: categoria e carros da peça, já preenchidos pela descrição e editáveis.
 * Categoria só para peça nova (a existente mantém a dela); carros para peça nova ou sem carro cadastrado.
 */
export default function NotePartOrganizer({ isNew, autoCategory, category, onCategory, vehicles, onVehicles }: {
  isNew: boolean; autoCategory: PartCategory | undefined;
  category: PartCategory | ''; onCategory: (c: PartCategory | '') => void;
  vehicles: VehicleDraft[]; onVehicles: (v: VehicleDraft[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const shown = vehicles.slice(0, 3).map(carText).join(', ') + (vehicles.length > 3 ? ` +${vehicles.length - 3}` : '');
  return (
    <div className="col-span-12 -mt-1 text-xs space-y-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-steel-600">
        {isNew && (
          <label className="flex items-center gap-1.5">
            <span>📂 Categoria</span>
            <select className="input !py-1 !px-2 text-xs !w-auto" value={category} onChange={e => onCategory(e.target.value as PartCategory | '')}>
              <option value="">{autoCategory ? `Automática (${partCategory(autoCategory).label})` : 'Automática'}</option>
              {PART_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.icon} {c.label}</option>)}
            </select>
          </label>
        )}
        <span className="flex flex-wrap items-center gap-1.5">
          <span>🚗</span>
          {vehicles.length
            ? <strong className="text-steel-700 font-semibold">{shown}</strong>
            : <span className="text-amber-700">sem carro definido — a peça não aparece na busca por carro</span>}
          <button type="button" onClick={() => setOpen(o => !o)} className="font-semibold text-brand-700 hover:underline">
            {open ? 'fechar' : vehicles.length ? 'editar' : 'adicionar carros'}
          </button>
        </span>
      </div>
      {open && (
        <div className="rounded-xl border border-steel-200 bg-white p-3">
          <VehiclePicker list={vehicles} onChange={onVehicles} extraBrands={NO_BRANDS} extraModels={NO_MODELS} />
        </div>
      )}
    </div>
  );
}
