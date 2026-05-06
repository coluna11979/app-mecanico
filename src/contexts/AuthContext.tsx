import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/types/database';

interface AuthCtx {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>({
  user: null, session: null, profile: null, loading: true,
  signOut: async () => {}, refreshProfile: async () => {},
});

async function fetchProfile(uid: string): Promise<Profile | null> {
  try {
    const { data, error } = await supabase
      .from('profiles').select('*').eq('id', uid).maybeSingle();
    if (error) {
      console.warn('[auth] fetchProfile error:', error.message);
      return null;
    }
    return (data as Profile) ?? null;
  } catch (e) {
    console.warn('[auth] fetchProfile exception:', e);
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const handleSession = useCallback(async (s: Session | null) => {
    setSession(s);
    if (s?.user) {
      const p = await fetchProfile(s.user.id);
      setProfile(p);
    } else {
      setProfile(null);
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    // Sessão inicial — tenta getSession, se vazia tenta refreshSession
    (async () => {
      try {
        let session: import('@supabase/supabase-js').Session | null = null;

        const { data: sd } = await supabase.auth.getSession();
        session = sd.session;

        // Token expirado mas refresh_token ainda válido → renova silenciosamente
        if (!session) {
          const { data: rd } = await supabase.auth.refreshSession();
          session = rd.session;
        }

        if (!mounted) return;
        await handleSession(session);
      } catch (e) {
        console.warn('[auth] getSession error:', e);
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    // Mudanças subsequentes de estado de autenticação
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, s) => {
        // INITIAL_SESSION já tratado acima manualmente
        if (event === 'INITIAL_SESSION') return;
        if (!mounted) return;

        // TOKEN_REFRESHED: só atualiza a sessão sem buscar perfil de novo
        if (event === 'TOKEN_REFRESHED' && s) {
          setSession(s);
          return;
        }

        await handleSession(s);
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [handleSession]);

  // Realtime para mudanças no perfil (admin aprova/rejeita)
  useEffect(() => {
    const uid = session?.user?.id;
    if (!uid) return;

    const channel = supabase
      .channel(`profile-watch-${uid}-${Date.now()}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'profiles',
        filter: `id=eq.${uid}`,
      }, (payload) => {
        setProfile(payload.new as Profile);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [session?.user?.id]);

  return (
    <Ctx.Provider value={{
      user: session?.user ?? null,
      session,
      profile,
      loading,
      signOut: async () => {
        setProfile(null);
        setSession(null);
        await supabase.auth.signOut();
      },
      refreshProfile: async () => {
        if (session?.user) setProfile(await fetchProfile(session.user.id));
      },
    }}>
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
