// Fotos de capa do blog via Pixabay (gratuito, uso comercial liberado). Só admin.
//   action 'search' { query }                 → 12 opções (miniaturas)
//   action 'pick'   { pixabay_id, article_id?, query? } → baixa a foto, guarda no nosso
//                   storage (o Pixabay pede para não linkar direto) e grava na capa do artigo
import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const OLD_LOOK = /vintage|retro|antique|classic|oldtimer|old car|old-timer|sepia|black and white|monochrome|nostalg|rust|abandoned|ruin/i;

interface Hit { id: number; webformatURL: string; largeImageURL: string; user: string; pageURL: string; tags: string; imageWidth: number; imageHeight: number }

async function pixabay(key: string, params: Record<string, string>) {
  const qs = new URLSearchParams({ key, image_type: 'photo', safesearch: 'true', ...params });
  const r = await fetch(`https://pixabay.com/api/?${qs}`);
  if (!r.ok) throw new Error(r.status === 400 || r.status === 401 ? 'Chave do Pixabay inválida.' : `Pixabay respondeu ${r.status}`);
  return (await r.json()).hits as Hit[];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const auth = req.headers.get('Authorization');
    if (!auth) return json({ error: 'no auth' }, 401);
    const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: 'unauthorized' }, 401);
    const { data: p } = await admin.from('profiles').select('role').eq('id', user.id).maybeSingle();
    if (p?.role !== 'admin') return json({ error: 'forbidden' }, 403);

    const { data: s } = await admin.from('app_settings').select('value').eq('key', 'pixabay_api_key').maybeSingle();
    const key = s?.value?.trim();
    if (!key) return json({ error: 'Cole a chave do Pixabay em Configurações > Inteligência Artificial.' }, 400);

    const body = await req.json();

    if (body.action === 'search') {
      const q = String(body.query ?? '').trim().slice(0, 100);
      if (!q) return json({ error: 'Digite o que buscar.' }, 400);
      // Busca em inglês costuma trazer mais fotos; o Pixabay entende português também
      let hits = await pixabay(key, { q, orientation: 'horizontal', per_page: '40', min_width: '1200', order: 'popular' });
      if (!hits.length) hits = await pixabay(key, { q, lang: 'pt', orientation: 'horizontal', per_page: '40', min_width: '1000' });
      // Prioriza o visual moderno: carro antigo, sépia e preto e branco vão pro fim
      const modern = hits.filter(h => !OLD_LOOK.test(h.tags));
      hits = [...modern, ...hits.filter(h => OLD_LOOK.test(h.tags))].slice(0, 12);
      return json({ results: hits.map(h => ({ id: h.id, thumb: h.webformatURL, user: h.user, page: h.pageURL, tags: h.tags })) });
    }

    if (body.action === 'pick') {
      const id = Number(body.pixabay_id);
      if (!id) return json({ error: 'Foto inválida.' }, 400);
      const [hit] = await pixabay(key, { id: String(id) });
      if (!hit) return json({ error: 'Foto não encontrada no Pixabay.' }, 404);
      const img = await fetch(hit.largeImageURL);
      if (!img.ok) return json({ error: 'Não deu pra baixar a foto.' }, 502);
      const bytes = new Uint8Array(await img.arrayBuffer());
      const path = `capas/pixabay-${hit.id}.jpg`;
      const { error: upErr } = await admin.storage.from('panel-banners').upload(path, bytes, { contentType: 'image/jpeg', upsert: true });
      if (upErr) throw upErr;
      const publicUrl = admin.storage.from('panel-banners').getPublicUrl(path).data.publicUrl;
      const credit = `Foto: ${hit.user} / Pixabay`;
      if (body.article_id) {
        await admin.from('panel_articles').update({
          cover_url: publicUrl, cover_credit: credit,
          ...(body.query ? { cover_query: String(body.query).slice(0, 100) } : {}),
          updated_at: new Date().toISOString(),
        }).eq('id', body.article_id);
      }
      return json({ url: publicUrl, credit });
    }

    return json({ error: 'ação inválida' }, 400);
  } catch (e) {
    return json({ error: String(e instanceof Error ? e.message : e) }, 500);
  }
});
