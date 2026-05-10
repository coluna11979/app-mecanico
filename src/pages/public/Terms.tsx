import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Logo } from '@/components/Logo';
import { LegalDoc } from '@/components/LegalDoc';
import {
  TERMS_GENERAL, TERMS_MECHANIC, TERMS_WORKSHOP, TERMS_VERSION,
} from '@/data/legal/termsContent';

type Tab = 'general' | 'mechanic' | 'workshop';

const TABS: { key: Tab; label: string; emoji: string; content: string }[] = [
  { key: 'general',  label: 'Termos Gerais',     emoji: '📜', content: TERMS_GENERAL  },
  { key: 'mechanic', label: 'Para Mecânicos',    emoji: '🔧', content: TERMS_MECHANIC },
  { key: 'workshop', label: 'Para Oficinas',     emoji: '🏪', content: TERMS_WORKSHOP },
];

export default function Terms() {
  const [params] = useSearchParams();
  const initialTab = (params.get('tab') as Tab) || 'general';
  const [tab, setTab] = useState<Tab>(initialTab);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [tab]);

  const current = TABS.find(t => t.key === tab) ?? TABS[0];

  return (
    <div className="min-h-screen bg-steel-50">
      {/* Header */}
      <header className="bg-white border-b border-steel-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/"><Logo /></Link>
          <div className="text-xs text-steel-500 hidden sm:block">
            Versão {TERMS_VERSION}
          </div>
        </div>
      </header>

      {/* Title + tabs */}
      <div className="max-w-4xl mx-auto px-6 py-8">
        <h1 className="text-4xl font-bold tracking-tight mb-2">Termos de Uso</h1>
        <p className="text-steel-500 mb-6">
          Leia atentamente. Estes termos regem o uso da plataforma MecânicoApp.
        </p>

        <div className="flex gap-1 bg-steel-100 rounded-2xl p-1 mb-8 overflow-x-auto">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 min-w-fit px-4 py-2.5 rounded-xl text-sm font-bold transition flex items-center justify-center gap-2 whitespace-nowrap ${
                tab === t.key
                  ? 'bg-white shadow text-steel-900'
                  : 'text-steel-500 hover:text-steel-700'
              }`}
            >
              <span>{t.emoji}</span>
              <span>{t.label}</span>
            </button>
          ))}
        </div>

        <div className="card !p-6 sm:!p-10">
          <LegalDoc content={current.content} />
        </div>

        <div className="mt-6 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between text-sm">
          <Link to="/privacidade" className="text-brand-600 hover:underline font-semibold">
            🔒 Política de Privacidade →
          </Link>
          <Link to="/" className="text-steel-500 hover:text-brand-600">
            ← Voltar ao site
          </Link>
        </div>
      </div>
    </div>
  );
}
