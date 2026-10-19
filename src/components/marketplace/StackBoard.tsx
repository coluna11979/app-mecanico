import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from '@/components/ui/Toast';
import { brl } from '@/lib/cash';
import { loadCallParams, saveJobDraft, suggestPay } from '@/lib/callMechanic';

type StackItem = {
  id: string; service_order_id: string; description: string; quantity: number; unit_price: number;
  order: { id: string; number: number | null; title: string; status: string; vehicle: { make: string | null; model: string | null; plate: string | null } | null } | null;
};
/** Serviço empilhado avulso (sem OS), guardado direto pela Nova demanda */
type FreeItem = { id: string; title: string; description: string; total: number; hours: number | null };
/** Um card da pilha: os serviços de uma OS ou um serviço avulso */
type Card = {
  key: string; kind: 'os' | 'free'; osId: string | null; number: number | null; title: string; car: string;
  items: { id: string; description: string; quantity: number; amount: number }[];
  /** OS: soma da mão de obra (o pagamento sai da sugestão). Avulso: o valor que a oficina definiu */
  labor: number; free?: FreeItem;
};

const osNum = (n: number | null, id: string) => (n != null ? String(n).padStart(4, '0') : id.slice(0, 8));
const amt = (i: StackItem) => Math.round(Number(i.quantity) * Number(i.unit_price) * 100) / 100;

/**
 * 📚 Empilhados — serviços esperando mecânico da plataforma que ainda não viraram demanda:
 * os marcados numa OS e os avulsos guardados pela Nova demanda (oficina sem OS).
 * Cada OS / serviço avulso é um card separado (nada se mistura sozinho). A gestão move os cards que
 * quer resolver para "Buscar mecânico" e gera a demanda: um mecânico, vários serviços — mais barato.
 */
export default function StackBoard({ wid, reloadKey, onGenerate }: { wid: string; reloadKey: number; onGenerate: () => void }) {
  const [items, setItems] = useState<StackItem[] | null>(null);
  const [free, setFree] = useState<FreeItem[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState<'stack' | 'search' | null>(null);

  const load = useCallback(async () => {
    const [os, av] = await Promise.all([
      supabase.from('service_order_items')
        .select('id, service_order_id, description, quantity, unit_price, order:service_orders(id, number, title, status, vehicle:vehicles(make, model, plate))')
        .eq('workshop_id', wid).eq('kind', 'labor').eq('executor', 'platform')
        .not('stacked_at', 'is', null).is('platform_job_id', null).order('stacked_at'),
      supabase.from('stacked_services').select('id, title, description, total, hours')
        .eq('workshop_id', wid).is('job_id', null).is('removed_at', null).order('created_at'),
    ]);
    if (os.error) console.warn('[StackBoard]', os.error.message);
    if (av.error) console.warn('[StackBoard] avulsos', av.error.message);
    setItems(((os.data ?? []) as unknown as StackItem[]).filter(i => i.order && i.order.status !== 'cancelled'));
    setFree(((av.data ?? []) as FreeItem[]).map(f => ({ ...f, total: Number(f.total), hours: f.hours != null ? Number(f.hours) : null })));
  }, [wid]);
  useEffect(() => { load(); }, [load, reloadKey]);

  const cards: Card[] = useMemo(() => {
    const m = new Map<string, Card>();
    for (const i of items ?? []) {
      const o = i.order!;
      const c = m.get(o.id) ?? {
        key: `os:${o.id}`, kind: 'os' as const, osId: o.id, number: o.number, title: o.title,
        car: [[o.vehicle?.make, o.vehicle?.model].filter(Boolean).join(' '), o.vehicle?.plate].filter(Boolean).join(' · '),
        items: [], labor: 0,
      };
      c.items.push({ id: i.id, description: i.description, quantity: Number(i.quantity), amount: amt(i) });
      c.labor += amt(i);
      m.set(o.id, c);
    }
    const freeCards: Card[] = free.map(f => ({
      key: `free:${f.id}`, kind: 'free', osId: null, number: null, title: f.title, car: '',
      items: [{ id: f.id, description: f.title, quantity: 1, amount: f.total }], labor: f.total, free: f,
    }));
    return [...m.values(), ...freeCards];
  }, [items, free]);

  const inStack = cards.filter(c => !picked.has(c.key));
  const inSearch = cards.filter(c => picked.has(c.key));
  const searchItems = inSearch.flatMap(c => c.items);
  const osCards = inSearch.filter(c => c.kind === 'os');
  const freeCards = inSearch.filter(c => c.kind === 'free');
  const osLabor = osCards.reduce((a, c) => a + c.labor, 0);
  const freeTotal = freeCards.reduce((a, c) => a + c.labor, 0);
  // OS: sugestão a partir da mão de obra; avulso: o valor que a oficina já definiu ao empilhar
  const sug = suggestPay(osLabor, loadCallParams(wid));
  const total = (osCards.length ? sug.total : 0) + freeTotal;

  const move = (key: string, to: 'stack' | 'search') =>
    setPicked(p => { const n = new Set(p); if (to === 'search') n.add(key); else n.delete(key); return n; });

  async function unstack(c: Card) {
    if (c.kind === 'free') {
      if (!confirm(`Tirar "${c.title}" da pilha?`)) return;
      setBusy(true);
      const { error } = await supabase.from('stacked_services').update({ removed_at: new Date().toISOString() })
        .eq('id', c.free!.id).eq('workshop_id', wid);
      setBusy(false);
      if (error) return toast.error('Não foi possível tirar da pilha: ' + error.message);
      move(c.key, 'stack');
      load();
      return;
    }
    if (!confirm(`Tirar da pilha os serviços da OS nº ${osNum(c.number, c.osId!)}? Eles voltam para o responsável da OS.`)) return;
    setBusy(true);
    const { error } = await supabase.from('service_order_items')
      .update({ executor: null, workshop_mechanic_id: null, stacked_at: null }).in('id', c.items.map(i => i.id)).eq('workshop_id', wid);
    if (!error) await supabase.from('service_orders').update({ executor: null }).eq('id', c.osId!).eq('workshop_id', wid).eq('executor', 'platform');
    setBusy(false);
    if (error) return toast.error('Não foi possível desempilhar: ' + error.message);
    move(c.key, 'stack');
    load();
  }

  function generate() {
    if (!inSearch.length) return;
    const many = inSearch.length > 1;
    const first = searchItems[0];
    const vehicles = osCards.length;
    const title = (searchItems.length === 1 ? first.description : `${first.description} + ${searchItems.length - 1} serviço(s)`)
      + (vehicles > 1 ? ` — ${vehicles} veículos` : vehicles === 1 && osCards[0].car ? ` — ${osCards[0].car.split(' · ')[0]}` : '');
    const description = [
      'Serviços a realizar:',
      ...inSearch.flatMap(c => (c.kind === 'free'
        ? [`• ${c.title.trim()}${c.free!.description.trim() ? ` — ${c.free!.description.trim()}` : ''}`]
        : [
            many ? `\nVeículo${c.car ? `: ${c.car}` : ''} (OS nº ${osNum(c.number, c.osId!)})` : '',
            ...c.items.map(i => `• ${i.description.trim()}${i.quantity > 1 ? ` (${i.quantity}x)` : ''}`),
          ])),
      !many && osCards.length === 1 && osCards[0].car ? `\nVeículo: ${osCards[0].car}` : '',
      !many && osCards.length === 1 ? `Referência: OS nº ${osNum(osCards[0].number, osCards[0].osId!)}` : '',
    ].filter(l => l !== '').join('\n');
    const hours = osCards.reduce((a, c) => a + c.items.length, 0)
      + freeCards.reduce((a, c) => a + (c.free!.hours ?? 1), 0);
    saveJobDraft(wid, many ? `${inSearch.length} serviços empilhados` : osCards.length ? `OS nº ${osNum(osCards[0].number, osCards[0].osId!)}` : 'serviço empilhado', {
      serviceOrderId: osCards[0]?.osId ?? '', serviceOrderIds: osCards.length ? osCards.map(c => c.osId!) : undefined,
      itemIds: osCards.flatMap(c => c.items.map(i => i.id)),
      stackedServiceIds: freeCards.map(c => c.free!.id),
      title: title.slice(0, 120), description, total, hours: Math.max(1, hours), scheduledAt: '',
    });
    onGenerate();
  }

  if (items === null || cards.length === 0) return null;

  const Col = ({ id, title, hint, list, children }: { id: 'stack' | 'search'; title: string; hint: string; list: Card[]; children?: React.ReactNode }) => (
    <div
      onDragOver={e => { e.preventDefault(); setDragOver(id); }}
      onDragLeave={() => setDragOver(null)}
      onDrop={e => { e.preventDefault(); setDragOver(null); const key = e.dataTransfer.getData('text/plain'); if (key) move(key, id); }}
      className={`rounded-2xl p-3 transition ${dragOver === id ? 'bg-brand-50 ring-2 ring-brand-300' : 'bg-steel-50'}`}>
      <div className="flex items-baseline justify-between px-1 mb-2">
        <h3 className="text-sm font-bold text-steel-800">{title} <span className="text-steel-400 font-semibold">{list.length}</span></h3>
        <span className="text-[11px] text-steel-400">{hint}</span>
      </div>
      <div className="space-y-2 min-h-[56px]">
        {list.length === 0 && <div className="rounded-xl border border-dashed border-steel-300 px-3 py-4 text-center text-xs text-steel-400">{id === 'search' ? 'Arraste ou use “Buscar mecânico →”' : 'Nada empilhado'}</div>}
        {list.map(c => (
          <div key={c.key} draggable onDragStart={e => e.dataTransfer.setData('text/plain', c.key)}
            className="bg-white rounded-xl ring-1 ring-steel-200/70 p-3 cursor-grab active:cursor-grabbing">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-steel-900 truncate">
                  {c.kind === 'os' ? `OS nº ${osNum(c.number, c.osId!)}` : c.title}
                </div>
                <div className="text-xs text-steel-500 truncate">
                  {c.kind === 'os' ? (c.car || c.title)
                    : [c.free!.description || 'Serviço avulso', c.free!.hours ? `~${String(c.free!.hours).replace('.', ',')}h` : ''].filter(Boolean).join(' · ')}
                </div>
              </div>
              <div className="text-sm font-bold text-steel-900 shrink-0">{brl(c.labor)}</div>
            </div>
            {c.kind === 'os' && (
              <ul className="mt-2 text-xs text-steel-600 space-y-0.5">
                {c.items.map(i => <li key={i.id} className="flex justify-between gap-2"><span className="truncate">• {i.description}</span><span className="shrink-0 text-steel-400">{brl(i.amount)}</span></li>)}
              </ul>
            )}
            <div className="mt-2.5 flex items-center justify-between gap-2">
              {id === 'stack' ? (
                <>
                  <button type="button" onClick={() => unstack(c)} disabled={busy} className="text-xs text-steel-500 hover:text-alert-600 underline min-h-[36px]">
                    {c.kind === 'os' ? 'Desempilhar' : 'Tirar da pilha'}
                  </button>
                  <button type="button" onClick={() => move(c.key, 'search')} className="btn-secondary !py-2 !px-3 text-xs min-h-[40px]">Buscar mecânico →</button>
                </>
              ) : (
                <button type="button" onClick={() => move(c.key, 'stack')} className="text-xs text-steel-500 hover:text-steel-800 underline min-h-[36px]">← Voltar para a pilha</button>
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
        <p className="text-xs text-steel-500">Serviços esperando mecânico da plataforma. Junte vários em “Buscar mecânico” e gere uma demanda só: um mecânico faz tudo e sai mais barato.</p>
      </div>
      <div className="grid md:grid-cols-2 gap-3">
        {Col({ id: 'stack', title: 'Empilhados', hint: 'cada serviço separado', list: inStack })}
        {Col({
          id: 'search', title: 'Buscar mecânico', hint: 'vão na mesma demanda', list: inSearch,
          children: inSearch.length > 0 && (
            <div className="mt-3 rounded-xl bg-white ring-1 ring-brand-200 p-3 space-y-2">
              <div className="text-sm font-semibold text-steel-900">
                Vai gerar 1 demanda · {searchItems.length} {searchItems.length === 1 ? 'serviço' : 'serviços'}
                {osCards.length > 0 && ` · ${osCards.length} OS`}
              </div>
              <div className="text-xs text-steel-500">
                {osCards.length > 0 && `Mão de obra das OS ${brl(osLabor)} → sugestão ${brl(sug.total)}`}
                {osCards.length > 0 && freeCards.length > 0 && ' + '}
                {freeCards.length > 0 && `avulsos ${brl(freeTotal)}`}
                {' '}= <strong className="text-steel-800">{brl(total)}</strong> (você ajusta antes de publicar)
              </div>
              <button type="button" onClick={generate} className="btn-primary w-full">Gerar demanda →</button>
              <p className="text-[11px] text-steel-400">Quer mais de uma demanda? Gere esta e depois mova os outros cards.</p>
            </div>
          ),
        })}
      </div>
    </section>
  );
}
