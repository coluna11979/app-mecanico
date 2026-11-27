import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from '@/components/ui/Toast';
import { brl } from '@/lib/investors';

type Interest = {
  id: string; created_at: string; name: string; email: string; phone: string; city: string | null; source: string | null;
  investor_type: string | null; sector: string | null; experience: string[]; goal: string | null;
  amount_range: string | null; amount: number | null; instrument: string | null; horizon: string | null;
  contact_pref: string | null; message: string | null; status: string; admin_note: string | null;
  converted_investor_id: string | null;
};

const STATUS: Record<string, string> = {
  novo: 'Novo', contatado: 'Contatado', conversando: 'Conversando', convertido: 'Virou investidor', descartado: 'Descartado',
};
const RANGE: Record<string, { label: string; low: number }> = {
  '20_25': { label: 'R$ 20 a 25 mil', low: 20000 }, '25_30': { label: 'R$ 25 a 30 mil', low: 25000 },
  '30_40': { label: 'R$ 30 a 40 mil', low: 30000 }, outro: { label: 'Outro valor', low: 0 },
};
const L: Record<string, string> = {
  pessoa_fisica: 'Pessoa física', empresa: 'Empresa', dono_oficina: 'Dono de oficina', setor_automotivo: 'Gestor de oficina',
  outro_setor: 'Outro setor', retorno: 'Retorno financeiro', apoiar: 'Apoiar o setor', ambos: 'Retorno e apoio',
  mutuo_conversivel: 'Mútuo conversível', investidor_anjo: 'Investidor-anjo', quero_entender: 'Quer entender melhor',
  whatsapp: 'WhatsApp', email: 'E-mail', ligacao: 'Ligação', '12': 'até 12 meses', '24': 'até 24 meses', '36': 'até 36 meses', mais: 'mais de 36 meses',
};

/** Interessados que preencheram o formulário público (/investir) */
export default function InterestsTab({ onConverted }: { onConverted: () => void }) {
  const [rows, setRows] = useState<Interest[]>([]);
  const [filter, setFilter] = useState('ativos');
  const [open, setOpen] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const link = `${window.location.origin}/investir`;

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('investor_interests').select('*').order('created_at', { ascending: false });
    if (error) return toast.error('Não carregou: ' + error.message);
    const list = ((data ?? []) as Interest[]).map(r => ({ ...r, amount: r.amount === null ? null : Number(r.amount) }));
    setRows(list);
    setNotes(Object.fromEntries(list.map(r => [r.id, r.admin_note ?? ''])));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function copyLink() {
    try { await navigator.clipboard.writeText(link); toast.success('Link copiado'); }
    catch { toast.info(link); }
  }
  async function setStatus(id: string, status: string) {
    const { error } = await supabase.from('investor_interests').update({ status }).eq('id', id);
    if (error) return toast.error(error.message);
    load();
  }
  async function saveNote(id: string) {
    const { error } = await supabase.from('investor_interests').update({ admin_note: notes[id]?.trim() || null }).eq('id', id);
    if (error) return toast.error(error.message);
    toast.success('Anotação salva');
  }
  async function convert(r: Interest) {
    const amount = r.amount ?? (r.amount_range ? RANGE[r.amount_range]?.low : 0) ?? 0;
    if (!amount) return toast.error('Sem valor informado: cadastre manualmente na aba Investidores.');
    const { data, error } = await supabase.from('investors').insert({
      name: r.name, email: r.email.toLowerCase(), phone: r.phone, amount, invested_at: new Date().toISOString().slice(0, 10),
      instrument: r.instrument === 'investidor_anjo' ? 'investidor_anjo' : 'mutuo_conversivel', share_pct: 0,
    }).select('id').single();
    if (error) return toast.error('Não cadastrou: ' + error.message);
    await supabase.from('investor_interests').update({ status: 'convertido', converted_investor_id: data.id }).eq('id', r.id);
    toast.success('Pré-cadastrado. Complete os dados na aba Investidores.');
    load(); onConverted();
  }

  const shown = rows.filter(r => filter === 'todos' ? true : filter === 'ativos' ? !['convertido', 'descartado'].includes(r.status) : r.status === filter);
  const waLink = (phone: string) => `https://wa.me/55${phone.replace(/\D/g, '')}`;

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-steel-200 dark:border-steel-700 p-4 space-y-2">
        <h2 className="font-semibold">Link do formulário para enviar</h2>
        <p className="text-xs text-steel-500">
          Envie para quem você quer convidar. O formulário não pede CPF, RG nem endereço. Para saber de onde veio cada pessoa,
          acrescente <b>?o=nome</b> ao final do link (ex.: {link}?o=indicacao).
        </p>
        <div className="flex gap-2 flex-wrap">
          <input readOnly className="input flex-1 min-w-[220px]" value={link} onFocus={e => e.currentTarget.select()} />
          <button className="btn-primary" onClick={copyLink}>Copiar link</button>
          <a className="btn-ghost inline-flex items-center" href={link} target="_blank" rel="noreferrer">Abrir</a>
        </div>
      </section>

      <div className="flex items-center gap-2 flex-wrap">
        {['ativos', 'novo', 'contatado', 'conversando', 'convertido', 'descartado', 'todos'].map(k => (
          <button key={k} onClick={() => setFilter(k)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${filter === k ? 'bg-steel-900 text-white border-steel-900' : 'border-steel-300 text-steel-600'}`}>
            {k === 'ativos' ? 'Em aberto' : k === 'todos' ? 'Todos' : STATUS[k]}
            {k !== 'ativos' && k !== 'todos' && <span className="ml-1 opacity-70">{rows.filter(r => r.status === k).length}</span>}
          </button>
        ))}
      </div>

      {shown.length === 0 && <p className="text-sm text-steel-500 py-6 text-center">Nenhum interessado por aqui ainda.</p>}
      {shown.map(r => (
        <article key={r.id} className="rounded-xl border border-steel-200 dark:border-steel-700 p-4">
          <div className="flex justify-between gap-3 flex-wrap">
            <div>
              <div className="font-semibold">
                {r.name} {r.status === 'novo' && <span className="ml-1 text-[10px] rounded-full bg-brand-500 text-white px-2 py-0.5 align-middle">NOVO</span>}
              </div>
              <div className="text-xs text-steel-500">{r.email} · {r.phone}{r.city ? ` · ${r.city}` : ''}</div>
              <div className="text-xs text-steel-500">{new Date(r.created_at).toLocaleString('pt-BR')}{r.source ? ` · origem: ${r.source}` : ''}</div>
            </div>
            <div className="text-right">
              <div className="font-semibold">{r.amount ? brl(r.amount) : r.amount_range ? RANGE[r.amount_range]?.label : '—'}</div>
              <div className="text-xs text-steel-500">{r.instrument ? L[r.instrument] : ''}</div>
            </div>
          </div>
          <div className="mt-3 flex gap-3 text-sm flex-wrap items-center">
            <select className="input !py-1 !w-auto" value={r.status} onChange={e => setStatus(r.id, e.target.value)}>
              {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <a className="text-brand-600" href={waLink(r.phone)} target="_blank" rel="noreferrer">Chamar no WhatsApp</a>
            <button className="text-brand-600" onClick={() => setOpen(open === r.id ? null : r.id)}>{open === r.id ? 'Ocultar respostas' : 'Ver respostas'}</button>
            {r.status !== 'convertido' && <button className="text-brand-600 font-semibold" onClick={() => convert(r)}>Pré-cadastrar como investidor</button>}
          </div>
          {open === r.id && (
            <div className="mt-3 rounded-lg bg-steel-50 dark:bg-steel-900 p-3 text-sm space-y-1">
              <p><b>Perfil:</b> {[r.investor_type, r.sector, r.goal].filter(Boolean).map(x => L[x!]).join(' · ') || '—'}</p>
              <p><b>Já investiu em:</b> {r.experience.length ? r.experience.join(', ') : '—'}</p>
              <p><b>Prazo confortável:</b> {r.horizon ? L[r.horizon] : '—'} · <b>Contato preferido:</b> {r.contact_pref ? L[r.contact_pref] : '—'}</p>
              {r.message && <p><b>Mensagem:</b> {r.message}</p>}
              <label className="block pt-2"><span className="text-xs text-steel-500">Sua anotação (só você vê)</span>
                <textarea className="input mt-1" rows={2} value={notes[r.id] ?? ''} onChange={e => setNotes({ ...notes, [r.id]: e.target.value })} /></label>
              <button className="btn-ghost" onClick={() => saveNote(r.id)}>Salvar anotação</button>
            </div>
          )}
        </article>
      ))}
    </div>
  );
}
