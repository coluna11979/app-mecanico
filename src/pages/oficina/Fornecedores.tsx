import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import WorkshopLayout from '@/components/layout/WorkshopLayout';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/components/ui/Toast';
import { canDo, useOperator } from '@/lib/operators';
import { fmtBRL, fmtPhone } from '@/components/os/osHelpers';
import { fmtCnpj, fmtDate, onlyDigits, type Supplier } from '@/lib/purchasing';
import { fetchAll } from '@/lib/fetchAll';
import StockTabs from '@/components/stock/StockTabs';

type Totals = Record<string, { open: number; lastBuy: string | null; bought: number; count: number }>;

export default function Fornecedores() {
  const { currentWorkshop } = useAuth();
  const wid = currentWorkshop?.id ?? null;
  const { balcao, session } = useOperator();
  const allowed = canDo(session, balcao, 'compras');

  const [list, setList]       = useState<Supplier[] | null>(null);
  const [totals, setTotals]   = useState<Totals>({});
  const [q, setQ]             = useState('');
  const [editing, setEditing] = useState<Supplier | 'new' | null>(null);

  const load = useCallback(async () => {
    if (!wid) return;
    const [s, inv, pay] = await Promise.all([
      supabase.from('suppliers').select('*').eq('workshop_id', wid).order('name'),
      fetchAll((a, b) => supabase.from('purchase_invoices').select('id, supplier_id, issue_date, total').eq('workshop_id', wid).eq('status', 'posted').order('id').range(a, b)),
      supabase.from('payables').select('supplier_id, amount').eq('workshop_id', wid).is('cancelled_at', null).is('paid_at', null).not('supplier_id', 'is', null),
    ]);
    const t: Totals = {};
    const row = (id: string) => (t[id] ??= { open: 0, lastBuy: null, bought: 0, count: 0 });
    for (const i of (inv.data ?? []) as { supplier_id: string; issue_date: string; total: number }[]) {
      const r = row(i.supplier_id);
      r.bought += Number(i.total);
      r.count++;
      if (!r.lastBuy || i.issue_date > r.lastBuy) r.lastBuy = i.issue_date;
    }
    for (const p of (pay.data ?? []) as { supplier_id: string; amount: number }[]) row(p.supplier_id).open += Number(p.amount);
    setTotals(t);
    setList((s.data as Supplier[]) ?? []);
  }, [wid]);

  useEffect(() => { if (allowed) load(); }, [load, allowed]);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    const d = onlyDigits(q);
    return (list ?? []).filter(s => !t || s.name.toLowerCase().includes(t) || s.contact?.toLowerCase().includes(t)
      || (d.length >= 3 && (onlyDigits(s.cnpj ?? '').includes(d) || onlyDigits(s.phone ?? '').includes(d))));
  }, [list, q]);

  if (!allowed) return <Restricted />;

  return (
    <WorkshopLayout>
      <div className="max-w-6xl mx-auto space-y-4">
        <StockTabs title="Fornecedores" subtitle="De quem você compra, quanto já comprou e quanto ainda deve."
          actions={<>
            <Link to="/oficina/compras/nova" className="btn-ghost border border-steel-200 text-sm !py-2">🧾 Lançar nota</Link>
            <button className="btn-primary text-sm !py-2" onClick={() => setEditing('new')}>+ Novo fornecedor</button>
          </>} />

        {list && list.length > 0 && (
          <input className="input" placeholder="Buscar por nome, vendedor, CNPJ ou telefone" value={q} onChange={e => setQ(e.target.value)} />
        )}

        {list === null ? (
          <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-16 bg-white rounded-2xl animate-pulse" />)}</div>
        ) : list.length === 0 ? (
          <div className="card text-center py-12">
            <div className="text-4xl mb-2">🚚</div>
            <h2 className="text-lg font-bold">Cadastre seus fornecedores</h2>
            <p className="text-sm text-steel-500 mt-1 max-w-md mx-auto">
              Com o fornecedor cadastrado, você lança a nota de compra e o sistema já coloca as peças no estoque e as parcelas nas contas a pagar.
            </p>
            <button className="btn-primary mt-5" onClick={() => setEditing('new')}>+ Cadastrar primeiro fornecedor</button>
          </div>
        ) : (
          <div className="card !p-0 overflow-hidden">
            <ul className="divide-y divide-steel-100">
              {shown.map(s => {
                const t = totals[s.id];
                return (
                  <li key={s.id} className={`px-5 py-3 flex flex-col md:flex-row md:items-center gap-2 md:gap-4 ${s.active ? '' : 'opacity-50'}`}>
                    <button className="min-w-0 text-left flex-1" onClick={() => setEditing(s)}>
                      <div className="text-sm font-semibold truncate">{s.name}{!s.active && <span className="badge bg-steel-100 text-steel-500 ml-2">inativo</span>}</div>
                      <div className="text-xs text-steel-500 truncate">
                        {[s.contact, s.phone && fmtPhone(s.phone), s.cnpj && fmtCnpj(s.cnpj), s.payment_days ? `prazo ${s.payment_days} dias` : 'à vista']
                          .filter(Boolean).join(' · ')}
                      </div>
                    </button>
                    <div className="grid grid-cols-3 md:flex md:items-center gap-3 md:gap-5 md:text-right">
                      <div className="md:w-28">
                        <div className="text-[10px] font-bold uppercase tracking-widest text-steel-400">Última compra</div>
                        <div className="text-sm">{t?.lastBuy ? fmtDate(t.lastBuy) : '—'}</div>
                      </div>
                      <div className="md:w-28">
                        <div className="text-[10px] font-bold uppercase tracking-widest text-steel-400">Comprado</div>
                        <div className="text-sm font-semibold">{fmtBRL(t?.bought ?? 0)}</div>
                      </div>
                      <div className="md:w-28">
                        <div className="text-[10px] font-bold uppercase tracking-widest text-steel-400">A pagar</div>
                        <div className={`text-sm font-bold ${t?.open ? 'text-pending-700' : 'text-steel-400'}`}>{fmtBRL(t?.open ?? 0)}</div>
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      {t?.count ? (
                        <Link to={`/oficina/compras?fornecedor=${s.id}`} className="flex-1 md:flex-none text-center text-xs font-semibold px-3 py-1.5 rounded-lg border border-steel-200 hover:bg-steel-50 text-steel-700">
                          Notas ({t.count})
                        </Link>
                      ) : null}
                      <Link to={`/oficina/compras/nova?fornecedor=${s.id}`} className="flex-1 md:flex-none text-center text-xs font-semibold px-3 py-1.5 rounded-lg bg-steel-100 hover:bg-steel-200 text-steel-700">
                        + Nota
                      </Link>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      {editing && wid && (
        <SupplierForm wid={wid} supplier={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
      )}
    </WorkshopLayout>
  );
}

export function Restricted() {
  return (
    <WorkshopLayout>
      <div className="max-w-md mx-auto card text-center py-12">
        <div className="text-4xl mb-2">🔒</div>
        <h1 className="text-lg font-bold">Área restrita</h1>
        <p className="text-sm text-steel-500 mt-1">Fornecedores pedem a permissão “Compras e fornecedores”. Peça ao gestor em Acessos e funções.</p>
      </div>
    </WorkshopLayout>
  );
}

export function SupplierForm({ wid, supplier, onClose, onSaved }: {
  wid: string; supplier: Supplier | null; onClose: () => void; onSaved: (s: Supplier) => void;
}) {
  const [name, setName]       = useState(supplier?.name ?? '');
  const [cnpj, setCnpj]       = useState(supplier?.cnpj ? fmtCnpj(supplier.cnpj) : '');
  const [phone, setPhone]     = useState(supplier?.phone ? fmtPhone(supplier.phone) : '');
  const [contact, setContact] = useState(supplier?.contact ?? '');
  const [days, setDays]       = useState(String(supplier?.payment_days ?? 0));
  const [notes, setNotes]     = useState(supplier?.notes ?? '');
  const [active, setActive]   = useState(supplier?.active ?? true);
  const [saving, setSaving]   = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return toast.error('Informe o nome do fornecedor');
    const d = Number(days || 0);
    if (!Number.isInteger(d) || d < 0 || d > 365) return toast.error('Prazo inválido (0 a 365 dias)');
    const row = {
      workshop_id: wid, name: name.trim(), cnpj: onlyDigits(cnpj) || null, phone: onlyDigits(phone) || null,
      contact: contact.trim() || null, payment_days: d, notes: notes.trim() || null, active,
    };
    setSaving(true);
    const { data, error } = supplier
      ? await supabase.from('suppliers').update(row).eq('id', supplier.id).select().single()
      : await supabase.from('suppliers').insert(row).select().single();
    setSaving(false);
    if (error) return toast.error('Não foi possível salvar: ' + error.message);
    toast.success(supplier ? 'Fornecedor atualizado ✓' : 'Fornecedor cadastrado ✓');
    onSaved(data as Supplier);
  }

  return (
    <div className="fixed inset-0 bg-steel-900/60 z-50 flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
      <form onSubmit={save} onClick={e => e.stopPropagation()}
        className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl max-h-[94vh] flex flex-col shadow-2xl">
        <div className="px-6 pt-5 pb-3 border-b border-steel-100 flex items-center justify-between">
          <h2 className="text-lg font-bold">{supplier ? 'Editar fornecedor' : 'Novo fornecedor'}</h2>
          <button type="button" onClick={onClose} className="h-8 w-8 rounded-lg grid place-items-center text-steel-500 hover:bg-steel-100">✕</button>
        </div>
        <div className="px-6 py-4 space-y-4 overflow-y-auto">
          <div>
            <label className="label">Nome / razão social *</label>
            <input className="input" autoFocus placeholder="Ex.: Distribuidora Auto Peças" value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">CNPJ</label>
              <input className="input" inputMode="numeric" placeholder="00.000.000/0000-00" value={cnpj}
                onChange={e => setCnpj(e.target.value)} onBlur={() => setCnpj(fmtCnpj(cnpj))} />
            </div>
            <div>
              <label className="label">Telefone / WhatsApp</label>
              <input className="input" inputMode="tel" placeholder="(11) 99999-9999" value={phone}
                onChange={e => setPhone(e.target.value)} onBlur={() => setPhone(fmtPhone(phone))} />
            </div>
            <div>
              <label className="label">Vendedor / contato</label>
              <input className="input" placeholder="Opcional" value={contact} onChange={e => setContact(e.target.value)} />
            </div>
            <div>
              <label className="label">Prazo de pagamento</label>
              <div className="relative">
                <input className="input !pr-14 text-right" inputMode="numeric" value={days} onChange={e => setDays(onlyDigits(e.target.value))} />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-steel-400 text-sm">dias</span>
              </div>
              <p className="text-[11px] text-steel-400 mt-1">0 = à vista. Sugere o vencimento na nota.</p>
            </div>
          </div>
          <div>
            <label className="label">Observações</label>
            <textarea className="input" rows={2} placeholder="Ex.: entrega terça e quinta" value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
          {supplier && (
            <label className="flex items-center gap-2 text-sm text-steel-700">
              <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} />
              Fornecedor ativo
            </label>
          )}
        </div>
        <div className="px-6 py-4 border-t border-steel-100 flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
          <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Salvando…' : supplier ? 'Salvar' : 'Cadastrar'}</button>
        </div>
      </form>
    </div>
  );
}
