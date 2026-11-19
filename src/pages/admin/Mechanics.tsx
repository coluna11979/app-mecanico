import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import AdminLayout from '@/components/layout/AdminLayout';
import { FilterPill, MultiSelectFilter } from '@/components/admin/ListFilters';
import { supabase } from '@/lib/supabase';
import { timeAgo, isRecent } from '@/lib/relativeTime';
import {
  buildSkillOptions, matchesSkills, orderSkills, skillKey, skillOptionCounts, type SkillMode,
} from '@/lib/skillFilter';
import type { Mechanic, Profile } from '@/types/database';

type Row = Mechanic & { profile: Profile };

const STATUS_LABEL: Record<string, string> = {
  approved:        'Aprovado',
  rejected:        'Rejeitado',
  under_review:    'Em análise',
  pending:         'Pendente',
  awaiting_region: 'Aguardando região',
};

type StatusFilter = 'all' | 'approved' | 'pending' | 'under_review' | 'awaiting_region' | 'rejected';
const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'all',             label: 'Todos' },
  { key: 'approved',        label: '✅ Ativos' },
  { key: 'pending',         label: '🆕 Pendentes' },
  { key: 'under_review',    label: '🔍 Em análise' },
  { key: 'awaiting_region', label: '📍 Aguardando região' },
  { key: 'rejected',        label: '❌ Rejeitados' },
];
const STATUS_KEYS = STATUS_FILTERS.map(f => f.key);

export default function AdminMechanics() {
  const [rows, setRows] = useState<Row[]>([]);
  const [lateCancels, setLateCancels] = useState<Record<string, number>>({});

  // Filtros ficam no endereço da página (?status=&q=&hab=&modo=): dá para mandar o link
  // filtrado e, ao abrir um mecânico e voltar, a lista continua como estava.
  const [params, setParams] = useSearchParams();
  const rawStatus = params.get('status') as StatusFilter | null;
  const statusFilter: StatusFilter = rawStatus && STATUS_KEYS.includes(rawStatus) ? rawStatus : 'all';
  const search = params.get('q') ?? '';
  const skillFilter = (params.get('hab') ?? '').split(',').map(s => s.trim()).filter(Boolean);
  const skillMode: SkillMode = params.get('modo') === 'todas' ? 'all' : 'any';

  function setParam(patch: Record<string, string | null>) {
    setParams(prev => {
      const next = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(patch)) {
        if (v) next.set(k, v); else next.delete(k);
      }
      return next;
    }, { replace: true });
  }
  const setStatusFilter = (s: StatusFilter) => setParam({ status: s === 'all' ? null : s });
  const setSearch = (q: string) => setParam({ q: q || null });
  const setSkillFilter = (keys: string[]) => setParam({ hab: keys.length ? keys.join(',') : null });
  const setSkillMode = (m: SkillMode) => setParam({ modo: m === 'all' ? 'todas' : null });
  const clearFilters = () => setParam({ q: null, hab: null, modo: null });

  useEffect(() => {
    // Cancelamentos por atraso (oficina cancelou porque o mecânico passou do prazo de chegada)
    supabase.from('jobs').select('mechanic_id').eq('mechanic_late_cancel', true)
      .then(({ data }) => {
        const count: Record<string, number> = {};
        (data ?? []).forEach((j: { mechanic_id: string | null }) => {
          if (j.mechanic_id) count[j.mechanic_id] = (count[j.mechanic_id] ?? 0) + 1;
        });
        setLateCancels(count);
      });
    supabase
      .from('mechanics')
      .select('*, profile:profiles!inner(*)')
      .order('created_at', { ascending: false })
      .then(({ data }) => setRows((data as unknown as Row[]) ?? []));
  }, []);

  // Ordem: status (aba) → busca por texto → habilidade.
  const statusRows = rows.filter(r => statusFilter === 'all' || r.profile.status === statusFilter);
  const q = search.trim().toLowerCase();
  const baseRows = !q ? statusRows : statusRows.filter(r =>
    [r.profile.full_name, r.cpf, r.city, r.neighborhood, r.cep, r.state]
      .filter(Boolean).join(' ').toLowerCase().includes(q),
  );
  const filtered = baseRows.filter(r => matchesSkills(r.skills, skillFilter, skillMode));

  // Opções em lista fixa (todas as habilidades existentes); o número ao lado acompanha
  // status, busca e o modo "qualquer uma / todas".
  const counts = skillOptionCounts(baseRows.map(r => r.skills), skillFilter, skillMode);
  const skillOptions = buildSkillOptions(rows.map(r => r.skills))
    .map(o => ({ ...o, count: counts.get(o.key) ?? 0 }));
  const skillLabel = (key: string) => skillOptions.find(o => o.key === key)?.label ?? key;
  const hasFilters = !!q || skillFilter.length > 0;
  const plural = (n: number) => `${n} mecânico${n !== 1 ? 's' : ''}`;

  const statusCounts = STATUS_FILTERS.reduce((acc, f) => {
    acc[f.key] = f.key === 'all' ? rows.length : rows.filter(r => r.profile.status === f.key).length;
    return acc;
  }, {} as Record<StatusFilter, number>);

  return (
    <AdminLayout>
      <h1 className="text-2xl lg:text-3xl font-bold tracking-tight mb-4">Mecânicos ({rows.length})</h1>

      {/* Visões por status */}
      <div className="flex gap-1 bg-steel-100 rounded-xl p-1 mb-3 overflow-x-auto">
        {STATUS_FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => setStatusFilter(f.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap ${
              statusFilter === f.key
                ? 'bg-white shadow text-steel-900'
                : 'text-steel-500 hover:text-steel-700'
            }`}
          >
            <span>{f.label}</span>
            <span className="text-[10px] text-steel-400">{statusCounts[f.key] ?? 0}</span>
          </button>
        ))}
      </div>

      {/* Barra de filtros: busca por texto + filtro por habilidade */}
      <div className="flex flex-col sm:flex-row gap-2 mb-3">
        <label className="relative flex-1">
          <span className="sr-only">Buscar mecânico</span>
          <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-steel-400">
            <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.45 4.39l3.08 3.08a.75.75 0 11-1.06 1.06l-3.08-3.08A7 7 0 012 9z" clipRule="evenodd" />
          </svg>
          <input
            className="input !pl-10"
            placeholder="Buscar por nome, CPF, cidade, bairro ou CEP…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </label>
        <MultiSelectFilter
          label="Habilidades"
          options={skillOptions}
          selected={skillFilter}
          onChange={setSkillFilter}
          mode={skillMode}
          onModeChange={setSkillMode}
          applyLabel={`Mostrar ${plural(filtered.length)}`}
          searchPlaceholder="Buscar habilidade…"
        />
      </div>

      {/* Quantos aparecem + filtros aplicados (cada um sai no ×) */}
      <div className="flex flex-wrap items-center gap-2 mb-5 min-h-[32px]">
        <span className="text-sm text-steel-500 mr-1">
          {hasFilters
            ? <><strong className="text-steel-900">{filtered.length}</strong> de {plural(statusRows.length)}</>
            : plural(statusRows.length)}
        </span>
        {q && <FilterPill onRemove={() => setSearch('')}>Busca: “{search.trim()}”</FilterPill>}
        {skillFilter.length > 0 && (
          <>
            {skillFilter.length > 1 && (
              <span className="text-xs text-steel-400">{skillMode === 'all' ? 'com todas:' : 'com qualquer uma:'}</span>
            )}
            {skillFilter.map(k => (
              <FilterPill key={k} onRemove={() => setSkillFilter(skillFilter.filter(x => x !== k))}>
                {skillLabel(k)}
              </FilterPill>
            ))}
          </>
        )}
        {hasFilters && (
          <button type="button" onClick={clearFilters}
            className="text-xs font-semibold text-brand-600 hover:text-brand-700 px-1 min-h-[32px]">
            Limpar tudo
          </button>
        )}
      </div>

      {/* Desktop table */}
      <div className="card overflow-x-auto hidden md:block">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-steel-500 border-b border-steel-200">
            <tr>
              <th className="py-2 pr-4">Nome</th>
              <th className="pr-4">CPF</th>
              <th className="pr-4">Localização</th>
              <th className="pr-4">Skills</th>
              <th className="pr-4">R$/h</th>
              <th className="pr-4">★</th>
              <th className="pr-4">Atrasos</th>
              <th className="pr-4">Último acesso</th>
              <th className="pr-4">Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-steel-100">
            {filtered.map(r => (
              <tr key={r.id} className="hover:bg-steel-50 transition">
                <td className="py-3 pr-4 font-semibold">{r.profile.full_name}</td>
                <td className="pr-4 text-steel-500">{r.cpf}</td>
                <td className="pr-4 text-steel-500"><LocationCell cep={r.cep} neighborhood={r.neighborhood} city={r.city} state={r.state} /></td>
                <td className="pr-4 text-steel-500"><SkillList skills={r.skills} selected={skillFilter} max={3} /></td>
                <td className="pr-4">R$ {r.hourly_rate.toFixed(0)}</td>
                <td className="pr-4">{r.rating.toFixed(1)}</td>
                <td className={`pr-4 ${lateCancels[r.id] ? 'font-bold text-alert-600' : 'text-steel-400'}`}>{lateCancels[r.id] ?? 0}</td>
                <td className="pr-4"><LastSeen iso={r.profile.last_seen_at} /></td>
                <td className="pr-4"><StatusBadge s={r.profile.status} /></td>
                <td className="pr-2">
                  <Link
                    to={`/admin/usuario/${r.profile_id}`}
                    className="btn-ghost !py-1 !px-3 text-xs border border-steel-200"
                  >
                    Ver →
                  </Link>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={10} className="py-10 text-center text-steel-500">
                  <EmptyResult hasFilters={hasFilters} onClear={clearFilters} />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="space-y-3 md:hidden">
        {filtered.map(r => (
          <Link key={r.id} to={`/admin/usuario/${r.profile_id}`} className="card block hover:shadow-md transition">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="font-bold truncate">{r.profile.full_name}</div>
                <div className="text-xs text-steel-500 mt-0.5">{r.cpf}</div>
                {(r.city || r.neighborhood) && (
                  <div className="text-xs text-steel-400 mt-1">
                    📍 <LocationCell cep={r.cep} neighborhood={r.neighborhood} city={r.city} state={r.state} />
                  </div>
                )}
                <div className="flex flex-wrap gap-1 mt-2">
                  {orderSkills(r.skills, skillFilter).slice(0, 4).map(s => (
                    <span
                      key={s}
                      className={`badge ${skillFilter.includes(skillKey(s)) ? 'bg-brand-50 text-brand-700' : 'bg-steel-100 text-steel-700'}`}
                    >
                      {s}
                    </span>
                  ))}
                </div>
              </div>
              <StatusBadge s={r.profile.status} />
            </div>
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-steel-100">
              <div className="text-sm">
                <span className="font-semibold">R$ {r.hourly_rate.toFixed(0)}/h</span>
                <span className="text-steel-400 ml-2">★ {r.rating.toFixed(1)}</span>
                {!!lateCancels[r.id] && <span className="text-alert-600 font-semibold ml-2">⏰ {lateCancels[r.id]} atraso{lateCancels[r.id] > 1 ? 's' : ''}</span>}
              </div>
              <LastSeen iso={r.profile.last_seen_at} />
            </div>
          </Link>
        ))}
        {filtered.length === 0 && (
          <div className="card text-center py-10 text-steel-500">
            <EmptyResult hasFilters={hasFilters} onClear={clearFilters} />
          </div>
        )}
      </div>
    </AdminLayout>
  );
}

function EmptyResult({ hasFilters, onClear }: { hasFilters: boolean; onClear: () => void }) {
  if (!hasFilters) return <>Nenhum mecânico encontrado.</>;
  return (
    <>
      Nenhum mecânico com esses filtros.{' '}
      <button type="button" onClick={onClear} className="font-semibold text-brand-600 hover:text-brand-700">
        Limpar filtros
      </button>
    </>
  );
}

/** Habilidades do mecânico; as marcadas no filtro vêm primeiro e ficam em destaque. */
function SkillList({ skills, selected, max }: { skills: string[]; selected: string[]; max: number }) {
  const ordered = orderSkills(skills, selected);
  const shown = ordered.slice(0, max);
  const rest = ordered.length - shown.length;
  return (
    <span>
      {shown.map((s, i) => (
        <span key={s}>
          {i > 0 && ', '}
          <span className={selected.includes(skillKey(s)) ? 'font-semibold text-brand-700' : ''}>{s}</span>
        </span>
      ))}
      {rest > 0 && <span className="text-steel-400"> +{rest}</span>}
    </span>
  );
}

function LocationCell({ cep, neighborhood, city, state }: {
  cep: string | null; neighborhood: string | null; city: string | null; state: string | null;
}) {
  const parts: string[] = [];
  if (neighborhood) parts.push(neighborhood);
  if (city) parts.push(state ? `${city}/${state}` : city);
  const main = parts.join(' · ');
  if (!main && !cep) return <span className="text-steel-300">—</span>;
  return (
    <span className="inline-flex flex-col">
      {main && <span>{main}</span>}
      {cep && <span className="text-[11px] text-steel-400 font-mono">{cep}</span>}
    </span>
  );
}

function StatusBadge({ s }: { s: string }) {
  const cls =
    s === 'approved'        ? 'badge-success' :
    s === 'rejected'        ? 'badge-alert'   :
    s === 'under_review'    ? 'badge-pending' :
    s === 'awaiting_region' ? 'badge bg-steel-200 text-steel-700' :
                              'badge-pending';
  return <span className={cls}>{STATUS_LABEL[s] ?? s}</span>;
}

function LastSeen({ iso }: { iso: string | null }) {
  const recent = isRecent(iso);
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs ${recent ? 'text-green-600 font-medium' : 'text-steel-400'}`}>
      {recent && <span className="h-1.5 w-1.5 rounded-full bg-green-500" />}
      {timeAgo(iso)}
    </span>
  );
}
