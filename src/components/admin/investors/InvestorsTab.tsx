import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from '@/components/ui/Toast';
import {
  INSTRUMENTS, PARTICIPATION_NOTE, brl, maskMoney, numToInput, openFile, participation, pctLabel, toNum, uploadFile,
  type Investor,
} from '@/lib/investors';
import ContractPanel, { ContractTemplates } from './ContractPanel';

const today = () => new Date().toISOString().slice(0, 10);

const maskCpf = (v: string) => {
  const d = v.replace(/\D/g, '').slice(0, 11);
  return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
};

/** Dados pessoais do investidor (pessoa física): usados no contrato e nos pagamentos */
export const PROFILE_FIELDS: { key: keyof Investor; label: string; wide?: boolean }[] = [
  { key: 'cpf', label: 'CPF' },
  { key: 'rg', label: 'RG' },
  { key: 'nationality', label: 'Nacionalidade' },
  { key: 'marital_status', label: 'Estado civil' },
  { key: 'profession', label: 'Profissão' },
  { key: 'phone', label: 'Telefone' },
  { key: 'address', label: 'Endereço completo', wide: true },
  { key: 'pix_key', label: 'Chave PIX para pagamentos', wide: true },
];
type Profile = Record<string, string>;
const emptyProfile = (): Profile => Object.fromEntries(PROFILE_FIELDS.map(f => [f.key, '']));
const profileOf = (i: Investor): Profile => Object.fromEntries(PROFILE_FIELDS.map(f => [f.key, String(i[f.key] ?? '')]));
const profilePayload = (p: Profile) => Object.fromEntries(PROFILE_FIELDS.map(f => [f.key, p[f.key].trim() || null]));

function ProfileInputs({ value, onChange }: { value: Profile; onChange: (p: Profile) => void }) {
  return (
    <>
      {PROFILE_FIELDS.map(f => (
        <label key={f.key} className={`block${f.wide ? ' sm:col-span-2' : ''}`}>
          <span className="text-xs text-steel-500">{f.label}</span>
          <input className="input mt-1" value={value[f.key]}
            onChange={e => onChange({ ...value, [f.key]: f.key === 'cpf' ? maskCpf(e.target.value) : e.target.value })} />
        </label>
      ))}
    </>
  );
}

type Doc = { id: string; investor_id: string; name: string; path: string };

/** Cadastro completo, edição e contrato */
export default function InvestorsTab({ investors, reload }: { investors: Investor[]; reload: () => void }) {
  const empty = { name: '', email: '', amount: '', invested_at: today(), instrument: 'mutuo_conversivel', conditions: '', share_pct: '' };
  const [f, setF] = useState(empty);
  const [pf, setPf] = useState<Profile>(emptyProfile());
  const [open, setOpen] = useState<string | null>(null);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [valuation, setValuation] = useState<number | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [ed, setEd] = useState({ name: '', share_pct: '', conditions: '' });
  const [edPf, setEdPf] = useState<Profile>(emptyProfile());
  const [contractFor, setContractFor] = useState<string | null>(null);
  const set = (k: keyof typeof empty, v: string) => setF(p => ({ ...p, [k]: v }));

  useEffect(() => {
    supabase.from('investor_valuation').select('amount').eq('id', 1).maybeSingle()
      .then(({ data }) => setValuation(data ? Number(data.amount) : null));
  }, []);

  const loadDocs = (id: string) => supabase.from('investor_documents').select('*').eq('investor_id', id).order('created_at')
    .then(({ data }) => setDocs((data ?? []) as Doc[]));
  useEffect(() => { if (open) loadDocs(open); }, [open]);

  async function add() {
    if (!f.name.trim() || !f.email.trim() || !toNum(f.amount)) return toast.error('Preencha nome, e-mail e valor.');
    const { error } = await supabase.from('investors').insert({
      name: f.name.trim(), email: f.email.trim().toLowerCase(), amount: toNum(f.amount), invested_at: f.invested_at,
      instrument: f.instrument, conditions: f.conditions.trim() || null, share_pct: toNum(f.share_pct), ...profilePayload(pf),
    });
    if (error) return toast.error('Não salvou: ' + error.message);
    setF(empty); setPf(emptyProfile()); reload(); toast.success('Investidor cadastrado');
  }

  async function addDoc(investorId: string, file: File | undefined) {
    if (!file) return;
    try {
      const path = await uploadFile(`docs/${investorId}`, file);
      const { error } = await supabase.from('investor_documents').insert({ investor_id: investorId, name: file.name, path });
      if (error) throw error;
      loadDocs(investorId);
    } catch (e) { toast.error('Não enviou: ' + (e as Error).message); }
  }

  async function toggleActive(i: Investor) {
    const { error } = await supabase.from('investors').update({ active: !i.active }).eq('id', i.id);
    if (error) return toast.error(error.message);
    reload();
  }

  function startEdit(i: Investor) {
    setEditing(editing === i.id ? null : i.id);
    setEd({ name: i.name, share_pct: numToInput(i.share_pct), conditions: i.conditions ?? '' });
    setEdPf(profileOf(i));
  }
  async function saveEdit(id: string) {
    const pct = toNum(ed.share_pct);
    if (!ed.name.trim()) return toast.error('Informe o nome.');
    if (pct < 0 || pct > 100) return toast.error('O percentual vai de 0 a 100.');
    const { error } = await supabase.from('investors').update({
      name: ed.name.trim(), share_pct: pct, conditions: ed.conditions.trim() || null, ...profilePayload(edPf),
    }).eq('id', id);
    if (error) return toast.error('Não salvou: ' + error.message);
    setEditing(null); reload(); toast.success('Cadastro atualizado');
  }

  const total = investors.filter(i => i.active).reduce((s, i) => s + i.amount, 0);
  const part = (i: Investor) => participation(i.amount, valuation);
  const contractInvestor = investors.find(i => i.id === contractFor);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-steel-200 dark:border-steel-700 p-4 grid sm:grid-cols-2 gap-3">
        <h2 className="font-semibold sm:col-span-2">Novo investidor</h2>
        <label className="block"><span className="text-xs text-steel-500">Nome completo</span><input className="input mt-1" value={f.name} onChange={e => set('name', e.target.value)} /></label>
        <label className="block"><span className="text-xs text-steel-500">E-mail de acesso</span><input className="input mt-1" type="email" value={f.email} onChange={e => set('email', e.target.value)} /></label>
        <ProfileInputs value={pf} onChange={setPf} />
        <label className="block"><span className="text-xs text-steel-500">Valor aportado (R$)</span><input className="input mt-1" inputMode="decimal" value={f.amount} onChange={e => set('amount', maskMoney(e.target.value))} /></label>
        <label className="block"><span className="text-xs text-steel-500">Data do aporte</span>
          <input className="input mt-1" type="date" value={f.invested_at} onChange={e => set('invested_at', e.target.value)} /></label>
        <label className="block"><span className="text-xs text-steel-500">Instrumento</span>
          <select className="input mt-1" value={f.instrument} onChange={e => set('instrument', e.target.value)}>
            {Object.entries(INSTRUMENTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select></label>
        <label className="block"><span className="text-xs text-steel-500">% do resultado distribuível</span><input className="input mt-1" inputMode="decimal" value={f.share_pct} onChange={e => set('share_pct', e.target.value)} /></label>
        <label className="block sm:col-span-2"><span className="text-xs text-steel-500">Condições (campo livre: teto, desconto, observações)</span>
          <textarea className="input mt-1" rows={2} value={f.conditions} onChange={e => set('conditions', e.target.value)} /></label>
        <button className="btn-primary sm:col-span-2" onClick={add}>Cadastrar investidor</button>
      </div>

      <p className="text-sm text-steel-500">{investors.filter(i => i.active).length} ativo(s) · total aportado <b>{brl(total)}</b></p>
      {investors.map(i => (
        <div key={i.id} className={`rounded-xl border border-steel-200 dark:border-steel-700 p-4 ${i.active ? '' : 'opacity-60'}`}>
          <div className="flex justify-between gap-3 flex-wrap">
            <div>
              <div className="font-semibold">{i.name} <span className="text-xs font-normal text-steel-500">· {INSTRUMENTS[i.instrument]}</span></div>
              <div className="text-xs text-steel-500">{i.email} · {i.user_id ? 'já acessou' : 'ainda não acessou'}</div>
              <div className="text-xs text-steel-500">{i.cpf ? `CPF ${i.cpf}` : 'CPF não informado'}{i.phone ? ` · ${i.phone}` : ''}</div>
            </div>
            <div className="text-right">
              <div className="font-semibold">{brl(i.amount)}</div>
              <div className="text-xs text-steel-500">{i.share_pct}% do resultado</div>
              <div className="text-xs font-semibold text-brand-600" title={PARTICIPATION_NOTE}>
                {part(i) === null ? 'defina o valuation' : `participação estimada ${pctLabel(part(i)!)}`}
              </div>
            </div>
          </div>
          {i.conditions && <p className="text-sm mt-2 text-steel-600 dark:text-steel-300">{i.conditions}</p>}
          <div className="mt-3 flex gap-3 text-sm flex-wrap">
            <button className="text-brand-600" onClick={() => setOpen(open === i.id ? null : i.id)}>Documentos</button>
            <button className="text-brand-600" onClick={() => startEdit(i)}>Editar cadastro</button>
            <button className="text-brand-600" onClick={() => setContractFor(contractFor === i.id ? null : i.id)}>Gerar contrato</button>
            <button className="text-steel-500" onClick={() => toggleActive(i)}>{i.active ? 'Desativar' : 'Reativar'}</button>
          </div>

          {editing === i.id && (
            <div className="mt-3 rounded-lg bg-steel-50 dark:bg-steel-900 p-3 grid sm:grid-cols-2 gap-3">
              <label className="block sm:col-span-2"><span className="text-xs text-steel-500">Nome completo</span>
                <input className="input mt-1" value={ed.name} onChange={e => setEd({ ...ed, name: e.target.value })} /></label>
              <ProfileInputs value={edPf} onChange={setEdPf} />
              <label className="block"><span className="text-xs text-steel-500">% do resultado distribuível</span>
                <input className="input mt-1" inputMode="decimal" value={ed.share_pct} onChange={e => setEd({ ...ed, share_pct: e.target.value })} /></label>
              <label className="block sm:col-span-2"><span className="text-xs text-steel-500">Condições</span>
                <textarea className="input mt-1" rows={2} value={ed.conditions} onChange={e => setEd({ ...ed, conditions: e.target.value })} /></label>
              <p className="text-xs text-steel-500 sm:col-span-2">O % vale a partir do próximo fechamento. Meses já fechados não mudam.</p>
              <div className="flex gap-3 sm:col-span-2">
                <button className="btn-primary" onClick={() => saveEdit(i.id)}>Salvar</button>
                <button className="btn-ghost" onClick={() => setEditing(null)}>Cancelar</button>
              </div>
            </div>
          )}

          {open === i.id && (
            <div className="mt-2 space-y-1">
              {docs.map(d => <button key={d.id} className="block text-sm text-brand-600 underline" onClick={() => openFile(d.path)}>{d.name}</button>)}
              {docs.length === 0 && <p className="text-xs text-steel-500">Nenhum documento.</p>}
              <input type="file" className="text-sm" onChange={e => addDoc(i.id, e.target.files?.[0])} />
            </div>
          )}

          {contractInvestor && contractInvestor.id === i.id && (
            <ContractPanel investor={i} valuation={valuation} onClose={() => setContractFor(null)}
              onSaved={() => { if (open === i.id) loadDocs(i.id); }} />
          )}
        </div>
      ))}

      <ContractTemplates />
    </div>
  );
}
