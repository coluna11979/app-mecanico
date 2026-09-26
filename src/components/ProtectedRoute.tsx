import { Navigate, useLocation } from 'react-router-dom';
import { ReactNode, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import type { Role } from '@/types/database';

export function ProtectedRoute({ allow, children }: { allow: Role[]; children: ReactNode }) {
  const { user, profile, loading, refreshProfile, signOut } = useAuth();
  const loc = useLocation();
  const [attempts, setAttempts] = useState(0);
  const [graceExpired, setGraceExpired] = useState(false);
  const wasAuthed = useRef(false);

  // Tem sessão mas o perfil não carregou (rede oscilando): tenta de novo sozinho.
  // NUNCA manda pro login enquanto a sessão existir — isso era o "deslogou sozinho".
  useEffect(() => {
    if (loading || profile || !user) { setAttempts(0); return; }
    const t = setTimeout(async () => {
      await refreshProfile();
      setAttempts(a => a + 1);
    }, attempts === 0 ? 1500 : 4000);
    return () => clearTimeout(t);
  }, [loading, profile, user, refreshProfile, attempts]);

  // Recarrega o perfil quando a internet volta
  useEffect(() => {
    if (!user || profile) return;
    const onOnline = () => refreshProfile();
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [user, profile, refreshProfile]);

  // Se o usuário JÁ esteve autenticado e ficou sem user de repente, dá uma janela
  // de 3s pra ver se a sessão volta (recuperação de drop espúrio do SDK Supabase).
  useEffect(() => {
    if (user) {
      wasAuthed.current = true;
      setGraceExpired(false);
      return;
    }
    // user é null
    if (!wasAuthed.current || loading) return;
    const t = setTimeout(() => setGraceExpired(true), 3000);
    return () => clearTimeout(t);
  }, [user, loading]);

  if (loading) return <FullScreenLoader />;

  // Sem user: se já estivemos autenticados, espera a janela de graça antes de mandar pro login
  if (!user) {
    if (wasAuthed.current && !graceExpired) return <FullScreenLoader />;
    return <Navigate to="/login" state={{ from: loc }} replace />;
  }

  if (!profile) {
    // Sessão válida, perfil ainda não veio: segue tentando e oferece saída manual
    if (attempts >= 2) {
      return (
        <FullScreenLoader
          text="Reconectando…"
          detail="Sua conexão oscilou. Estamos tentando de novo automaticamente."
          actions={
            <div className="flex gap-2 justify-center mt-4">
              <button onClick={() => window.location.reload()} className="btn-primary text-sm">Recarregar</button>
              <button onClick={() => { signOut(); }} className="btn-ghost text-sm">Sair</button>
            </div>
          }
        />
      );
    }
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

function FullScreenLoader({ text = 'Carregando…', detail, actions }: {
  text?: string; detail?: string; actions?: ReactNode;
}) {
  return (
    <div className="min-h-screen grid place-items-center bg-steel-50 dark:bg-steel-900 p-6">
      <div className="text-center">
        <div className="flex items-center justify-center gap-3 text-steel-500">
          <div className="h-3 w-3 rounded-full bg-brand-500 animate-pulse-soft" />
          <span className="font-medium">{text}</span>
        </div>
        {detail && <p className="text-sm text-steel-400 mt-2 max-w-xs">{detail}</p>}
        {actions}
      </div>
    </div>
  );
}
