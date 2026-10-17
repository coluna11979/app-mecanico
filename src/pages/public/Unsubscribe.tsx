import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Logo } from '@/components/Logo';

/** Descadastro do e-mail marketing — link do rodapé dos disparos. */
export default function Unsubscribe() {
  const { token = '' } = useParams();
  const [state, setState] = useState<'loading' | 'ok' | 'invalid'>('loading');

  useEffect(() => {
    supabase.rpc('marketing_unsubscribe', { p_token: token })
      .then(({ data, error }) => setState(!error && data ? 'ok' : 'invalid'));
  }, [token]);

  return (
    <div className="min-h-screen bg-steel-50 grid place-items-center px-4">
      <div className="card max-w-md w-full text-center">
        <div className="flex justify-center mb-4"><Logo /></div>
        {state === 'loading' && <p className="text-steel-500">Processando…</p>}
        {state === 'ok' && (
          <>
            <h1 className="text-xl font-bold text-steel-900">Pronto, você foi descadastrado</h1>
            <p className="text-steel-600 mt-2 text-sm">
              Não vamos mais mandar e-mails de novidades e promoções. Avisos sobre a sua conta continuam chegando normalmente.
            </p>
          </>
        )}
        {state === 'invalid' && (
          <>
            <h1 className="text-xl font-bold text-steel-900">Link inválido</h1>
            <p className="text-steel-600 mt-2 text-sm">Esse link de descadastro não é válido ou já expirou.</p>
          </>
        )}
        <Link to="/" className="inline-block mt-6 text-sm text-brand-600 hover:underline">Ir para o início</Link>
      </div>
    </div>
  );
}
