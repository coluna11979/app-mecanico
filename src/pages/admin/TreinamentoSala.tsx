import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import TrainingRoomView from '@/components/training/TrainingRoomView';

interface Joined { token: string; ws_url: string; title: string }

// Sala do apresentador (admin). Sair só desconecta; "Encerrar" fecha a sala pra todos
// e finaliza a gravação.
export default function TreinamentoSala() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [joined, setJoined] = useState<Joined | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ending, setEnding] = useState(false);

  useEffect(() => {
    supabase.functions.invoke('training-room', { body: { action: 'host_token', session_id: id } })
      .then(({ data, error: err }) => {
        if (err || data?.error) setError(data?.error ?? err?.message ?? 'Não foi possível abrir a sala.');
        else setJoined(data as Joined);
      });
  }, [id]);

  async function record(on: boolean): Promise<string | null> {
    const { data, error: err } = await supabase.functions.invoke('training-room', {
      body: { action: 'record', session_id: id, on },
    });
    if (err || data?.error) return data?.error ?? 'Não foi possível mudar a gravação.';
    return null;
  }

  async function screen(identity: string, on: boolean): Promise<string | null> {
    const { data, error: err } = await supabase.functions.invoke('training-room', {
      body: { action: 'screen', session_id: id, identity, on },
    });
    if (err || data?.error) return data?.error ?? 'Não foi possível mudar a tela do convidado.';
    return null;
  }

  async function endForAll() {
    if (!confirm('Encerrar o treinamento para todos? A gravação será finalizada.')) return;
    setEnding(true);
    await supabase.functions.invoke('training-room', { body: { action: 'end', session_id: id } });
    navigate('/admin/treinamentos');
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-steel-700">{error}</p>
        <button onClick={() => navigate('/admin/treinamentos')} className="text-brand-600 font-bold">Voltar</button>
      </div>
    );
  }
  if (!joined) {
    return <div className="min-h-screen flex items-center justify-center text-steel-500">Abrindo a sala…</div>;
  }

  return (
    <TrainingRoomView
      token={joined.token}
      wsUrl={joined.ws_url}
      title={joined.title}
      host
      onLeave={() => navigate('/admin/treinamentos')}
      onRecord={record}
      onScreen={screen}
      topRight={
        <button
          onClick={endForAll}
          disabled={ending}
          className="shrink-0 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-60 px-3 py-1.5 text-xs font-bold text-white"
        >
          {ending ? 'Encerrando…' : 'Encerrar para todos'}
        </button>
      }
    />
  );
}
