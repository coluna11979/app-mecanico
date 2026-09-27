import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from '@/components/ui/Toast';
import {
  ABSENCE_REASONS, absenceDays, fmtDay, isoToday, returnStatus,
  type Absence, type AbsenceReason,
} from '@/lib/team';
import type { TeamStatus } from '@/types/database';

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00`); d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * Afastamento do colaborador: registrar saída (motivo, data, previsão de retorno),
 * registrar o retorno (data real) e ver o histórico.
 */
export default function AbsencePanel({ workshopId, mechanicId, status, userId, onStatusChange }: {
  workshopId: string; mechanicId: string; status: TeamStatus; userId: string | null;
  onStatusChange: (s: TeamStatus) => void;
}) {
  const [list, setList] = useState<Absence[]>([]);
  const [mode, setMode] = useState<'none' | 'new' | 'return' | 'edit'>('none');
  const [busy, setBusy] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [form, setForm] = useState({ reason: 'vacation' as AbsenceReason, started_on: isoToday(), expected_return: '', notes: '' });
  const [returnOn, setReturnOn] = useState(isoToday());

  const load = useCallback(async () => {
    const { data } = await supabase.from('workshop_mechanic_absences').select('*')
      .eq('mechanic_id', mechanicId).order('started_on', { ascending: false });
    setList((data as Absence[]) ?? []);
  }, [mechanicId]);
  useEffect(() => { load(); }, [load]);

  const open = list.find(a => !a.returned_on) ?? null;
  const past = list.filter(a => a.returned_on);

  async function setMechStatus(s: TeamStatus) {
    const { error } = await supabase.from('workshop_mechanics').update({ status: s, active: s === 'active' }).eq('id', mechanicId);
    if (error) throw error;
    onStatusChange(s);
  }

  async function register() {
    if (form.expected_return && form.expected_return < form.started_on) { toast.error('A previsão de retorno é antes da saída.'); return; }
    setBusy(true);
    try {
      const { error } = await supabase.from('workshop_mechanic_absences').insert({
        workshop_id: workshopId, mechanic_id: mechanicId, reason: form.reason,
        started_on: form.started_on, expected_return: form.expected_return || null,
        notes: form.notes.trim() || null, created_by: userId,
      });
      if (error) throw error;
      await setMechStatus('away');
      toast.success('Afastamento registrado');
      setMode('none');
      load();
    } catch (e: any) {
      toast.error('Não foi possível registrar: ' + (e?.message ?? 'erro'));
    } finally { setBusy(false); }
  }

  async function registerReturn() {
    if (!open) { // marcado como afastado sem registro de datas (cadastro antigo)
      setBusy(true);
      try { await setMechStatus('active'); toast.success('Retorno registrado'); setMode('none'); }
      catch (e: any) { toast.error(e?.message ?? 'erro'); } finally { setBusy(false); }
      return;
    }
    if (returnOn < open.started_on) { toast.error('A data de retorno é antes da saída.'); return; }
    setBusy(true);
    try {
      const { error } = await supabase.from('workshop_mechanic_absences').update({ returned_on: returnOn }).eq('id', open.id);
      if (error) throw error;
      await setMechStatus('active');
      toast.success('Bem-vindo de volta! Retorno registrado ✓');
      setMode('none');
      load();
    } catch (e: any) {
      toast.error('Não foi possível registrar o retorno: ' + (e?.message ?? 'erro'));
    } finally { setBusy(false); }
  }

  async function saveEdit() {
    if (!open) return;
    setBusy(true);
    const { error } = await supabase.from('workshop_mechanic_absences').update({
      reason: form.reason, started_on: form.started_on, expected_return: form.expected_return || null, notes: form.notes.trim() || null,
    }).eq('id', open.id);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Afastamento atualizado');
    setMode('none');
    load();
  }

  async function remove(a: Absence) {
    if (!confirm('Excluir este registro de afastamento?')) return;
    const { error } = await supabase.from('workshop_mechanic_absences').delete().eq('id', a.id);
    if (error) { toast.error(error.message); return; }
    if (!a.returned_on && status === 'away') await setMechStatus('active').catch(() => {});
    load();
  }

  if (status === 'terminated' && !list.length) return null;

  const rs = open ? returnStatus(open) : null;

  return (
    <div className={`card mb-4 ${status === 'away' ? '!bg-pending-50 border border-pending-200' : ''}`}>
      {/* Situação atual */}
      {status === 'away' ? (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-pending-800">Afastado</div>
            {open ? (
              <>
                <div className="font-bold text-steel-900 mt-0.5">{ABSENCE_REASONS[open.reason].icon} {ABSENCE_REASONS[open.reason].label}</div>
                <div className="text-sm text-steel-700 mt-0.5">
                  Desde <strong>{fmtDay(open.started_on)}</strong> ({absenceDays(open)} dia{absenceDays(open) === 1 ? '' : 's'})
                  {' · '}Previsão de retorno: <strong>{fmtDay(open.expected_return)}</strong>
                </div>
                {rs && <div className={`text-xs font-semibold mt-1 ${rs.late ? 'text-alert-700' : 'text-pending-800'}`}>{rs.late ? '⚠️ ' : '📅 '}{rs.text}</div>}
                {open.notes && <div className="text-xs text-steel-600 mt-1">📝 {open.notes}</div>}
              </>
            ) : (
              <div className="text-sm text-steel-700 mt-0.5">Marcado como afastado, mas sem datas registradas.</div>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => { setReturnOn(isoToday()); setMode(mode === 'return' ? 'none' : 'return'); }}
              className="btn-primary text-sm !py-2 !bg-signal-600">✅ Registrar retorno</button>
            {open && (
              <button type="button" onClick={() => {
                setForm({ reason: open.reason, started_on: open.started_on, expected_return: open.expected_return ?? '', notes: open.notes ?? '' });
                setMode(mode === 'edit' ? 'none' : 'edit');
              }} className="btn-ghost text-sm !py-2 border border-steel-200 bg-white">✏️ Editar</button>
            )}
          </div>
        </div>
      ) : status === 'active' ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-steel-500">Afastamentos</div>
            <div className="text-sm text-steel-600">
              {past.length
                ? `${past.length} afastamento${past.length === 1 ? '' : 's'} registrado${past.length === 1 ? '' : 's'} · último: ${ABSENCE_REASONS[past[0].reason].label.toLowerCase()} (${fmtDay(past[0].started_on)} a ${fmtDay(past[0].returned_on)})`
                : 'Férias, atestado, INSS, licença… registre para acompanhar no relatório da equipe.'}
            </div>
          </div>
          <button type="button" onClick={() => {
            setForm({ reason: 'vacation', started_on: isoToday(), expected_return: '', notes: '' });
            setMode(mode === 'new' ? 'none' : 'new');
          }} className="btn-ghost text-sm !py-2 border border-pending-300 text-pending-800">🏖️ Registrar afastamento</button>
        </div>
      ) : (
        <div className="text-[10px] font-bold uppercase tracking-widest text-steel-500">Histórico de afastamentos</div>
      )}

      {/* Registrar retorno */}
      {mode === 'return' && (
        <div className="mt-3 bg-white border border-signal-200 rounded-xl p-3 flex flex-wrap items-end gap-3">
          <div>
            <div className="label !mb-1">Data do retorno</div>
            <input type="date" className="input !py-1.5 !w-auto" value={returnOn} min={open?.started_on} onChange={e => setReturnOn(e.target.value)} />
          </div>
          {open && returnOn >= open.started_on && (
            <div className="text-xs text-steel-600 pb-2">Total: <strong>{absenceDays({ started_on: open.started_on, returned_on: returnOn })} dias</strong> afastado</div>
          )}
          <button type="button" onClick={registerReturn} disabled={busy} className="btn-primary text-sm !py-2 !bg-signal-600">Confirmar retorno</button>
          <button type="button" onClick={() => setMode('none')} className="btn-ghost text-sm !py-2">Cancelar</button>
        </div>
      )}

      {/* Registrar / editar afastamento */}
      {(mode === 'new' || mode === 'edit') && (
        <div className="mt-3 bg-white border border-pending-200 rounded-xl p-3 space-y-3">
          <div>
            <div className="label !mb-1">Motivo</div>
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(ABSENCE_REASONS) as AbsenceReason[]).map(r => (
                <button type="button" key={r} onClick={() => setForm(f => ({ ...f, reason: r }))}
                  className={`text-xs px-3 py-1.5 rounded-full border transition ${form.reason === r ? 'bg-pending-600 text-white border-pending-600' : 'bg-white text-steel-600 border-steel-200 hover:border-pending-300'}`}>
                  {ABSENCE_REASONS[r].icon} {ABSENCE_REASONS[r].label}
                </button>
              ))}
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <div className="label !mb-1">Data do afastamento *</div>
              <input type="date" className="input" value={form.started_on} onChange={e => setForm(f => ({ ...f, started_on: e.target.value }))} />
            </div>
            <div>
              <div className="label !mb-1">Previsão de retorno</div>
              <input type="date" className="input" value={form.expected_return} min={form.started_on}
                onChange={e => setForm(f => ({ ...f, expected_return: e.target.value }))} />
              <div className="flex gap-2 mt-1 text-xs">
                {[7, 15, 30].map(n => (
                  <button type="button" key={n} onClick={() => setForm(f => ({ ...f, expected_return: addDays(f.started_on, n) }))}
                    className="text-brand-600 hover:underline">+{n} dias</button>
                ))}
                <button type="button" onClick={() => setForm(f => ({ ...f, expected_return: '' }))} className="text-steel-500 hover:underline">sem previsão</button>
              </div>
            </div>
          </div>
          <div>
            <div className="label !mb-1">Observação</div>
            <input className="input" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder={form.reason === 'medical' ? 'Ex.: atestado de 5 dias — CID não é necessário' : 'Opcional'} />
          </div>
          <p className="text-[11px] text-steel-500">🔒 Só o dono da oficina vê os afastamentos. Enquanto afastado, o colaborador não aparece para escolher em novas OS.</p>
          <div className="flex gap-2">
            <button type="button" onClick={mode === 'new' ? register : saveEdit} disabled={busy || !form.started_on}
              className="btn-primary text-sm !py-2">{busy ? 'Salvando…' : mode === 'new' ? 'Registrar afastamento' : 'Salvar alterações'}</button>
            <button type="button" onClick={() => setMode('none')} className="btn-ghost text-sm !py-2">Cancelar</button>
          </div>
        </div>
      )}

      {/* Histórico */}
      {past.length > 0 && (
        <div className="mt-3 pt-3 border-t border-steel-200/70">
          <button type="button" onClick={() => setShowHistory(v => !v)} className="text-xs font-semibold text-steel-600 hover:text-steel-900">
            {showHistory ? '▾' : '▸'} Histórico ({past.length}) · {past.reduce((a, x) => a + absenceDays(x), 0)} dias no total
          </button>
          {showHistory && (
            <ul className="mt-2 space-y-1.5">
              {past.map(a => (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 text-sm bg-white rounded-lg px-3 py-2 border border-steel-100">
                  <span>
                    {ABSENCE_REASONS[a.reason].icon} <strong>{ABSENCE_REASONS[a.reason].label}</strong>
                    <span className="text-steel-500"> · {fmtDay(a.started_on)} → {fmtDay(a.returned_on)} · {absenceDays(a)} dias</span>
                    {a.expected_return && a.returned_on && a.returned_on > a.expected_return && (
                      <span className="text-xs text-alert-600"> · voltou {Math.round((new Date(`${a.returned_on}T00:00:00`).getTime() - new Date(`${a.expected_return}T00:00:00`).getTime()) / 86400000)} dia(s) depois do previsto</span>
                    )}
                    {a.notes && <span className="block text-xs text-steel-500">📝 {a.notes}</span>}
                  </span>
                  <button type="button" onClick={() => remove(a)} className="text-xs text-steel-400 hover:text-alert-600">Excluir</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
