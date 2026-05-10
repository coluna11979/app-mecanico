import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Logo } from '@/components/Logo';

/**
 * Página de redefinição usando sistema próprio (token via URL).
 * O fluxo:
 * 1. Lê ?token=xxx da URL
 * 2. Valida o token chamando confirm-password-reset (action='verify')
 * 3. Se válido, mostra form de nova senha
 * 4. Submit chama confirm-password-reset (action='reset', new_password)
 * 5. Sucesso → loga automaticamente com signInWithPassword usando o email
 *    retornado e a nova senha → redireciona pro destino correto
 */
export default function ResetPassword() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';

  const [tokenStatus, setTokenStatus] = useState<'checking' | 'valid' | 'invalid'>('checking');
  const [tokenError, setTokenError]   = useState<string | null>(null);

  const [password, setPassword]     = useState('');
  const [confirm, setConfirm]       = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr]               = useState<string | null>(null);
  const [success, setSuccess]       = useState(false);

  // Valida token ao montar
  useEffect(() => {
    if (!token) {
      setTokenStatus('invalid');
      setTokenError('Link inválido — token ausente.');
      return;
    }
    (async () => {
      const { data, error } = await supabase.functions.invoke('confirm-password-reset', {
        body: { token, action: 'verify' },
      });
      if (error || data?.error) {
        setTokenStatus('invalid');
        setTokenError(data?.message ?? 'Link inválido ou expirado');
      } else {
        setTokenStatus('valid');
      }
    })();
  }, [token]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (password.length < 6) {
      setErr('A senha precisa ter pelo menos 6 caracteres.');
      return;
    }
    if (password !== confirm) {
      setErr('As senhas não coincidem.');
      return;
    }

    setSubmitting(true);
    setErr(null);

    const { data, error } = await supabase.functions.invoke('confirm-password-reset', {
      body: { token, action: 'reset', new_password: password },
    });

    if (error || data?.error) {
      setErr(data?.message ?? 'Erro ao redefinir senha. Tente novamente.');
      setSubmitting(false);
      return;
    }

    setSuccess(true);

    // Tenta logar automaticamente com nova senha
    const userEmail = data?.email;
    if (userEmail) {
      try {
        await supabase.auth.signInWithPassword({ email: userEmail, password });
      } catch { /* ignora */ }
    }

    // Redireciona após 1.5s
    setTimeout(async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { nav('/login'); return; }
      const { data: p } = await supabase.from('profiles')
        .select('role, status').eq('id', user.id).maybeSingle();
      if (!p) { nav('/login'); return; }
      if (p.status !== 'approved' && p.role !== 'admin') {
        nav('/aguardando-aprovacao');
      } else {
        nav(p.role === 'mechanic' ? '/mecanico/dashboard'
          : p.role === 'workshop' ? '/oficina/dashboard'
          : '/admin/dashboard');
      }
    }, 1500);

    setSubmitting(false);
  }

  return (
    <div className="min-h-screen grid place-items-center bg-steel-50 p-6">
      <div className="max-w-md w-full">
        <div className="flex justify-center mb-6"><Logo /></div>

        <div className="card space-y-5">
          {tokenStatus === 'checking' && (
            <div className="text-center py-6">
              <div className="h-8 w-8 mx-auto rounded-full border-4 border-brand-500 border-t-transparent animate-spin" />
              <p className="text-sm text-steel-500 mt-3">Verificando link…</p>
            </div>
          )}

          {tokenStatus === 'invalid' && (
            <div className="text-center space-y-4 py-4">
              <div className="text-5xl">⚠️</div>
              <h2 className="text-xl font-bold text-alert-700">Link inválido ou expirado</h2>
              <p className="text-sm text-steel-600">{tokenError}</p>
              <Link to="/recuperar-senha" className="btn-primary w-full inline-block text-center">
                Solicitar novo link
              </Link>
              <Link to="/login" className="text-sm text-steel-500 hover:text-brand-600 block">
                ← Voltar pro login
              </Link>
            </div>
          )}

          {tokenStatus === 'valid' && success && (
            <div className="text-center space-y-3 py-4">
              <div className="text-5xl">✅</div>
              <h2 className="text-2xl font-bold text-signal-700">Senha alterada!</h2>
              <p className="text-sm text-steel-600">Conectando você ao app…</p>
            </div>
          )}

          {tokenStatus === 'valid' && !success && (
            <>
              <div>
                <h1 className="text-2xl font-bold tracking-tight">Nova senha</h1>
                <p className="text-sm text-steel-500 mt-1">
                  Crie uma senha forte e fácil de lembrar. Mínimo 6 caracteres.
                </p>
              </div>

              <form onSubmit={onSubmit} className="space-y-4">
                <div>
                  <label className="label">Nova senha</label>
                  <input
                    type="password"
                    className="input"
                    required
                    minLength={6}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoFocus
                  />
                </div>

                <div>
                  <label className="label">Confirmar nova senha</label>
                  <input
                    type="password"
                    className="input"
                    required
                    minLength={6}
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    placeholder="••••••••"
                  />
                </div>

                {err && (
                  <div className="text-sm text-alert-600 bg-alert-50 rounded-lg px-3 py-2">
                    ⚠️ {err}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitting || password.length < 6 || password !== confirm}
                  className="btn-primary w-full btn-lg disabled:opacity-50"
                >
                  {submitting ? 'Salvando…' : 'Alterar senha'}
                </button>
              </form>

              <div className="pt-3 border-t border-steel-100 text-center">
                <Link to="/login" className="text-sm text-steel-500 hover:text-brand-600">
                  ← Voltar pro login
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
