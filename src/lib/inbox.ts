import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useModuleAllows } from '@/lib/modules';
import { sessionAllows, useOperator } from '@/lib/operators';

/* ── Inbox do WhatsApp da oficina (módulo opcional `inbox`) ──────────────────── */

export type InstanceStatus = 'none' | 'disconnected' | 'connecting' | 'connected' | 'banned';

export type WaInstance = {
  workshop_id: string;
  status: InstanceStatus;
  phone_number: string | null;
  profile_name: string | null;
  last_connected_at: string | null;
};

export type WaChat = {
  id: string;
  workshop_id: string;
  remote_jid: string;
  phone: string;
  name: string | null;
  avatar_url: string | null;
  customer_id: string | null;
  status: 'open' | 'resolved';
  unread_count: number;
  awaiting_since: string | null;
  last_message_at: string | null;
  last_message_preview: string | null;
  last_message_from_me: boolean | null;
  resolved_at: string | null;
  created_at: string;
  /** "Lembrar de retornar": dia em que a conversa volta para o topo */
  follow_up_at: string | null;
  follow_up_note: string | null;
  follow_up_by: string | null;
  customer?: { id: string; full_name: string } | null;
};

export type WaMessage = {
  id: string;
  chat_id: string;
  message_id: string | null;
  from_me: boolean;
  sent_by_name: string | null;
  content: string | null;
  message_type: 'text' | 'image' | 'video' | 'audio' | 'document' | 'sticker' | 'other';
  media_path: string | null;
  media_mime: string | null;
  file_name: string | null;
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
  is_deleted: boolean;
  sent_at: string;
};

export const CHAT_COLUMNS = 'id, workshop_id, remote_jid, phone, name, avatar_url, customer_id, status, unread_count, awaiting_since, last_message_at, last_message_preview, last_message_from_me, resolved_at, created_at, follow_up_at, follow_up_note, follow_up_by, customer:customers(id, full_name)';

/** Esperando resposta há mais que isso = urgente */
export const URGENT_MIN = 30;

/** Conversa esperando resposta da oficina (aberta e com mensagem do cliente sem resposta) */
export const isAwaiting = (c: WaChat) => c.status === 'open' && !!c.awaiting_since;
export const minutesSince = (iso: string | null, now = Date.now()) =>
  iso ? Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000)) : 0;
export const isUrgent = (c: WaChat, now = Date.now()) => isAwaiting(c) && minutesSince(c.awaiting_since, now) >= URGENT_MIN;

/** Retorno marcado vence hoje (ou já passou)? */
export function followUpDue(c: Pick<WaChat, 'follow_up_at'>, now = Date.now()) {
  if (!c.follow_up_at) return false;
  const end = new Date(now); end.setHours(23, 59, 59, 999);
  return new Date(c.follow_up_at).getTime() <= end.getTime();
}

/** "hoje", "amanhã", "atrasado 3 dias", "em 5 dias" */
export function followUpLabel(iso: string, now = Date.now()) {
  const day = (t: number) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const diff = Math.round((day(new Date(iso).getTime()) - day(now)) / 86400000);
  if (diff < 0) return `atrasado ${-diff} dia${diff === -1 ? '' : 's'}`;
  if (diff === 0) return 'hoje';
  if (diff === 1) return 'amanhã';
  return `em ${diff} dias`;
}

/** Texto que outra parte da tela manda para a caixa de mensagem (agenda, recomendação…) */
export const useComposeInject = create<{ text: string; n: number; push: (text: string) => void }>(set => ({
  text: '', n: 0,
  push: text => set(s => ({ text, n: s.n + 1 })),
}));

/** "agora", "12 min", "3h 20min", "2 dias" */
export function fmtWait(min: number) {
  if (min < 1) return 'agora';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return min % 60 ? `${h}h ${min % 60}min` : `${h}h`;
  const d = Math.floor(h / 24);
  return `${d} dia${d === 1 ? '' : 's'}`;
}

/** Hora na lista: hoje → 14:32, ontem → Ontem, senão 03/10 */
export function fmtListTime(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const y = new Date(today); y.setDate(y.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return 'Ontem';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

/** Separador de dia no chat */
export function fmtDay(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return 'Hoje';
  const y = new Date(today); y.setDate(y.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return 'Ontem';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export const chatTitle = (c: WaChat) => c.customer?.full_name || c.name || c.phone;

/** Chama as edge functions do Inbox e devolve a mensagem de erro de verdade */
export async function inboxCall<T = Record<string, unknown>>(fn: 'whatsapp-instance' | 'whatsapp-send', body: object): Promise<T> {
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (error) {
    let msg = error.message;
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === 'function') {
      try { msg = (await ctx.json())?.error ?? msg; } catch { /* corpo não é JSON */ }
    }
    throw new Error(msg);
  }
  return data as T;
}

/* ── Link temporário das mídias (bucket privado) ─────────────────────────────── */
const signed = new Map<string, { url: string; exp: number }>();

export function useMediaUrl(path: string | null) {
  const [url, setUrl] = useState<string | null>(() => {
    const hit = path ? signed.get(path) : null;
    return hit && hit.exp > Date.now() ? hit.url : null;
  });
  useEffect(() => {
    if (!path) { setUrl(null); return; }
    const hit = signed.get(path);
    if (hit && hit.exp > Date.now()) { setUrl(hit.url); return; }
    let alive = true;
    supabase.storage.from('whatsapp-media').createSignedUrl(path, 60 * 60).then(({ data }) => {
      if (!data?.signedUrl) return;
      signed.set(path, { url: data.signedUrl, exp: Date.now() + 55 * 60 * 1000 });
      if (alive) setUrl(data.signedUrl);
    });
    return () => { alive = false; };
  }, [path]);
  return url;
}

/* ── Enviar pelo número da oficina (usado em OS, check-up, agenda, ficha…) ──────
   Com o módulo ligado e o número conectado, as mensagens do sistema saem pelo Inbox
   (ficam gravadas na conversa); senão as telas continuam abrindo o wa.me. */

type InboxStatusState = {
  workshopId: string | null;
  connected: boolean;
  load: (workshopId: string) => Promise<void>;
};

export const useInboxStatus = create<InboxStatusState>((set, get) => ({
  workshopId: null,
  connected: false,
  async load(workshopId) {
    if (get().workshopId !== workshopId) set({ workshopId, connected: false });
    const { data } = await supabase.from('whatsapp_instances').select('status').eq('workshop_id', workshopId).maybeSingle();
    if (get().workshopId === workshopId) set({ connected: data?.status === 'connected' });
  },
}));

export type InboxSendInput = { phone: string; text: string; customerId?: string | null; name?: string | null };

/** `ready` = dá para mandar pelo número da oficina agora */
export function useInboxSender() {
  const { currentWorkshop } = useAuth();
  const wid = currentWorkshop?.id ?? null;
  const enabled = useModuleAllows()('/oficina/inbox');
  const { workshopId, connected, load } = useInboxStatus();

  useEffect(() => {
    if (wid && enabled) load(wid);
  }, [wid, enabled, load]);

  const ready = !!wid && enabled && workshopId === wid && connected;

  async function send({ phone, text, customerId, name }: InboxSendInput) {
    if (!wid) throw new Error('Oficina não selecionada');
    const r = await inboxCall<{ chat_id: string }>('whatsapp-send', {
      workshop_id: wid, phone, text, customer_id: customerId ?? null, name: name ?? null,
    });
    return r.chat_id;
  }

  return { ready, send };
}

/** Quem está usando pode abrir o Inbox? (módulo ligado + no modo balcão, Gestor ou permissão "WhatsApp da oficina") */
export function useInboxAccess() {
  const allows = useModuleAllows();
  const op = useOperator();
  const session = op.balcao ? op.session : null;
  return allows('/oficina/inbox') && (!session || sessionAllows(session, '/oficina/inbox'));
}
