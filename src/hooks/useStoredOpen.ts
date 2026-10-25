import { useEffect, useState } from 'react';

/**
 * Seção recolhível que lembra se a pessoa deixou aberta (só neste navegador).
 * Começa fechada; sem `key` (oficina ainda carregando) também fica fechada e não grava.
 */
export function useStoredOpen(key: string | null): [boolean, () => void] {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!key) return;
    try { setOpen(localStorage.getItem(key) === '1'); } catch { /* ignore */ }
  }, [key]);

  function toggle() {
    setOpen(o => {
      const next = !o;
      if (key) { try { localStorage.setItem(key, next ? '1' : '0'); } catch { /* ignore */ } }
      return next;
    });
  }

  return [open, toggle];
}
