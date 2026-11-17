/**
 * Placa → carro do cadastro. A consulta de placa devolve o texto do documento ("CHEVROLET",
 * "CRUZE LTZ NB", "PRATA"); o formulário de carro trabalha com as listas do sistema
 * (marca → modelo → ano). Aqui o texto vira a escolha da lista, para o carro já vir preenchido.
 */
import { VEHICLE_CATALOG, VEHICLE_MAKES } from './vehicleCatalog';

/** O que a consulta de placa devolve do carro */
export type PlateCarData = {
  make: string | null; model: string | null; version: string | null; year: number | null;
  fuel: string | null; engine_cc: number | null;
};

export type CarFromPlate = {
  make: string; model: string; year: string; modelInList: boolean;
  /** Motor pela cilindrada ("1.0", "1.8") e combustível ("Flex"); vazios quando a placa não informa */
  engine: string; fuel: string;
  /** "Motor 1.8 · Flex" — vai para as Obs. técnicas do carro */
  note: string;
};

/** Sem acento, minúsculo, só letras e números */
const tok = (s: string | null | undefined) =>
  (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** Siglas e grafias comuns do documento → nome da lista */
const MAKE_ALIAS: Record<string, string> = {
  vw: 'Volkswagen', gm: 'Chevrolet', chevroletgm: 'Chevrolet', gmchevrolet: 'Chevrolet',
  mmc: 'Mitsubishi', mb: 'Mercedes-Benz', mbenz: 'Mercedes-Benz', mercedes: 'Mercedes-Benz', mercedesbenz: 'Mercedes-Benz',
  citroen: 'Citroën', chery: 'Caoa Chery', caoachery: 'Caoa Chery', landrover: 'Land Rover', jacmotors: 'JAC',
};

const titleCase = (s: string) =>
  s.toLowerCase().replace(/(^|[\s\-/])([a-zà-ú])/g, (_m, a: string, b: string) => a + b.toUpperCase());

/** Marca da lista que corresponde ao texto da placa ('' se não achar) */
export function catalogMake(brand: string | null | undefined): string {
  // "I/VW" (importado) e "VW/GOL" → só a marca
  const cleaned = (brand ?? '').trim().replace(/^(?:I|IMP)\//i, '').split('/')[0];
  const t = tok(cleaned);
  if (!t) return '';
  if (MAKE_ALIAS[t]) return MAKE_ALIAS[t];
  const exact = VEHICLE_MAKES.find(m => tok(m) === t);
  if (exact) return exact;
  // "GM - Chevrolet", "Fiat Automóveis"… → começa com a marca da lista (ou o contrário)
  return VEHICLE_MAKES.find(m => t.length >= 3 && (t.startsWith(tok(m)) || tok(m).startsWith(t))) ?? '';
}

/**
 * Modelo da lista da marca que abre o texto do documento: "CRUZE LTZ NB" → "Cruze",
 * "ONIX PLUS 1.0" → "Onix Plus" (o nome mais longo ganha), "HB 20" → "HB20".
 * Sem correspondência, devolve o texto do documento em maiúsculas/minúsculas normais.
 */
export function catalogModel(make: string, model: string | null | undefined): { model: string; inList: boolean } {
  const raw = (model ?? '').trim().replace(/^[A-Za-z0-9.]+\//, ''); // "VW/GOL 1.0" → "GOL 1.0"
  if (!raw) return { model: '', inList: false };
  const words = raw.split(/\s+/);
  const list = [...(VEHICLE_CATALOG[make] ?? [])].sort((a, b) => tok(b).length - tok(a).length);
  for (const m of list) {
    for (let k = words.length; k >= 1; k--) {
      if (tok(words.slice(0, k).join('')) === tok(m)) return { model: m, inList: true };
    }
  }
  return { model: titleCase(raw), inList: false };
}

/** 1800 → "1.8", 999 → "1.0", 1598 → "1.6" ('' sem cilindrada) */
export function engineFromCc(cc: number | null | undefined): string {
  return cc && cc >= 500 && cc <= 9000 ? (Math.round(cc / 100) / 10).toFixed(1) : '';
}

/** Motores para o lojista escolher quando a placa não informa a cilindrada */
export const ENGINE_OPTIONS = ['1.0', '1.2', '1.3', '1.4', '1.5', '1.6', '1.8', '2.0', '2.2', '2.4', '2.5', '2.8', '3.0'];

/** O nome do modelo às vezes já traz o motor ("ONIX 1.0 LT", "GOL 1,6"); só vale o que está escrito assim */
export function engineHint(...texts: (string | null | undefined)[]): string {
  const m = texts.join(' ').match(/(?:^|[^0-9.,])([1-6])[.,]([0-9])(?![0-9])/);
  return m ? `${m[1]}.${m[2]}` : '';
}

/** "Motor 1.8 · Flex" (só o que existir) — vai para as Obs. técnicas do carro */
export const engineNote = (engine: string, fuel: string) =>
  [engine && `Motor ${engine}`, fuel].filter(Boolean).join(' · ');

/** "Alcool / Gasolina" → "Flex"; o resto vem com a primeira letra maiúscula */
export function fuelLabel(fuel: string | null | undefined): string {
  const t = tok(fuel);
  if (!t) return '';
  if (t.includes('alcool') && t.includes('gasolina')) return 'Flex';
  if (t.includes('etanol') && t.includes('gasolina')) return 'Flex';
  if (t === 'alcool') return 'Etanol';
  if (t.includes('gnv')) return 'GNV';
  return titleCase((fuel ?? '').trim());
}

/** Resposta da placa → valores do formulário de carro (marca, modelo, ano, motor) */
export function carFromPlate(car: PlateCarData): CarFromPlate {
  const make = catalogMake(car.make);
  const m = make ? catalogModel(make, car.model) : { model: titleCase((car.model ?? '').trim()), inList: false };
  const engine = engineFromCc(car.engine_cc) || engineHint(car.model, car.version);
  const fuel = fuelLabel(car.fuel);
  return {
    make: make || titleCase((car.make ?? '').trim()),
    model: m.model,
    year: car.year ? String(car.year) : '',
    modelInList: m.inList,
    engine, fuel,
    note: engineNote(engine, fuel),
  };
}
