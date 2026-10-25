import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from '@/components/ui/Toast';

const LABELS = ['', 'Ruim', 'Regular', 'Bom', 'Ótimo', 'Excelente'];

/**
 * Avaliar o mecânico sem sair da tela (mesma gravação da tela do serviço:
 * jobs.mechanic_rating + mechanic_rating_note). No celular sobe por baixo.
 */
export default function RateMechanicModal({ job, onClose, onSaved }: {
  job: { id: string; title: string; mechanicName?: string | null };
  onClose: () => void;
  onSaved: () => void;
}) {
  const [rating, setRating] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  async function save() {
    if (!rating) return;
    setSaving(true);
    const { error } = await supabase.from('jobs').update({
      mechanic_rating: rating,
      mechanic_rating_note: note.trim() || null,
    }).eq('id', job.id);
    setSaving(false);
    if (error) return toast.error('Não salvou: ' + error.message);
    toast.success('Avaliação enviada ⭐ Obrigado!');
    onSaved();
  }

  const shown = hovered || rating;
  return (
    <div className="fixed inset-0 z-50 bg-steel-900/60 flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl shadow-2xl p-5" onClick={e => e.stopPropagation()}>
        <div className="flex justify-center pb-2 sm:hidden"><div className="w-10 h-1 bg-steel-200 rounded-full" /></div>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-steel-900">⭐ Avaliar o mecânico</h2>
            <p className="text-sm text-steel-600 truncate">
              {job.mechanicName ? <><strong>{job.mechanicName}</strong> · </> : null}{job.title}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-steel-400 hover:text-steel-700 text-xl leading-none h-9 w-9 shrink-0" aria-label="Fechar">×</button>
        </div>

        <div className="flex items-center gap-1 mt-4" onMouseLeave={() => setHovered(0)}>
          {[1, 2, 3, 4, 5].map(n => (
            <button key={n} type="button" onClick={() => setRating(n)} onMouseEnter={() => setHovered(n)}
              aria-label={`${n} estrela${n > 1 ? 's' : ''}`}
              className={`h-12 w-12 grid place-items-center text-3xl transition active:scale-90 ${n <= shown ? 'text-amber-500' : 'text-steel-300'}`}>
              {n <= shown ? '★' : '☆'}
            </button>
          ))}
          {shown > 0 && <span className="ml-1 text-sm font-semibold text-steel-600">{LABELS[shown]}</span>}
        </div>

        <textarea className="input mt-3 text-sm resize-none" rows={3} value={note} onChange={e => setNote(e.target.value)}
          placeholder="Comentário (opcional): pontualidade, qualidade, organização…" />

        <div className="flex gap-3 mt-4">
          <button type="button" onClick={onClose} className="btn-ghost flex-1">Depois</button>
          <button type="button" onClick={save} disabled={!rating || saving} className="btn-primary flex-[2] disabled:opacity-50">
            {saving ? 'Enviando…' : 'Enviar avaliação'}
          </button>
        </div>
      </div>
    </div>
  );
}
