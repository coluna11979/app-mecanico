// Ferramentas do Diagnosticador: só leitura, nada é gravado. A oficina (ws) vem do SERVIDOR.
import type { ToolDef } from './orcTools.ts';

const str = (v: unknown, max = 120) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const int = (v: unknown) => { const n = Number(v); return v != null && v !== '' && Number.isFinite(n) ? Math.trunc(n) : null; };

export const DIAG_TOOLS: Record<string, ToolDef> = {
  diag_casos_parecidos: {
    label: 'Casos parecidos nas OS da oficina',
    def: {
      description: [
        'Procura na base de OS da própria oficina (e das outras lojas do mesmo dono) o que já foi feito em carros do MESMO MODELO.',
        'Devolve: quantas OS do modelo; serviços mais feitos e peças mais trocadas nesse modelo (com quantas vezes o cliente VOLTOU depois = retorno de garantia); e, se você mandar palavras, os casos em que elas aparecem (no relato, observação, serviços ou peças) e o que foi feito neles, com exemplos.',
        'palavras: sintomas e sistemas/peças suspeitos em português simples e curtos (ex.: ["marcha lenta","falha","bico","bobina","vela"] ou ["cambio","barulho","marcha"]). Mande variações (singular, sem acento não importa).',
        'Use SEMPRE que souber o modelo do carro, antes de montar a lista de causas, e cite os números ("nas 54 OS de Fox da loja, …"). Se o modelo tiver poucas OS, diga que a base é pequena e use o conhecimento técnico geral.',
      ].join(' '),
      input_schema: {
        type: 'object', additionalProperties: false, required: ['modelo'],
        properties: {
          modelo: { type: 'string', description: 'Ex.: Palio, Gol, Onix, Fox' },
          marca: { type: 'string' }, ano: { type: 'integer' },
          palavras: { type: 'array', maxItems: 12, items: { type: 'string' } },
          limite_exemplos: { type: 'integer' },
        },
      },
    },
    run: async (db, ws, i) => {
      const words = Array.isArray(i.palavras) ? i.palavras.map((w) => str(w, 40)).filter(Boolean).slice(0, 12) : null;
      const { data, error } = await db.rpc('diag_similar_cases', {
        p_workshop: ws, p_modelo: str(i.modelo, 60), p_marca: str(i.marca, 40) || null, p_ano: int(i.ano),
        p_palavras: words && words.length ? words : null, p_limit: int(i.limite_exemplos) ?? 8,
      });
      if (error) throw new Error(error.message);
      return data;
    },
  },
};
