// Clientes LiveKit + gravação no Cloudflare R2, compartilhados entre training-room
// e livekit-webhook. Tudo vem dos secrets do Supabase — nada fixo no código.
import {
  EgressClient, EncodedFileOutput, EncodedFileType, RoomServiceClient, S3Upload,
} from 'npm:livekit-server-sdk@2.19.2';
import { AwsClient } from 'npm:aws4fetch@1.0.20';

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
    // Sem o .json de manifesto ao lado do vídeo: ficaria órfão ao excluir a gravação
    disableManifest: true,
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

// Apaga do R2 o MP4 de uma URL pública gerada por startRoomRecording.
// Só aceita arquivos da pasta treinamentos/ do nosso bucket.
export async function deleteRecordingFile(publicUrl: string): Promise<void> {
  const prefix = `${env('R2_PUBLIC_URL').replace(/\/$/, '')}/`;
  if (!publicUrl.startsWith(prefix)) throw new Error('gravação fora do bucket');
  const key = publicUrl.slice(prefix.length);
  if (!/^treinamentos\/[\w.-]+\.mp4$/.test(key)) throw new Error('gravação inválida');

  const r2 = new AwsClient({
    accessKeyId: env('R2_ACCESS_KEY_ID'),
    secretAccessKey: env('R2_SECRET_ACCESS_KEY'),
    service: 's3',
    region: 'auto',
  });
  const res = await r2.fetch(`${env('R2_ENDPOINT').replace(/\/$/, '')}/${env('R2_BUCKET')}/${key}`, { method: 'DELETE' });
  // 404 = já não existe; segue como apagado
  if (!res.ok && res.status !== 404) throw new Error(`R2 respondeu ${res.status}`);
}
