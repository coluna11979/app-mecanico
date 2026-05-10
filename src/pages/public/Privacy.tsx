import { Link } from 'react-router-dom';
import { useEffect } from 'react';
import { Logo } from '@/components/Logo';
import { LegalDoc } from '@/components/LegalDoc';
import { PRIVACY_POLICY, TERMS_VERSION } from '@/data/legal/termsContent';

export default function Privacy() {
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }); }, []);

  return (
    <div className="min-h-screen bg-steel-50">
      <header className="bg-white border-b border-steel-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/"><Logo /></Link>
          <div className="text-xs text-steel-500 hidden sm:block">
            Versão {TERMS_VERSION}
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="card !p-6 sm:!p-10">
          <LegalDoc content={PRIVACY_POLICY} />
        </div>

        <div className="mt-6 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between text-sm">
          <Link to="/termos" className="text-brand-600 hover:underline font-semibold">
            📜 Termos de Uso →
          </Link>
          <Link to="/" className="text-steel-500 hover:text-brand-600">
            ← Voltar ao site
          </Link>
        </div>
      </div>
    </div>
  );
}
