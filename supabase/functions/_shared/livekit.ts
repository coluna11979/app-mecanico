// Clientes LiveKit + gravação no Cloudflare R2, compartilhados entre training-room
// e livekit-webhook. Tudo vem dos secrets do Supabase — nada fixo no código.
import {
  EgressClient, EncodedFileOutput, EncodedFileType, RoomServiceClient, S3Upload,
} from 'npm:livekit-server-sdk@2.19.2';

function env(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`secret ${name} não configurado`);
  return v;
}

export const livekitKeys = () => ({ apiKey: env('LIVEKIT_API_KEY'), apiSecret: env('LIVEKIT_API_SECRET') });

// LIVEKIT_URL é https:// (API do servidor); o navegador conecta no wss:// equivalente
export const livekitHttpUrl = () => env('LIVEKIT_URL').replace(/^wss:/, 'https:');
export const livekitWsUrl   = () => Deno.env.get('LIVEKIT_WS_URL') || livekitHttpUrl().replace(/^https:/, 'wss:');

export function egressClient() {
  const { apiKey, apiSecret } = livekitKeys();
  return new EgressClient(livekitHttpUrl(), apiKey, apiSecret);
}

export function roomService() {
  const { apiKey, apiSecret } = livekitKeys();
  return new RoomServiceClient(livekitHttpUrl(), apiKey, apiSecret);
}

// Inicia a gravação da sala inteira (layout "speaker": tela compartilhada em destaque)
// e devolve a URL pública do MP4 no R2.
export async function startRoomRecording(roomName: string): Promise<string> {
  const filepath = `treinamentos/${roomName}-${Date.now()}.mp4`;
  const file = new EncodedFileOutput({
    fileType: EncodedFileType.MP4,
    filepath,
    output: {
      case: 's3',
      value: new S3Upload({
        accessKey: env('R2_ACCESS_KEY_ID'),
        secret: env('R2_SECRET_ACCESS_KEY'),
        bucket: env('R2_BUCKET'),
        endpoint: env('R2_ENDPOINT'),
        region: 'auto',
        forcePathStyle: true,
      }),
    },
  });
  await egressClient().startRoomCompositeEgress(roomName, file, { layout: 'speaker' });
  return `${env('R2_PUBLIC_URL').replace(/\/$/, '')}/${filepath}`;
}
