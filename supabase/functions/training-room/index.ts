// Sala de treinamentos (LiveKit). Deploy com verify_jwt=false: o convidado entra
// pelo link público, sem login. As ações do apresentador conferem admin aqui.
//   info        { share_token }                        → dados da sessão (público)
//   guest_token { share_token, name, phone?, store? }  → entra como convidado (público)
//   host_token  { session_id }                         → entra como apresentador (admin)
//   record      { session_id, on: boolean }            → começa/para de gravar (admin); entrar não grava
//   screen      { session_id, identity, on: boolean }  → libera/tira a tela de um convidado (admin)
//   end         { session_id }                         → para a gravação e fecha a sala (admin)
//   delete_recording { session_id, url }               → apaga um trecho gravado do R2 (admin)
//   delete_session   { session_id }                    → apaga o treinamento e as gravações (admin)
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { AccessToken, ParticipantPermission, TrackSource } from 'npm:livekit-server-sdk@2.19.2';
import {
  deleteRecordingFile, egressClient, livekitKeys, livekitWsUrl, roomService, startRoomRecording,
} from '../_shared/livekit.ts';

async function stopRecordings(room: string) {
  try {
    const active = await egressClient().listEgress({ roomName: room, active: true });
    for (const e of active) {
      try { await egressClient().stopEgress(e.egressId); } catch (err) { console.warn('[training-room] stopEgress', err); }
    }
  } catch (err) { console.warn('[training-room] listEgress', err); }
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const clean = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

async function makeToken(room: string, identity: string, name: string, host: boolean) {
  const { apiKey, apiSecret } = livekitKeys();
  const at = new AccessToken(apiKey, apiSecret, { identity, name, ttl: '6h' });
  at.addGrant({
    roomJoin: true,
    room,
    canSubscribe: true,
    canPublish: true,
    canPublishData: true,
    roomAdmin: host,
    // Convidado fala e aparece, mas só quem apresenta compartilha a tela
    canPublishSources: host ? undefined : [TrackSource.MICROPHONE, TrackSource.CAMERA],
  });
  return at.toJwt();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const body = await req.json().catch(() => ({}));
    const action = body.action as string;

    if (action === 'info' || action === 'guest_token') {
      const token = clean(body.share_token, 64);
      if (!token) return json({ error: 'link inválido' }, 400);
      const { data: s } = await admin.from('training_sessions')
        .select('id, title, description, scheduled_at, status, livekit_room_name')
        .eq('share_token', token).maybeSingle();
      if (!s) return json({ error: 'treinamento não encontrado' }, 404);

      if (action === 'info') {
        const { livekit_room_name: _r, id: _i, ...pub } = s;
        return json({ session: pub });
      }

      if (s.status === 'completed' || s.status === 'cancelled') {
        return json({ error: 'esse treinamento já terminou' }, 410);
      }
      const name = clean(body.name, 80);
      if (name.length < 2) return json({ error: 'informe seu nome' }, 400);

      const identity = `guest-${crypto.randomUUID()}`;
      await admin.from('training_participants').insert({
        session_id: s.id, name, identity,
        phone: clean(body.phone, 30) || null,
        store_name: clean(body.store, 120) || null,
      });
      return json({
        token: await makeToken(s.livekit_room_name, identity, name, false),
        ws_url: livekitWsUrl(),
        title: s.title,
      });
    }

    // ── Ações do apresentador: só admin ──
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'no auth' }, 401);
    const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: 'unauthorized' }, 401);
    const { data: profile } = await admin.from('profiles').select('role, full_name').eq('id', user.id).maybeSingle();
    if (profile?.role !== 'admin') return json({ error: 'forbidden' }, 403);

    const { data: s } = await admin.from('training_sessions')
      .select('id, title, status, livekit_room_name, recording_status, recording_url, recording_segments, started_at')
      .eq('id', clean(body.session_id, 64)).maybeSingle();
    if (!s) return json({ error: 'treinamento não encontrado' }, 404);

    if (action === 'host_token') {
      if (s.status === 'cancelled') return json({ error: 'treinamento cancelado' }, 410);
      // Reabrir sessão encerrada é permitido (ex.: caiu a conexão do apresentador)
      await admin.from('training_sessions').update({
        status: 'live', ended_at: null, started_at: s.started_at ?? new Date().toISOString(),
      }).eq('id', s.id);
      const name = profile.full_name || 'Apresentador';
      return json({
        token: await makeToken(s.livekit_room_name, `host-${user.id}`, name, true),
        ws_url: livekitWsUrl(),
        title: s.title,
      });
    }

    if (action === 'record') {
      if (body.on) {
        // Cada vez que liga a gravação vira um trecho novo (Parte 1, Parte 2…)
        const active = await egressClient().listEgress({ roomName: s.livekit_room_name, active: true });
        if (active.length > 0) return json({ ok: true, recording: true });
        const url = await startRoomRecording(s.livekit_room_name);
        await admin.from('training_sessions').update({
          recording_status: 'recording',
          recording_url: s.recording_url ?? url,
          recording_segments: [...(s.recording_segments ?? []), url],
        }).eq('id', s.id);
        return json({ ok: true, recording: true });
      }
      await stopRecordings(s.livekit_room_name);
      return json({ ok: true, recording: false });
    }

    if (action === 'screen') {
      // Suporte: o apresentador deixa um convidado mostrar a tela dele, e tira depois
      const identity = clean(body.identity, 80);
      if (!identity.startsWith('guest-')) return json({ error: 'participante inválido' }, 400);
      const sources = [TrackSource.MICROPHONE, TrackSource.CAMERA];
      if (body.on) sources.push(TrackSource.SCREEN_SHARE, TrackSource.SCREEN_SHARE_AUDIO);
      await roomService().updateParticipant(s.livekit_room_name, identity, {
        permission: new ParticipantPermission({
          canSubscribe: true, canPublish: true, canPublishData: true, canPublishSources: sources,
        }),
      });
      return json({ ok: true, screen: !!body.on });
    }

    if (action === 'end') {
      await stopRecordings(s.livekit_room_name);
      try { await roomService().deleteRoom(s.livekit_room_name); } catch (err) { console.warn('[training-room] deleteRoom', err); }

      await admin.from('training_sessions')
        .update({ status: 'completed', ended_at: new Date().toISOString() })
        .eq('id', s.id);
      return json({ ok: true });
    }

    if (action === 'delete_recording' || action === 'delete_session') {
      if (s.recording_status === 'recording') {
        return json({ error: 'pare a gravação antes de excluir' }, 409);
      }
      const segments: string[] = s.recording_segments ?? [];
      const targets = action === 'delete_session' ? segments : segments.filter((u) => u === body.url);
      if (action === 'delete_recording' && targets.length === 0) return json({ error: 'gravação não encontrada' }, 404);
      for (const u of targets) await deleteRecordingFile(u);

      if (action === 'delete_session') {
        try { await roomService().deleteRoom(s.livekit_room_name); } catch { /* sala já fechada */ }
        await admin.from('training_sessions').delete().eq('id', s.id);
        return json({ ok: true });
      }
      const rest = segments.filter((u) => u !== body.url);
      await admin.from('training_sessions').update({
        recording_segments: rest,
        recording_url: rest[0] ?? null,
        recording_status: rest.length ? s.recording_status : 'off',
      }).eq('id', s.id);
      return json({ ok: true });
    }

    return json({ error: 'ação inválida' }, 400);
  } catch (err) {
    console.error('[training-room]', err);
    return json({ error: (err as Error).message }, 500);
  }
});
