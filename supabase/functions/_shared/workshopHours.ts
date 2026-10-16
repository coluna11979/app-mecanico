// Horário de funcionamento da oficina (workshop_schedule) e "está aberta agora?" em Brasília.
// Usado pela Recepção (agent-reception) e pelo whatsapp-webhook (modo "só fora do expediente").
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';

export const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const hhmm = (t: string) => t.slice(0, 5).replace(/^0/, '').replace(':00', 'h').replace(':', 'h');
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

export type WorkshopHours = {
  /** "segunda a sexta, 8h às 18h; sábado, 8h às 12h; domingo fechado" */
  text: string;
  isOpen: boolean;
  /** "sexta, 21h40" (agora em Brasília) */
  nowLabel: string;
};

export async function workshopHours(admin: SupabaseClient, wid: string, now = new Date()): Promise<WorkshopHours> {
  const { data: s } = await admin.from('workshop_schedule')
    .select('weekdays, open_time, close_time, saturday_close').eq('workshop_id', wid).maybeSingle();
  // Sem horário cadastrado: o padrão da tabela (seg–sáb, 8h–18h, sábado até 12h)
  const days: number[] = s?.weekdays ?? [1, 2, 3, 4, 5, 6];
  const open: string = s?.open_time ?? '08:00';
  const close: string = s?.close_time ?? '18:00';
  const satClose: string = s ? (s.saturday_close ?? close) : '12:00';

  const weekdays = days.filter((d) => d >= 1 && d <= 5);
  const week = weekdays.length === 5 ? 'segunda a sexta' : weekdays.map((d) => DIAS[d]).join(', ');
  const text = `${week}, ${hhmm(open)} às ${hhmm(close)}`
    + (days.includes(6) ? `; sábado, ${hhmm(open)} às ${hhmm(satClose)}` : '; sábado fechado')
    + (days.includes(0) ? '' : '; domingo fechado');

  const sp = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const dow = sp.getDay();
  const minutes = sp.getHours() * 60 + sp.getMinutes();
  const closeToday = dow === 6 ? satClose : close;
  const isOpen = days.includes(dow) && minutes >= toMin(open) && minutes < toMin(closeToday);
  const nowLabel = `${DIAS[dow]}, ${String(sp.getHours()).padStart(2, '0')}h${String(sp.getMinutes()).padStart(2, '0')}`;
  return { text, isOpen, nowLabel };
}
