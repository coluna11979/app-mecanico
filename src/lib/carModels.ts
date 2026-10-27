/**
 * Modelos de carro mais comuns no Brasil (sem a marca: a oficina digita "gol", "onix", "hb20").
 * Usado na busca do campo Veículo da Nova demanda. Não é uma lista fechada: qualquer texto vale.
 */
export const CAR_MODELS = [
  // Hatches e compactos
  'Gol', 'Fox', 'Polo', 'Up', 'Onix', 'Onix Plus', 'Celta', 'Corsa', 'Classic', 'Prisma', 'Agile', 'Palio', 'Uno', 'Mobi',
  'Argo', 'Cronos', 'Siena', 'Grand Siena', 'Punto', 'Bravo', 'Ka', 'Ka Sedan', 'Fiesta', 'Focus', 'HB20', 'HB20S', 'i30',
  'Sandero', 'Logan', 'Clio', 'Kwid', 'March', 'Versa', 'Sentra', 'Etios', 'Yaris', 'Corolla', 'Fit', 'City', 'Civic',
  '208', '207', '206', '2008', '308', 'C3', 'C4', 'C4 Cactus', 'Golf', 'Jetta', 'Virtus', 'Voyage', 'Saveiro',
  'Cobalt', 'Spin', 'Cruze', 'Vectra', 'Astra', 'Meriva', 'Zafira', 'Idea', 'Strada', 'Toro', 'Fiorino', 'Doblò',
  'Uno Way', 'Palio Weekend', 'Space Fox', 'CrossFox', 'Parati', 'Santana', 'Kombi', 'Escort', 'Ecosport',
  // SUVs e utilitários
  'T-Cross', 'Nivus', 'Taos', 'Tiguan', 'Amarok', 'Tracker', 'Equinox', 'Trailblazer', 'S10', 'Montana', 'Captiva',
  'Pulse', 'Fastback', 'Renegade', 'Compass', 'Commander', 'Creta', 'Tucson', 'ix35', 'Santa Fe', 'HR-V', 'WR-V', 'CR-V',
  'Duster', 'Oroch', 'Captur', 'Kicks', 'Frontier', 'Hilux', 'SW4', 'Corolla Cross', 'RAV4', 'Ranger', 'Territory',
  'Bronco Sport', 'Maverick', 'Kardian', 'Master', 'Sprinter', 'Ducato', 'Daily', 'L200', 'Pajero', 'Pajero Sport',
  'ASX', 'Outlander', 'Lancer', 'Eclipse Cross', 'Sportage', 'Cerato', 'Picanto', 'Soul', 'Sorento', 'Tiggo 2', 'Tiggo 3X',
  'Tiggo 5X', 'Tiggo 7', 'Tiggo 8', 'Arrizo 5', 'Arrizo 6', 'QQ', 'Celer', 'Dolphin', 'Dolphin Mini', 'Song Plus',
  'Seal', 'Yuan Plus', 'Haval H6', 'Jimny', 'Vitara', 'Grand Vitara', 'Swift', 'C3 Aircross', 'Aircross', '3008', '5008',
  'A3', 'A4', 'Q3', 'Q5', 'Série 3', 'Série 1', 'X1', 'X3', 'Classe A', 'Classe C', 'GLA', 'Evoque', 'Discovery Sport',
  'Cherokee', 'Wrangler', 'Kona', 'Azera', 'Elantra', 'Sonata', 'Accord', 'Camry', 'Prius', 'Leaf', 'Livina', 'Tiida',
  'Fusion', 'Edge', 'Courier', 'Pampa', 'Montana', 'Blazer', 'Omega', 'Monza', 'Kadett', 'Chevette', 'Opala', 'Fusca',
] as const;

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** Até `limit` modelos para o texto digitado: primeiro os que começam com ele, depois os que contêm */
export function searchModels(q: string, extra: readonly string[] = [], limit = 6): string[] {
  const t = norm(q);
  if (t.length < 1) return [];
  const all = [...new Set([...extra, ...CAR_MODELS])];
  const starts = all.filter(m => norm(m).startsWith(t));
  const contains = all.filter(m => !starts.includes(m) && norm(m).includes(t));
  return [...starts, ...contains].filter(m => norm(m) !== t).slice(0, limit);
}

/** "Gol prata 2015 · ABC1D23" → carro, ano e o resto (placa) */
export function splitVehicle(text: string): { model: string; year: string; plate: string } {
  const [main, ...rest] = (text ?? '').split(' · ');
  const y = main.match(/\b(19[5-9]\d|20\d{2})\b/);
  const model = (y ? main.replace(y[0], '') : main).replace(/\s+/g, ' ').trim();
  return { model, year: y?.[0] ?? '', plate: rest.join(' · ').trim() };
}

/** Carro + ano + placa → o texto do Veículo que o mecânico vê */
export const joinVehicle = (v: { model: string; year: string; plate: string }) =>
  [[v.model.trim(), v.year.trim()].filter(Boolean).join(' '), v.plate.trim().toUpperCase()].filter(Boolean).join(' · ');

/* Carros que esta oficina já usou: aparecem primeiro na busca (só neste aparelho) */
const RECENT_KEY = 'oficina_carros_recentes';
export function recentModels(): string[] {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as string[]; } catch { return []; }
}
export function rememberModel(model: string) {
  const m = model.trim();
  if (!m) return;
  try { localStorage.setItem(RECENT_KEY, JSON.stringify([m, ...recentModels().filter(x => norm(x) !== norm(m))].slice(0, 12))); } catch { /* ignore */ }
}
