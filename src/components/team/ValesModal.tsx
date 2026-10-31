import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from '@/components/ui/Toast';
import { fmtBRL } from '@/components/os/osHelpers';
import { fmtDate } from '@/lib/purchasing';
import { fmtCompetence } from '@/lib/payableForms';
import { loadVales, type ValeItem } from '@/lib/payroll';
import BankValeModal from '@/components/team/BankValeModal';

/**
 * Vales do mês de um colaborador. Os pagos pelo banco/PIX podem ser corrigidos ou excluídos aqui;
 * os de dinheiro do Caixa se corrigem estornando no Caixa (Movimentações). Com a folha já fechada, só consulta.
 */
export default function ValesModal({ wid, competence, mechanic, team, locked, onClose, onChanged }: {
  wid: string; competence: string; mechanic: { id: string; name: string }; team: { id: string; name: string }[];
  /** Folha do mês já fechada: o desconto está gravado, então não dá para mexer nos vales */
  locked: boolean; onClose: () => void; onChanged: () => void;
}) {
  const [items, setItems] = useState<ValeItem[] | null>(null);
  const [editing, setEditing] = useState<ValeItem | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => setItems(await loadVales(wid, competence, mechanic.id)), [wid, competence, mechanic.id]);
  useEffect(() => { load(); }, [load]);

  async function remove(v: ValeItem) {
    if (!confirm(`Excluir o vale de ${fmtBRL(v.amount)} de ${fmtDate(v.date)}? Ele deixa de ser descontado na folha.`)) return;
    setBusy(v.id);
    const un = await supabase.rpc('payable_unpay', { p_payable: v.id, p_session: null });
    if (un.error) { setBusy(null); return toast.error('Não foi possível excluir: ' + un.error.message); }
    const { error } = await supabase.from('payables').update({ cancelled_at: new Date().toISOString() }).eq('id', v.id);
    if (error) {
      await supabase.rpc('payable_pay', { p_payable: v.id, p_from: 'banco', p_paid_at: v.date, p_session: null });
      setBusy(null);
      return toast.error('Não foi possível excluir: ' + error.message);
    }
    setBusy(null);
    toast.success('Vale excluído');
    await load(); onChanged();
  }

  const total = (items ?? []).reduce((a, v) => a + v.amount, 0);

  return (
    <>
      <div className="fixed inset-0 z-50 bg-steel-900/60 grid place-items-center p-4" onClick={onClose}>
        <div className="bg-white rounded-3xl w-full max-w-md max-h-[92vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold">Vales de {mechanic.name}</h2>
              <p className="text-sm text-steel-500 mt-0.5 capitalize">{fmtCompetence(competence)}</p>
            </div>
            <button onClick={onClose} className="text-steel-400 hover:text-steel-700 text-xl leading-none" aria-label="Fechar">×</button>
          </div>

          {locked && (
            <p className="text-xs bg-pending-50 border border-pending-200 text-pending-900 rounded-xl px-3 py-2 mt-3">
              A folha deste mês já está fechada, então os vales só podem ser consultados. Para corrigir, reabra a folha do colaborador.
            </p>
          )}

          {items === null ? (
            <div className="h-24 bg-steel-50 rounded-xl animate-pulse mt-4" />
          ) : items.length === 0 ? (
            <p className="text-sm text-steel-400 text-center py-8">Nenhum vale neste mês.</p>
          ) : (
            <ul className="mt-4 divide-y divide-steel-100">
              {items.map(v => (
                <li key={`${v.source}-${v.id}`} className="py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold">{fmtDate(v.date)} <span className="badge bg-steel-100 text-steel-600 ml-1">{v.source === 'caixa' ? '💵 Caixa' : '🏦 Banco/PIX'}</span></div>
                      {v.note && <div className="text-xs text-steel-500 mt-0.5 break-words">{v.note}</div>}
                    </div>
                    <div className="text-base font-bold tabular-nums shrink-0 text-alert-600">− {fmtBRL(v.amount)}</div>
                  </div>
                  {v.source === 'banco' && !locked && (
                    <div className="flex gap-2 mt-2">
                      <button className="btn-secondary text-xs !py-1.5 !px-3" disabled={busy === v.id} onClick={() => setEditing(v)}>✏️ Corrigir</button>
                      <button className="btn-ghost text-xs !py-1.5 !px-3 border border-steel-200 text-alert-600" disabled={busy === v.id} onClick={() => remove(v)}>
                        {busy === v.id ? 'Excluindo…' : '🗑 Excluir'}
                      </button>
                    </div>
                  )}
                  {v.source === 'caixa' && !locked && (
                    <p className="text-[11px] text-steel-400 mt-1.5">Vale do Caixa: para corrigir, estorne em Caixa → Movimentações e lance de novo.</p>
                  )}
                </li>
              ))}
              <li className="py-3 flex items-baseline justify-between font-bold text-sm">
                <span>Total de vales no mês</span><span className="tabular-nums text-alert-600">− {fmtBRL(total)}</span>
              </li>
            </ul>
          )}

          <button onClick={onClose} className="btn-ghost w-full mt-4">Fechar</button>
        </div>
      </div>

      {editing && (
        <BankValeModal wid={wid} team={team} edit={{ id: editing.id, mechanicId: editing.mechanicId, amount: editing.amount, date: editing.date, note: editing.note }}
          onClose={() => setEditing(null)} onDone={() => { setEditing(null); load(); onChanged(); }} />
      )}
    </>
  );
}
