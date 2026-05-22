/** Formata uma data ISO como tempo relativo curto em pt-BR.
 *  Ex.: "agora", "há 5 min", "há 2 h", "ontem", "há 3 dias", "há 2 sem", "12/03/26". */
export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return 'nunca';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 'nunca';

  const diffMs = Date.now() - then;
  const min = Math.floor(diffMs / 60000);
  const hour = Math.floor(min / 60);
  const day = Math.floor(hour / 24);

  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  if (hour < 24) return `há ${hour} h`;
  if (day === 1) return 'ontem';
  if (day < 7) return `há ${day} dias`;
  if (day < 30) return `há ${Math.floor(day / 7)} sem`;

  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: '2-digit',
  });
}

/** true se a data está dentro dos últimos N dias (default 7). */
export function isRecent(iso: string | null | undefined, days = 7): boolean {
  if (!iso) return false;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return false;
  return Date.now() - then < days * 24 * 60 * 60 * 1000;
}
