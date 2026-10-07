import { useEffect, useMemo, useState } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/components/ui/Toast';
import { MODULES, MODULE_GROUPS, MODULE_KEYS, type ModuleKey } from '@/lib/modules';

type Shop = { id: string; business_name: string; city: string | null; owner: string | null };

/** Superadmin: quais módulos cada oficina pode usar. Desligado some do menu e a tela fica bloqueada. */
export default function AdminModulos() {
  const { user } = useAuth();
  const [shops, setShops] = useState<Shop[]>([]);
  const [disabled, setDisabled] = useState<Record<string, ModuleKey[]>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const [w, m] = await Promise.all([
        supabase.from('workshops').select('id, business_name, city, profile:profiles!inner(full_name)').order('business_name'),
        supabase.from('workshop_modules').select('workshop_id, disabled_modules'),
      ]);
      if (w.error) { toast.error('Erro ao carregar oficinas: ' + w.error.message); return; }
      if (m.error) { toast.error('Erro ao carregar módulos: ' + m.error.message); return; }
      const list = (w.data ?? []).map(r => {
        const p = r.profile as unknown as { full_name: string | null } | null;
        return { id: r.id, business_name: r.business_name.trim(), city: r.city, owner: p?.full_name?.trim() ?? null };
      });
      setShops(list);
      setDisabled(Object.fromEntries((m.data ?? []).map(r => [r.workshop_id, r.disabled_modules as ModuleKey[]])));
      setSelected(s => s ?? list[0]?.id ?? null);
    })();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? shops.filter(s => `${s.business_name} ${s.owner ?? ''} ${s.city ?? ''}`.toLowerCase().includes(q)) : shops;
  }, [shops, search]);

  const shop = shops.find(s => s.id === selected) ?? null;
  const off = selected ? disabled[selected] ?? [] : [];

  async function save(workshopId: string, next: ModuleKey[]) {
    const prev = disabled[workshopId] ?? [];
    setDisabled(d => ({ ...d, [workshopId]: next }));
    setSaving(true);
    const { error } = await supabase.from('workshop_modules').upsert({
      workshop_id: workshopId, disabled_modules: next, updated_at: new Date().toISOString(), updated_by: user?.id ?? null,
    });
    setSaving(false);
    if (error) {
      setDisabled(d => ({ ...d, [workshopId]: prev }));
      toast.error('Não salvou: ' + error.message);
      return false;
    }
    return true;
  }

  function toggle(k: ModuleKey) {
    if (!selected) return;
    save(selected, off.includes(k) ? off.filter(x => x !== k) : [...off, k]);
  }

  function setGroup(keys: ModuleKey[], on: boolean) {
    if (!selected) return;
    save(selected, on ? off.filter(k => !keys.includes(k)) : [...new Set([...off, ...keys])]);
  }

  async function copyFrom(sourceId: string) {
    if (!selected || !sourceId) return;
    const src = shops.find(s => s.id === sourceId);
    if (await save(selected, [...(disabled[sourceId] ?? [])])) toast.success(`Copiado de ${src?.business_name}`);
  }

  const total = MODULE_KEYS.length;

  return (
    <AdminLayout>
      <div className="mb-6">
        <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">Módulos por oficina</h1>
        <p className="text-sm text-steel-500 mt-1">
          Escolha o que cada oficina pode usar. Módulo desligado some do menu e a tela fica bloqueada para todos da oficina, inclusive o dono.
          Início, Perfil e Avisos ficam sempre liberados.
        </p>
      </div>

      <div className="grid lg:grid-cols-[300px_1fr] gap-4 items-start">
        {/* Lista de oficinas */}
        <div className="card p-3">
          <input className="input w-full mb-3" placeholder="Buscar oficina…" value={search} onChange={e => setSearch(e.target.value)} />
          <div className="space-y-1 max-h-[60vh] overflow-y-auto">
            {filtered.map(s => {
              const on = total - (disabled[s.id]?.length ?? 0);
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
                  {total - off.length} de {total} módulos liberados{saving && ' · salvando…'}
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
                        return (
                          <label
                            key={k}
                            className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition ${on ? 'border-emerald-200 bg-emerald-50/50' : 'border-steel-200 bg-steel-50 opacity-70'}`}
                          >
                            <input type="checkbox" className="mt-1 accent-emerald-600" checked={on} onChange={() => toggle(k)} />
                            <span className="text-lg leading-none mt-0.5">{m.icon}</span>
                            <span className="min-w-0">
                              <span className="block text-sm font-semibold">{m.label}</span>
                              <span className="block text-xs text-steel-500">{m.desc}</span>
                            </span>
                          </label>
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
