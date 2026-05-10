import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Logo } from '@/components/Logo';

/**
 * Página acessada via link de recuperação enviado pelo Supabase Auth.
 * Quando o usuário clica no link do email, o Supabase cria uma sessão
 * temporária + redireciona pra cá com o token na URL.
 *
 * O Supabase JS detecta automaticamente o token e cria a sessão. Aqui
 * só precisamos dar o input pra trocar a senha via supabase.auth.updateUser().
 */
export default function ResetPassword() {
  const nav = useNavigate();
  const [password, setPassword]   = useState('');
  const [confirm, setConfirm]     = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr]             = useState<string | null>(null);
  const [success, setSuccess]     = useState(false);
  const [validSession, setValidSession] = useState<boolean | null>(null);

  // Verifica se chegamos com sessão válida (do link do email)
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setValidSession(!!session);
    });
  }, []);

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

    const { error } = await supabase.auth.updateUser({ password });
    setSubmitting(false);

    if (error) {
      setErr(error.message);
      return;
    }

    setSuccess(true);
    // Após 2s, redireciona pra rota apropriada
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
    }, 2000);
  }

  return (
    <div className="min-h-screen grid place-items-center bg-steel-50 p-6">
      <div className="max-w-md w-full">
        <div className="flex justify-center mb-6"><Logo /></div>

        <div className="card space-y-5">
          {success ? (
            <div className="text-center space-y-3 py-4">
              <div className="text-5xl">✅</div>
              <h2 className="text-2xl font-bold text-signal-700">Senha alterada!</h2>
              <p className="text-sm text-steel-600">Redirecionando você pro app…</p>
            </div>
          ) : validSession === false ? (
            <div className="text-center space-y-4 py-4">
              <div className="text-5xl">⚠️</div>
              <h2 className="text-xl font-bold text-alert-700">Link inválido ou expirado</h2>
              <p className="text-sm text-steel-600">
                O link de redefinição expirou (1 hora) ou já foi usado.
                Solicite um novo abaixo.
              </p>
              <Link to="/recuperar-senha" className="btn-primary w-full inline-block text-center">
                Solicitar novo link
              </Link>
            </div>
          ) : (
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
            </>
          )}

          {!success && (
            <div className="pt-3 border-t border-steel-100 text-center">
              <Link to="/login" className="text-sm text-steel-500 hover:text-brand-600">
                ← Voltar pro login
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
