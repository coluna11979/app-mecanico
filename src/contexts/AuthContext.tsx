import { createContext, useContext, useEffect, useState, ReactNode, useCallback, useRef } from 'react';
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
const LS_LAST_TOUCH = 'mec-app-last-touch';
const TOUCH_THROTTLE_MS = 5 * 60 * 1000; // 5 min

/** Registra o acesso do usuário (último acesso + contador) de forma assíncrona.
 *  Faz throttle via localStorage para não bater no banco a cada reload. */
function touchLastSeen() {
  try {
    const last = Number(localStorage.getItem(LS_LAST_TOUCH) ?? 0);
    if (Date.now() - last < TOUCH_THROTTLE_MS) return;
    localStorage.setItem(LS_LAST_TOUCH, String(Date.now()));
  } catch { /* localStorage indisponível — segue sem throttle */ }
  // fire-and-forget: não bloqueia o login
  supabase.rpc('touch_last_seen').then(({ error }) => {
    if (error) console.warn('[auth] touch_last_seen error:', error.message);
  });
}

/** Promise.race com timeout — evita que await trave infinito */
function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>(resolve => setTimeout(() => resolve(fallback), ms)),
  ]);
}

/** Resultado de uma busca: `ok: false` = falhou (rede/timeout) — NÃO significa "não existe".
 *  Falha transitória nunca deve apagar dados já carregados (isso deslogava o usuário). */
type Fetched<T> = { ok: true; data: T } | { ok: false };

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** Tenta de novo em falha transitória (rede oscilando, aba acabando de acordar). */
async function withRetry<T>(fn: () => Promise<Fetched<T>>, tries = 3): Promise<Fetched<T>> {
  for (let i = 0; i < tries; i++) {
    const r = await fn();
    if (r.ok) return r;
    if (i < tries - 1) await sleep(800 * (i + 1));
  }
  return { ok: false };
}

async function fetchProfileOnce(uid: string): Promise<Fetched<Profile | null>> {
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
      return { ok: false };
    }
    return { ok: true, data: (result.data as Profile) ?? null };
  } catch (e) {
    console.warn('[auth] fetchProfile exception:', e);
    return { ok: false };
  }
}

const fetchProfile = (uid: string) => withRetry(() => fetchProfileOnce(uid));

/** Carrega TODAS as oficinas que o usuário é membro. */
const fetchWorkshops = (uid: string) => withRetry(() => fetchWorkshopsOnce(uid));

/** Uma tentativa — 2 queries (mais confiável que JOIN aninhado) com timeouts independentes. */
async function fetchWorkshopsOnce(uid: string): Promise<Fetched<Workshop[]>> {
  try {
    // 1. Pega todos os workshop_id em que o usuário é membro
    const memQuery = supabase
      .from('workshop_members')
      .select('workshop_id')
      .eq('profile_id', uid);
    const memRes = await withTimeout(
      memQuery as unknown as Promise<{ data: { workshop_id: string }[] | null; error: { message: string } | null }>,
      6000,
      { data: null, error: { message: 'timeout' } },
    );
    if (memRes.error || !memRes.data) {
      if (memRes.error) console.warn('[auth] fetchWorkshops members error:', memRes.error.message);
      return { ok: false };
    }
    if (memRes.data.length === 0) return { ok: true, data: [] };
    const ids = memRes.data.map(m => m.workshop_id);

    // 2. Busca os dados das oficinas
    const wsQuery = supabase
      .from('workshops')
      .select('*')
      .in('id', ids);
    const wsRes = await withTimeout(
      wsQuery as unknown as Promise<{ data: Workshop[] | null; error: { message: string } | null }>,
      6000,
      { data: null, error: { message: 'timeout' } },
    );
    if (wsRes.error || !wsRes.data) {
      if (wsRes.error) console.warn('[auth] fetchWorkshops shops error:', wsRes.error.message);
      return { ok: false };
    }
    // Ordena pelo nome
    return { ok: true, data: wsRes.data.sort((a, b) => a.business_name.localeCompare(b.business_name)) };
  } catch (e) {
    console.warn('[auth] fetchWorkshops exception:', e);
    return { ok: false };
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [workshops, setWorkshops] = useState<Workshop[]>([]);
  const [currentWorkshop, setCurrentWorkshopState] = useState<Workshop | null>(null);
  const [loading, setLoading] = useState(true);

  /** Marca se o usuário pediu signout explicitamente — diferencia de SIGNED_OUT espúrio */
  const intentionalSignOut = useRef(false);
  /** Marca se já tivemos sessão válida — pra detectar drops espúrios */
  const wasSignedIn = useRef(false);

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
    const r = await fetchWorkshops(session.user.id);
    if (r.ok) applyWorkshops(r.data); // falha transitória: mantém a lista atual
  }, [session?.user, applyWorkshops]);

  /** Usuário cujos dados (perfil/oficinas) já estão carregados */
  const loadedUid  = useRef<string | null>(null);
  const profileRef = useRef<Profile | null>(null);
  useEffect(() => { profileRef.current = profile; }, [profile]);

  /** Carrega perfil + oficinas. Só SUBSTITUI dados quando a busca dá certo:
   *  uma falha de rede nunca apaga o que já está carregado (isso deslogava). */
  const loadUserData = useCallback(async (uid: string) => {
    const sameUser = loadedUid.current === uid;
    const pr = await fetchProfile(uid);
    if (pr.ok) {
      setProfile(pr.data);
      loadedUid.current = uid;
    } else if (!sameUser) {
      setProfile(null); // 1º carregamento falhou — ProtectedRoute tenta de novo
    }
    const role = pr.ok ? pr.data?.role : profileRef.current?.role;
    if (role === 'workshop') {
      const wr = await fetchWorkshops(uid);
      if (wr.ok) applyWorkshops(wr.data);
    } else if (role) {
      setWorkshops([]);
      setCurrentWorkshopState(null);
    }
    if (!sameUser && pr.ok) touchLastSeen();
  }, [applyWorkshops]);

  const handleSession = useCallback(async (s: Session | null) => {
    /** Recovery: se a sessão sumiu sem o usuário pedir signout,
     *  tenta recuperar antes de limpar tudo (evita logout espúrio). */
    if (!s && wasSignedIn.current && !intentionalSignOut.current) {
      console.warn('[auth] sessão sumiu sem signout — tentando recuperar');
      try {
        const { data } = await supabase.auth.getSession();
        if (data.session) s = data.session;
      } catch { /* ignora */ }
      if (!s) {
        try {
          const { data } = await supabase.auth.refreshSession();
          if (data.session) s = data.session;
        } catch { /* ignora */ }
      }
      if (s) console.log('[auth] sessão recuperada com sucesso');
      else   console.warn('[auth] não foi possível recuperar — fazendo logout');
    }

    setSession(s);
    if (s?.user) {
      wasSignedIn.current = true;
      await loadUserData(s.user.id);
    } else {
      wasSignedIn.current = false;
      intentionalSignOut.current = false;
      loadedUid.current = null;
      setProfile(null);
      setWorkshops([]);
      setCurrentWorkshopState(null);
    }
  }, [loadUserData]);

  useEffect(() => {
    let mounted = true;

    /* Kill switch: garante loading=false em no máximo 15s */
    const killSwitch = setTimeout(() => {
      if (mounted) {
        console.warn('[auth] kill switch acionado — forçando loading=false');
        setLoading(false);
      }
    }, 15000);

    (async () => {
      try {
        let session: Session | null = null;
        // Timeout ≠ "sem sessão": se o getSession demorar (trava entre abas), tenta de novo
        // antes de concluir que o usuário não está logado.
        const TIMED_OUT = { data: { session: null }, error: null, timedOut: true } as any;
        let sessionRes = await withTimeout(supabase.auth.getSession(), 5000, TIMED_OUT);
        if (sessionRes?.timedOut) {
          console.warn('[auth] getSession demorou — tentando de novo');
          sessionRes = await withTimeout(supabase.auth.getSession(), 7000, TIMED_OUT);
        }
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
      (event, s) => {
        if (event === 'INITIAL_SESSION') return;
        if (!mounted) return;
        // TOKEN_REFRESHED / USER_UPDATED: só atualiza a sessão
        if ((event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') && s) { setSession(s); return; }
        // SIGNED_IN do MESMO usuário: o Supabase dispara isso toda vez que a aba volta a ficar
        // visível. Não é login novo — só atualiza a sessão (antes, isso deslogava o usuário).
        if (event === 'SIGNED_IN' && s?.user && s.user.id === loadedUid.current) { setSession(s); return; }

        // IMPORTANTE: este callback roda com uma trava interna do Supabase. Consultar o
        // banco aqui dentro (await supabase.from…) trava até o timeout. Por isso o trabalho
        // é adiado com setTimeout — padrão recomendado pela documentação do supabase-js.
        setTimeout(() => {
          if (!mounted) return;
          if (event === 'SIGNED_OUT') {
            intentionalSignOut.current = true;
            handleSession(null);
            return;
          }
          // SIGNED_IN (login novo), PASSWORD_RECOVERY etc.
          handleSession(s);
        }, 0);
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
        intentionalSignOut.current = true;
        wasSignedIn.current = false;
        setProfile(null);
        setSession(null);
        setWorkshops([]);
        setCurrentWorkshopState(null);
        loadedUid.current = null;
        try { localStorage.removeItem(LS_CURRENT_WORKSHOP); } catch {}
        try { localStorage.removeItem(LS_LAST_TOUCH); } catch {}
        // Só este aparelho: o padrão (global) derruba a sessão do celular quando alguém sai no PC
        await supabase.auth.signOut({ scope: 'local' });
      },
      refreshProfile: async () => {
        if (session?.user) await loadUserData(session.user.id);
      },
    }}>
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
