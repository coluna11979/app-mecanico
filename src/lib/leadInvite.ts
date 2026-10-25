import { supabase } from './supabase';
import type { Lead } from '@/types/database';

/**
 * Gera a URL de convite para um lead virar cadastro.
 * O signup lê ?lead=<uuid> e pré-preenche nome/email/telefone,
 * marca o lead como cadastro_iniciado e, após sucesso, converte.
 */
export function buildInviteUrl(lead: Lead): string {
  const base   = typeof window !== 'undefined' ? window.location.origin : '';
  const path   = lead.intent === 'workshop' ? '/cadastro/oficina' : '/cadastro/mecanico';
  return `${base}${path}?lead=${lead.id}`;
}

/** Mensagem padrão de WhatsApp pronta pra envio. */
export function buildInviteWhatsapp(lead: Lead, url: string): string {
  const tipo = lead.intent === 'workshop' ? 'oficina' : 'mecânico';
  const nome = lead.name.split(' ')[0];
  const msg =
    `Olá ${nome}, aqui é da equipe MecânicoApp 👋\n\n` +
    `Preparamos seu cadastro de ${tipo} com os dados que você passou. ` +
    `É só clicar no link e completar em 2 minutos:\n\n${url}\n\n` +
    `Qualquer dúvida, é só responder aqui.`;
  const phone = (lead.phone ?? '').replace(/\D/g, '');
  const prefix = phone ? `https://wa.me/55${phone}?text=` : 'https://wa.me/?text=';
  return prefix + encodeURIComponent(msg);
}

/** Chamada pelas páginas de signup quando ?lead=<uuid> está na URL. */
export async function markLeadSignupStarted(leadId: string) {
  try {
    await supabase.rpc('mark_lead_signup_started', { p_lead_id: leadId });
  } catch (e) {
    console.warn('[lead] mark_signup_started falhou', e);
  }
}

/** Chamada pelo signup logo após o usuário criar a conta com sucesso. */
export async function convertLeadToProfile(leadId: string) {
  try {
    await supabase.rpc('convert_lead_to_profile', { p_lead_id: leadId });
  } catch (e) {
    console.warn('[lead] convert_to_profile falhou', e);
  }
}

/**
 * Lê os dados básicos do lead (nome, email, telefone, intent).
 * Pode ser chamada por anon — RLS permite insert mas select não, então usamos uma RPC.
 * Para simplicidade, aqui lemos direto; se bloqueado, as páginas apenas abrem vazias.
 */
export interface LeadInviteData {
  id: string;
  name: string;
  email: string;
  phone: string;
  intent: 'mechanic' | 'workshop';
}

export async function fetchLeadForInvite(leadId: string): Promise<LeadInviteData | null> {
  const { data, error } = await supabase.rpc('get_lead_for_invite', { p_lead_id: leadId });
  if (error) {
    console.warn('[lead] fetch invite falhou', error);
    return null;
  }
  const row = Array.isArray(data) ? data[0] : data;
  return (row ?? null) as LeadInviteData | null;
}

