import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!url || !anon) {
  console.warn('[supabase] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY');
}

export const supabase = createClient(url, anon, {
  auth: {
    persistSession:      true,   // salva sessão no localStorage
    autoRefreshToken:    true,   // renova JWT automaticamente antes de expirar
    detectSessionInUrl:  true,   // captura token de magic-link / OAuth na URL
    storageKey:          'mec-app-auth', // chave única — evita conflito entre abas
  },
});
