import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { OS_CATEGORIES } from '@/components/os/osHelpers';

/**
 * Categorias de serviço da oficina. Valem para o dono: lojas do mesmo dono (Jota Car e JC Pneus) usam a mesma lista.
 * Enquanto o dono não mexer, vale a lista padrão do app.
 */
export type ServiceCategory = { id?: string; name: string; sellsParts: boolean };

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
/** Pneu é a peça que se vende: no padrão, "Pneus" / "Pneus e Rodas" já vêm assim */
export const DEFAULT_CATEGORIES: ServiceCategory[] = OS_CATEGORIES.map(name => ({ name, sellsParts: norm(name).startsWith('pneu') }));

export async function loadCategories(wid: string): Promise<{ ownerId: string | null; cats: ServiceCategory[]; custom: boolean }> {
  const { data: w } = await supabase.from('workshops').select('profile_id').eq('id', wid).maybeSingle();
  const ownerId = (w as { profile_id: string } | null)?.profile_id ?? null;
  if (!ownerId) return { ownerId: null, cats: DEFAULT_CATEGORIES, custom: false };
  const { data, error } = await supabase.from('service_categories').select('id, name, sells_parts')
    .eq('owner_id', ownerId).order('position').order('name');
  // Tabela ainda não existe no banco (migration 0173) ou dono sem lista própria: lista padrão
  if (error || !data?.length) return { ownerId, cats: DEFAULT_CATEGORIES, custom: false };
  return { ownerId, custom: true, cats: (data as { id: string; name: string; sells_parts: boolean }[]).map(r => ({ id: r.id, name: r.name, sellsParts: r.sells_parts })) };
}

export function useServiceCategories(wid: string | null | undefined) {
  const [state, setState] = useState<{ ownerId: string | null; cats: ServiceCategory[]; custom: boolean }>({ ownerId: null, cats: DEFAULT_CATEGORIES, custom: false });
  const reload = useCallback(async () => { if (wid) setState(await loadCategories(wid).catch(() => ({ ownerId: null, cats: DEFAULT_CATEGORIES, custom: false }))); }, [wid]);
  useEffect(() => { reload(); }, [reload]);
  const names = useMemo(() => state.cats.map(c => c.name), [state.cats]);
  const sellsSet = useMemo(() => new Set(state.cats.filter(c => c.sellsParts).map(c => norm(c.name))), [state.cats]);
  return { ...state, names, sellsSet, reload };
}

/** Primeira edição: grava a lista padrão como lista do dono (depois ele muda à vontade) */
export async function seedCategories(ownerId: string): Promise<string | null> {
  const { error } = await supabase.from('service_categories').upsert(
    DEFAULT_CATEGORIES.map((c, i) => ({ owner_id: ownerId, name: c.name, position: i, sells_parts: c.sellsParts })),
    { onConflict: 'owner_id,name', ignoreDuplicates: true });
  return error ? error.message : null;
}
