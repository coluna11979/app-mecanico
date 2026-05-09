import { FormEvent, ReactNode, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import WorkshopLayout from '@/components/layout/WorkshopLayout';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export interface Benefit {
  icon: string;
  title: string;
  desc: string;
}

interface Props {
  featureKey: string;            // 'checkup_premium' | 'ai_insights' | ...
  emoji: string;
  badge?: string;                // 'Em breve · Beta fechado'
  title: string;
  subtitle: string;
  description: ReactNode;
  benefits: Benefit[];
  /** Cor do gradient hero (ex: 'from-brand-500 to-pending-500') */
  gradient?: string;
  /** CTA principal — texto antes/depois */
  ctaText?: string;
  ctaSuccessText?: string;
}

export default function ComingSoonPage({
  featureKey, emoji, badge, title, subtitle, description, benefits,
  gradient = 'from-brand-500 to-brand-700',
  ctaText = 'Quero ser avisado quando lançar',
  ctaSuccessText = 'Show! Vamos te avisar em primeira mão.',
}: Props) {
  const { user, currentWorkshop } = useAuth();
  const nav = useNavigate();

  const [interested, setInterested]   = useState(false);
  const [feedback, setFeedback]       = useState('');
  const [busy, setBusy]               = useState(false);
  const [savedFeedback, setSavedFeedback] = useState(false);

  useEffect(() => {
    if (!currentWorkshop?.id) return;
    supabase
      .from('feature_interest')
      .select('*')
      .eq('workshop_id', currentWorkshop.id)
      .eq('feature_key', featureKey)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setInterested(true);
          setFeedback(data.feedback ?? '');
        }
      });
  }, [currentWorkshop?.id, featureKey]);

  async function markInterest() {
    if (!currentWorkshop?.id || !user) return;
    setBusy(true);
    await supabase.from('feature_interest').upsert({
      workshop_id: currentWorkshop.id,
      profile_id:  user.id,
      feature_key: featureKey,
      interested:  true,
    }, { onConflict: 'workshop_id,feature_key' });
    setBusy(false);
    setInterested(true);
  }

  async function sendFeedback(e: FormEvent) {
    e.preventDefault();
    if (!currentWorkshop?.id || !user || !feedback.trim()) return;
    setBusy(true);
    await supabase.from('feature_interest').upsert({
      workshop_id: currentWorkshop.id,
      profile_id:  user.id,
      feature_key: featureKey,
      interested:  true,
      feedback:    feedback.trim(),
    }, { onConflict: 'workshop_id,feature_key' });
    setBusy(false);
    setSavedFeedback(true);
    setTimeout(() => setSavedFeedback(false), 4000);
  }

  return (
    <WorkshopLayout>
      <button
        onClick={() => nav(-1)}
        className="text-sm text-steel-500 hover:text-brand-500 mb-3"
      >
        ← Voltar
      </button>

      {/* HERO */}
      <div className={`rounded-3xl bg-gradient-to-br ${gradient} text-white px-6 py-10 sm:px-10 sm:py-14 relative overflow-hidden`}>
        {/* Decoração */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative max-w-3xl">
          {badge && (
            <span className="inline-block bg-white/20 backdrop-blur text-white text-[11px] font-bold uppercase tracking-widest rounded-full px-3 py-1 mb-3 border border-white/30">
              {badge}
            </span>
          )}
          <div className="text-6xl mb-4">{emoji}</div>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight leading-tight">{title}</h1>
          <p className="text-lg sm:text-xl mt-3 opacity-90 leading-relaxed">{subtitle}</p>

          <div className="mt-8 max-w-xl">
            {!interested ? (
              <button
                onClick={markInterest}
                disabled={busy}
                className="bg-white text-steel-900 hover:bg-steel-100 transition font-bold rounded-2xl px-6 py-3.5 disabled:opacity-60 shadow-xl"
              >
                {busy ? '…' : `🔔 ${ctaText}`}
              </button>
            ) : (
              <div className="bg-white/15 backdrop-blur rounded-2xl px-5 py-4 border border-white/30">
                <div className="flex items-center gap-2 font-bold">
                  <span className="text-xl">✅</span>
                  <span>{ctaSuccessText}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* DESCRIÇÃO */}
      <section className="mt-8 max-w-3xl">
        <div className="prose prose-steel max-w-none text-steel-700 leading-relaxed">
          {description}
        </div>
      </section>

      {/* BENEFÍCIOS */}
      <section className="mt-10">
        <h2 className="text-2xl font-bold tracking-tight mb-5">O que vai estar incluso</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {benefits.map((b, i) => (
            <div key={i} className="card hover:shadow-md transition">
              <div className="text-3xl mb-2">{b.icon}</div>
              <h3 className="font-bold text-steel-900">{b.title}</h3>
              <p className="text-sm text-steel-500 mt-1 leading-relaxed">{b.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* FEEDBACK */}
      <section className="mt-10 max-w-3xl">
        <div className="card border-2 border-brand-200 bg-brand-50/40">
          <h2 className="text-xl font-bold text-brand-700 flex items-center gap-2">
            💬 Sua opinião conta — estamos ouvindo!
          </h2>
          <p className="text-sm text-steel-600 mt-1">
            Ajuda a gente a construir esse módulo certinho pra sua realidade. O que você gostaria que essa ferramenta fizesse? O que mais te dá dor de cabeça hoje?
          </p>
          <form onSubmit={sendFeedback} className="mt-4 space-y-3">
            <textarea
              className="input text-sm resize-none bg-white"
              rows={4}
              placeholder="Ex.: Quero que o cliente possa receber o relatório por WhatsApp · Os meus mecânicos perdem muito tempo conferindo as mesmas coisas · ..."
              value={feedback}
              onChange={e => setFeedback(e.target.value)}
            />
            <div className="flex items-center justify-between gap-3">
              <button
                type="submit"
                disabled={busy || !feedback.trim()}
                className="btn-primary disabled:opacity-50"
              >
                {busy ? '…' : 'Enviar opinião'}
              </button>
              {savedFeedback && (
                <span className="text-signal-600 text-sm font-semibold">
                  ✓ Recebemos! Obrigado pelo feedback 🙏
                </span>
              )}
            </div>
          </form>
        </div>
      </section>

      <div className="h-8" />
    </WorkshopLayout>
  );
}
