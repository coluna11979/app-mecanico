import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Logo } from '@/components/Logo';
import { deriveTeamEmail } from '@/lib/teamLogin';

/**
 * Acesso equipe: o colaborador entra com o LOGIN + SENHA que o gestor criou em
 * Configurações → Acessos. Cai direto no painel restrito da função dele (o
 * WorkshopLayout detecta que é um operador e trava a sessão).
 */
export default function TeamLogin() {
  const nav = useNavigate();
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!login.trim() || !password) return;
    setSubmitting(true); setErr(null);

    const email = deriveTeamEmail(login);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.user) {
      setSubmitting(false);
      setErr('Login ou senha incorretos. Confira com o gestor.');
      return;
    }
    // O painel (WorkshopLayout) carrega a oficina e trava a sessão na função certa.
    nav('/oficina/os', { replace: true });
  }

  return (
    <div className="min-h-screen bg-steel-900 text-white flex flex-col">
      <div className="flex-1 flex flex-col justify-center px-6 pt-[calc(1.5rem+env(safe-area-inset-top))]">
        <div className="w-full max-w-sm mx-auto">
          <div className="flex justify-center mb-8"><Logo light /></div>

          <div className="inline-flex items-center gap-2 bg-brand-500/15 border border-brand-500/40 rounded-full px-4 py-1.5 text-xs font-bold text-brand-300 tracking-widest uppercase mx-auto block w-fit">
            👥 Acesso equipe
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-center mt-4">Entrar com seu login</h1>
          <p className="text-steel-400 text-sm mt-1 text-center">
            Use o login e a senha que o gestor da oficina criou pra você.
          </p>

          <form onSubmit={onSubmit} className="mt-8 space-y-4">
            <div>
              <label className="block text-sm font-medium text-steel-300 mb-1.5">Login</label>
              <input
                className="w-full rounded-xl bg-white/5 border border-white/15 px-4 py-3 text-white placeholder:text-steel-500 focus:border-brand-400 focus:ring-2 focus:ring-brand-500/30 outline-none transition"
                type="text" required autoCapitalize="none" autoCorrect="off" autoComplete="username"
                value={login} onChange={e => setLogin(e.target.value)} placeholder="seu.login" />
            </div>
            <div>
              <label className="block text-sm font-medium text-steel-300 mb-1.5">Senha</label>
              <input
                className="w-full rounded-xl bg-white/5 border border-white/15 px-4 py-3 text-white placeholder:text-steel-500 focus:border-brand-400 focus:ring-2 focus:ring-brand-500/30 outline-none transition"
                type="password" required autoComplete="current-password"
                value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" />
            </div>
            {err && <div className="text-sm text-alert-300 bg-alert-500/10 px-3 py-2 rounded-lg">{err}</div>}
            <button
              className="w-full bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white font-bold rounded-xl py-3.5 text-base transition"
              disabled={submitting}>
              {submitting ? 'Entrando…' : 'Entrar'}
            </button>
          </form>

          <div className="mt-8 text-center">
            <Link to="/login" className="text-sm text-steel-400 hover:text-white transition">
              ← É dono da oficina ou mecânico da plataforma? Entrar aqui
            </Link>
          </div>
        </div>
      </div>
      <div className="text-center text-[11px] text-steel-600 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        © MecânicoApp {new Date().getFullYear()}
      </div>
    </div>
  );
}
