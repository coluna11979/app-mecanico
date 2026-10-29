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

  useEffect(() => { load(); }, []);

  async function load() {
    const { data } = await supabase
      .from('training_sessions')
      .select('*, training_participants(count)')
      .order('created_at', { ascending: false })
      .limit(50);
    setSessions((data ?? []) as Session[]);
    setLoading(false);
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
