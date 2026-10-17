/**
 * Quando a oficina precisa de reforço hoje (e vale sugerir um mecânico da plataforma).
 * Só com motivo concreto: gente faltando com serviço parado, equipe toda fora, pátio além da
 * capacidade do dia ou agenda lotada. Ordem = o motivo mais forte primeiro.
 */

/** Rota que abre a tela de Demandas já com o formulário de nova demanda */
export const CALL_MECHANIC_PATH = '/oficina/dashboard?nova=1';

/** Horas de trabalho que uma pessoa dá conta num dia (conta conservadora para "pátio cheio") */
const HOURS_PER_PERSON = 8;

export type ReinforcementNeed = { reason: 'noTeam' | 'away' | 'overload' | 'agenda'; title: string; meta: string };

const many = (n: number, one: string, other: string) => `${n} ${n === 1 ? one : other}`;
const fmtH = (h: number) => String(Math.round(h * 10) / 10).replace('.', ',');

export function reinforcementNeed(input: {
  team: { total: number; working: number; away: { name: string }[] };
  workload: { count: number; hours: number };
  agenda: { booked: number; capacity: number; pct: number | null };
}): ReinforcementNeed | null {
  const { team, workload, agenda } = input;
  if (team.total > 0 && team.working === 0 && workload.count > 0) {
    return { reason: 'noTeam', title: 'Ninguém da equipe disponível hoje',
      meta: `${many(workload.count, 'OS em aberto', 'OS em aberto')} · um mecânico da plataforma pode cobrir` };
  }
  if (team.away.length > 0 && workload.count > 0) {
    const names = team.away.slice(0, 2).map(a => a.name.split(' ')[0]).join(', ') + (team.away.length > 2 ? ` +${team.away.length - 2}` : '');
    return { reason: 'away', title: `Faltou gente hoje: ${names}`,
      meta: `${many(workload.count, 'OS em aberto', 'OS em aberto')} · chame um mecânico da plataforma para não atrasar` };
  }
  if (team.working > 0 && workload.hours > team.working * HOURS_PER_PERSON) {
    return { reason: 'overload', title: 'Pátio cheio',
      meta: `~${fmtH(workload.hours)} h de serviço para ${many(team.working, 'pessoa', 'pessoas')} hoje` };
  }
  if (agenda.capacity > 0 && agenda.pct != null && agenda.pct >= 90) {
    return { reason: 'agenda', title: 'Agenda de hoje lotada',
      meta: `${agenda.booked} de ${agenda.capacity} vagas · um mecânico extra libera mais horários` };
  }
  return null;
}
