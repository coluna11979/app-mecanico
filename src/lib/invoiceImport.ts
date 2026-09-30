/**
 * Importar arquivo de nota de compra para a tela "Lançar nota".
 * - XML da NF-e: lido aqui no navegador (exato, sem IA, sem custo).
 * - PDF (DANFE) ou imagem: Edge Function read-purchase-invoice (IA; só oficinas com 'ai_invoice').
 * Os dois viram o mesmo InvoiceData, que a tela usa para preencher o formulário.
 */
import { supabase } from '@/lib/supabase';
import { UNITS } from '@/lib/parts';

export type InvoiceItem = { code: string; name: string; unit: string; qty: number; unitCost: number };
export type InvoiceData = {
  source: 'xml' | 'ia';
  supplier: { name: string; cnpj: string; phone: string };
  number: string;
  date: string;                 // AAAA-MM-DD ('' se não veio)
  items: InvoiceItem[];
  freight: number;
  discount: number;
  total: number | null;         // total impresso na nota (para conferir)
  installments: { due: string; amount: number }[];
  uncertain: string[];          // campos que a IA leu com dúvida
};

const digits = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '');
const num = (s: string | null | undefined) => { const n = Number(s); return Number.isFinite(n) ? n : 0; };

/** "PC", "UND", "JG", "LT"… → unidade do cadastro de peças */
export function mapUnit(u: string) {
  const x = u.trim().toLowerCase().replace(/\.$/, '');
  if (['par', 'pr'].includes(x)) return 'par';
  if (['jg', 'jogo'].includes(x)) return 'jogo';
  if (['kit', 'kt', 'cj', 'conj'].includes(x)) return 'kit';
  if (['l', 'lt', 'litro', 'lts'].includes(x)) return 'litro';
  if (x === 'ml') return 'ml';
  if (['kg', 'quilo'].includes(x)) return 'kg';
  if (['m', 'mt', 'metro', 'mts'].includes(x)) return 'metro';
  return UNITS.includes(x) ? x : 'un';
}

/** Lê o XML da NF-e (nfeProc ou NFe). Devolve null se não for uma NF-e. */
export function parseNfeXml(xml: string): InvoiceData | null {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) return null;
  const infNFe = doc.getElementsByTagName('infNFe')[0];
  if (!infNFe) return null;
  const one = (parent: Element | Document | undefined, tag: string) => parent?.getElementsByTagName(tag)[0]?.textContent?.trim() ?? '';

  const emit = infNFe.getElementsByTagName('emit')[0];
  const ide = infNFe.getElementsByTagName('ide')[0];
  const tot = infNFe.getElementsByTagName('ICMSTot')[0];

  const lines = Array.from(infNFe.getElementsByTagName('det')).map(det => {
    const prod = det.getElementsByTagName('prod')[0];
    const qty = num(one(prod, 'qCom'));
    // valor do item já com o desconto dele
    const net = num(one(prod, 'vProd')) - num(one(prod, 'vDesc'));
    return { code: one(prod, 'cProd'), name: one(prod, 'xProd'), unit: mapUnit(one(prod, 'uCom')), qty, net, vUn: num(one(prod, 'vUnCom')) };
  });
  // IPI, ST, seguro e outras despesas também são custo da peça: rateados pelos itens,
  // para o custo ficar real e a soma bater com o total da nota (e com as duplicatas)
  const sumNet = lines.reduce((a, l) => a + l.net, 0);
  const extras = tot ? num(one(tot, 'vIPI')) + num(one(tot, 'vST')) + num(one(tot, 'vSeg')) + num(one(tot, 'vOutro')) : 0;
  const factor = sumNet > 0 ? 1 + extras / sumNet : 1;
  const items: InvoiceItem[] = lines.map(l => ({
    code: l.code, name: l.name, unit: l.unit, qty: l.qty,
    unitCost: l.qty > 0 ? Math.round((l.net * factor / l.qty) * 10000) / 10000 : l.vUn,
  }));

  const installments = Array.from(infNFe.getElementsByTagName('dup')).map(d => ({
    due: one(d, 'dVenc').slice(0, 10), amount: num(one(d, 'vDup')),
  })).filter(d => d.amount > 0);

  return {
    source: 'xml',
    // "RAZÃO SOCIAL (Fantasia)" — mesmo formato dos fornecedores já cadastrados
    supplier: { name: [one(emit, 'xNome'), one(emit, 'xFant')].filter(Boolean).reduce((a, f) => a && f !== a ? `${a} (${f})` : a || f, ''), cnpj: digits(one(emit, 'CNPJ') || one(emit, 'CPF')), phone: digits(one(emit, 'fone')) },
    number: String(Number(one(ide, 'nNF')) || one(ide, 'nNF')),
    date: (one(ide, 'dhEmi') || one(ide, 'dEmi')).slice(0, 10),
    items,
    freight: num(one(tot, 'vFrete')),
    // desconto dos itens já está no custo; aqui só o que sobrar (ex.: desconto no total)
    discount: 0,
    total: tot ? num(one(tot, 'vNF')) : null,
    installments,
    uncertain: [],
  };
}

type AiExtracted = {
  legivel: boolean;
  fornecedor: { nome: string; cnpj: string; telefone: string };
  numero: string; data_emissao: string;
  itens: { codigo: string; descricao: string; unidade: string; quantidade: number; valor_unitario: number; valor_total: number }[];
  frete: number | null; desconto: number | null; total: number | null;
  parcelas: { vencimento: string; valor: number }[];
  campos_incertos: string[];
};

const fileToBase64 = (file: File) => new Promise<string>((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
  r.onerror = () => reject(r.error);
  r.readAsDataURL(file);
});

/** PDF/imagem → IA. Lança erro com mensagem para o usuário. */
export async function readInvoiceWithAi(workshopId: string, file: File): Promise<InvoiceData> {
  if (file.size > 10 * 1024 * 1024) throw new Error('Arquivo muito grande (máx. 10 MB)');
  const media = file.type || (file.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : '');
  const { data, error } = await supabase.functions.invoke('read-purchase-invoice', {
    body: { workshop_id: workshopId, file_base64: await fileToBase64(file), media_type: media },
  });
  if (error) {
    let msg = error.message;
    try { msg = (await (error as any).context?.json())?.error ?? msg; } catch { /* mantém */ }
    throw new Error(msg);
  }
  const x = (data as { extracted: AiExtracted }).extracted;
  if (!x?.legivel) throw new Error('Não consegui ler: o arquivo não parece uma nota fiscal ou está ilegível');
  return {
    source: 'ia',
    supplier: { name: x.fornecedor.nome.trim(), cnpj: digits(x.fornecedor.cnpj), phone: digits(x.fornecedor.telefone) },
    number: x.numero.trim(),
    date: /^\d{4}-\d{2}-\d{2}$/.test(x.data_emissao) ? x.data_emissao : '',
    items: x.itens.filter(i => i.descricao.trim()).map(i => {
      const qty = Number(i.quantidade) || 1;
      const unitCost = Number(i.valor_unitario) || (Number(i.valor_total) ? Number(i.valor_total) / qty : 0);
      return { code: i.codigo.trim(), name: i.descricao.trim(), unit: mapUnit(i.unidade), qty, unitCost };
    }),
    freight: Number(x.frete ?? 0) || 0,
    discount: Number(x.desconto ?? 0) || 0,
    total: x.total,
    installments: x.parcelas.filter(p => /^\d{4}-\d{2}-\d{2}$/.test(p.vencimento) && p.valor > 0).map(p => ({ due: p.vencimento, amount: p.valor })),
    uncertain: x.campos_incertos ?? [],
  };
}

/** Oficina tem a leitura de PDF com IA liberada? */
export async function hasAiInvoice(workshopId: string) {
  const { data } = await supabase.from('workshop_features').select('feature')
    .eq('workshop_id', workshopId).eq('feature', 'ai_invoice').maybeSingle();
  return !!data;
}
