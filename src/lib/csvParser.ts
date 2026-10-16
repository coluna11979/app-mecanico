/**
 * Parser de CSV simples que lida com aspas e vírgulas dentro de campos.
 * Retorna lista de linhas, cada linha é um array de strings (sem header).
 * O cabeçalho (primeira linha) é retornado separadamente.
 */

export interface ParsedCsv {
  headers: string[];
  rows: string[][];
  errors: string[];
}

export function parseCsv(text: string, delimiter?: ','| ';' | '\t'): ParsedCsv {
  const normalized = text.replace(/\r\n?/g, '\n').trim();
  if (!normalized) return { headers: [], rows: [], errors: ['Arquivo vazio.'] };

  const delim = delimiter ?? detectDelimiter(normalized);
  const errors: string[] = [];
  const allRows: string[][] = [];

  let i = 0;
  let field = '';
  let row: string[] = [];
  let inQuotes = false;

  while (i < normalized.length) {
    const ch = normalized[i];

    if (inQuotes) {
      if (ch === '"') {
        if (normalized[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += ch; i++; continue;
    }

    if (ch === '"') { inQuotes = true; i++; continue; }
    if (ch === delim) { row.push(field); field = ''; i++; continue; }
    if (ch === '\n') { row.push(field); allRows.push(row); row = []; field = ''; i++; continue; }
    field += ch; i++;
  }
  // Última linha
  if (field.length > 0 || row.length > 0) { row.push(field); allRows.push(row); }

  if (!allRows.length) return { headers: [], rows: [], errors: ['Nenhuma linha encontrada.'] };

  const headers = allRows[0].map(h => h.trim());
  const rows = allRows.slice(1).filter(r => r.some(c => c.trim() !== ''));

  // Validações
  rows.forEach((r, idx) => {
    if (r.length !== headers.length) {
      errors.push(`Linha ${idx + 2}: tem ${r.length} colunas, esperado ${headers.length}.`);
    }
  });

  return { headers, rows, errors };
}

function detectDelimiter(sample: string): ',' | ';' | '\t' {
  const firstLine = sample.split('\n')[0] ?? '';
  const semi = (firstLine.match(/;/g) ?? []).length;
  const comma = (firstLine.match(/,/g) ?? []).length;
  const tab = (firstLine.match(/\t/g) ?? []).length;
  if (tab > comma && tab > semi) return '\t';
  if (semi > comma) return ';';
  return ',';
}

/** Normaliza um header para fazer match flexível com os campos esperados. */
function normalizeHeader(h: string): string {
  return h.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // tira acentos
    .replace(/[^a-z0-9]/g, ''); // tira espaços e pontuação
}

/** Mapeia headers do CSV para campos canônicos do Lead. */
export function mapHeaders(headers: string[]): Record<string, number | null> {
  const map: Record<string, number | null> = {
    name: null, email: null, phone: null, cidade: null, estado: null, intent: null, notas: null,
  };
  headers.forEach((h, i) => {
    const n = normalizeHeader(h);
    if (map.name === null && ['nome', 'name', 'nomecompleto', 'razaosocial', 'empresa'].includes(n)) map.name = i;
    else if (map.email === null && ['email', 'emails', 'mail', 'ocorreio'].includes(n)) map.email = i;
    else if (map.phone === null && ['telefone', 'phone', 'celular', 'whatsapp', 'fone', 'tel'].includes(n)) map.phone = i;
    else if (map.cidade === null && ['cidade', 'city', 'municipio'].includes(n)) map.cidade = i;
    else if (map.estado === null && ['estado', 'uf', 'state'].includes(n)) map.estado = i;
    else if (map.intent === null && ['tipo', 'type', 'intent', 'perfil', 'categoria'].includes(n)) map.intent = i;
    else if (map.notas === null && ['notas', 'notes', 'observacao', 'observacoes', 'descricao', 'obs'].includes(n)) map.notas = i;
  });
  return map;
}

/** Normaliza o valor de "tipo" para o enum intent (mechanic | workshop). */
export function normalizeIntent(raw: string | undefined, fallback: 'mechanic' | 'workshop'): 'mechanic' | 'workshop' {
  if (!raw) return fallback;
  const n = normalizeHeader(raw);
  if (['oficina', 'workshop', 'empresa', 'cnpj', 'o'].includes(n)) return 'workshop';
  if (['mecanico', 'mechanic', 'autonomo', 'pessoafisica', 'cpf', 'm'].includes(n)) return 'mechanic';
  return fallback;
}
