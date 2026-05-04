import { Navigate, useLocation } from 'react-router-dom';
import { ReactNode, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import type { Role } from '@/types/database';

export function ProtectedRoute({ allow, children }: { allow: Role[]; children: ReactNode }) {
  const { user, profile, loading, refreshProfile } = useAuth();
  const loc = useLocation();
  const [waited, setWaited] = useState(false);

  // Se já carregou auth mas profile demora, espera 1.5s e tenta refazer
  useEffect(() => {
    if (loading || profile || !user) return;
    const t = setTimeout(async () => {
      await refreshProfile();
      setWaited(true);
    }, 1500);
    return () => clearTimeout(t);
  }, [loading, profile, user, refreshProfile]);

  if (loading) return <FullScreenLoader />;
  if (!user) return <Navigate to="/login" state={{ from: loc }} replace />;

  if (!profile) {
    // Se já esperou e ainda não tem profile, manda pro login (sessão corrompida)
    if (waited) return <Navigate to="/login" replace />;
    return <FullScreenLoader />;
  }

  if (profile.status !== 'approved' && profile.role !== 'admin') {
    return <Navigate to="/aguardando-aprovacao" replace />;
  }

  if (!allow.includes(profile.role)) {
    // Redireciona para a área correta do usuário em vez de jogar no /
    const home = profile.role === 'admin' ? '/admin/dashboard'
      : profile.role === 'mechanic' ? '/mecanico/dashboard'
      : '/oficina/dashboard';
    return <Navigate to={home} replace />;
  }

  return <>{children}</>;
}

function FullScreenLoader() {
  return (
    <div className="min-h-screen grid place-items-center bg-steel-50 dark:bg-steel-900">
      <div className="flex items-center gap-3 text-steel-500">
        <div className="h-3 w-3 rounded-full bg-brand-500 animate-pulse-soft" />
        <span className="font-medium">Carregando…</span>
      </div>
    </div>
  );
}
