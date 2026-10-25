import { Link } from 'react-router-dom';
import { fmtBRL } from '@/components/os/osHelpers';
import { daysToRemind, type ClientRecs, type RecFollow } from '@/lib/recsFollowUp';

const dm = (d: Date) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

/** Nova OS já com o cliente, o veículo (se for um só) e todos os serviços lembrados */
export const newOsForClient = (g: ClientRecs) => {
  const p = new URLSearchParams({ nova: '1' });
  if (g.customer_id) p.set('cliente', g.customer_id);
  const vehicles = [...new Set(g.items.map(i => i.vehicle_id).filter(Boolean))] as string[];
  if (vehicles.length === 1) p.set('veiculo', vehicles[0]);
  for (const i of g.items) p.append('servico', i.name);
  return `/oficina/os?${p.toString()}`;
};

/** Selo da data de lembrar: vencida (vermelho), até 7 dias (âmbar), depois (cinza) */
function RemindBadge({ remind }: { remind: Date | null }) {
  const d = daysToRemind({ remind });
  if (d == null || !remind) return <span className="text-[10px] text-steel-400">sem data</span>;
  const cls = d < 0 ? 'bg-alert-100 text-alert-700' : d <= 7 ? 'bg-pending-100 text-pending-800' : 'bg-steel-100 text-steel-600';
  const label = d < 0 ? `venceu ${dm(remind)}` : d === 0 ? 'lembrar hoje' : d === 1 ? 'lembrar amanhã' : `lembrar ${dm(remind)}`;
  return <span className={`shrink-0 text-[10px] font-bold rounded-full px-2 py-0.5 ${cls}`}>{label}</span>;
}

export type RecHandlers = {
  canOpenOs: boolean;
  onWa: (g: ClientRecs) => void;
  onDone: (r: RecFollow) => void;
  onDismiss: (r: RecFollow) => void;
};

/** Serviços do cliente, cada um com valor, data e ✓ / ✕ */
function Items({ g, h }: { g: ClientRecs; h: RecHandlers }) {
  return (
    <ul className="space-y-1.5">
      {g.items.map(r => (
        <li key={r.id} className="flex items-start gap-2 text-sm">
          <div className="flex-1 min-w-0">
            <div className="text-steel-800 leading-snug">{r.name}</div>
            <div className="text-[11px] text-steel-400 flex flex-wrap items-center gap-x-2">
              <span>{r.price ? fmtBRL(r.price) : 'sem valor orçado'}</span>
              {g.items.length > 1 && r.remind && <span>· {dm(r.remind)}</span>}
            </div>
          </div>
          <button type="button" onClick={() => h.onDone(r)} title="Marcar como feito" aria-label={`Marcar ${r.name} como feito`}
            className="h-8 w-8 shrink-0 rounded-lg grid place-items-center text-signal-700 hover:bg-signal-50">✓</button>
          <button type="button" onClick={() => h.onDismiss(r)} title="Descartar" aria-label={`Descartar ${r.name}`}
            className="h-8 w-8 shrink-0 rounded-lg grid place-items-center text-steel-400 hover:text-alert-600 hover:bg-alert-50">✕</button>
        </li>
      ))}
    </ul>
  );
}

/** Card da coluna "Lembrar depois": um por cliente */
export function ClientCard({ g, h }: { g: ClientRecs; h: RecHandlers }) {
  return (
    <div className="bg-white rounded-xl ring-1 ring-steel-200/70 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-steel-900 truncate">{g.customer?.full_name ?? 'Cliente avulso'}</div>
          <div className="text-xs text-steel-500 truncate">{g.cars.join(' · ') || 'Veículo não informado'}</div>
        </div>
        <RemindBadge remind={g.nextRemind} />
      </div>
      <div className="mt-2.5"><Items g={g} h={h} /></div>
      <div className="mt-2.5 pt-2 border-t border-steel-100 flex items-baseline justify-between gap-2">
        <span className="text-[11px] text-steel-500">{g.items.length} {g.items.length === 1 ? 'serviço' : 'serviços'}</span>
        <span className="text-[15px] font-bold text-steel-900 tabular-nums">
          {g.total > 0 ? fmtBRL(g.total) : <span className="text-xs font-semibold text-steel-400">sem valor</span>}
        </span>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1">
        {g.customer?.phone && (
          <button type="button" onClick={() => h.onWa(g)} className="text-xs font-bold text-emerald-700 hover:underline min-h-[32px]">💬 WhatsApp</button>
        )}
        {h.canOpenOs && <Link to={newOsForClient(g)} className="text-xs font-bold text-brand-700 hover:underline min-h-[32px] inline-flex items-center">➕ Nova OS com tudo</Link>}
      </div>
    </div>
  );
}

/** Linha da lista (etapa "Lembrar depois"): um cliente por linha */
export function ClientRow({ g, h }: { g: ClientRecs; h: RecHandlers }) {
  return (
    <li className="px-5 py-3 flex flex-col lg:flex-row lg:items-start gap-3 lg:gap-6">
      <div className="lg:w-64 shrink-0 space-y-1">
        <div className="text-sm font-semibold truncate">{g.customer?.full_name ?? 'Cliente avulso'}</div>
        <div className="text-[11px] text-steel-400 truncate">{g.cars.join(' · ') || 'Veículo não informado'}</div>
        <RemindBadge remind={g.nextRemind} />
      </div>
      <div className="flex-1 min-w-0"><Items g={g} h={h} /></div>
      <div className="lg:text-right shrink-0">
        <div className="text-sm font-bold">{g.total > 0 ? fmtBRL(g.total) : <span className="text-xs text-steel-400">sem valor</span>}</div>
        <div className="mt-2 flex flex-wrap lg:justify-end gap-2">
          {g.customer?.phone && <button type="button" onClick={() => h.onWa(g)} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-[#25D366] text-white">WhatsApp</button>}
          {h.canOpenOs && <Link to={newOsForClient(g)} className="btn-primary text-xs !py-1.5">Nova OS com tudo</Link>}
        </div>
      </div>
    </li>
  );
}
