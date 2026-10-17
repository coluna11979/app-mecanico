import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from '@/components/ui/Toast';
import { AUDIENCES, Card, Empty, UFS, audienceLabel } from './ui';

interface Blast {
  id: string;
  subject: string;
  segment: Segment;
  status: 'enviando' | 'enviado' | 'erro';
  recipients: number;
  sent: number;
  failed: number;
  error: string | null;
  created_at: string;
}
interface Segment { audience: string; status: string; state: string; include_leads: boolean }
interface Preview { count: number; profiles: number; leads: number; sample: string[] }

const STATUS_OPTS = [
  { v: 'all',      label: 'Todos os cadastros' },
  { v: 'approved', label: 'Só aprovados' },
  { v: 'pending',  label: 'Só em análise' },
];

const segmentText = (s: Segment) => [
  audienceLabel(s.audience),
  STATUS_OPTS.find(o => o.v === s.status)?.label.toLowerCase(),
  s.state || null,
  s.include_leads ? '+ leads' : null,
].filter(Boolean).join(' · ');

async function call<T>(body: object): Promise<T> {
  const { data, error } = await supabase.functions.invoke('marketing-email', { body });
  if (error) {
    // Mensagem do corpo da resposta, quando a função devolveu uma
    const ctx = (error as { context?: Response }).context;
    const msg = ctx ? await ctx.json().then(j => j.error).catch(() => null) : null;
    throw new Error(msg || error.message);
  }
  if (data?.error) throw new Error(data.error);
  return data as T;
}

export default function EmailBlasts() {
  const [seg, setSeg] = useState<Segment>({ audience: 'mechanic', status: 'approved', state: '', include_leads: false });
  const [c, setC] = useState({ subject: '', heading: '', body: '', cta_label: '', cta_url: '' });
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [busy, setBusy] = useState<'test' | 'send' | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [history, setHistory] = useState<Blast[]>([]);
  const [unsubs, setUnsubs] = useState(0);

  async function loadHistory() {
    const [h, u] = await Promise.all([
      supabase.from('marketing_email_blasts').select('*').order('created_at', { ascending: false }).limit(30),
      supabase.from('marketing_unsubscribes').select('email', { count: 'exact', head: true }),
    ]);
    setHistory((h.data ?? []) as Blast[]);
    setUnsubs(u.count ?? 0);
  }
  useEffect(() => { void loadHistory(); }, []);

  // Recalcula o público quando o segmento muda
  useEffect(() => {
    let alive = true;
    setPreviewing(true); setConfirming(false);
    const t = setTimeout(() => {
      call<Preview>({ action: 'preview', segment: seg })
        .then(p => { if (alive) setPreview(p); })
        .catch(e => { if (alive) { setPreview(null); toast.error(e.message); } })
        .finally(() => { if (alive) setPreviewing(false); });
    }, 300);
    return () => { alive = false; clearTimeout(t); };
  }, [seg]);

  const up = <K extends keyof typeof c>(k: K, v: string) => { setC(p => ({ ...p, [k]: v })); setConfirming(false); };
  const ready = c.subject.trim() && c.heading.trim() && c.body.trim() && (!c.cta_label.trim() || /^https?:\/\//.test(c.cta_url.trim()));

  async function test() {
    setBusy('test');
    try {
      const r = await call<{ to: string }>({ action: 'test', content: c });
      toast.success(`Teste enviado para ${r.to} ✓`);
    } catch (e) { toast.error((e as Error).message); }
    setBusy(null);
  }

  async function send() {
    setBusy('send');
    try {
      const r = await call<{ sent: number; failed: number }>({ action: 'send', segment: seg, content: c });
      if (r.failed) toast.error(`${r.sent} enviados, ${r.failed} falharam`);
      else toast.success(`${r.sent} e-mails enviados ✓`);
      setC({ subject: '', heading: '', body: '', cta_label: '', cta_url: '' });
      setConfirming(false);
      void loadHistory();
    } catch (e) { toast.error((e as Error).message); }
    setBusy(null);
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3 space-y-4">
          <Card title="1. Para quem" subtitle="Descadastrados nunca recebem. Leads só se aceitaram contato.">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="label">Público</label>
                <select className="input" value={seg.audience} onChange={e => setSeg(s => ({ ...s, audience: e.target.value }))}>
                  {AUDIENCES.map(a => <option key={a.v} value={a.v}>{a.label}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Situação</label>
                <select className="input" value={seg.status} onChange={e => setSeg(s => ({ ...s, status: e.target.value }))}>
                  {STATUS_OPTS.map(o => <option key={o.v} value={o.v}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Estado</label>
                <select className="input" value={seg.state} onChange={e => setSeg(s => ({ ...s, state: e.target.value }))}>
                  <option value="">Todos</option>
                  {UFS.map(uf => <option key={uf}>{uf}</option>)}
                </select>
              </div>
            </div>
            <label className="flex items-center gap-2 mt-3 text-sm text-steel-700 min-h-[44px] cursor-pointer">
              <input type="checkbox" className="h-5 w-5 rounded border-steel-300 text-brand-500"
                checked={seg.include_leads} onChange={e => setSeg(s => ({ ...s, include_leads: e.target.checked }))} />
              Incluir leads que ainda não se cadastraram
            </label>
          </Card>

          <Card title="2. Mensagem" subtitle="Use {nome} para o primeiro nome da pessoa. Linha em branco separa parágrafos.">
            <div className="space-y-3">
              <div>
                <label className="label">Assunto</label>
                <input className="input" value={c.subject} maxLength={120} placeholder="Ex: {nome}, tem demanda nova perto de você"
                  onChange={e => up('subject', e.target.value)} />
              </div>
              <div>
                <label className="label">Título dentro do e-mail</label>
                <input className="input" value={c.heading} maxLength={120} onChange={e => up('heading', e.target.value)} />
              </div>
              <div>
                <label className="label">Texto</label>
                <textarea className="input" rows={7} value={c.body} onChange={e => up('body', e.target.value)}
                  placeholder={'Fala {nome}!\n\nEscreva aqui a novidade…'} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="label">Texto do botão (opcional)</label>
                  <input className="input" value={c.cta_label} placeholder="Abrir o app" onChange={e => up('cta_label', e.target.value)} />
                </div>
                <div>
                  <label className="label">Link do botão</label>
                  <input className="input" value={c.cta_url} placeholder="https://… (pode ser link de campanha)" onChange={e => up('cta_url', e.target.value)} />
                </div>
              </div>
            </div>
          </Card>
        </div>

        <div className="lg:col-span-2 space-y-4">
          <Card title="3. Conferir e enviar">
            <div className="bg-steel-50 rounded-xl p-4 text-center">
              <div className="text-3xl font-bold text-steel-900">{previewing ? '…' : preview?.count ?? '—'}</div>
              <div className="text-xs text-steel-500 uppercase tracking-wide">destinatários</div>
              {preview && !previewing && (
                <div className="text-xs text-steel-500 mt-1">
                  {preview.profiles} cadastros{preview.leads ? ` + ${preview.leads} leads` : ''}
                  {preview.sample.length > 0 && <div className="mt-1 text-steel-400 truncate">ex.: {preview.sample.join(', ')}</div>}
                </div>
              )}
            </div>

            <EmailPreview c={c} />

            <div className="space-y-2 mt-4">
              <button className="btn-secondary w-full" disabled={!ready || !!busy} onClick={test}>
                {busy === 'test' ? 'Enviando teste…' : 'Mandar teste pro meu e-mail'}
              </button>
              {!confirming ? (
                <button className="btn-primary w-full" disabled={!ready || !!busy || !preview?.count} onClick={() => setConfirming(true)}>
                  Enviar para {preview?.count ?? 0} pessoas
                </button>
              ) : (
                <div className="border border-alert-500/40 bg-alert-500/5 rounded-xl p-3">
                  <p className="text-sm text-steel-800">Confirma o envio para <b>{preview?.count}</b> pessoas? Não dá para desfazer.</p>
                  <div className="flex gap-2 mt-2">
                    <button className="btn-ghost flex-1" onClick={() => setConfirming(false)} disabled={busy === 'send'}>Cancelar</button>
                    <button className="btn-primary flex-1" onClick={send} disabled={busy === 'send'}>
                      {busy === 'send' ? 'Enviando…' : 'Sim, enviar'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>

      <Card title="Histórico de envios" subtitle={`${unsubs} pessoa(s) descadastrada(s) no total`}>
        {history.length === 0 ? (
          <Empty emoji="✉️" title="Nenhum e-mail enviado ainda" text="Os disparos aparecem aqui com quantos foram entregues ao provedor." />
        ) : (
          <ul className="divide-y divide-steel-100">
            {history.map(b => (
              <li key={b.id} className="py-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold text-steel-800 truncate">{b.subject}</div>
                  <div className="text-xs text-steel-500">{segmentText(b.segment)} · {new Date(b.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</div>
                  {b.error && <div className="text-xs text-alert-600 mt-0.5">{b.error}</div>}
                </div>
                <div className="text-right shrink-0">
                  <div className="font-bold text-steel-900">{b.sent}<span className="text-steel-400 text-sm">/{b.recipients}</span></div>
                  <div className={`text-[10px] uppercase tracking-wide ${b.status === 'erro' ? 'text-alert-600' : b.status === 'enviando' ? 'text-pending-700' : 'text-signal-700'}`}>{b.status}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function EmailPreview({ c }: { c: { subject: string; heading: string; body: string; cta_label: string; cta_url: string } }) {
  const fill = (s: string) => s.replaceAll('{nome}', 'Carlos');
  if (!c.heading && !c.body) return null;
  return (
    <div className="mt-4">
      <div className="text-xs font-semibold text-steel-500 uppercase tracking-wide mb-1.5">Prévia</div>
      <div className="border border-steel-200 rounded-xl overflow-hidden text-left">
        <div className="px-3 py-2 bg-steel-50 text-xs text-steel-600 border-b border-steel-200 truncate"><b>Assunto:</b> {fill(c.subject) || '—'}</div>
        <div className="bg-gradient-to-br from-brand-500 to-brand-600 px-4 py-3 text-white">
          <div className="text-[10px] uppercase tracking-wider font-bold opacity-90">Mecânico App</div>
          <div className="font-bold">{fill(c.heading) || '…'}</div>
        </div>
        <div className="p-4 text-sm text-steel-600 space-y-2">
          {fill(c.body).split(/\n{2,}/).map((p, i) => <p key={i} className="whitespace-pre-line">{p}</p>)}
          {c.cta_label && <span className="inline-block bg-brand-500 text-white font-bold rounded-lg px-4 py-2 text-sm">{c.cta_label} →</span>}
          <p className="text-[10px] text-steel-400 pt-2">Não quero mais receber esses e-mails</p>
        </div>
      </div>
    </div>
  );
}
