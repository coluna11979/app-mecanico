// E-mail de boas-vindas, disparado pelo próprio cadastro (mecânico ou oficina) ao criar a conta.
// Desde 24/11/2026 o cadastro já abre a tela "Finalize seu cadastro" pedindo os documentos;
// este e-mail reforça o pedido, com botão que entra sem senha direto nessa tela
// (chave de 7 dias em email_login_tokens, conferida pela função email-login).
// Quem já mandou tudo pelo app só precisa aguardar — o texto diz isso.
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

type Template = { greeting: string; intro: string; docs: string[] };

const TEMPLATES: Record<string, Template> = {
  workshop: {
    greeting: 'Oi',
    intro: 'Recebemos o cadastro da sua oficina — que bom ter você com a gente!',
    docs: [
      'Cartão CNPJ',
      'CNH ou RG do responsável (frente e verso)',
      'Comprovante de endereço da oficina (até 90 dias)',
    ],
  },
  mechanic: {
    greeting: 'Fala',
    intro: 'Recebemos seu cadastro como mecânico aqui na plataforma — massa ter você com a gente!',
    docs: [
      'CNH ou RG (frente e verso)',
      'Comprovante de endereço (até 90 dias)',
    ],
  },
};

const SUBJECT = 'Bem-vindo(a) ao Mecânico App! Falta enviar seus documentos';
const DOCS_PATH = '/cadastro/documentos';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const { profile_id } = await req.json().catch(() => ({}));
    if (!profile_id) return json({ error: 'missing profile_id' }, 400);

    const url = Deno.env.get('SUPABASE_URL')!;
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // Quem chama: o próprio cadastrado logo após criar a conta (ou um admin).
    // Sem sessão do próprio cadastrado, o e-mail sai com link de login comum (sem entrada direta).
    let trustedCaller = false;
    const authHeader = req.headers.get('Authorization');
    if (authHeader) {
      const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user: caller } } = await userClient.auth.getUser();
      if (caller) {
        if (caller.id === profile_id) trustedCaller = true;
        else {
          const { data: cp } = await admin.from('profiles').select('role').eq('id', caller.id).maybeSingle();
          if (cp?.role !== 'admin') return json({ error: 'forbidden' }, 403);
          trustedCaller = true;
        }
      }
    }

    const { data: settings } = await admin
      .from('app_settings')
      .select('key, value')
      .in('key', ['resend_api_key', 'resend_from_email', 'app_public_url', 'resend_reply_to']);
    const cfg: Record<string, string> = {};
    for (const s of settings ?? []) cfg[s.key] = s.value;

    const apiKey = cfg.resend_api_key?.trim();
    if (!apiKey) return json({ skipped: true, reason: 'resend_api_key not configured' });

    const fromEmail = cfg.resend_from_email?.trim() || 'noreply@resend.dev';
    const appUrl = (cfg.app_public_url?.trim() || 'https://mecanicoapp.com.br').replace(/\/$/, '');
    // Respostas com as fotos entram no histórico do cadastro pela função resend-inbound
    const replyTo = cfg.resend_reply_to?.trim() || '';

    const { data: profile } = await admin
      .from('profiles').select('id, full_name, role, status').eq('id', profile_id).maybeSingle();
    if (!profile) return json({ error: 'profile not found' }, 404);

    const { data: { user }, error: userErr } = await admin.auth.admin.getUserById(profile_id);
    if (userErr || !user?.email) return json({ error: 'user email not found' }, 404);

    const tpl = TEMPLATES[profile.role] ?? TEMPLATES.workshop;
    const firstName = (profile.full_name || '').trim().split(/\s+/)[0] || 'parceiro';

    // Botão: entra direto na tela de documentos, sem senha (cadastro ainda não aprovado)
    let link = `${appUrl}/login?email=${encodeURIComponent(user.email)}&next=${encodeURIComponent(DOCS_PATH)}`;
    let directLogin = false;
    if (trustedCaller && profile.status !== 'approved') {
      const raw = randomToken();
      const { error: tokErr } = await admin.from('email_login_tokens').insert({
        token_hash: await sha256Hex(raw),
        profile_id,
        next_path: DOCS_PATH,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      });
      if (!tokErr) { link = `${appUrl}/entrar#t=${raw}`; directLogin = true; }
    }

    const docsHtml = tpl.docs.map((d) => `<li style="margin-bottom:4px;">${esc(d)}</li>`).join('');
    const accessHtml = directLogin
      ? 'O botão já entra na sua conta, sem precisar de senha. Pelo celular, dá para tirar a foto do documento na hora.'
      : `Entre com seu e-mail <strong>${esc(user.email)}</strong> e a senha que você criou no cadastro.`;
    const replyHtml = replyTo
      ? '<br>Se preferir, <strong>responda este e-mail com as fotos</strong> — elas chegam direto no seu cadastro.'
      : '';

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><title>${esc(SUBJECT)}</title></head>
<body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#F5F7FA;margin:0;padding:40px 20px;color:#222C37;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,0.06);">
    <div style="background:linear-gradient(135deg,#FF5C0A,#E64500);padding:32px;color:#fff;text-align:center;">
      <div style="font-size:13px;opacity:0.9;letter-spacing:1px;text-transform:uppercase;font-weight:700;">Mecânico App</div>
      <div style="font-size:26px;font-weight:800;margin-top:6px;">🔧 Bem-vindo(a)!</div>
    </div>
    <div style="padding:32px;">
      <p style="font-size:16px;margin:0 0 14px;">${esc(tpl.greeting)} <strong>${esc(firstName)}</strong>,</p>
      <p style="font-size:15px;line-height:1.65;color:#475567;margin:0 0 20px;">${esc(tpl.intro)}</p>

      <div style="background:#F5F7FA;border-left:4px solid #FF5C0A;border-radius:8px;padding:18px 20px;margin:0 0 22px;">
        <div style="font-size:12px;color:#FF5C0A;font-weight:700;letter-spacing:1px;text-transform:uppercase;margin-bottom:8px;">📋 Falta pouco</div>
        <p style="margin:0 0 8px;font-size:15px;line-height:1.6;color:#222C37;">Para seu cadastro entrar em análise, envie pelo app:</p>
        <ul style="margin:0;padding-left:20px;font-size:15px;line-height:1.6;color:#222C37;">${docsHtml}</ul>
      </div>

      <a href="${esc(link)}" style="display:inline-block;background:#FF5C0A;color:#fff;text-decoration:none;padding:14px 28px;border-radius:12px;font-weight:700;font-size:15px;">Enviar documentos →</a>

      <p style="font-size:14px;line-height:1.6;color:#475567;margin:20px 0 0;">
        Já enviou pelo app logo depois do cadastro? Então é só aguardar: nossa equipe analisa e te avisa por e-mail.
      </p>
      <p style="font-size:12px;color:#9AA6B6;margin:16px 0 0;line-height:1.6;">${accessHtml}${replyHtml}</p>
      ${signatureHtml(appUrl)}
      <p style="font-size:11px;color:#CBD3DD;margin:16px 0 0;line-height:1.6;">
        Você está recebendo este e-mail porque fez cadastro no Mecânico App com o e-mail ${esc(user.email)}. Se não foi você, é só ignorar.
      </p>
    </div>
  </div>
</body>
</html>`;

    const text = `${tpl.greeting} ${firstName},\n\n${tpl.intro}\n\nFalta pouco: para seu cadastro entrar em análise, envie pelo app:\n${tpl.docs.map((d) => `- ${d}`).join('\n')}\n\nEnviar documentos: ${link}\n\nJá enviou pelo app logo depois do cadastro? Então é só aguardar: nossa equipe analisa e te avisa por e-mail.${replyTo ? '\nSe preferir, responda este e-mail com as fotos.' : ''}\n\n${signatureText(appUrl)}`;

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: `Mecânico App <${fromEmail}>`, to: [user.email], subject: SUBJECT, html, text,
        ...(replyTo ? { reply_to: replyTo } : {}),
      }),
    });

    const result = await res.json();
    if (!res.ok) return json({ sent: false, error: result });
    return json({ sent: true, id: result.id, to: user.email, role: profile.role, direct_login: directLogin });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
