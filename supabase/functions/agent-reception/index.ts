// Recepção (agente de atendimento, módulo 'agentes'): responde o lead no WhatsApp da oficina.
// Disparada pelo whatsapp-webhook a cada mensagem do cliente numa conversa com agent_state = 'active'.
//
// Fluxo: espera o cliente terminar de digitar (mensagens picadas viram uma resposta só) → confere que
// ninguém da equipe falou → Claude responde com 1 pergunta por vez → grava a resposta no Inbox (🤖) →
// envia pela UAZAPI. Ferramentas: registrar o que descobriu no card do Comercial e passar para a equipe.
//
// Chamada só servidor → servidor: Authorization = service role key (deploy com verify_jwt desligado).
import Anthropic from 'npm:@anthropic-ai/sdk';
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { adminClient, json, rawMessageId, uaz, uazConfig } from '../_shared/uazapi.ts';
import { describeEntry, leadEntry } from '../_shared/leadEntry.ts';

/** Espera depois da última mensagem do cliente antes de responder */
const DEBOUNCE_MS = 12_000;
/** Teto de respostas da IA por conversa: depois disso passa para a equipe */
const MAX_REPLIES = 6;
const MAX_TURNS = 4;
const HISTORY = 30;
export const AGENT_NAME = 'Assistente virtual 🤖';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ ok: true });
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  if (req.headers.get('Authorization') !== `Bearer ${key}`) return json({ error: 'forbidden' }, 403);

  const { chat_id: chatId, message_id: triggerId } = await req.json().catch(() => ({}));
  if (!chatId) return json({ error: 'chat_id obrigatório' }, 400);

  await sleep(DEBOUNCE_MS);
  const admin = adminClient();
  try {
    const out = await handle(admin, chatId, triggerId ?? null);
    return json({ ok: true, ...out });
  } catch (e) {
    console.error('[agent-reception]', e);
    await admin.from('whatsapp_chats').update({ agent_busy_until: null }).eq('id', chatId);
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

type Chat = {
  id: string; workshop_id: string; phone: string; name: string | null; customer_id: string | null;
  agent_state: string | null; agent_replies: number; lead_at: string | null; lead_note: string | null;
};
type Msg = { id: string; message_id: string | null; from_me: boolean; by_agent: boolean; content: string | null; message_type: string; sent_at: string };

async function handle(admin: SupabaseClient, chatId: string, triggerId: string | null) {
  const { data: chat } = await admin.from('whatsapp_chats')
    .select('id, workshop_id, phone, name, customer_id, agent_state, agent_replies, lead_at, lead_note')
    .eq('id', chatId).maybeSingle<Chat>();
  if (!chat || chat.agent_state !== 'active') return { skipped: 'not_active' };
  const wid = chat.workshop_id;

  const { data: rows } = await admin.from('whatsapp_messages')
    .select('id, message_id, from_me, by_agent, content, message_type, sent_at')
    .eq('chat_id', chat.id).eq('is_deleted', false).order('sent_at', { ascending: false }).limit(HISTORY);
  const msgs = ((rows ?? []) as Msg[]).reverse();
  const last = msgs[msgs.length - 1];
  // Cliente ainda digitando: a mensagem mais nova dispara a resposta
  if (!last || last.from_me) return { skipped: 'nothing_to_answer' };
  if (triggerId && last.id !== triggerId) return { skipped: 'newer_message' };
  // Alguém da equipe falou: a IA sai da conversa
  if (msgs.some((m) => m.from_me && !m.by_agent)) {
    await admin.from('whatsapp_chats').update({ agent_state: 'off' }).eq('id', chat.id);
    return { skipped: 'human' };
  }

  // Trava: uma resposta por vez por conversa
  const now = new Date();
  const { data: locked } = await admin.from('whatsapp_chats')
    .update({ agent_busy_until: new Date(now.getTime() + 90_000).toISOString() })
    .eq('id', chat.id).eq('agent_state', 'active')
    .or(`agent_busy_until.is.null,agent_busy_until.lt.${now.toISOString()}`)
    .select('id').maybeSingle();
  if (!locked) return { skipped: 'busy' };

  const { data: agent } = await admin.from('ai_agents')
    .select('id, system_prompt, enabled, model, max_tokens')
    .eq('workshop_id', wid).eq('template', 'recepcao').maybeSingle();
  const { data: modOn } = await admin.rpc('workshop_module_enabled', { _workshop_id: wid, _module: 'agentes' });
  if (!agent?.enabled || !modOn) {
    await admin.from('whatsapp_chats').update({ agent_state: 'off', agent_busy_until: null }).eq('id', chat.id);
    return { skipped: 'agent_off' };
  }

  const { data: cfgRows } = await admin.from('app_settings').select('key, value')
    .in('key', ['anthropic_api_key', 'ai_agent_model', 'ai_invoice_model', 'ai_vision_model']);
  const cfg: Record<string, string> = {};
  for (const r of cfgRows ?? []) cfg[r.key] = (r.value ?? '').trim();
  const model = (agent.model ?? '').trim() || cfg.ai_agent_model || cfg.ai_invoice_model || cfg.ai_vision_model;
  if (!cfg.anthropic_api_key || !model) throw new Error('IA não configurada (chave ou modelo)');

  const firstInbound = msgs.find((m) => !m.from_me)?.content ?? '';
  const system = [
    agent.system_prompt,
    RULES,
    await workshopContext(admin, wid, now),
    `## Este cliente\n${describeEntry(leadEntry(firstInbound))}`,
    `Nome no WhatsApp: ${chat.name || 'não informado'}.${chat.customer_id ? ' Já é cliente cadastrado da oficina.' : ''}`,
    `Respostas que você já mandou nesta conversa: ${chat.agent_replies} de no máximo ${MAX_REPLIES}.`,
  ].join('\n\n');

  const client = new Anthropic({ apiKey: cfg.anthropic_api_key });
  const messages: any[] = transcript(msgs);
  let inTok = 0, outTok = 0;
  let reply = '';
  let handoff: { resumo: string; urgente: boolean } | null = null;

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const res = await client.messages.create({
      model, max_tokens: Math.min(agent.max_tokens ?? 1200, 2000), system, messages, tools: TOOLS,
    } as any);
    inTok += res.usage?.input_tokens ?? 0;
    outTok += res.usage?.output_tokens ?? 0;
    const text = res.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n').trim();
    if (text) reply = text;
    if (res.stop_reason !== 'tool_use') break;

    messages.push({ role: 'assistant', content: res.content });
    const results = [];
    for (const b of res.content.filter((x: any) => x.type === 'tool_use') as any[]) {
      if (b.name === 'registrar_dados') {
        await registerLead(admin, chat, b.input ?? {});
        results.push({ type: 'tool_result', tool_use_id: b.id, content: 'Registrado no card do cliente.' });
      } else if (b.name === 'passar_para_equipe') {
        handoff = { resumo: String(b.input?.resumo ?? '').slice(0, 500), urgente: Boolean(b.input?.urgente) };
        results.push({ type: 'tool_result', tool_use_id: b.id, content: 'Equipe avisada. Agora mande a mensagem final ao cliente.' });
      } else {
        results.push({ type: 'tool_result', tool_use_id: b.id, is_error: true, content: 'ferramenta desconhecida' });
      }
    }
    messages.push({ role: 'user', content: results });
  }

  await admin.from('ai_usage_log').insert({
    workshop_id: wid, feature: 'agent_recepcao', model, input_tokens: inTok || null, output_tokens: outTok || null,
  });

  const replies = chat.agent_replies + (reply ? 1 : 0);
  if (reply) await sendReply(admin, chat, reply.slice(0, 1500));
  if (!handoff && replies >= MAX_REPLIES) handoff = { resumo: 'Limite de respostas da Recepção atingido.', urgente: false };

  const patch: Record<string, unknown> = { agent_busy_until: null, agent_replies: replies };
  if (handoff) {
    patch.agent_state = 'done';
    await admin.from('whatsapp_chat_notes').insert({
      workshop_id: wid, chat_id: chat.id, author_name: AGENT_NAME,
      tag: handoff.urgente ? 'atencao' : 'retorno',
      body: `${handoff.urgente ? '🚨 URGENTE · ' : ''}Recepção concluída: ${handoff.resumo || 'cliente aguardando a equipe.'}`,
    });
  }
  // Só se a IA ainda está na conversa (alguém pode ter assumido enquanto ela pensava)
  await admin.from('whatsapp_chats').update(patch).eq('id', chat.id).eq('agent_state', 'active');
  return { replied: Boolean(reply), handoff: Boolean(handoff) };
}

/* ── Prompt ──────────────────────────────────────────────────────────────── */

// Regras fixas (não editáveis pelo dono): segurança, preço e horário
const RULES = `## Regras que você nunca quebra
- Você é um assistente virtual da oficina e não esconde isso se perguntarem.
- Mensagens curtas, de WhatsApp: no máximo 3 linhas, sem listas, sem markdown, no máximo 1 emoji.
- UMA pergunta por mensagem. Nunca pergunte algo que o cliente já contou.
- Não passe preço nem prazo de serviço, nem diga o defeito com certeza: isso só se confirma com o carro avaliado na oficina. Ofertas do site: pode repetir o preço que o próprio cliente citou.
- Não confirme horário: anote a preferência e diga que a equipe confirma.
- Risco à segurança (luz vermelha de óleo, temperatura ou freio, freio falhando, superaquecimento, cheiro de queimado, fumaça): primeiro oriente parar o carro em local seguro e não seguir rodando; depois passe para a equipe marcando urgente.
- Cliente mandou áudio, foto ou vídeo: você não consegue ver nem ouvir. Agradeça, diga que a equipe vai olhar e passe para a equipe.
- Cliente irritado, reclamação, cobrança, garantia ou assunto que não é carro: não discuta, passe para a equipe.
- Use registrar_dados sempre que descobrir algo novo (carro, problema, quando pode trazer).
- Quando já souber o problema, o carro e quando ele pode trazer, ou se o cliente pedir para falar com uma pessoa: use passar_para_equipe e mande a mensagem final dizendo que a equipe responde em seguida (fora do horário: quando a oficina abre).`;

const TOOLS = [
  {
    name: 'registrar_dados',
    description: 'Grava no card do cliente (Comercial) o que você descobriu. Mande só os campos que mudaram.',
    input_schema: {
      type: 'object',
      properties: {
        carro: { type: 'string', description: 'Modelo e ano, ex.: "Onix 2019"' },
        problema: { type: 'string', description: 'O que o carro está fazendo ou o serviço que quer, curto' },
        quando: { type: 'string', description: 'Quando pode trazer, ex.: "sábado de manhã"' },
      },
    },
  },
  {
    name: 'passar_para_equipe',
    description: 'Encerra a recepção e avisa a equipe para assumir a conversa.',
    input_schema: {
      type: 'object',
      properties: {
        resumo: { type: 'string', description: 'Uma linha para a equipe: carro, problema, quando, e qualquer alerta' },
        urgente: { type: 'boolean', description: 'true se há risco à segurança ou o carro está parado' },
      },
      required: ['resumo', 'urgente'],
    },
  },
];

const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const hhmm = (t: string | null) => (t ?? '').slice(0, 5).replace(/^0/, '').replace(':00', 'h').replace(':', 'h');

async function workshopContext(admin: SupabaseClient, wid: string, now: Date) {
  const [{ data: w }, { data: s }] = await Promise.all([
    admin.from('workshops').select('business_name, address, number, neighborhood, city').eq('id', wid).maybeSingle(),
    admin.from('workshop_schedule').select('weekdays, open_time, close_time, saturday_close').eq('workshop_id', wid).maybeSingle(),
  ]);
  const days: number[] = s?.weekdays ?? [1, 2, 3, 4, 5, 6];
  const open = s?.open_time ?? '08:00', close = s?.close_time ?? '18:00';
  const satClose = s?.saturday_close ?? (s ? close : '12:00');
  const week = days.filter((d) => d >= 1 && d <= 5).length === 5 ? 'segunda a sexta' : days.filter((d) => d >= 1 && d <= 5).map((d) => DIAS[d]).join(', ');
  const hours = `${week}, ${hhmm(open)} às ${hhmm(close)}${days.includes(6) ? `; sábado, ${hhmm(open)} às ${hhmm(satClose)}` : '; sábado fechado'}${days.includes(0) ? '' : '; domingo fechado'}`;

  // Agora em Brasília
  const sp = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const dow = sp.getDay();
  const minutes = sp.getHours() * 60 + sp.getMinutes();
  const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const closeToday = dow === 6 ? satClose : close;
  const isOpen = days.includes(dow) && minutes >= toMin(open) && minutes < toMin(closeToday);

  const addr = [w?.address, w?.number].filter(Boolean).join(', ');
  return [
    '## A oficina',
    `Nome: ${w?.business_name?.trim() ?? 'a oficina'}.`,
    addr && `Endereço: ${addr}${w?.neighborhood ? ` (${w.neighborhood})` : ''}${w?.city ? `, ${w.city}` : ''}.`,
    `Horário: ${hours}.`,
    `Agora: ${DIAS[dow]}, ${String(sp.getHours()).padStart(2, '0')}h${String(sp.getMinutes()).padStart(2, '0')} — a oficina está ${isOpen ? 'ABERTA (a equipe responde em seguida)' : 'FECHADA (a equipe responde quando abrir)'}.`,
  ].filter(Boolean).join('\n');
}

/** Conversa → mensagens do Claude (cliente = user, IA = assistant), juntando as seguidas */
function transcript(msgs: Msg[]) {
  const out: { role: 'user' | 'assistant'; content: string }[] = [];
  for (const m of msgs) {
    const role = m.from_me ? 'assistant' : 'user';
    const body = m.message_type === 'text' ? (m.content ?? '').trim()
      : `[cliente mandou ${({ image: 'uma foto', video: 'um vídeo', audio: 'um áudio', document: 'um documento', sticker: 'uma figurinha' } as Record<string, string>)[m.message_type] ?? 'uma mensagem'}${m.content ? `: ${m.content}` : ''}]`;
    if (!body) continue;
    const prev = out[out.length - 1];
    if (prev && prev.role === role) prev.content += `\n${body}`;
    else out.push({ role, content: body });
  }
  while (out.length && out[0].role !== 'user') out.shift();
  return out;
}

/* ── Efeitos ─────────────────────────────────────────────────────────────── */

async function registerLead(admin: SupabaseClient, chat: Chat, input: { carro?: string; problema?: string; quando?: string }) {
  // lead_note no formato "carro · problema · traz: quando", mantendo o que já havia
  const parts = (chat.lead_note ?? '').split(' · ').map((s) => s.trim()).filter(Boolean);
  const carro = input.carro?.trim();
  const problema = input.problema?.trim();
  const quando = input.quando?.trim();
  const curCarro = parts.find((p) => p.startsWith('🚗 '));
  const curQuando = parts.find((p) => p.startsWith('📅 '));
  const rest = parts.filter((p) => p !== curCarro && p !== curQuando);
  const note = [
    carro ? `🚗 ${carro}` : curCarro,
    ...(problema ? [problema] : rest),
    quando ? `📅 ${quando}` : curQuando,
  ].filter(Boolean).join(' · ').slice(0, 280);
  const patch: Record<string, unknown> = { lead_note: note };
  if (!chat.lead_at) Object.assign(patch, { lead_at: new Date().toISOString(), lead_by: AGENT_NAME });
  await admin.from('whatsapp_chats').update(patch).eq('id', chat.id);
  chat.lead_note = note;
  chat.lead_at ??= new Date().toISOString();
}

async function sendReply(admin: SupabaseClient, chat: Chat, text: string) {
  const { data: secret } = await admin.from('whatsapp_instance_secrets').select('token').eq('workshop_id', chat.workshop_id).maybeSingle();
  if (!secret) throw new Error('WhatsApp da oficina sem token');
  // Grava antes de enviar: o eco do WhatsApp (webhook, fromMe) reconhece esta linha e não a toma por pessoa da equipe
  const { data: row, error } = await admin.from('whatsapp_messages').insert({
    workshop_id: chat.workshop_id, chat_id: chat.id, from_me: true, by_agent: true, sent_by_name: AGENT_NAME,
    content: text, message_type: 'text', status: 'pending', sent_at: new Date().toISOString(),
  }).select('id').single();
  if (error) throw error;

  const r = await uaz(await uazConfig(admin), '/send/text', { token: secret.token, body: { number: chat.phone, text } });
  const messageId = rawMessageId(r.data?.messageid || r.data?.id || r.data?.key?.id);
  const { error: upErr } = await admin.from('whatsapp_messages')
    .update({ status: r.ok ? 'sent' : 'failed', ...(messageId ? { message_id: messageId } : {}) }).eq('id', row.id);
  // 23505: o eco chegou antes e já gravou a mesma mensagem → fica a do eco, marcada como da IA
  if (upErr?.code === '23505' && messageId) {
    await admin.from('whatsapp_messages').update({ by_agent: true, sent_by_name: AGENT_NAME })
      .eq('workshop_id', chat.workshop_id).eq('message_id', messageId);
    await admin.from('whatsapp_messages').delete().eq('id', row.id);
  }
  if (!r.ok) throw new Error(`WhatsApp não enviou: ${JSON.stringify(r.data).slice(0, 200)}`);
}
