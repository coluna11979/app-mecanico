import { useEffect, useState } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { supabase } from '@/lib/supabase';

type Target = 'all' | 'mechanic' | 'workshop';
const EMOJIS = ['🔔', '🎉', '⚠️', '💡', '🛠️', '📋', '💰', '🚀', '📢', '✅'];

interface SentLog {
  title: string;
  body: string;
  icon: string | null;
  type: string;
  created_at: string;
  count: number;
}

export default function AdminAvisos() {
  const [title, setTitle]   = useState('');
  const [body, setBody]     = useState('');
  const [icon, setIcon]     = useState('🔔');
  const [link, setLink]     = useState('');
  const [target, setTarget] = useState<Target>('all');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError]   = useState<string | null>(null);
  const [recent, setRecent] = useState<SentLog[]>([]);

  useEffect(() => { loadRecent(); }, []);

  async function loadRecent() {
    // Agrupa broadcasts recentes por (title, created_at truncado) só pra histórico visual
    const { data } = await supabase
      .from('notifications')
      .select('title, body, icon, type, created_at')
      .eq('type', 'broadcast')
      .order('created_at', { ascending: false })
      .limit(200);
    const map = new Map<string, SentLog>();
    (data ?? []).forEach((n: any) => {
      const bucket = `${n.title}|${n.created_at.slice(0, 16)}`;
      const ex = map.get(bucket);
      if (ex) ex.count += 1;
      else map.set(bucket, { title: n.title, body: n.body, icon: n.icon, type: n.type, created_at: n.created_at, count: 1 });
    });
    setRecent([...map.values()].slice(0, 10));
  }

  async function send() {
    setError(null); setResult(null);
    if (title.trim().length < 3) return setError('Título muito curto.');
    if (body.trim().length < 3)  return setError('Mensagem muito curta.');

    setSending(true);
    const { data, error: err } = await supabase.rpc('broadcast_notification', {
      p_title:  title.trim(),
      p_body:   body.trim(),
      p_icon:   icon,
      p_link:   link.trim() || null,
      p_target: target,
    });
    setSending(false);
    if (err) { setError(err.message); return; }
    const n = (data as number) ?? 0;
    setResult(`Aviso enviado para ${n} ${n === 1 ? 'usuário' : 'usuários'}.`);
    setTitle(''); setBody(''); setLink('');
    loadRecent();
  }

  const targetLabel: Record<Target, string> = {
    all: 'Todos (mecânicos + oficinas)',
    mechanic: 'Só mecânicos',
    workshop: 'Só oficinas',
  };

  return (
    <AdminLayout>
      <div className="max-w-2xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-steel-900">Enviar aviso</h1>
          <p className="text-sm text-steel-500 mt-1">
            Dispara um comunicado pro mural in-app dos usuários aprovados.
          </p>
        </div>

        <div className="bg-white border border-steel-200 rounded-2xl p-5 space-y-4">
          {/* Segmento */}
          <div>
            <label className="text-xs font-bold text-steel-700 uppercase tracking-wider">Enviar para</label>
            <div className="grid grid-cols-3 gap-2 mt-2">
              {(['all', 'mechanic', 'workshop'] as Target[]).map(t => (
                <button key={t} type="button" onClick={() => setTarget(t)}
                  className={`rounded-xl border-2 p-2 text-xs font-bold transition ${
                    target === t ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-steel-200 text-steel-600'
                  }`}>
                  {t === 'all' ? '👥 Todos' : t === 'mechanic' ? '🔧 Mecânicos' : '🏪 Oficinas'}
                </button>
              ))}
            </div>
          </div>

          {/* Ícone */}
          <div>
            <label className="text-xs font-bold text-steel-700 uppercase tracking-wider">Ícone</label>
            <div className="flex flex-wrap gap-2 mt-2">
              {EMOJIS.map(e => (
                <button key={e} type="button" onClick={() => setIcon(e)}
                  className={`h-10 w-10 rounded-xl text-lg grid place-items-center transition ${
                    icon === e ? 'bg-brand-500/15 ring-2 ring-brand-500' : 'bg-steel-100 hover:bg-steel-200'
                  }`}>
                  {e}
                </button>
              ))}
            </div>
          </div>

          {/* Título */}
          <div>
            <label className="text-xs font-bold text-steel-700 uppercase tracking-wider">Título *</label>
            <input className="input mt-1" maxLength={80} value={title}
              onChange={e => setTitle(e.target.value)} placeholder="Ex.: Nova função: editar demanda" />
          </div>

          {/* Mensagem */}
          <div>
            <label className="text-xs font-bold text-steel-700 uppercase tracking-wider">Mensagem *</label>
            <textarea className="input mt-1 resize-none" rows={4} maxLength={500} value={body}
              onChange={e => setBody(e.target.value)} placeholder="Escreva o comunicado…" />
            <div className="text-[10px] text-steel-400 text-right mt-0.5">{body.length}/500</div>
          </div>

          {/* Link opcional */}
          <div>
            <label className="text-xs font-bold text-steel-700 uppercase tracking-wider">Link interno (opcional)</label>
            <input className="input mt-1" value={link}
              onChange={e => setLink(e.target.value)} placeholder="Ex.: /mecanico/ganhos" />
          </div>

          {error  && <div className="bg-alert-50 border border-alert-200 text-alert-700 text-sm rounded-xl px-3 py-2">⚠️ {error}</div>}
          {result && <div className="bg-signal-50 border border-signal-200 text-signal-700 text-sm rounded-xl px-3 py-2">✅ {result}</div>}

          {/* Preview */}
          <div className="bg-steel-50 rounded-xl p-3 border border-steel-200">
            <div className="text-[10px] text-steel-500 uppercase tracking-widest font-bold mb-2">Prévia · {targetLabel[target]}</div>
            <div className="bg-white border border-steel-200 rounded-xl p-3 flex gap-3">
              <div className="text-2xl">{icon}</div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-sm text-steel-900">{title || 'Título do aviso'}</div>
                <div className="text-sm text-steel-600 mt-0.5">{body || 'Sua mensagem aparece aqui.'}</div>
              </div>
            </div>
          </div>

          <button onClick={send} disabled={sending}
            className="btn-primary w-full disabled:opacity-50">
            {sending ? 'Enviando…' : '📢 Enviar aviso'}
          </button>
        </div>

        {/* Histórico */}
        {recent.length > 0 && (
          <div>
            <h2 className="text-sm font-bold text-steel-500 uppercase tracking-widest mb-3">Enviados recentemente</h2>
            <div className="space-y-2">
              {recent.map((r, i) => (
                <div key={i} className="bg-white border border-steel-200 rounded-xl p-3 flex gap-3">
                  <div className="text-xl">{r.icon || '🔔'}</div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm text-steel-900">{r.title}</div>
                    <div className="text-xs text-steel-500 truncate">{r.body}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs font-bold text-steel-700">{r.count} {r.count === 1 ? 'envio' : 'envios'}</div>
                    <div className="text-[10px] text-steel-400">
                      {new Date(r.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
