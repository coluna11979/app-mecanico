// Transcreve um áudio curto (fala no chat dos agentes) com a Soniox e devolve o texto.
// Corpo: multipart/form-data com o campo "audio" (webm/ogg/mp4/m4a/wav), até 10 MB.
// Só usuário logado que é admin da plataforma ou membro de alguma oficina. A chave fica em
// app_settings.soniox_api_key (Admin → Configurações), nunca no navegador. O áudio e a transcrição
// são apagados da Soniox logo depois.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const API = 'https://api.soniox.com/v1';
const MAX_BYTES = 10 * 1024 * 1024;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const auth = req.headers.get('Authorization');
  if (!auth) return json({ error: 'no auth' }, 401);

  const url = Deno.env.get('SUPABASE_URL')!;
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ error: 'unauthorized' }, 401);

  // Admin da plataforma ou membro de alguma oficina
  const [{ data: prof }, { data: member }, { data: owner }] = await Promise.all([
    admin.from('profiles').select('role').eq('id', user.id).maybeSingle(),
    admin.from('workshop_members').select('workshop_id').eq('profile_id', user.id).limit(1).maybeSingle(),
    admin.from('workshops').select('id').eq('profile_id', user.id).limit(1).maybeSingle(),
  ]);
  if (prof?.role !== 'admin' && !member && !owner) return json({ error: 'forbidden' }, 403);

  const { data: rows } = await admin.from('app_settings').select('key, value').in('key', ['soniox_api_key', 'soniox_model']);
  const cfg: Record<string, string> = {};
  for (const r of rows ?? []) cfg[r.key] = (r.value ?? '').trim();
  if (!cfg.soniox_api_key) return json({ error: 'Transcrição de áudio não configurada. Avise o suporte.' }, 503);
  const key = { Authorization: `Bearer ${cfg.soniox_api_key}` };

  const form = await req.formData().catch(() => null);
  const audio = form?.get('audio');
  if (!(audio instanceof File) || audio.size === 0) return json({ error: 'Áudio vazio' }, 400);
  if (audio.size > MAX_BYTES) return json({ error: 'Áudio muito longo (máx. ~2 minutos)' }, 400);

  let fileId: string | null = null;
  let trId: string | null = null;
  try {
    // 1) sobe o arquivo
    const up = new FormData();
    up.append('file', audio, audio.name || 'fala.webm');
    const fr = await fetch(`${API}/files`, { method: 'POST', headers: key, body: up });
    const fj = await fr.json().catch(() => null);
    if (!fr.ok || !fj?.id) throw new Error(`upload ${fr.status}: ${JSON.stringify(fj)?.slice(0, 200)}`);
    fileId = fj.id;

    // 2) pede a transcrição (português)
    const tr = await fetch(`${API}/transcriptions`, {
      method: 'POST', headers: { ...key, 'Content-Type': 'application/json' },
      // Vocabulário de oficina: sem isso "OS" vira "USP"
      body: JSON.stringify({
        model: cfg.soniox_model || 'stt-async-v6', file_id: fileId, language_hints: ['pt'],
        context: { terms: ['OS', 'ordem de serviço', 'placa', 'orçamento', 'troca de óleo', 'filtro de óleo', 'filtro de ar', 'pastilha de freio',
          'disco de freio', 'amortecedor', 'alinhamento', 'balanceamento', 'correia dentada', 'embreagem', 'injeção eletrônica', 'scanner'] },
      }),
    });
    const tj = await tr.json().catch(() => null);
    if (!tr.ok || !tj?.id) throw new Error(`transcricao ${tr.status}: ${JSON.stringify(tj)?.slice(0, 200)}`);
    trId = tj.id;

    // 3) espera ficar pronta (até ~60 s)
    let status = tj.status as string;
    for (let i = 0; i < 60 && status !== 'completed' && status !== 'error'; i++) {
      await sleep(1000);
      const s = await fetch(`${API}/transcriptions/${trId}`, { headers: key });
      const sj = await s.json().catch(() => null);
      status = sj?.status ?? status;
      if (status === 'error') {
        if (sj?.error_type === 'organization_balance_exhausted') {
          console.error('[transcribe-audio] Soniox sem saldo');
          return json({ error: 'A transcrição de áudio está sem saldo. Avise o suporte; por enquanto, digite.' }, 402);
        }
        throw new Error(`soniox: ${sj?.error_type ?? ''} ${sj?.error_message ?? 'erro na transcrição'}`);
      }
    }
    if (status !== 'completed') throw new Error('demorou demais para transcrever');

    // 4) texto
    const t = await fetch(`${API}/transcriptions/${trId}/transcript`, { headers: key });
    const txt = await t.json().catch(() => null);
    if (!t.ok) throw new Error(`transcript ${t.status}`);
    const text = String(txt?.text ?? '').replace(/\s+/g, ' ').trim();
    return json({ ok: true, text });
  } catch (e) {
    console.error('[transcribe-audio]', e);
    return json({ error: 'Não consegui transcrever o áudio agora. Tente de novo ou digite.' }, 502);
  } finally {
    // Não guarda nada na Soniox
    if (trId) await fetch(`${API}/transcriptions/${trId}`, { method: 'DELETE', headers: key }).catch(() => {});
    if (fileId) await fetch(`${API}/files/${fileId}`, { method: 'DELETE', headers: key }).catch(() => {});
  }
});
