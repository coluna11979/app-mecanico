import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import AdminLayout from '@/components/layout/AdminLayout';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

type Audience = 'geral' | 'lojas' | 'embaixadores' | 'mecanicos';

interface Session {
  id: string;
  title: string;
  description: string | null;
  audience: Audience;
  scheduled_at: string | null;
  share_token: string;
  status: 'scheduled' | 'live' | 'completed' | 'cancelled';
  recording_status: 'pending' | 'recording' | 'completed' | 'failed' | 'off';
  recording_segments: string[];
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  webinar_slug: string | null;
  webinar_intent: 'mechanic' | 'workshop' | null;
  webinar_published: boolean;
  training_participants: { count: number }[];
}

const AUDIENCE_LABEL: Record<Audience, string> = {
  geral: '👥 Geral', lojas: '🏪 Lojas', embaixadores: '🤝 Embaixadores', mecanicos: '🔧 Mecânicos',
};

const STATUS_META: Record<Session['status'], { label: string; cls: string }> = {
  scheduled: { label: 'Agendado',  cls: 'bg-steel-100 text-steel-700' },
  live:      { label: 'Ao vivo',   cls: 'bg-red-100 text-red-700' },
  completed: { label: 'Encerrado', cls: 'bg-brand-50 text-brand-700' },
  cancelled: { label: 'Cancelado', cls: 'bg-steel-100 text-steel-500' },
};

const REC_LABEL: Record<Session['recording_status'], string> = {
  pending: 'Sem gravação', recording: 'Gravando agora', completed: 'Gravação pronta',
  failed: 'A gravação falhou', off: 'Sem gravação',
};

const randomToken = () => crypto.randomUUID().replace(/-/g, '').slice(0, 16);
const joinUrl = (s: Session) => `${window.location.origin}/treinamento/${s.share_token}`;
const webinarUrl = (slug: string) => `https://www.mecanicoapp.com.br/webinar/${slug}`;
const slugify = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
const fmtDate = (iso: string) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

export default function AdminTreinamentos() {
  const { user } = useAuth();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [audience, setAudience] = useState<Audience>('lojas');
  const [when, setWhen] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [openRec, setOpenRec] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [openWeb, setOpenWeb] = useState<string | null>(null);
  const [pending, setPending] = useState<Record<string, number>>({});

  useEffect(() => { load(); }, []);

  async function load() {
    const { data } = await supabase
      .from('training_sessions')
      .select('*, training_participants(count)')
      .order('created_at', { ascending: false })
      .limit(50);
    setSessions((data ?? []) as Session[]);
    setLoading(false);
    // Comentários do webinar esperando aprovação, por treinamento
    const { data: wc } = await supabase.from('webinar_comments').select('session_id').eq('status', 'pending');
    const counts: Record<string, number> = {};
    for (const c of wc ?? []) counts[c.session_id] = (counts[c.session_id] ?? 0) + 1;
    setPending(counts);
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (title.trim().length < 3) return setError('Dê um título ao treinamento.');
    setSaving(true);
    const { error: err } = await supabase.from('training_sessions').insert({
      title: title.trim(),
      description: description.trim() || null,
      audience,
      scheduled_at: when ? new Date(when).toISOString() : null,
      recording_status: 'off',
      livekit_room_name: `trein-${crypto.randomUUID()}`,
      share_token: randomToken(),
      created_by: user?.id ?? null,
    });
    setSaving(false);
    if (err) return setError(err.message);
    setTitle(''); setDescription(''); setWhen('');
    load();
  }

  async function copyInvite(s: Session) {
    const when = s.scheduled_at ? `\n📅 ${fmtDate(s.scheduled_at)}` : '';
    const text = `*${s.title}*${when}\n\nEntre pelo link (não precisa de login):\n${joinUrl(s)}`;
    try { await navigator.clipboard.writeText(text); } catch { prompt('Copie o convite:', text); }
    setCopied(s.id);
    setTimeout(() => setCopied(c => (c === s.id ? null : c)), 2000);
  }

  // Apaga do Cloudflare de verdade (não tem lixeira) — por isso a confirmação
  async function remove(s: Session, url?: string) {
    const msg = url
      ? 'Excluir esta gravação? O vídeo é apagado de vez e não dá pra recuperar.'
      : `Excluir o treinamento "${s.title}" e todas as gravações? Não dá pra recuperar.`;
    if (!confirm(msg)) return;
    setDeleting(url ?? s.id);
    const { data, error: err } = await supabase.functions.invoke('training-room', {
      body: url ? { action: 'delete_recording', session_id: s.id, url } : { action: 'delete_session', session_id: s.id },
    });
    setDeleting(null);
    if (err || data?.error) return alert(data?.error ?? 'Não foi possível excluir.');
    load();
  }

  async function cancel(s: Session) {
    if (!confirm(`Cancelar "${s.title}"? O link deixa de funcionar.`)) return;
    await supabase.from('training_sessions').update({ status: 'cancelled' }).eq('id', s.id);
    load();
  }

  return (
    <AdminLayout>
      <div className="max-w-3xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-steel-900">Treinamentos</h1>
          <p className="text-sm text-steel-500 mt-1">
            Sala de vídeo própria para treinar lojas e embaixadores. Quem recebe o link entra só com o nome.
          </p>
        </div>

        <form onSubmit={create} className="bg-white border border-steel-200 rounded-2xl p-5 space-y-4">
          <h2 className="font-bold text-steel-900">Novo treinamento</h2>
          <input
            value={title} onChange={e => setTitle(e.target.value)} placeholder="Título (ex.: Como usar a Agenda)"
            className="w-full rounded-xl border border-steel-300 px-4 py-2.5"
          />
          <textarea
            value={description} onChange={e => setDescription(e.target.value)} rows={2}
            placeholder="O que vai ser mostrado (opcional, aparece na tela de entrada)"
            className="w-full rounded-xl border border-steel-300 px-4 py-2.5"
          />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {(Object.keys(AUDIENCE_LABEL) as Audience[]).map(a => (
              <button key={a} type="button" onClick={() => setAudience(a)}
                className={`rounded-xl border-2 p-2 text-xs font-bold transition ${
                  audience === a ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-steel-200 text-steel-600'
                }`}>
                {AUDIENCE_LABEL[a]}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <label className="text-sm text-steel-700 flex items-center gap-2">
              Data e hora
              <input type="datetime-local" value={when} onChange={e => setWhen(e.target.value)}
                className="rounded-xl border border-steel-300 px-3 py-2" />
            </label>
            <p className="text-xs text-steel-500">Na sala, você aperta <b>⏺ Gravar</b> quando quiser começar.</p>
          </div>
          {error && <p className="text-sm text-alert-600">{error}</p>}
          <button type="submit" disabled={saving}
            className="rounded-xl bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white font-bold px-5 py-2.5">
            {saving ? 'Criando…' : 'Criar treinamento'}
          </button>
        </form>

        <div className="space-y-3">
          {loading && <p className="text-sm text-steel-500">Carregando…</p>}
          {!loading && sessions.length === 0 && (
            <p className="text-sm text-steel-500">Nenhum treinamento ainda. Crie o primeiro acima.</p>
          )}
          {sessions.map(s => {
            const st = STATUS_META[s.status];
            const people = s.training_participants?.[0]?.count ?? 0;
            const active = s.status === 'scheduled' || s.status === 'live';
            return (
              <div key={s.id} className="bg-white border border-steel-200 rounded-2xl p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-bold text-steel-900">{s.title}</h3>
                      <span className={`text-[11px] font-bold rounded-full px-2 py-0.5 ${st.cls}`}>{st.label}</span>
                    </div>
                    <p className="text-xs text-steel-500 mt-1">
                      {AUDIENCE_LABEL[s.audience]}
                      {s.scheduled_at && <> · 📅 {fmtDate(s.scheduled_at)}</>}
                      {' · '}{people} {people === 1 ? 'entrada' : 'entradas'}
                      {' · '}{REC_LABEL[s.recording_status]}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {active && (
                    <Link to={`/admin/treinamentos/${s.id}/sala`}
                      className="rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-bold px-3 py-2">
                      {s.status === 'live' ? 'Voltar pra sala' : 'Entrar e apresentar'}
                    </Link>
                  )}
                  {active && (
                    <button onClick={() => copyInvite(s)}
                      className="rounded-lg border border-steel-300 text-steel-700 text-sm font-bold px-3 py-2">
                      {copied === s.id ? '✓ Convite copiado' : 'Copiar convite'}
                    </button>
                  )}
                  {s.recording_segments.length > 0 && (
                    <button onClick={() => setOpenRec(o => (o === s.id ? null : s.id))}
                      className="rounded-lg border border-steel-300 text-steel-700 text-sm font-bold px-3 py-2">
                      {openRec === s.id ? 'Fechar gravação' : '▶ Ver gravação'}
                    </button>
                  )}
                  {s.recording_segments.length > 0 && s.status !== 'live' && (
                    <button onClick={() => setOpenWeb(o => (o === s.id ? null : s.id))}
                      className={`rounded-lg text-sm font-bold px-3 py-2 ${
                        s.webinar_published ? 'bg-signal-500/10 text-signal-700 border border-signal-300' : 'border border-steel-300 text-steel-700'
                      }`}>
                      {s.webinar_published ? '📢 Webinar no ar' : '📢 Publicar como webinar'}
                      {pending[s.id] > 0 && (
                        <span className="ml-1.5 rounded-full bg-alert-600 text-white text-[11px] px-1.5 py-0.5">💬 {pending[s.id]}</span>
                      )}
                    </button>
                  )}
                  {s.status === 'scheduled' && (
                    <button onClick={() => cancel(s)} className="text-sm text-steel-500 hover:text-alert-600 px-2">
                      Cancelar
                    </button>
                  )}
                  {s.status !== 'live' && (
                    <button onClick={() => remove(s)} disabled={deleting === s.id}
                      className="text-sm text-steel-500 hover:text-alert-600 px-2 disabled:opacity-60">
                      {deleting === s.id ? 'Excluindo…' : 'Excluir treinamento'}
                    </button>
                  )}
                </div>

                {openWeb === s.id && <WebinarPanel s={s} onSaved={load} />}

                {openRec === s.id && (
                  <div className="space-y-2">
                    {s.recording_status === 'recording' && (
                      <p className="text-xs text-steel-500">A gravação ainda está em andamento; o vídeo fica completo quando o treinamento terminar.</p>
                    )}
                    {s.recording_segments.map((url, i) => (
                      <div key={url}>
                        {s.recording_segments.length > 1 && <p className="text-xs font-bold text-steel-600 mb-1">Parte {i + 1}</p>}
                        <video src={url} controls preload="metadata" className="w-full rounded-xl bg-black" />
                        <div className="flex items-center gap-4 mt-1">
                          <a href={url} target="_blank" rel="noreferrer" className="text-xs text-brand-600 font-bold">Abrir / baixar</a>
                          {s.recording_status !== 'recording' && (
                            <button onClick={() => remove(s, url)} disabled={deleting === url}
                              className="text-xs text-alert-600 font-bold disabled:opacity-60">
                              {deleting === url ? 'Excluindo…' : 'Excluir gravação'}
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </AdminLayout>
  );
}

// A gravação vira página pública pro anúncio: nome + WhatsApp liberam o vídeo,
// e o botão embaixo leva pro cadastro do público escolhido.
function WebinarPanel({ s, onSaved }: { s: Session; onSaved: () => void }) {
  const [intent, setIntent] = useState<'workshop' | 'mechanic'>(s.webinar_intent ?? (s.audience === 'mecanicos' ? 'mechanic' : 'workshop'));
  const [slug, setSlug] = useState(s.webinar_slug ?? slugify(s.title));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [leads, setLeads] = useState<number | null>(null);

  useEffect(() => {
    if (!s.webinar_slug) return;
    supabase.from('leads').select('id', { count: 'exact', head: true })
      .contains('tags', [`webinar:${s.webinar_slug}`])
      .then(({ count }) => setLeads(count ?? 0));
  }, [s.webinar_slug]);

  async function save(published: boolean) {
    const clean = slugify(slug);
    if (clean.length < 3) return setError('O endereço precisa de pelo menos 3 letras.');
    setSaving(true); setError(null);
    const { error: err } = await supabase.from('training_sessions')
      .update({ webinar_slug: clean, webinar_intent: intent, webinar_published: published })
      .eq('id', s.id);
    setSaving(false);
    if (err) return setError(err.code === '23505' ? 'Esse endereço já está em uso por outro webinar.' : err.message);
    setSlug(clean);
    onSaved();
  }

  async function copy() {
    try { await navigator.clipboard.writeText(webinarUrl(slug)); } catch { prompt('Copie o link:', webinarUrl(slug)); }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="rounded-xl border border-steel-200 bg-steel-50 p-4 space-y-3">
      <p className="text-sm text-steel-600">
        Página pública pro anúncio: a pessoa deixa nome e WhatsApp, assiste à gravação e o botão embaixo leva pro cadastro.
      </p>
      <div>
        <p className="text-xs font-bold text-steel-700 mb-1">Pra quem é</p>
        <div className="grid grid-cols-2 gap-2">
          {([['workshop', '🏪 Oficinas'], ['mechanic', '🔧 Mecânicos']] as const).map(([v, label]) => (
            <button key={v} type="button" onClick={() => setIntent(v)}
              className={`rounded-xl border-2 p-2 text-sm font-bold ${
                intent === v ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-steel-200 text-steel-600 bg-white'
              }`}>
              {label}
            </button>
          ))}
        </div>
        <p className="text-xs text-steel-500 mt-1">
          O botão leva pro cadastro de {intent === 'workshop' ? 'oficina' : 'mecânico'}.
        </p>
      </div>
      <label className="block">
        <span className="text-xs font-bold text-steel-700">Endereço da página</span>
        <div className="mt-1 flex items-center rounded-xl border border-steel-300 bg-white overflow-hidden">
          <span className="pl-3 text-sm text-steel-400 whitespace-nowrap">/webinar/</span>
          <input value={slug} onChange={e => setSlug(e.target.value)} className="flex-1 min-w-0 px-1 py-2 text-sm outline-none" />
        </div>
      </label>
      {error && <p className="text-sm text-alert-600">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => save(true)} disabled={saving}
          className="rounded-lg bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white text-sm font-bold px-3 py-2">
          {saving ? 'Salvando…' : s.webinar_published ? 'Salvar alterações' : 'Publicar'}
        </button>
        {s.webinar_published && (
          <>
            <button onClick={copy} className="rounded-lg border border-steel-300 bg-white text-steel-700 text-sm font-bold px-3 py-2">
              {copied ? '✓ Link copiado' : 'Copiar link do anúncio'}
            </button>
            <a href={`/webinar/${s.webinar_slug ?? slug}`} target="_blank" rel="noreferrer"
              className="rounded-lg border border-steel-300 bg-white text-steel-700 text-sm font-bold px-3 py-2">
              Abrir página
            </a>
            <button onClick={() => save(false)} disabled={saving} className="text-sm text-steel-500 hover:text-alert-600 px-2">
              Tirar do ar
            </button>
          </>
        )}
      </div>
      {s.webinar_slug && <CommentsAdmin sessionId={s.id} onChange={onSaved} />}
      {s.webinar_published && (
        <p className="text-xs text-steel-500 break-all">
          {webinarUrl(s.webinar_slug ?? slug)}
          {leads !== null && <> · <b>{leads}</b> {leads === 1 ? 'pessoa deixou' : 'pessoas deixaram'} o WhatsApp</>}
        </p>
      )}
    </div>
  );
}

interface WebComment {
  id: string; name: string; phone: string; body: string;
  status: 'pending' | 'approved' | 'hidden'; reply: string | null; created_at: string;
}

// Moderação: comentário só aparece na página depois de aprovado; a resposta aparece embaixo dele
function CommentsAdmin({ sessionId, onChange }: { sessionId: string; onChange: () => void }) {
  const [list, setList] = useState<WebComment[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => { load(); }, [sessionId]);

  async function load() {
    const { data } = await supabase.from('webinar_comments')
      .select('id, name, phone, body, status, reply, created_at')
      .eq('session_id', sessionId).neq('status', 'hidden')
      .order('created_at', { ascending: false });
    setList((data ?? []) as WebComment[]);
  }

  async function update(id: string, patch: Partial<WebComment> & { replied_at?: string }) {
    setBusy(id);
    await supabase.from('webinar_comments').update(patch).eq('id', id);
    setBusy(null);
    await load();
    onChange();
  }

  function saveReply(c: WebComment) {
    const reply = (drafts[c.id] ?? c.reply ?? '').trim();
    // Responder já aprova: a resposta não faz sentido escondida
    update(c.id, { reply: reply || null, replied_at: reply ? new Date().toISOString() : undefined, status: 'approved' });
  }

  if (list.length === 0) return <p className="text-xs text-steel-500">💬 Nenhum comentário ainda.</p>;

  return (
    <div className="space-y-2">
      <p className="text-xs font-bold text-steel-700">💬 Comentários</p>
      {list.map(c => (
        <div key={c.id} className={`rounded-xl border p-3 bg-white ${c.status === 'pending' ? 'border-alert-300' : 'border-steel-200'}`}>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-bold text-steel-900">{c.name}</p>
            <a href={`https://wa.me/55${c.phone}`} target="_blank" rel="noreferrer" className="text-xs text-brand-600 font-bold">WhatsApp</a>
            <span className={`text-[11px] font-bold rounded-full px-2 py-0.5 ${
              c.status === 'pending' ? 'bg-alert-50 text-alert-700' : 'bg-signal-500/10 text-signal-700'
            }`}>
              {c.status === 'pending' ? 'Aguardando aprovação' : 'Aparecendo na página'}
            </span>
          </div>
          <p className="mt-1 text-sm text-steel-700 whitespace-pre-line">{c.body}</p>
          <textarea
            value={drafts[c.id] ?? c.reply ?? ''} onChange={e => setDrafts(d => ({ ...d, [c.id]: e.target.value }))}
            rows={2} placeholder="Sua resposta (aparece embaixo do comentário)"
            className="mt-2 w-full rounded-lg border border-steel-300 px-3 py-2 text-sm"
          />
          <div className="mt-2 flex flex-wrap gap-2">
            {c.status === 'pending' && (
              <button onClick={() => update(c.id, { status: 'approved' })} disabled={busy === c.id}
                className="rounded-lg bg-signal-600 text-white text-xs font-bold px-3 py-2 disabled:opacity-60">Aprovar</button>
            )}
            <button onClick={() => saveReply(c)} disabled={busy === c.id}
              className="rounded-lg bg-brand-600 text-white text-xs font-bold px-3 py-2 disabled:opacity-60">
              {c.reply ? 'Salvar resposta' : 'Responder e aprovar'}
            </button>
            <button onClick={() => update(c.id, { status: 'hidden' })} disabled={busy === c.id}
              className="text-xs text-steel-500 hover:text-alert-600 px-2">
              {c.status === 'pending' ? 'Recusar' : 'Esconder'}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
