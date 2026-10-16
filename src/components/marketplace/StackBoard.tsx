import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from '@/components/ui/Toast';
import { brl } from '@/lib/cash';
import { loadCallParams, saveJobDraft, suggestPay } from '@/lib/callMechanic';

type StackItem = {
  id: string; service_order_id: string; description: string; quantity: number; unit_price: number;
  order: { id: string; number: number | null; title: string; status: string; vehicle: { make: string | null; model: string | null; plate: string | null } | null } | null;
};
type Card = { osId: string; number: number | null; title: string; car: string; items: StackItem[]; labor: number };

const osNum = (n: number | null, id: string) => (n != null ? String(n).padStart(4, '0') : id.slice(0, 8));
const amt = (i: StackItem) => Math.round(Number(i.quantity) * Number(i.unit_price) * 100) / 100;

/**
 * 📚 Empilhados — serviços marcados para o mecânico da plataforma que ainda não viraram demanda.
 * Cada OS é um card separado (nada se mistura sozinho). A gestão move os cards que quer resolver
 * para "Buscar mecânico" e gera a demanda: um mecânico, vários serviços (de uma ou mais OS).
 */
export default function StackBoard({ wid, reloadKey, onGenerate }: { wid: string; reloadKey: number; onGenerate: () => void }) {
  const [items, setItems] = useState<StackItem[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState<'stack' | 'search' | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('service_order_items')
      .select('id, service_order_id, description, quantity, unit_price, order:service_orders(id, number, title, status, vehicle:vehicles(make, model, plate))')
      .eq('workshop_id', wid).eq('kind', 'labor').eq('executor', 'platform')
      .not('stacked_at', 'is', null).is('platform_job_id', null).order('stacked_at');
    if (error) { console.warn('[StackBoard]', error.message); setItems([]); return; }
    setItems(((data ?? []) as unknown as StackItem[]).filter(i => i.order && i.order.status !== 'cancelled'));
  }, [wid]);
  useEffect(() => { load(); }, [load, reloadKey]);

  const cards: Card[] = useMemo(() => {
    const m = new Map<string, Card>();
    for (const i of items ?? []) {
      const o = i.order!;
      const c = m.get(o.id) ?? {
        osId: o.id, number: o.number, title: o.title,
        car: [[o.vehicle?.make, o.vehicle?.model].filter(Boolean).join(' '), o.vehicle?.plate].filter(Boolean).join(' · '),
        items: [], labor: 0,
      };
      c.items.push(i); c.labor += amt(i);
      m.set(o.id, c);
    }
    return [...m.values()];
  }, [items]);

  const inStack = cards.filter(c => !picked.has(c.osId));
  const inSearch = cards.filter(c => picked.has(c.osId));
  const searchItems = inSearch.flatMap(c => c.items);
  const searchLabor = inSearch.reduce((a, c) => a + c.labor, 0);
  const sug = suggestPay(searchLabor, loadCallParams(wid));

  const move = (osId: string, to: 'stack' | 'search') =>
    setPicked(p => { const n = new Set(p); if (to === 'search') n.add(osId); else n.delete(osId); return n; });

  async function unstack(c: Card) {
    if (!confirm(`Tirar da pilha os serviços da OS nº ${osNum(c.number, c.osId)}? Eles voltam para o responsável da OS.`)) return;
    setBusy(true);
    const { error } = await supabase.from('service_order_items')
      .update({ executor: null, workshop_mechanic_id: null, stacked_at: null }).in('id', c.items.map(i => i.id)).eq('workshop_id', wid);
    if (!error) await supabase.from('service_orders').update({ executor: null }).eq('id', c.osId).eq('workshop_id', wid).eq('executor', 'platform');
    setBusy(false);
    if (error) return toast.error('Não foi possível desempilhar: ' + error.message);
    move(c.osId, 'stack');
    load();
  }

  function generate() {
    if (!inSearch.length) return;
    const many = inSearch.length > 1;
    const first = searchItems[0];
    const title = (searchItems.length === 1 ? first.description : `${first.description} + ${searchItems.length - 1} serviço(s)`)
      + (many ? ` — ${inSearch.length} veículos` : inSearch[0].car ? ` — ${inSearch[0].car.split(' · ')[0]}` : '');
    const description = [
      'Serviços a realizar:',
      ...inSearch.flatMap(c => [
        many ? `\nVeículo${c.car ? `: ${c.car}` : ''} (OS nº ${osNum(c.number, c.osId)})` : '',
        ...c.items.map(i => `• ${i.description.trim()}${Number(i.quantity) > 1 ? ` (${i.quantity}x)` : ''}`),
      ]),
      !many && inSearch[0].car ? `\nVeículo: ${inSearch[0].car}` : '',
      !many ? `Referência: OS nº ${osNum(inSearch[0].number, inSearch[0].osId)}` : '',
    ].filter(l => l !== '').join('\n');
    saveJobDraft(wid, many ? `${inSearch.length} OS empilhadas` : `OS nº ${osNum(inSearch[0].number, inSearch[0].osId)}`, {
      serviceOrderId: inSearch[0].osId, serviceOrderIds: inSearch.map(c => c.osId),
      itemIds: searchItems.map(i => i.id),
      title: title.slice(0, 120), description, total: sug.total, hours: Math.max(1, searchItems.length), scheduledAt: '',
    });
    onGenerate();
  }

  if (items === null || cards.length === 0) return null;

  const Col = ({ id, title, hint, list, children }: { id: 'stack' | 'search'; title: string; hint: string; list: Card[]; children?: React.ReactNode }) => (
    <div
      onDragOver={e => { e.preventDefault(); setDragOver(id); }}
      onDragLeave={() => setDragOver(null)}
      onDrop={e => { e.preventDefault(); setDragOver(null); const os = e.dataTransfer.getData('text/plain'); if (os) move(os, id); }}
      className={`rounded-2xl p-3 transition ${dragOver === id ? 'bg-brand-50 ring-2 ring-brand-300' : 'bg-steel-50'}`}>
      <div className="flex items-baseline justify-between px-1 mb-2">
        <h3 className="text-sm font-bold text-steel-800">{title} <span className="text-steel-400 font-semibold">{list.length}</span></h3>
        <span className="text-[11px] text-steel-400">{hint}</span>
      </div>
      <div className="space-y-2 min-h-[56px]">
        {list.length === 0 && <div className="rounded-xl border border-dashed border-steel-300 px-3 py-4 text-center text-xs text-steel-400">{id === 'search' ? 'Arraste ou use “Buscar mecânico →”' : 'Nada empilhado'}</div>}
        {list.map(c => (
          <div key={c.osId} draggable onDragStart={e => e.dataTransfer.setData('text/plain', c.osId)}
            className="bg-white rounded-xl ring-1 ring-steel-200/70 p-3 cursor-grab active:cursor-grabbing">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-steel-900">OS nº {osNum(c.number, c.osId)}</div>
                <div className="text-xs text-steel-500 truncate">{c.car || c.title}</div>
              </div>
              <div className="text-sm font-bold text-steel-900 shrink-0">{brl(c.labor)}</div>
            </div>
            <ul className="mt-2 text-xs text-steel-600 space-y-0.5">
              {c.items.map(i => <li key={i.id} className="flex justify-between gap-2"><span className="truncate">• {i.description}</span><span className="shrink-0 text-steel-400">{brl(amt(i))}</span></li>)}
            </ul>
            <div className="mt-2.5 flex items-center justify-between gap-2">
              {id === 'stack' ? (
                <>
                  <button type="button" onClick={() => unstack(c)} disabled={busy} className="text-xs text-steel-500 hover:text-alert-600 underline min-h-[36px]">Desempilhar</button>
                  <button type="button" onClick={() => move(c.osId, 'search')} className="btn-secondary !py-2 !px-3 text-xs min-h-[40px]">Buscar mecânico →</button>
                </>
              ) : (
                <button type="button" onClick={() => move(c.osId, 'stack')} className="text-xs text-steel-500 hover:text-steel-800 underline min-h-[36px]">← Voltar para a pilha</button>
              )}
            </div>
          </div>
        ))}
      </div>
      {children}
    </div>
  );

  return (
    <section className="mb-5 rounded-2xl bg-white ring-1 ring-steel-200/70 p-4">
      <div className="mb-3">
        <h2 className="text-base font-bold text-steel-900">📚 Empilhados</h2>
        <p className="text-xs text-steel-500">Serviços esperando mecânico da plataforma. Mova para “Buscar mecânico” os que quer resolver juntos e gere a demanda.</p>
      </div>
      <div className="grid md:grid-cols-2 gap-3">
        {Col({ id: 'stack', title: 'Empilhados', hint: 'cada OS separada', list: inStack })}
        {Col({
          id: 'search', title: 'Buscar mecânico', hint: 'vão na mesma demanda', list: inSearch,
          children: inSearch.length > 0 && (
            <div className="mt-3 rounded-xl bg-white ring-1 ring-brand-200 p-3 space-y-2">
              <div className="text-sm font-semibold text-steel-900">
                Vai gerar 1 demanda · {inSearch.length} {inSearch.length === 1 ? 'OS' : 'OS'} · {searchItems.length} {searchItems.length === 1 ? 'serviço' : 'serviços'}
              </div>
              <div className="text-xs text-steel-500">Mão de obra {brl(searchLabor)} · sugestão de pagamento {brl(sug.total)} (você ajusta antes de publicar)</div>
              <button type="button" onClick={generate} className="btn-primary w-full">Gerar demanda →</button>
              <p className="text-[11px] text-steel-400">Quer mais de uma demanda? Gere esta e depois mova os outros cards.</p>
            </div>
          ),
        })}
      </div>
    </section>
  );
}
