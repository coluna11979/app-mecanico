import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { toast } from '@/components/ui/Toast';
import { waNumber } from '@/components/os/osHelpers';
import type { Customer, Vehicle } from '@/types/database';

type LastVisit = {
  customer: Customer;
  osId: string;
  title: string;
  date: string;
  vehicle: Pick<Vehicle, 'make' | 'model' | 'plate'> | null;
};

const PERIODS = [3, 6, 12] as const;

const DEFAULT_TEMPLATE =
  'Olá, {nome}! Aqui é da {oficina}. 🚗\n' +
  'Faz {tempo} desde o último serviço no seu {carro} ({servico}).\n' +
  'Que tal agendar uma revisão? É só responder esta mensagem.';

function monthsSince(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  return (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
}
function timeLabel(m: number) {
  if (m < 12) return `${m} ${m === 1 ? 'mês' : 'meses'}`;
  const y = Math.floor(m / 12);
  return `${y} ${y === 1 ? 'ano' : 'anos'}`;
}

/**
 * Clientes que não voltam há X meses, com mensagem pronta no WhatsApp.
 * Sem integração: o botão só abre o WhatsApp com o texto preenchido.
 */
export default function ReactivationList({ workshopId, workshopName }: { workshopId: string; workshopName: string }) {
  const tplKey = `reativar-template:${workshopId}`;
  const [months, setMonths]   = useState<number>(6);
  const [rows, setRows]       = useState<LastVisit[]>([]);
  const [loading, setLoading] = useState(true);
  const [template, setTemplate] = useState(() => {
    try { return localStorage.getItem(tplKey) || DEFAULT_TEMPLATE; } catch { return DEFAULT_TEMPLATE; }
  });
  const [editingTpl, setEditingTpl] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      // Última OS concluída de cada cliente
      const { data } = await supabase.from('service_orders')
        .select('id, title, created_at, completed_at, customer:customers(*), vehicle:vehicles(make, model, plate)')
        .eq('workshop_id', workshopId).eq('status', 'completed').not('customer_id', 'is', null)
        .order('completed_at', { ascending: false, nullsFirst: false }).limit(2000);
      if (!alive) return;
      const latest = new Map<string, LastVisit>();
      for (const o of (data ?? []) as any[]) {
        if (!o.customer) continue;
        const date = o.completed_at ?? o.created_at;
        const prev = latest.get(o.customer.id);
        if (!prev || new Date(date) > new Date(prev.date)) {
          latest.set(o.customer.id, { customer: o.customer, osId: o.id, title: o.title, date, vehicle: o.vehicle });
        }
      }
      setRows([...latest.values()]);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [workshopId]);

  const due = useMemo(() => rows
    .filter(r => !r.customer.contact_opt_out && monthsSince(r.date) >= months)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()), [rows, months]);

  function message(r: LastVisit) {
    const carro = r.vehicle ? `${r.vehicle.make} ${r.vehicle.model}`.trim() : 'carro';
    const vars: Record<string, string> = {
      '{nome}': r.customer.full_name.split(' ')[0],
      '{oficina}': workshopName,
      '{tempo}': timeLabel(monthsSince(r.date)),
      '{carro}': carro,
      '{servico}': r.title,
    };
    return Object.entries(vars).reduce((txt, [k, v]) => txt.split(k).join(v), template);
  }

  async function markContacted(r: LastVisit) {
    const now = new Date().toISOString();
    setRows(rs => rs.map(x => x.customer.id === r.customer.id ? { ...x, customer: { ...x.customer, last_contacted_at: now } } : x));
    await supabase.from('customers').update({ last_contacted_at: now }).eq('id', r.customer.id);
  }

  async function optOut(r: LastVisit) {
    if (!confirm(`${r.customer.full_name} não quer mais receber mensagens? Ele sai desta lista.`)) return;
    const { error } = await supabase.from('customers').update({ contact_opt_out: true }).eq('id', r.customer.id);
    if (error) { toast.error('Erro: ' + error.message); return; }
    setRows(rs => rs.map(x => x.customer.id === r.customer.id ? { ...x, customer: { ...x.customer, contact_opt_out: true } } : x));
    toast.success('Anotado — não vamos sugerir contato com este cliente');
  }

  function saveTemplate(v: string) {
    setTemplate(v);
    try { localStorage.setItem(tplKey, v); } catch { /* ignore */ }
  }

  return (
    <div className="space-y-4">
      <div className="card !bg-signal-50 border border-signal-200">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="font-bold text-steel-900">💬 Clientes para reativar</div>
            <p className="text-sm text-steel-600">Quem não volta há algum tempo. Um contato na hora certa traz o cliente de volta.</p>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-steel-600">Sem voltar há</span>
            {PERIODS.map(p => (
              <button key={p} onClick={() => setMonths(p)}
                className={`px-3 py-1.5 rounded-full font-semibold border transition ${months === p ? 'bg-signal-500 text-white border-signal-500' : 'bg-white border-steel-200 text-steel-600'}`}>
                {p === 12 ? '1 ano' : `${p} meses`}+
              </button>
            ))}
          </div>
        </div>
        <button onClick={() => setEditingTpl(e => !e)} className="text-xs text-signal-700 font-semibold mt-3 hover:underline">
          {editingTpl ? '▲ Fechar mensagem' : '✏️ Editar a mensagem'}
        </button>
        {editingTpl && (
          <div className="mt-2">
            <textarea className="input text-sm" rows={4} value={template} onChange={e => saveTemplate(e.target.value)} />
            <div className="flex justify-between text-[11px] text-steel-500 mt-1">
              <span>Use: {'{nome} {oficina} {tempo} {carro} {servico}'}</span>
              <button onClick={() => saveTemplate(DEFAULT_TEMPLATE)} className="hover:underline">Restaurar padrão</button>
            </div>
          </div>
        )}
      </div>

      {loading ? (
        <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-20 bg-white rounded-2xl animate-pulse" />)}</div>
      ) : due.length === 0 ? (
        <div className="card text-center text-steel-500 py-10">
          Nenhum cliente sem voltar há {months === 12 ? '1 ano' : `${months} meses`} ou mais.
          <div className="text-xs mt-1">Importe os orçamentos antigos em <Link to="/oficina/importar" className="text-brand-600 font-semibold">📷 Importar orçamentos</Link> para trazer o histórico.</div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="text-sm text-steel-500">{due.length} {due.length === 1 ? 'cliente' : 'clientes'}</div>
          {due.map(r => {
            const wa = waNumber(r.customer.phone);
            const contacted = r.customer.last_contacted_at && monthsSince(r.customer.last_contacted_at) < 1;
            return (
              <div key={r.customer.id} className="card flex flex-wrap items-center gap-3">
                <div className="h-11 w-11 rounded-full bg-brand-500/10 grid place-items-center text-brand-600 font-bold shrink-0">
                  {r.customer.full_name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-[180px]">
                  <div className="font-bold text-steel-900">{r.customer.full_name}</div>
                  <div className="text-xs text-steel-500">
                    Último serviço: <Link to={`/oficina/os/${r.osId}`} className="hover:underline">{r.title}</Link>
                    {r.vehicle && ` · ${r.vehicle.make} ${r.vehicle.model}`} · há {timeLabel(monthsSince(r.date))}
                  </div>
                  {contacted && <div className="text-[11px] text-signal-700 mt-0.5">✓ Contatado em {new Date(r.customer.last_contacted_at!).toLocaleDateString('pt-BR')}</div>}
                </div>
                <div className="flex gap-2 shrink-0">
                  {wa ? (
                    <a href={`https://wa.me/${wa}?text=${encodeURIComponent(message(r))}`} target="_blank" rel="noopener noreferrer"
                      onClick={() => markContacted(r)} className="btn-primary text-sm !py-2 !bg-signal-500">
                      💬 WhatsApp
                    </a>
                  ) : (
                    <span className="text-xs text-steel-400 self-center">Sem telefone</span>
                  )}
                  <button onClick={() => optOut(r)} className="btn-ghost text-xs !py-2 text-steel-500" title="Cliente não quer receber mensagens">
                    🚫 Não quer contato
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
