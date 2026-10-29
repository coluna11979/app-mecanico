import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Logo } from '@/components/Logo';
import TrainingRoomView from '@/components/training/TrainingRoomView';

interface Info { title: string; description: string | null; scheduled_at: string | null; status: string }
interface Joined { token: string; ws_url: string; title: string }

const NAME_KEY = 'treinamento-nome';

// Entrada pública do treinamento (/treinamento/:token): sem login, só o nome.
export default function TreinamentoEntrar() {
  const { token } = useParams<{ token: string }>();
  const [info, setInfo] = useState<Info | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(() => { try { return localStorage.getItem(NAME_KEY) ?? ''; } catch { return ''; } });
  const [store, setStore] = useState('');
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState<Joined | null>(null);
  const [left, setLeft] = useState(false);

  useEffect(() => {
    supabase.functions.invoke('training-room', { body: { action: 'info', share_token: token } })
      .then(({ data, error: err }) => {
        if (err || data?.error) setError(data?.error ?? 'Link de treinamento inválido.');
        else setInfo(data.session as Info);
      });
  }, [token]);

  async function join(e: React.FormEvent) {
    e.preventDefault();
    if (name.trim().length < 2) return setError('Digite seu nome.');
    setError(null); setJoining(true);
    const { data, error: err } = await supabase.functions.invoke('training-room', {
      body: { action: 'guest_token', share_token: token, name: name.trim(), store: store.trim() },
    });
    setJoining(false);
    if (err || data?.error) return setError(data?.error ?? 'Não foi possível entrar agora.');
    try { localStorage.setItem(NAME_KEY, name.trim()); } catch { /* sem storage, segue */ }
    setLeft(false);
    setJoined(data as Joined);
  }

  if (joined && !left) {
    return (
      <TrainingRoomView
        token={joined.token}
        wsUrl={joined.ws_url}
        title={joined.title}
        host={false}
        onLeave={() => setLeft(true)}
      />
    );
  }

  const ended = info?.status === 'completed' || info?.status === 'cancelled';

  return (
    <div className="min-h-[100dvh] bg-steel-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white border border-steel-200 rounded-2xl p-6 space-y-5">
        <Logo />
        {!info && !error && <p className="text-steel-500 text-sm">Carregando…</p>}
        {info && (
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-brand-600">Treinamento</p>
            <h1 className="text-xl font-bold text-steel-900 mt-1">{info.title}</h1>
            {info.description && <p className="text-sm text-steel-600 mt-2 whitespace-pre-line">{info.description}</p>}
            {info.scheduled_at && (
              <p className="text-sm text-steel-500 mt-2">
                📅 {new Date(info.scheduled_at).toLocaleString('pt-BR', { dateStyle: 'full', timeStyle: 'short' })}
              </p>
            )}
          </div>
        )}

        {left && <p className="text-sm text-steel-700 bg-steel-100 rounded-xl p-3">Você saiu da sala. Pode entrar de novo quando quiser.</p>}

        {info && !ended && (
          <form onSubmit={join} className="space-y-3">
            <input
              value={name} onChange={e => setName(e.target.value)} placeholder="Seu nome" autoComplete="name"
              className="w-full rounded-xl border border-steel-300 px-4 py-3 text-base"
            />
            <input
              value={store} onChange={e => setStore(e.target.value)} placeholder="Loja / oficina (opcional)"
              className="w-full rounded-xl border border-steel-300 px-4 py-3 text-base"
            />
            <p className="text-xs text-steel-500">O treinamento pode ser gravado; um aviso aparece na sala enquanto estiver gravando.</p>
            <button
              type="submit" disabled={joining}
              className="w-full rounded-xl bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white font-bold py-3 min-h-[44px]"
            >
              {joining ? 'Entrando…' : 'Entrar no treinamento'}
            </button>
          </form>
        )}
        {ended && <p className="text-sm text-steel-700">Esse treinamento já terminou.</p>}
        {error && <p className="text-sm text-alert-600">{error}</p>}
      </div>
    </div>
  );
}
