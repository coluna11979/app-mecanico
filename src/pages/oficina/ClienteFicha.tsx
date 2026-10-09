import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import WorkshopLayout from '@/components/layout/WorkshopLayout';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/components/ui/Toast';
import { fetchAll } from '@/lib/fetchAll';
import LicensePlate from '@/components/os/LicensePlate';
import Recommendations from '@/components/os/Recommendations';
import CustomerForm from '@/components/customers/CustomerForm';
import VehicleForm from '@/components/customers/VehicleForm';
import { APPROVAL_CHANNELS, fmtBRL, fmtPhone, osNumber, osStatusColor, osStatusLabel } from '@/components/os/osHelpers';
import { onlyDigits, timeAgo } from '@/lib/customers';
import { useModuleAllows } from '@/lib/modules';
import {
  SEGMENTS, approvalProfile, birthdaySoon, customerInsight, fmtMonthYear, habits, shopContext, spendByCategory, vehicleUsage,
  type InsOs, type InsRec, type ShopContext,
} from '@/lib/customerInsights';
import type { Customer, Vehicle } from '@/types/database';

type FichaOs = InsOs & { number: number | null; title: string };

export default function ClienteFicha() {
  const { id } = useParams();
  const nav = useNavigate();
  const { currentWorkshop } = useAuth();
  const wid = currentWorkshop?.id ?? null;
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [os, setOs] = useState<FichaOs[]>([]);
  const [recs, setRecs] = useState<InsRec[]>([]);
  const [ctx, setCtx] = useState<ShopContext | null>(null);
  const [rank, setRank] = useState<number | null>(null);
  const [mechNames, setMechNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [vehForm, setVehForm] = useState<{ vehicle: Vehicle | null } | null>(null);
  const [carFilter, setCarFilter] = useState<string | 'all'>('all');
  // Inbox ligado: o botão do WhatsApp abre a conversa no sistema (número da oficina)
  const inboxOn = useModuleAllows()('/oficina/inbox');

  const load = useCallback(async () => {
    if (!id) return;
    const [c, v, o, r] = await Promise.all([
      supabase.from('customers').select('*').eq('id', id).maybeSingle(),
      supabase.from('vehicles').select('*').eq('customer_id', id).order('created_at'),
      supabase.from('service_orders')
        .select('id, number, title, category, customer_id, vehicle_id, status, quote_status, price, created_at, completed_at, rework_of_id, km_reading, workshop_mechanic_id, approval_requested_at, approved_at, approval_channel')
        .eq('customer_id', id).order('created_at', { ascending: false }).limit(1000),
      supabase.from('service_recommendations').select('id, customer_id, vehicle_id, description, recommended_at')
        .eq('customer_id', id).eq('status', 'pending'),
    ]);
    setCustomer((c.data as Customer) ?? null);
    setVehicles((v.data as Vehicle[]) ?? []);
    setOs((o.data as FichaOs[]) ?? []);
    setRecs((r.data as InsRec[]) ?? []);
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // Referências da oficina: ticket médio, ticket de troca de óleo, corte dos VIP e posição do cliente
  useEffect(() => {
    if (!wid || !id) return;
    let alive = true;
    (async () => {
      const [all, m] = await Promise.all([
        fetchAll<InsOs>((a, b) => supabase.from('service_orders')
          .select('id, customer_id, vehicle_id, category, status, quote_status, price, created_at, completed_at, rework_of_id')
          .eq('workshop_id', wid).order('id').range(a, b)),
        supabase.from('workshop_mechanics').select('id, name').eq('workshop_id', wid),
      ]);
      if (!alive) return;
      const spent = new Map<string, number>();
      for (const o of all.data) {
        if (!o.customer_id || o.status !== 'completed' || o.quote_status || o.rework_of_id) continue;
        spent.set(o.customer_id, (spent.get(o.customer_id) ?? 0) + Number(o.price));
      }
      const values = [...spent.values()];
      setCtx(shopContext(all.data, values));
      const mine = spent.get(id) ?? 0;
      setRank(values.length >= 10 && mine > 0 ? Math.max(1, Math.round((values.filter(x => x > mine).length / values.length) * 100)) : null);
      setMechNames(Object.fromEntries(((m.data ?? []) as { id: string; name: string }[]).map(x => [x.id, x.name])));
    })();
    return () => { alive = false; };
  }, [wid, id]);

  const ins = useMemo(() => (ctx ? customerInsight(os, recs, ctx) : null), [os, recs, ctx]);
  const cats = useMemo(() => spendByCategory(os), [os]);
  const appr = useMemo(() => approvalProfile(os), [os]);
  const hab = useMemo(() => habits(os), [os]);
  const shownOs = carFilter === 'all' ? os : os.filter(o => o.vehicle_id === carFilter);

  if (loading) return <WorkshopLayout><div className="max-w-6xl mx-auto card h-60 animate-pulse" /></WorkshopLayout>;
  if (!customer) {
    return (
      <WorkshopLayout>
        <div className="card max-w-md mx-auto text-center py-10">
          <div className="text-4xl">🔎</div>
          <h1 className="text-xl font-bold mt-2">Cliente não encontrado</h1>
          <Link to="/oficina/clientes" className="btn-primary mt-5 inline-block">Ver clientes</Link>
        </div>
      </WorkshopLayout>
    );
  }

  const phone = onlyDigits(customer.phone);
  const wa = phone.length >= 10 ? `https://wa.me/${phone.startsWith('55') ? phone : `55${phone}`}` : null;
  const seg = ins ? SEGMENTS[ins.segment] : null;
  const bday = birthdaySoon(customer.birth_date);
  const channelLabel = appr.channel ? APPROVAL_CHANNELS.find(c => c.value === appr.channel)?.label.replace(/^\S+\s/, '').toLowerCase() : null;
  const newOsUrl = (vehicleId?: string | null) =>
    `/oficina/os?nova=1&cliente=${customer.id}${vehicleId ? `&veiculo=${vehicleId}` : vehicles.length === 1 ? `&veiculo=${vehicles[0].id}` : ''}`;
  const catMax = Math.max(1, ...cats.map(c => c.value));

  async function removeCustomer() {
    if (!customer) return;
    if (os.length) {
      toast.error(`${customer.full_name.split(' ')[0]} tem ${os.length} OS no histórico — não dá para excluir sem perder esse histórico.`);
      return;
    }
    if (!confirm(`Excluir ${customer.full_name} e os carros cadastrados? Não dá para desfazer.`)) return;
    const { error } = await supabase.from('customers').delete().eq('id', customer.id);
    if (error) { toast.error('Não foi possível excluir: ' + error.message); return; }
    toast.success('Cliente excluído');
    nav('/oficina/clientes');
  }

  async function removeVehicle(v: Vehicle) {
    const count = os.filter(o => o.vehicle_id === v.id).length;
    if (count) { toast.error(`O ${v.model} tem ${count} OS no histórico — não dá para excluir.`); return; }
    if (!confirm(`Excluir o carro ${v.plate}?`)) return;
    const { error } = await supabase.from('vehicles').delete().eq('id', v.id);
    if (error) { toast.error('Não foi possível excluir: ' + error.message); return; }
    toast.success('Carro excluído');
    load();
  }

  return (
    <WorkshopLayout>
      <div className="max-w-6xl mx-auto space-y-5">
        <Link to="/oficina/clientes" className="text-sm text-steel-500 hover:text-steel-800">← Clientes</Link>

        {/* Cabeçalho */}
        <div className="card">
          <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
            <div className="flex items-start gap-4 min-w-0">
              <div className={`h-16 w-16 rounded-full grid place-items-center font-bold text-2xl shrink-0 ${ins?.vip ? 'bg-brand-500 text-white' : 'bg-brand-500/10 text-brand-600'}`}>
                {customer.full_name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">{customer.full_name}</h1>
                <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                  {seg && <span title={seg.hint} className={`badge ${seg.cls}`}>{seg.icon} {seg.label}</span>}
                  {ins?.vip && <span className="badge bg-brand-100 text-brand-800">⭐ VIP{rank ? ` · top ${rank}% em gasto` : ''}</span>}
                  {ins?.avgIntervalDays && <span className="badge bg-steel-100 text-steel-700">🔁 vem a cada ~{Math.max(1, Math.round(ins.avgIntervalDays / 30))} {Math.round(ins.avgIntervalDays / 30) <= 1 ? 'mês' : 'meses'}</span>}
                  {bday != null && <span className="badge bg-pending-100 text-pending-800">🎂 {bday === 0 ? 'aniversário hoje' : `aniversário em ${bday} dia${bday === 1 ? '' : 's'}`}</span>}
                  {customer.contact_opt_out && <span className="badge bg-alert-50 text-alert-700">🚫 Não quer receber mensagens</span>}
                  {customer.source === 'paper_import' && <span className="badge bg-steel-100 text-steel-600">📷 Importado do papel</span>}
                </div>
                <div className="text-sm text-steel-600 mt-2 flex flex-wrap gap-x-4 gap-y-0.5">
                  {customer.phone && <span>📞 {fmtPhone(customer.phone)}</span>}
                  {customer.email && <span className="truncate">✉️ {customer.email}</span>}
                  {customer.cpf && <span>🪪 {customer.cpf}</span>}
                  {(customer.address || customer.city) && <span>📍 {[customer.address, customer.city].filter(Boolean).join(' · ')}</span>}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 lg:justify-end shrink-0">
              <Link to={newOsUrl()} className="btn-primary text-sm !py-2">＋ Nova OS</Link>
              {wa && (inboxOn ? (
                <Link to={`/oficina/inbox?tel=${phone}&cliente=${customer.id}&nome=${encodeURIComponent(customer.full_name)}`}
                  className="btn-ghost text-sm !py-2 border border-signal-500/40 text-signal-700">💬 Conversar no WhatsApp</Link>
              ) : (
                <a href={wa} target="_blank" rel="noopener noreferrer" className="btn-ghost text-sm !py-2 border border-signal-500/40 text-signal-700">💬 WhatsApp</a>
              ))}
              {phone.length >= 10 && <a href={`tel:${phone}`} className="btn-ghost text-sm !py-2 border border-steel-200">📞 Ligar</a>}
              <button onClick={() => setEditing(true)} className="btn-ghost text-sm !py-2 border border-steel-200">✏️ Editar</button>
              <button onClick={removeCustomer} className="btn-ghost text-sm !py-2 text-steel-400 hover:text-alert-600">Excluir</button>
            </div>
          </div>

          {/* Números que valem dinheiro */}
          {ins && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-5">
              <Mini label="Valor do cliente" value={fmtBRL(ins.spent)}
                sub={ins.visits ? `${ins.visits} visita${ins.visits === 1 ? '' : 's'} desde ${fmtMonthYear(ins.firstVisit)}` : 'ainda sem serviço'} />
              <Mini label="Gasta por ano" value={ins.visits ? fmtBRL(ins.perYear) : '—'} sub={ins.visits ? `ticket médio ${fmtBRL(ins.avgTicket)}` : undefined} />
              <Mini label="Próxima visita prevista"
                value={ins.nextExpected ? fmtMonthYear(ins.nextExpected) : '—'}
                sub={!ins.nextExpected ? (ins.visits >= 2 ? 'sem ritmo definido' : 'precisa de 2 visitas para prever')
                  : ins.overdueDays > 0 ? `atrasado ${ins.overdueDays} dias` : 'no ritmo dele'}
                tone={ins.overdueDays > 30 ? 'warn' : ins.nextExpected ? 'good' : undefined} />
              <Mini label="Aprova orçamentos" value={appr.rate == null ? '—' : `${Math.round(appr.rate)}%`}
                sub={appr.rate == null ? 'sem orçamentos enviados' : `${appr.approved} aprovados · ${appr.declined} recusados${channelLabel ? ` · costuma aprovar por ${channelLabel}` : ''}`} />
            </div>
          )}

          {/* Dinheiro na mesa deste cliente */}
          {ins && ins.opportunity.total > 0 && (
            <div className="mt-4 rounded-xl bg-signal-50 border border-signal-200 px-4 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="font-bold text-signal-900">💰 Dinheiro na mesa: {fmtBRL(ins.opportunity.total)}</div>
                <span className="text-[11px] text-signal-700">estimativa pelo ticket médio</span>
              </div>
              <ul className="mt-1.5 space-y-0.5 text-sm text-signal-900">
                {ins.opportunity.parts.map(p => (
                  <li key={p.key} className="flex justify-between gap-2"><span>• {p.label}</span><span className="font-semibold">{fmtBRL(p.value)}</span></li>
                ))}
              </ul>
            </div>
          )}

          {customer.notes && (
            <div className="mt-3 bg-pending-50 border border-pending-200 rounded-xl px-4 py-3 text-sm text-pending-900 whitespace-pre-line">
              🔒 <strong>Observações:</strong> {customer.notes}
            </div>
          )}
          {ins && ins.openOs > 0 && (
            <div className="mt-3 text-sm text-brand-800 bg-brand-50 border border-brand-200 rounded-xl px-4 py-2">
              🔧 {ins.openOs} OS em aberto agora{ins.openValue > 0 ? ` · ${fmtBRL(ins.openValue)} a entrar quando concluir` : ''} — veja na linha do tempo abaixo.
            </div>
          )}
        </div>

        <div className="grid lg:grid-cols-3 gap-5">
          {/* Histórico (linha do tempo) */}
          <div className="lg:col-span-2 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-bold text-lg">🕒 Linha do tempo ({os.length})</h2>
              {vehicles.length > 1 && (
                <div className="flex flex-wrap gap-1.5">
                  <Chip on={carFilter === 'all'} onClick={() => setCarFilter('all')}>Todos os carros</Chip>
                  {vehicles.map(v => <Chip key={v.id} on={carFilter === v.id} onClick={() => setCarFilter(v.id)}>{v.model} · {v.plate}</Chip>)}
                </div>
              )}
            </div>
            {shownOs.length === 0 ? (
              <div className="card text-center py-10 text-sm text-steel-500">
                Nenhuma OS ainda. <Link to={newOsUrl(carFilter === 'all' ? null : carFilter)} className="text-brand-600 font-semibold hover:underline">＋ Abrir a primeira</Link>
              </div>
            ) : (
              <div className="card !p-0 divide-y divide-steel-100">
                {shownOs.map(o => {
                  const car = vehicles.find(v => v.id === o.vehicle_id);
                  const declined = o.quote_status === 'declined';
                  return (
                    <Link key={o.id} to={`/oficina/os/${o.id}`} className={`flex items-center justify-between gap-3 px-4 py-3 hover:bg-steel-50 ${declined ? 'bg-pending-50/40' : ''}`}>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold truncate">
                          <span className="font-mono text-steel-500 mr-1.5">nº {osNumber(o)}</span>{o.title}
                          {o.rework_of_id && <span className="ml-1.5 badge bg-alert-50 text-alert-700 text-[10px]">🔁 retorno</span>}
                        </div>
                        <div className="text-xs text-steel-500 truncate">
                          {new Date(o.completed_at ?? o.created_at).toLocaleDateString('pt-BR')}
                          {car && ` · ${car.model} ${car.plate}`}
                          {o.km_reading != null && ` · ${o.km_reading.toLocaleString('pt-BR')} km`}
                          {o.workshop_mechanic_id && mechNames[o.workshop_mechanic_id] && ` · ${mechNames[o.workshop_mechanic_id]}`}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className={`text-sm font-bold ${declined ? 'text-pending-700 line-through decoration-1' : ''}`}>{fmtBRL(o.price)}</div>
                        <span className={`badge text-[10px] ${osStatusColor(o)}`}>{osStatusLabel(o)}</span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          {/* Lateral */}
          <div className="space-y-4">
            {/* Onde gasta */}
            {cats.length > 0 && (
              <div className="card">
                <div className="text-[10px] font-bold text-steel-500 uppercase tracking-widest mb-3">🧾 Onde ele gasta</div>
                <div className="space-y-2">
                  {cats.slice(0, 6).map(c => (
                    <div key={c.category}>
                      <div className="flex justify-between text-sm"><span>{c.category}</span><strong>{fmtBRL(c.value)}</strong></div>
                      <div className="h-1.5 rounded-full bg-steel-100 mt-1 overflow-hidden">
                        <div className="h-full bg-brand-500 rounded-full" style={{ width: `${(c.value / catMax) * 100}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
                {(hab.mechanicId || hab.weekday) && (
                  <p className="text-xs text-steel-500 mt-3">
                    {hab.mechanicId && mechNames[hab.mechanicId] && <>Costuma ser atendido por <strong>{mechNames[hab.mechanicId]}</strong>. </>}
                    {hab.weekday && <>Costuma vir às <strong>{hab.weekday}s</strong>.</>}
                  </p>
                )}
              </div>
            )}

            {/* Carros */}
            <div className="card">
              <div className="flex items-center justify-between mb-3">
                <div className="text-[10px] font-bold text-steel-500 uppercase tracking-widest">🚗 Carros ({vehicles.length})</div>
                <button onClick={() => setVehForm({ vehicle: null })} className="text-xs font-semibold text-brand-600 hover:underline">+ Carro</button>
              </div>
              {vehicles.length === 0 ? <p className="text-sm text-steel-400">Nenhum carro cadastrado.</p> : (
                <div className="space-y-3">
                  {vehicles.map(v => {
                    const count = os.filter(o => o.vehicle_id === v.id).length;
                    const u = vehicleUsage(os, v.id);
                    const age = v.year ? new Date().getFullYear() - v.year : null;
                    return (
                      <div key={v.id} className="rounded-xl border border-steel-100 p-3">
                        <div className="flex items-center gap-3">
                          <LicensePlate plate={v.plate} size="sm" />
                          <div className="min-w-0 text-sm">
                            <div className="font-semibold truncate">{v.make} {v.model}</div>
                            <div className="text-xs text-steel-500">{[v.year && `${v.year}${age != null ? ` (${age} anos)` : ''}`, v.color].filter(Boolean).join(' · ') || '—'}</div>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
                          <Info label="Km estimado hoje" value={u.estKm != null ? `${u.estKm.toLocaleString('pt-BR')} km` : '—'} />
                          <Info label="Roda por mês" value={u.kmPerMonth ? `~${u.kmPerMonth.toLocaleString('pt-BR')} km` : '—'} />
                          <Info label="Última troca de óleo" value={u.lastOil ? timeAgo(u.lastOil) : '—'} />
                          <Info label="Próxima troca" value={u.nextOilDays == null ? '—' : u.nextOilDays < 0 ? `vencida há ${-u.nextOilDays} dias` : `em ~${Math.max(1, Math.round(u.nextOilDays / 30))} ${Math.round(u.nextOilDays / 30) <= 1 ? 'mês' : 'meses'}`}
                            warn={u.nextOilDays != null && u.nextOilDays < 30} />
                        </div>
                        {v.notes && <p className="text-xs text-steel-500 italic mt-2">{v.notes}</p>}
                        <div className="flex flex-wrap items-center gap-3 mt-2 text-xs">
                          <span className="text-steel-400">{count} OS</span>
                          <Link to={newOsUrl(v.id)} className="font-semibold text-brand-600 hover:underline">＋ Nova OS</Link>
                          <button onClick={() => setVehForm({ vehicle: v })} className="text-steel-600 hover:underline">Editar</button>
                          <button onClick={() => removeVehicle(v)} className="text-steel-400 hover:text-alert-600">Excluir</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {currentWorkshop && (
              <Recommendations workshopId={currentWorkshop.id} customerId={customer.id}
                vehicleId={vehicles.length === 1 ? vehicles[0].id : null} osId={null} />
            )}
          </div>
        </div>
        <p className="text-[11px] text-steel-400">
          Previsões pelo histórico do cliente: próxima visita = última visita + intervalo médio entre visitas; próxima troca de óleo = 6 meses ou 10 mil km
          (o que vier antes, pelo km que ele roda). Valores de oportunidade são estimativas.
        </p>
      </div>

      {editing && currentWorkshop && (
        <CustomerForm workshopId={currentWorkshop.id} customer={customer}
          onClose={() => setEditing(false)} onSaved={() => { setEditing(false); load(); }} />
      )}
      {vehForm && currentWorkshop && (
        <VehicleForm workshopId={currentWorkshop.id} customerId={customer.id} customerName={customer.full_name}
          vehicle={vehForm.vehicle} onClose={() => setVehForm(null)} onSaved={() => { setVehForm(null); load(); }} />
      )}
    </WorkshopLayout>
  );
}

function Mini({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'good' | 'warn' }) {
  return (
    <div className="bg-steel-50 rounded-xl px-3 py-3">
      <div className="text-[10px] font-bold uppercase tracking-widest text-steel-500">{label}</div>
      <div className="text-lg font-bold font-display mt-0.5">{value}</div>
      {sub && <div className={`text-[11px] ${tone === 'warn' ? 'text-pending-700 font-semibold' : tone === 'good' ? 'text-signal-700' : 'text-steel-500'}`}>{sub}</div>}
    </div>
  );
}

function Info({ label, value, warn = false }: { label: string; value: string; warn?: boolean }) {
  return (
    <div>
      <div className="text-steel-400">{label}</div>
      <div className={`font-semibold ${warn ? 'text-pending-700' : 'text-steel-800'}`}>{value}</div>
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={`text-xs px-3 py-1.5 rounded-full border transition ${on ? 'bg-steel-900 text-white border-steel-900' : 'bg-white text-steel-600 border-steel-200'}`}>
      {children}
    </button>
  );
}
