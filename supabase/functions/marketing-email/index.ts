// E-mail marketing do admin (Resend). Só admin chama.
//   action 'preview' → quantos destinatários o segmento tem (sem enviar)
//   action 'test'    → manda 1 cópia pro e-mail do próprio admin
//   action 'send'    → cria o disparo, manda em lotes de 100 e registra cada envio
// Segmento: { audience: mechanic|workshop|all, status: approved|pending|all, state: UF|'', include_leads }.
// Descadastrados (marketing_unsubscribes) nunca recebem; leads só com consentimento.
// Quem recebe é decidido pela função SQL marketing_recipients (migration 0180): todas as regras moram lá.
// (Antes usava auth.admin.listUsers(), que dá 500 "Database error finding users" se qualquer conta tiver
// banned_until = 'infinity' — o que a trigger sync_operator_login_ban grava ao desativar um colaborador.)
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { signatureHtml, signatureText } from '../_shared/brandSignature.ts';

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

// ── Erros ────────────────────────────────────────────────────────────────────────────────────────
// Segmento inválido é erro de quem chamou (400). Qualquer outra falha vira 500 com o passo e o erro completo
// (message, code, details, hint) — antes só saía a mensagem crua e não dava pra saber de onde veio.
class SegmentError extends Error {}

type ErrInfo = { message: string; code?: string; details?: string; hint?: string; status?: number; name?: string };
function describeError(e: unknown): ErrInfo {
  if (e && typeof e === 'object') {
    const o = e as Record<string, unknown>;
    const s = (v: unknown) => (v == null || v === '' ? undefined : String(v));
    return {
      message: s(o.message) ?? s(o.msg) ?? s(o.error_description) ?? 'erro sem mensagem',
      code: s(o.code), details: s(o.details), hint: s(o.hint), name: s(o.name),
      status: typeof o.status === 'number' ? o.status : undefined,
    };
  }
  return { message: String(e) };
}
class StepError extends Error {
  step: string;
  info: ErrInfo;
  constructor(step: string, cause: unknown) {
    super(describeError(cause).message);
    this.step = step;
    this.info = describeError(cause);
  }
}

// ── Segmento ─────────────────────────────────────────────────────────────────────────────────────
const AUDIENCES = ['mechanic', 'workshop', 'all'];
const STATUSES = ['pending', 'approved', 'all'];

/** Valor desconhecido NÃO vira "todos": um status/público errado mandaria e-mail pra quem não devia. */
function normalizeSegment(seg: Segment) {
  const audience = seg.audience ?? 'all';
  const status = seg.status ?? 'all';
  if (!AUDIENCES.includes(audience)) throw new SegmentError(`audience inválido: "${audience}" (use mechanic, workshop ou all)`);
  if (!STATUSES.includes(status)) throw new SegmentError(`status inválido: "${status}" (use pending, approved ou all)`);
  const state = (seg.state ?? '').trim().toUpperCase();
  if (state && !/^[A-Z]{2}$/.test(state)) throw new SegmentError(`state inválido: "${seg.state}" (use a sigla da UF, ex.: SP)`);
  return { audience, status, state, include_leads: seg.include_leads === true };
}

type RecipientRow = { email: string; name: string | null; profile_id: string | null; lead_id: string | null };

const PAGE = 1000; // o PostgREST corta em 1000 linhas sem avisar: sem paginar, a contagem sairia menor que a real

async function resolveRecipients(admin: SupabaseClient, seg: Segment): Promise<Recipient[]> {
  const s = normalizeSegment(seg);
  const out: Recipient[] = [];
  for (let from = 0; from < 100 * PAGE; from += PAGE) {
    const { data, error } = await admin
      .rpc('marketing_recipients', {
        p_audience: s.audience, p_status: s.status, p_state: s.state || null, p_include_leads: s.include_leads,
      })
      .range(from, from + PAGE - 1);
    if (error) throw new StepError('buscar destinatários (rpc marketing_recipients)', error);
    const rows = (data ?? []) as RecipientRow[];
    for (const r of rows) {
      out.push({ email: r.email, name: r.name ?? '', profile_id: r.profile_id ?? undefined, lead_id: r.lead_id ?? undefined });
    }
    if (rows.length < PAGE) break;
  }
  return out;
}

function render(c: Content, r: Recipient, unsubUrl: string | null, appUrl: string) {
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
      ${signatureHtml(appUrl)}
      <p style="font-size:11px;color:#CBD3DD;margin:20px 0 0;line-height:1.6;">
        Você recebe este e-mail por ter cadastro ou interesse no Mecânico App.<br>${unsub}
      </p>
    </div>
  </div>
</body>
</html>`;
  const text = `${fill(c.heading)}\n\n${fill(c.body)}\n${c.cta_label && c.cta_url ? `\n${c.cta_label}: ${c.cta_url}\n` : ''}\n${signatureText(appUrl)}${unsubUrl ? `\n\nDescadastrar: ${unsubUrl}` : ''}`;
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

    let body: { action?: string; segment?: Segment; content?: Content };
    try { body = await req.json(); } catch { return json({ error: 'corpo da requisição não é um JSON válido' }, 400); }
    const { action, segment = {}, content } = body;

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

    const { data: settings, error: settingsErr } = await admin.from('app_settings').select('key, value')
      .in('key', ['resend_api_key', 'resend_from_email', 'app_public_url']);
    if (settingsErr) throw new StepError('ler configurações (app_settings)', settingsErr);
    const cfg: Record<string, string> = {};
    for (const s of settings ?? []) cfg[s.key] = s.value;
    const apiKey = cfg.resend_api_key?.trim();
    if (!apiKey) return json({ error: 'Resend não configurado (resend_api_key em Configurações).' }, 400);
    const from = `Mecânico App <${cfg.resend_from_email?.trim() || 'noreply@resend.dev'}>`;
    const appUrl = (cfg.app_public_url?.trim() || 'https://mecanicoapp.com.br').replace(/\/$/, '');

    if (action === 'test') {
      if (!caller.email) return json({ error: 'admin sem e-mail' }, 400);
      const m = render(content, { email: caller.email, name: callerProfile?.full_name ?? '' }, null, appUrl);
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
    if (blastErr) throw new StepError('registrar o disparo (marketing_email_blasts)', blastErr);

    let sent = 0, failed = 0;
    for (let i = 0; i < list.length; i += 100) {
      const chunk = list.slice(i, i + 100).map((r) => ({ ...r, token: crypto.randomUUID() }));
      const payload = chunk.map((r) => {
        const m = render(content, r, `${appUrl}/descadastrar/${r.token}`, appUrl);
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
    if (e instanceof SegmentError) return json({ error: e.message }, 400);
    const step = e instanceof StepError ? e.step : 'inesperado';
    const info = e instanceof StepError ? e.info : describeError(e);
    // Aparece em Logs > Edge Functions do Supabase, com o erro completo
    console.error(`[marketing-email] falha em "${step}"`, JSON.stringify(info));
    return json({ error: `${step}: ${info.message}`, step, code: info.code, details: info.details, hint: info.hint }, 500);
  }
});
