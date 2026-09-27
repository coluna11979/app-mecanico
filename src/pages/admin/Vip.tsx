import { useEffect, useMemo, useState } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/components/ui/Toast';
import { isVipActive, VIP_REQUEST_STATUS, type VipRequest, type WorkshopPlan } from '@/lib/plan';

type Shop = { id: string; business_name: string; city: string | null; state: string | null };
type Req = VipRequest & { workshop: Shop | null };
type PlanRow = WorkshopPlan & { workshop: Shop | null };
type Tab = 'open' | 'vip' | 'closed';

const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '—');
const waLink = (phone: string | null, text: string) => {
  const d = (phone ?? '').replace(/\D/g, '');
  if (d.length < 10) return null;
  return `https://wa.me/${d.startsWith('55') ? d : `55${d}`}?text=${encodeURIComponent(text)}`;
};

export default function AdminVip() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('open');
  const [reqs, setReqs] = useState<Req[]>([]);
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [shops, setShops] = useState<Shop[]>([]);
  const [loading, setLoading] = useState(true);
  const [activating, setActivating] = useState<{ workshopId: string; reqId?: string } | null>(null);

  async function load() {
    setLoading(true);
    const [r, p, s] = await Promise.all([
      supabase.from('vip_requests').select('*, workshop:workshops(id, business_name, city, state)').order('created_at', { ascending: false }).limit(500),
      supabase.from('workshop_plans').select('*, workshop:workshops(id, business_name, city, state)').eq('plan', 'vip'),
      supabase.from('workshops').select('id, business_name, city, state').order('business_name').limit(2000),
    ]);
    if (r.error) toast.error('Erro ao carregar solicitações: ' + r.error.message);
    setReqs((r.data as unknown as Req[]) ?? []);
    setPlans((p.data as unknown as PlanRow[]) ?? []);
    setShops((s.data as Shop[]) ?? []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const openReqs = reqs.filter(r => r.status === 'pending' || r.status === 'contacted');
  const closedReqs = reqs.filter(r => r.status === 'activated' || r.status === 'declined');
  const activeVips = plans.filter(isVipActive);
  const expired = plans.filter(p => !isVipActive(p));

  async function setStatus(r: Req, status: VipRequest['status']) {
    const { error } = await supabase.from('vip_requests')
      .update({ status, handled_by: user?.id ?? null, handled_at: new Date().toISOString() }).eq('id', r.id);
    if (error) { toast.error(error.message); return; }
    toast.success(VIP_REQUEST_STATUS[status].label);
    load();
  }

  async function saveNotes(r: Req, notes: string) {
    const { error } = await supabase.from('vip_requests').update({ admin_notes: notes.trim() || null }).eq('id', r.id);
    if (error) toast.error(error.message); else toast.success('Anotação salva');
  }

  async function activate(workshopId: string, until: string, note: string, reqId?: string) {
    const current = plans.find(p => p.workshop_id === workshopId);
    const { error } = await supabase.from('workshop_plans').upsert({
      workshop_id: workshopId, plan: 'vip',
      vip_since: current?.vip_since && isVipActive(current) ? current.vip_since : new Date().toISOString(),
      vip_until: until ? new Date(`${until}T23:59:59`).toISOString() : null,
      price_note: note.trim() || null,
      activated_by: user?.id ?? null,
    }, { onConflict: 'workshop_id' });
    if (error) { toast.error('Erro ao liberar: ' + error.message); return; }
    if (reqId) {
      await supabase.from('vip_requests')
        .update({ status: 'activated', handled_by: user?.id ?? null, handled_at: new Date().toISOString() }).eq('id', reqId);
    }
    toast.success('VIP liberado ⭐');
    setActivating(null);
    load();
  }

  async function removeVip(p: PlanRow) {
    if (!confirm(`Remover o VIP de ${p.workshop?.business_name ?? 'esta oficina'}?`)) return;
    const { error } = await supabase.from('workshop_plans').update({ plan: 'free' }).eq('workshop_id', p.workshop_id);
    if (error) { toast.error(error.message); return; }
    toast.success('VIP removido');
    load();
  }

  return (
    <AdminLayout>
      <div className="max-w-5xl space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">⭐ Plano VIP</h1>
            <p className="text-sm text-steel-500">Oficinas pedem pelo app → um colaborador entra em contato, combina o pagamento e libera aqui.</p>
          </div>
          <button onClick={() => setActivating({ workshopId: '' })} className="btn-primary text-sm !py-2">+ Liberar VIP manualmente</button>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Stat label="Aguardando contato" value={reqs.filter(r => r.status === 'pending').length} tone="text-pending-700" />
          <Stat label="Em negociação" value={reqs.filter(r => r.status === 'contacted').length} tone="text-brand-700" />
          <Stat label="Oficinas VIP ativas" value={activeVips.length} tone="text-signal-700" />
        </div>

        {activating && (
          <ActivateForm key={`${activating.workshopId}-${activating.reqId ?? ''}`} shops={shops} initialWorkshopId={activating.workshopId}
            current={plans.find(p => p.workshop_id === activating.workshopId) ?? null}
            onCancel={() => setActivating(null)}
            onConfirm={(wid, until, note) => activate(wid, until, note, activating.reqId)} />
        )}

        <div className="flex gap-1 bg-steel-100 rounded-xl p-1 w-fit">
          {([['open', `Solicitações (${openReqs.length})`], ['vip', `VIPs (${activeVips.length})`], ['closed', 'Histórico']] as [Tab, string][]).map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`text-sm font-semibold px-3.5 py-1.5 rounded-lg transition ${tab === k ? 'bg-white shadow-sm text-steel-900' : 'text-steel-500 hover:text-steel-800'}`}>
              {l}
            </button>
          ))}
        </div>

        {loading ? <div className="card h-32 animate-pulse" /> : (
          <>
            {tab === 'open' && (
              openReqs.length === 0
                ? <div className="card text-sm text-steel-500">Nenhuma solicitação em aberto.</div>
                : <div className="space-y-3">{openReqs.map(r => (
                    <RequestCard key={r.id} r={r}
                      onContacted={() => setStatus(r, 'contacted')}
                      onDecline={() => { if (confirm('Marcar como "não fechou"?')) setStatus(r, 'declined'); }}
                      onActivate={() => setActivating({ workshopId: r.workshop_id, reqId: r.id })}
                      onNotes={n => saveNotes(r, n)} />
                  ))}</div>
            )}

            {tab === 'vip' && (
              <div className="card !p-0 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-steel-50 border-b border-steel-100 text-[10px] uppercase tracking-wider text-steel-500">
                    <tr>
                      <th className="text-left px-4 py-2">Oficina</th><th className="text-left px-4 py-2">VIP desde</th>
                      <th className="text-left px-4 py-2">Válido até</th><th className="text-left px-4 py-2">Combinado</th><th />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-steel-100">
                    {[...activeVips, ...expired].map(p => {
                      const active = isVipActive(p);
                      return (
                        <tr key={p.workshop_id} className={active ? '' : 'opacity-60'}>
                          <td className="px-4 py-2.5"><strong>{p.workshop?.business_name ?? '—'}</strong>
                            <span className="block text-xs text-steel-500">{[p.workshop?.city, p.workshop?.state].filter(Boolean).join('/')}</span></td>
                          <td className="px-4 py-2.5">{fmtDate(p.vip_since)}</td>
                          <td className="px-4 py-2.5">{p.vip_until ? fmtDate(p.vip_until) : 'sem prazo'}{!active && <span className="block text-xs text-alert-600">vencido</span>}</td>
                          <td className="px-4 py-2.5 text-xs text-steel-600 max-w-xs">{p.price_note ?? '—'}</td>
                          <td className="px-4 py-2.5 text-right whitespace-nowrap">
                            <button onClick={() => setActivating({ workshopId: p.workshop_id })} className="text-xs font-semibold text-brand-600 hover:underline mr-3">
                              {active ? 'Editar' : 'Renovar'}
                            </button>
                            {active && <button onClick={() => removeVip(p)} className="text-xs text-alert-600 hover:underline">Remover</button>}
                          </td>
                        </tr>
                      );
                    })}
                    {plans.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-steel-500">Nenhuma oficina VIP ainda.</td></tr>}
                  </tbody>
                </table>
              </div>
            )}

            {tab === 'closed' && (
              closedReqs.length === 0
                ? <div className="card text-sm text-steel-500">Nada no histórico ainda.</div>
                : <div className="space-y-3">{closedReqs.map(r => <RequestCard key={r.id} r={r} onNotes={n => saveNotes(r, n)} />)}</div>
            )}
          </>
        )}
      </div>
    </AdminLayout>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="card">
      <div className="text-[10px] font-bold uppercase tracking-widest text-steel-500">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${tone}`}>{value}</div>
    </div>
  );
}

function RequestCard({ r, onContacted, onDecline, onActivate, onNotes }: {
  r: Req; onContacted?: () => void; onDecline?: () => void; onActivate?: () => void; onNotes: (n: string) => void;
}) {
  const [notes, setNotes] = useState(r.admin_notes ?? '');
  const st = VIP_REQUEST_STATUS[r.status];
  const first = (r.contact_name ?? '').split(' ')[0];
  const wa = waLink(r.phone, `Olá${first ? `, ${first}` : ''}! Aqui é do MecânicoApp 👋 Vi que você solicitou o plano VIP para a ${r.workshop?.business_name ?? 'sua oficina'}. Podemos conversar agora?`);
  return (
    <div className="card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <strong className="text-steel-900">{r.workshop?.business_name ?? 'Oficina'}</strong>
            <span className={`badge ${st.color}`}>{st.label}</span>
          </div>
          <div className="text-xs text-steel-500 mt-0.5">
            {[r.workshop?.city, r.workshop?.state].filter(Boolean).join('/')} · pedido em {new Date(r.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
          </div>
          <div className="text-sm mt-2">
            👤 {r.contact_name ?? '—'} · 📞 {r.phone ?? '—'} · 🕒 {r.best_time ?? '—'}
          </div>
          {r.message && <p className="text-sm text-steel-600 mt-1.5 bg-steel-50 rounded-lg px-3 py-2">“{r.message}”</p>}
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className="btn-ghost text-sm !py-1.5 border border-signal-300 text-signal-700">💬 WhatsApp</a>}
          {r.phone && <a href={`tel:${r.phone.replace(/\D/g, '')}`} className="btn-ghost text-sm !py-1.5 border border-steel-200">📞 Ligar</a>}
          {onContacted && r.status === 'pending' && <button onClick={onContacted} className="btn-ghost text-sm !py-1.5 border border-steel-200">Marcar em contato</button>}
          {onActivate && <button onClick={onActivate} className="btn-primary text-sm !py-1.5 !bg-signal-600">⭐ Liberar VIP</button>}
          {onDecline && <button onClick={onDecline} className="btn-ghost text-sm !py-1.5 text-steel-500">Não fechou</button>}
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <input className="input !py-1.5 text-sm" placeholder="Anotações internas (ex.: ligar quinta, quer parcelar)" value={notes}
          onChange={e => setNotes(e.target.value)} />
        <button onClick={() => onNotes(notes)} disabled={notes === (r.admin_notes ?? '')}
          className="btn-ghost text-sm !py-1.5 border border-steel-200 shrink-0 disabled:opacity-40">Salvar</button>
      </div>
    </div>
  );
}

function ActivateForm({ shops, initialWorkshopId, current, onCancel, onConfirm }: {
  shops: Shop[]; initialWorkshopId: string; current: PlanRow | null;
  onCancel: () => void; onConfirm: (workshopId: string, until: string, note: string) => void;
}) {
  const [wid, setWid] = useState(initialWorkshopId);
  const [search, setSearch] = useState('');
  const [until, setUntil] = useState(current?.vip_until ? current.vip_until.slice(0, 10) : '');
  const [note, setNote] = useState(current?.price_note ?? '');
  const shop = shops.find(s => s.id === wid);
  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? shops.filter(s => s.business_name.toLowerCase().includes(q)).slice(0, 8) : [];
  }, [search, shops]);
  const quick = (months: number) => { const d = new Date(); d.setMonth(d.getMonth() + months); setUntil(d.toISOString().slice(0, 10)); };

  return (
    <div className="card border-2 border-signal-300 space-y-3">
      <div className="font-bold">⭐ Liberar VIP</div>
      {shop ? (
        <div className="flex items-center justify-between gap-2 bg-steel-50 rounded-xl px-3 py-2">
          <div><strong>{shop.business_name}</strong> <span className="text-xs text-steel-500">{[shop.city, shop.state].filter(Boolean).join('/')}</span></div>
          {!initialWorkshopId && <button onClick={() => setWid('')} className="text-xs text-steel-500 hover:underline">trocar</button>}
        </div>
      ) : (
        <div>
          <input className="input" placeholder="Buscar oficina pelo nome…" value={search} onChange={e => setSearch(e.target.value)} autoFocus />
          {matches.length > 0 && (
            <div className="mt-1 border border-steel-200 rounded-xl divide-y divide-steel-100 overflow-hidden">
              {matches.map(s => (
                <button key={s.id} onClick={() => { setWid(s.id); setSearch(''); }} className="w-full text-left px-3 py-2 text-sm hover:bg-steel-50">
                  {s.business_name} <span className="text-xs text-steel-500">{[s.city, s.state].filter(Boolean).join('/')}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="label">Válido até (vazio = sem prazo)</label>
          <input type="date" className="input" value={until} onChange={e => setUntil(e.target.value)} />
          <div className="flex gap-2 mt-1.5 text-xs">
            {[1, 3, 6, 12].map(m => <button key={m} type="button" onClick={() => quick(m)} className="text-brand-600 hover:underline">+{m} {m === 1 ? 'mês' : 'meses'}</button>)}
            <button type="button" onClick={() => setUntil('')} className="text-steel-500 hover:underline">sem prazo</button>
          </div>
        </div>
        <div>
          <label className="label">O que foi combinado</label>
          <input className="input" placeholder="Ex.: R$ 149/mês via Pix, 1º mês grátis" value={note} onChange={e => setNote(e.target.value)} />
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={() => wid && onConfirm(wid, until, note)} disabled={!wid} className="btn-primary text-sm !py-2 !bg-signal-600 disabled:opacity-50">Confirmar liberação</button>
        <button onClick={onCancel} className="btn-ghost text-sm !py-2">Cancelar</button>
      </div>
    </div>
  );
}
