import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import WorkshopLayout from '@/components/layout/WorkshopLayout';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/components/ui/Toast';
import { canDo, useOperator } from '@/lib/operators';
import { fmtBRL, moneyInput, parseMoney } from '@/components/os/osHelpers';
import {
  DEFAULT_MARGIN, UNITS, fmtQty, loadDefaultMargin, partCategory, priceModeOf, salePriceOf, type PartCategory, type WorkshopPart,
} from '@/lib/parts';
import { addDaysISO, fmtDate, splitInstallments, todayISO, type Supplier } from '@/lib/purchasing';
import { Restricted, SupplierForm } from './Fornecedores';
import { hasAiInvoice, parseNfeXml, readInvoiceWithAi, type InvoiceData } from '@/lib/invoiceImport';

type Row = { key: string; part_id: string | null; name: string; unit: string; quantity: string; unit_cost: string };
type Inst = { due_date: string; amount: string };

let seq = 0;
const newRow = (): Row => ({ key: `r${++seq}`, part_id: null, name: '', unit: 'un', quantity: '1', unit_cost: '' });
const num = (s: string) => { const n = parseMoney(s); return Number.isFinite(n) ? n : 0; };
/** Custo unitário com até 4 casas (nota de autopeças costuma ter centavos quebrados) */
const costInput = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
const onlyDigits = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '');

export default function CompraNova() {
  const { currentWorkshop } = useAuth();
  const wid = currentWorkshop?.id ?? null;
  const { balcao, session } = useOperator();
  const allowed = canDo(session, balcao, 'compras');
  const nav = useNavigate();
  const [params] = useSearchParams();

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [parts, setParts]         = useState<WorkshopPart[]>([]);
  const [margin, setMargin]       = useState(DEFAULT_MARGIN);
  const [supplierId, setSupplierId] = useState(params.get('fornecedor') ?? '');
  const [number, setNumber]       = useState('');
  const [date, setDate]           = useState(todayISO());
  const [freight, setFreight]     = useState('');
  const [discount, setDiscount]   = useState('');
  const [notes, setNotes]         = useState('');
  const [rows, setRows]           = useState<Row[]>([newRow()]);
  const [count, setCount]         = useState(1);
  const [firstDue, setFirstDue]   = useState(todayISO());
  const [insts, setInsts]         = useState<Inst[]>([]);
  const [newSupplier, setNewSupplier] = useState(false);
  const [saving, setSaving]       = useState(false);
  // Importar arquivo da nota (XML sem IA; PDF com IA, se liberado)
  const [aiEnabled, setAiEnabled] = useState(false);
  const [reading, setReading]     = useState<null | 'xml' | 'ia'>(null);
  const [imported, setImported]   = useState<InvoiceData | null>(null);
  const [missingSupplier, setMissingSupplier] = useState<InvoiceData['supplier'] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  /** Parcelas que vieram na nota — usadas enquanto batem com o total e o 1º vencimento */
  const importedInsts = useRef<{ due: string; amount: number }[] | null>(null);

  useEffect(() => {
    if (!wid || !allowed) return;
    (async () => {
      const [s, p, m] = await Promise.all([
        supabase.from('suppliers').select('*').eq('workshop_id', wid).eq('active', true).order('name'),
        supabase.from('workshop_parts').select('*').eq('workshop_id', wid).eq('active', true).order('name'),
        loadDefaultMargin(wid),
      ]);
      setSuppliers((s.data as Supplier[]) ?? []);
      setParts((p.data as WorkshopPart[]) ?? []);
      setMargin(m);
    })();
    hasAiInvoice(wid).then(setAiEnabled);
  }, [wid, allowed]);

  const supplier = suppliers.find(s => s.id === supplierId) ?? null;
  const byName = useMemo(() => new Map(parts.map(p => [p.name.trim().toLowerCase(), p])), [parts]);
  const byId = useMemo(() => new Map(parts.map(p => [p.id, p])), [parts]);

  const itemsTotal = rows.reduce((a, r) => a + num(r.quantity) * num(r.unit_cost), 0);
  const total = Math.round((itemsTotal + num(freight) - num(discount)) * 100) / 100;

  // Vencimento sugerido pelo prazo do fornecedor
  useEffect(() => { setFirstDue(addDaysISO(date, supplier?.payment_days ?? 0)); }, [date, supplier?.payment_days]);
  // Parcelas refeitas quando muda total, quantidade ou 1º vencimento
  useEffect(() => {
    const fromNote = importedInsts.current;
    if (fromNote && fromNote.length === count && fromNote[0]?.due === firstDue
      && Math.abs(fromNote.reduce((a, i) => a + i.amount, 0) - total) < 0.011) {
      setInsts(fromNote.map(i => ({ due_date: i.due, amount: moneyInput(i.amount) })));
      return;
    }
    setInsts(total > 0
      ? splitInstallments(total, count, firstDue).map(i => ({ due_date: i.due_date, amount: moneyInput(i.amount) }))
      : []);
  }, [total, count, firstDue]);

  const instTotal = insts.reduce((a, i) => a + num(i.amount), 0);
  const instOk = insts.length > 0 && Math.abs(instTotal - total) < 0.01;

  // O que falta para poder lançar (texto do botão enquanto não dá)
  const missing = !supplierId ? 'Escolha o fornecedor'
    : !rows.some(r => r.name.trim()) ? 'Adicione as peças da nota'
    : total <= 0 ? 'Informe o custo das peças'
    : '';
  const ready = !missing;

  // Categoria que a peça nova vai ganhar — a mesma regra do banco (guess_part_category)
  const [guess, setGuess] = useState<Record<string, PartCategory>>({});
  const newNames = rows.filter(r => !r.part_id && r.name.trim().length >= 3).map(r => r.name.trim());
  const pending = newNames.filter(n => !(n in guess)).join('\n');
  useEffect(() => {
    if (!pending) return;
    const t = setTimeout(async () => {
      const found: Record<string, PartCategory> = {};
      await Promise.all(pending.split('\n').map(async n => {
        const { data } = await supabase.rpc('guess_part_category', { p_name: n });
        if (data) found[n] = data as PartCategory;
      }));
      setGuess(g => ({ ...g, ...found }));
    }, 500);
    return () => clearTimeout(t);
  }, [pending]);

  function update(key: string, patch: Partial<Row>) {
    setRows(rs => rs.map(r => {
      if (r.key !== key) return r;
      const next = { ...r, ...patch };
      if (patch.name !== undefined) {
        const p = byName.get(patch.name.trim().toLowerCase());
        if (p) {
          next.part_id = p.id;
          next.unit = p.unit;
          if (!r.unit_cost) next.unit_cost = moneyInput(Number(p.cost));
        } else {
          next.part_id = null;
        }
      }
      return next;
    }));
  }

  /** Preenche a tela com o que veio do arquivo da nota */
  function applyInvoice(d: InvoiceData) {
    // Fornecedor: pelo CNPJ; senão pelo nome
    const cnpj = onlyDigits(d.supplier.cnpj);
    const sup = (cnpj && suppliers.find(s => onlyDigits(s.cnpj) === cnpj))
      || suppliers.find(s => s.name.trim().toLowerCase() === d.supplier.name.trim().toLowerCase());
    if (sup) { setSupplierId(sup.id); setMissingSupplier(null); }
    else { setSupplierId(''); setMissingSupplier(d.supplier.name ? d.supplier : null); }
    if (d.number) setNumber(d.number);
    if (d.date) setDate(d.date);
    // Peças: pelo código do fornecedor; senão pelo nome; senão peça nova
    const byCode = new Map(parts.filter(p => p.code).map(p => [p.code!.trim().toLowerCase(), p]));
    setRows(d.items.length ? d.items.map(it => {
      const p = (it.code && byCode.get(it.code.toLowerCase())) || byName.get(it.name.toLowerCase());
      return {
        key: `r${++seq}`, part_id: p?.id ?? null, name: p ? p.name : it.name, unit: p ? p.unit : it.unit,
        quantity: String(it.qty).replace('.', ','), unit_cost: costInput(it.unitCost),
      };
    }) : [newRow()]);
    setFreight(d.freight ? moneyInput(d.freight) : '');
    setDiscount(d.discount ? moneyInput(d.discount) : '');
    if (d.installments.length) {
      importedInsts.current = d.installments;
      setCount(Math.min(12, d.installments.length));
      setFirstDue(d.installments[0].due);
    } else {
      importedInsts.current = null;
    }
    setImported(d);
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !wid) return;
    const isXml = file.name.toLowerCase().endsWith('.xml') || file.type.includes('xml');
    try {
      if (isXml) {
        setReading('xml');
        const d = parseNfeXml(await file.text());
        if (!d) throw new Error('Este XML não parece uma NF-e. Confira se é o XML da nota do fornecedor.');
        applyInvoice(d);
        toast.success(`Nota importada do XML ✓ ${d.items.length} ite${d.items.length === 1 ? 'm' : 'ns'} — confira e lance`);
      } else {
        if (!aiEnabled) throw new Error('A leitura do PDF com IA não está liberada para esta loja. Use o arquivo XML da nota.');
        setReading('ia');
        const d = await readInvoiceWithAi(wid, file);
        applyInvoice(d);
        toast.success(`Nota lida pela IA ✓ ${d.items.length} ite${d.items.length === 1 ? 'm' : 'ns'} — confira antes de lançar`);
      }
    } catch (err: any) {
      toast.error(err?.message ?? 'Não foi possível ler o arquivo');
    } finally {
      setReading(null);
    }
  }

  async function createMissingSupplier() {
    if (!wid || !missingSupplier) return;
    const { data, error } = await supabase.from('suppliers').insert({
      workshop_id: wid, name: missingSupplier.name, cnpj: missingSupplier.cnpj || null, phone: missingSupplier.phone || null,
    }).select('*').single();
    if (error) return toast.error('Não foi possível cadastrar o fornecedor: ' + error.message);
    const s = data as Supplier;
    setSuppliers(xs => [...xs, s].sort((a, b) => a.name.localeCompare(b.name)));
    setSupplierId(s.id);
    setMissingSupplier(null);
    toast.success(`Fornecedor ${s.name} cadastrado ✓`);
  }

  async function save() {
    if (!supplierId) return toast.error('Escolha o fornecedor');
    const items = rows.filter(r => r.name.trim());
    if (!items.length) return toast.error('Adicione ao menos uma peça');
    for (const [i, r] of items.entries()) {
      if (!(num(r.quantity) > 0)) return toast.error(`Item ${i + 1}: quantidade inválida`);
      if (!Number.isFinite(parseMoney(r.unit_cost || '0')) || num(r.unit_cost) < 0) return toast.error(`Item ${i + 1}: custo inválido`);
    }
    if (total <= 0) return toast.error('O total da nota precisa ser maior que zero');
    if (!instOk) return toast.error(`As parcelas somam ${fmtBRL(instTotal)} e a nota dá ${fmtBRL(total)}`);

    setSaving(true);
    const { data, error } = await supabase.rpc('purchase_post', {
      p_workshop: wid, p_supplier: supplierId, p_number: number, p_issue_date: date,
      p_freight: num(freight), p_discount: num(discount),
      p_items: items.map(r => ({ part_id: r.part_id, name: r.name.trim(), unit: r.unit, quantity: num(r.quantity), unit_cost: num(r.unit_cost) })),
      p_installments: insts.map(i => ({ due_date: i.due_date, amount: num(i.amount) })),
      p_notes: notes,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success('Nota lançada ✓ Estoque e contas a pagar atualizados');
    nav(`/oficina/compras?nota=${data}`);
  }

  if (!allowed) return <Restricted />;

  return (
    <WorkshopLayout>
      <div className="max-w-4xl mx-auto space-y-5">
        <div>
          <Link to="/oficina/compras" className="text-sm text-steel-500 hover:text-steel-700">← Notas de compra</Link>
          <h1 className="text-3xl font-bold tracking-tight mt-1">🧾 Lançar nota de compra</h1>
          <p className="text-sm text-steel-500 mt-1">Ao lançar, as peças entram no estoque, o custo é atualizado e as parcelas vão para as contas a pagar.</p>
        </div>

        {/* Importar arquivo da nota */}
        <div className="card flex flex-col sm:flex-row sm:items-center gap-3 !bg-brand-50/60 border border-brand-100">
          <div className="flex-1 min-w-0">
            <div className="font-bold text-steel-900">📎 Importar arquivo da nota</div>
            <p className="text-xs text-steel-600 mt-0.5">
              <strong>XML</strong> da NF-e (o fornecedor manda por e-mail): preenche tudo, exato.
              {aiEnabled
                ? <> <strong>PDF</strong> (DANFE) ou foto: a <strong>IA ✨</strong> lê e preenche — confira antes de lançar.</>
                : <> Leitura de PDF com IA: peça para liberar na sua loja.</>}
            </p>
          </div>
          <input ref={fileRef} type="file" className="hidden" onChange={onFile}
            accept={aiEnabled ? '.xml,text/xml,application/xml,.pdf,application/pdf,image/*' : '.xml,text/xml,application/xml'} />
          <button type="button" className="btn-primary shrink-0" disabled={!!reading} onClick={() => fileRef.current?.click()}>
            {reading === 'ia' ? '✨ Lendo a nota com IA…' : reading === 'xml' ? 'Lendo XML…' : aiEnabled ? 'Escolher XML ou PDF' : 'Escolher XML'}
          </button>
        </div>

        {imported && (
          <ImportSummary d={imported} itemsTotal={itemsTotal} freight={num(freight)} discount={num(discount)} />
        )}
        {missingSupplier && (
          <div className="rounded-xl bg-pending-50 border border-pending-200 px-4 py-3 text-sm flex flex-wrap items-center gap-3">
            <span className="flex-1 min-w-0">
              Fornecedor da nota não está cadastrado: <strong>{missingSupplier.name}</strong>
              {missingSupplier.cnpj && <span className="text-steel-500"> · CNPJ {missingSupplier.cnpj}</span>}
            </span>
            <button type="button" className="btn-primary !py-1.5 text-sm" onClick={createMissingSupplier}>+ Cadastrar e usar</button>
          </div>
        )}

        {/* Fornecedor e nota */}
        <div className="card grid sm:grid-cols-4 gap-3">
          <div className="sm:col-span-2">
            <label className="label">Fornecedor *</label>
            <div className="flex gap-2">
              <select className="input" value={supplierId} onChange={e => setSupplierId(e.target.value)}>
                <option value="">Escolha…</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <button type="button" className="btn-ghost border border-steel-200 shrink-0" onClick={() => setNewSupplier(true)}>+ Novo</button>
            </div>
            {supplier && <p className="text-[11px] text-steel-400 mt-1">{supplier.payment_days ? `Prazo de ${supplier.payment_days} dias` : 'Pagamento à vista'}</p>}
          </div>
          <div>
            <label className="label">Nº da nota</label>
            <input className="input" placeholder="Ex.: 12345" value={number} onChange={e => setNumber(e.target.value)} />
          </div>
          <div>
            <label className="label">Data da nota</label>
            <input type="date" className="input" value={date} onChange={e => setDate(e.target.value || todayISO())} />
          </div>
        </div>

        {/* Itens */}
        <div className="card !p-0 overflow-hidden">
          <div className="px-5 pt-5 pb-3 flex items-center justify-between gap-3">
            <div>
              <h2 className="font-bold text-lg">Peças da nota</h2>
              <p className="text-xs text-steel-500">
                Comece a digitar e escolha da lista. Peça que ainda não existe? Digite o nome completo — ela é
                <strong className="text-brand-700"> cadastrada automaticamente</strong> ao lançar a nota.
              </p>
            </div>
            <button type="button" onClick={() => setRows(rs => [...rs, newRow()])}
              className="text-sm font-semibold px-3 py-2 rounded-xl bg-steel-100 hover:bg-steel-200 text-steel-700">+ Peça</button>
          </div>
          <datalist id="compra-pecas">
            {parts.map(p => <option key={p.id} value={p.name}>{`estoque ${fmtQty(p.stock_qty)} ${p.unit} · custo ${fmtBRL(p.cost)}`}</option>)}
          </datalist>
          <div className="hidden md:grid grid-cols-12 gap-2 px-5 py-2 bg-steel-50 border-y border-steel-100 text-[10px] font-bold text-steel-500 uppercase tracking-wider">
            <div className="col-span-5">Peça</div>
            <div className="col-span-2 text-right">Qtd</div>
            <div className="col-span-2 text-right">Custo unit.</div>
            <div className="col-span-2 text-right">Total</div>
            <div className="col-span-1" />
          </div>
          <div className="divide-y divide-steel-100">
            {rows.map(r => {
              const part = r.part_id ? byId.get(r.part_id) : undefined;
              const newCost = num(r.unit_cost);
              const costChanged = part && r.unit_cost && Math.abs(newCost - Number(part.cost)) > 0.001;
              return (
                <div key={r.key} className="px-5 py-3 grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-12 md:col-span-5">
                    <input className="input !py-2 text-sm" list="compra-pecas" placeholder="Nome da peça (do cadastro ou uma nova)"
                      value={r.name} onChange={e => update(r.key, { name: e.target.value })} />
                  </div>
                  <div className="col-span-4 md:col-span-2 flex gap-1">
                    <input className="input !py-2 text-sm text-right" inputMode="decimal" value={r.quantity}
                      onChange={e => update(r.key, { quantity: e.target.value })} />
                    {!r.part_id && r.name.trim() && (
                      <select className="input !py-2 !px-1 text-xs !w-16" value={r.unit} onChange={e => update(r.key, { unit: e.target.value })}>
                        {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                      </select>
                    )}
                  </div>
                  <div className="col-span-4 md:col-span-2 relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-steel-400 text-xs">R$</span>
                    <input className="input !py-2 !pl-8 text-sm text-right" inputMode="decimal" placeholder="0,00" value={r.unit_cost}
                      onChange={e => update(r.key, { unit_cost: e.target.value })}
                      onBlur={e => { const v = parseMoney(e.target.value); if (Number.isFinite(v)) update(r.key, { unit_cost: moneyInput(v) }); }} />
                  </div>
                  <div className="col-span-3 md:col-span-2 text-right text-sm font-bold">{fmtBRL(num(r.quantity) * num(r.unit_cost))}</div>
                  <div className="col-span-1 flex justify-end">
                    <button type="button" onClick={() => setRows(rs => rs.length > 1 ? rs.filter(x => x.key !== r.key) : [newRow()])}
                      className="h-8 w-8 rounded-lg grid place-items-center text-xs bg-steel-100 hover:bg-alert-100 text-steel-500 hover:text-alert-600" title="Remover">✕</button>
                  </div>
                  {r.name.trim() && (
                    <div className="col-span-12 text-xs -mt-1">
                      {part ? (
                        <span className="text-steel-500">
                          🔩 Estoque {fmtQty(part.stock_qty)} → <strong className="text-steel-700">{fmtQty(Number(part.stock_qty) + num(r.quantity))} {part.unit}</strong>
                          {costChanged && (
                            <> · custo {fmtBRL(part.cost)} → <strong className={newCost > Number(part.cost) ? 'text-alert-600' : 'text-signal-700'}>{fmtBRL(newCost)}</strong>
                              {priceModeOf(part) !== 'fixed' && <> · venda passa a {fmtBRL(salePriceOf({ ...part, cost: newCost }, margin))}</>}
                            </>
                          )}
                        </span>
                      ) : (
                        <span className="text-brand-700">
                          ✨ <strong>Peça nova</strong> — será cadastrada
                          {guess[r.name.trim()] && <> em <strong>{partCategory(guess[r.name.trim()]).icon} {partCategory(guess[r.name.trim()]).label}</strong></>}
                          {' '}com a margem padrão ({margin}%) → venda {fmtBRL(salePriceOf({ cost: newCost, margin_percent: null, sale_price: null }, margin))}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="bg-steel-50 border-t border-steel-100 px-5 py-4">
            <div className="ml-auto max-w-xs space-y-1.5 text-sm">
              <div className="flex justify-between text-steel-600"><span>Peças</span><span>{fmtBRL(itemsTotal)}</span></div>
              <MoneyLine label="Frete" value={freight} onChange={setFreight} />
              <MoneyLine label="Desconto" value={discount} onChange={setDiscount} minus />
              <div className="flex justify-between pt-2 border-t border-steel-200">
                <span className="font-bold">Total da nota</span>
                <span className="font-bold font-display text-xl">{fmtBRL(total)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Pagamento */}
        <div className="card space-y-4">
          <h2 className="font-bold text-lg">Pagamento</h2>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="label">Parcelas</label>
              <select className="input !w-auto" value={count} onChange={e => setCount(Number(e.target.value))}>
                {Array.from({ length: 12 }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n === 1 ? '1× (à vista / boleto único)' : `${n}×`}</option>)}
              </select>
            </div>
            <div>
              <label className="label">{count === 1 ? 'Vencimento' : '1º vencimento'}</label>
              <input type="date" className="input !w-auto" value={firstDue} onChange={e => setFirstDue(e.target.value || todayISO())} />
            </div>
            {count > 1 && <p className="text-xs text-steel-500 pb-3">As demais a cada 30 dias. Dá para ajustar abaixo.</p>}
          </div>
          {insts.length > 0 && (
            <div className="space-y-2">
              {insts.map((i, idx) => (
                <div key={idx} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="w-12 text-steel-500">{count > 1 ? `${idx + 1}/${count}` : 'Única'}</span>
                  <input type="date" className="input !py-1.5 !w-auto text-sm" value={i.due_date}
                    onChange={e => setInsts(xs => xs.map((x, j) => j === idx ? { ...x, due_date: e.target.value } : x))} />
                  <div className="relative w-36">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-steel-400 text-xs">R$</span>
                    <input className="input !py-1.5 !pl-8 text-sm text-right" inputMode="decimal" value={i.amount}
                      onChange={e => setInsts(xs => xs.map((x, j) => j === idx ? { ...x, amount: e.target.value } : x))} />
                  </div>
                  <span className="text-xs text-steel-400">{fmtDate(i.due_date)}</span>
                </div>
              ))}
              {!instOk && <p className="text-xs text-alert-600">As parcelas somam {fmtBRL(instTotal)} e a nota dá {fmtBRL(total)}.</p>}
            </div>
          )}
          <div>
            <label className="label">Observações</label>
            <input className="input" placeholder="Opcional" value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
        </div>

        <div className="flex justify-end gap-2 pb-6">
          <Link to="/oficina/compras" className="btn-ghost">Cancelar</Link>
          <button className="btn-primary" onClick={save} disabled={saving || !ready} title={ready ? undefined : missing}>
            {saving ? 'Lançando…' : ready ? `✓ Lançar nota de ${fmtBRL(total)}` : missing}
          </button>
        </div>
      </div>

      {newSupplier && wid && (
        <SupplierForm wid={wid} supplier={null} onClose={() => setNewSupplier(false)}
          onSaved={s => { setSuppliers(xs => [...xs, s].sort((a, b) => a.name.localeCompare(b.name))); setSupplierId(s.id); setNewSupplier(false); }} />
      )}
    </WorkshopLayout>
  );
}

function MoneyLine({ label, value, onChange, minus }: { label: string; value: string; onChange: (v: string) => void; minus?: boolean }) {
  return (
    <div className="flex justify-between items-center text-steel-600">
      <span>{label}</span>
      <div className="relative w-32">
        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-steel-400 text-xs">{minus ? '− R$' : 'R$'}</span>
        <input className={`input !py-1.5 ${minus ? '!pl-11' : '!pl-8'} text-sm text-right`} inputMode="decimal" placeholder="0,00" value={value}
          onChange={e => onChange(e.target.value)}
          onBlur={e => { const v = parseMoney(e.target.value); if (Number.isFinite(v)) onChange(v ? moneyInput(v) : ''); }} />
      </div>
    </div>
  );
}

/** Resumo do que veio do arquivo: confere a soma com o total impresso na nota */
function ImportSummary({ d, itemsTotal, freight, discount }: { d: InvoiceData; itemsTotal: number; freight: number; discount: number }) {
  const formTotal = Math.round((itemsTotal + freight - discount) * 100) / 100;
  const diff = d.total != null ? Math.round((d.total - formTotal) * 100) / 100 : 0;
  const ok = d.total == null || Math.abs(diff) < 0.05;
  return (
    <div className={`rounded-xl border px-4 py-3 text-sm space-y-1 ${ok ? 'bg-signal-50 border-signal-200' : 'bg-pending-50 border-pending-200'}`}>
      <div className="font-semibold">
        {d.source === 'xml' ? '✓ Nota importada do XML' : '✨ Nota lida pela IA — confira os itens'}
        {' · '}{d.items.length} ite{d.items.length === 1 ? 'm' : 'ns'}
        {d.installments.length > 0 && ` · ${d.installments.length} parcela${d.installments.length === 1 ? '' : 's'}`}
      </div>
      {d.total != null && (
        ok
          ? <div className="text-steel-600">Total da nota {fmtBRL(d.total)} confere com a soma lançada.</div>
          : <div className="text-pending-800">
              ⚠️ Total impresso na nota {fmtBRL(d.total)}, soma lançada {fmtBRL(formTotal)} (diferença {fmtBRL(diff)}).
              Confira quantidades e valores{d.source === 'ia' ? ' — IPI ou ST podem estar fora dos itens' : ''}.
            </div>
      )}
      {d.source === 'xml' && <div className="text-xs text-steel-500">IPI, ST e outras despesas da nota já estão no custo de cada peça.</div>}
      {d.uncertain.length > 0 && (
        <div className="text-xs text-pending-800">A IA ficou em dúvida em: {d.uncertain.join(', ')}.</div>
      )}
    </div>
  );
}
