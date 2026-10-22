/**
 * Lê a descrição que o app monta para a demanda (empilhados, vários atalhos, veículo) e separa por carro,
 * para o mecânico não confundir o que é de cada um. Formatos que aparecem:
 *   Serviços a realizar:
 *   Veículo: Fiat Argo · S/P (OS nº 1437)      ← cabeçalho de carro (OS)
 *   • Revisão geral                            ← serviço do carro acima
 *   • Troca de óleo e filtros (gol 2022) — detalhe   ← serviço avulso com o carro entre parênteses
 *   Veículo: Gol prata · ABC1D23               ← carro informado no fim (demanda avulsa)
 * Texto livre (sem esse formato) volta como observação.
 */

export type JobService = { title: string; detail: string | null };
export type JobVehicle = { vehicle: string | null; ref: string | null; services: JobService[] };
export type ParsedJob = { groups: JobVehicle[]; notes: string[] };

const isHeader = (l: string) => /^serviços a realizar:?$/i.test(l);
const vehicleLine = (l: string) => l.match(/^ve[ií]culo:?\s*(.*)$/i);

/** "• Troca de óleo (gol 2022) — detalhe" → título, carro e detalhe ("(2x)" é quantidade, não carro) */
function parseItem(raw: string) {
  let rest = raw.replace(/^[•\-*]\s*/, '').trim();
  let detail: string | null = null;
  const dash = rest.indexOf(' — ');
  if (dash >= 0) { detail = rest.slice(dash + 3).trim() || null; rest = rest.slice(0, dash).trim(); }
  let car: string | null = null;
  const m = rest.match(/^(.*)\s\(([^()]+)\)$/);
  if (m && !/^\d+\s*x$/i.test(m[2].trim())) { rest = m[1].trim(); car = m[2].trim(); }
  return { title: rest, detail, car };
}

export function parseJobDescription(text: string | null | undefined): ParsedJob {
  const lines = (text ?? '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const groups: JobVehicle[] = [];
  const notes: string[] = [];
  let current: JobVehicle | null = null;
  const groupFor = (car: string | null) => {
    if (!car) return current ?? (current = pushGroup(null, null));
    const key = car.toLowerCase();
    return groups.find(g => g.vehicle?.toLowerCase() === key) ?? pushGroup(car, null);
  };
  function pushGroup(vehicle: string | null, ref: string | null) {
    const g: JobVehicle = { vehicle, ref, services: [] };
    groups.push(g);
    return g;
  }

  for (const l of lines) {
    if (isHeader(l)) continue;
    const v = vehicleLine(l);
    if (v) {
      // "Fiat Argo · S/P (OS nº 1437)" → carro + referência
      const ref = v[1].match(/\((OS n[ºo°]\s*\d+)\)\s*$/i);
      const vehicle = (ref ? v[1].slice(0, ref.index).trim() : v[1].trim()) || null;
      // "Veículo:" no fim de uma demanda de um carro só: vale para os serviços já listados sem carro
      const orphan = groups.find(g => !g.vehicle && g.services.length);
      if (orphan && groups.length === 1) { orphan.vehicle = vehicle; orphan.ref = ref?.[1] ?? null; current = orphan; continue; }
      current = pushGroup(vehicle, ref?.[1] ?? null);
      continue;
    }
    const refOnly = l.match(/^refer[eê]ncia:\s*(OS n[ºo°]\s*\d+)/i);
    if (refOnly) { (current ?? groupFor(null)).ref = refOnly[1]; continue; }
    if (/^[•\-*]\s/.test(l)) {
      const it = parseItem(l);
      groupFor(it.car).services.push({ title: it.title, detail: it.detail });
      continue;
    }
    notes.push(l);
  }
  return { groups: groups.filter(g => g.services.length || g.vehicle), notes };
}

/** Tem estrutura (lista de serviços) para mostrar organizado? */
export const isStructured = (p: ParsedJob) => p.groups.some(g => g.services.length > 0);

/** Resumo de uma linha para cards: "2 carros · 3 serviços" ou os serviços */
export function jobSummary(text: string | null | undefined): string | null {
  const p = parseJobDescription(text);
  if (!isStructured(p)) return null;
  const services = p.groups.flatMap(g => g.services.map(s => s.title));
  const cars = p.groups.filter(g => g.vehicle).length;
  if (cars > 1) return `${cars} carros · ${services.length} serviço${services.length === 1 ? '' : 's'}: ${services.join(' · ')}`;
  return services.join(' · ');
}
