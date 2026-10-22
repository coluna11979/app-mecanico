import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { toast } from '@/components/ui/Toast';
import { brl } from '@/lib/cash';
import { loadCallParams, saveJobDraft, suggestPay } from '@/lib/callMechanic';
import { useModuleAllows } from '@/lib/modules';

type StackItem = {
  id: string; service_order_id: string; description: string; quantity: number; unit_price: number;
  order: { id: string; number: number | null; title: string; status: string; vehicle: { make: string | null; model: string | null; plate: string | null } | null } | null;
};
/** Serviço empilhado avulso (sem OS), guardado direto pela Nova demanda */
type FreeItem = { id: string; title: string; description: string; total: number; hours: number | null; vehicle: string | null; customer_charge: number | null };
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
 * Fica fechado (só o resumo) para a tela não crescer; aberto, é uma lista compacta: a oficina marca os
 * serviços que quer resolver juntos e "Juntar e chamar 1 mecânico" gera a demanda — mais barato.
 */
export default function StackBoard({ wid, reloadKey, onGenerate }: { wid: string; reloadKey: number; onGenerate: () => void }) {
  const [items, setItems] = useState<StackItem[] | null>(null);
  const [free, setFree] = useState<FreeItem[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  /** Lista aberta (fechada = só o resumo) */
  const [open, setOpen] = useState(false);
  /** Quantos mostrar antes do "Ver mais" */
  const [limit, setLimit] = useState(5);
  /** Serviço com o menu "o que fazer" aberto */
  const [menu, setMenu] = useState<Card | null>(null);
  /** Sem o módulo OS, o serviço veio de um orçamento (Clientes e orçamentos) */
  const canOs = useModuleAllows()('/oficina/os');
  const osWord = canOs ? 'OS' : 'Orçamento';

  const load = useCallback(async () => {
    const [os, av] = await Promise.all([
      supabase.from('service_order_items')
        .select('id, service_order_id, description, quantity, unit_price, order:service_orders(id, number, title, status, vehicle:vehicles(make, model, plate))')
        .eq('workshop_id', wid).eq('kind', 'labor').eq('executor', 'platform')
        .not('stacked_at', 'is', null).is('platform_job_id', null).order('stacked_at'),
      supabase.from('stacked_services').select('id, title, description, total, hours, vehicle, customer_charge')
        .eq('workshop_id', wid).is('job_id', null).is('removed_at', null).order('created_at'),
    ]);
    if (os.error) console.warn('[StackBoard]', os.error.message);
    if (av.error) console.warn('[StackBoard] avulsos', av.error.message);
    setItems(((os.data ?? []) as unknown as StackItem[]).filter(i => i.order && i.order.status !== 'cancelled'));
    setFree(((av.data ?? []) as FreeItem[]).map(f => ({
      ...f, total: Number(f.total), hours: f.hours != null ? Number(f.hours) : null,
      customer_charge: f.customer_charge != null ? Number(f.customer_charge) : null,
    })));
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
      key: `free:${f.id}`, kind: 'free', osId: null, number: null, title: f.title, car: f.vehicle?.trim() ?? '',
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

  /** Tira da pilha: "equipe" = a própria loja faz; "cancelado" = o serviço não vai mais ser feito */
  async function unstack(c: Card, why: 'equipe' | 'cancelado') {
    if (c.kind === 'free') {
      setBusy(true);
      const { error } = await supabase.from('stacked_services').update({ removed_at: new Date().toISOString(), removed_reason: why })
        .eq('id', c.free!.id).eq('workshop_id', wid);
      setBusy(false);
      if (error) return toast.error('Não foi possível tirar da pilha: ' + error.message);
      toast.success(why === 'equipe' ? 'Saiu da pilha: a equipe faz' : 'Serviço cancelado');
      move(c.key, 'stack');
      setMenu(null);
      load();
      return;
    }
    setBusy(true);
    const { error } = await supabase.from('service_order_items')
      .update({ executor: null, workshop_mechanic_id: null, stacked_at: null }).in('id', c.items.map(i => i.id)).eq('workshop_id', wid);
    if (!error) await supabase.from('service_orders').update({ executor: null }).eq('id', c.osId!).eq('workshop_id', wid).eq('executor', 'platform');
    setBusy(false);
    if (error) return toast.error('Não foi possível desempilhar: ' + error.message);
    toast.success(`Voltou para ${canOs ? 'a OS' : 'o orçamento'} nº ${osNum(c.number, c.osId!)}: a equipe faz`);
    move(c.key, 'stack');
    setMenu(null);
    load();
  }

  /** Monta a demanda com os cards dados (os marcados, ou um só pelo "Enviar" da linha) */
  function generate(list: Card[] = inSearch) {
    if (!list.length) return;
    const inSearch = list;
    const searchItems = list.flatMap(c => c.items);
    const osCards = list.filter(c => c.kind === 'os');
    const freeCards = list.filter(c => c.kind === 'free');
    const sug = suggestPay(osCards.reduce((a, c) => a + c.labor, 0), loadCallParams(wid));
    const total = (osCards.length ? sug.total : 0) + freeCards.reduce((a, c) => a + c.labor, 0);
    const many = inSearch.length > 1;
    const first = searchItems[0];
    // Carros diferentes na demanda: um por OS + os avulsos com veículo (mesmo texto = mesmo carro)
    const cars = [...new Set(inSearch.map(c => (c.kind === 'os' ? `os:${c.osId}` : c.car.toLowerCase())).filter(Boolean))];
    const oneCar = inSearch.find(c => c.car)?.car ?? '';
    const vehicles = cars.length;
    const title = (searchItems.length === 1 ? first.description : `${first.description} + ${searchItems.length - 1} serviço(s)`)
      + (vehicles > 1 ? ` — ${vehicles} veículos` : vehicles === 1 && oneCar ? ` — ${oneCar.split(' · ')[0]}` : '');
    const description = [
      'Serviços a realizar:',
      ...inSearch.flatMap(c => (c.kind === 'free'
        ? [`• ${c.title.trim()}${c.car ? ` (${c.car})` : ''}${c.free!.description.trim() ? ` — ${c.free!.description.trim()}` : ''}`]
        : [
            many ? `\nVeículo${c.car ? `: ${c.car}` : ''} (${osWord} nº ${osNum(c.number, c.osId!)})` : '',
            ...c.items.map(i => `• ${i.description.trim()}${i.quantity > 1 ? ` (${i.quantity}x)` : ''}`),
          ])),
      !many && osCards.length === 1 && osCards[0].car ? `\nVeículo: ${osCards[0].car}` : '',
      !many && osCards.length === 1 ? `Referência: ${osWord} nº ${osNum(osCards[0].number, osCards[0].osId!)}` : '',
    ].filter(l => l !== '').join('\n');
    const hours = osCards.reduce((a, c) => a + c.items.length, 0)
      + freeCards.reduce((a, c) => a + (c.free!.hours ?? 1), 0);
    saveJobDraft(wid, many ? `${inSearch.length} serviços empilhados` : osCards.length ? `${osWord} nº ${osNum(osCards[0].number, osCards[0].osId!)}` : 'serviço empilhado', {
      serviceOrderId: osCards[0]?.osId ?? '', serviceOrderIds: osCards.length ? osCards.map(c => c.osId!) : undefined,
      itemIds: osCards.flatMap(c => c.items.map(i => i.id)),
      stackedServiceIds: freeCards.map(c => c.free!.id),
      // Valor cobrado do cliente: só quando todos os serviços juntados são avulsos e todos têm o valor
      customerCharge: !osCards.length && freeCards.every(c => c.free!.customer_charge != null)
        ? freeCards.reduce((a, c) => a + (c.free!.customer_charge ?? 0), 0) : undefined,
      title: title.slice(0, 120), description, total, hours: Math.max(1, hours), scheduledAt: '',
    });
    onGenerate();
  }

  if (items === null || cards.length === 0) return null;

  const allTotal = cards.reduce((a, c) => a + c.labor, 0);
  const allPicked = picked.size === cards.length;
  const toggle = (key: string) => move(key, picked.has(key) ? 'stack' : 'search');
  const shown = cards.slice(0, limit);

  return (
    <section className="mb-5 rounded-2xl bg-white ring-1 ring-steel-200/70 overflow-hidden">
      {/* Resumo: um toque abre a lista */}
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left active:bg-steel-50">
        <span className="h-10 w-10 shrink-0 rounded-xl bg-brand-50 grid place-items-center text-xl" aria-hidden>📚</span>
        <span className="flex-1 min-w-0">
          <span className="block font-bold text-steel-900 text-[15px] leading-tight">
            {cards.length} {cards.length === 1 ? 'serviço empilhado' : 'serviços empilhados'} · {brl(allTotal)}
          </span>
          <span className="block text-xs text-steel-600 mt-0.5">
            {open ? 'Envie um, ou marque vários para um mecânico fazer junto' : 'Junte vários para um mecânico só e pague menos'}
          </span>
        </span>
        <span className={`shrink-0 text-sm font-semibold text-brand-600 ${open ? '' : 'whitespace-nowrap'}`}>
          {open ? 'Fechar ▲' : 'Ver e juntar ▼'}
        </span>
      </button>

      {open && (
        <div className="border-t border-steel-100">
          <div className="flex items-center justify-between px-4 py-2 bg-steel-50">
            <button type="button" onClick={() => setPicked(allPicked ? new Set() : new Set(cards.map(c => c.key)))}
              className="text-xs font-semibold text-brand-700 min-h-[36px]">
              {allPicked ? 'Desmarcar todos' : 'Selecionar todos'}
            </button>
            <span className="text-xs text-steel-500">{picked.size} de {cards.length} marcados</span>
          </div>

          <ul className="divide-y divide-steel-100">
            {shown.map(c => {
              const on = picked.has(c.key);
              const name = c.kind === 'os'
                ? (c.items.length === 1 ? c.items[0].description : `${c.items[0].description} + ${c.items.length - 1}`)
                : c.title;
              const sub = [brl(c.labor), ...(c.kind === 'os'
                ? [`${osWord} nº ${osNum(c.number, c.osId!)}`, c.car]
                : [c.car ? `🚗 ${c.car}` : '', c.free!.hours ? `~${String(c.free!.hours).replace('.', ',')}h` : ''])].filter(Boolean).join(' · ');
              return (
                <li key={c.key} className={`flex items-center gap-3 px-4 py-3 ${on ? 'bg-brand-50/60' : ''}`}>
                  <button type="button" onClick={() => toggle(c.key)} aria-pressed={on}
                    className="flex-1 min-w-0 flex items-center gap-3 text-left min-h-[44px]">
                    <span className={`h-6 w-6 shrink-0 rounded-md border-2 grid place-items-center text-sm font-bold transition ${
                      on ? 'bg-brand-500 border-brand-500 text-white' : 'border-steel-300 bg-white'}`} aria-hidden>{on ? '✓' : ''}</span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-steel-900 truncate">{name}</span>
                      <span className="block text-xs text-steel-600 truncate">{sub}</span>
                    </span>
                  </button>
                  <button type="button" onClick={() => generate([c])}
                    className="h-10 px-3 shrink-0 rounded-lg border border-brand-300 bg-white text-brand-700 text-xs font-bold active:scale-95 hover:bg-brand-50">
                    Enviar
                  </button>
                  <button type="button" onClick={() => setMenu(c)} disabled={busy}
                    title="Equipe própria ou cancelar"
                    aria-label={`O que fazer com ${name}`}
                    className="h-10 w-10 shrink-0 rounded-lg grid place-items-center text-lg font-bold text-steel-500 hover:text-steel-800 hover:bg-steel-100 disabled:opacity-40">⋯</button>
                </li>
              );
            })}
          </ul>

          {cards.length > limit && (
            <button type="button" onClick={() => setLimit(l => l + 10)}
              className="w-full h-11 text-sm font-semibold text-steel-700 border-t border-steel-100 hover:bg-steel-50">
              Ver mais {cards.length - limit}
            </button>
          )}

          {/* Barra no fim da lista (não fica por cima das linhas): junta os marcados numa demanda só */}
          {inSearch.length > 0 && (
            <div className="border-t border-brand-200 bg-brand-50/60 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-bold text-steel-900">
                    {searchItems.length} {searchItems.length === 1 ? 'serviço' : 'serviços'} · {brl(total)}
                  </div>
                  <div className="text-[11px] text-steel-600 leading-tight">
                    {searchItems.length > 1 ? 'um mecânico faz todos · ' : ''}você revisa antes de publicar
                  </div>
                </div>
                <button type="button" onClick={() => generate()}
                  className="shrink-0 h-12 px-4 rounded-xl bg-brand-500 text-white text-sm font-bold active:scale-[0.98] hover:bg-brand-600">
                  📤 Enviar para demanda
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* O que fazer com um serviço da pilha */}
      {menu && (
        <div className="fixed inset-0 z-[60] bg-steel-900/70 flex items-end sm:items-center justify-center sm:p-4" onClick={() => !busy && setMenu(null)}>
          <div onClick={e => e.stopPropagation()} className="w-full sm:max-w-sm bg-white rounded-t-2xl sm:rounded-2xl p-4 pb-6 space-y-2 shadow-2xl">
            <div className="px-1 pb-1">
              <div className="text-base font-bold text-steel-900 leading-tight">
                {menu.kind === 'os' ? (menu.items.length === 1 ? menu.items[0].description : `${menu.items[0].description} + ${menu.items.length - 1}`) : menu.title}
              </div>
              <div className="text-xs text-steel-600 mt-0.5">
                {[brl(menu.labor), menu.kind === 'os' ? `${osWord} nº ${osNum(menu.number, menu.osId!)}` : '', menu.car].filter(Boolean).join(' · ')}
              </div>
            </div>
            {([
              ['continua', '📚 Continuar empilhado', 'fica guardado para chamar depois'],
              ['equipe', '👷 Equipe própria', menu.kind === 'os' ? 'volta para a OS e a equipe da loja faz' : 'sai da pilha: a equipe da loja faz'],
              ...(menu.kind === 'free' ? [['cancelado', '🗑️ Cancelar serviço', 'não vai mais ser feito'] as const] : []),
            ] as const).map(([k, l, d]) => (
              <button key={k} type="button" disabled={busy}
                onClick={() => (k === 'continua' ? setMenu(null) : unstack(menu, k))}
                className={`w-full min-h-[56px] rounded-xl border px-3 py-2 text-left transition active:scale-[0.99] disabled:opacity-50 ${
                  k === 'cancelado' ? 'border-alert-200 hover:bg-alert-50' : 'border-steel-200 hover:bg-steel-50'}`}>
                <span className={`block text-sm font-semibold ${k === 'cancelado' ? 'text-alert-700' : 'text-steel-900'}`}>{l}</span>
                <span className="block text-xs text-steel-600">{d}</span>
              </button>
            ))}
            {menu.kind === 'os' && (
              <p className="text-xs text-steel-500 px-1 pt-1">
                Para cancelar um serviço {canOs ? 'da OS' : 'do orçamento'}, <Link to={canOs ? `/oficina/os/${menu.osId}` : '/oficina/plataforma/clientes?aba=orcamentos'} className="font-semibold text-brand-600 underline">abra {canOs ? 'a OS' : 'o orçamento'} nº {osNum(menu.number, menu.osId!)}</Link>.
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
