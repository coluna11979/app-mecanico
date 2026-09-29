import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { toast } from '@/components/ui/Toast';
import { fmtBRL, moneyInput, parseMoney } from '@/components/os/osHelpers';
import { PAYABLE_GROUPS, addMonthsISO, fmtDate, todayISO, type PayableGroupKey, type Supplier } from '@/lib/purchasing';
import { addMonthsCompetence, autoDescription, fmtCompetence, formOf } from '@/lib/payableForms';
import SupplierPicker from '@/components/parts/SupplierPicker';

type Employee = { id: string; name: string };

const REPEAT_OPTIONS = [1, 2, 3, 6, 10, 12, 24];

/** Lançamento de conta a pagar com os campos certos para cada categoria */
export default function NewPayableModal({ wid, onClose, onDone }: { wid: string; onClose: () => void; onDone: () => void }) {
  const [group, setGroup]         = useState<PayableGroupKey>('fixas');
  const [category, setCategory]   = useState('Aluguel');
  const [custom, setCustom]       = useState('');
  const [supplier, setSupplier]   = useState<Supplier | null>(null);
  const [employeeId, setEmployeeId] = useState('');
  const [payeeText, setPayeeText] = useState('');
  const [competence, setCompetence] = useState(todayISO().slice(0, 7));
  const [document, setDocument]   = useState('');
  const [barcode, setBarcode]     = useState('');
  const [amount, setAmount]       = useState('');
  const [due, setDue]             = useState(todayISO());
  const [months, setMonths]       = useState(12);
  const [description, setDescription] = useState('');
  const [descTouched, setDescTouched] = useState(false);
  const [notes, setNotes]         = useState('');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [busy, setBusy]           = useState(false);

  useEffect(() => {
    supabase.from('workshop_mechanics').select('id, name').eq('workshop_id', wid).eq('active', true).order('name')
      .then(({ data }) => setEmployees((data as Employee[]) ?? []));
  }, [wid]);

  const isCustom = category === '__outra';
  const catName = isCustom ? custom.trim() : category;
  const form = formOf(isCustom ? '' : category);
  const groupInfo = PAYABLE_GROUPS.find(g => g.key === group)!;

  // Troca de categoria: repetição sugerida e campos limpos
  useEffect(() => {
    setMonths(form.repeat ?? 1);
    setSupplier(null); setEmployeeId(''); setPayeeText(''); setDocument(''); setBarcode('');
    setDescTouched(false);
  }, [category]); // eslint-disable-line react-hooks/exhaustive-deps

  const payeeName = form.payee === 'supplier' ? supplier?.name ?? ''
    : form.payee === 'employee' ? employees.find(e => e.id === employeeId)?.name ?? ''
    : form.payee === 'text' ? payeeText : '';

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

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (isCustom && !custom.trim()) return toast.error('Informe o nome da categoria');
    if (form.payeeRequired && !payeeName) return toast.error(`Informe: ${form.payeeLabel}`);
    if (!valid) return toast.error('Informe o valor');
    if (!description.trim()) return toast.error('Informe a descrição');

    const rows = plan.map((p, i) => ({
      workshop_id: wid,
      category: catName,
      description: descTouched || !form.competence
        ? description.trim()
        : autoDescription(catName, payeeName, p.competence),
      amount: value,
      due_date: p.due_date,
      installment: months > 1 ? `${i + 1}/${months}` : null,
      supplier_id: form.payee === 'supplier' ? supplier?.id ?? null : null,
      mechanic_id: form.payee === 'employee' ? employeeId || null : null,
      payee: form.payee === 'text' ? payeeText.trim() || null : null,
      competence: p.competence,
      document: document.trim() || null,
      barcode: barcode.replace(/\D/g, '') || null,
      notes: notes.trim() || null,
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
            <h2 className="text-xl font-bold">Nova conta a pagar</h2>
            <p className="text-sm text-steel-500">Escolha o tipo de despesa: os campos se ajustam à categoria.</p>
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
            <div className="grid sm:grid-cols-3 gap-4">
              <div>
                <label className="label">Valor {months > 1 ? 'mensal' : ''} *</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-steel-400 text-sm">R$</span>
                  <input className="input !pl-9 text-right font-semibold" inputMode="decimal" placeholder="0,00" value={amount}
                    onChange={e => setAmount(e.target.value)}
                    onBlur={e => { const v = parseMoney(e.target.value); if (Number.isFinite(v)) setAmount(moneyInput(v)); }} />
                </div>
              </div>
              <div>
                <label className="label">{months > 1 ? '1º vencimento' : 'Vencimento'}</label>
                <input type="date" className="input" value={due} onChange={e => setDue(e.target.value || todayISO())} />
              </div>
              <div>
                <label className="label">Recorrência</label>
                <select className="input" value={months} onChange={e => setMonths(Number(e.target.value))}>
                  {REPEAT_OPTIONS.map(n => <option key={n} value={n}>{n === 1 ? 'Pagamento único' : `Mensal · ${n} meses`}</option>)}
                </select>
              </div>
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
              {busy ? 'Lançando…' : months > 1 ? `Lançar ${months} contas` : 'Lançar conta'}
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
