import { FormEvent, useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Logo } from '@/components/Logo';

function destino(role: string, status: string) {
  if (status !== 'approved' && role !== 'admin') return '/aguardando-aprovacao';
  if (role === 'mechanic') return '/mecanico/dashboard';
  if (role === 'workshop') return '/oficina/dashboard';
  return '/admin/dashboard';
}

export default function Login() {
  const nav = useNavigate();
  const { profile, loading: authLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Se chegar aqui já logado (sessão ativa), redireciona
  useEffect(() => {
    if (authLoading || submitting || !profile) return;
    nav(destino(profile.role, profile.status), { replace: true });
  }, [profile, authLoading, submitting, nav]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true); setErr(null);

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.user) {
      setSubmitting(false);
      setErr(traduzir(error?.message ?? 'Erro ao entrar'));
      return;
    }

    // Busca perfil direto após login (sessão já está ativa)
    const { data: p, error: pe } = await supabase
      .from('profiles').select('role, status').eq('id', data.user.id).maybeSingle();

    if (pe || !p) {
      setSubmitting(false);
      setErr('Perfil não encontrado. Contate o suporte.');
      return;
    }

    // Navega ANTES de soltar o submitting (evita o useEffect interferir)
    nav(destino(p.role, p.status), { replace: true });
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <aside className="hidden lg:flex flex-col justify-between bg-steel-900 text-white p-12 relative overflow-hidden">
        <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full bg-brand-500/30 blur-3xl" />
        <Logo />
        <div className="relative">
          <h2 className="text-4xl font-bold tracking-tight leading-tight">Bem-vindo de volta.</h2>
          <p className="mt-3 text-steel-300 max-w-sm">Entre para acessar seu painel e continuar trabalhando.</p>
        </div>
        <div className="text-xs text-steel-500">© MecânicoApp</div>
      </aside>

      <main className="flex flex-col justify-center p-6 lg:p-16 bg-white">
        <div className="lg:hidden mb-8"><Logo /></div>
        <div className="max-w-sm w-full mx-auto">
          <h1 className="text-3xl font-bold tracking-tight">Entrar</h1>
          <p className="text-steel-500 text-sm mt-1">Mecânico, oficina ou admin — tudo aqui.</p>

          <form onSubmit={onSubmit} className="mt-8 space-y-4">
            <div>
              <label className="label">E-mail</label>
              <input className="input" type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="voce@empresa.com" />
            </div>
            <div>
              <label className="label">Senha</label>
              <input className="input" type="password" required value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" />
            </div>
            {err && <div className="text-sm text-alert-600 bg-alert-500/10 px-3 py-2 rounded-lg">{err}</div>}
            <button className="btn-primary w-full btn-lg" disabled={submitting}>
              {submitting ? 'Entrando…' : 'Entrar'}
            </button>
          </form>

          <div className="mt-6 text-sm text-steel-500 flex justify-between">
            <Link to="/cadastro/mecanico" className="hover:text-brand-500">Sou mecânico</Link>
            <Link to="/cadastro/oficina" className="hover:text-brand-500">Sou oficina</Link>
          </div>
        </div>
      </main>
    </div>
  );
}

function traduzir(m: string) {
  if (m.toLowerCase().includes('invalid')) return 'E-mail ou senha inválidos.';
  if (m.toLowerCase().includes('email not confirmed')) return 'Confirme seu e-mail antes de entrar.';
  return m;
}
