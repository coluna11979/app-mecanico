import { supabase } from './supabase';

const cache = new Map<string, { value: string; ts: number }>();
const TTL = 60_000;

export async function getSetting(key: string, fallback = ''): Promise<string> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < TTL) return hit.value;
  const { data } = await supabase.from('app_settings').select('value').eq('key', key).maybeSingle();
  const value = data?.value ?? fallback;
  cache.set(key, { value, ts: Date.now() });
  return value;
}

export async function setSetting(key: string, value: string, description?: string) {
  const { data: user } = await supabase.auth.getUser();
  const { error } = await supabase.from('app_settings').upsert({
    key,
    value,
    description: description ?? null,
    updated_by: user.user?.id ?? null,
    updated_at: new Date().toISOString(),
  });
  if (!error) cache.set(key, { value, ts: Date.now() });
  return { error };
}

export async function getAllSettings() {
  const { data, error } = await supabase.from('app_settings').select('*').order('key');
  return { data: data ?? [], error };
}

export function clearSettingsCache() {
  cache.clear();
}
