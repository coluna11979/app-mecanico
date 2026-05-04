import { FormEvent, useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Logo } from '@/components/Logo';

type Role = 'mechanic' | 'workshop' | 'admin';

interface WelcomeData {
  name: string;
  role: Role;
  stat: string;
  destination: string;
}

function destino(role: string, status: string) {
  if (status !== 'approved' && role !== 'admin') return '/aguardando-aprovacao';
  if (role === 'mechanic') return '/mecanico/dashboard';
  if (role === 'workshop') return '/oficina/dashboard';
  return '/admin/dashboard';
}

async function buildWelcome(uid: string, name: string, role: Role, status: string): Promise<WelcomeData> {
  const destination = destino(role, status);
  let stat = '';

  try {
    if (role === 'mechanic') {
      const { count } = await supabase
        .from('jobs').select('id', { count: 'exact', head: true })
        .eq('status', 'open');
      stat = count
        ? `${count} job${count !== 1 ? 's' : ''} disponíve${count !== 1 ? 'is' : 'l'} agora`
        : 'Nenhum job aberto no momento';
    } else if (role === 'workshop') {
      const { data: w } = await supabase
        .from('workshops').select('id').eq('profile_id', uid).maybeSingle();
      if (w?.id) {
        const { count } = await supabase
          .from('jobs').select('id', { count: 'exact', head: true })
          .eq('workshop_id', w.id)
          .in('status', ['assigned', 'in_progress']);
        stat = count
          ? `${count} serviço${count !== 1 ? 's' : ''} ativo${count !== 1 ? 's' : ''} hoje`
          : 'Oficina pronta para novos serviços';
      }
    } else {
      const { count } = await supabase
        .from('profiles').select('id', { count: 'exact', head: true })
        .eq('status', 'pending');
      stat = count
        ? `${count} aprovação${count !== 1 ? 'ões' : ''} pendente${count !== 1 ? 's' : ''}`
        : 'Sem pendências no momento';
    }
  } catch {
    // silently ignore stat fetch errors
  }

  return { name, role, stat, destination };
}

const ROLE_LABEL: Record<Role, string> = {
  mechanic: 'Mecânico',
  workshop: 'Oficina',
  admin: 'Administrador',
};

const ROLE_PHRASE: Record<Role, string> = {
  mechanic: 'Pronto para mais um dia de trabalho?',
  workshop: 'Sua oficina está esperando por você.',
  admin: 'O painel completo está à sua disposição.',
};

const ROLE_ICON: Record<Role, string> = {
  mechanic: '🔧',
  workshop: '🏪',
  admin: '⚙️',
};

export default function Login() {
  const nav = useNavigate();
  const { profile, loading: authLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [welcome, setWelcome] = useState<WelcomeData | null>(null);

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

    const { data: p } = await supabase
      .from('profiles').select('role, status, full_name').eq('id', data.user.id).maybeSingle();

    if (!p) {
      setSubmitting(false);
      setErr('Perfil não encontrado. Contate o suporte.');
      return;
    }

    if (p.status !== 'approved' && p.role !== 'admin') {
      nav('/aguardando-aprovacao', { replace: true });
      return;
    }

    const wd = await buildWelcome(data.user.id, p.full_name, p.role as Role, p.status);
    setWelcome(wd);
    setTimeout(() => nav(wd.destination, { replace: true }), 2800);
  }

  if (welcome) {
    return <WelcomeScreen data={welcome} />;
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <aside className="hidden lg:flex flex-col justify-between bg-steel-900 text-white p-12 relative overflow-hidden">
        <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full bg-brand-500/30 blur-3xl" />
        <div className="absolute -bottom-24 -left-24 w-72 h-72 rounded-full bg-brand-600/20 blur-3xl" />
        <Logo />
        <div className="relative space-y-4">
          <div className="inline-flex items-center gap-2 bg-white/10 rounded-full px-4 py-1.5 text-xs font-semibold text-brand-300 tracking-widest uppercase">
            Plataforma de mecânicos
          </div>
          <h2 className="text-4xl font-bold tracking-tight leading-tight">
            Seu painel.<br />Suas regras.
          </h2>
          <p className="text-steel-300 max-w-sm text-sm leading-relaxed">
            Conectamos oficinas e mecânicos em tempo real. Gerencie tudo em um só lugar.
          </p>
        </div>
        <div className="text-xs text-steel-500">© MecânicoApp {new Date().getFullYear()}</div>
      </aside>

      <main className="flex flex-col justify-center p-6 lg:p-16 bg-white">
        <div className="lg:hidden mb-8"><Logo /></div>
        <div className="max-w-sm w-full mx-auto">
          <h1 className="text-3xl font-bold tracking-tight">Entrar</h1>
          <p className="text-steel-500 text-sm mt-1">Mecânico, oficina ou admin — tudo aqui.</p>

          <form onSubmit={onSubmit} className="mt-8 space-y-4">
            <div>
              <label className="label">E-mail</label>
              <input className="input" type="email" required value={email}
                onChange={e => setEmail(e.target.value)} placeholder="voce@empresa.com" />
            </div>
            <div>
              <label className="label">Senha</label>
              <input className="input" type="password" required value={password}
                onChange={e => setPassword(e.target.value)} placeholder="••••••••" />
            </div>
            {err && (
              <div className="text-sm text-alert-600 bg-alert-500/10 px-3 py-2 rounded-lg">{err}</div>
            )}
            <button className="btn-primary w-full btn-lg" disabled={submitting}>
              {submitting ? 'Verificando…' : 'Entrar'}
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

function WelcomeScreen({ data }: { data: WelcomeData }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 60);
    return () => clearTimeout(t);
  }, []);

  const firstName = data.name.split(' ')[0];

  return (
    <div className="min-h-screen bg-steel-900 flex flex-col items-center justify-center relative overflow-hidden">
      {/* Background glow effects */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-brand-500/20 blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-80 h-80 rounded-full bg-brand-600/10 blur-3xl pointer-events-none" />

      {/* Animated grid lines */}
      <div className="absolute inset-0 opacity-5"
        style={{
          backgroundImage: 'linear-gradient(to right, #fff 1px, transparent 1px), linear-gradient(to bottom, #fff 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }} />

      <div
        className="relative z-10 text-center px-8"
        style={{
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0)' : 'translateY(20px)',
          transition: 'opacity 0.7s ease, transform 0.7s ease',
        }}
      >
        {/* Role badge */}
        <div
          className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm border border-white/20 rounded-full px-5 py-2 mb-8"
          style={{
            opacity: visible ? 1 : 0,
            transform: visible ? 'translateY(0)' : 'translateY(10px)',
            transition: 'opacity 0.5s ease 0.2s, transform 0.5s ease 0.2s',
          }}
        >
          <span className="text-lg">{ROLE_ICON[data.role]}</span>
          <span className="text-sm font-semibold text-steel-300 tracking-wide">{ROLE_LABEL[data.role]}</span>
        </div>

        {/* Welcome message */}
        <h1
          className="text-5xl lg:text-6xl font-bold text-white tracking-tight leading-tight"
          style={{
            opacity: visible ? 1 : 0,
            transform: visible ? 'translateY(0)' : 'translateY(15px)',
            transition: 'opacity 0.6s ease 0.35s, transform 0.6s ease 0.35s',
          }}
        >
          Bem-vindo de volta,
          <br />
          <span className="text-brand-400">{firstName}!</span>
        </h1>

        {/* Role-specific phrase */}
        <p
          className="mt-4 text-steel-300 text-lg"
          style={{
            opacity: visible ? 1 : 0,
            transform: visible ? 'translateY(0)' : 'translateY(10px)',
            transition: 'opacity 0.5s ease 0.5s, transform 0.5s ease 0.5s',
          }}
        >
          {ROLE_PHRASE[data.role]}
        </p>

        {/* Stat pill */}
        {data.stat && (
          <div
            className="mt-8 inline-flex items-center gap-2 bg-brand-500/20 border border-brand-500/40 rounded-2xl px-6 py-3"
            style={{
              opacity: visible ? 1 : 0,
              transform: visible ? 'translateY(0)' : 'translateY(10px)',
              transition: 'opacity 0.5s ease 0.65s, transform 0.5s ease 0.65s',
            }}
          >
            <div className="w-2 h-2 rounded-full bg-brand-400 animate-pulse" />
            <span className="text-brand-300 text-sm font-semibold">{data.stat}</span>
          </div>
        )}

        {/* Loading bar */}
        <div
          className="mt-12 w-48 mx-auto h-0.5 bg-white/10 rounded-full overflow-hidden"
          style={{
            opacity: visible ? 1 : 0,
            transition: 'opacity 0.4s ease 0.8s',
          }}
        >
          <div
            className="h-full bg-brand-400 rounded-full"
            style={{
              width: visible ? '100%' : '0%',
              transition: 'width 2.4s ease 0.9s',
            }}
          />
        </div>
        <p
          className="mt-3 text-steel-500 text-xs"
          style={{
            opacity: visible ? 1 : 0,
            transition: 'opacity 0.4s ease 1s',
          }}
        >
          Carregando painel…
        </p>
      </div>
    </div>
  );
}

function traduzir(m: string) {
  if (m.toLowerCase().includes('invalid')) return 'E-mail ou senha inválidos.';
  if (m.toLowerCase().includes('email not confirmed')) return 'Confirme seu e-mail antes de entrar.';
  return m;
}
