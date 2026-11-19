// Filtro por habilidade na lista de mecânicos do admin.
// As opções são as que o mecânico escolhe no cadastro (SignupMechanic.tsx); as que ele
// acrescenta depois no perfil (ex.: "Balanceamento") entram junto, para nenhum cadastro
// ficar de fora do filtro.
//
// Combinação (padrão de mercado — Baymard; LinkedIn Recruiter "pode ter / precisa ter"):
//   'any' = tem QUALQUER UMA das marcadas (padrão)   'all' = tem TODAS as marcadas

/** Especialidades do formulário de cadastro do mecânico (mesma lista de SignupMechanic.tsx). */
export const SIGNUP_SKILLS = [
  'Motor', 'Suspensão', 'Freios', 'Elétrica', 'Injeção eletrônica',
  'Câmbio', 'Ar-condicionado', 'Diagnóstico', 'Diesel',
];

export type SkillMode = 'any' | 'all';

/** Chave de comparação: ignora acento, maiúscula e hífen ("Ar condicionado" = "Ar-condicionado"). */
export function skillKey(s: string): string {
  return s
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function keySet(skills: string[] | null | undefined): Set<string> {
  return new Set((skills ?? []).map(s => skillKey(s ?? '')).filter(Boolean));
}

export type SkillOption = { key: string; label: string; count: number };

/**
 * Opções do filtro em ordem alfabética (lista estável: não pula de lugar quando a contagem muda).
 * As do cadastro sempre aparecem; as extras entram se algum mecânico tiver.
 * `count` aqui é o total bruto (cada mecânico conta uma vez por opção, mesmo com duas grafias).
 */
export function buildSkillOptions(skillLists: Array<string[] | null | undefined>): SkillOption[] {
  const byKey = new Map<string, SkillOption>();
  for (const label of SIGNUP_SKILLS) {
    byKey.set(skillKey(label), { key: skillKey(label), label, count: 0 });
  }

  for (const list of skillLists) {
    const seen = new Set<string>();
    for (const raw of list ?? []) {
      const text = (raw ?? '').trim();
      const key = skillKey(text);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      let opt = byKey.get(key);
      if (!opt) {
        opt = { key, label: text.charAt(0).toUpperCase() + text.slice(1), count: 0 };
        byKey.set(key, opt);
      }
      opt.count += 1;
    }
  }

  return [...byKey.values()].sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
}

/** O mecânico passa no filtro? Sem nenhuma habilidade marcada, todos passam. */
export function matchesSkills(
  skills: string[] | null | undefined,
  selectedKeys: string[],
  mode: SkillMode,
): boolean {
  if (selectedKeys.length === 0) return true;
  const have = keySet(skills);
  return mode === 'all'
    ? selectedKeys.every(k => have.has(k))
    : selectedKeys.some(k => have.has(k));
}

/**
 * Número ao lado de cada opção — "quantos mecânicos essa opção traz":
 *  - 'any': quantos têm essa habilidade
 *  - 'all': quantos sobram se ela entrar junto com as já marcadas
 * (para as já marcadas no modo 'all', é o próprio total da lista)
 */
export function skillOptionCounts(
  skillLists: Array<string[] | null | undefined>,
  selectedKeys: string[],
  mode: SkillMode,
): Map<string, number> {
  const sets = skillLists.map(keySet);
  const keys = new Set<string>(selectedKeys);
  for (const s of sets) s.forEach(k => keys.add(k));

  const counts = new Map<string, number>();
  for (const key of keys) {
    const need = mode === 'all' ? [...new Set([...selectedKeys, key])] : [key];
    counts.set(key, sets.filter(s => need.every(k => s.has(k))).length);
  }
  return counts;
}

/** Habilidades do mecânico com as marcadas no filtro primeiro, para aparecerem mesmo na lista cortada. */
export function orderSkills(skills: string[] | null | undefined, selectedKeys: string[]): string[] {
  const list = skills ?? [];
  if (selectedKeys.length === 0) return list;
  const picked = new Set(selectedKeys);
  return [
    ...list.filter(s => picked.has(skillKey(s))),
    ...list.filter(s => !picked.has(skillKey(s))),
  ];
}
