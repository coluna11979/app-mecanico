import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import WorkshopLayout from '@/components/layout/WorkshopLayout';
import StockTabs, { useStockAccess } from '@/components/stock/StockTabs';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { fmtBRL } from '@/components/os/osHelpers';
import { fmtQty, partCategory, type PartCategory } from '@/lib/parts';

type Row = {
  id: string; qty: number; kind: 'transf_saida' | 'transf_entrada'; note: string | null; created_at: string;
  part: { name: string; code: string | null; unit: string; cost: number; category: PartCategory } | null;
};

const iso = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const PRESETS = [{ l: 'Hoje', d: 0 }, { l: '7 dias', d: 7 }, { l: '30 dias', d: 30 }, { l: '90 dias', d: 90 }, { l: '1 ano', d: 365 }];

type Sum = { items: number; units: number; value: number };
function SumCard({ title, tone, s }: { title: string; tone: string; s: Sum }) {
  return (
    <div className={`rounded-2xl border p-4 ${tone}`}>
      <div className="text-[11px] font-bold uppercase tracking-wider text-steel-500">{title}</div>
      <div className="text-2xl font-bold mt-1">{fmtBRL(s.value)}</div>
      <div className="text-xs text-steel-500 mt-0.5">{fmtQty(s.units)} unidade(s) · {s.items} peça(s) diferentes</div>
    </div>
  );
}

/** Relatório das transferências de peças entre as lojas: enviadas, recebidas, por loja e por período */
export default function TransferenciasEstoque() {
  const { currentWorkshop } = useAuth();
  const wid = currentWorkshop?.id ?? null;
  const access = useStockAccess();
  const [from, setFrom] = useState(() => iso(new Date(Date.now() - 30 * 86400000)));
  const [to, setTo] = useState(() => iso(new Date()));
  const [dir, setDir] = useState<'todas' | 'transf_saida' | 'transf_entrada'>('todas');
  const [store, setStore] = useState('');
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    if (!wid) return;
    setRows(null);
    supabase.from('stock_movements')
      .select('id, qty, kind, note, created_at, part:workshop_parts(name, code, unit, cost, category)')
      .eq('workshop_id', wid).in('kind', ['transf_saida', 'transf_entrada'])
      .gte('created_at', new Date(`${from}T00:00:00`).toISOString()).lte('created_at', new Date(`${to}T23:59:59`).toISOString())
      .order('created_at', { ascending: false }).limit(2000)
      .then(({ data }) => setRows((data as never) ?? []));
  }, [wid, from, to]);

  const otherStore = (r: Row) => (r.note ?? '').replace(/^Transferência (para|de) /, '').split(': ')[0];
  const obs = (r: Row) => (r.note?.includes(': ') ? r.note.split(': ').slice(1).join(': ') : '');
  const unitCost = (r: Row) => Number(r.part?.cost ?? 0);
  const value = (r: Row) => Math.abs(Number(r.qty)) * unitCost(r);

  const stores = useMemo(() => [...new Set((rows ?? []).map(otherStore))].sort(), [rows]);
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (rows ?? []).filter(r => (dir === 'todas' || r.kind === dir) && (!store || otherStore(r) === store)
      && (!t || r.part?.name.toLowerCase().includes(t) || r.part?.code?.toLowerCase().includes(t)));
  }, [rows, dir, store, q]);

  const sum = (k: Row['kind']): Sum => {
    const l = list.filter(r => r.kind === k);
    return { items: new Set(l.map(r => r.part?.name)).size, units: l.reduce((a, r) => a + Math.abs(Number(r.qty)), 0), value: l.reduce((a, r) => a + value(r), 0) };
  };
  const sent = sum('transf_saida'), got = sum('transf_entrada');
  const net = got.value - sent.value;

  const byStore = useMemo(() => {
    const m = new Map<string, { sent: number; got: number }>();
    for (const r of list) {
      const c = m.get(otherStore(r)) ?? { sent: 0, got: 0 };
      if (r.kind === 'transf_saida') c.sent += value(r); else c.got += value(r);
      m.set(otherStore(r), c);
    }
    return [...m.entries()];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list]);

  function exportCsv() {
    const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const head = ['Data', 'Hora', 'Movimento', 'Loja', 'Código', 'Peça', 'Categoria', 'Quantidade', 'Custo unitário', 'Valor', 'Observação'];
    const lines = list.map(r => {
      const d = new Date(r.created_at);
      return [d.toLocaleDateString('pt-BR'), d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        r.kind === 'transf_saida' ? 'Enviada' : 'Recebida', otherStore(r), r.part?.code ?? '', r.part?.name ?? '',
        r.part ? partCategory(r.part.category).label : '', Math.abs(Number(r.qty)).toString().replace('.', ','),
        unitCost(r).toFixed(2).replace('.', ','), value(r).toFixed(2).replace('.', ','), obs(r)].map(esc).join(';');
    });
    const blob = new Blob(['﻿' + [head.map(esc).join(';'), ...lines].join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `transferencias-${from}-a-${to}.csv`; a.click();
    URL.revokeObjectURL(a.href);
  }

  const preset = (d: number) => { setFrom(iso(new Date(Date.now() - d * 86400000))); setTo(iso(new Date())); };
  const activePreset = PRESETS.find(p => to === iso(new Date()) && from === iso(new Date(Date.now() - p.d * 86400000)))?.d;

  if (!access.pecas) return <WorkshopLayout><div className="max-w-md mx-auto card text-center py-12 text-sm text-steel-500">Pede a permissão “Peças e estoque”.</div></WorkshopLayout>;

  return (
    <WorkshopLayout>
      <div className="max-w-6xl mx-auto space-y-4">
        <StockTabs title="Transferências entre lojas" subtitle={`O que ${currentWorkshop?.business_name ?? 'esta loja'} enviou e recebeu das outras lojas. Valores a preço de custo.`}
          actions={<>
            <Link to="/oficina/pecas" className="btn-ghost border border-steel-200 text-sm !py-2">← Peças</Link>
            <button className="btn-primary text-sm !py-2" onClick={exportCsv} disabled={!list.length}>⬇ Baixar planilha</button>
          </>} />

        {/* Período e filtros */}
        <div className="card space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {PRESETS.map(p => (
              <button key={p.d} onClick={() => preset(p.d)}
                className={`text-xs font-semibold px-3 py-1.5 rounded-full border ${activePreset === p.d ? 'bg-steel-900 text-white border-steel-900' : 'bg-white text-steel-600 border-steel-200'}`}>{p.l}</button>
            ))}
            <span className="flex items-center gap-1.5 text-xs text-steel-500 sm:ml-auto">
              de <input type="date" className="input !py-1.5 !w-auto text-sm" value={from} max={to} onChange={e => e.target.value && setFrom(e.target.value)} />
              até <input type="date" className="input !py-1.5 !w-auto text-sm" value={to} min={from} onChange={e => e.target.value && setTo(e.target.value)} />
            </span>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <input className="input flex-1" placeholder="🔍 Buscar peça ou código" value={q} onChange={e => setQ(e.target.value)} />
            <select className="input !py-2 sm:!w-auto text-sm" value={dir} onChange={e => setDir(e.target.value as typeof dir)}>
              <option value="todas">Enviadas e recebidas</option>
              <option value="transf_saida">Só enviadas</option>
              <option value="transf_entrada">Só recebidas</option>
            </select>
            {stores.length > 1 && (
              <select className="input !py-2 sm:!w-auto text-sm" value={store} onChange={e => setStore(e.target.value)}>
                <option value="">Todas as lojas</option>
                {stores.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            )}
          </div>
        </div>

        {rows === null ? (
          <div className="grid sm:grid-cols-3 gap-3">{[1, 2, 3].map(i => <div key={i} className="h-24 bg-white rounded-2xl animate-pulse" />)}</div>
        ) : (
          <>
            <div className="grid sm:grid-cols-3 gap-3">
              <SumCard title="Enviadas" tone="bg-alert-50/60 border-alert-100" s={sent} />
              <SumCard title="Recebidas" tone="bg-signal-50/60 border-signal-100" s={got} />
              <div className="rounded-2xl border p-4 bg-white border-steel-200">
                <div className="text-[11px] font-bold uppercase tracking-wider text-steel-500">Saldo (recebido − enviado)</div>
                <div className={`text-2xl font-bold mt-1 ${net > 0 ? 'text-signal-700' : net < 0 ? 'text-alert-600' : ''}`}>{net > 0 ? '+' : ''}{fmtBRL(net)}</div>
                <div className="text-xs text-steel-500 mt-0.5">{net > 0 ? 'Esta loja recebeu mais do que mandou' : net < 0 ? 'Esta loja mandou mais do que recebeu' : 'Troca equilibrada'}</div>
              </div>
            </div>

            {byStore.length > 0 && (
              <div className="card !p-0 overflow-hidden">
                <div className="px-5 py-2 bg-steel-50 border-b border-steel-100 text-[10px] font-bold text-steel-500 uppercase tracking-wider">Por loja</div>
                <ul className="divide-y divide-steel-100 text-sm">
                  {byStore.map(([name, v]) => (
                    <li key={name} className="px-5 py-2.5 flex flex-wrap items-center justify-between gap-2">
                      <strong>{name}</strong>
                      <span className="text-steel-600">enviou <strong className="text-alert-600">{fmtBRL(v.sent)}</strong> · recebeu <strong className="text-signal-700">{fmtBRL(v.got)}</strong></span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {list.length === 0 ? (
              <div className="card text-center py-10 text-sm text-steel-500">Nenhuma transferência neste período.</div>
            ) : (
              <div className="card !p-0 overflow-hidden">
                <div className="hidden md:grid grid-cols-[110px_minmax(0,1fr)_110px_140px_90px_100px] gap-3 px-5 py-2 bg-steel-50 border-b border-steel-100 text-[10px] font-bold text-steel-500 uppercase tracking-wider">
                  <div>Data</div><div>Peça</div><div>Movimento</div><div>Loja</div><div className="text-right">Qtd.</div><div className="text-right">Valor</div>
                </div>
                <ul className="divide-y divide-steel-100">
                  {list.map(r => {
                    const out = r.kind === 'transf_saida';
                    const d = new Date(r.created_at);
                    return (
                      <li key={r.id} className="grid grid-cols-2 md:grid-cols-[110px_minmax(0,1fr)_110px_140px_90px_100px] gap-x-3 gap-y-1 px-5 py-2.5 items-center text-sm">
                        <div className="text-xs text-steel-500">{d.toLocaleDateString('pt-BR')}<span className="text-steel-400"> {d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span></div>
                        <div className="col-span-2 md:col-span-1 order-last md:order-none min-w-0">
                          <div className="font-semibold truncate">{r.part?.name ?? 'Peça removida'}</div>
                          <div className="text-[11px] text-steel-500 truncate">{[r.part?.code, r.part && partCategory(r.part.category).label, obs(r)].filter(Boolean).join(' · ')}</div>
                        </div>
                        <div><span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${out ? 'bg-alert-50 text-alert-700' : 'bg-signal-50 text-signal-700'}`}>{out ? '↑ Enviada' : '↓ Recebida'}</span></div>
                        <div className="text-steel-600 truncate">{out ? 'para ' : 'de '}{otherStore(r)}</div>
                        <div className={`md:text-right font-semibold ${out ? 'text-alert-600' : 'text-signal-700'}`}>{out ? '−' : '+'}{fmtQty(Math.abs(Number(r.qty)))} {r.part?.unit}</div>
                        <div className="text-right text-steel-700">{fmtBRL(value(r))}</div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </WorkshopLayout>
  );
}
