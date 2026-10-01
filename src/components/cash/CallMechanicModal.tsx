import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { toast } from '@/components/ui/Toast';
import { brl, moneyStr, parseMoney } from '@/lib/cash';
import { localInput } from '@/lib/agenda';
import {
  loadCallParams, saveCallParams, saveJobDraft, suggestPay, type CallMechanicParams,
} from '@/lib/callMechanic';
import type { ServiceOrderItem } from '@/types/database';

export type CallMechanicOs = {
  id: string; number: number | null; title: string;
  vehicle: { plate: string | null; make: string | null; model: string | null } | null;
};

/** itemId = item da OS (serviços digitados aqui não têm) */
type Row = { key: string; itemId?: string; text: string; amount: number; on: boolean };

const JOB_STATUS: Record<string, string> = { open: 'aguardando mecânico', assigned: 'mecânico aceitou', in_progress: 'em andamento', completed: 'concluída', disputed: 'em disputa' };

const osNum = (o: { id: string; number: number | null }) => (o.number != null ? String(o.number).padStart(4, '0') : o.id.slice(0, 8));

/**
 * Caixa → "Chamar mecânico": pega os serviços (mão de obra) da OS, deixa marcar/editar,
 * sugere o valor para o autônomo e abre a tela de Demandas já preenchida para publicar.
 * O nome do cliente não vai para a demanda (ela é vista por mecânicos de fora).
 */
export default function CallMechanicModal({ wid, os, onClose }: { wid: string; os: CallMechanicOs; onClose: () => void }) {
  const nav = useNavigate();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [note, setNote] = useState('');
  const [params, setParams] = useState<CallMechanicParams>(() => loadCallParams(wid));
  const [showCalc, setShowCalc] = useState(false);
  const [hours, setHours] = useState<string | null>(null); // null = 1h por serviço marcado
  const [when, setWhen] = useState('');                     // quando o mecânico deve vir ('' = o quanto antes)
  const [osWhen, setOsWhen] = useState<string | null>(null); // agendamento da OS
  const [existing, setExisting] = useState<{ status: string }[]>([]);
  const [total, setTotal] = useState<string | null>(null); // null = segue a sugestão

  useEffect(() => {
    let alive = true;
    // Agendamento da OS (o mecânico vem nesse horário) e demandas já publicadas para ela
    Promise.all([
      supabase.from('service_orders').select('scheduled_at').eq('id', os.id).maybeSingle(),
      supabase.from('jobs').select('status').eq('service_order_id', os.id).neq('status', 'cancelled'),
    ]).then(([o, j]) => {
      if (!alive) return;
      const at = (o.data as { scheduled_at: string | null } | null)?.scheduled_at ?? null;
      setOsWhen(at);
      if (at && new Date(at).getTime() > Date.now()) setWhen(localInput(new Date(at)));
      setExisting((j.data as { status: string }[]) ?? []);
    });
    supabase.from('service_order_items').select('id, description, quantity, unit_price, kind, position, executor')
      .eq('service_order_id', os.id).eq('kind', 'labor').order('position')
      .then(({ data, error }) => {
        if (!alive) return;
        if (error) toast.error('Não consegui ler os serviços da OS: ' + error.message);
        const items = (data as Pick<ServiceOrderItem, 'id' | 'description' | 'quantity' | 'unit_price' | 'executor'>[]) ?? [];
        // Se algum serviço já está marcado "mecânico da plataforma", só esses vêm marcados
        const anyPlatform = items.some(i => i.executor === 'platform');
        const list: Row[] = items.map(i => ({
          key: i.id, itemId: i.id,
          text: Number(i.quantity) > 1 ? `${i.description} (${i.quantity}x)` : i.description,
          amount: Math.round(Number(i.quantity) * Number(i.unit_price) * 100) / 100,
          on: !anyPlatform || i.executor === 'platform',
        }));
        setRows(list.length ? list : [{ key: 'new-0', text: os.title, amount: 0, on: true }]);
      });
    return () => { alive = false; };
  }, [os.id, os.title]);

  const picked = (rows ?? []).filter(r => r.on && r.text.trim());
  const labor = picked.reduce((a, r) => a + r.amount, 0);
  const sug = useMemo(() => suggestPay(labor, params), [labor, params]);
  const finalTotal = total === null ? sug.total : parseMoney(total);
  const hoursStr = hours ?? String(Math.max(1, picked.length));
  const hoursN = Number(hoursStr.replace(',', '.')) || 0;
  const whenDate = when ? new Date(when) : null;

  const setRow = (i: number, patch: Partial<Row>) => setRows(rs => (rs ?? []).map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const setParam = (k: keyof CallMechanicParams) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = { ...params, [k]: parseMoney(e.target.value) };
    setParams(next); saveCallParams(wid, next); setTotal(null);
  };

  const car = [os.vehicle?.make, os.vehicle?.model].filter(Boolean).join(' ');
  function goPublish() {
    if (!picked.length) return toast.error('Marque pelo menos um serviço');
    if (finalTotal < 1) return toast.error('Informe quanto vai pagar ao mecânico');
    if (hoursN < 0.5) return toast.error('Informe o tempo previsto (mínimo 0,5h)');
    if (whenDate && whenDate.getTime() < Date.now()) return toast.error('O horário para o mecânico vir já passou');
    if (existing.length && !confirm(`Esta OS já tem ${existing.length} demanda(s) publicada(s) (${existing.map(j => JOB_STATUS[j.status] ?? j.status).join(', ')}). Publicar outra mesmo assim?`)) return;
    const title = (picked.length === 1 ? picked[0].text : `${picked[0].text} + ${picked.length - 1} serviço(s)`)
      + (car ? ` — ${car}` : '');
    const description = [
      'Serviços a realizar:',
      ...picked.map(r => `• ${r.text.trim()}`),
      '',
      car || os.vehicle?.plate ? `Veículo: ${[car, os.vehicle?.plate].filter(Boolean).join(' · ')}` : '',
      whenDate ? `Quando: ${whenDate.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' })} às ${whenDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : '',
      `Referência: OS nº ${osNum(os)}`,
      note.trim() ? `\nObservações: ${note.trim()}` : '',
    ].filter(l => l !== '').join('\n');
    saveJobDraft(wid, `OS nº ${osNum(os)}`, {
      serviceOrderId: os.id, itemIds: picked.flatMap(r => (r.itemId ? [r.itemId] : [])),
      title: title.slice(0, 120), description, total: finalTotal, hours: hoursN, scheduledAt: when,
    });
    nav('/oficina/dashboard?nova=1');
  }

  return (
    <div className="fixed inset-0 z-50 bg-steel-900/60 grid place-items-center p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl w-full max-w-lg max-h-[92vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold">🔧 Chamar mecânico · OS nº {osNum(os)}</h2>
            <div className="text-sm text-steel-500">{[car, os.vehicle?.plate].filter(Boolean).join(' · ') || os.title}</div>
          </div>
          <button onClick={onClose} className="text-steel-400 hover:text-steel-700 text-xl leading-none" aria-label="Fechar">×</button>
        </div>

        {existing.length > 0 && (
          <div className="mt-3 rounded-xl bg-pending-50 border border-pending-200 px-3 py-2 text-xs text-pending-800">
            ⚠️ Esta OS já tem demanda publicada ({existing.map(j => JOB_STATUS[j.status] ?? j.status).join(', ')}). Confira em Demandas antes de chamar outro mecânico.
          </div>
        )}

        <div className="mt-4">
          <div className="label">Serviços que o mecânico vai fazer</div>
          {rows === null ? (
            <div className="space-y-2">{[1, 2].map(i => <div key={i} className="h-10 bg-steel-100 rounded-xl animate-pulse" />)}</div>
          ) : (
            <div className="space-y-2">
              {rows.map((r, i) => (
                <div key={r.key} className="flex items-center gap-2">
                  <input type="checkbox" className="w-4 h-4 shrink-0" checked={r.on} onChange={e => { setRow(i, { on: e.target.checked }); setTotal(null); }} />
                  <input className={`input flex-1 !py-2 text-sm ${r.on ? '' : 'opacity-50'}`} value={r.text}
                    onChange={e => setRow(i, { text: e.target.value })} placeholder="Descreva o serviço" />
                  <span className="text-xs text-steel-400 w-20 text-right shrink-0">{r.amount > 0 ? brl(r.amount) : '—'}</span>
                </div>
              ))}
              <button type="button" className="text-sm font-semibold text-steel-600 underline"
                onClick={() => setRows(rs => [...(rs ?? []), { key: `new-${Date.now()}`, text: '', amount: 0, on: true }])}>
                + Adicionar serviço
              </button>
            </div>
          )}
        </div>

        <div className="mt-4">
          <label className="label">Observações para o mecânico (opcional)</label>
          <textarea className="input text-sm" rows={2} value={note} onChange={e => setNote(e.target.value)}
            placeholder="Ex.: carro já está no elevador, peças separadas no balcão" />
        </div>

        <div className="rounded-2xl bg-steel-50 px-4 py-3 mt-4 space-y-1 text-sm">
          <Line label="Mão de obra desses serviços na OS" value={brl(labor)} />
          <Line label={`Parte do mecânico (${params.laborPercent}%)`} value={brl(sug.base)} />
          <Line label={`+ Autônomo, sem férias/13º/encargos (${params.autonomoPercent}%)`} value={brl(sug.autonomo)} />
          <Line label="+ Deslocamento" value={brl(sug.travel)} />
          <div className="flex justify-between pt-1 border-t border-steel-200 text-base">
            <span className="font-semibold">Sugestão de pagamento</span><span className="font-bold">{brl(sug.total)}</span>
          </div>
          <button type="button" onClick={() => setShowCalc(s => !s)} className="text-xs text-steel-500 underline">
            {showCalc ? 'Fechar ajustes' : 'Ajustar o cálculo'}
          </button>
          {showCalc && (
            <div className="grid grid-cols-3 gap-2 pt-2">
              <Field label="% da mão de obra" suffix="%" value={params.laborPercent} onChange={setParam('laborPercent')} />
              <Field label="Adicional autônomo" suffix="%" value={params.autonomoPercent} onChange={setParam('autonomoPercent')} />
              <Field label="Deslocamento" prefix="R$" value={params.travel} onChange={setParam('travel')} />
              <p className="col-span-3 text-[11px] text-steel-400">Fica salvo para as próximas chamadas desta oficina.</p>
            </div>
          )}
        </div>
        {labor === 0 && rows !== null && (
          <p className="text-xs text-pending-800 mt-2">Essa OS ainda não tem valor de mão de obra lançado — informe o valor a pagar abaixo.</p>
        )}

        <div className="grid grid-cols-2 gap-3 mt-4">
          <div>
            <label className="label">Vai pagar ao mecânico</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-steel-400 text-sm">R$</span>
              <input className="input !pl-9" inputMode="decimal" value={total ?? moneyStr(sug.total)} onChange={e => setTotal(e.target.value)} />
            </div>
            {total !== null && (
              <button type="button" onClick={() => setTotal(null)} className="text-[11px] text-steel-500 underline mt-1">Voltar para a sugestão</button>
            )}
          </div>
          <div>
            <label className="label">Tempo previsto</label>
            <div className="relative">
              <input className="input !pr-9" inputMode="decimal" value={hoursStr} onChange={e => setHours(e.target.value)} />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-steel-400 text-sm">h</span>
            </div>
          </div>
        </div>

        <div className="mt-3">
          <label className="label">Quando o mecânico deve vir</label>
          <input type="datetime-local" className="input" value={when} onChange={e => setWhen(e.target.value)} />
          <p className="text-[11px] text-steel-500 mt-1">
            {osWhen && when === localInput(new Date(osWhen)) ? '📅 Mesmo horário do agendamento desta OS.'
              : osWhen && new Date(osWhen).getTime() > Date.now() ? `📅 A OS está agendada para ${new Date(osWhen).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}.`
              : when ? '' : 'Em branco = o quanto antes.'}
          </p>
        </div>

        <button onClick={goPublish} disabled={rows === null} className="btn-primary w-full mt-5">
          Continuar para publicar a demanda →
        </button>
        <p className="text-[11px] text-steel-400 text-center mt-2">
          Na próxima tela você escolhe: aberta para todos, só preferidos ou um mecânico direto. O nome do cliente não é enviado.
        </p>
      </div>
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between gap-3"><span className="text-steel-500">{label}</span><span className="font-medium shrink-0">{value}</span></div>;
}

function Field({ label, value, onChange, prefix, suffix }: {
  label: string; value: number; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; prefix?: string; suffix?: string;
}) {
  return (
    <div>
      <div className="text-[11px] text-steel-500 mb-1">{label}</div>
      <div className="relative">
        {prefix && <span className="absolute left-2 top-1/2 -translate-y-1/2 text-steel-400 text-xs">{prefix}</span>}
        <input className={`input !py-1.5 text-sm ${prefix ? '!pl-8' : ''} ${suffix ? '!pr-6' : ''}`} inputMode="decimal"
          defaultValue={String(value).replace('.', ',')} onChange={onChange} />
        {suffix && <span className="absolute right-2 top-1/2 -translate-y-1/2 text-steel-400 text-xs">{suffix}</span>}
      </div>
    </div>
  );
}
