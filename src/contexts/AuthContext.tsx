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

/** Promise.race com timeout — evita que await trave infinito */
function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>(resolve => setTimeout(() => resolve(fallback), ms)),
  ]);
}

async function fetchProfile(uid: string): Promise<Profile | null> {
  try {
    const query = supabase
      .from('profiles').select('*').eq('id', uid).maybeSingle();
    // Timeout de 6s — se a query travar, devolve null em vez de pendurar
    const result = await withTimeout(
      query as unknown as Promise<{ data: Profile | null; error: { message: string } | null }>,
      6000,
      { data: null, error: { message: 'timeout' } },
    );
    if (result.error) {
      console.warn('[auth] fetchProfile error:', result.error.message);
      return null;
    }
    return (result.data as Profile) ?? null;
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

    /* ── Kill switch: garante que loading vira false em no máximo 8s ──
       Se qualquer coisa travar (rede ruim, query pendurada, SW em estado
       estranho) o usuário não fica preso na tela "Carregando…". */
    const killSwitch = setTimeout(() => {
      if (mounted) {
        console.warn('[auth] kill switch acionado — forçando loading=false');
        setLoading(false);
      }
    }, 8000);

    // Sessão inicial — tenta getSession, se vazia tenta refreshSession
    (async () => {
      try {
        let session: Session | null = null;

        const sessionRes = await withTimeout(
          supabase.auth.getSession(),
          5000,
          { data: { session: null }, error: null } as any,
        );
        session = sessionRes.data?.session ?? null;

        // Token expirado mas refresh_token ainda válido → renova silenciosamente
        if (!session) {
          try {
            const refreshRes = await withTimeout(
              supabase.auth.refreshSession(),
              5000,
              { data: { session: null }, error: null } as any,
            );
            session = refreshRes.data?.session ?? null;
          } catch {
            session = null;
          }
        }

        if (!mounted) return;
        await handleSession(session);
      } catch (e) {
        console.warn('[auth] init error:', e);
      } finally {
        if (mounted) setLoading(false);
        clearTimeout(killSwitch);
      }
    })();

    // Mudanças subsequentes de estado de autenticação
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, s) => {
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
      clearTimeout(killSwitch);
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
