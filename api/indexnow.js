// POST /api/indexnow { slug }  → avisa Bing/Yandex (IndexNow) que o artigo é novo ou mudou.
// O ChatGPT Search busca pelo Bing, então isso faz o post aparecer lá em horas, não semanas.
// Sem login de propósito: só aceita slug de artigo público e já publicado, então no máximo
// alguém reavisa um link nosso. A chave fica em public/<chave>.txt (o IndexNow confere).
import { SITE, getPublic } from './_lib/blog.js';

const KEY = '80d663b68d30636859bcc7d113f79e67';

export async function POST(request) {
  let slug = '';
  try { slug = String((await request.json()).slug || ''); } catch { /* corpo inválido */ }
  slug = slug.replace(/[^a-z0-9-]/gi, '').slice(0, 200);
  if (!slug) return Response.json({ ok: false, error: 'slug' }, { status: 400 });

  const a = await getPublic(slug).catch(() => null);
  if (!a) return Response.json({ ok: false, error: 'artigo não é público ou ainda não foi publicado' }, { status: 404 });

  const host = new URL(SITE).host;
  const r = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      host, key: KEY, keyLocation: `${SITE}/${KEY}.txt`,
      urlList: [`${SITE}/blog/${slug}`, `${SITE}/blog`],
    }),
  });
  return Response.json({ ok: r.ok, status: r.status });
}
