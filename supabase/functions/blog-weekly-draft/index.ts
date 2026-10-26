// Rascunho semanal do blog escrito pela IA (Claude Haiku por padrão, pra custo baixo).
// Quem chama: o pg_cron (toda segunda, header x-cron-secret) ou o admin ("Gerar rascunho agora").
// Nunca publica: o artigo nasce inativo com review_status 'aguardando_revisao' e o admin revisa.
// Tema: o próximo da pauta (blog_topics); sem pauta, a IA escolhe dentro dos assuntos da marca.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import Anthropic from 'npm:@anthropic-ai/sdk';
import { zodOutputFormat } from 'npm:@anthropic-ai/sdk/helpers/zod';
import { z } from 'npm:zod';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const Article = z.object({
  title: z.string().describe('Título direto, até 80 caracteres, sem clickbait'),
  summary: z.string().describe('Resumo de 1 frase, até 150 caracteres'),
  category: z.enum(['dicas', 'renda', 'gestao', 'tecnica', 'novidades']),
  audience: z.enum(['mechanic', 'workshop', 'all']),
  body: z.string().describe('Texto do artigo no formato pedido'),
  social_caption: z.string().describe('Legenda para Instagram com emojis moderados, chamada para o link na bio e 4 a 6 hashtags'),
});

const SYSTEM = `Você escreve o blog do MecânicoApp, plataforma brasileira que conecta oficinas mecânicas a mecânicos verificados para serviços sob demanda (o mecânico recebe chamados de oficinas da região, vê o valor antes e escolhe o que aceita; a oficina chama reforço só quando precisa, sem aumentar a folha fixa).

Público: donos de oficina e mecânicos autônomos no Brasil. Tom: direto, prático, respeitoso, como um colega experiente. Português do Brasil, frases curtas.

Regras:
- Entre 600 e 900 palavras, com 3 a 5 subtítulos.
- Conteúdo útil e verdadeiro. Não invente números, estatísticas, leis, preços ou depoimentos. Não prometa ganhos.
- Não cite concorrentes. Fale do MecânicoApp no máximo em um parágrafo, perto do fim, sem exagero.
- Formato do campo body (sem HTML, sem markdown além disto): parágrafos separados por uma linha em branco; subtítulo em linha própria começando com "## "; listas com linhas começando com "- "; **negrito** com moderação. Não repita o título no body.`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data: settings } = await admin.from('app_settings').select('key, value')
      .in('key', ['anthropic_api_key', 'ai_blog_model', 'blog_ai_enabled', 'blog_cron_secret', 'resend_api_key', 'resend_from_email', 'app_public_url']);
    const cfg: Record<string, string> = {};
    for (const s of settings ?? []) cfg[s.key] = s.value;

    // Autorização: segredo do cron OU admin logado
    const fromCron = !!cfg.blog_cron_secret && req.headers.get('x-cron-secret') === cfg.blog_cron_secret;
    if (!fromCron) {
      const auth = req.headers.get('Authorization');
      if (!auth) return json({ error: 'no auth' }, 401);
      const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
      const { data: { user } } = await userClient.auth.getUser();
      if (!user) return json({ error: 'unauthorized' }, 401);
      const { data: p } = await admin.from('profiles').select('role').eq('id', user.id).maybeSingle();
      if (p?.role !== 'admin') return json({ error: 'forbidden' }, 403);
    } else if (cfg.blog_ai_enabled !== 'true') {
      return json({ skipped: true, reason: 'desligado no admin' });
    }

    const apiKey = cfg.anthropic_api_key?.trim();
    if (!apiKey) return json({ error: 'Chave da IA não configurada (Configurações > Inteligência Artificial).' }, 400);
    const model = cfg.ai_blog_model?.trim() || 'claude-haiku-5-5';

    // Tema: próximo da pauta, senão a IA escolhe evitando os títulos recentes
    const { data: topic } = await admin.from('blog_topics').select('*').is('used_at', null)
      .order('created_at', { ascending: true }).limit(1).maybeSingle();
    const { data: recent } = await admin.from('panel_articles').select('title').order('created_at', { ascending: false }).limit(25);
    const recentTitles = (recent ?? []).map(r => `- ${r.title}`).join('\n') || '(nenhum ainda)';

    const ask = topic
      ? `Escreva um artigo sobre: "${topic.title}".\nPúblico principal: ${topic.audience === 'mechanic' ? 'mecânicos' : topic.audience === 'workshop' ? 'donos de oficina' : 'mecânicos e oficinas'}.${topic.notes ? `\nOrientações do editor: ${topic.notes}` : ''}`
      : `Escolha você um tema novo e útil (alterne entre mecânicos e donos de oficina: renda extra, organização, atendimento ao cliente, gestão de equipe e agenda, boas práticas técnicas gerais, segurança no trabalho) e escreva o artigo.`;

    const client = new Anthropic({ apiKey });
    const response = await client.messages.parse({
      model,
      max_tokens: 8000,
      system: SYSTEM,
      output_config: { effort: 'low', format: zodOutputFormat(Article) },
      messages: [{ role: 'user', content: `${ask}\n\nArtigos já publicados (não repita o tema nem o título):\n${recentTitles}` }],
    });

    if (response.stop_reason === 'refusal') return json({ error: 'A IA recusou o tema. Troque o tema da pauta.' }, 422);
    const a = response.parsed_output;
    if (!a) return json({ error: `Resposta incompleta da IA (${response.stop_reason}). Tente de novo.` }, 502);

    // Endereço único
    const base = a.title.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70) || 'artigo';
    let slug = base;
    for (let i = 2; i < 50; i++) {
      const { data: hit } = await admin.from('panel_articles').select('id').eq('slug', slug).maybeSingle();
      if (!hit) break;
      slug = `${base}-${i}`;
    }

    const { data: row, error } = await admin.from('panel_articles').insert({
      audience: topic?.audience ?? a.audience,
      slug, title: a.title.trim(), summary: a.summary.trim(), category: a.category,
      body: a.body.trim(), social_caption: a.social_caption.trim(),
      active: false, public: true, origin: 'ia', review_status: 'aguardando_revisao',
      published_at: new Date().toISOString(),
    }).select('id, title').single();
    if (error) throw error;

    if (topic) await admin.from('blog_topics').update({ used_at: new Date().toISOString(), article_id: row.id }).eq('id', topic.id);

    // Aviso por e-mail aos admins (se o Resend estiver configurado)
    if (cfg.resend_api_key) {
      const { data: admins } = await admin.from('profiles').select('id').eq('role', 'admin');
      const emails: string[] = [];
      for (const ad of admins ?? []) {
        const { data } = await admin.auth.admin.getUserById(ad.id);
        if (data?.user?.email) emails.push(data.user.email);
      }
      const appUrl = (cfg.app_public_url || 'https://mecanicoapp.com.br').replace(/\/$/, '');
      if (emails.length) {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${cfg.resend_api_key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: `MecânicoApp <${cfg.resend_from_email || 'noreply@resend.dev'}>`,
            to: emails,
            subject: `📝 Rascunho do blog para revisar: ${row.title}`,
            text: `O artigo da semana está pronto para revisão:\n\n${row.title}\n\nRevise e publique em: ${appUrl}/admin/marketing?aba=conteudo\n\nNada foi publicado ainda.`,
          }),
        }).catch(() => { /* aviso é opcional */ });
      }
    }

    return json({ ok: true, id: row.id, title: row.title, model, usage: response.usage });
  } catch (e) {
    return json({ error: String(e instanceof Error ? e.message : e) }, 500);
  }
});
