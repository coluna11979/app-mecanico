// Lê a foto de um orçamento em papel (bloquinho de oficina) com a IA da Anthropic
// e grava os dados extraídos em paper_imports.extracted para a oficina conferir.
//
// Nada fixo no código: chave, modelo e esforço vêm de app_settings
// (painel admin → Configurações → Inteligência Artificial).
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { encodeBase64 } from 'jsr:@std/encoding@1/base64';
import Anthropic from 'npm:@anthropic-ai/sdk';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const nullable = (schema: Record<string, unknown>) => ({ anyOf: [schema, { type: 'null' }] });
const str = nullable({ type: 'string' });

/** Formato exato que a IA precisa devolver (structured outputs) */
const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['legivel', 'cliente', 'veiculo', 'data', 'numero_documento', 'servico_resumo',
    'observacoes', 'itens', 'desconto', 'total', 'campos_incertos'],
  properties: {
    legivel: { type: 'boolean', description: 'false se a imagem não for um orçamento/nota de serviço ou estiver ilegível' },
    cliente: {
      type: 'object', additionalProperties: false,
      required: ['nome', 'telefone', 'cpf', 'endereco'],
      properties: { nome: str, telefone: str, cpf: str, endereco: str },
    },
    veiculo: {
      type: 'object', additionalProperties: false,
      required: ['marca', 'modelo', 'placa', 'ano', 'cor', 'km'],
      properties: {
        marca: str, modelo: str, placa: str,
        ano: nullable({ type: 'integer' }), cor: str, km: nullable({ type: 'integer' }),
      },
    },
    data: { ...str, description: 'Data do orçamento no formato AAAA-MM-DD' },
    numero_documento: str,
    servico_resumo: { ...str, description: 'Título curto do serviço, ex.: "Troca de embreagem"' },
    observacoes: str,
    itens: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['tipo', 'descricao', 'quantidade', 'valor_unitario'],
        properties: {
          tipo: { type: 'string', enum: ['part', 'labor'] },
          descricao: { type: 'string' },
          quantidade: { type: 'number' },
          valor_unitario: nullable({ type: 'number' }),
        },
      },
    },
    desconto: nullable({ type: 'number' }),
    total: nullable({ type: 'number' }),
    campos_incertos: {
      type: 'array', items: { type: 'string' },
      description: 'Campos com leitura duvidosa, ex.: ["cliente.telefone", "itens[2].valor_unitario"]',
    },
  },
};

const PROMPT = `Esta é a foto de um orçamento ou nota de serviço de uma oficina mecânica brasileira, geralmente escrito à mão em bloquinho.

Extraia os dados exatamente como estão escritos:
- Não invente nada. Campo que não aparece ou que você não consegue ler → null.
- Telefone: só dígitos, com DDD se houver (ex.: "11987654321").
- Placa: maiúsculas, sem hífen ou espaço (ex.: "ABC1D23" ou "ABC1234").
- Valores em reais como número: "R$ 1.250,00" → 1250; "85,50" → 85.5.
- Data no formato AAAA-MM-DD. Ano com 2 dígitos → 20xx.
- Itens: tipo "part" para peças, materiais e insumos; "labor" para mão de obra e serviços. Quantidade 1 quando não houver.
- Se só existir um valor total sem itens discriminados, crie um item "labor" com a descrição do serviço e esse valor.
- Liste em campos_incertos tudo que tiver leitura duvidosa, para a oficina conferir.
- Se a imagem não for um orçamento/nota ou estiver ilegível, marque legivel = false.`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const url        = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const anonKey    = Deno.env.get('SUPABASE_ANON_KEY')!;
  const admin      = createClient(url, serviceKey);
  let importId: string | null = null;

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'no auth' }, 401);
    const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: 'unauthorized' }, 401);

    ({ import_id: importId } = await req.json());
    if (!importId) return json({ error: 'import_id obrigatório' }, 400);

    // Lê pela conta do usuário: o RLS garante que a importação é da oficina dele
    const { data: imp } = await userClient.from('paper_imports').select('*').eq('id', importId).maybeSingle();
    if (!imp) return json({ error: 'importação não encontrada' }, 404);

    // Configurações da IA (painel admin)
    const { data: rows } = await admin.from('app_settings').select('key, value')
      .in('key', ['anthropic_api_key', 'ai_vision_model', 'ai_vision_effort', 'ai_refusal_fallback']);
    const cfg: Record<string, string> = {};
    for (const r of rows ?? []) cfg[r.key] = (r.value ?? '').trim();
    if (!cfg.anthropic_api_key) {
      await admin.from('paper_imports').update({ status: 'failed', error: 'IA não configurada' }).eq('id', importId);
      return json({ error: 'A leitura por IA ainda não foi configurada. Avise o suporte.' }, 503);
    }
    if (!cfg.ai_vision_model) {
      await admin.from('paper_imports').update({ status: 'failed', error: 'Modelo da IA não configurado' }).eq('id', importId);
      return json({ error: 'Modelo da IA não configurado no painel admin.' }, 503);
    }

    await admin.from('paper_imports').update({ status: 'processing', error: null }).eq('id', importId);

    // Foto
    const { data: blob, error: dlErr } = await admin.storage.from('os-attachments').download(imp.image_path);
    if (dlErr || !blob) throw new Error('não foi possível abrir a foto');
    const mediaType = (['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(blob.type) ? blob.type : 'image/jpeg') as
      'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
    const imageData = encodeBase64(new Uint8Array(await blob.arrayBuffer()));

    const client = new Anthropic({ apiKey: cfg.anthropic_api_key });
    const model  = cfg.ai_vision_model;
    // Fallback em recusa (ex.: "default"): configurável; vazio desliga
    const fallback = cfg.ai_refusal_fallback;

    const response = await client.beta.messages.create({
      model,
      max_tokens: 16000,
      ...(fallback ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: fallback } : {}),
      output_config: {
        ...(cfg.ai_vision_effort ? { effort: cfg.ai_vision_effort } : {}),
        format: { type: 'json_schema', schema: SCHEMA },
      },
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageData } },
          { type: 'text', text: PROMPT },
        ],
      }],
    } as any);

    if (response.stop_reason === 'refusal') throw new Error('a IA não conseguiu processar esta imagem');
    if (response.stop_reason === 'max_tokens') throw new Error('resposta da IA incompleta');
    const text = response.content.find((b: any) => b.type === 'text') as { text: string } | undefined;
    if (!text) throw new Error('a IA não retornou dados');
    const extracted = JSON.parse(text.text);

    await admin.from('paper_imports').update({
      status:        extracted.legivel === false ? 'failed' : 'extracted',
      error:         extracted.legivel === false ? 'Imagem ilegível ou não é um orçamento' : null,
      extracted,
      model:         response.model,
      input_tokens:  response.usage?.input_tokens ?? null,
      output_tokens: response.usage?.output_tokens ?? null,
      processed_at:  new Date().toISOString(),
    }).eq('id', importId);

    return json({ ok: true, extracted });
  } catch (e) {
    let msg = e instanceof Error ? e.message : String(e);
    if (e instanceof Anthropic.AuthenticationError) msg = 'chave da IA inválida';
    else if (e instanceof Anthropic.RateLimitError) msg = 'limite da IA atingido, tente de novo em instantes';
    else if (e instanceof Anthropic.APIError) msg = `erro da IA (${e.status})`;
    console.error('[read-paper-quote]', e);
    if (importId) {
      await admin.from('paper_imports').update({ status: 'failed', error: msg }).eq('id', importId);
    }
    return json({ error: msg }, 500);
  }
});
