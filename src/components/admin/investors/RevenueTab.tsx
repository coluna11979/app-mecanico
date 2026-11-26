import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from '@/components/ui/Toast';
import { brl, maskMoney, monthLabel, monthsFrom, numToInput, toNum, type Closing } from '@/lib/investors';

type RType = { key: string; label: string; auto: boolean; sort: number };
type Entry = { month: string; type_key: string; amount: number };

const firstOfMonth = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
const prevOf = (m: string) => { const [y, mo] = m.split('-').map(Number); return firstOfMonth(new Date(y, mo - 2, 1)); };
const slug = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 30);

/** Receitas do mês por tipo: sugeridas, com o mês anterior ao lado e o valor já sugerido a partir dele */
export default function RevenueTab({ closings }: { closings: Closing[] }) {
  const [month, setMonth] = useState(firstOfMonth());
  const [types, setTypes] = useState<RType[]>([]);
  const [cur, setCur] = useState<Record<string, number>>({});     // salvo neste mês
  const [prev, setPrev] = useState<Record<string, number>>({});   // mês anterior
  const [appsCur, setAppsCur] = useState<number | null>(null);
  const [appsPrev, setAppsPrev] = useState<number | null>(null);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [suggested, setSuggested] = useState<Set<string>>(new Set());
  const [newType, setNewType] = useState('');
  const [newVal, setNewVal] = useState('');
  const [adding, setAdding] = useState(false);
  const closed = closings.some(c => c.month === month);
  const pm = prevOf(month);

  const loadTypes = useCallback(async () => {
    const { data } = await supabase.from('investor_revenue_types').select('key,label,auto,sort').eq('active', true).order('sort');
    setTypes((data ?? []) as RType[]);
  }, []);
  useEffect(() => { loadTypes(); }, [loadTypes]);

  useEffect(() => {
    (async () => {
      setAppsCur(null); setAppsPrev(null);
      const [e, a1, a2] = await Promise.all([
        supabase.from('investor_revenue_entries').select('month,type_key,amount').in('month', [month, pm]),
        supabase.rpc('investor_platform_revenue', { p_month: month }),
        supabase.rpc('investor_platform_revenue', { p_month: pm }),
      ]);
      const rows = ((e.data ?? []) as Entry[]).map(x => ({ ...x, amount: Number(x.amount) }));
      setCur(Object.fromEntries(rows.filter(r => r.month === month).map(r => [r.type_key, r.amount])));
      setPrev(Object.fromEntries(rows.filter(r => r.month === pm).map(r => [r.type_key, r.amount])));
      if (!a1.error) setAppsCur(Number(a1.data));
      if (!a2.error) setAppsPrev(Number(a2.data));
    })();
  }, [month, pm]);

  // Sugestão: o que não foi salvo no mês vem preenchido com o valor do mês anterior
  useEffect(() => {
    const v: Record<string, string> = {}; const sug = new Set<string>();
    types.filter(t => !t.auto).forEach(t => {
      if (cur[t.key] !== undefined) v[t.key] = numToInput(cur[t.key]);
      else if (prev[t.key] !== undefined && !closed) { v[t.key] = numToInput(prev[t.key]); sug.add(t.key); }
      else v[t.key] = '';
    });
    setVals(v); setSuggested(sug);
  }, [types, cur, prev, closed]);

  const manualTypes = useMemo(() => types.filter(t => !t.auto), [types]);
  const total = (appsCur ?? 0) + manualTypes.reduce((s, t) => s + toNum(vals[t.key] ?? ''), 0);
  const totalPrev = (appsPrev ?? 0) + manualTypes.reduce((s, t) => s + (prev[t.key] ?? 0), 0);

  function change(k: string, v: string) {
    setVals(p => ({ ...p, [k]: maskMoney(v) }));
    setSuggested(s => { const n = new Set(s); n.delete(k); return n; });
  }
  function bringPrevious() {
    const v: Record<string, string> = { ...vals }; const sug = new Set<string>();
    manualTypes.forEach(t => { if (prev[t.key] !== undefined) { v[t.key] = numToInput(prev[t.key]); sug.add(t.key); } });
    setVals(v); setSuggested(sug);
  }
  async function save() {
    const rows = manualTypes.filter(t => (vals[t.key] ?? '') !== '')
      .map(t => ({ month, type_key: t.key, amount: toNum(vals[t.key]) }));
    if (!rows.length) return toast.error('Preencha ao menos um tipo.');
    const { error } = await supabase.from('investor_revenue_entries').upsert(rows);
    if (error) return toast.error('Não salvou: ' + error.message);
    setCur(Object.fromEntries(rows.map(r => [r.type_key, r.amount])));
    toast.success('Receitas de ' + monthLabel(month) + ' salvas');
  }
  async function addType() {
    const label = newType.trim();
    if (label.length < 3) return toast.error('Dê um nome ao tipo de receita.');
    let key = slug(label) || 'tipo';
    if (types.some(t => t.key === key)) key += '_' + Date.now().toString(36).slice(-3);
    const { error } = await supabase.from('investor_revenue_types').insert({ key, label, auto: false, sort: 80 });
    if (error) return toast.error('Não criou: ' + error.message);
    // Se já digitou um valor, grava no mês aberto
    if (toNum(newVal) > 0 && !closed) {
      const { error: e2 } = await supabase.from('investor_revenue_entries').upsert({ month, type_key: key, amount: toNum(newVal) });
      if (e2) toast.error('Tipo criado, mas o valor não salvou: ' + e2.message);
      else setCur(c => ({ ...c, [key]: toNum(newVal) }));
    }
    setNewType(''); setNewVal(''); setAdding(false); loadTypes();
    toast.success('Nova receita adicionada');
  }

  const options = Array.from({ length: 18 }, (_, i) => firstOfMonth(new Date(new Date().getFullYear(), new Date().getMonth() - i, 1)));
  const delta = (a: number, b: number) => (b > 0 ? ((a - b) / b) * 100 : null);
  const Delta = ({ a, b }: { a: number; b: number }) => {
    const d = delta(a, b);
    if (d === null) return <span className="text-steel-400">—</span>;
    return <span className={d >= 0 ? 'text-green-600' : 'text-alert-500'}>{d >= 0 ? '▲' : '▼'} {Math.abs(d).toFixed(0)}%</span>;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <select className="input max-w-[12rem]" value={month} onChange={e => setMonth(e.target.value)}>
          {options.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
        </select>
        <span className="text-xs text-steel-500">comparando com {monthLabel(pm)}</span>
      </div>

      <section className="rounded-xl border border-steel-200 dark:border-steel-700 p-4">
        <div className="flex items-end justify-between gap-3 flex-wrap">
          <div>
            <div className="text-xs text-steel-500">Receita total de {monthLabel(month)}</div>
            <div className="text-3xl font-bold tabular-nums">{brl(total)}</div>
          </div>
          <div className="flex items-center gap-4 flex-wrap">
            <div className="text-sm text-right">
              <div className="text-xs text-steel-500">{monthLabel(pm)}: {brl(totalPrev)}</div>
              <Delta a={total} b={totalPrev} />
            </div>
            {!closed && (
              <button className="btn-primary min-h-[44px]" onClick={() => setAdding(true)}>+ Nova receita</button>
            )}
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm min-w-[520px]">
            <thead><tr className="text-left text-xs text-steel-500">
              <th className="py-1">Tipo de receita</th><th className="text-right">{monthLabel(pm)}</th><th className="pl-3">{monthLabel(month)}</th><th className="text-right">Variação</th>
            </tr></thead>
            <tbody>
              {types.filter(t => t.auto).map(t => (
                <tr key={t.key} className="border-t border-steel-200 dark:border-steel-700">
                  <td className="py-2">{t.label} <span className="ml-1 text-[10px] rounded-full bg-steel-100 dark:bg-steel-700 px-2 py-0.5">automático</span></td>
                  <td className="text-right tabular-nums text-steel-500">{appsPrev === null ? '…' : brl(appsPrev)}</td>
                  <td className="pl-3 tabular-nums font-semibold">{appsCur === null ? '…' : brl(appsCur)}</td>
                  <td className="text-right"><Delta a={appsCur ?? 0} b={appsPrev ?? 0} /></td>
                </tr>
              ))}
              {manualTypes.map(t => (
                <tr key={t.key} className="border-t border-steel-200 dark:border-steel-700">
                  <td className="py-2">{t.label}</td>
                  <td className="text-right tabular-nums text-steel-500">{prev[t.key] === undefined ? '—' : brl(prev[t.key])}</td>
                  <td className="pl-3 py-1">
                    <input className={`input !py-1 ${suggested.has(t.key) ? 'text-steel-400' : ''}`} inputMode="decimal" disabled={closed}
                      value={vals[t.key] ?? ''} placeholder="0" onChange={e => change(t.key, e.target.value)} />
                    {suggested.has(t.key) && <span className="text-[10px] text-steel-400">sugerido pelo mês anterior</span>}
                  </td>
                  <td className="text-right"><Delta a={toNum(vals[t.key] ?? '')} b={prev[t.key] ?? 0} /></td>
                </tr>
              ))}
              {adding && !closed && (
                <tr className="border-t border-brand-500/40 bg-brand-500/5">
                  <td className="py-2 pr-2" colSpan={2}>
                    <input className="input !py-1" autoFocus placeholder="Nome da nova receita (ex.: Parcerias)" value={newType}
                      onChange={e => setNewType(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addType(); }} />
                  </td>
                  <td className="pl-3 py-1">
                    <input className="input !py-1" inputMode="decimal" placeholder="Valor do mês (opcional)" value={newVal}
                      onChange={e => setNewVal(maskMoney(e.target.value))} onKeyDown={e => { if (e.key === 'Enter') addType(); }} />
                  </td>
                  <td className="text-right whitespace-nowrap">
                    <button className="text-brand-600 font-semibold px-2 min-h-[44px]" onClick={addType}>Adicionar</button>
                    <button className="text-steel-500 px-2 min-h-[44px]" onClick={() => { setAdding(false); setNewType(''); setNewVal(''); }}>Cancelar</button>
                  </td>
                </tr>
              )}
              <tr className="border-t-2 border-steel-300 dark:border-steel-600 font-semibold">
                <td className="py-2">Total</td><td className="text-right tabular-nums">{brl(totalPrev)}</td><td className="pl-3 tabular-nums">{brl(total)}</td><td className="text-right"><Delta a={total} b={totalPrev} /></td>
              </tr>
            </tbody>
          </table>
        </div>

        {closed ? <p className="mt-3 text-xs text-steel-500">Mês fechado: valores congelados.</p> : (
          <div className="mt-4 flex gap-3 flex-wrap">
            <button className="btn-primary" onClick={save}>Salvar receitas</button>
            <button className="btn-ghost" onClick={bringPrevious}>Trazer valores do mês anterior</button>
            <button className="btn-ghost" onClick={() => setAdding(true)}>+ Nova receita</button>
          </div>
        )}
        <p className="mt-3 text-xs text-steel-500">
          A margem das demandas é calculada pelo sistema, só serviço pago pela oficina (sem taxa do cartão), e não inclui crédito de incentivo
          nem o dinheiro do mecânico. Os outros tipos você digita; o que não foi salvo no mês já vem sugerido pelo mês anterior.
        </p>
      </section>

    </div>
  );
}
