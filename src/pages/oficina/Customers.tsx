import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import WorkshopLayout from '@/components/layout/WorkshopLayout';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { fetchAll } from '@/lib/fetchAll';
import { fmtBRL, fmtPhone } from '@/components/os/osHelpers';
import ReactivationList from '@/components/customers/ReactivationList';
import CustomerForm from '@/components/customers/CustomerForm';
import { onlyDigits, plateNorm, timeAgo } from '@/lib/customers';
import { SEGMENTS, baseInsights, type CustomerInsight, type InsOs, type InsRec } from '@/lib/customerInsights';

type Base = { id: string; full_name: string; phone: string | null; cpf: string | null; created_at: string; contact_opt_out: boolean | null };
type Row = Base & { plates: string[]; ins: CustomerInsight };
type Filter = 'all' | 'money' | 'vip' | 'risk' | 'gone' | 'new' | 'due' | 'nophone';
type Sort = 'money' | 'spent' | 'visits' | 'recent' | 'gone';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'Todos' },
  { key: 'money', label: '💰 Com dinheiro na mesa' },
  { key: 'vip', label: '⭐ VIP' },
  { key: 'risk', label: '⚠️ Em risco' },
  { key: 'due', label: '📅 Voltam este mês' },
  { key: 'gone', label: '😴 Sumidos' },
  { key: 'new', label: '🆕 Novos' },
  { key: 'nophone', label: '📵 Sem telefone' },
];
const SORTS: { key: Sort; label: string }[] = [
  { key: 'money', label: 'Maior oportunidade' }, { key: 'spent', label: 'Maior gasto' },
  { key: 'visits', label: 'Mais visitas' }, { key: 'recent', label: 'Cadastrados recentemente' },
  { key: 'gone', label: 'Sumidos há mais tempo' },
];
const PAGE = 50;

export default function Customers() {
  const { currentWorkshop } = useAuth();
  const shop = currentWorkshop;
  const nav = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  const [summary, setSummary] = useState<ReturnType<typeof baseInsights>['summary'] | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('money');
  const [shown, setShown] = useState(PAGE);
  const [creating, setCreating] = useState(false);
  const [view, setView] = useState<'all' | 'reactivate'>('all');

  useEffect(() => {
    if (!shop) return;
    let alive = true;
    (async () => {
      setLoading(true);
      const [c, v, o, r] = await Promise.all([
        fetchAll<Base>((a, b) => supabase.from('customers')
          .select('id, full_name, phone, cpf, created_at, contact_opt_out').eq('workshop_id', shop.id).order('id').range(a, b)),
        fetchAll<{ customer_id: string; plate: string }>((a, b) => supabase.from('vehicles')
          .select('customer_id, plate').eq('workshop_id', shop.id).order('id').range(a, b)),
        fetchAll<InsOs>((a, b) => supabase.from('service_orders')
          .select('id, customer_id, vehicle_id, category, status, quote_status, price, created_at, completed_at, rework_of_id')
          .eq('workshop_id', shop.id).order('id').range(a, b)),
        fetchAll<InsRec>((a, b) => supabase.from('service_recommendations')
          .select('id, customer_id, vehicle_id, description, recommended_at').eq('workshop_id', shop.id).eq('status', 'pending').order('id').range(a, b)),
      ]);
      if (!alive) return;
      const plates = new Map<string, string[]>();
      for (const x of v.data) plates.set(x.customer_id, [...(plates.get(x.customer_id) ?? []), x.plate]);
      const ins = baseInsights(c.data.map(x => x.id), o.data, r.data);
      setRows(c.data.map(x => ({ ...x, plates: plates.get(x.id) ?? [], ins: ins.map.get(x.id)! })));
      setSummary(ins.summary);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [shop?.id]);

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    const qd = onlyDigits(q);
    const qp = plateNorm(q);
    const now = new Date();
    const mStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const mEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();
    let out = rows.filter(r => {
      const s = r.ins.segment;
      if (filter === 'money' && r.ins.opportunity.total <= 0) return false;
      if (filter === 'vip' && !r.ins.vip) return false;
      if (filter === 'risk' && s !== 'risk') return false;
      if (filter === 'gone' && s !== 'gone') return false;
      if (filter === 'new' && s !== 'new') return false;
      if (filter === 'due') {
        const t = r.ins.nextExpected ? new Date(r.ins.nextExpected).getTime() : 0;
        if (!(t >= mStart && t < mEnd) || s === 'risk' || s === 'gone') return false;
      }
      if (filter === 'nophone' && onlyDigits(r.phone).length >= 10) return false;
      if (!q) return true;
      return r.full_name.toLowerCase().includes(q)
        || (qd.length >= 3 && (onlyDigits(r.phone).includes(qd) || onlyDigits(r.cpf).includes(qd)))
        || (qp.length >= 3 && r.plates.some(p => plateNorm(p).includes(qp)));
    });
    out = [...out].sort((a, b) => {
      switch (sort) {
        case 'money': return b.ins.opportunity.total - a.ins.opportunity.total || b.ins.spent - a.ins.spent;
        case 'spent': return b.ins.spent - a.ins.spent;
        case 'visits': return b.ins.visits - a.ins.visits || b.ins.spent - a.ins.spent;
        case 'gone': return (a.ins.lastVisit ?? '9999').localeCompare(b.ins.lastVisit ?? '9999');
        default: return b.created_at.localeCompare(a.created_at);
      }
    });
    return out;
  }, [rows, search, filter, sort]);

  const go = (f: Filter, s?: Sort) => { setFilter(f); if (s) setSort(s); setShown(PAGE); };

  return (
    <WorkshopLayout>
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-wrap justify-between items-end gap-3 mb-5">
          <div>
            <div className="text-sm text-steel-500">Vendas</div>
            <h1 className="text-3xl font-bold tracking-tight">👥 Clientes</h1>
            {!loading && <p className="text-xs text-steel-500 mt-0.5">{rows.length.toLocaleString('pt-BR')} clientes na base</p>}
          </div>
          <button onClick={() => setCreating(true)} className="btn-primary">+ Novo cliente</button>
        </div>

        <div className="flex flex-wrap gap-2 mb-5">
          <button onClick={() => setView('all')}
            className={`text-sm font-semibold px-3.5 py-2 rounded-full border transition ${view === 'all' ? 'bg-steel-900 text-white border-steel-900' : 'bg-white text-steel-600 border-steel-200'}`}>
            👥 Base de clientes
          </button>
          <button onClick={() => setView('reactivate')}
            className={`text-sm font-semibold px-3.5 py-2 rounded-full border transition ${view === 'reactivate' ? 'bg-signal-500 text-white border-signal-500' : 'bg-white text-steel-600 border-steel-200'}`}>
            💬 Reativar clientes
          </button>
        </div>

        {view === 'reactivate' && shop && <ReactivationList workshopId={shop.id} workshopName={shop.business_name} />}

        {view === 'all' && (
          <>
            {/* O dinheiro da base */}
            {summary && (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
                <MoneyCard dark label="💰 Dinheiro na mesa (potencial)" value={fmtBRL(summary.onTable)}
                  sub={`em ${summary.withOpportunity.toLocaleString('pt-BR')} clientes · recuperando 1 em cada 5: ~${fmtBRL(summary.onTable / 5)}`}
                  onClick={() => go('money', 'money')} />
                <MoneyCard label="⚠️ Em risco" value={`${summary.riskCount} clientes`}
                  sub={`~${fmtBRL(summary.riskPerYear)} por ano que podem parar de vir`} onClick={() => go('risk', 'money')} warn />
                <MoneyCard label="📅 Voltam este mês" value={`${summary.dueThisMonth} clientes`}
                  sub={`~${fmtBRL(summary.dueThisMonthValue)} previstos pelo ritmo de cada um`} onClick={() => go('due', 'money')} />
                <MoneyCard label="⭐ Clientes VIP" value={`${summary.vipCount} clientes`}
                  sub={`os 20% que mais gastam = ${Math.round(summary.vipShare)}% do faturamento`} onClick={() => go('vip', 'spent')} />
              </div>
            )}

            {/* Busca, filtros e ordem */}
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <input className="input max-w-sm" placeholder="Buscar por nome, telefone, placa ou CPF…"
                value={search} onChange={e => { setSearch(e.target.value); setShown(PAGE); }} />
              <select className="input !w-auto" value={sort} onChange={e => setSort(e.target.value as Sort)}>
                {SORTS.map(s => <option key={s.key} value={s.key}>Ordenar: {s.label}</option>)}
              </select>
            </div>
            <div className="flex flex-wrap gap-1.5 mb-4">
              {FILTERS.map(x => (
                <button key={x.key} onClick={() => go(x.key)}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition ${filter === x.key ? 'bg-brand-500 text-white border-brand-500' : 'bg-white text-steel-600 border-steel-200 hover:border-brand-300'}`}>
                  {x.label}
                </button>
              ))}
            </div>

            {loading ? (
              <div className="card h-64 animate-pulse" />
            ) : list.length === 0 ? (
              <div className="card text-center text-steel-500 py-16">
                {rows.length === 0
                  ? <><p className="text-lg font-semibold">Nenhum cliente ainda</p><p className="text-sm mt-1">Cadastre seu primeiro cliente e comece a construir o histórico.</p></>
                  : 'Nenhum cliente encontrado com esse filtro ou busca.'}
              </div>
            ) : (
              <div className="card !p-0 overflow-hidden">
                <div className="hidden md:grid grid-cols-[minmax(0,2.3fr)_minmax(0,1.1fr)_60px_110px_110px_130px] gap-3 px-4 py-2 bg-steel-50 border-b border-steel-100 text-[10px] font-bold uppercase tracking-wider text-steel-500">
                  <span>Cliente</span><span>Carros</span><span className="text-right">Visitas</span><span className="text-right">Total gasto</span>
                  <span className="text-right">Última visita</span><span className="text-right">💰 Oportunidade</span>
                </div>
                <div className="divide-y divide-steel-100">
                  {list.slice(0, shown).map(r => {
                    const seg = SEGMENTS[r.ins.segment];
                    return (
                      <button key={r.id} onClick={() => nav(`/oficina/clientes/${r.id}`)}
                        className="w-full text-left px-4 py-3 hover:bg-steel-50 transition grid grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,2.3fr)_minmax(0,1.1fr)_60px_110px_110px_130px] gap-x-3 gap-y-1 items-center">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`h-9 w-9 rounded-full grid place-items-center font-bold shrink-0 ${r.ins.vip ? 'bg-brand-500 text-white' : 'bg-brand-500/10 text-brand-600'}`}>
                            {r.full_name.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="font-semibold truncate">
                              {r.full_name}{r.contact_opt_out && <span title="Não quer receber mensagens" className="ml-1 text-xs">🚫</span>}
                            </div>
                            <div className="flex flex-wrap items-center gap-1 mt-0.5">
                              <span title={seg.hint} className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${seg.cls}`}>{seg.icon} {seg.label}</span>
                              {r.ins.vip && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-brand-100 text-brand-800">⭐ VIP</span>}
                              <span className="text-[11px] text-steel-500 truncate">{r.phone ? fmtPhone(r.phone) : 'sem telefone'}</span>
                            </div>
                          </div>
                        </div>
                        <div className="hidden md:flex flex-wrap gap-1 min-w-0">
                          {r.plates.slice(0, 2).map(p => <span key={p} className="badge bg-steel-100 text-steel-700 uppercase font-mono">{p}</span>)}
                          {r.plates.length > 2 && <span className="badge bg-steel-100 text-steel-500">+{r.plates.length - 2}</span>}
                          {r.plates.length === 0 && <span className="text-xs text-steel-400">—</span>}
                        </div>
                        <div className="hidden md:block text-right text-sm">{r.ins.visits}</div>
                        <div className="hidden md:block text-right text-sm">{fmtBRL(r.ins.spent)}</div>
                        <div className="hidden md:block text-right text-xs text-steel-600">{timeAgo(r.ins.lastVisit)}</div>
                        <div className="text-right">
                          {r.ins.opportunity.total > 0
                            ? <span className="text-sm font-bold text-signal-700">{fmtBRL(r.ins.opportunity.total)}</span>
                            : <span className="text-xs text-steel-300">—</span>}
                          <div className="md:hidden text-[11px] text-steel-500">{fmtBRL(r.ins.spent)} · {timeAgo(r.ins.lastVisit)}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
                {list.length > shown && (
                  <button onClick={() => setShown(s => s + PAGE)} className="w-full py-3 text-sm font-semibold text-brand-600 hover:bg-steel-50 border-t border-steel-100">
                    Mostrar mais ({(list.length - shown).toLocaleString('pt-BR')} restantes)
                  </button>
                )}
              </div>
            )}
            {!loading && list.length > 0 && (
              <p className="text-[11px] text-steel-400 mt-2">
                {list.length.toLocaleString('pt-BR')} cliente{list.length === 1 ? '' : 's'} nesta lista. 💰 Oportunidade = orçamento não aprovado (6 meses) + serviço recomendado (último ano)
                + troca de óleo vencida + uma visita de volta (em risco ou sumido há até 18 meses; depois disso consideramos perdido). Visita típica = ticket médio do cliente,
                limitado a 1,5× o da oficina. É o potencial — na prática, só parte volta.
              </p>
            )}
          </>
        )}
      </div>

      {creating && shop && (
        <CustomerForm workshopId={shop.id} onClose={() => setCreating(false)}
          onSaved={id => { setCreating(false); nav(`/oficina/clientes/${id}`); }} />
      )}
    </WorkshopLayout>
  );
}

function MoneyCard({ label, value, sub, onClick, dark = false, warn = false }: {
  label: string; value: string; sub: string; onClick: () => void; dark?: boolean; warn?: boolean;
}) {
  return (
    <button onClick={onClick} className={`card text-left hover:shadow-md hover:-translate-y-0.5 transition ${dark ? '!bg-steel-900 text-white' : ''}`}>
      <div className={`text-[10px] font-bold uppercase tracking-widest ${dark ? 'text-brand-300' : 'text-steel-500'}`}>{label}</div>
      <div className={`text-2xl font-bold font-display mt-1 ${warn ? 'text-pending-700' : ''}`}>{value}</div>
      <div className={`text-xs mt-0.5 ${dark ? 'text-steel-300' : 'text-steel-500'}`}>{sub}</div>
    </button>
  );
}
