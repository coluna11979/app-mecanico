/**
 * Busca de peças tolerante, usada na OS e no caixa.
 * - Palavras em qualquer ordem; "jogo", "kit", "de", quantidade e unidade ("1 litro") não contam.
 * - Plural acha singular ("pastilhas" → "pastilha").
 * - Código sem pontuação: "547" ou "n547" acham "N-547"; "0w-20" / "0w 20" acham "0W20".
 */
export const normTxt = (t: string | null | undefined) =>
  (t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Junta medida de óleo ("0w 20", "5w-30") e tira pontuação de código ("n-547" → "n547") */
const compact = (t: string) => normTxt(t)
  .replace(/(\d+)\s*w\s*-?\s*(\d+)/g, '$1w$2')
  .replace(/([a-z0-9])[-./·]+(?=[a-z0-9])/g, '$1')
  .replace(/\s+/g, ' ')
  .trim();

const FILLER = /^(jogo|jg|kit|par|pc|pcs|peca|pecas|de|do|da|dos|das|para|pra|p\/|com|e|x|un|und|unid|unidades?|l|lt|lts|litros?|ml|\d{1,2}([.,]\d+)?(l|lt|lts|ml)?|\d+([.,]\d+)?(l|lt|lts|ml))$/;

/** Palavras da busca que contam (se todas forem "de enchimento", usa todas) */
export function searchWords(q: string): string[] {
  const all = compact(q).split(' ').filter(Boolean);
  const ws = all.filter(w => !FILLER.test(w));
  return ws.length ? ws : all;
}

/** Texto onde a busca procura (nome, código, marca...) já normalizado */
export const searchHay = (...parts: (string | null | undefined)[]) => ' ' + compact(parts.filter(Boolean).join(' ')) + ' ';

/** A palavra está no texto (plural vale como singular) */
export function hasWord(hay: string, w: string): boolean {
  if (hay.includes(w)) return true;
  if (w.length > 3 && w.endsWith('s')) {
    const s = w.endsWith('es') && w.length > 4 ? [w.slice(0, -1), w.slice(0, -2)] : [w.slice(0, -1)];
    return s.some(x => hay.includes(x));
  }
  return false;
}

export const matchesAll = (hay: string, ws: string[]) => ws.every(w => hasWord(hay, w));

/** Código exato (ignorando pontuação) */
export const codeHit = (code: string | null | undefined, ws: string[]) => {
  if (!code) return false;
  const c = compact(code).split(/\s+/);
  return ws.some(w => c.includes(w));
};
