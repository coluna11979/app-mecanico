import { Link } from 'react-router-dom';
import { fmtBRL } from '@/components/os/osHelpers';
import { daysToRemind, type RecFollow } from '@/lib/recsFollowUp';

const car = (r: RecFollow) => [[r.vehicle?.make, r.vehicle?.model].filter(Boolean).join(' '), r.vehicle?.plate].filter(Boolean).join(' · ');
const dm = (d: Date) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

/** Nova OS já com o cliente, o veículo e o serviço lembrado */
export const newOsForRec = (r: RecFollow) => {
  const p = new URLSearchParams({ nova: '1' });
  if (r.customer_id) p.set('cliente', r.customer_id);
  if (r.vehicle_id) p.set('veiculo', r.vehicle_id);
  p.set('servico', r.name);
  return `/oficina/os?${p.toString()}`;
};

/** Selo da data de lembrar: vencida (vermelho), até 7 dias (âmbar), depois (cinza) */
function RemindBadge({ r }: { r: RecFollow }) {
  const d = daysToRemind(r);
  if (d == null || !r.remind) return <span className="text-[10px] text-steel-400">sem data</span>;
  const cls = d < 0 ? 'bg-alert-100 text-alert-700' : d <= 7 ? 'bg-pending-100 text-pending-800' : 'bg-steel-100 text-steel-600';
  const label = d < 0 ? `venceu ${dm(r.remind)}` : d === 0 ? 'lembrar hoje' : d === 1 ? 'lembrar amanhã' : `lembrar ${dm(r.remind)}`;
  return <span className={`text-[10px] font-bold rounded-full px-2 py-0.5 ${cls}`}>{label}</span>;
}

type Handlers = {
  canOpenOs: boolean;
  onWa: (r: RecFollow) => void;
  onDone: (r: RecFollow) => void;
  onDismiss: (r: RecFollow) => void;
};

/** Card da coluna "Lembrar depois" */
export function RecCard({ r, h }: { r: RecFollow; h: Handlers }) {
  return (
    <div className="bg-white rounded-xl ring-1 ring-steel-200/70 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-steel-900 truncate">{r.customer?.full_name ?? 'Cliente avulso'}</div>
          <div className="text-xs text-steel-500 truncate">{car(r) || 'Veículo não informado'}</div>
        </div>
        <RemindBadge r={r} />
      </div>
      <div className="mt-2 text-sm font-medium text-steel-800 leading-snug">{r.name}</div>
      <div className="mt-1 text-[15px] font-bold text-steel-900 tabular-nums">
        {r.price ? fmtBRL(r.price) : <span className="text-xs font-semibold text-steel-400">sem valor orçado</span>}
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1">
        {r.customer?.phone && (
          <button type="button" onClick={() => h.onWa(r)} className="text-xs font-bold text-emerald-700 hover:underline min-h-[32px]">💬 WhatsApp</button>
        )}
        {h.canOpenOs && <Link to={newOsForRec(r)} className="text-xs font-bold text-brand-700 hover:underline min-h-[32px] inline-flex items-center">➕ Nova OS</Link>}
        <button type="button" onClick={() => h.onDone(r)} className="text-xs font-semibold text-signal-700 hover:underline min-h-[32px]">✓ Feito</button>
        <button type="button" onClick={() => h.onDismiss(r)} className="text-xs text-steel-400 hover:text-alert-600 min-h-[32px]">Descartar</button>
      </div>
    </div>
  );
}

/** Linha da lista (etapa "Lembrar depois") */
export function RecRow({ r, h }: { r: RecFollow; h: Handlers }) {
  return (
    <li className="px-5 py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
      <div className="flex-1 min-w-0 space-y-1">
        <div className="text-sm font-semibold truncate">{r.customer?.full_name ?? 'Cliente avulso'} <span className="font-normal text-steel-500">· {r.name}</span></div>
        <div className="text-[11px] text-steel-400 flex flex-wrap items-center gap-x-2">
          <RemindBadge r={r} />
          <span>{car(r) || 'Veículo não informado'}</span>
          <span>· anotado em {new Date(r.recommended_at).toLocaleDateString('pt-BR')}</span>
        </div>
      </div>
      <div className="text-sm font-bold shrink-0">{r.price ? fmtBRL(r.price) : <span className="text-xs text-steel-400">sem valor</span>}</div>
      <div className="flex flex-wrap gap-2 shrink-0">
        {r.customer?.phone && <button type="button" onClick={() => h.onWa(r)} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-[#25D366] text-white">WhatsApp</button>}
        {h.canOpenOs && <Link to={newOsForRec(r)} className="btn-primary text-xs !py-1.5">Nova OS</Link>}
        <button type="button" onClick={() => h.onDone(r)} className="btn-secondary text-xs !py-1.5">✓ Feito</button>
        <button type="button" onClick={() => h.onDismiss(r)} className="btn-ghost text-xs !py-1.5">Descartar</button>
      </div>
    </li>
  );
}
