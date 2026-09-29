import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { toast } from '@/components/ui/Toast';
import { fmtBRL, moneyInput, parseMoney } from '@/components/os/osHelpers';
import { PAYABLE_CATEGORIES, PAYABLE_GROUPS, addMonthsISO, fmtDate, groupOf, todayISO, type Payable, type PayableGroupKey, type Supplier } from '@/lib/purchasing';
import { addMonthsCompetence, autoDescription, fmtCompetence, formOf } from '@/lib/payableForms';
import SupplierPicker from '@/components/parts/SupplierPicker';
import { breakdown, calcNet, loadPayroll } from '@/lib/payroll';

type Employee = { id: string; name: string };

const REPEAT_OPTIONS = [1, 2, 3, 6, 10, 12, 24];

/** Conta existente aberta para edição */
export type EditablePayable = Payable & { supplier?: { name: string } | null; mechanic?: { name: string } | null };
type NextInSeries = { id: string; due_date: string };

/** Lançamento (ou edição) de conta a pagar com os campos certos para cada categoria */
export default function NewPayableModal({ wid, editing, onClose, onDone }: {
  wid: string; editing?: EditablePayable | null; onClose: () => void; onDone: () => void;
}) {
  const e0 = editing ?? null;
  const known = !!e0 && PAYABLE_CATEGORIES.includes(e0.category);
  const [group, setGroup]         = useState<PayableGroupKey>(e0 ? groupOf(e0.category).key : 'fixas');
  const [category, setCategory]   = useState(e0 ? (known ? e0.category : '__outra') : 'Aluguel');
  const [custom, setCustom]       = useState(e0 && !known ? e0.category : '');
  const [supplier, setSupplier]   = useState<Supplier | null>(e0?.supplier_id ? ({ id: e0.supplier_id, name: e0.supplier?.name ?? '' } as Supplier) : null);
  const [employeeId, setEmployeeId] = useState(e0?.mechanic_id ?? '');
  const [payeeText, setPayeeText] = useState(e0?.payee ?? '');
  const [competence, setCompetence] = useState(e0?.competence ?? todayISO().slice(0, 7));
  const [document, setDocument]   = useState(e0?.document ?? '');
  const [barcode, setBarcode]     = useState(e0?.barcode ?? '');
  const [amount, setAmount]       = useState(e0 ? moneyInput(Number(e0.amount)) : '');
  const [due, setDue]             = useState(e0?.due_date ?? todayISO());
  const [months, setMonths]       = useState(e0 ? 1 : 12);
  const [description, setDescription] = useState(e0?.description ?? '');
  const [descTouched, setDescTouched] = useState(!!e0);
  const [notes, setNotes]         = useState(e0?.notes ?? '');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [busy, setBusy]           = useState(false);
  const [next, setNext]           = useState<NextInSeries[]>([]);
  const [applyNext, setApplyNext] = useState(false);
  const firstRun = useRef(true);
  const [autoAmount, setAutoAmount] = useState(false);
  const [payrollHint, setPayrollHint] = useState('');

  // Edição de conta em série: próximas parcelas em aberto
  useEffect(() => {
    if (!e0?.series_id) return;
    supabase.from('payables').select('id, due_date').eq('series_id', e0.series_id)
      .gt('due_date', e0.due_date).is('paid_at', null).is('cancelled_at', null).order('due_date')
      .then(({ data }) => setNext((data as NextInSeries[]) ?? []));
  }, [e0?.series_id, e0?.due_date]);

  useEffect(() => {
    supabase.from('workshop_mechanics').select('id, name').eq('workshop_id', wid).eq('active', true).order('name')
      .then(({ data }) => setEmployees((data as Employee[]) ?? []));
  }, [wid]);

  const isCustom = category === '__outra';
  const catName = isCustom ? custom.trim() : category;
  const form = formOf(isCustom ? '' : category);
  const groupInfo = PAYABLE_GROUPS.find(g => g.key === group)!;

  // Troca de categoria: repetição sugerida e campos limpos (não na abertura da edição)
  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; if (e0) return; }
    if (!e0) setMonths(form.repeat ?? 1);
    setSupplier(null); setEmployeeId(''); setPayeeText(''); setDocument(''); setBarcode('');
    setDescTouched(false);
  }, [category]); // eslint-disable-line react-hooks/exhaustive-deps

  const payeeName = form.payee === 'supplier' ? supplier?.name ?? ''
    : form.payee === 'employee' ? employees.find(e => e.id === employeeId)?.name ?? ''
    : form.payee === 'text' ? payeeText : '';

  // Salário: ao escolher o colaborador, o valor vem do fechamento (salário + comissão − vales do mês)
  useEffect(() => {
    if (e0 || category !== 'Salários' || !employeeId) { setPayrollHint(''); return; }
    let alive = true;
    loadPayroll(wid, competence).then(rows => {
      const r = rows.find(x => x.mechanicId === employeeId);
      if (!alive || !r) return;
      const c = calcNet({ base: r.base, commission: r.commission, absenceDays: 0, other: 0, vales: r.vales, carryIn: r.carryIn });
      const text = breakdown({ base: r.base, commission: r.commission, commissionPct: r.commissionPct, commissionRule: r.commissionRule, absenceDays: 0, absence: 0, other: 0, vales: r.vales, carryIn: r.carryIn, net: c.net, carryOut: c.carryOut });
      setPayrollHint(r.base > 0 ? text : 'Sem salário no cadastro do colaborador.');
      if (r.base > 0 && (!amount || autoAmount)) { setAmount(moneyInput(c.net)); setAutoAmount(true); if (!notes || autoAmount) setNotes(text); }
    });
    return () => { alive = false; };
  }, [employeeId, competence, category]); // eslint-disable-line react-hooks/exhaustive-deps

  const auto = autoDescription(catName || 'Conta', payeeName, form.competence ? competence : null);
  useEffect(() => { if (!descTouched) setDescription(auto); }, [auto, descTouched]);

  const value = parseMoney(amount);
  const valid = Number.isFinite(value) && value > 0;
  const plan = useMemo(() => Array.from({ length: months }, (_, i) => ({
    due_date: addMonthsISO(due, i),
    competence: form.competence ? addMonthsCompetence(competence, i) : null,
  })), [months, due, competence, form.competence]);

  function pickGroup(k: PayableGroupKey) {
    setGroup(k);
    setCategory(PAYABLE_GROUPS.find(g => g.key === k)!.categories[0]);
  }

  const fields = (comp: string | null, desc: string) => ({
    category: catName,
    description: desc,
    amount: value,
    supplier_id: form.payee === 'supplier' ? supplier?.id ?? null : null,
    mechanic_id: form.payee === 'employee' ? employeeId || null : null,
    payee: form.payee === 'text' ? payeeText.trim() || null : null,
    competence: comp,
    document: document.trim() || null,
    barcode: barcode.replace(/\D/g, '') || null,
    notes: notes.trim() || null,
  });
  const descFor = (comp: string | null) => (descTouched || !form.competence ? description.trim() : autoDescription(catName, payeeName, comp));

  async function saveEdit() {
    if (!e0) return;
    setBusy(true);
    try {
      const comp = form.competence ? competence : null;
      const { error } = await supabase.from('payables').update({ ...fields(comp, descFor(comp)), due_date: due }).eq('id', e0.id);
      if (error) throw error;
      if (applyNext) {
        // Próximas da série: mesmo dia de vencimento e competência avançando mês a mês
        for (const [i, n] of next.entries()) {
          const c = comp ? addMonthsCompetence(comp, i + 1) : null;
          const { error: e2 } = await supabase.from('payables')
            .update({ ...fields(c, descFor(c)), due_date: addMonthsISO(due, i + 1) }).eq('id', n.id);
          if (e2) throw e2;
        }
      }
      toast.success(applyNext && next.length ? `Conta e ${next.length} próxima${next.length === 1 ? '' : 's'} atualizada${next.length === 1 ? '' : 's'} ✓` : 'Conta atualizada ✓');
      onDone();
    } catch (err: unknown) {
      toast.error('Não foi possível salvar: ' + ((err as { message?: string })?.message ?? 'erro'));
    } finally {
      setBusy(false);
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (isCustom && !custom.trim()) return toast.error('Informe o nome da categoria');
    if (form.payeeRequired && !payeeName) return toast.error(`Informe: ${form.payeeLabel}`);
    if (!valid) return toast.error('Informe o valor');
    if (!description.trim()) return toast.error('Informe a descrição');
    if (e0) return saveEdit();

    const seriesId = months > 1 ? crypto.randomUUID() : null;

    const rows = plan.map((p, i) => ({
      workshop_id: wid,
      ...fields(p.competence, descFor(p.competence)),
      due_date: p.due_date,
      installment: months > 1 ? `${i + 1}/${months}` : null,
      series_id: seriesId,
    }));
    setBusy(true);
    const { error } = await supabase.from('payables').insert(rows);
    setBusy(false);
    if (error) return toast.error('Não foi possível lançar: ' + error.message);
    toast.success(months > 1 ? `${months} lançamentos criados ✓` : 'Conta lançada ✓');
    onDone();
  }

  return (
    <div className="fixed inset-0 bg-steel-900/60 z-50 flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
      <form onSubmit={save} onClick={e => e.stopPropagation()}
        className="bg-white w-full sm:max-w-2xl rounded-t-3xl sm:rounded-2xl max-h-[94vh] flex flex-col shadow-2xl">
        {/* Cabeçalho */}
        <div className="px-6 pt-5 pb-4 border-b border-steel-100 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold">{e0 ? 'Editar conta' : 'Nova conta a pagar'}</h2>
            <p className="text-sm text-steel-500">
              {e0 ? <>{e0.installment ? `Parcela ${e0.installment} · ` : ''}altere o que precisar e salve.</> : 'Escolha o tipo de despesa: os campos se ajustam à categoria.'}
            </p>
          </div>
          <button type="button" onClick={onClose} className="h-9 w-9 rounded-lg grid place-items-center text-steel-500 hover:bg-steel-100 shrink-0">✕</button>
        </div>

        <div className="px-6 py-5 space-y-6 overflow-y-auto">
          {/* 1. Tipo e categoria */}
          <section>
            <SectionTitle n={1} title="Tipo de despesa" />
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
              {PAYABLE_GROUPS.map(g => (
                <button key={g.key} type="button" onClick={() => pickGroup(g.key)}
                  className={`rounded-xl border px-2 py-3 text-center transition ${group === g.key
                    ? 'border-steel-900 bg-steel-900 text-white shadow-sm' : 'border-steel-200 bg-white hover:border-steel-300 text-steel-700'}`}>
                  <div className="text-xl leading-none">{g.icon}</div>
                  <div className="text-[11px] font-semibold mt-1.5 leading-tight">{g.label}</div>
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2 mt-3">
              {[...groupInfo.categories, '__outra'].map(c => (
                <button key={c} type="button" onClick={() => setCategory(c)}
                  className={`text-sm px-3 py-1.5 rounded-full border transition ${category === c
                    ? `${groupInfo.badge} border-transparent font-semibold ring-2 ring-offset-1 ring-steel-300` : 'bg-white border-steel-200 text-steel-600 hover:border-steel-300'}`}>
                  {c === '__outra' ? 'Outra…' : c}
                </button>
              ))}
            </div>
            {isCustom && (
              <input className="input mt-3" placeholder="Nome da categoria (ex.: Uniformes)" value={custom} onChange={e => setCustom(e.target.value)} autoFocus />
            )}
            {form.hint && (
              <p className="text-xs text-steel-500 bg-steel-50 rounded-lg px-3 py-2 mt-3">
                💡 {form.hint}
                {category === 'Fornecedor' && <> <Link to="/oficina/compras/nova" className="font-semibold text-brand-700" onClick={onClose}>Lançar nota →</Link></>}
              </p>
            )}
          </section>

          {/* 2. Dados da conta */}
          <section>
            <SectionTitle n={2} title="Dados da conta" />
            <div className="grid sm:grid-cols-2 gap-4">
              {form.payee !== 'none' && (
                <div className={form.competence ? '' : 'sm:col-span-2'}>
                  <label className="label">{form.payeeLabel}{form.payeeRequired && ' *'}</label>
                  {form.payee === 'supplier' && <SupplierPicker wid={wid} value={supplier?.id ?? null} onChange={setSupplier} placeholder="Buscar por nome, CNPJ ou telefone…" />}
                  {form.payee === 'employee' && (
                    employees.length ? (
                      <select className="input" value={employeeId} onChange={e => setEmployeeId(e.target.value)}>
                        <option value="">{form.payeeRequired ? 'Selecione…' : 'Toda a equipe'}</option>
                        {employees.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                      </select>
                    ) : (
                      <div className="text-sm text-steel-500 input !bg-steel-50">
                        Nenhum colaborador cadastrado. <Link to="/oficina/equipe" className="font-semibold text-brand-700" onClick={onClose}>Cadastrar equipe →</Link>
                      </div>
                    )
                  )}
                  {form.payee === 'text' && <input className="input" placeholder={form.payeePlaceholder} value={payeeText} onChange={e => setPayeeText(e.target.value)} />}
                </div>
              )}
              {form.competence && (
                <div>
                  <label className="label">Competência (mês de referência)</label>
                  <input type="month" className="input" value={competence} onChange={e => setCompetence(e.target.value || todayISO().slice(0, 7))} />
                </div>
              )}
              {form.document && (
                <div>
                  <label className="label">{form.document}</label>
                  <input className="input" placeholder="Opcional" value={document} onChange={e => setDocument(e.target.value)} />
                </div>
              )}
              {form.barcode && (
                <div className={form.document ? '' : 'sm:col-span-2'}>
                  <label className="label">Código de barras / linha digitável</label>
                  <input className="input font-mono text-sm" inputMode="numeric" placeholder="Cole aqui o código do boleto ou da guia (opcional)"
                    value={barcode} onChange={e => setBarcode(e.target.value)} />
                </div>
              )}
              <div className="sm:col-span-2">
                <label className="label">Descrição *</label>
                <input className="input" value={description} onChange={e => { setDescription(e.target.value); setDescTouched(true); }} />
                <p className="text-[11px] text-steel-400 mt-1">
                  {descTouched
                    ? <button type="button" className="font-semibold text-brand-700" onClick={() => setDescTouched(false)}>Voltar à descrição automática</button>
                    : 'Montada automaticamente — pode editar.'}
                </p>
              </div>
            </div>
          </section>

          {/* 3. Valor e vencimento */}
          <section>
            <SectionTitle n={3} title="Valor e vencimento" />
            {payrollHint && (
              <div className="mb-4 rounded-xl bg-signal-50 border border-signal-200 px-3 py-2 text-xs text-signal-900">
                💼 <strong>Cálculo do mês:</strong> {payrollHint}
                <span className="block text-signal-700 mt-0.5">Faltas e outros descontos entram pelo <Link to="/oficina/folha" className="font-semibold underline" onClick={onClose}>Fechar folha</Link>.</span>
              </div>
            )}
            <div className="grid sm:grid-cols-3 gap-4">
              <div>
                <label className="label">Valor {months > 1 ? 'mensal' : ''} *</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-steel-400 text-sm">R$</span>
                  <input className="input !pl-9 text-right font-semibold" inputMode="decimal" placeholder="0,00" value={amount}
                    onChange={e => { setAmount(e.target.value); setAutoAmount(false); }}
                    onBlur={e => { const v = parseMoney(e.target.value); if (Number.isFinite(v)) setAmount(moneyInput(v)); }} />
                </div>
              </div>
              <div>
                <label className="label">{months > 1 ? '1º vencimento' : 'Vencimento'}</label>
                <input type="date" className="input" value={due} onChange={e => setDue(e.target.value || todayISO())} />
              </div>
              {e0 ? (
                <div>
                  <label className="label">Parcela</label>
                  <div className="input !bg-steel-50 text-steel-600">{e0.installment ?? 'Pagamento único'}</div>
                </div>
              ) : (
                <div>
                  <label className="label">Recorrência</label>
                  <select className="input" value={months} onChange={e => setMonths(Number(e.target.value))}>
                    {REPEAT_OPTIONS.map(n => <option key={n} value={n}>{n === 1 ? 'Pagamento único' : `Mensal · ${n} meses`}</option>)}
                  </select>
                </div>
              )}
              {e0 && next.length > 0 && (
                <label className="sm:col-span-3 flex items-start gap-2 rounded-xl border border-brand-200 bg-brand-50 p-3 cursor-pointer">
                  <input type="checkbox" className="mt-1" checked={applyNext} onChange={e => setApplyNext(e.target.checked)} />
                  <span className="text-sm">
                    <strong>Aplicar também às {next.length} próxima{next.length === 1 ? '' : 's'} parcela{next.length === 1 ? '' : 's'} em aberto desta série</strong>
                    <span className="block text-xs text-steel-600">Mesmo valor e dados; vencimento no mesmo dia dos meses seguintes ({fmtDate(addMonthsISO(due, 1))} a {fmtDate(addMonthsISO(due, next.length))}).</span>
                  </span>
                </label>
              )}
              <div className="sm:col-span-3">
                <label className="label">Observação</label>
                <input className="input" placeholder="Opcional" value={notes} onChange={e => setNotes(e.target.value)} />
              </div>
            </div>
          </section>
        </div>

        {/* Resumo + ações */}
        <div className="px-6 py-4 border-t border-steel-100 bg-steel-50/60 rounded-b-2xl flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-steel-600 min-w-0">
            {valid ? (
              months > 1 ? (
                <><strong className="text-steel-900">{months}× {fmtBRL(value)}</strong> · total {fmtBRL(value * months)}
                  <span className="block text-xs text-steel-500">de {fmtDate(plan[0].due_date)} a {fmtDate(plan[months - 1].due_date)}
                    {form.competence && ` · competências ${fmtCompetence(plan[0].competence)} a ${fmtCompetence(plan[months - 1].competence)}`}</span></>
              ) : (
                <><strong className="text-steel-900">{fmtBRL(value)}</strong> · vence {fmtDate(due)}
                  {form.competence && <span className="block text-xs text-steel-500">competência {fmtCompetence(competence)}</span>}</>
              )
            ) : <span className="text-steel-400">Informe o valor para ver o resumo.</span>}
          </div>
          <div className="flex gap-2 shrink-0">
            <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>Cancelar</button>
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? 'Salvando…' : e0 ? (applyNext && next.length ? `Salvar esta e as ${next.length} próximas` : 'Salvar alterações') : months > 1 ? `Lançar ${months} contas` : 'Lançar conta'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

function SectionTitle({ n, title }: { n: number; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="h-5 w-5 rounded-full bg-steel-900 text-white text-[11px] font-bold grid place-items-center">{n}</span>
      <h3 className="text-sm font-bold text-steel-800 uppercase tracking-wide">{title}</h3>
    </div>
  );
}
