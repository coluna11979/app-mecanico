import { FormEvent, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Logo } from '@/components/Logo';

export default function ForgotPassword() {
  const [params] = useSearchParams();
  const [email, setEmail] = useState(params.get('email') ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setSubmitting(true);
    setErr(null);

    const redirectTo = `${window.location.origin}/redefinir-senha`;
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo,
    });

    setSubmitting(false);
    if (error) {
      setErr(traduzir(error.message));
      return;
    }
    setSent(true);
  }

  return (
    <div className="min-h-screen grid place-items-center bg-steel-50 p-6">
      <div className="max-w-md w-full">
        <div className="flex justify-center mb-6"><Logo /></div>

        <div className="card space-y-5">
          {!sent ? (
            <>
              <div>
                <h1 className="text-2xl font-bold tracking-tight">Esqueci minha senha</h1>
                <p className="text-sm text-steel-500 mt-1">
                  Digite seu email cadastrado. Vamos enviar um link pra você criar uma nova senha.
                </p>
              </div>

              <form onSubmit={onSubmit} className="space-y-4">
                <div>
                  <label className="label">Seu email</label>
                  <input
                    type="email"
                    className="input"
                    required
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="voce@empresa.com"
                    autoFocus
                  />
                </div>

                {err && (
                  <div className="text-sm text-alert-600 bg-alert-50 rounded-lg px-3 py-2">
                    ⚠️ {err}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitting || !email.trim()}
                  className="btn-primary w-full btn-lg disabled:opacity-50"
                >
                  {submitting ? 'Enviando…' : 'Enviar link de redefinição'}
                </button>
              </form>
            </>
          ) : (
            <div className="text-center space-y-3 py-4">
              <div className="text-5xl">📧</div>
              <h2 className="text-2xl font-bold text-signal-700">Email enviado!</h2>
              <p className="text-sm text-steel-600 leading-relaxed">
                Enviamos um link de redefinição para <strong>{email}</strong>.
                Confira sua caixa de entrada (e o spam, se for o primeiro email).
              </p>
              <p className="text-xs text-steel-400">
                O link expira em 1 hora.
              </p>
            </div>
          )}

          <div className="pt-3 border-t border-steel-100 flex flex-col gap-2 text-sm text-center">
            <Link to="/login" className="text-brand-600 hover:underline font-semibold">
              ← Voltar pro login
            </Link>
            <Link to="/" className="text-steel-500 hover:text-brand-600 text-xs">
              Início
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function traduzir(m: string) {
  const lower = m.toLowerCase();
  if (lower.includes('not found') || lower.includes('user'))
    return 'Email não encontrado. Verifique se digitou corretamente.';
  if (lower.includes('rate') || lower.includes('limit'))
    return 'Muitas tentativas seguidas. Aguarde alguns minutos e tente novamente.';
  return m;
}
