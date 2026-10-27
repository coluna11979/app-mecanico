/**
 * Pesquisa do pedido de embaixador: perguntas de toque (rápidas no celular) e a
 * nota que o admin vê para decidir. A nota soma as respostas com o histórico do
 * mecânico na plataforma (serviços feitos e avaliação).
 */

export interface Pergunta {
  id: string;
  texto: string;
  multipla?: boolean;
  opcoes: { v: string; label: string; pontos: number }[];
}

export const PERGUNTAS: Pergunta[] = [
  { id: 'conhece', texto: 'Quantos mecânicos você conhece que trabalham por conta ou estão procurando serviço?', opcoes: [
    { v: '0-2', label: 'Até 2', pontos: 0 },
    { v: '3-5', label: '3 a 5', pontos: 1 },
    { v: '6-10', label: '6 a 10', pontos: 2 },
    { v: '10+', label: 'Mais de 10', pontos: 3 },
  ] },
  { id: 'onde', texto: 'Onde você conversa com outros mecânicos?', multipla: true, opcoes: [
    { v: 'whatsapp', label: 'Grupos de WhatsApp', pontos: 1 },
    { v: 'autopecas', label: 'Autopeças', pontos: 1 },
    { v: 'oficinas', label: 'Oficinas onde trabalhei', pontos: 1 },
    { v: 'cursos', label: 'Cursos / SENAI', pontos: 1 },
    { v: 'redes', label: 'Instagram / TikTok', pontos: 1 },
    { v: 'bairro', label: 'Bairro / igreja / amigos', pontos: 1 },
  ] },
  { id: 'ja_indicou', texto: 'Você já indicou mecânico para algum serviço?', opcoes: [
    { v: 'varias', label: 'Sim, várias vezes', pontos: 2 },
    { v: 'algumas', label: 'Algumas vezes', pontos: 1 },
    { v: 'nunca', label: 'Nunca', pontos: 0 },
  ] },
  { id: 'meta', texto: 'Quantos mecânicos você acha que consegue trazer no primeiro mês?', opcoes: [
    { v: '1-2', label: '1 ou 2', pontos: 0 },
    { v: '3-5', label: '3 a 5', pontos: 1 },
    { v: '6-10', label: '6 a 10', pontos: 2 },
    { v: '10+', label: 'Mais de 10', pontos: 2 },
  ] },
  { id: 'como', texto: 'Como você vai indicar?', multipla: true, opcoes: [
    { v: 'pessoalmente', label: 'Conversando pessoalmente', pontos: 1 },
    { v: 'link', label: 'Mandando meu link', pontos: 1 },
    { v: 'status', label: 'Postando no status / redes', pontos: 1 },
  ] },
];

export type Respostas = Record<string, string | string[]>;

/** Todas as perguntas respondidas (as de múltipla escolha com pelo menos uma opção). */
export const pesquisaCompleta = (r: Respostas) =>
  PERGUNTAS.every(p => (Array.isArray(r[p.id]) ? (r[p.id] as string[]).length > 0 : !!r[p.id]));

export function labelResposta(p: Pergunta, v: string | string[] | undefined) {
  const vals = Array.isArray(v) ? v : v ? [v] : [];
  return vals.map(x => p.opcoes.find(o => o.v === x)?.label ?? x).join(', ') || '—';
}

export interface Nota { pontos: number; max: number; nivel: 'forte' | 'medio' | 'fraco'; motivos: string[] }

export function notaPerfil(r: Respostas | null | undefined, historico: { total_jobs?: number | null; rating?: number | null }): Nota {
  const motivos: string[] = [];
  let pontos = 0;
  for (const p of PERGUNTAS) {
    const vals = r?.[p.id];
    const lista = Array.isArray(vals) ? vals : vals ? [vals] : [];
    // múltipla: no máximo 3 pontos por pergunta
    const soma = lista.reduce((s, v) => s + (p.opcoes.find(o => o.v === v)?.pontos ?? 0), 0);
    pontos += p.multipla ? Math.min(soma, 3) : soma;
  }
  const jobs = historico.total_jobs ?? 0;
  if (jobs >= 5) { pontos += 2; motivos.push(`${jobs} serviços feitos`); }
  else if (jobs >= 1) { pontos += 1; motivos.push(`${jobs} serviço(s) feito(s)`); }
  else motivos.push('ainda não fez serviço pela plataforma');
  const nota = historico.rating ?? 0;
  if (jobs > 0 && nota >= 4.5) { pontos += 2; motivos.push(`avaliação ${nota.toFixed(1)}`); }
  else if (jobs > 0 && nota >= 4) { pontos += 1; motivos.push(`avaliação ${nota.toFixed(1)}`); }
  else if (jobs > 0) motivos.push(`avaliação baixa (${nota.toFixed(1)})`);

  const max = 3 + 3 + 2 + 2 + 3 + 2 + 2;   // 17
  const nivel = pontos >= 11 ? 'forte' : pontos >= 6 ? 'medio' : 'fraco';
  return { pontos, max, nivel, motivos };
}
