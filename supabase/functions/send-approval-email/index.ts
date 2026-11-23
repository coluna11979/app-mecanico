// E-mails do fluxo de aprovação de cadastro (Resend), disparados pelo admin.
// `template`: 'approved' / 'rejected' têm texto próprio; sem template usa o `kind`
// do histórico (documentos solicitados, mensagem, atualização) com o `content` livre.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { signatureHtml, signatureText } from '../_shared/brandSignature.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c] ?? c));
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

type Meta = { subject: string; title: string; intro: string; cta: string; next: string; steps?: string[]; footer: string };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'no auth' }, 401);

    const url = Deno.env.get('SUPABASE_URL')!;
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });

    // Só admin dispara — o e-mail sai em nome da plataforma com texto livre
    const { data: { user: caller } } = await userClient.auth.getUser();
    if (!caller) return json({ error: 'unauthorized' }, 401);
    const { data: callerProfile } = await admin.from('profiles').select('role').eq('id', caller.id).maybeSingle();
    if (callerProfile?.role !== 'admin') return json({ error: 'forbidden' }, 403);

    const { profile_id, content, kind, template } = await req.json();
    if (!profile_id || (!template && (!content || !kind))) return json({ error: 'missing fields' }, 400);

    const { data: settings } = await admin
      .from('app_settings')
      .select('key, value')
      .in('key', ['resend_api_key', 'resend_from_email', 'app_public_url', 'resend_reply_to']);
    const cfg: Record<string, string> = {};
    for (const s of settings ?? []) cfg[s.key] = s.value;

    const apiKey = cfg.resend_api_key?.trim();
    if (!apiKey) return json({ skipped: true, reason: 'resend_api_key not configured' });

    const fromEmail = cfg.resend_from_email?.trim() || 'noreply@resend.dev';
    const appUrl    = cfg.app_public_url?.trim() || 'https://mecanicoapp.com.br';
    // Preenchido só depois que o recebimento está ativo no Resend: as respostas entram no
    // histórico do cadastro pela função resend-inbound
    const replyTo   = cfg.resend_reply_to?.trim() || '';

    const { data: profile } = await admin.from('profiles').select('id, full_name, role, status').eq('id', profile_id).maybeSingle();
    if (!profile) return json({ error: 'profile not found' }, 404);

    const { data: { user }, error: userErr } = await admin.auth.admin.getUserById(profile_id);
    if (userErr || !user?.email) return json({ error: 'user email not found' }, 404);

    const isMechanic = profile.role === 'mechanic';
    const firstName = (profile.full_name || '').trim().split(/\s+/)[0] || 'parceiro';
    const panel = isMechanic ? '/mecanico/dashboard' : '/oficina/dashboard';
    const inReview = 'Você está recebendo este email por estar com cadastro em análise no Mecânico App.';

    const generic: Record<string, Meta> = {
      request_documents: { subject: '📋 Documentos solicitados — Mecânico App', title: 'Documentos solicitados', intro: 'Nossa equipe precisa de documentos pra dar continuidade ao seu cadastro:', cta: 'Anexar documentos', next: '/aguardando-aprovacao', footer: inReview },
      status_change:     { subject: '🔄 Atualização do seu cadastro — Mecânico App', title: 'Atualização do seu cadastro', intro: 'Houve uma atualização no seu cadastro:', cta: 'Ver detalhes', next: '/aguardando-aprovacao', footer: inReview },
      reply:             { subject: '💬 Nova mensagem da equipe — Mecânico App', title: 'Nova mensagem da equipe', intro: 'Você recebeu uma mensagem da nossa equipe:', cta: 'Ver mensagem', next: '/aguardando-aprovacao', footer: inReview },
      note:              { subject: '📝 Atualização — Mecânico App', title: 'Atualização', intro: 'Atualização da equipe:', cta: 'Ver detalhes', next: '/aguardando-aprovacao', footer: inReview },
    };

    const templates: Record<string, Meta> = {
      approved: isMechanic ? {
        subject: '🎉 Cadastro aprovado — bem-vindo ao Mecânico App!',
        title: '🎉 Cadastro aprovado!',
        intro: 'Boa notícia: seu cadastro foi aprovado e você já faz parte da rede de mecânicos do Mecânico App. Pra começar a receber serviços:',
        steps: [
          '<strong>Entre no app</strong> com seu email e a senha do cadastro.',
          '<strong>Fique online</strong> no seu painel — só quem está online recebe as demandas das oficinas.',
          '<strong>Ative o alerta no celular</strong> pra ser avisado na hora que surgir uma demanda perto de você.',
        ],
        cta: 'Entrar no app', next: panel,
        footer: 'Você está recebendo este email porque seu cadastro no Mecânico App foi aprovado.',
      } : {
        subject: '🎉 Cadastro aprovado — bem-vindo ao Mecânico App!',
        title: '🎉 Cadastro aprovado!',
        intro: 'Boa notícia: o cadastro da sua oficina foi aprovado. Você já pode entrar e publicar sua primeira demanda para os mecânicos da plataforma.',
        cta: 'Entrar no app', next: panel,
        footer: 'Você está recebendo este email porque seu cadastro no Mecânico App foi aprovado.',
      },
      rejected: {
        subject: 'Sobre o seu cadastro — Mecânico App',
        title: 'Sobre o seu cadastro',
        intro: 'Analisamos seu cadastro e, por enquanto, não conseguimos aprová-lo.',
        cta: 'Falar com a equipe', next: '/aguardando-aprovacao',
        footer: 'Se tiver dúvidas, responda a mensagem pelo app que nossa equipe retorna.',
      },
    };

    const meta: Meta = (template && templates[template]) || generic[kind] || generic.note;
    // Na aprovação o `content` é só o rótulo do histórico ("cadastro aprovado"), não vai pro email;
    // na recusa, vai se o admin escreveu um motivo.
    const note = template === 'approved' ? ''
      : template === 'rejected' ? String(content ?? '').replace(/^cadastro rejeitado( — )?/i, '').trim()
      : String(content ?? '');

    // Cadastro ainda não aprovado: o botão entra direto na conta, sem senha (chave de 7 dias,
    // conferida pela função email-login). Conta aprovada continua indo para o login.
    let link = `${appUrl}/login?email=${encodeURIComponent(user.email)}&next=${encodeURIComponent(meta.next)}`;
    let directLogin = false;
    if (template !== 'approved' && profile.status !== 'approved') {
      const raw = randomToken();
      const { error: tokErr } = await admin.from('email_login_tokens').insert({
        token_hash: await sha256Hex(raw),
        profile_id,
        next_path: meta.next,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      });
      if (!tokErr) { link = `${appUrl}/entrar#t=${raw}`; directLogin = true; }
    }

    const replyHtml = replyTo
      ? `Se preferir, <strong>responda este email${kind === 'request_documents' ? ' com as fotos' : ''}</strong> — a resposta chega direto no seu cadastro.`
      : `<strong>Não responda este email</strong> — as respostas por aqui não chegam até a equipe. Use o botão acima.`;
    const replyPlain = replyTo
      ? `Se preferir, responda este email${kind === 'request_documents' ? ' com as fotos' : ''}: a resposta chega direto no seu cadastro.`
      : 'Não responda este email: as respostas por aqui não chegam até a equipe.';
    const accessHtml = directLogin ? `
        O botão já entra na sua conta, sem precisar de senha.${kind === 'request_documents' ? ' Pelo celular, dá pra tirar a foto do documento e enviar na hora.' : ''}<br>
        ${replyHtml}<br>
        Se o botão não abrir, entre em ${esc(appUrl.replace(/^https?:\/\//, ''))} com seu email <strong>${esc(user.email)}</strong> e a senha do cadastro.` : `
        Faça login com seu email <strong>${esc(user.email)}</strong> e a senha que você criou no cadastro.<br>
        Esqueceu a senha? Use a opção <em>Esqueci minha senha</em> na tela de login.`;
    const accessText = directLogin
      ? `O botão já entra na sua conta, sem precisar de senha. ${replyPlain}`
      : `Faça login com seu email ${user.email} e a senha do cadastro.`;

    const stepsHtml = meta.steps ? `
      <ol style="margin:0 0 24px;padding-left:20px;font-size:15px;line-height:1.7;color:#222C37;">
        ${meta.steps.map(s => `<li style="margin-bottom:6px;">${s}</li>`).join('')}
      </ol>` : '';
    const noteHtml = note ? `
      <div style="background:#F5F7FA;border-left:4px solid #FF5C0A;border-radius:8px;padding:16px 18px;margin-bottom:24px;">
        <p style="margin:0;font-size:15px;line-height:1.6;color:#222C37;white-space:pre-wrap;">${esc(note)}</p>
      </div>` : '';

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><title>${esc(meta.subject)}</title></head>
<body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#F5F7FA;margin:0;padding:40px 20px;color:#222C37;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,0.06);">
    <div style="background:linear-gradient(135deg,#FF5C0A,#E64500);padding:28px 32px;color:#fff;">
      <div style="font-size:13px;opacity:0.9;letter-spacing:1px;text-transform:uppercase;font-weight:700;">Mecânico App</div>
      <div style="font-size:22px;font-weight:700;margin-top:4px;">${esc(meta.title)}</div>
    </div>
    <div style="padding:32px;">
      <p style="font-size:16px;margin:0 0 12px;">Fala <strong>${esc(firstName)}</strong>,</p>
      <p style="font-size:15px;line-height:1.6;color:#475567;margin:0 0 20px;">${esc(meta.intro)}</p>
      ${stepsHtml}${noteHtml}
      <a href="${esc(link)}" style="display:inline-block;background:#FF5C0A;color:#fff;text-decoration:none;padding:14px 28px;border-radius:12px;font-weight:700;font-size:15px;">${esc(meta.cta)} →</a>
      <p style="font-size:12px;color:#9AA6B6;margin:24px 0 0;line-height:1.6;">${accessHtml}
      </p>
      ${signatureHtml(appUrl)}
      <p style="font-size:11px;color:#CBD3DD;margin:16px 0 0;">${esc(meta.footer)}</p>
    </div>
  </div>
</body>
</html>`;

    const plainSteps = meta.steps ? '\n' + meta.steps.map((s, i) => `${i + 1}. ${s.replace(/<[^>]+>/g, '')}`).join('\n') + '\n' : '';
    const text = `Fala ${firstName},\n\n${meta.intro}\n${plainSteps}${note ? `\n${note}\n` : ''}\n${meta.cta}: ${link}\n\n${accessText}\n\n${signatureText(appUrl)}`;

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: `Mecânico App <${fromEmail}>`, to: [user.email], subject: meta.subject, html, text,
        ...(replyTo ? { reply_to: replyTo } : {}),
      }),
    });
    const result = await res.json();
    if (!res.ok) return json({ sent: false, error: result });
    return json({ sent: true, id: result.id, to: user.email });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
