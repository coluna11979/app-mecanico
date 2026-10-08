import { useEffect, useMemo, useState } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/components/ui/Toast';
import { MODULES, MODULE_GROUPS, MODULE_KEYS, type ModuleKey } from '@/lib/modules';

type Shop = { id: string; business_name: string; city: string | null; owner: string | null };
/** off = desligado em qualquer aparelho; mobileOff = liberado só no computador */
type Config = { off: ModuleKey[]; mobileOff: ModuleKey[] };
const EMPTY: Config = { off: [], mobileOff: [] };

/** Superadmin: quais módulos cada oficina pode usar (e se também no celular). Desligado some do menu e a tela fica bloqueada. */
export default function AdminModulos() {
  const { user } = useAuth();
  const [shops, setShops] = useState<Shop[]>([]);
  const [configs, setConfigs] = useState<Record<string, Config>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const [w, m] = await Promise.all([
        supabase.from('workshops').select('id, business_name, city, profile:profiles!inner(full_name)').order('business_name'),
        supabase.from('workshop_modules').select('workshop_id, disabled_modules, mobile_disabled_modules'),
      ]);
      if (w.error) { toast.error('Erro ao carregar oficinas: ' + w.error.message); return; }
      if (m.error) { toast.error('Erro ao carregar módulos: ' + m.error.message); return; }
      const list = (w.data ?? []).map(r => {
        const p = r.profile as unknown as { full_name: string | null } | null;
        return { id: r.id, business_name: r.business_name.trim(), city: r.city, owner: p?.full_name?.trim() ?? null };
      });
      setShops(list);
      setConfigs(Object.fromEntries((m.data ?? []).map(r => [r.workshop_id, {
        off: r.disabled_modules as ModuleKey[], mobileOff: (r.mobile_disabled_modules ?? []) as ModuleKey[],
      }])));
      setSelected(s => s ?? list[0]?.id ?? null);
    })();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? shops.filter(s => `${s.business_name} ${s.owner ?? ''} ${s.city ?? ''}`.toLowerCase().includes(q)) : shops;
  }, [shops, search]);

  const shop = shops.find(s => s.id === selected) ?? null;
  const cfg = selected ? configs[selected] ?? EMPTY : EMPTY;
  const off = cfg.off;

  async function save(workshopId: string, next: Config) {
    const prev = configs[workshopId] ?? EMPTY;
    // Desligado de vez não precisa constar como "só no computador"
    const clean = { off: next.off, mobileOff: next.mobileOff.filter(k => !next.off.includes(k)) };
    setConfigs(c => ({ ...c, [workshopId]: clean }));
    setSaving(true);
    const { error } = await supabase.from('workshop_modules').upsert({
      workshop_id: workshopId, disabled_modules: clean.off, mobile_disabled_modules: clean.mobileOff,
      updated_at: new Date().toISOString(), updated_by: user?.id ?? null,
    });
    setSaving(false);
    if (error) {
      setConfigs(c => ({ ...c, [workshopId]: prev }));
      toast.error('Não salvou: ' + error.message);
      return false;
    }
    return true;
  }

  const flip = (list: ModuleKey[], k: ModuleKey) => (list.includes(k) ? list.filter(x => x !== k) : [...list, k]);

  function toggle(k: ModuleKey) {
    if (!selected) return;
    save(selected, { ...cfg, off: flip(cfg.off, k) });
  }

  function toggleMobile(k: ModuleKey) {
    if (!selected) return;
    save(selected, { ...cfg, mobileOff: flip(cfg.mobileOff, k) });
  }

  function setGroup(keys: ModuleKey[], on: boolean) {
    if (!selected) return;
    save(selected, {
      off: on ? off.filter(k => !keys.includes(k)) : [...new Set([...off, ...keys])],
      mobileOff: on ? cfg.mobileOff.filter(k => !keys.includes(k)) : cfg.mobileOff,
    });
  }

  async function copyFrom(sourceId: string) {
    if (!selected || !sourceId) return;
    const src = shops.find(s => s.id === sourceId);
    const from = configs[sourceId] ?? EMPTY;
    if (await save(selected, { off: [...from.off], mobileOff: [...from.mobileOff] })) toast.success(`Copiado de ${src?.business_name}`);
  }

  const total = MODULE_KEYS.length;

  return (
    <AdminLayout>
      <div className="mb-6">
        <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">Módulos por oficina</h1>
        <p className="text-sm text-steel-500 mt-1">
          Escolha o que cada oficina pode usar. Módulo desligado some do menu e a tela fica bloqueada para todos da oficina, inclusive o dono.
          Início, Perfil e Avisos ficam sempre liberados. Desmarque 📱 para liberar o módulo só no computador (fica bloqueado no celular e no tablet).
        </p>
      </div>

      <div className="grid lg:grid-cols-[300px_1fr] gap-4 items-start">
        {/* Lista de oficinas */}
        <div className="card p-3">
          <input className="input w-full mb-3" placeholder="Buscar oficina…" value={search} onChange={e => setSearch(e.target.value)} />
          <div className="space-y-1 max-h-[60vh] overflow-y-auto">
            {filtered.map(s => {
              const on = total - (configs[s.id]?.off.length ?? 0);
              const active = s.id === selected;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSelected(s.id)}
                  className={`w-full text-left px-3 py-2 rounded-xl transition ${active ? 'bg-brand-50 ring-1 ring-brand-300' : 'hover:bg-steel-50'}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-sm truncate">{s.business_name}</span>
                    <span className={`text-[11px] font-bold shrink-0 ${on === total ? 'text-emerald-600' : 'text-amber-600'}`}>{on}/{total}</span>
                  </div>
                  <div className="text-xs text-steel-500 truncate">{[s.owner, s.city].filter(Boolean).join(' · ')}</div>
                </button>
              );
            })}
            {!filtered.length && <p className="text-sm text-steel-500 px-3 py-2">Nenhuma oficina.</p>}
          </div>
        </div>

        {/* Módulos da oficina selecionada */}
        {shop ? (
          <div className="card p-4 lg:p-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="text-lg font-bold">{shop.business_name}</h2>
                <p className="text-xs text-steel-500">
                  {total - off.length} de {total} módulos liberados
                  {cfg.mobileOff.length > 0 && ` · ${cfg.mobileOff.length} só no computador`}
                  {saving && ' · salvando…'}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <select className="input text-sm" value="" onChange={e => copyFrom(e.target.value)}>
                  <option value="">Copiar de outra oficina…</option>
                  {shops.filter(s => s.id !== shop.id).map(s => <option key={s.id} value={s.id}>{s.business_name}</option>)}
                </select>
                <button type="button" className="btn-ghost text-sm" onClick={() => setGroup(MODULE_KEYS, true)}>Liberar tudo</button>
                <button type="button" className="btn-ghost text-sm" onClick={() => setGroup(MODULE_KEYS, false)}>Desligar tudo</button>
              </div>
            </div>

            <div className="space-y-5">
              {MODULE_GROUPS.map(g => {
                const allOn = g.keys.every(k => !off.includes(k));
                return (
                  <div key={g.label}>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[11px] font-bold uppercase tracking-widest text-steel-500">{g.label}</p>
                      <button type="button" className="text-xs font-semibold text-brand-600 hover:underline" onClick={() => setGroup(g.keys, !allOn)}>
                        {allOn ? 'Desligar grupo' : 'Liberar grupo'}
                      </button>
                    </div>
                    <div className="grid sm:grid-cols-2 gap-2">
                      {g.keys.map(k => {
                        const m = MODULES[k];
                        const on = !off.includes(k);
                        const mobileOn = on && !cfg.mobileOff.includes(k);
                        return (
                          <div
                            key={k}
                            className={`flex items-start gap-3 p-3 rounded-xl border transition ${on ? 'border-emerald-200 bg-emerald-50/50' : 'border-steel-200 bg-steel-50 opacity-70'}`}
                          >
                            <label className="flex items-start gap-3 flex-1 min-w-0 cursor-pointer">
                              <input type="checkbox" className="mt-1 accent-emerald-600" checked={on} onChange={() => toggle(k)} />
                              <span className="text-lg leading-none mt-0.5">{m.icon}</span>
                              <span className="min-w-0">
                                <span className="block text-sm font-semibold">{m.label}</span>
                                <span className="block text-xs text-steel-500">{m.desc}</span>
                              </span>
                            </label>
                            {on && (
                              <button
                                type="button"
                                onClick={() => toggleMobile(k)}
                                title={mobileOn ? 'Liberado no celular/tablet — clique para liberar só no computador' : 'Só no computador — clique para liberar também no celular/tablet'}
                                className={`shrink-0 text-[11px] font-semibold px-2 py-1 rounded-lg border transition ${mobileOn
                                  ? 'border-emerald-300 bg-white text-emerald-700'
                                  : 'border-amber-300 bg-amber-50 text-amber-700'}`}
                              >
                                {mobileOn ? '📱 Celular ✓' : '🖥️ Só PC'}
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="card p-6 text-sm text-steel-500">Selecione uma oficina.</div>
        )}
      </div>
    </AdminLayout>
  );
}
