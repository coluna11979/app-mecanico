import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from '@/components/ui/Toast';
import { fmtBRL } from '@/components/os/osHelpers';
import { isPlatformOnly, useWorkshopModules } from '@/lib/modules';

/**
 * Quanto a oficina cobrou do cliente por uma demanda (valor geral, opcional). Fica em
 * job_customer_charges, que só a oficina enxerga — o mecânico nunca vê.
 * Só para a oficina no pacote "Só mecânicos" (sem OS): quem usa a gestão completa tem o lucro pela OS.
 */

/** Valores cobrados da oficina, por demanda */
export async function loadCharges(workshopId: string): Promise<Map<string, number>> {
  const { data } = await supabase.from('job_customer_charges').select('job_id, amount').eq('workshop_id', workshopId);
  return new Map(((data ?? []) as { job_id: string; amount: number }[]).map(r => [r.job_id, Number(r.amount)]));
}

/** Grava (ou apaga, com null) o valor cobrado do cliente */
export async function saveCharge(workshopId: string, jobId: string, amount: number | null, userId?: string | null) {
  if (amount == null) {
    return supabase.from('job_customer_charges').delete().eq('job_id', jobId).eq('workshop_id', workshopId);
  }
  return supabase.from('job_customer_charges').upsert({
    job_id: jobId, workshop_id: workshopId, amount, updated_at: new Date().toISOString(), updated_by: userId ?? null,
  });
}

/** Campo "R$ ___ Salvar" (vazio apaga) */
export function ChargeInput({ initial, onSave, compact }: {
  initial: number | null; onSave: (amount: number | null) => Promise<boolean>; compact?: boolean;
}) {
  const [value, setValue] = useState(initial != null ? String(initial) : '');
  const [busy, setBusy] = useState(false);
  useEffect(() => { setValue(initial != null ? String(initial) : ''); }, [initial]);
  async function save() {
    const n = value.trim() === '' ? null : Number(value.replace(',', '.'));
    if (n != null && !(n >= 0)) return toast.error('Valor inválido');
    setBusy(true);
    await onSave(n);
    setBusy(false);
  }
  return (
    <div className="flex gap-2">
      <div className="relative flex-1 min-w-0">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-steel-400 text-sm">R$</span>
        <input className={`input !pl-9 ${compact ? '!h-10 text-sm' : ''}`} type="number" inputMode="decimal" min={0} step={0.01}
          placeholder="0,00" value={value} onChange={e => setValue(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); save(); } }} />
      </div>
      <button type="button" onClick={save} disabled={busy}
        className={`shrink-0 rounded-xl bg-steel-900 text-white font-bold active:scale-95 disabled:opacity-50 ${compact ? 'h-10 px-3 text-xs' : 'h-11 px-4 text-sm'}`}>
        {busy ? '…' : 'Salvar'}
      </button>
    </div>
  );
}

/** Na tela do serviço, depois de confirmar: "Quanto você cobrou do cliente?" (só você vê) */
export function CustomerChargeCard({ workshopId, jobId, paid, userId }: {
  workshopId: string; jobId: string; paid: number; userId?: string | null;
}) {
  const [amount, setAmount] = useState<number | null | undefined>(undefined);
  const [editing, setEditing] = useState(false);
  // Módulos da oficina da demanda (esta tela não usa o menu da oficina, então carrega aqui se precisar)
  const mods = useWorkshopModules();
  useEffect(() => { if (mods.workshopId !== workshopId) mods.load(workshopId); }, [workshopId]); // eslint-disable-line react-hooks/exhaustive-deps
  const platformOnly = mods.loaded && mods.workshopId === workshopId && isPlatformOnly(mods.off);
  useEffect(() => {
    let alive = true;
    supabase.from('job_customer_charges').select('amount').eq('job_id', jobId).maybeSingle()
      .then(({ data }) => { if (alive) setAmount(data ? Number(data.amount) : null); });
    return () => { alive = false; };
  }, [jobId]);

  if (amount === undefined || !platformOnly) return null;

  async function onSave(n: number | null) {
    const { error } = await saveCharge(workshopId, jobId, n, userId);
    if (error) { toast.error('Não salvou: ' + error.message); return false; }
    setAmount(n); setEditing(false);
    toast.success(n == null ? 'Valor apagado' : 'Valor salvo — aparece no Painel da Plataforma');
    return true;
  }

  return (
    <div className="pt-3 border-t border-steel-100 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-steel-700">💰 Quanto você cobrou do cliente?</p>
        <span className="text-[10px] text-steel-500 uppercase tracking-wider font-bold">só você vê</span>
      </div>
      {amount != null && !editing ? (
        <div className="flex items-center justify-between gap-2 rounded-xl bg-steel-50 px-3 py-2.5">
          <div className="text-sm">
            <span className="font-bold text-steel-900">{fmtBRL(amount)}</span>
            <span className={`ml-2 text-xs font-semibold ${amount - paid >= 0 ? 'text-signal-700' : 'text-alert-600'}`}>
              ficou {fmtBRL(amount - paid)} com você
            </span>
          </div>
          <button type="button" onClick={() => setEditing(true)} className="text-xs font-semibold text-brand-600 min-h-[36px]">Editar</button>
        </div>
      ) : (
        <>
          <p className="text-xs text-steel-600">Opcional. Com esse valor o Painel da Plataforma mostra quanto você ganhou em cada serviço. O mecânico não vê.</p>
          <ChargeInput initial={amount} onSave={onSave} />
        </>
      )}
    </div>
  );
}
