import { supabase } from './supabase';

interface StripeConfig {
  mode: 'test' | 'live';
  publishable_key: string;
}

let cache: StripeConfig | null = null;
let cacheAt = 0;
const CACHE_TTL = 30_000; // 30s

/**
 * Pega a chave pública correta do Stripe baseada no modo atual (test|live).
 * Cacheia por 30s pra evitar requests excessivos. Se o admin trocar o modo,
 * a próxima refresh pega a key nova.
 */
export async function getPublicStripeConfig(): Promise<StripeConfig> {
  if (cache && Date.now() - cacheAt < CACHE_TTL) return cache;
  const { data, error } = await supabase.rpc('public_stripe_config');
  if (error || !data) {
    return { mode: 'live', publishable_key: '' };
  }
  cache = data as StripeConfig;
  cacheAt = Date.now();
  return cache;
}

export function clearStripeConfigCache() {
  cache = null;
  cacheAt = 0;
}
