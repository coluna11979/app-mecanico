/**
 * Busca todas as linhas de uma consulta, em páginas.
 * O Supabase devolve no máximo 1000 linhas por requisição — sem isso, oficinas
 * com muito histórico teriam painéis e relatórios cortados.
 *
 * Uso: fetchAll((from, to) => supabase.from('x').select('...').eq(...).order('id').range(from, to))
 * A consulta precisa de uma ordenação estável (ex.: .order('id')).
 */
export async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  pageSize = 1000,
  max = 100000,
): Promise<{ data: T[]; error: unknown }> {
  const all: T[] = [];
  for (let from = 0; from < max; from += pageSize) {
    const { data, error } = await page(from, from + pageSize - 1);
    if (error) return { data: all, error };
    all.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }
  return { data: all, error: null };
}
