import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { toast } from '@/components/ui/Toast';
import { parseMoney } from '@/components/os/osHelpers';
import { fmtQty, type WorkshopPart } from '@/lib/parts';
import { fmtDate, type StockMovement } from '@/lib/purchasing';
import { osLabel } from '@/lib/stock';

export type MoveMode = 'entrada' | 'saida' | 'ajuste';

const MODE: Record<MoveMode, { title: string; button: string; reasons: string[] }> = {
  entrada: { title: 'Entrada manual', button: 'Registrar entrada', reasons: ['Devolução de cliente', 'Peça encontrada na contagem', 'Troca com fornecedor', 'Estoque inicial'] },
  saida:   { title: 'Saída manual',   button: 'Registrar saída',   reasons: ['Perda / avaria', 'Garantia', 'Uso interno', 'Devolução ao fornecedor'] },
  ajuste:  { title: 'Ajustar estoque', button: 'Salvar contagem',  reasons: ['Contagem de estoque'] },
};

function Sheet({ title, onClose, children, footer }: { title: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-steel-900/60 z-50 flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl max-h-[94vh] flex flex-col shadow-2xl">
        <div className="px-6 pt-5 pb-3 border-b border-steel-100 flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold truncate">{title}</h2>
          <button type="button" onClick={onClose} className="h-8 w-8 shrink-0 rounded-lg grid place-items-center text-steel-500 hover:bg-steel-100">✕</button>
        </div>
        <div className="px-6 py-4 space-y-4 overflow-y-auto">{children}</div>
        {footer && <div className="px-6 py-4 border-t border-steel-100 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}

/**
 * Entrada, saída ou contagem manual. Usa o ajuste de estoque que já existe (fica no histórico como "Ajuste"):
 * não mexe em custo, nota nem contas a pagar.
 */
export function StockMoveModal({ part, mode, canBuy, onClose, onSaved }: {
  part: WorkshopPart; mode: MoveMode; canBuy: boolean; onClose: () => void; onSaved: () => void;
}) {
  const cfg = MODE[mode];
  const [n, setN] = useState(mode === 'ajuste' ? fmtQty(Math.max(0, Number(part.stock_qty))) : '1');
  const [reason, setReason] = useState(cfg.reasons[0]);
  const [other, setOther] = useState('');
  const [saving, setSaving] = useState(false);

  const v = parseMoney(n || '0');
  const current = Number(part.stock_qty);
  const next = mode === 'entrada' ? current + v : mode === 'saida' ? current - v : v;
  const valid = Number.isFinite(v) && (mode === 'ajuste' ? v >= 0 : v > 0);

  async function save() {
    if (!valid) return toast.error('Quantidade inválida');
    setSaving(true);
    // Lê o estoque de agora (alguém pode ter mexido depois que a tela abriu)
    const { data: fresh, error: e1 } = await supabase.from('workshop_parts').select('stock_qty').eq('id', part.id).single();
    if (e1 || !fresh) { setSaving(false); return toast.error('Não foi possível ler o estoque atual'); }
    const now = Number((fresh as { stock_qty: number }).stock_qty);
    const counted = mode === 'entrada' ? now + v : mode === 'saida' ? now - v : v;
    if (counted < 0) {
      setSaving(false);
      return toast.error(now < 0
        ? 'O estoque está negativo. Use “Ajustar estoque” e informe quantas unidades existem na prateleira.'
        : `Só há ${fmtQty(now)} ${part.unit} em estoque.`);
    }
    const why = reason === 'Outro' ? other.trim() || 'Outro' : reason;
    const note = mode === 'ajuste' ? why : `${mode === 'entrada' ? 'Entrada' : 'Saída'} manual: ${why}`;
    const { error } = await supabase.rpc('stock_adjust', { p_part: part.id, p_counted: counted, p_note: note });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(mode === 'ajuste' ? 'Estoque ajustado ✓' : mode === 'entrada' ? 'Entrada registrada ✓' : 'Saída registrada ✓');
    onSaved();
  }

  return (
    <Sheet title={cfg.title} onClose={onClose}
      footer={<>
        <button type="button" className="btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
        <button type="button" className="btn-primary" onClick={save} disabled={saving || !valid}>{saving ? 'Salvando…' : cfg.button}</button>
      </>}>
      <div>
        <div className="text-sm font-semibold">{part.name}</div>
        <div className="text-xs text-steel-500">Em estoque agora: <strong className={current < 0 ? 'text-alert-600' : 'text-steel-800'}>{fmtQty(current)} {part.unit}</strong></div>
      </div>

      {mode !== 'ajuste' && (
        <div className="rounded-xl bg-pending-50 border border-pending-100 px-3 py-2 text-xs text-pending-800">
          {mode === 'entrada'
            ? <>Entrada manual <strong>não substitui a nota de compra</strong> e <strong>não gera conta a pagar</strong> nem muda o custo.
                {canBuy && <> Comprou do fornecedor? <Link to={`/oficina/compras/nova?peca=${part.id}${part.supplier_id ? `&fornecedor=${part.supplier_id}` : ''}`} className="font-semibold underline">Lance a nota</Link>.</>}</>
            : <>Peça usada em OS <strong>sai sozinha</strong> quando a OS é concluída. Use a saída manual só para perda, garantia ou uso interno.</>}
        </div>
      )}

      <div>
        <label className="label">{mode === 'ajuste' ? `Quantas ${part.unit} existem na prateleira?` : `Quantidade (${part.unit})`}</label>
        <input className="input text-right text-lg" inputMode="decimal" autoFocus value={n} onChange={e => setN(e.target.value)} />
        {valid && <p className="text-[11px] text-steel-500 mt-1">Estoque passa de {fmtQty(current)} para <strong className={next < 0 ? 'text-alert-600' : ''}>{fmtQty(next)}</strong> {part.unit}.</p>}
      </div>

      {mode !== 'ajuste' && (
        <div>
          <label className="label">Motivo</label>
          <div className="flex flex-wrap gap-1.5">
            {[...cfg.reasons, 'Outro'].map(r => (
              <button key={r} type="button" onClick={() => setReason(r)}
                className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition ${reason === r ? 'bg-steel-900 text-white border-steel-900' : 'bg-white text-steel-600 border-steel-200'}`}>
                {r}
              </button>
            ))}
          </div>
          {reason === 'Outro' && <input className="input mt-2" placeholder="Descreva o motivo" value={other} onChange={e => setOther(e.target.value)} />}
        </div>
      )}
    </Sheet>
  );
}

const MOVE_LABEL: Record<StockMovement['kind'], string> = {
  compra: 'Compra', estorno_compra: 'Estorno de compra', os: 'Usada em OS', estorno_os: 'OS reaberta', ajuste: 'Ajuste manual',
};

/** Histórico completo de movimentações da peça */
export function StockHistoryModal({ part, onClose }: { part: WorkshopPart; onClose: () => void }) {
  const [moves, setMoves] = useState<(StockMovement & { so: { number: number | null } | null })[] | null>(null);
  useEffect(() => {
    supabase.from('stock_movements').select('*, so:service_orders(number)').eq('part_id', part.id)
      .order('created_at', { ascending: false }).limit(300)
      .then(({ data }) => setMoves((data as never) ?? []));
  }, [part.id]);

  return (
    <Sheet title={`Histórico · ${part.name}`} onClose={onClose}>
      <div className="text-xs text-steel-500">Em estoque agora: <strong className="text-steel-800">{fmtQty(part.stock_qty)} {part.unit}</strong></div>
      {moves === null ? (
        <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-10 bg-steel-50 rounded-xl animate-pulse" />)}</div>
      ) : moves.length === 0 ? (
        <p className="text-sm text-steel-500 text-center py-6">Nenhuma movimentação registrada ainda.</p>
      ) : (
        <ul className="divide-y divide-steel-100 text-sm">
          {moves.map(m => (
            <li key={m.id} className="py-2 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-medium">{MOVE_LABEL[m.kind]}</div>
                <div className="text-xs text-steel-500 break-words">
                  {fmtDate(m.created_at)}
                  {m.service_order_id && <> · <Link to={`/oficina/os/${m.service_order_id}`} className="text-brand-700 font-semibold">{osLabel(m.so?.number ?? null, m.service_order_id)}</Link></>}
                  {m.invoice_id && <> · <Link to={`/oficina/compras?nota=${m.invoice_id}`} className="text-brand-700 font-semibold">ver nota</Link></>}
                  {m.note && !m.service_order_id && <> · {m.note}</>}
                </div>
              </div>
              <span className={`shrink-0 font-semibold ${Number(m.qty) > 0 ? 'text-signal-700' : 'text-alert-600'}`}>
                {Number(m.qty) > 0 ? '+' : ''}{fmtQty(m.qty)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}
