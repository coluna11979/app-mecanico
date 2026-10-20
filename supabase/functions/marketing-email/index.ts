// E-mail marketing do admin (Resend). Só admin chama.
//   action 'preview' → quantos destinatários o segmento tem (sem enviar)
//   action 'test'    → manda 1 cópia pro e-mail do próprio admin
//   action 'send'    → cria o disparo, manda em lotes de 100 e registra cada envio
// Segmento: { audience: mechanic|workshop|all, status: approved|pending|all, state: UF|'', include_leads }.
// Descadastrados (marketing_unsubscribes) nunca recebem; leads só com consentimento.
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c));
}

type Segment = { audience?: string; status?: string; state?: string; include_leads?: boolean };
type Recipient = { email: string; name: string; profile_id?: string; lead_id?: string };
type Content = { subject: string; heading: string; body: string; cta_label?: string; cta_url?: string };

async function allAuthEmails(admin: SupabaseClient): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (let page = 1; page < 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    for (const u of data.users) if (u.email) map.set(u.id, u.email.toLowerCase());
    if (data.users.length < 1000) break;
  }
  return map;
}

async function resolveRecipients(admin: SupabaseClient, seg: Segment): Promise<Recipient[]> {
  const audience = seg.audience ?? 'all';
  const roles = audience === 'all' ? ['mechanic', 'workshop'] : [audience];

  let q = admin.from('profiles').select('id, full_name, role, status').in('role', roles);
  if (seg.status === 'approved') q = q.eq('status', 'approved');
  if (seg.status === 'pending') q = q.in('status', ['pending', 'under_review']);
  const { data: profiles, error } = await q;
  if (error) throw error;

  let allowed: Set<string> | null = null;
  if (seg.state) {
    const [m, w] = await Promise.all([
      admin.from('mechanics').select('profile_id').eq('state', seg.state),
      admin.from('workshops').select('profile_id').eq('state', seg.state),
    ]);
    allowed = new Set([...(m.data ?? []), ...(w.data ?? [])].map((r) => r.profile_id));
  }

  const emails = await allAuthEmails(admin);
  const { data: unsubs } = await admin.from('marketing_unsubscribes').select('email');
  const blocked = new Set((unsubs ?? []).map((u) => u.email.toLowerCase()));

  const out = new Map<string, Recipient>();
  for (const p of profiles ?? []) {
    if (allowed && !allowed.has(p.id)) continue;
    const email = emails.get(p.id);
    if (!email || blocked.has(email) || out.has(email)) continue;
    out.set(email, { email, name: p.full_name ?? '', profile_id: p.id });
  }

  if (seg.include_leads) {
    let lq = admin.from('leads').select('id, name, email, intent, estado')
      .eq('consent', true).is('converted_profile_id', null).neq('status', 'perdido');
    if (audience !== 'all') lq = lq.eq('intent', audience);
    if (seg.state) lq = lq.eq('estado', seg.state);
    const { data: leads } = await lq;
    for (const l of leads ?? []) {
      const email = (l.email ?? '').trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || blocked.has(email) || out.has(email)) continue;
      out.set(email, { email, name: l.name ?? '', lead_id: l.id });
    }
  }
  return [...out.values()];
}

function render(c: Content, r: Recipient, unsubUrl: string | null) {
  const first = (r.name || '').trim().split(/\s+/)[0] || 'parceiro';
  const fill = (s: string) => s.replaceAll('{nome}', first);
  const paragraphs = fill(c.body).split(/\n{2,}/).map((p) =>
    `<p style="font-size:15px;line-height:1.6;color:#475567;margin:0 0 16px;">${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
  const cta = c.cta_label && c.cta_url
    ? `<a href="${esc(c.cta_url)}" style="display:inline-block;background:#FF5C0A;color:#fff;text-decoration:none;padding:14px 28px;border-radius:12px;font-weight:700;font-size:15px;margin-top:4px;">${esc(c.cta_label)} →</a>`
    : '';
  const unsub = unsubUrl
    ? `<a href="${esc(unsubUrl)}" style="color:#9AA6B6;">Não quero mais receber esses e-mails</a>`
    : 'E-mail de teste — o link de descadastro aparece no envio real.';

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><title>${esc(fill(c.subject))}</title></head>
<body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#F5F7FA;margin:0;padding:40px 20px;color:#222C37;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,0.06);">
    <div style="background:linear-gradient(135deg,#FF5C0A,#E64500);padding:28px 32px;color:#fff;">
      <div style="font-size:13px;opacity:0.9;letter-spacing:1px;text-transform:uppercase;font-weight:700;">Mecânico App</div>
      <div style="font-size:22px;font-weight:700;margin-top:4px;">${esc(fill(c.heading))}</div>
    </div>
    <div style="padding:32px;">
      ${paragraphs}${cta}
      <p style="font-size:11px;color:#CBD3DD;margin:28px 0 0;line-height:1.6;">
        Você recebe este e-mail por ter cadastro ou interesse no Mecânico App.<br>${unsub}
      </p>
    </div>
  </div>
</body>
</html>`;
  const text = `${fill(c.heading)}\n\n${fill(c.body)}\n${c.cta_label && c.cta_url ? `\n${c.cta_label}: ${c.cta_url}\n` : ''}\n— Equipe Mecânico App${unsubUrl ? `\n\nDescadastrar: ${unsubUrl}` : ''}`;
  return { subject: fill(c.subject), html, text };
}

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
    const { data: { user: caller } } = await userClient.auth.getUser();
    if (!caller) return json({ error: 'unauthorized' }, 401);
    const { data: callerProfile } = await admin.from('profiles').select('role, full_name').eq('id', caller.id).maybeSingle();
    if (callerProfile?.role !== 'admin') return json({ error: 'forbidden' }, 403);

    const { action, segment = {}, content } = await req.json() as { action: string; segment?: Segment; content?: Content };

    if (action === 'preview') {
      const list = await resolveRecipients(admin, segment);
      return json({
        count: list.length,
        profiles: list.filter((r) => r.profile_id).length,
        leads: list.filter((r) => r.lead_id).length,
        sample: list.slice(0, 5).map((r) => r.name || r.email.replace(/(.{2}).*@/, '$1…@')),
      });
    }

    if (!content?.subject?.trim() || !content?.heading?.trim() || !content?.body?.trim()) {
      return json({ error: 'Preencha assunto, título e texto.' }, 400);
    }

    const { data: settings } = await admin.from('app_settings').select('key, value')
      .in('key', ['resend_api_key', 'resend_from_email', 'app_public_url']);
    const cfg: Record<string, string> = {};
    for (const s of settings ?? []) cfg[s.key] = s.value;
    const apiKey = cfg.resend_api_key?.trim();
    if (!apiKey) return json({ error: 'Resend não configurado (resend_api_key em Configurações).' }, 400);
    const from = `Mecânico App <${cfg.resend_from_email?.trim() || 'noreply@resend.dev'}>`;
    const appUrl = (cfg.app_public_url?.trim() || 'https://mecanicoapp.com.br').replace(/\/$/, '');

    if (action === 'test') {
      if (!caller.email) return json({ error: 'admin sem e-mail' }, 400);
      const m = render(content, { email: caller.email, name: callerProfile?.full_name ?? '' }, null);
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to: [caller.email], subject: `[TESTE] ${m.subject}`, html: m.html, text: m.text }),
      });
      if (!res.ok) return json({ error: `Resend: ${await res.text()}` }, 502);
      return json({ sent: true, to: caller.email });
    }

    if (action !== 'send') return json({ error: 'ação inválida' }, 400);

    const list = await resolveRecipients(admin, segment);
    if (!list.length) return json({ error: 'Nenhum destinatário nesse segmento.' }, 400);

    const { data: blast, error: blastErr } = await admin.from('marketing_email_blasts').insert({
      subject: content.subject.trim(), heading: content.heading.trim(), body: content.body,
      cta_label: content.cta_label?.trim() || null, cta_url: content.cta_url?.trim() || null,
      segment, recipients: list.length, created_by: caller.id,
    }).select('id').single();
    if (blastErr) throw blastErr;

    let sent = 0, failed = 0;
    for (let i = 0; i < list.length; i += 100) {
      const chunk = list.slice(i, i + 100).map((r) => ({ ...r, token: crypto.randomUUID() }));
      const payload = chunk.map((r) => {
        const m = render(content, r, `${appUrl}/descadastrar/${r.token}`);
        return {
          from, to: [r.email], subject: m.subject, html: m.html, text: m.text,
          headers: { 'List-Unsubscribe': `<${appUrl}/descadastrar/${r.token}>` },
        };
      });
      const res = await fetch('https://api.resend.com/emails/batch', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const errText = res.ok ? null : (await res.text()).slice(0, 300);
      await admin.from('marketing_email_sends').insert(chunk.map((r) => ({
        id: r.token, blast_id: blast.id, email: r.email, name: r.name || null,
        profile_id: r.profile_id ?? null, lead_id: r.lead_id ?? null,
        status: res.ok ? 'enviado' : 'erro', error: errText,
      })));
      if (res.ok) sent += chunk.length; else failed += chunk.length;
    }

    await admin.from('marketing_email_blasts').update({
      status: sent === 0 ? 'erro' : 'enviado', sent, failed, sent_at: new Date().toISOString(),
      error: failed ? `${failed} envio(s) falharam` : null,
    }).eq('id', blast.id);

    return json({ blast_id: blast.id, sent, failed });
  } catch (e) {
    return json({ error: String(e instanceof Error ? e.message : e) }, 500);
  }
});
