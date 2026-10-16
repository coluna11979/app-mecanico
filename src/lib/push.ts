import { supabase } from '@/lib/supabase';

/**
 * Notificação push de nova demanda (celular toca com a tela bloqueada).
 * O envio é feito pela edge function notify-new-job; aqui só registramos o
 * aparelho em push_subscriptions. A chave pública VAPID não é segredo.
 */
export const VAPID_PUBLIC_KEY = 'BMFc9T72rpnm2spFUxPlnWpN6UxBl2uuAOxCXeHf26mSqNEiN8Be4iAdE5zHxV2aSdg1LXft4Jotxp3lqFlDZS4';

export type PushState =
  | 'unsupported'        // navegador sem push
  | 'ios-needs-install'  // iPhone fora do app instalado na Tela de Início
  | 'denied'             // usuário bloqueou notificações
  | 'off'                // pode ativar
  | 'on';                // aparelho registrado

const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches
  || (navigator as unknown as { standalone?: boolean }).standalone === true;

/** Registro do service worker, sem travar se não houver (ex.: modo dev) */
async function getRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  const timeout = new Promise<null>(r => setTimeout(() => r(null), 4000));
  return Promise.race([navigator.serviceWorker.ready, timeout]);
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function saveSubscription(sub: PushSubscription) {
  const json = sub.toJSON();
  const { error } = await supabase.rpc('register_push_subscription', {
    p_endpoint:   sub.endpoint,
    p_p256dh:     json.keys?.p256dh ?? '',
    p_auth:       json.keys?.auth ?? '',
    p_user_agent: navigator.userAgent,
  });
  if (error) throw error;
}

export async function getPushState(): Promise<PushState> {
  const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  if (!supported) return isIOS() && !isStandalone() ? 'ios-needs-install' : 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  if (Notification.permission !== 'granted') return 'off';
  const reg = await getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return sub ? 'on' : 'off';
}

/** Pede permissão e registra o aparelho. Chamar a partir de um toque do usuário. */
export async function enablePush(): Promise<PushState> {
  const perm = await Notification.requestPermission();
  if (perm === 'denied') return 'denied';
  if (perm !== 'granted') return 'off';

  const reg = await getRegistration();
  if (!reg) throw new Error('Service worker indisponível');

  const sub = (await reg.pushManager.getSubscription())
    ?? await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  await saveSubscription(sub);
  return 'on';
}

/** Mantém o registro do aparelho em dia (endpoint pode mudar; outro login no mesmo celular) */
export async function syncPush() {
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const reg = await getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub) await saveSubscription(sub);
  } catch {
    /* melhor esforço */
  }
}
