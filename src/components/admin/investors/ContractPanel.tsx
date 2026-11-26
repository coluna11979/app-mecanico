import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from '@/components/ui/Toast';
import { INSTRUMENTS, brl, participation, pctLabel, uploadFile, type Investor } from '@/lib/investors';

const dateBR = (iso: string) => new Date(iso.slice(0, 10) + 'T12:00').toLocaleDateString('pt-BR');

/** Preenche o modelo com os dados do cadastro. O que faltar fica marcado [preencher: campo] para você completar. */
export function fillTemplate(body: string, inv: Investor, valuation: number | null) {
  const part = participation(inv.amount, valuation);
  const vars: Record<string, string | null | undefined> = {
    nome: inv.name, cpf: inv.cpf, rg: inv.rg, nacionalidade: inv.nationality, estado_civil: inv.marital_status,
    profissao: inv.profession, endereco: inv.address, telefone: inv.phone, pix: inv.pix_key,
    valor: brl(inv.amount), data_aporte: dateBR(inv.invested_at),
    valuation: valuation ? brl(valuation) : null,
    participacao: part === null ? null : pctLabel(part),
    percentual_resultado: inv.share_pct > 0 ? pctLabel(inv.share_pct) : null,
    condicoes: inv.conditions, data_hoje: new Date().toLocaleDateString('pt-BR'),
    valor_extenso: null,
  };
  const names: Record<string, string> = { profissao: 'profissão', endereco: 'endereço', condicoes: 'condições', participacao: 'participação', valor_extenso: 'valor por extenso', percentual_resultado: '% do resultado', nacionalidade: 'nacionalidade', estado_civil: 'estado civil', data_aporte: 'data do aporte' };
  return body.replace(/\{\{(\w+)\}\}/g, (_, k: string) => vars[k]?.toString().trim() || `[preencher: ${names[k] ?? k.replace(/_/g, ' ')}]`);
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Minuta gerada para o investidor: editável na tela, imprime/PDF e guarda nos documentos dele */
export default function ContractPanel({ investor, valuation, onClose, onSaved }: {
  investor: Investor; valuation: number | null; onClose: () => void; onSaved: () => void;
}) {
  const [text, setText] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.from('investor_contract_template').select('body').eq('instrument', investor.instrument).maybeSingle()
      .then(({ data, error }) => {
        if (error || !data) { toast.error('Modelo de contrato não encontrado.'); setText(''); return; }
        setText(fillTemplate(data.body, investor, valuation));
      });
  }, [investor, valuation]);

  function print() {
    const w = window.open('', '_blank');
    if (!w) return toast.error('O navegador bloqueou a janela de impressão.');
    w.document.write(`<!doctype html><title>Contrato - ${esc(investor.name)}</title>
      <pre style="font-family:Georgia,serif;font-size:13px;line-height:1.5;white-space:pre-wrap;max-width:720px;margin:24px auto">${esc(text ?? '')}</pre>`);
    w.document.close();
    w.focus();
    w.print();
  }

  async function save() {
    if (!text) return;
    setBusy(true);
    try {
      const name = `Minuta ${INSTRUMENTS[investor.instrument]} ${new Date().toISOString().slice(0, 10)}.txt`;
      const path = await uploadFile(`docs/${investor.id}`, new File([text], name, { type: 'text/plain' }));
      const { error } = await supabase.from('investor_documents').insert({ investor_id: investor.id, name, path });
      if (error) throw error;
      toast.success('Minuta salva nos documentos do investidor');
      onSaved();
    } catch (e) { toast.error('Não salvou: ' + (e as Error).message); }
    setBusy(false);
  }

  return (
    <div className="mt-3 rounded-lg border border-pending-500/40 bg-pending-500/5 p-3 space-y-2">
      <div className="flex justify-between items-center gap-2">
        <b className="text-sm">Contrato de {investor.name}</b>
        <button className="text-sm text-steel-500" onClick={onClose}>Fechar</button>
      </div>
      <p className="text-xs text-steel-600 dark:text-steel-300">
        ⚠️ Minuta gerada a partir do cadastro. Corrija o texto abaixo. O que ficou como <b>[preencher: …]</b> falta informar.
        Não use sem revisão de advogado. Salvar nos documentos o torna visível ao investidor.
      </p>
      {text === null ? <p className="text-sm text-steel-500">Gerando…</p> : (
        <textarea className="input font-mono text-xs w-full" rows={22} value={text} onChange={e => setText(e.target.value)} />
      )}
      <div className="flex gap-3 flex-wrap">
        <button className="btn-primary" onClick={print} disabled={!text}>Imprimir / PDF</button>
        <button className="btn-ghost" onClick={save} disabled={!text || busy}>{busy ? 'Salvando…' : 'Salvar nos documentos do investidor'}</button>
      </div>
    </div>
  );
}

/** Modelo de cada instrumento (os campos {{assim}} são preenchidos sozinhos) */
export function ContractTemplates() {
  const [instrument, setInstrument] = useState<'mutuo_conversivel' | 'investidor_anjo'>('mutuo_conversivel');
  const [body, setBody] = useState('');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setLoaded(false);
    supabase.from('investor_contract_template').select('body').eq('instrument', instrument).maybeSingle()
      .then(({ data }) => { setBody(data?.body ?? ''); setLoaded(true); });
  }, [instrument]);

  async function save() {
    const { error } = await supabase.from('investor_contract_template')
      .upsert({ instrument, body, updated_at: new Date().toISOString() });
    if (error) return toast.error('Não salvou: ' + error.message);
    toast.success('Modelo salvo');
  }

  return (
    <details className="rounded-xl border border-steel-200 dark:border-steel-700 p-4">
      <summary className="cursor-pointer font-semibold">Modelos de contrato</summary>
      <div className="mt-3 space-y-2">
        <p className="text-xs text-steel-500">
          Campos preenchidos sozinhos: {'{{nome}} {{cpf}} {{rg}} {{nacionalidade}} {{estado_civil}} {{profissao}} {{endereco}} {{telefone}} {{pix}} {{valor}} {{valor_extenso}} {{data_aporte}} {{valuation}} {{participacao}} {{percentual_resultado}} {{condicoes}} {{data_hoje}}'}.
          Este texto inicial é só um esqueleto: troque pela minuta do seu advogado.
        </p>
        <select className="input max-w-[16rem]" value={instrument} onChange={e => setInstrument(e.target.value as typeof instrument)}>
          {Object.entries(INSTRUMENTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        {loaded && <textarea className="input font-mono text-xs w-full" rows={18} value={body} onChange={e => setBody(e.target.value)} />}
        <button className="btn-primary" onClick={save}>Salvar modelo</button>
      </div>
    </details>
  );
}
