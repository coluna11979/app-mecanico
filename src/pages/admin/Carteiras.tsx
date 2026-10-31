import { Fragment, useEffect, useMemo, useState } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { supabase } from '@/lib/supabase';
import { formatBRL } from '@/lib/payment';
import { getWalletConfig, KIND_LABEL, type WalletEntry } from '@/lib/wallet';

type Row = { workshop_id: string; business_name: string; cash: number; credit: number; total: number; last_at: string | null };
type Shop = { id: string; business_name: string };
type Action = 'credit' | 'withdrawal' | 'adjustment';

const ACTIONS: Record<Action, { label: string; hint: string }> = {
  credit:     { label: '🎁 Liberar crédito',  hint: 'Crédito da plataforma (incentivo, investidor). Só vale para demandas e não pode ser sacado.' },
  withdrawal: { label: '⬇️ Registrar saque',  hint: 'Você já fez o PIX para a oficina: tira do dinheiro dela na carteira.' },
  adjustment: { label: '✏️ Ajuste',           hint: 'Correção manual. Use valor negativo para tirar.' },
};

/**
 * Carteiras das oficinas: quem controla o saldo somos nós (a NextPay só recebe os depósitos).
 * Dinheiro = depositado pela oficina (devolvemos se pedir); crédito = liberado pela plataforma.
 */
export default function AdminCarteiras() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [shops, setShops] = useState<Shop[]>([]);
  const [open, setOpen] = useState<string | null>(null);           // oficina com o extrato aberto
  const [entries, setEntries] = useState<WalletEntry[] | null>(null);

  // Lançamento
  const [shopId, setShopId] = useState('');
  const [search, setSearch] = useState('');
  const [action, setAction] = useState<Action>('credit');
  const [bucket, setBucket] = useState<'cash' | 'credit'>('credit');
  const [value, setValue] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function load() {
    const { data } = await supabase.rpc('wallet_admin_overview');
    setRows(((data ?? []) as Row[]).map(r => ({ ...r, cash: Number(r.cash), credit: Number(r.credit), total: Number(r.total) })));
  }

  useEffect(() => {
    load();
    getWalletConfig().then(c => setEnabled(c.enabled));
    supabase.from('workshops').select('id, business_name').order('business_name')
      .then(({ data }) => setShops((data ?? []) as Shop[]));
  }, []);

  useEffect(() => {
    if (!open) { setEntries(null); return; }
    setEntries(null);
    supabase.from('workshop_wallet_entries').select('*').eq('workshop_id', open)
      .order('created_at', { ascending: false }).limit(200)
      .then(({ data }) => setEntries((data ?? []) as WalletEntry[]));
  }, [open, rows]);

  const totals = useMemo(() => (rows ?? []).reduce((t, r) => ({ cash: t.cash + r.cash, credit: t.credit + r.credit }), { cash: 0, credit: 0 }), [rows]);
  const found = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? shops.filter(s => s.business_name?.toLowerCase().includes(q)).slice(0, 8) : [];
  }, [search, shops]);
  const shopName = shops.find(s => s.id === shopId)?.business_name;

  function pick(a: Action) {
    setAction(a);
    setBucket(a === 'credit' ? 'credit' : 'cash');
    setMsg(null);
  }

  async function submit() {
    const raw = Number(value.replace(/\./g, '').replace(',', '.'));
    if (!shopId || !raw || !note.trim()) return;
    const amount = action === 'withdrawal' ? -Math.abs(raw) : action === 'credit' ? Math.abs(raw) : raw;
    setSaving(true);
    setMsg(null);
    const { error } = await supabase.rpc('wallet_admin_entry', {
      p_workshop_id: shopId, p_kind: action, p_bucket: bucket, p_amount: amount, p_note: note.trim(),
    });
    setSaving(false);
    if (error) { setMsg({ ok: false, text: error.message }); return; }
    setMsg({ ok: true, text: `Lançado: R$ ${formatBRL(Math.abs(amount))} para ${shopName}.` });
    setValue('');
    setNote('');
    load();
  }

  return (
    <AdminLayout>
      <div className="max-w-5xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-steel-900">Carteiras</h1>
          <p className="text-sm text-steel-500 mt-1">Saldo pré-pago das oficinas. Depósitos entram pela NextPay; crédito, ajustes e saques são lançados aqui.</p>
        </div>

        {enabled === false && (
          <div className="rounded-xl border border-pending-300 bg-pending-500/10 px-4 py-3 text-sm text-steel-800">
            A carteira está <b>desligada</b> para as oficinas. Ligue em Configurações → Carteira quando quiser liberar.
            Você já pode lançar crédito aqui: ele aparece para a oficina quando a carteira for ligada.
          </div>
        )}

        <div className="grid sm:grid-cols-3 gap-3">
          <div className="card">
            <div className="text-xs uppercase tracking-widest font-bold text-steel-500">Dinheiro das oficinas</div>
            <div className="text-2xl font-bold mt-1">R$ {formatBRL(totals.cash)}</div>
            <div className="text-xs text-steel-500 mt-1">Depositado e não usado: precisa estar na conta para devolver se pedirem.</div>
          </div>
          <div className="card">
            <div className="text-xs uppercase tracking-widest font-bold text-steel-500">Crédito liberado em aberto</div>
            <div className="text-2xl font-bold mt-1">R$ {formatBRL(totals.credit)}</div>
            <div className="text-xs text-steel-500 mt-1">Incentivo da plataforma ainda não usado.</div>
          </div>
          <div className="card">
            <div className="text-xs uppercase tracking-widest font-bold text-steel-500">Oficinas com carteira</div>
            <div className="text-2xl font-bold mt-1">{rows?.length ?? '–'}</div>
          </div>
        </div>

        {/* Lançar */}
        <div className="card space-y-4">
          <h2 className="text-lg font-bold">Lançar na carteira</h2>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(ACTIONS) as Action[]).map(a => (
              <button key={a} onClick={() => pick(a)}
                className={`px-3 py-2 rounded-xl border-2 text-sm font-semibold ${action === a ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-steel-200 text-steel-600'}`}>
                {ACTIONS[a].label}
              </button>
            ))}
          </div>
          <p className="text-xs text-steel-500 -mt-2">{ACTIONS[action].hint}</p>

          <div className="grid sm:grid-cols-2 gap-3">
            <div className="relative">
              <label className="text-xs font-semibold text-steel-500 uppercase tracking-wider mb-1 block">Oficina</label>
              {shopId ? (
                <div className="input flex items-center justify-between">
                  <span className="truncate">{shopName}</span>
                  <button onClick={() => { setShopId(''); setSearch(''); }} className="text-xs font-semibold text-steel-500">trocar</button>
                </div>
              ) : (
                <>
                  <input className="input" placeholder="Buscar pelo nome…" value={search} onChange={e => setSearch(e.target.value)} />
                  {found.length > 0 && (
                    <div className="absolute z-10 mt-1 w-full bg-white rounded-xl shadow-lg ring-1 ring-steel-200 overflow-hidden">
                      {found.map(s => (
                        <button key={s.id} onClick={() => { setShopId(s.id); setSearch(''); }}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-steel-50">{s.business_name}</button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
            <div>
              <label className="text-xs font-semibold text-steel-500 uppercase tracking-wider mb-1 block">Valor (R$)</label>
              <input className="input" inputMode="decimal" placeholder={action === 'adjustment' ? 'ex.: 50 ou -50' : 'ex.: 500'}
                value={value} onChange={e => setValue(e.target.value.replace(action === 'adjustment' ? /[^\d,.-]/g : /[^\d,.]/g, ''))} />
            </div>
            {action === 'adjustment' && (
              <div>
                <label className="text-xs font-semibold text-steel-500 uppercase tracking-wider mb-1 block">Em qual saldo</label>
                <select className="input" value={bucket} onChange={e => setBucket(e.target.value as 'cash' | 'credit')}>
                  <option value="cash">Dinheiro da oficina</option>
                  <option value="credit">Crédito da plataforma</option>
                </select>
              </div>
            )}
            <div className={action === 'adjustment' ? '' : 'sm:col-span-2'}>
              <label className="text-xs font-semibold text-steel-500 uppercase tracking-wider mb-1 block">Motivo (aparece no extrato da oficina)</label>
              <input className="input" placeholder={action === 'credit' ? 'ex.: Crédito de boas-vindas' : action === 'withdrawal' ? 'ex.: PIX de devolução em 30/10' : 'ex.: Correção de depósito'}
                value={note} onChange={e => setNote(e.target.value)} />
            </div>
          </div>
          {msg && <p className={`text-sm rounded-lg px-3 py-2 ${msg.ok ? 'bg-signal-500/10 text-signal-700' : 'bg-alert-50 text-alert-700'}`}>{msg.ok ? '✅' : '⚠️'} {msg.text}</p>}
          <button onClick={submit} disabled={saving || !shopId || !value || !note.trim()} className="btn-primary disabled:opacity-50">
            {saving ? 'Lançando…' : 'Lançar'}
          </button>
        </div>

        {/* Saldos */}
        <div className="card p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-steel-50 text-xs uppercase tracking-wider text-steel-500">
              <tr>
                <th className="text-left px-4 py-3">Oficina</th>
                <th className="text-right px-4 py-3">Dinheiro</th>
                <th className="text-right px-4 py-3">Crédito</th>
                <th className="text-right px-4 py-3">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-steel-100">
              {rows === null ? (
                <tr><td colSpan={4} className="px-4 py-6 text-center text-steel-400">Carregando…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={4} className="px-4 py-6 text-center text-steel-400">Nenhuma oficina movimentou a carteira ainda.</td></tr>
              ) : rows.map(r => (
                <Fragment key={r.workshop_id}>
                  <tr onClick={() => setOpen(o => (o === r.workshop_id ? null : r.workshop_id))} className="cursor-pointer hover:bg-steel-50">
                    <td className="px-4 py-3 font-semibold">{open === r.workshop_id ? '▾' : '▸'} {r.business_name}</td>
                    <td className="px-4 py-3 text-right tabular-nums">R$ {formatBRL(r.cash)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">R$ {formatBRL(r.credit)}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-bold">R$ {formatBRL(r.total)}</td>
                  </tr>
                  {open === r.workshop_id && (
                    <tr>
                      <td colSpan={4} className="bg-steel-50/60 px-4 py-3">
                        {entries === null ? <p className="text-steel-400">Carregando extrato…</p> : (
                          <ul className="divide-y divide-steel-200/70">
                            {entries.map(e => (
                              <li key={e.id} className="flex items-center gap-3 py-2">
                                <span>{KIND_LABEL[e.kind].icon}</span>
                                <span className="flex-1 min-w-0 truncate">
                                  <b>{KIND_LABEL[e.kind].label}</b>
                                  {e.bucket === 'credit' && <span className="ml-1 text-[10px] font-bold uppercase bg-brand-50 text-brand-700 rounded-full px-1.5 py-0.5">crédito</span>}
                                  <span className="text-steel-500"> · {e.note} · {new Date(e.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                                </span>
                                <span className={`tabular-nums font-bold ${Number(e.amount) > 0 ? 'text-signal-700' : ''}`}>
                                  {Number(e.amount) > 0 ? '+' : '−'} R$ {formatBRL(Math.abs(Number(e.amount)))}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AdminLayout>
  );
}
