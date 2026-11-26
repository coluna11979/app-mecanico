import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from '@/components/ui/Toast';
import { brl, type Investor } from '@/lib/investors';

type Req = {
  id: string; investor_id: string; kind: 'comprar' | 'vender'; amount: number; note: string | null;
  status: string; admin_note: string | null; created_at: string;
};
const STATUS: Record<string, string> = { novo: 'Novo', em_analise: 'Em análise', concluido: 'Concluído', recusado: 'Não atendido', cancelado: 'Cancelado' };

/** Pedidos de compra e de venda de cota feitos pelos investidores. O sistema não executa nada: você resolve fora, com contrato. */
export default function QuotaRequestsTab({ investors }: { investors: Investor[] }) {
  const [rows, setRows] = useState<Req[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState('abertos');

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('investor_quota_requests').select('*').order('created_at', { ascending: false });
    if (error) return toast.error('Não carregou: ' + error.message);
    const list = ((data ?? []) as Req[]).map(r => ({ ...r, amount: Number(r.amount) }));
    setRows(list);
    setNotes(Object.fromEntries(list.map(r => [r.id, r.admin_note ?? ''])));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function update(id: string, patch: Partial<Req>) {
    const { error } = await supabase.from('investor_quota_requests').update(patch).eq('id', id);
    if (error) return toast.error('Não salvou: ' + error.message);
    load();
  }

  const shown = rows.filter(r => filter === 'todos' ? true : filter === 'abertos' ? ['novo', 'em_analise'].includes(r.status) : r.status === filter);
  const nameOf = (id: string) => investors.find(i => i.id === id)?.name ?? '—';

  return (
    <div className="space-y-4">
      <p className="text-xs rounded-xl bg-pending-500/10 px-4 py-3 text-steel-600 dark:text-steel-300">
        ⚠️ Aqui chegam só <b>pedidos</b>. O sistema não compra, vende, cobra nem transfere cota. Venda e compra dependem do contrato de cada
        investidor (consentimento, direito de preferência, novo contrato) e devem ser tratadas com seu advogado. A resposta que você escreve
        aparece para o investidor.
      </p>
      <div className="flex gap-2 flex-wrap">
        {['abertos', 'novo', 'em_analise', 'concluido', 'recusado', 'cancelado', 'todos'].map(k => (
          <button key={k} onClick={() => setFilter(k)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${filter === k ? 'bg-steel-900 text-white border-steel-900' : 'border-steel-300 text-steel-600'}`}>
            {k === 'abertos' ? 'Em aberto' : k === 'todos' ? 'Todos' : STATUS[k]}
          </button>
        ))}
      </div>
      {shown.length === 0 && <p className="text-sm text-steel-500 py-6 text-center">Nenhum pedido por aqui.</p>}
      {shown.map(r => (
        <article key={r.id} className="rounded-xl border border-steel-200 dark:border-steel-700 p-4">
          <div className="flex justify-between gap-3 flex-wrap">
            <div>
              <div className="font-semibold">{nameOf(r.investor_id)}</div>
              <div className="text-xs text-steel-500">{new Date(r.created_at).toLocaleString('pt-BR')}</div>
            </div>
            <div className="text-right">
              <div className={`text-xs font-semibold ${r.kind === 'vender' ? 'text-alert-500' : 'text-green-600'}`}>{r.kind === 'vender' ? 'QUER VENDER' : 'QUER COMPRAR'}</div>
              <div className="font-semibold">{brl(r.amount)}</div>
            </div>
          </div>
          {r.note && <p className="mt-2 text-sm text-steel-600 dark:text-steel-300">“{r.note}”</p>}
          <div className="mt-3 flex gap-3 items-center flex-wrap">
            <select className="input !py-1 !w-auto" value={r.status} onChange={e => update(r.id, { status: e.target.value })}>
              {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <label className="block mt-3"><span className="text-xs text-steel-500">Resposta para o investidor</span>
            <textarea className="input mt-1" rows={2} value={notes[r.id] ?? ''} onChange={e => setNotes({ ...notes, [r.id]: e.target.value })} /></label>
          <button className="btn-ghost mt-2" onClick={() => update(r.id, { admin_note: notes[r.id]?.trim() || null })}>Salvar resposta</button>
        </article>
      ))}
    </div>
  );
}
