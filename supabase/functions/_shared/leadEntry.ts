// Por onde o lead entrou: lê a 1ª mensagem (as prontas do site começam com "Vim pelo site")
// e diz à Recepção o que o cliente JÁ contou e o que ainda falta perguntar.
// Sem dependências: usado pela edge function agent-reception.

export type EntryKind = 'oferta' | 'luz' | 'triagem' | 'servico' | 'pergunta_servico' | 'sinal' | 'geral' | 'direto';

export type LeadEntry = {
  kind: EntryKind;
  /** Veio pelo site da oficina */
  site: boolean;
  /** O que a mensagem já informa (para não perguntar de novo) */
  known: { carro?: string; problema?: string; servico?: string; oferta?: string; luz?: string };
  /** Luz do painel: 3 = pare o carro · 2 = atenção imediata · 1 = agende logo (mesma escala do site) */
  luzNivel?: 1 | 2 | 3;
  /** Próxima informação que a Recepção deve buscar, em ordem */
  missing: ('carro' | 'problema' | 'quando')[];
};

const LUZES: [RegExp, 1 | 2 | 3][] = [
  [/óleo|oleo/i, 3], [/temperatura/i, 3], [/freio/i, 3],
  [/bateria/i, 2],
  [/inje[çc][ãa]o/i, 1], [/abs/i, 1],
];

const clean = (s: string | undefined) => (s ?? '').trim().replace(/[.!]+$/, '').trim();

export function leadEntry(firstMessage: string): LeadEntry {
  const t = (firstMessage ?? '').replace(/\r/g, '');
  const site = /vim pelo site/i.test(t);
  const pick = (re: RegExp) => clean(t.match(re)?.[1]);
  const known: LeadEntry['known'] = {};
  let kind: EntryKind;
  let luzNivel: LeadEntry['luzNivel'];

  const carro = pick(/Carro:\s*([^\n]+)/i);
  const sintomas = pick(/O que está acontecendo:\s*([^\n]+)/i);
  const oferta = pick(/quero a oferta:\s*([^\n]+)/i);
  const luz = pick(/Acendeu a (luz [^\n]+?) no painel/i);
  const servico = pick(/quero um orçamento de\s*([^\n]+)/i);
  const volante = pick(/O volante do meu carro (?:está|esta)\s+([^\n]+?)\s+e quero/i);
  const sinal = pick(/Meu carro (?:está|esta)\s+([^\n]+?)\s+e quero/i) || (volante ? `volante ${volante}` : '');

  if (!site) {
    kind = 'direto';
  } else if (oferta) {
    kind = 'oferta'; known.oferta = oferta;
  } else if (luz) {
    kind = 'luz'; known.luz = luz; known.problema = `acendeu a ${luz}`;
    luzNivel = LUZES.find(([re]) => re.test(luz))?.[1] ?? 1;
  } else if (carro || sintomas || /^Olá[^\n]*Vim pelo site\.\s*\n/i.test(t)) {
    kind = 'triagem';
    if (sintomas) known.problema = sintomas;
  } else if (servico) {
    kind = 'servico'; known.servico = servico;
  } else if (/saber se voc[êe]s fazem um servi[çc]o/i.test(t)) {
    kind = 'pergunta_servico';
  } else if (sinal) {
    kind = 'sinal'; known.problema = sinal;
  } else {
    kind = 'geral';
  }
  if (carro) known.carro = carro;

  // Primeiro entender o problema (se ainda não disse), depois o carro, por último quando trazer
  const missing: LeadEntry['missing'] = [];
  if (!known.problema && !known.servico && !known.oferta) missing.push('problema');
  if (!known.carro) missing.push('carro');
  missing.push('quando');
  return { kind, site, known, luzNivel, missing };
}

/** Texto para o prompt da Recepção */
export function describeEntry(e: LeadEntry): string {
  const como: Record<EntryKind, string> = {
    oferta: 'tocou numa OFERTA do site (cliente mais quente: confirme a oferta e vá para quando ele pode trazer o carro)',
    luz: 'usou o painel de LUZES do site',
    triagem: 'preencheu a TRIAGEM do site (marcou sintomas e/ou o carro)',
    servico: 'pediu orçamento de um SERVIÇO no site',
    pergunta_servico: 'quer saber se a oficina faz um serviço (ainda não disse qual)',
    sinal: 'tocou num SINAL do carro no site',
    geral: 'tocou no botão geral de WhatsApp do site (ainda não disse o que o carro tem)',
    direto: 'chamou direto no WhatsApp, sem mensagem pronta',
  };
  const lines = [`Como o cliente chegou: ${como[e.kind]}.`];
  const k = e.known;
  const sabe = [
    k.carro && `carro: ${k.carro}`, k.problema && `problema: ${k.problema}`,
    k.servico && `serviço: ${k.servico}`, k.oferta && `oferta: ${k.oferta}`,
  ].filter(Boolean);
  lines.push(sabe.length ? `O que ele JÁ contou (não pergunte de novo): ${sabe.join(' · ')}.` : 'Ele ainda não contou nada sobre o carro.');
  if (e.kind === 'luz' && e.luzNivel === 3) {
    lines.push('GRAVE: luz de nível 3 (pare o carro). Antes de qualquer pergunta, oriente a parar em local seguro e não seguir rodando, e marque urgente ao passar para a equipe.');
  } else if (e.kind === 'luz' && e.luzNivel === 2) {
    lines.push('Atenção: luz de nível 2. Pergunte se o carro ainda está rodando normal e marque urgente ao passar para a equipe.');
  } else if (e.kind === 'luz') {
    lines.push('Luz de nível 1 (normalmente dá tempo de agendar). Pergunte se está fixa ou piscando: piscando é mais grave, não deve rodar.');
  }
  const falta = { carro: 'modelo e ano do carro', problema: 'o que o carro está fazendo', quando: 'quando pode trazer o carro (dia e período)' };
  lines.push(`O que falta descobrir, nesta ordem: ${e.missing.map((m) => falta[m]).join(' → ')}.`);
  return lines.join('\n');
}
