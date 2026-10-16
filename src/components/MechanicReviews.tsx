import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

type Review = {
  rating: number;
  note: string | null;
  rated_at: string;
  workshop_name: string;
};

export function MechanicReviews({ mechanicId }: { mechanicId: string }) {
  const [reviews, setReviews] = useState<Review[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    supabase.rpc('get_mechanic_reviews', { p_mechanic_id: mechanicId })
      .then(({ data }) => {
        if (!alive) return;
        setReviews((data as Review[]) ?? []);
        setLoading(false);
      });
    return () => { alive = false; };
  }, [mechanicId]);

  if (loading) {
    return <div className="text-xs text-steel-400 py-3 text-center">Carregando avaliações…</div>;
  }

  if (!reviews || reviews.length === 0) {
    return (
      <div className="text-xs text-steel-400 py-3 text-center italic">
        Sem avaliações de outras oficinas ainda.
      </div>
    );
  }

  const total = reviews.length;
  const avg = reviews.reduce((s, r) => s + r.rating, 0) / total;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-steel-600 border-b border-steel-100 pb-2">
        <span><strong className="text-steel-800">★ {avg.toFixed(1)}</strong> · {total} {total === 1 ? 'avaliação' : 'avaliações'} de outras oficinas</span>
      </div>
      <div className="space-y-2 max-h-64 overflow-y-auto">
        {reviews.map((r, i) => (
          <div key={i} className="bg-white border border-steel-100 rounded-lg p-2.5 text-xs">
            <div className="flex items-center justify-between gap-2">
              <div className="font-semibold text-steel-800 truncate">{r.workshop_name}</div>
              <div className="shrink-0 text-pending-500 font-bold">
                {'★'.repeat(r.rating)}<span className="text-steel-300">{'★'.repeat(5 - r.rating)}</span>
              </div>
            </div>
            <div className="text-[10px] text-steel-500 mt-0.5">
              {new Date(r.rated_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
            </div>
            {r.note && (
              <div className="text-steel-700 mt-1 italic leading-snug">"{r.note}"</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
