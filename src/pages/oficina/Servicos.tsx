import { useCallback, useEffect, useMemo, useState } from 'react';
import WorkshopLayout from '@/components/layout/WorkshopLayout';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/components/ui/Toast';
import { canDo, useOperator } from '@/lib/operators';
import { OS_CATEGORIES, fmtBRL, moneyInput, parseMoney } from '@/components/os/osHelpers';
import { COMMON_SERVICES, fmtMinutes, type WorkshopService } from '@/lib/services';

/** Serviço já lançado em OS mas que ainda não está na tabela */
type FromHistory = { name: string; price: number; uses: number };

export default function Servicos() {
  const { currentWorkshop } = useAuth();
  const wid = currentWorkshop?.id ?? null;
  const { balcao, session } = useOperator();
  const allowed = canDo(session, balcao, 'pecas_estoque');

  const [list, setList]       = useState<WorkshopService[] | null>(null);
  const [history, setHistory] = useState<FromHistory[]>([]);
  const [q, setQ]             = useState('');
  const [cat, setCat]         = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<WorkshopService | 'new' | null>(null);
  const [busy, setBusy]       = useState(false);

  const load = useCallback(async () => {
    if (!wid) return;
    const [s, h] = await Promise.all([
      supabase.from('workshop_services').select('*').eq('workshop_id', wid).order('name'),
      supabase.from('service_order_items').select('description, unit_price, created_at')
        .eq('workshop_id', wid).eq('kind', 'labor').order('created_at', { ascending: false }).limit(2000),
    ]);
    const services = (s.data as WorkshopService[]) ?? [];
    setList(services);
    // Serviços que a oficina já cobrou nas OS (último preço) e ainda não estão na tabela
    const have = new Set(services.map(x => x.name.trim().toLowerCase()));
    const map = new Map<string, FromHistory>();
    for (const i of (h.data ?? []) as { description: string; unit_price: number }[]) {
      const k = i.description.trim().toLowerCase();
      if (!k || have.has(k)) continue;
      const e = map.get(k);
      if (e) e.uses++;
      else map.set(k, { name: i.description.trim(), price: Number(i.unit_price), uses: 1 });
    }
    setHistory([...map.values()].sort((a, b) => b.uses - a.uses));
  }, [wid]);

  useEffect(() => { if (allowed) load(); }, [load, allowed]);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (list ?? []).filter(s => (showInactive || s.active) && (!cat || (s.category ?? 'Outro') === cat)
      && (!t || s.name.toLowerCase().includes(t) || s.category?.toLowerCase().includes(t)));
  }, [list, q, cat, showInactive]);

  const cats = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of list ?? []) if (s.active) m.set(s.category ?? 'Outro', (m.get(s.category ?? 'Outro') ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [list]);
  const noPrice = (list ?? []).filter(s => s.active && !(Number(s.price) > 0)).length;
  const inactiveCount = (list ?? []).filter(s => !s.active).length;

  async function importHistory() {
    if (!wid || !history.length) return;
    if (!confirm(`Adicionar ${history.length} serviço${history.length === 1 ? '' : 's'} que você já lançou nas OS, com o último preço cobrado?`)) return;
    setBusy(true);
    const { error } = await supabase.from('workshop_services').insert(history.map(h => ({ workshop_id: wid, name: h.name, price: h.price })));
    setBusy(false);
    if (error) return toast.error('Não foi possível importar: ' + error.message);
    toast.success(`${history.length} serviço${history.length === 1 ? '' : 's'} adicionado${history.length === 1 ? '' : 's'} ✓`);
    load();
  }

  async function importCommon() {
    if (!wid) return;
    const have = new Set((list ?? []).map(x => x.name.trim().toLowerCase()));
    const rows = COMMON_SERVICES.filter(c => !have.has(c.name.toLowerCase()))
      .map(c => ({ workshop_id: wid, name: c.name, category: c.category, estimated_minutes: c.minutes, price: 0 }));
    if (!rows.length) return toast.info('Todos os serviços comuns já estão na sua tabela');
    setBusy(true);
    const { error } = await supabase.from('workshop_services').insert(rows);
    setBusy(false);
    if (error) return toast.error('Não foi possível adicionar: ' + error.message);
    toast.success(`${rows.length} serviços adicionados — agora coloque o preço de cada um`);
    load();
  }

  if (!allowed) {
    return (
      <WorkshopLayout>
        <div className="max-w-md mx-auto card text-center py-12">
          <div className="text-4xl mb-2">🔒</div>
          <h1 className="text-lg font-bold">Tabela de serviços restrita</h1>
          <p className="text-sm text-steel-500 mt-1">Peça ao gestor a permissão “Peças e estoque” em Acessos e funções.</p>
        </div>
      </WorkshopLayout>
    );
  }

  return (
    <WorkshopLayout>
      <div className="max-w-5xl mx-auto space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">🛠️ Tabela de serviços</h1>
            <p className="text-sm text-steel-500 mt-1">A mão de obra que a oficina cobra. Na OS, é só digitar o nome que o preço vem sozinho.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {history.length > 0 && (list?.length ?? 0) > 0 && (
              <button className="btn-ghost border border-steel-200 bg-white" onClick={importHistory} disabled={busy}>
                📥 Trazer das OS ({history.length})
              </button>
            )}
            <button className="btn-primary" onClick={() => setEditing('new')}>+ Novo serviço</button>
          </div>
        </div>

        {list === null ? (
          <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-16 bg-white rounded-2xl animate-pulse" />)}</div>
        ) : list.length === 0 ? (
          <div className="card text-center py-10 space-y-4">
            <div className="text-4xl">🛠️</div>
            <div>
              <h2 className="text-lg font-bold">Monte a tabela de mão de obra da oficina</h2>
              <p className="text-sm text-steel-500 mt-1 max-w-lg mx-auto">
                Com a tabela pronta, o orçamento sai mais rápido e todo mundo cobra o mesmo preço pelo mesmo serviço.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 justify-center">
              {history.length > 0 && (
                <button className="btn-primary" onClick={importHistory} disabled={busy}>
                  📥 Trazer os {history.length} serviços que já lancei nas OS
                </button>
              )}
              <button className={history.length ? 'btn-ghost border border-steel-200' : 'btn-primary'} onClick={importCommon} disabled={busy}>
                📋 Começar com {COMMON_SERVICES.length} serviços comuns
              </button>
              <button className="btn-ghost border border-steel-200" onClick={() => setEditing('new')}>+ Cadastrar um por um</button>
            </div>
          </div>
        ) : (
          <>
            {noPrice > 0 && (
              <div className="rounded-xl bg-pending-50 border border-pending-200 px-4 py-3 text-sm text-pending-800">
                ⚠️ {noPrice} serviço{noPrice === 1 ? '' : 's'} sem preço. Clique em cada um para definir quanto a oficina cobra.
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <input className="input !w-auto flex-1 min-w-[220px]" placeholder="Buscar serviço"
                value={q} onChange={e => setQ(e.target.value)} />
              {inactiveCount > 0 && (
                <label className="text-sm text-steel-600 flex items-center gap-2">
                  <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} />
                  Mostrar desativados ({inactiveCount})
                </label>
              )}
            </div>

            {cats.length > 1 && (
              <div className="flex flex-wrap gap-2">
                <button onClick={() => setCat(null)}
                  className={`text-sm font-semibold px-3 py-1.5 rounded-full border transition ${cat === null ? 'bg-steel-900 text-white border-steel-900' : 'bg-white text-steel-600 border-steel-200'}`}>
                  Todos
                </button>
                {cats.map(([c, n]) => (
                  <button key={c} onClick={() => setCat(cat === c ? null : c)}
                    className={`text-sm font-semibold px-3 py-1.5 rounded-full border transition ${cat === c ? 'bg-steel-900 text-white border-steel-900' : 'bg-white text-steel-600 border-steel-200'}`}>
                    {c} <span className="opacity-60">({n})</span>
                  </button>
                ))}
              </div>
            )}

            {shown.length === 0 ? (
              <div className="card text-center py-8 text-sm text-steel-500">Nenhum serviço encontrado.</div>
            ) : (
              <div className="card !p-0 overflow-hidden">
                <div className="hidden md:grid grid-cols-12 gap-2 px-5 py-2 bg-steel-50 border-b border-steel-100 text-[10px] font-bold text-steel-500 uppercase tracking-wider">
                  <div className="col-span-6">Serviço</div>
                  <div className="col-span-2 text-right">Tempo estimado</div>
                  <div className="col-span-3 text-right">Preço</div>
                  <div className="col-span-1" />
                </div>
                <ul className="divide-y divide-steel-100">
                  {shown.map(s => (
                    <li key={s.id}>
                      <button onClick={() => setEditing(s)}
                        className={`w-full text-left px-5 py-3 grid grid-cols-12 gap-2 items-center hover:bg-steel-50 transition ${s.active ? '' : 'opacity-50'}`}>
                        <div className="col-span-12 md:col-span-6 min-w-0">
                          <div className="text-sm font-semibold truncate">{s.name}{!s.active && <span className="badge bg-steel-100 text-steel-500 ml-2">desativado</span>}</div>
                          <div className="text-xs text-steel-500">{s.category ?? 'Sem categoria'}</div>
                        </div>
                        <div className="col-span-6 md:col-span-2 text-sm md:text-right text-steel-600">⏱ {fmtMinutes(s.estimated_minutes)}</div>
                        <div className="col-span-6 md:col-span-3 text-right">
                          {Number(s.price) > 0
                            ? <span className="text-sm font-bold">{fmtBRL(Number(s.price))}</span>
                            : <span className="text-xs font-semibold text-pending-700">definir preço</span>}
                        </div>
                        <div className="hidden md:block col-span-1 text-right text-steel-300">›</div>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>

      {editing && wid && (
        <ServiceForm wid={wid} service={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
      )}
    </WorkshopLayout>
  );
}

function ServiceForm({ wid, service, onClose, onSaved }: {
  wid: string; service: WorkshopService | null; onClose: () => void; onSaved: () => void;
}) {
  const [name, setName]         = useState(service?.name ?? '');
  const [category, setCategory] = useState(service?.category ?? '');
  const [price, setPrice]       = useState(service && Number(service.price) > 0 ? moneyInput(Number(service.price)) : '');
  const [hours, setHours]       = useState(service?.estimated_minutes ? String(Math.floor(service.estimated_minutes / 60)) : '');
  const [mins, setMins]         = useState(service?.estimated_minutes ? String(service.estimated_minutes % 60) : '');
  const [active, setActive]     = useState(service?.active ?? true);
  const [saving, setSaving]     = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return toast.error('Informe o nome do serviço');
    const p = price.trim() ? parseMoney(price) : 0;
    if (!Number.isFinite(p) || p < 0) return toast.error('Preço inválido');
    const total = (parseInt(hours || '0', 10) || 0) * 60 + (parseInt(mins || '0', 10) || 0);
    const row = {
      workshop_id: wid, name: name.trim(), category: category || null, price: p,
      estimated_minutes: total > 0 ? total : null, active,
    };
    setSaving(true);
    const { error } = service
      ? await supabase.from('workshop_services').update(row).eq('id', service.id)
      : await supabase.from('workshop_services').insert(row);
    setSaving(false);
    if (error) {
      return toast.error(error.code === '23505' ? 'Já existe um serviço com esse nome' : 'Não foi possível salvar: ' + error.message);
    }
    toast.success(service ? 'Serviço atualizado ✓' : 'Serviço cadastrado ✓');
    onSaved();
  }

  return (
    <div className="fixed inset-0 bg-steel-900/60 z-50 flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
      <form onSubmit={save} onClick={e => e.stopPropagation()}
        className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl max-h-[94vh] flex flex-col shadow-2xl">
        <div className="px-6 pt-5 pb-3 border-b border-steel-100 flex items-center justify-between">
          <h2 className="text-lg font-bold">{service ? 'Editar serviço' : 'Novo serviço'}</h2>
          <button type="button" onClick={onClose} className="h-8 w-8 rounded-lg grid place-items-center text-steel-500 hover:bg-steel-100">✕</button>
        </div>
        <div className="px-6 py-4 space-y-4 overflow-y-auto">
          <div>
            <label className="label">Nome do serviço *</label>
            <input className="input" autoFocus placeholder="Ex.: Troca de pastilhas dianteiras" value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div>
            <label className="label">Categoria</label>
            <select className="input" value={category} onChange={e => setCategory(e.target.value)}>
              <option value="">— Sem categoria —</option>
              {OS_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Preço da mão de obra</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-steel-400 text-sm">R$</span>
                <input className="input !pl-9 text-right" inputMode="decimal" placeholder="0,00" value={price}
                  onChange={e => setPrice(e.target.value)}
                  onBlur={e => { const v = parseMoney(e.target.value); if (Number.isFinite(v)) setPrice(moneyInput(v)); }} />
              </div>
            </div>
            <div>
              <label className="label">Tempo estimado</label>
              <div className="flex items-center gap-1">
                <input className="input text-right !px-2" inputMode="numeric" placeholder="0" value={hours} onChange={e => setHours(e.target.value.replace(/\D/g, ''))} />
                <span className="text-xs text-steel-500">h</span>
                <input className="input text-right !px-2" inputMode="numeric" placeholder="0" value={mins} onChange={e => setMins(e.target.value.replace(/\D/g, '').slice(0, 2))} />
                <span className="text-xs text-steel-500">min</span>
              </div>
            </div>
          </div>
          <p className="text-[11px] text-steel-400">O preço vem sugerido na OS e pode ser mudado lá, caso a caso.</p>
          {service && (
            <label className="flex items-center gap-2 text-sm text-steel-700">
              <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} />
              Serviço ativo (desmarque para não aparecer mais na OS)
            </label>
          )}
        </div>
        <div className="px-6 py-4 border-t border-steel-100 flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
          <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Salvando…' : service ? 'Salvar' : 'Cadastrar serviço'}</button>
        </div>
      </form>
    </div>
  );
}
