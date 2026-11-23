import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Logo } from '@/components/Logo';

type EmailLoginResult = {
  ok: boolean;
  reason?: 'invalid' | 'expired' | 'login_required' | 'error';
  token_hash?: string;
  email?: string;
  next?: string;
};

function safeNext(path?: string) {
  return path && path.startsWith('/') && !path.startsWith('//') ? path : '/aguardando-aprovacao';
}

/** Botão dos e-mails de cadastro: entra na conta sem senha e leva direto à tela certa. */
export default function EmailLogin() {
  const nav = useNavigate();
  const [failed, setFailed] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    // StrictMode roda o efeito duas vezes em dev; a troca da chave só pode acontecer uma vez
    if (started.current) return;
    started.current = true;

    const token = new URLSearchParams(window.location.hash.slice(1)).get('t');
    window.history.replaceState(null, '', window.location.pathname);

    (async () => {
      if (!token) { setFailed(true); return; }

      const { data, error } = await supabase.functions.invoke<EmailLoginResult>('email-login', { body: { token } });
      const next = safeNext(data?.next);
      const goToLogin = () => nav(
        `/login?email=${encodeURIComponent(data?.email ?? '')}&next=${encodeURIComponent(next)}`,
        { replace: true },
      );

      if (error || !data?.ok || !data.token_hash) {
        if (data?.email) goToLogin(); else setFailed(true);
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user.email?.toLowerCase() === data.email?.toLowerCase()) {
        nav(next, { replace: true });
        return;
      }
      // Outra conta aberta neste aparelho (ex.: admin conferindo o e-mail): sai só daqui,
      // sem derrubar as sessões dela em outros aparelhos
      if (session) await supabase.auth.signOut({ scope: 'local' });

      const { error: otpErr } = await supabase.auth.verifyOtp({ token_hash: data.token_hash, type: 'magiclink' });
      if (otpErr) { goToLogin(); return; }
      nav(next, { replace: true });
    })();
  }, [nav]);

  return (
    <div className="min-h-screen bg-steel-50 flex items-center justify-center px-4">
      <div className="card w-full max-w-sm text-center">
        <div className="flex justify-center mb-6"><Logo /></div>
        {failed ? (
          <>
            <h1 className="text-lg font-bold text-steel-900">Esse link não abre mais</h1>
            <p className="text-sm text-steel-500 mt-2 leading-relaxed">
              Entre com o email e a senha que você criou no cadastro.
            </p>
            <Link to="/login" replace className="btn-primary w-full mt-6">Entrar</Link>
          </>
        ) : (
          <>
            <div className="mx-auto h-8 w-8 rounded-full border-4 border-steel-200 border-t-brand-500 animate-spin" />
            <p className="text-sm font-semibold text-steel-700 mt-4">Entrando na sua conta…</p>
          </>
        )}
      </div>
    </div>
  );
}
