// Lê o PDF (DANFE) ou a imagem de uma nota fiscal de compra de peças com a IA da Anthropic
// e devolve os dados para preencher a tela "Lançar nota de compra" (a oficina confere antes de lançar).
// O XML da NF-e é lido no navegador, sem IA — esta função é só para PDF/imagem.
//
// Só para oficinas com o recurso 'ai_invoice' em workshop_features.
// Nada fixo no código: chave, modelo e esforço vêm de app_settings
// (painel admin → Configurações → Inteligência Artificial).
import { createClient } from 'jsr:@supabase/supabase-js@2';
import Anthropic from 'npm:@anthropic-ai/sdk';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const MAX_BYTES = 10 * 1024 * 1024;
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

// Poucos campos nullable (limite da API): textos ausentes vêm como "".
const nullable = (schema: Record<string, unknown>) => ({ anyOf: [schema, { type: 'null' }] });
const str = { type: 'string' };

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['legivel', 'fornecedor', 'numero', 'data_emissao', 'itens', 'frete', 'desconto', 'total', 'parcelas', 'campos_incertos'],
  properties: {
    legivel: { type: 'boolean', description: 'false se o arquivo não for uma nota fiscal / nota de compra ou estiver ilegível' },
    fornecedor: {
      type: 'object', additionalProperties: false,
      required: ['nome', 'cnpj', 'telefone'],
      properties: { nome: str, cnpj: { ...str, description: 'Só dígitos' }, telefone: { ...str, description: 'Só dígitos' } },
    },
    numero: { ...str, description: 'Número da nota, sem zeros à esquerda' },
    data_emissao: { ...str, description: 'AAAA-MM-DD' },
    itens: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['codigo', 'descricao', 'unidade', 'quantidade', 'valor_unitario', 'valor_total'],
        properties: {
          codigo: str, descricao: str, unidade: str,
          quantidade: { type: 'number' }, valor_unitario: { type: 'number' }, valor_total: { type: 'number' },
        },
      },
    },
    frete: nullable({ type: 'number' }),
    desconto: nullable({ type: 'number' }),
    total: nullable({ type: 'number' }),
    parcelas: {
      type: 'array',
      description: 'Duplicatas / fatura: vencimento e valor de cada parcela. Vazio se não houver.',
      items: {
        type: 'object', additionalProperties: false, required: ['vencimento', 'valor'],
        properties: { vencimento: { ...str, description: 'AAAA-MM-DD' }, valor: { type: 'number' } },
      },
    },
    campos_incertos: { type: 'array', items: { type: 'string' } },
  },
};

const PROMPT = `Este arquivo é uma nota fiscal (DANFE) ou nota de compra de peças de uma oficina mecânica brasileira. A OFICINA é a destinatária; o FORNECEDOR é o emitente (quem vendeu).

Extraia exatamente o que está escrito:
- fornecedor: razão social ou nome fantasia do EMITENTE, CNPJ e telefone (só dígitos). Nunca use os dados do destinatário.
- numero: número da NF-e sem zeros à esquerda ("000.012.345" → "12345"). data_emissao em AAAA-MM-DD.
- itens: um por produto, na ordem da nota. codigo = código do produto do fornecedor; descricao = descrição completa; unidade como está (UN, PC, JG, KIT, L, CX…); quantidade; valor_unitario e valor_total do item.
- Valores como número: "1.250,00" → 1250.
- frete, desconto e total (valor total da nota) — null se não houver.
- parcelas: a seção FATURA / DUPLICATAS (vencimento e valor de cada uma). Lista vazia se não houver.
- Não invente nada: texto ausente → "", número ausente → null.
- Liste em campos_incertos o que tiver leitura duvidosa (ex.: "itens[3].quantidade").
- Se não for uma nota fiscal ou nota de compra, ou estiver ilegível, marque legivel = false.`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const url        = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const anonKey    = Deno.env.get('SUPABASE_ANON_KEY')!;
  const admin      = createClient(url, serviceKey);
  let workshopId: string | null = null;
  let userId: string | null = null;
  let model: string | null = null;

  const log = (row: Record<string, unknown>) =>
    admin.from('ai_usage_log').insert({ workshop_id: workshopId, feature: 'ai_invoice', created_by: userId, model, ...row });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'no auth' }, 401);
    const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: 'unauthorized' }, 401);
    userId = user.id;

    const body = await req.json();
    workshopId = body.workshop_id ?? null;
    const file: string | undefined = body.file_base64;
    const mediaType: string = body.media_type ?? '';
    if (!workshopId || !file) return json({ error: 'workshop_id e arquivo são obrigatórios' }, 400);
    if (file.length * 0.75 > MAX_BYTES) return json({ error: 'Arquivo muito grande (máx. 10 MB)' }, 413);
    const isPdf = mediaType === 'application/pdf';
    if (!isPdf && !IMAGE_TYPES.includes(mediaType)) return json({ error: 'Envie o PDF da nota (ou uma imagem)' }, 415);

    // Quem chama é da oficina? (RLS pela conta do usuário) e a oficina tem o recurso?
    const { data: feat } = await userClient.from('workshop_features').select('feature')
      .eq('workshop_id', workshopId).eq('feature', 'ai_invoice').maybeSingle();
    if (!feat) return json({ error: 'Leitura de nota com IA não liberada para esta oficina' }, 403);

    const { data: rows } = await admin.from('app_settings').select('key, value')
      .in('key', ['anthropic_api_key', 'ai_vision_model', 'ai_vision_effort', 'ai_refusal_fallback']);
    const cfg: Record<string, string> = {};
    for (const r of rows ?? []) cfg[r.key] = (r.value ?? '').trim();
    if (!cfg.anthropic_api_key) return json({ error: 'A leitura por IA ainda não foi configurada. Avise o suporte.' }, 503);
    if (!cfg.ai_vision_model) return json({ error: 'Modelo da IA não configurado no painel admin.' }, 503);
    model = cfg.ai_vision_model;

    const client = new Anthropic({ apiKey: cfg.anthropic_api_key });
    const fallback = cfg.ai_refusal_fallback;
    const source = isPdf
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: file } }
      : { type: 'image', source: { type: 'base64', media_type: mediaType, data: file } };

    const response = await client.beta.messages.create({
      model,
      max_tokens: 16000,
      ...(fallback ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: fallback } : {}),
      output_config: {
        ...(cfg.ai_vision_effort ? { effort: cfg.ai_vision_effort } : {}),
        format: { type: 'json_schema', schema: SCHEMA },
      },
      messages: [{ role: 'user', content: [source, { type: 'text', text: PROMPT }] }],
    } as any);

    if (response.stop_reason === 'refusal') throw new Error('a IA não conseguiu processar este arquivo');
    if (response.stop_reason === 'max_tokens') throw new Error('resposta da IA incompleta (nota muito grande?)');
    const text = response.content.find((b: any) => b.type === 'text') as { text: string } | undefined;
    if (!text) throw new Error('a IA não retornou dados');
    const extracted = JSON.parse(text.text);

    await log({ model: response.model, input_tokens: response.usage?.input_tokens ?? null, output_tokens: response.usage?.output_tokens ?? null });
    return json({ ok: true, extracted });
  } catch (e) {
    let msg = e instanceof Error ? e.message : String(e);
    if (e instanceof Anthropic.AuthenticationError) msg = 'chave da IA inválida';
    else if (e instanceof Anthropic.RateLimitError) msg = 'limite da IA atingido, tente de novo em instantes';
    else if (e instanceof Anthropic.APIError) {
      const detail = (e.error as any)?.error?.message ?? '';
      msg = `erro da IA (${e.status})${detail ? `: ${String(detail).slice(0, 300)}` : ''}`;
    }
    console.error('[read-purchase-invoice]', e);
    if (workshopId) await log({ ok: false, error: msg.slice(0, 500) });
    return json({ error: msg }, 500);
  }
});
