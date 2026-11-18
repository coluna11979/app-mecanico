/**
 * Descobre em quais carros a peça serve a partir da descrição da nota ("SILENCIOSO CELTA 1.0 2012/2016",
 * "PASTILHA FREIO HONDA"). Usa o catálogo de veículos do sistema. Só afirma o que está escrito:
 * nome de modelo → marca + modelo (com ano quando fica claro); só a marca → "todos os modelos" da marca.
 */
import { VEHICLE_CATALOG } from '@/lib/vehicleCatalog';
import { ANY_MODEL, type VehicleDraft } from '@/lib/partVehicles';

/** Maiúsculas, sem acento, só letras/números, com espaço nas pontas ("  COXIM MOTOR FIT  ") */
const N = (s: string) =>
  ` ${(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim()} `;

// Modelos ambíguos (palavra comum, número/ano, sigla): não valem como pista
const SKIP = new Set(['Tipo', 'One', 'Up!', 'HR', 'Soul', 'Leaf', 'Seal', 'Tan', 'Han', 'Face', 'QQ', 'Cargo', 'Expert', 'Partner',
  'Master', 'Edge', 'Joy', 'Ram', '1500', '2500', '3500', 'Rampage', 'T4', 'FH', 'VM', 'IS', 'ES', 'NX', 'RX', 'UX',
  '911', 'Z4', 'M3', 'A1', 'A3', 'A4', 'A5', 'A6', 'TT', 'Q3', 'Q5', 'Q7', 'Fit', 'City', 'Classe A', 'Classe C',
  'Classe E', 'ML', 'Vito', 'J3', 'J5', 'J6', 'T40', 'T50', 'T60', 'T8', 'Swift', 'Bongo', 'Optima', 'Cooper',
  'Clubman', 'Countryman', 'Neon', 'Journey', 'Dakota', 'Charger', 'Challenger', 'Impreza', 'Legacy', 'Outback',
  'Forester', 'XV', 'WRX', 'Poer', 'Tiggo 2', 'Celer', 'iCar', '500', 'Ka Sedan', 'Fiesta Sedan', 'Etios Sedan',
  'Onix Plus', 'Cruze Sport6', 'Sandero Stepway', 'Duster Oroch', 'Civic Si', 'Stepway', 'Grand Livina', 'Ranger']);
const NUMERIC_PEUGEOT = ['206', '207', '208', '307', '308', '408', '2008', '3008', '5008', '106', '404'];

// Apelidos e erros de digitação comuns nas notas
const ALIAS: Record<string, [string, string]> = {
  'KADET': ['Chevrolet', 'Kadett'], 'SRADA': ['Fiat', 'Strada'], 'ESCRT': ['Ford', 'Escort'],
  'WIKEND': ['Fiat', 'Palio Weekend'], 'WEEKEND': ['Fiat', 'Palio Weekend'],
  'ECO SPORT': ['Ford', 'EcoSport'], 'ECO SPORTE': ['Ford', 'EcoSport'], 'ECOSPORTE': ['Ford', 'EcoSport'],
  'CROSS FOX': ['Volkswagen', 'CrossFox'], 'SPACE FOX': ['Volkswagen', 'SpaceFox'],
  'BLAIZER': ['Chevrolet', 'Blazer'], 'IDEIA': ['Fiat', 'Idea'], 'DOBLO': ['Fiat', 'Doblò'], 'SIENE': ['Fiat', 'Siena'],
  'GRAN SIENA': ['Fiat', 'Grand Siena'], 'COSRA': ['Chevrolet', 'Corsa'], 'COSSA': ['Chevrolet', 'Corsa'],
  'LOGAM': ['Renault', 'Logan'], 'G4': ['Volkswagen', 'Gol'], 'G5': ['Volkswagen', 'Gol'], 'G6': ['Volkswagen', 'Gol'],
  'GOL BOLA': ['Volkswagen', 'Gol'], 'SAVEIRO BOLA': ['Volkswagen', 'Saveiro'],
  'HB 20': ['Hyundai', 'HB20'], 'I 30': ['Hyundai', 'i30'], 'IX 35': ['Hyundai', 'ix35'], 'S 10': ['Chevrolet', 'S10'],
  'SENIC': ['Renault', 'Scénic'], 'SCENIC': ['Renault', 'Scénic'], 'HONDA FIT': ['Honda', 'Fit'], 'HONDA CITY': ['Honda', 'City'],
  'KICKIS': ['Nissan', 'Kicks'], 'CLEO': ['Renault', 'Clio'], 'BRAVA': ['Fiat', 'Brava'],
  'SANATANA': ['Volkswagen', 'Santana'], 'QUANTUM': ['Volkswagen', 'Quantum'], 'APOLO': ['Volkswagen', 'Apollo'],
  'APOLLO': ['Volkswagen', 'Apollo'], 'HOBY': ['Ford', 'Escort'], 'HOBBY': ['Ford', 'Escort'], 'CORRIER': ['Ford', 'Courier'],
  'FILDER': ['Toyota', 'Fielder'], 'LOCKER': ['Fiat', 'Strada'], 'NOVO UNO': ['Fiat', 'Uno'], 'ELB': ['Fiat', 'Elba'],
  'CARAVAN': ['Chevrolet', 'Caravan'], 'CHEVETTE': ['Chevrolet', 'Chevette'], 'CHEVETE': ['Chevrolet', 'Chevette'],
  'MARAJO': ['Chevrolet', 'Marajó'], 'BRASILIA': ['Volkswagen', 'Brasília'], 'PAMPA': ['Ford', 'Pampa'],
  'OMEGA': ['Chevrolet', 'Omega'], 'IPANEMA': ['Chevrolet', 'Ipanema'], 'VERA CRUZ': ['Hyundai', 'Veracruz'],
  'XSARA': ['Citroën', 'Xsara Picasso'], 'PICASSO': ['Citroën', 'Xsara Picasso'],
  'HILLUX': ['Toyota', 'Hilux'], 'HILUX': ['Toyota', 'Hilux'],
};

// Só a marca citada ("PASTILHA FREIO HONDA")
const BRANDS: Record<string, string> = {
  HONDA: 'Honda', TOYOTA: 'Toyota', FIAT: 'Fiat', FORD: 'Ford', RENAULT: 'Renault', HYUNDAI: 'Hyundai', NISSAN: 'Nissan',
  PEUGEOT: 'Peugeot', PEUGEOUT: 'Peugeot', CITROEN: 'Citroën', JEEP: 'Jeep', MITSUBISHI: 'Mitsubishi', KIA: 'Kia',
  GM: 'Chevrolet', CHEVROLET: 'Chevrolet', VW: 'Volkswagen', VOLKSWAGEN: 'Volkswagen', VOLKS: 'Volkswagen',
  SUZUKI: 'Suzuki', SUBARU: 'Subaru',
};

type Car = [string, string];
let index: Map<string, Car> | null = null;
let phrases: string[] = [];
function build() {
  if (index) return index;
  index = new Map();
  for (const [brand, models] of Object.entries(VEHICLE_CATALOG)) {
    for (const m of models) {
      if (SKIP.has(m) || (brand === 'Peugeot' && NUMERIC_PEUGEOT.includes(m))) continue;
      index.set(N(m).trim(), [brand, m]);
    }
  }
  for (const [k, v] of Object.entries(ALIAS)) index.set(N(k).trim(), v);
  phrases = [...index.keys()].filter(Boolean).sort((a, b) => b.length - a.length);
  return index;
}

/** Posição de cada modelo no texto normalizado (cada trecho vale uma vez; o mais longo ganha) */
function positions(text: string) {
  const idx = build();
  const s = N(text);
  let used = s;
  const out: { pos: number; car: Car }[] = [];
  for (const ph of phrases) {
    const pat = ` ${ph} `;
    let i = used.indexOf(pat);
    while (i >= 0) {
      out.push({ pos: i, car: idx.get(ph)! });
      used = used.slice(0, i) + ' ' + '#'.repeat(pat.length - 2) + ' ' + used.slice(i + pat.length);
      i = used.indexOf(pat);
    }
  }
  return { found: out.sort((a, b) => a.pos - b.pos), s };
}

// ── anos ("2012/2016", "12/16", "99...", "A PARTIR DE 2010") ──
const THIS_YEAR = new Date().getFullYear();
const yr = (t: string) => {
  let v = Number(t);
  if (t.length === 2) v = v >= 50 ? 1900 + v : 2000 + v;
  return v >= 1960 && v <= THIS_YEAR + 1 ? v : null;
};
type Span = { pos: number; from: number; to: number | null; end: number };

function yearsIn(text: string): Span[] {
  const t = text.toUpperCase();
  const found: Span[] = [];
  const taken: [number, number][] = [];
  const free = (a: number, b: number) => taken.every(([x, y]) => b <= x || a >= y);
  const take = (pos: number, end: number, from: number, to: number | null) => { found.push({ pos, from, to, end }); taken.push([pos, end]); };
  // (^|[^\d.,]) no lugar de lookbehind (Safari antigo não tem): o início real é depois do caractere capturado
  for (const m of t.matchAll(/\dV\s*\/\s*(\d{2})(\s*\.{2,})?/g)) {
    const y = yr(m[1]); if (y) take(m.index!, m.index! + m[0].length, y, null);
  }
  for (const m of t.matchAll(/A PARTIR (?:DE |DO )?(\d{2}|\d{4})\b/g)) {
    const y = yr(m[1]);
    if (y && free(m.index!, m.index! + m[0].length)) take(m.index!, m.index! + m[0].length, y, null);
  }
  for (const m of t.matchAll(/(^|[^\d.,])(\d{2}|\d{4})\s*\/\s*(\d{2}|\d{4})(?![\d.,]*\d)(\s*\.{2,})?/g)) {
    const start = m.index! + m[1].length, end = m.index! + m[0].length;
    if (!free(start, end)) continue;
    const a = yr(m[2]), b = yr(m[3]);
    if (a && b && a <= b && b - a <= 40) take(start, end, a, m[4] ? null : b);
  }
  for (const m of t.matchAll(/(^|[^\d.,])(\d{2}|\d{4})\s*\/?\s*\.{2,}/g)) {
    const start = m.index! + m[1].length, end = m.index! + m[0].length;
    const y = yr(m[2]);
    if (y && free(start, end)) take(start, end, y, null);
  }
  return found.sort((a, b) => a.pos - b.pos);
}

/** Ano de cada carro, só quando fica claro de quem é; senão vazio ("qualquer ano") */
function assignYears(text: string, found: { pos: number; car: Car }[], s: string): Map<string, [number | null, number | null]> {
  const res = new Map<string, [number | null, number | null]>();
  const ys = yearsIn(text);
  if (!ys.length || !found.length) return res;
  const key = (c: Car) => `${c[0]}|${c[1]}`;
  const scale = s.length / Math.max(1, text.length);
  if (found.length === 1 && ys.length === 1) { res.set(key(found[0].car), [ys[0].from, ys[0].to]); return res; }
  if (ys.length === 1) {
    const p = ys[0].pos * scale;
    const before = found.filter(f => f.pos <= p), after = found.filter(f => f.pos > p);
    if (before.length && after.length) return res; // ano no meio dos carros: não arrisca
    for (const f of before.length ? before : after) res.set(key(f.car), [ys[0].from, ys[0].to]);
    return res;
  }
  // vários anos: cada ano vale para o carro logo antes dele
  const tmp = new Map<string, [number | null, number | null]>();
  for (const y of ys) {
    const prev = found.filter(f => f.pos <= y.pos * scale).slice(-1)[0];
    if (!prev) return res;
    if (tmp.has(key(prev.car))) return res;
    tmp.set(key(prev.car), [y.from, y.to]);
  }
  return tmp;
}

/** Carros que a descrição cita; vazio quando não cita nenhum */
export function detectVehicles(name: string): VehicleDraft[] {
  const { found, s } = positions(name);
  const toks = new Set(s.split(' ').filter(Boolean));
  const cars: Car[] = [];
  const add = (c: Car) => { if (!cars.some(x => x[0] === c[0] && x[1] === c[1])) cars.push(c); };
  for (const f of found) add(f.car);
  if (toks.has('PEUGEOT') || toks.has('PEUGEOUT')) {
    for (const m of [...NUMERIC_PEUGEOT].sort((a, b) => b.length - a.length)) if (toks.has(m)) add(['Peugeot', m]);
  }
  if (cars.length) {
    const years = assignYears(name, found, s);
    return cars.map(([brand, model]) => {
      const y = years.get(`${brand}|${model}`);
      return { brand, model, year_from: y?.[0] ?? null, year_to: y?.[1] ?? null };
    });
  }
  // Sem modelo: só a marca ("PASTILHA FREIO HONDA") → todos os modelos dela
  const brands = [...new Set(Object.entries(BRANDS).filter(([k]) => toks.has(k)).map(([, b]) => b))].sort();
  return brands.map(brand => ({ brand, model: ANY_MODEL, year_from: null, year_to: null }));
}
