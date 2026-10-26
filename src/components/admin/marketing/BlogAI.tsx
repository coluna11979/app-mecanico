import { FormEvent, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from '@/components/ui/Toast';
import { type Audience, AUDIENCE_LABEL } from '@/lib/paraVoce';

interface Topic { id: string; title: string; audience: Audience; notes: string | null; used_at: string | null; created_at: string }

/**
 * Artigo semanal com IA: liga/desliga, pauta de temas e "Gerar rascunho agora".
 * O rascunho cai na lista de artigos como "aguardando revisão"; nada é publicado sozinho.
 */
export default function BlogAI({ onGenerated }: { onGenerated: () => void }) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ title: '', audience: 'mechanic' as Audience, notes: '' });

  async function load() {
    const [s, t] = await Promise.all([
      supabase.from('app_settings').select('value').eq('key', 'blog_ai_enabled').maybeSingle(),
      supabase.from('blog_topics').select('*').order('used_at', { ascending: true, nullsFirst: true }).order('created_at', { ascending: true }),
    ]);
    setEnabled(s.data?.value === 'true');
    setTopics((t.data ?? []) as Topic[]);
  }
  useEffect(() => { void load(); }, []);

  async function toggle() {
    const v = !enabled;
    const { error } = await supabase.from('app_settings').update({ value: v ? 'true' : 'false' }).eq('key', 'blog_ai_enabled');
    if (error) return toast.error(error.message);
    setEnabled(v);
  }

  async function generate() {
    setBusy(true);
    toast.success('Escrevendo o artigo… leva uns 20 segundos.');
    const { data, error } = await supabase.functions.invoke('blog-weekly-draft', { body: { source: 'admin' } });
    setBusy(false);
    let msg = data?.error as string | undefined;
    if (error && !msg) {
      const ctx = (error as { context?: Response }).context;
      msg = (ctx ? await ctx.json().then(j => j.error).catch(() => null) : null) || error.message;
    }
    if (msg) return toast.error(msg);
    toast.success(`Rascunho pronto: “${data.title}”. Revise na lista abaixo.`);
    void load();
    onGenerated();
  }

  async function addTopic(e: FormEvent) {
    e.preventDefault();
    if (f.title.trim().length < 8) return toast.error('Escreva o tema com um pouco mais de detalhe.');
    const { error } = await supabase.from('blog_topics').insert({ title: f.title.trim(), audience: f.audience, notes: f.notes.trim() || null });
    if (error) return toast.error(error.message);
    setF({ title: '', audience: f.audience, notes: '' });
    void load();
  }

  async function removeTopic(t: Topic) {
    const { error } = await supabase.from('blog_topics').delete().eq('id', t.id);
    if (error) return toast.error(error.message);
    setTopics(l => l.filter(x => x.id !== t.id));
  }

  const pending = topics.filter(t => !t.used_at);
  const used = topics.filter(t => t.used_at);

  return (
    <div className="bg-gradient-to-br from-steel-900 to-steel-800 text-white rounded-2xl p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="font-bold text-lg">✨ Artigo semanal com IA</div>
          <p className="text-sm text-steel-300 mt-0.5 max-w-xl">
            Toda segunda às 8h a IA escreve um rascunho com o próximo tema da pauta (ou escolhe um tema, se a pauta acabar).
            Ele aparece aqui como <b>aguardando revisão</b>: nada vai ao ar sem você publicar.
          </p>
        </div>
        <button onClick={toggle} disabled={enabled === null}
          className={`shrink-0 min-h-[40px] px-3 rounded-lg text-sm font-semibold ${enabled ? 'bg-signal-500/20 text-signal-300' : 'bg-white/10 text-steel-300'}`}>
          {enabled === null ? '…' : enabled ? '● Ligado' : '○ Desligado'}
        </button>
      </div>

      <div className="flex gap-2 flex-wrap mt-4">
        <button onClick={generate} disabled={busy} className="btn-primary min-h-[44px]">
          {busy ? 'Escrevendo…' : '✍️ Gerar rascunho agora'}
        </button>
        <button onClick={() => setOpen(o => !o)} className="min-h-[44px] px-4 rounded-xl bg-white/10 hover:bg-white/15 text-sm font-semibold">
          📋 Pauta ({pending.length} {pending.length === 1 ? 'tema' : 'temas'} na fila)
        </button>
      </div>

      {open && (
        <div className="mt-4 bg-white text-steel-800 rounded-xl p-3 space-y-3">
          <form onSubmit={addTopic} className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
            <input className="input" value={f.title} maxLength={140} placeholder="Tema do próximo artigo (ex: Como precificar a mão de obra)"
              onChange={e => setF(p => ({ ...p, title: e.target.value }))} />
            <select className="input sm:!w-auto" value={f.audience} onChange={e => setF(p => ({ ...p, audience: e.target.value as Audience }))}>
              {(['mechanic', 'workshop', 'all'] as Audience[]).map(a => <option key={a} value={a}>{AUDIENCE_LABEL[a]}</option>)}
            </select>
            <input className="input sm:col-span-2" value={f.notes} maxLength={300} placeholder="Orientação para a IA (opcional): o que não pode faltar, o tom, um exemplo…"
              onChange={e => setF(p => ({ ...p, notes: e.target.value }))} />
            <button className="btn-secondary min-h-[40px] sm:col-span-2">+ Adicionar à pauta</button>
          </form>

          {pending.length === 0 ? (
            <p className="text-sm text-steel-500">Pauta vazia: a IA vai escolher o tema sozinha.</p>
          ) : (
            <ol className="space-y-1.5">
              {pending.map((t, i) => (
                <li key={t.id} className="flex items-start gap-2 text-sm">
                  <span className="text-steel-400 w-5 shrink-0">{i + 1}.</span>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{t.title}</div>
                    <div className="text-xs text-steel-500">{AUDIENCE_LABEL[t.audience]}{t.notes ? ` · ${t.notes}` : ''}</div>
                  </div>
                  <button onClick={() => removeTopic(t)} className="text-xs text-steel-400 hover:text-alert-600 min-h-[32px] px-1">Tirar</button>
                </li>
              ))}
            </ol>
          )}
          {used.length > 0 && <p className="text-xs text-steel-400">{used.length} tema(s) já usado(s).</p>}
        </div>
      )}
    </div>
  );
}
