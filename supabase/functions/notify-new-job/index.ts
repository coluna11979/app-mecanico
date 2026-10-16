// Dispara notificação push ("toca o celular") para os mecânicos quando nasce
// uma demanda. Chamada pelo trigger jobs_notify_push (0112) via pg_net.
//
// Quem recebe:
//   - convite direto  → só o mecânico convidado
//   - demanda "favorites" → preferidos da oficina que estão Disponíveis
//   - demanda pública → mecânicos aprovados e Disponíveis, até RADIUS_KM da
//     oficina (se faltar coordenada de um dos lados, recebe — melhor tocar
//     a mais do que deixar de tocar)
//
// Secrets: PUSH_NOTIFY_SECRET, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
// verify_jwt = false (autenticação pelo header x-push-secret)
import { createClient } from 'jsr:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const RADIUS_KM = 30;

function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const dLat = (bLat - aLat) * Math.PI / 180;
  const dLng = (bLng - aLng) * Math.PI / 180;
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(aLat * Math.PI / 180) * Math.cos(bLat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Espelha jobGross() de src/lib/payment.ts
function jobGross(j: { price_per_hour?: number | null; max_hours?: number | null; price?: number | null }): number {
  const cap = Number(j.price_per_hour ?? 0) * Number(j.max_hours ?? 1);
  return cap > 0 ? cap : Number(j.price ?? 0);
}

const brl = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });

  const secret = Deno.env.get('PUSH_NOTIFY_SECRET');
  if (!secret || req.headers.get('x-push-secret') !== secret) {
    return new Response('unauthorized', { status: 401 });
  }

  const pub  = Deno.env.get('VAPID_PUBLIC_KEY');
  const priv = Deno.env.get('VAPID_PRIVATE_KEY');
  if (!pub || !priv) return new Response('vapid not configured', { status: 500 });
  webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT') || 'mailto:contato@mecanicoapp.com.br', pub, priv);

  const { job_id, kind } = await req.json().catch(() => ({}));
  if (!job_id) return new Response('job_id required', { status: 400 });

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const { data: job } = await supabase
    .from('jobs')
    .select('id, title, status, audience, mechanic_id, workshop_id, price, price_per_hour, max_hours, scheduled_at, workshop:workshops(business_name, lat, lng, city)')
    .eq('id', job_id)
    .maybeSingle();
  if (!job) return Response.json({ sent: 0, reason: 'job not found' });

  const isInvite = kind === 'invite';
  // A demanda pode ter sido aceita entre o insert e esta chamada
  if (!isInvite && job.status !== 'open') return Response.json({ sent: 0, reason: 'not open' });

  // ── Destinatários ──
  type Mech = { id: string; profile_id: string; current_lat: number | null; current_lng: number | null; profile: { status: string } | null };
  let mechs: Mech[] = [];
  const cols = 'id, profile_id, current_lat, current_lng, profile:profiles!inner(status)';

  if (isInvite) {
    if (!job.mechanic_id) return Response.json({ sent: 0, reason: 'no mechanic' });
    const { data } = await supabase.from('mechanics').select(cols).eq('id', job.mechanic_id);
    mechs = (data ?? []) as unknown as Mech[];
  } else if (job.audience === 'favorites') {
    const { data: favs } = await supabase
      .from('workshop_favorite_mechanics').select('mechanic_id').eq('workshop_id', job.workshop_id);
    const ids = (favs ?? []).map(f => f.mechanic_id);
    if (ids.length) {
      const { data } = await supabase.from('mechanics').select(cols)
        .in('id', ids).eq('is_available', true).eq('profile.status', 'approved');
      mechs = (data ?? []) as unknown as Mech[];
    }
  } else {
    const { data } = await supabase.from('mechanics').select(cols)
      .eq('is_available', true).eq('profile.status', 'approved');
    const shop = job.workshop as unknown as { lat: number | null; lng: number | null } | null;
    mechs = ((data ?? []) as unknown as Mech[]).filter(m => {
      if (shop?.lat == null || shop?.lng == null || m.current_lat == null || m.current_lng == null) return true;
      return distanceKm(shop.lat, shop.lng, m.current_lat, m.current_lng) <= RADIUS_KM;
    });
  }

  const userIds = mechs.map(m => m.profile_id);
  if (!userIds.length) return Response.json({ sent: 0, reason: 'no recipients' });

  const { data: subs } = await supabase
    .from('push_subscriptions').select('id, endpoint, p256dh, auth').in('user_id', userIds);
  if (!subs?.length) return Response.json({ sent: 0, reason: 'no subscriptions' });

  // ── Conteúdo ── (mecânico só vê o líquido; taxa vem de app_settings)
  const { data: fee } = await supabase.from('app_settings').select('value').eq('key', 'platform_fee_percent').maybeSingle();
  const feePct = Number(fee?.value);
  const share  = 1 - (Number.isFinite(feePct) && feePct > 0 && feePct < 100 ? feePct : 20) / 100;
  const net    = jobGross(job) * share;
  const shop   = job.workshop as unknown as { business_name?: string; city?: string } | null;

  const payload = JSON.stringify({
    title: isInvite ? 'Você recebeu um convite de serviço' : 'Nova demanda disponível',
    body:  [job.title, shop?.business_name, net > 0 ? `R$ ${brl(net)}` : null].filter(Boolean).join(' · '),
    url:   isInvite ? `/mecanico/job/${job.id}` : '/mecanico/dashboard',
    tag:   `job-${job.id}`,
  });

  let sent = 0;
  const dead: string[] = [];
  await Promise.all(subs.map(async s => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payload,
        { TTL: 60 * 30, urgency: 'high' },
      );
      sent++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) dead.push(s.id); // aparelho desinscreveu
      else console.error('[notify-new-job] push falhou', code, (e as Error).message);
    }
  }));

  if (dead.length) await supabase.from('push_subscriptions').delete().in('id', dead);
  if (sent) {
    await supabase.from('push_subscriptions')
      .update({ last_used_at: new Date().toISOString() })
      .in('id', subs.filter(s => !dead.includes(s.id)).map(s => s.id));
  }

  return Response.json({ sent, removed: dead.length, recipients: userIds.length });
});
