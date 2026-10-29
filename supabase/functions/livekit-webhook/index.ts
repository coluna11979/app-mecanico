// Eventos do LiveKit (Settings → Webhooks apontando pra cá). Deploy com verify_jwt=false:
// a autenticidade vem da assinatura do LiveKit (WebhookReceiver com a API secret).
// A gravação é ligada pelo botão do apresentador (training-room action=record);
// aqui só acompanha o fim de cada trecho.
//   egress_ended  → fecha a gravação; no limite de duração, abre novo trecho
//   room_finished → marca o treinamento como encerrado
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { EgressStatus, WebhookReceiver } from 'npm:livekit-server-sdk@2.19.2';
import { livekitKeys, roomService, startRoomRecording } from '../_shared/livekit.ts';

Deno.serve(async (req) => {
  try {
    const { apiKey, apiSecret } = livekitKeys();
    const receiver = new WebhookReceiver(apiKey, apiSecret);
    const event = await receiver.receive(await req.text(), req.headers.get('Authorization') ?? undefined);

    const roomName = event.room?.name ?? event.egressInfo?.roomName;
    if (!roomName) return new Response('ok');

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: s } = await admin.from('training_sessions')
      .select('id, recording_segments')
      .eq('livekit_room_name', roomName).maybeSingle();
    if (!s) return new Response('ok');

    if (event.event === 'egress_ended') {
      const status = event.egressInfo?.status;
      if (status === EgressStatus.EGRESS_LIMIT_REACHED) {
        // Egress tem duração máxima: se ainda tem gente na sala, grava o próximo trecho
        const people = await roomService().listParticipants(roomName).catch(() => []);
        if (people.length > 0) {
          try {
            const url = await startRoomRecording(roomName);
            await admin.from('training_sessions')
              .update({ recording_segments: [...(s.recording_segments ?? []), url] })
              .eq('id', s.id);
          } catch (err) { console.error('[livekit-webhook] restart', err); }
        } else {
          await admin.from('training_sessions').update({ recording_status: 'completed' }).eq('id', s.id);
        }
      } else if (status === EgressStatus.EGRESS_COMPLETE) {
        await admin.from('training_sessions').update({ recording_status: 'completed' }).eq('id', s.id);
      } else {
        console.error('[livekit-webhook] egress falhou', event.egressInfo?.error);
        await admin.from('training_sessions').update({ recording_status: 'failed' }).eq('id', s.id);
      }
    }

    if (event.event === 'room_finished') {
      await admin.from('training_sessions')
        .update({ status: 'completed', ended_at: new Date().toISOString() })
        .eq('id', s.id).eq('status', 'live');
    }

    return new Response('ok');
  } catch (err) {
    console.error('[livekit-webhook]', err);
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 400 });
  }
});
