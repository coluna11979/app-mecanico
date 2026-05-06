import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { Profile, Workshop } from '@/types/database';

interface AuthCtx {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  /** Lista de TODAS as oficinas que o usuário é membro (1 ou várias) */
  workshops: Workshop[];
  /** Oficina selecionada no momento (a "ativa" no painel) */
  currentWorkshop: Workshop | null;
  setCurrentWorkshop: (w: Workshop) => void;
  refreshWorkshops: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>({
  user: null, session: null, profile: null, loading: true,
  workshops: [], currentWorkshop: null,
  setCurrentWorkshop: () => {}, refreshWorkshops: async () => {},
  signOut: async () => {}, refreshProfile: async () => {},
});

const LS_CURRENT_WORKSHOP = 'mec-app-current-workshop';

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

/** Carrega TODAS as oficinas que o usuário é membro */
async function fetchWorkshops(uid: string): Promise<Workshop[]> {
  try {
    const query = supabase
      .from('workshop_members')
      .select('workshop:workshops(*)')
      .eq('profile_id', uid);
    const result = await withTimeout(
      query as unknown as Promise<{ data: { workshop: Workshop }[] | null; error: { message: string } | null }>,
      6000,
      { data: null, error: { message: 'timeout' } },
    );
    if (result.error || !result.data) return [];
    // Ordena pelo nome para consistência visual
    return result.data
      .map(r => r.workshop)
      .filter(Boolean)
      .sort((a, b) => a.business_name.localeCompare(b.business_name));
  } catch (e) {
    console.warn('[auth] fetchWorkshops exception:', e);
    return [];
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [workshops, setWorkshops] = useState<Workshop[]>([]);
  const [currentWorkshop, setCurrentWorkshopState] = useState<Workshop | null>(null);
  const [loading, setLoading] = useState(true);

  /** Persiste a oficina atual em localStorage para sobreviver entre sessões */
  const setCurrentWorkshop = useCallback((w: Workshop) => {
    setCurrentWorkshopState(w);
    try { localStorage.setItem(LS_CURRENT_WORKSHOP, w.id); } catch {}
  }, []);

  /** Recalcula currentWorkshop a partir da lista (mantendo seleção do localStorage se possível) */
  const applyWorkshops = useCallback((list: Workshop[]) => {
    setWorkshops(list);
    if (list.length === 0) {
      setCurrentWorkshopState(null);
      return;
    }
    let savedId: string | null = null;
    try { savedId = localStorage.getItem(LS_CURRENT_WORKSHOP); } catch {}
    const chosen = list.find(w => w.id === savedId) ?? list[0];
    setCurrentWorkshopState(chosen);
    try { localStorage.setItem(LS_CURRENT_WORKSHOP, chosen.id); } catch {}
  }, []);

  const refreshWorkshops = useCallback(async () => {
    if (!session?.user) return;
    const list = await fetchWorkshops(session.user.id);
    applyWorkshops(list);
  }, [session?.user, applyWorkshops]);

  const handleSession = useCallback(async (s: Session | null) => {
    setSession(s);
    if (s?.user) {
      const p = await fetchProfile(s.user.id);
      setProfile(p);
      if (p?.role === 'workshop') {
        const list = await fetchWorkshops(s.user.id);
        applyWorkshops(list);
      } else {
        setWorkshops([]);
        setCurrentWorkshopState(null);
      }
    } else {
      setProfile(null);
      setWorkshops([]);
      setCurrentWorkshopState(null);
    }
  }, [applyWorkshops]);

  useEffect(() => {
    let mounted = true;

    /* Kill switch: garante loading=false em no máximo 8s */
    const killSwitch = setTimeout(() => {
      if (mounted) {
        console.warn('[auth] kill switch acionado — forçando loading=false');
        setLoading(false);
      }
    }, 8000);

    (async () => {
      try {
        let session: Session | null = null;
        const sessionRes = await withTimeout(
          supabase.auth.getSession(),
          5000,
          { data: { session: null }, error: null } as any,
        );
        session = sessionRes.data?.session ?? null;

        if (!session) {
          try {
            const refreshRes = await withTimeout(
              supabase.auth.refreshSession(),
              5000,
              { data: { session: null }, error: null } as any,
            );
            session = refreshRes.data?.session ?? null;
          } catch { session = null; }
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

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, s) => {
        if (event === 'INITIAL_SESSION') return;
        if (!mounted) return;
        if (event === 'TOKEN_REFRESHED' && s) { setSession(s); return; }
        await handleSession(s);
      }
    );

    return () => {
      mounted = false;
      clearTimeout(killSwitch);
      subscription.unsubscribe();
    };
  }, [handleSession]);

  /* Realtime para mudanças no perfil (admin aprova/rejeita) */
  useEffect(() => {
    const uid = session?.user?.id;
    if (!uid) return;
    const channel = supabase
      .channel(`profile-watch-${uid}-${Date.now()}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'profiles',
        filter: `id=eq.${uid}`,
      }, (payload) => setProfile(payload.new as Profile))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [session?.user?.id]);

  return (
    <Ctx.Provider value={{
      user: session?.user ?? null,
      session,
      profile,
      loading,
      workshops,
      currentWorkshop,
      setCurrentWorkshop,
      refreshWorkshops,
      signOut: async () => {
        setProfile(null);
        setSession(null);
        setWorkshops([]);
        setCurrentWorkshopState(null);
        try { localStorage.removeItem(LS_CURRENT_WORKSHOP); } catch {}
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
