import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

interface FeeRow {
  job_id: string;
  title: string;
  workshop_id: string | null;
  workshop_name: string | null;
  fee: number;
  cancelled_at: string | null;
  cancelled_by: string | null;
  cancellation_reason: string | null;
  paid_at: string | null;
  waived_at: string | null;
  waived_reason: string | null;
}

const fmtMoney = (v: number) => Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';

export function CancellationFeesPanel() {
  const [rows, setRows] = useState<FeeRow[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [waiving, setWaiving] = useState<FeeRow | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    const { data, error } = await supabase.rpc('admin_cancellation_fees');
    if (error) { setErr(error.message); return; }
    setRows((data ?? []) as FeeRow[]);
  }
  useEffect(() => { load(); }, []);

  const open = rows.filter(r => !r.paid_at && !r.waived_at);
  const history = rows.filter(r => r.paid_at || r.waived_at);
  const openTotal = open.reduce((s, r) => s + Number(r.fee), 0);

  if (err) return <div className="mb-6 text-sm text-alert-700 bg-alert-50 border border-alert-200 rounded-xl px-4 py-3">{err}</div>;
  if (rows.length === 0) return null;

  return (
    <div className="card mb-6">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <div>
          <h2 className="font-bold text-steel-900">Multas de cancelamento</h2>
          <p className="text-xs text-steel-500 mt-0.5">
            {open.length > 0
              ? <>{open.length} em aberto · <b className="text-alert-700">R$ {fmtMoney(openTotal)}</b> — a oficina fica bloqueada de publicar demandas até pagar ou você cancelar.</>
              : 'Nenhuma multa em aberto.'}
          </p>
        </div>
        {history.length > 0 && (
          <button onClick={() => setShowHistory(v => !v)} className="text-xs font-semibold text-steel-500 hover:text-steel-800 underline">
            {showHistory ? 'ocultar histórico' : `ver histórico (${history.length})`}
          </button>
        )}
      </div>

      {open.length > 0 && (
        <div className="divide-y divide-steel-100 border border-steel-200 rounded-xl">
          {open.map(r => (
            <div key={r.job_id} className="flex items-start gap-3 px-3 py-2.5 flex-wrap sm:flex-nowrap">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-steel-800 truncate">{r.workshop_name ?? 'Oficina'} · {r.title}</div>
                <div className="text-xs text-steel-500 mt-0.5">
                  Cancelado {fmtDate(r.cancelled_at)} por {r.cancelled_by === 'workshop' ? 'oficina' : r.cancelled_by === 'mechanic' ? 'mecânico' : (r.cancelled_by ?? '—')}
                  {r.cancellation_reason && <> · “{r.cancellation_reason}”</>}
                </div>
              </div>
              <div className="font-display font-bold text-alert-700 shrink-0">R$ {fmtMoney(r.fee)}</div>
              <button onClick={() => setWaiving(r)}
                className="shrink-0 text-xs font-bold px-3 py-1.5 rounded-lg border border-steel-300 text-steel-700 hover:bg-steel-50">
                Cancelar multa
              </button>
            </div>
          ))}
        </div>
      )}

      {showHistory && history.length > 0 && (
        <div className="mt-3 divide-y divide-steel-100 border border-steel-200 rounded-xl">
          {history.map(r => (
            <div key={r.job_id} className="flex items-start gap-3 px-3 py-2 text-sm">
              <div className="flex-1 min-w-0">
                <div className="text-steel-700 truncate">{r.workshop_name ?? 'Oficina'} · {r.title}</div>
                {r.waived_at && r.waived_reason && <div className="text-xs text-steel-500">Motivo: {r.waived_reason}</div>}
              </div>
              <div className="text-steel-500 shrink-0">R$ {fmtMoney(r.fee)}</div>
              {r.waived_at
                ? <span className="badge bg-steel-100 text-steel-600 shrink-0">Cancelada {fmtDate(r.waived_at)}</span>
                : <span className="badge bg-signal-100 text-signal-700 shrink-0">Paga {fmtDate(r.paid_at)}</span>}
            </div>
          ))}
        </div>
      )}

      {waiving && (
        <WaiveModal row={waiving} onClose={() => setWaiving(null)} onDone={() => { setWaiving(null); load(); }} />
      )}
    </div>
  );
}

function WaiveModal({ row, onClose, onDone }: { row: FeeRow; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function confirm() {
    if (!reason.trim()) { setErr('Informe o motivo.'); return; }
    setSaving(true); setErr(null);
    const { error } = await supabase.rpc('admin_waive_cancellation_fee', { p_job_id: row.job_id, p_reason: reason.trim() });
    if (error) { setErr(error.message); setSaving(false); return; }
    onDone();
  }

  return (
    <div className="fixed inset-0 bg-steel-900/60 z-50 grid place-items-center p-4" onClick={() => !saving && onClose()}>
      <div className="bg-white rounded-2xl max-w-md w-full p-5 space-y-4" onClick={e => e.stopPropagation()}>
        <div>
          <h3 className="text-lg font-bold text-steel-900">Cancelar multa de R$ {fmtMoney(row.fee)}?</h3>
          <p className="text-sm text-steel-600 mt-1">
            {row.workshop_name ?? 'A oficina'} deixa de dever essa multa e volta a poder publicar demandas.
            Uma mensagem avisando fica registrada na conversa da demanda.
          </p>
        </div>
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wider text-steel-500">Motivo (fica no histórico)</span>
          <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} autoFocus
            placeholder="Ex.: cancelamento combinado com o mecânico, falha no app…"
            className="mt-1 w-full px-3 py-2 border border-steel-200 rounded-lg text-sm resize-none" />
        </label>
        {err && <p className="text-sm text-alert-700 bg-alert-50 border border-alert-200 rounded-lg px-3 py-2">{err}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} disabled={saving} className="px-4 py-2 rounded-xl text-sm font-semibold text-steel-700 hover:bg-steel-100">Voltar</button>
          <button onClick={confirm} disabled={saving}
            className="px-4 py-2 rounded-xl text-sm font-bold bg-brand-500 hover:bg-brand-600 text-white disabled:opacity-50">
            {saving ? 'Cancelando…' : 'Cancelar multa'}
          </button>
        </div>
      </div>
    </div>
  );
}
