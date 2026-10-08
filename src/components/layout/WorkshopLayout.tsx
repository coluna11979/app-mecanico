import { ReactNode, useEffect, useRef, useState } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Logo } from '@/components/Logo';
import { supabase } from '@/lib/supabase';
import { attachAutoUnlock, playJobAlert } from '@/lib/alertSound';
import { useUnreadNotifications } from '@/hooks/useUnreadNotifications';
import { toast } from '@/components/ui/Toast';
import type { Job, Workshop } from '@/types/database';
import { formatBRL } from '@/lib/payment';
import { ROLES, sessionAllows, useOperator, type OperatorRole } from '@/lib/operators';
import OperatorLock from '@/components/operator/OperatorLock';
import { moduleAllows, useWorkshopModules } from '@/lib/modules';

type ArrivalAlert = { jobId: string; title: string };
type FinishedAlert = { jobId: string; title: string; price: number };
type EnRouteAlert = { jobId: string; title: string };

interface NavItem  { to: string; icon: string; label: string }
/** Submenu: agrupa telas irmãs sob um item que só abre/fecha (não tem rota própria) */
interface NavSub   { icon: string; label: string; children: NavItem[] }
type NavEntry = NavItem | NavSub;
interface NavGroup { key: string; title: string; items: NavEntry[] }

const isSub = (e: NavEntry): e is NavSub => 'children' in e;
const leaves = (entries: NavEntry[]): NavItem[] => entries.flatMap(e => (isSub(e) ? e.children : [e]));
const onRoute = (path: string, to: string) => path === to || path.startsWith(`${to}/`);

/** Itens soltos no topo do menu (telas de entrada do gestor) */
const TOP_ITEMS: NavItem[] = [
  { to: '/oficina/inicio', icon: '🏠', label: 'Início'           },
  { to: '/oficina/resultado', icon: '📈', label: 'Resultado'      },
  { to: '/oficina/painel', icon: '📊', label: 'Painel de vendas' },
];

/** Menu por fluxo de trabalho. Só muda a organização: as rotas (e as permissões do modo balcão) são as mesmas. */
const SECTIONS: NavGroup[] = [
  { key: 'atendimento', title: 'Atendimento', items: [
    { to: '/oficina/os',         icon: '📋', label: 'Ordens de serviço'    },
    { to: '/oficina/agenda',     icon: '📅', label: 'Agenda'               },
    { to: '/oficina/clientes',   icon: '👥', label: 'Clientes'             },
    { to: '/oficina/comercial',  icon: '🤝', label: 'Comercial'            },
  ] },
  // Check-up é módulo próprio (um dos diferenciais do sistema)
  { key: 'checkup', title: 'Check-up', items: [
    { to: '/oficina/checkup',            icon: '🩺', label: 'Painel do check-up' },
    { to: '/oficina/checkup/inspecoes',  icon: '🔍', label: 'Inspeções'          },
    { to: '/oficina/checkup/historico',  icon: '🗂️', label: 'Histórico'          },
    { to: '/oficina/checkup/modelos',    icon: '🧩', label: 'Modelos'            },
  ] },
  { key: 'financeiro', title: 'Financeiro', items: [
    { to: '/oficina/caixa',      icon: '💰', label: 'Caixa'                },
    { to: '/oficina/financeiro', icon: '💵', label: 'Visão financeira'     },
    { to: '/oficina/contas-a-pagar', icon: '📤', label: 'Contas a pagar'   },
  ] },
  { key: 'estoque', title: 'Estoque e compras', items: [
    { to: '/oficina/pecas/painel', icon: '📦', label: 'Painel do estoque' },
    { to: '/oficina/pecas',      icon: '🔩', label: 'Peças'                },
    { to: '/oficina/compras',    icon: '🧾', label: 'Compras'              },
    { to: '/oficina/fornecedores', icon: '🚚', label: 'Fornecedores'       },
  ] },
  { key: 'equipe', title: 'Equipe', items: [
    { to: '/oficina/equipe',     icon: '👷', label: 'Painel da equipe'     },
    { to: '/oficina/desempenho', icon: '🏆', label: 'Desempenho'           },
    { to: '/oficina/comissoes',  icon: '🏅', label: 'Comissões'            },
    { to: '/oficina/folha',      icon: '💼', label: 'Folha'                },
    { to: '/oficina/acessos',    icon: '🔐', label: 'Acessos e funções'    },
  ] },
  { key: 'plataforma', title: 'Plataforma', items: [
    { to: '/oficina/dashboard',  icon: '⚡', label: 'Demandas'             },
    { to: '/oficina/buscar',     icon: '🔍', label: 'Buscar mecânicos'     },
    { to: '/oficina/mensagens',  icon: '💬', label: 'Mensagens'            },
  ] },
  { key: 'config', title: 'Configurações', items: [
    { to: '/oficina/perfil',     icon: '🏪', label: 'Perfil e vitrine'     },
    { to: '/oficina/servicos',   icon: '🛠️', label: 'Tabela de serviços'   },
    { to: '/oficina/importar',   icon: '📷', label: 'Importar notas antigas' },
    { to: '/oficina/vip',        icon: '⭐', label: 'Plano VIP'            },
  ] },
];

/** Telas do Check-up que são do gestor (o mecânico vê só a fila dele em /oficina/checkup) */
const CHECKUP_MANAGER_ONLY = ['/oficina/checkup/inspecoes', '/oficina/checkup/historico', '/oficina/checkup/modelos'];

/** Grupos que começam recolhidos (até a pessoa abrir) */
const DEFAULT_COLLAPSED = ['config'];
const LS_COLLAPSED = 'oficina_menu_collapsed';

function loadCollapsed(): Set<string> {
  try {
    const raw = localStorage.getItem(LS_COLLAPSED);
    if (raw) return new Set(JSON.parse(raw) as string[]);
  } catch { /* localStorage indisponível */ }
  return new Set(DEFAULT_COLLAPSED);
}

/**
 * Barra inferior (celular) por função; o resto fica no "Mais". Sem modo balcão = gestor.
 * Gestor no celular acompanha resultado (não opera): Resultado, pendências do dia, Plataforma (emergência) e equipe.
 */
const TAB = {
  resultado: { to: '/oficina/resultado', icon: '📈', label: 'Resultado' },
  hoje:      { to: '/oficina/inicio',    icon: '🏠', label: 'Hoje'      },
  plataforma:{ to: '/oficina/dashboard', icon: '⚡', label: 'Plataforma' },
  equipe:    { to: '/oficina/desempenho', icon: '🏆', label: 'Equipe'   },
  painel:    { to: '/oficina/painel',    icon: '📊', label: 'Vendas'    },
  os:        { to: '/oficina/os',        icon: '📋', label: 'OS'        },
  caixa:     { to: '/oficina/caixa',     icon: '💰', label: 'Caixa'     },
  agenda:    { to: '/oficina/agenda',    icon: '📅', label: 'Agenda'    },
  clientes:  { to: '/oficina/clientes',  icon: '👥', label: 'Clientes'  },
  checkup:   { to: '/oficina/checkup',   icon: '🩺', label: 'Check-up'  },
  comercial: { to: '/oficina/comercial', icon: '🤝', label: 'Comercial' },
} satisfies Record<string, NavItem>;

const BOTTOM_TABS: Record<OperatorRole, NavItem[]> = {
  gestor:    [TAB.resultado, TAB.hoje, TAB.plataforma, TAB.equipe],
  caixa:     [TAB.caixa, TAB.os, TAB.agenda, TAB.clientes],
  atendente: [TAB.os, TAB.agenda, TAB.clientes, TAB.checkup],
  vendedor:  [TAB.comercial, TAB.clientes, TAB.agenda, TAB.os],
  mecanico:  [TAB.os, TAB.agenda, TAB.checkup],
};

const LS_KEY = 'oficina_msgs_last_seen';

export default function WorkshopLayout({ children }: { children: ReactNode }) {
  const { signOut, profile, user, workshops, currentWorkshop, setCurrentWorkshop } = useAuth();
  const nav      = useNavigate();
  const location = useLocation();
  const [open, setOpen]         = useState(false);
  const [unread, setUnread]     = useState(0);
  const unreadNotif = useUnreadNotifications();
  const [collapsed, setCollapsed] = useState<Set<string>>(loadCollapsed);

  function toggleGroup(key: string) {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      try { localStorage.setItem(LS_COLLAPSED, JSON.stringify([...next])); } catch { /* ignora */ }
      return next;
    });
  }

  const shopId = currentWorkshop?.id ?? null;

  const firstName = profile?.full_name?.split(' ')[0] ?? 'Oficina';
  const initials  = (profile?.full_name ?? 'O')
    .split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();

  /* ── Alerta global: chegada de mecânico ── */
  const [arrivalAlert, setArrivalAlert] = useState<ArrivalAlert | null>(null);
  const arrivedRef = useRef<Set<string>>(new Set());

  /* ── Alerta global: mecânico finalizou — precisa confirmar ── */
  const [finishedAlert, setFinishedAlert] = useState<FinishedAlert | null>(null);
  const [confirming, setConfirming] = useState(false);
  const finishedRef = useRef<Set<string>>(new Set());

  /* ── Alerta global: mecânico saiu pro agendamento (en_route_at setado) ── */
  const [enRouteAlert, setEnRouteAlert] = useState<EnRouteAlert | null>(null);
  const enRouteRef = useRef<Set<string>>(new Set());

  /* Destrava áudio na primeira interação */
  useEffect(() => { attachAutoUnlock(); }, []);

  /* Popula o set inicial com jobs já chegados (não toca som retroativo) */
  useEffect(() => {
    if (!shopId) return;
    supabase
      .from('jobs')
      .select('id, arrived_at, pix_paid_at, status')
      .eq('workshop_id', shopId)
      .in('status', ['assigned', 'in_progress'])
      .then(({ data }) => {
        (data ?? []).forEach((j: any) => {
          if (j.arrived_at) arrivedRef.current.add(j.id);
        });
      });
  }, [shopId]);

  /* Popula o set inicial com jobs já finalizados (evita toast retroativo no load) */
  useEffect(() => {
    if (!shopId) return;
    supabase
      .from('jobs')
      .select('id, status, workshop_confirmed_at')
      .eq('workshop_id', shopId)
      .eq('status', 'completed')
      .is('workshop_confirmed_at', null)
      .then(({ data }) => {
        (data ?? []).forEach((j: any) => finishedRef.current.add(j.id));
      });
  }, [shopId]);

  /* Popula set inicial de jobs já a caminho (não alerta retroativo) */
  useEffect(() => {
    if (!shopId) return;
    supabase
      .from('jobs')
      .select('id, en_route_at')
      .eq('workshop_id', shopId)
      .not('en_route_at', 'is', null)
      .then(({ data }) => {
        (data ?? []).forEach((j: any) => enRouteRef.current.add(j.id));
      });
  }, [shopId]);

  /* Realtime — alerta quando o mecânico SAI para o agendamento (en_route_at setado) */
  useEffect(() => {
    if (!shopId) return;
    const ch = supabase.channel(`layout:enroute:${shopId}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'jobs',
        filter: `workshop_id=eq.${shopId}`,
      }, (payload) => {
        const newRow = payload.new as Job;
        const oldRow = payload.old as Job | undefined;
        // Só na transição en_route_at null → setado, e ainda não chegou
        if (!newRow.en_route_at) return;
        if (oldRow?.en_route_at) return;
        if (newRow.arrived_at) return;
        if (enRouteRef.current.has(newRow.id)) return;
        // Só faz sentido alertar pra agendamento (job que tinha data marcada)
        if (!newRow.scheduled_at) { enRouteRef.current.add(newRow.id); return; }

        if (window.location.pathname === `/oficina/job/${newRow.id}/tracking`) {
          enRouteRef.current.add(newRow.id);
          return;
        }
        enRouteRef.current.add(newRow.id);
        playJobAlert();
        setEnRouteAlert({ jobId: newRow.id, title: newRow.title });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [shopId]);

  /* Realtime — alerta quando arrived_at é setado pela primeira vez */
  useEffect(() => {
    if (!shopId) return;
    const ch = supabase.channel(`layout:arrivals:${shopId}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'jobs',
        filter: `workshop_id=eq.${shopId}`,
      }, (payload) => {
        const newRow = payload.new as Job;
        const oldRow = payload.old as Job | undefined;

        // Só alerta na transição: arrived_at era null e agora foi setado, e ainda não pago
        if (!newRow.arrived_at) return;
        if (oldRow?.arrived_at) return;
        if (newRow.pix_paid_at) return;
        if (arrivedRef.current.has(newRow.id)) return;

        // Não dispara se já está na página de tracking deste job (já viu lá)
        if (window.location.pathname === `/oficina/job/${newRow.id}/tracking`) {
          arrivedRef.current.add(newRow.id);
          return;
        }

        arrivedRef.current.add(newRow.id);
        playJobAlert();
        setArrivalAlert({ jobId: newRow.id, title: newRow.title });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [shopId]);

  /* Realtime — alerta quando mecânico finaliza (status → completed, ainda não confirmado) */
  useEffect(() => {
    if (!shopId) return;
    const ch = supabase.channel(`layout:completions:${shopId}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'jobs',
        filter: `workshop_id=eq.${shopId}`,
      }, (payload) => {
        const newRow = payload.new as Job;
        const oldRow = payload.old as Job | undefined;

        // Só dispara na transição para 'completed' sem confirmação prévia
        if (newRow.status !== 'completed') return;
        if (newRow.workshop_confirmed_at) return;
        if (oldRow?.status === 'completed') return;
        if (finishedRef.current.has(newRow.id)) return;

        finishedRef.current.add(newRow.id);
        playJobAlert();
        setFinishedAlert({
          jobId: newRow.id,
          title: newRow.title,
          price: (newRow.price_per_hour ?? 0) * (newRow.max_hours ?? 1),
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [shopId]);

  async function confirmFinished() {
    if (!finishedAlert) return;
    setConfirming(true);
    const { error } = await supabase.from('jobs')
      .update({ workshop_confirmed_at: new Date().toISOString() })
      .eq('id', finishedAlert.jobId);
    setConfirming(false);
    if (error) {
      console.error('[confirmFinished] erro:', error);
      toast.error('Não foi possível confirmar: ' + error.message);
      return; // mantém o alerta aberto para tentar de novo
    }
    toast.success('Serviço confirmado — pagamento liberado ✓');
    setFinishedAlert(null);
  }

  /* ── Conta mensagens não lidas ── */
  useEffect(() => {
    if (!shopId || !user) return;

    const lastSeen = localStorage.getItem(LS_KEY) ?? new Date(0).toISOString();

    async function countUnread() {
      // Busca jobs ativos desta oficina
      const { data: jobs } = await supabase
        .from('jobs')
        .select('id')
        .eq('workshop_id', shopId!)
        .in('status', ['open', 'assigned', 'in_progress']);

      if (!jobs?.length) { setUnread(0); return; }
      const jobIds = jobs.map(j => j.id);

      // Mensagens novas de outros (mecânicos), após lastSeen
      const { count } = await supabase
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .in('job_id', jobIds)
        .neq('sender_id', user!.id)
        .gt('created_at', lastSeen);

      setUnread(count ?? 0);
    }

    countUnread();

    // Realtime: quando nova mensagem chega, incrementa badge
    const ch = supabase.channel('layout:new_msgs')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' },
        payload => {
          const msg = payload.new as { sender_id: string; job_id: string };
          if (msg.sender_id === user!.id) return; // minha própria mensagem
          // Não estamos na página de mensagens → incrementa
          if (!window.location.pathname.startsWith('/oficina/mensagens')) {
            setUnread(n => n + 1);
          }
        })
      .subscribe();

    return () => { supabase.removeChannel(ch); };
  }, [shopId, user]);

  /* ── Gaveta "Mais": fecha ao trocar de tela ou no Esc; trava a rolagem do fundo enquanto aberta ── */
  useEffect(() => { setOpen(false); }, [location.pathname]);
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey); };
  }, [open]);

  /* ── Zera badge ao entrar em /oficina/mensagens ── */
  useEffect(() => {
    if (location.pathname.startsWith('/oficina/mensagens')) {
      setUnread(0);
      localStorage.setItem(LS_KEY, new Date().toISOString());
    }
  }, [location.pathname]);

  /* ── Modo balcão: quem está operando e em qual função ── */
  const op = useOperator();
  useEffect(() => { op.bind(shopId); }, [shopId]); // eslint-disable-line react-hooks/exhaustive-deps
  const role = op.balcao ? op.session?.role ?? null : null;
  const isMechanicSession = role === 'mecanico';
  // Módulos liberados para a oficina (superadmin) valem para todos, inclusive o gestor
  const mods = useWorkshopModules();
  useEffect(() => { mods.load(shopId); }, [shopId]); // eslint-disable-line react-hooks/exhaustive-deps
  const allowed = (to: string) => moduleAllows(mods.disabled, to) && (!role || sessionAllows(op.session!, to));
  // Permissões alteradas pelo gestor valem sem precisar digitar o PIN de novo
  useEffect(() => {
    if (!op.session) return;
    op.refresh();
    const onFocus = () => op.refresh();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [op.session?.session_id, location.pathname]); // eslint-disable-line react-hooks/exhaustive-deps
  // No modo balcão só o gestor troca de loja (e a outra loja abre travada, na tela de PIN)
  const canSwitchStore = !op.balcao || role === 'gestor';

  /* Tela fora da função → volta pra tela inicial da função */
  useEffect(() => {
    if (role && !sessionAllows(op.session!, location.pathname)) nav(homePath(), { replace: true });
  }, [role, location.pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Tela inicial que a função e os módulos da oficina deixam abrir (evita ficar pulando entre telas bloqueadas) */
  function homePath() {
    const candidates = role
      ? [ROLES[role].home, '/oficina/inicio', ...(ROLES[role].routes ?? [])]
      : ['/oficina/inicio'];
    return candidates.find(allowed) ?? '/oficina/avisos';
  }

  /* Módulo desligado pra esta oficina → volta pra tela inicial */
  useEffect(() => {
    if (mods.loaded && mods.workshopId === shopId && !moduleAllows(mods.disabled, location.pathname)) {
      toast.warning('Esse módulo não está liberado para esta oficina.');
      nav(homePath(), { replace: true });
    }
  }, [mods.loaded, mods.disabled, shopId, location.pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  async function enterBalcao() {
    if (!shopId) return;
    const { count } = await supabase.from('workshop_operators')
      .select('id', { count: 'exact', head: true })
      .eq('workshop_id', shopId).eq('active', true).eq('has_pin', true).contains('roles', ['gestor']);
    if (!count) {
      toast.warning('Antes, cadastre o seu PIN de gestor em Configurações → Acessos e funções.');
      nav('/oficina/acessos');
      setOpen(false);
      return;
    }
    op.enterBalcao();
    setOpen(false);
  }

  // Loja acabou de mudar e o modo balcão ainda não carregou a trava dela: não mostra nada
  if (shopId && op.wid !== shopId) return null;
  if (op.balcao && !op.session) return <OperatorLock />;

  const bottomTabs = BOTTOM_TABS[role ?? 'gestor'].filter(t => allowed(t.to));
  // No celular, o "Mais" abre este mesmo menu sem repetir o que já está na barra inferior
  const inBottom = (to: string) => bottomTabs.some(t => t.to === to);
  const path = location.pathname;
  const showMsgs = allowed('/oficina/mensagens');
  // Mensagens da plataforma: o contador vai na aba Plataforma quando ela está na barra; senão, no "Mais"
  const msgsTab = inBottom('/oficina/dashboard') ? '/oficina/dashboard' : null;

  /** Grupos do menu com só o que a função pode abrir (submenu sem filho liberado some) */
  const navSections = SECTIONS.flatMap(sec => {
    const entries = sec.items
      .map(e => (isSub(e) ? { ...e, children: e.children.filter(c => allowed(c.to)) } : e))
      .filter(e => (isSub(e) ? e.children.length > 0 : allowed(e.to)))
      // Mecânico: no Check-up só a fila dele
      .filter(e => !(isMechanicSession && !isSub(e) && CHECKUP_MANAGER_ONLY.includes(e.to)));
    return entries.length ? [{ ...sec, entries }] : [];
  });
  // Gaveta "Mais" (celular): grupos em atalhos, sem repetir o que já está na barra
  const sheetGroups = [
    { key: 'top', title: 'Painéis', items: TOP_ITEMS.filter(i => allowed(i.to) && !inBottom(i.to)) },
    ...navSections.map(sec => ({ key: sec.key, title: sec.title, items: leaves(sec.entries).filter(i => !inBottom(i.to)) })),
  ].filter(g => g.items.length > 0);
  const moreActive = open || !bottomTabs.some(t => onRoute(path, t.to));

  return (
    <div className="min-h-screen flex bg-steel-50">

      {/* 🚗 Modal global: mecânico SAIU pro agendamento */}
      {enRouteAlert && (
        <div className="fixed inset-0 z-[100] bg-steel-900/70 backdrop-blur grid place-items-center p-4 animate-fade-in">
          <div className="bg-white rounded-3xl border-4 border-pending-500 shadow-2xl max-w-md w-full p-6 sm:p-8 text-center space-y-4">
            <div className="text-6xl animate-bounce">🚗</div>
            <h2 className="text-2xl font-bold text-steel-900">Mecânico a caminho!</h2>
            <p className="text-steel-600">
              O mecânico saiu para o serviço agendado. Acompanhe a chegada pelo mapa.
            </p>
            <div className="bg-steel-50 rounded-xl px-4 py-3 text-sm font-semibold text-steel-700 truncate">
              📋 {enRouteAlert.title}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setEnRouteAlert(null)} className="btn-ghost flex-1">Depois</button>
              <button
                onClick={() => {
                  const target = `/oficina/job/${enRouteAlert.jobId}/tracking`;
                  setEnRouteAlert(null);
                  nav(target);
                }}
                className="btn-primary flex-[2] btn-lg"
              >
                Ver no mapa
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ✅ Modal global: mecânico FINALIZOU — confirme p/ liberar pagamento */}
      {finishedAlert && (
        <div className="fixed inset-0 z-[100] bg-steel-900/80 backdrop-blur grid place-items-center p-4 animate-fade-in">
          <div className="bg-white rounded-3xl border-4 border-signal-500 shadow-2xl max-w-md w-full p-6 sm:p-8 text-center space-y-4">
            <div className="text-6xl animate-bounce">✅</div>
            <h2 className="text-2xl font-bold text-steel-900">Mecânico finalizou o serviço!</h2>
            <p className="text-steel-600">
              Confirme para liberar o pagamento ao mecânico — ele está esperando pra ir embora.
            </p>
            <div className="bg-steel-50 rounded-xl px-4 py-3 text-sm space-y-1">
              <div className="font-semibold text-steel-700 truncate">📋 {finishedAlert.title}</div>
              <div className="text-xl font-bold text-signal-600 font-display">R$ {formatBRL(finishedAlert.price)}</div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setFinishedAlert(null)}
                disabled={confirming}
                className="btn-ghost flex-1 text-sm disabled:opacity-50"
              >
                Depois
              </button>
              <button
                onClick={confirmFinished}
                disabled={confirming}
                className="btn-primary flex-[2] btn-lg !bg-signal-500 disabled:opacity-50"
              >
                {confirming ? 'Liberando…' : '✅ Confirmar e liberar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 🔔 Modal global: mecânico chegou — alerta sonoro + visual */}
      {arrivalAlert && (
        <div className="fixed inset-0 z-[100] bg-steel-900/70 backdrop-blur grid place-items-center p-4 animate-fade-in">
          <div className="bg-white rounded-3xl border-4 border-brand-500 shadow-2xl max-w-md w-full p-6 sm:p-8 text-center space-y-4">
            <div className="text-6xl animate-bounce">🔔</div>
            <h2 className="text-2xl font-bold text-steel-900">Mecânico chegou!</h2>
            <p className="text-steel-600">
              O mecânico está na sua oficina aguardando o pagamento para iniciar.
            </p>
            <div className="bg-steel-50 rounded-xl px-4 py-3 text-sm font-semibold text-steel-700 truncate">
              📋 {arrivalAlert.title}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setArrivalAlert(null)}
                className="btn-ghost flex-1"
              >
                Depois
              </button>
              <button
                onClick={() => {
                  const target = `/oficina/job/${arrivalAlert.jobId}/tracking`;
                  setArrivalAlert(null);
                  nav(target);
                }}
                className="btn-primary flex-[2] btn-lg"
              >
                💳 Pagar agora
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Sidebar (computador; no celular o menu é a gaveta do "Mais") ── */}
      <aside className="hidden lg:flex flex-col sticky top-0 h-screen w-64 shrink-0 bg-steel-900 text-white">


        {/* Logo + sino de avisos */}
        <div className="px-5 py-5 border-b border-steel-800 flex items-center justify-between gap-2">
          <Logo light />
          <button
            onClick={() => { nav('/oficina/avisos'); setOpen(false); }}
            aria-label="Avisos"
            title="Avisos"
            className={`relative shrink-0 h-9 w-9 grid place-items-center rounded-xl transition ${
              onRoute(path, '/oficina/avisos') ? 'bg-brand-500 text-white' : 'text-steel-400 hover:bg-steel-800 hover:text-white'
            }`}
          >
            <span className="text-lg">🔔</span>
            {unreadNotif > 0 && (
              <span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold grid place-items-center">
                {unreadNotif > 9 ? '9+' : unreadNotif}
              </span>
            )}
          </button>
        </div>

        {/* Seletor de oficina */}
        {currentWorkshop && canSwitchStore && (
          <div className="px-3 pt-3">
            <WorkshopSwitcher
              workshops={workshops}
              current={currentWorkshop}
              onSelect={(w) => { setCurrentWorkshop(w); setOpen(false); }}
              onAddNew={() => { nav('/oficina/nova'); setOpen(false); }}
            />
          </div>
        )}

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-3">
          {TOP_ITEMS.filter(i => allowed(i.to)).map(i => (
            <SideItem key={i.to} {...i} badge={0} mobileHidden={inBottom(i.to)} onClick={() => setOpen(false)} />
          ))}

          {navSections.map(({ entries, ...sec }) => {
            const items = leaves(entries);
            const hasActive = items.some(i => onRoute(path, i.to));
            const isOpen = hasActive || !collapsed.has(sec.key);
            const groupBadge = items.some(i => i.to === '/oficina/mensagens') ? unread : 0;
            return (
              <div key={sec.key}>
                <button
                  type="button"
                  onClick={() => toggleGroup(sec.key)}
                  disabled={hasActive}
                  aria-expanded={isOpen}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-[10px] font-bold text-steel-500 uppercase tracking-widest hover:text-steel-300 disabled:hover:text-steel-500 transition"
                >
                  <span className="flex-1 text-left">{sec.title}</span>
                  {!isOpen && groupBadge > 0 && (
                    <span className="h-4 min-w-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold grid place-items-center normal-case tracking-normal">
                      {groupBadge > 9 ? '9+' : groupBadge}
                    </span>
                  )}
                  {!hasActive && <span className={`text-[9px] transition-transform ${isOpen ? '' : '-rotate-90'}`}>▼</span>}
                </button>
                {isOpen && (
                  <div className="space-y-0.5 mt-0.5">
                    {entries.map(e => isSub(e) ? (
                      <SideSub key={e.label} {...e} path={path} inBottom={inBottom} onClick={() => setOpen(false)} />
                    ) : (
                      <SideItem
                        key={e.to}
                        {...e}
                        badge={e.to === '/oficina/mensagens' ? unread : 0}
                        mobileHidden={inBottom(e.to)}
                        onClick={() => setOpen(false)}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* Quem está operando (modo balcão) */}
        {op.balcao && op.session ? (
          <div className="border-t border-steel-800 p-4">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-full bg-brand-500 grid place-items-center text-white font-bold text-sm shrink-0">
                {op.session.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold truncate">{op.session.name}</div>
                <div className="text-[11px] text-steel-400">{ROLES[op.session.role].icon} {ROLES[op.session.role].label}</div>
              </div>
              <button
                onClick={() => { op.switchUser(); setOpen(false); }}
                className="text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-steel-800 text-steel-200 hover:bg-steel-700 hover:text-white transition"
                title="Trocar operador ou função"
              >
                🔒 Trocar
              </button>
            </div>
            {op.session.role === 'gestor' && (
              <button
                onClick={() => { op.exitBalcao(); setOpen(false); }}
                className="mt-3 w-full text-[11px] text-steel-500 hover:text-steel-300"
              >
                Desligar o modo balcão neste aparelho
              </button>
            )}
          </div>
        ) : (
        <div className="border-t border-steel-800 p-4">
          <button
            onClick={enterBalcao}
            className="w-full mb-3 text-xs font-semibold px-3 py-2 rounded-lg bg-steel-800 text-steel-300 hover:bg-steel-700 hover:text-white transition"
            title="Cada colaborador entra com o próprio PIN e vê só as telas da função dele"
          >
            🔒 Ativar modo balcão
          </button>
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-brand-500 grid place-items-center text-white font-bold text-sm shrink-0">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold truncate">{firstName}</div>
              <div className="text-[11px] text-steel-500">Oficina</div>
            </div>
            <button
              onClick={() => { signOut(); nav('/login'); }}
              className="text-steel-500 hover:text-white transition text-xs px-2 py-1 rounded-lg hover:bg-steel-800"
              title="Sair"
            >
              Sair
            </button>
          </div>
        </div>
        )}
      </aside>

      {/* ── Main content ── */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Topbar mobile (o menu completo abre pelo "Mais" da barra inferior) */}
        <header className="lg:hidden sticky top-0 z-20 bg-white/90 backdrop-blur-md border-b border-steel-200/80 flex items-center gap-2 px-3 h-14 shrink-0">
          {/* Switcher mobile (ocupa o espaço central) */}
          {currentWorkshop && canSwitchStore ? (
            <div className="flex-1 min-w-0">
              <WorkshopSwitcher
                workshops={workshops}
                current={currentWorkshop}
                onSelect={(w) => setCurrentWorkshop(w)}
                onAddNew={() => nav('/oficina/nova')}
                compact
              />
            </div>
          ) : (
            <div className="flex-1"><Logo /></div>
          )}

          {/* Sino de avisos (mobile) */}
          <button
            onClick={() => nav('/oficina/avisos')}
            aria-label="Avisos"
            className="relative shrink-0 h-9 w-9 grid place-items-center rounded-xl text-steel-600 hover:bg-steel-100 transition"
          >
            <span className="text-lg">🔔</span>
            {unreadNotif > 0 && (
              <span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold grid place-items-center">
                {unreadNotif > 9 ? '9+' : unreadNotif}
              </span>
            )}
          </button>
        </header>

        {/* Page content */}
        <main className="flex-1 p-4 lg:p-8 pb-[calc(84px+env(safe-area-inset-bottom,0px))] lg:pb-8">
          {children}
        </main>
      </div>

      {/* ── Barra inferior (celular) ── */}
      <nav className="fixed bottom-0 inset-x-0 z-30 lg:hidden bg-white/95 backdrop-blur-md border-t border-steel-200/80 safe-area-inset-bottom">
        <div className="grid h-[60px] px-1" style={{ gridTemplateColumns: `repeat(${bottomTabs.length + 1}, minmax(0, 1fr))` }}>
          {bottomTabs.map(tab => {
            const badge = tab.to === msgsTab && showMsgs ? unread : 0;
            return (
              <NavLink key={tab.to} to={tab.to} onClick={() => setOpen(false)}
                className={({ isActive }) => `group flex flex-col items-center justify-center gap-1 text-[10px] font-semibold tracking-tight transition-colors ${
                  isActive && !open ? 'text-brand-600' : 'text-steel-400 active:text-steel-600'}`}>
                {({ isActive }) => (
                  <>
                    <span className={`relative grid place-items-center h-7 w-12 rounded-full text-lg leading-none transition-all duration-200 ${
                      isActive && !open ? 'bg-brand-50' : 'grayscale-[35%] opacity-80 group-active:scale-90'}`}>
                      {tab.icon}
                      {badge > 0 && <Badge n={badge} />}
                    </span>
                    <span className="truncate max-w-full px-0.5">{tab.label}</span>
                  </>
                )}
              </NavLink>
            );
          })}

          {/* Mais: abre a gaveta com o resto do menu */}
          <button type="button" onClick={() => setOpen(o => !o)} aria-label="Mais opções" aria-expanded={open}
            className={`group flex flex-col items-center justify-center gap-1 text-[10px] font-semibold tracking-tight transition-colors ${
              moreActive ? 'text-brand-600' : 'text-steel-400'}`}>
            <span className={`relative grid place-items-center h-7 w-12 rounded-full transition-all duration-200 ${
              moreActive ? 'bg-brand-50' : 'group-active:scale-90'}`}>
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
                {open ? <path d="M6 6l12 12M18 6L6 18" /> : <><circle cx="5" cy="12" r="1.4" /><circle cx="12" cy="12" r="1.4" /><circle cx="19" cy="12" r="1.4" /></>}
              </svg>
              {!msgsTab && showMsgs && unread > 0 && <Badge n={unread} />}
            </span>
            <span>Mais</span>
          </button>
        </div>
      </nav>

      {/* ── Gaveta "Mais" (celular): tudo que não está na barra, em atalhos ── */}
      {open && (
        <div className="lg:hidden fixed inset-0 z-[25]" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-steel-900/50 backdrop-blur-[2px] animate-fade-in" onClick={() => setOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 max-h-[85vh] flex flex-col rounded-t-[22px] bg-steel-50 shadow-2xl animate-sheet-up pb-[calc(60px+env(safe-area-inset-bottom,0px))]">
            <div className="pt-2.5 pb-1 grid place-items-center shrink-0"><span className="h-1 w-10 rounded-full bg-steel-300" /></div>

            {/* Quem está usando */}
            <div className="px-4 pt-1 pb-3 flex items-center gap-3 shrink-0">
              <div className="h-10 w-10 rounded-full bg-steel-900 text-white grid place-items-center font-bold text-sm shrink-0">
                {op.balcao && op.session ? op.session.name.charAt(0).toUpperCase() : initials}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-steel-900 truncate">{op.balcao && op.session ? op.session.name : firstName}</div>
                <div className="text-xs text-steel-500 truncate">
                  {op.balcao && op.session ? `${ROLES[op.session.role].icon} ${ROLES[op.session.role].label}` : currentWorkshop?.business_name ?? 'Oficina'}
                </div>
              </div>
              {op.balcao && op.session ? (
                <button onClick={() => { op.switchUser(); setOpen(false); }}
                  className="h-9 px-3 rounded-lg bg-white ring-1 ring-steel-200 text-xs font-semibold text-steel-700 active:bg-steel-100">🔒 Trocar</button>
              ) : (
                <button onClick={() => { signOut(); nav('/login'); }}
                  className="h-9 px-3 rounded-lg bg-white ring-1 ring-steel-200 text-xs font-semibold text-steel-700 active:bg-steel-100">Sair</button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-4 space-y-4">
              {sheetGroups.map(g => (
                <section key={g.key}>
                  <h3 className="px-1 mb-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-steel-400">{g.title}</h3>
                  <div className="grid grid-cols-3 gap-2">
                    {g.items.map(i => (
                      <NavLink key={i.to} to={i.to} end={i.to === '/oficina/pecas' || i.to === '/oficina/checkup'} onClick={() => setOpen(false)}
                        className={({ isActive }) => `relative flex flex-col items-center justify-center gap-1.5 text-center min-h-[78px] px-1.5 py-2.5 rounded-2xl transition active:scale-[0.97] ${
                          isActive ? 'bg-brand-500 text-white shadow-brand' : 'bg-white text-steel-700 ring-1 ring-steel-200/70'}`}>
                        <span className="text-[22px] leading-none">{i.icon}</span>
                        <span className="text-[11px] font-semibold leading-tight line-clamp-2">{i.label}</span>
                        {i.to === '/oficina/mensagens' && unread > 0 && <span className="absolute top-1.5 right-1.5"><Badge n={unread} inline /></span>}
                      </NavLink>
                    ))}
                  </div>
                </section>
              ))}

              {!op.balcao && (
                <button onClick={enterBalcao}
                  className="w-full flex items-center gap-3 rounded-2xl bg-white ring-1 ring-steel-200/70 px-4 py-3 text-left active:bg-steel-100">
                  <span className="text-xl">🔒</span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold text-steel-900">Ativar modo balcão</span>
                    <span className="block text-xs text-steel-500">Cada colaborador entra com o próprio PIN</span>
                  </span>
                </button>
              )}
              {op.balcao && op.session?.role === 'gestor' && (
                <button onClick={() => { op.exitBalcao(); setOpen(false); }} className="w-full text-xs text-steel-500 py-2">
                  Desligar o modo balcão neste aparelho
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Bolinha vermelha de contagem */
function Badge({ n, inline = false }: { n: number; inline?: boolean }) {
  return (
    <span className={`${inline ? '' : 'absolute -top-1 right-1'} h-4 min-w-4 px-1 rounded-full bg-alert-500 text-white text-[9px] font-bold grid place-items-center ring-2 ring-white`}>
      {n > 9 ? '9+' : n}
    </span>
  );
}

/* ── Seletor de oficina (dropdown) ── */
function WorkshopSwitcher({
  workshops, current, onSelect, onAddNew, compact = false,
}: {
  workshops: Workshop[];
  current: Workshop;
  onSelect: (w: Workshop) => void;
  onAddNew: () => void;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // fecha ao clicar fora
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const triggerCls = compact
    ? 'w-full flex items-center gap-2 px-3 py-2 rounded-xl bg-steel-100 hover:bg-steel-200 transition'
    : 'w-full flex items-center gap-2 px-3 py-2.5 rounded-xl bg-steel-800/60 hover:bg-steel-800 border border-steel-700 transition';
  const labelCls = compact ? 'text-xs font-bold text-steel-800' : 'text-sm font-bold text-white';
  const subCls   = compact ? 'text-[9px] text-steel-500' : 'text-[10px] text-steel-400';

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen(o => !o)} className={triggerCls}>
        <span className="text-base shrink-0">🏪</span>
        <div className="flex-1 min-w-0 text-left">
          <div className={`${labelCls} truncate leading-tight`}>{current.business_name}</div>
          {workshops.length > 1 && (
            <div className={`${subCls} truncate leading-tight`}>{current.city}/{current.state}</div>
          )}
        </div>
        <span className={`text-xs shrink-0 ${compact ? 'text-steel-500' : 'text-steel-400'} transition-transform ${open ? 'rotate-180' : ''}`}>▼</span>
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-white rounded-xl shadow-2xl border border-steel-200 overflow-hidden max-h-80 overflow-y-auto">
          <div className="px-3 py-2 text-[10px] font-bold text-steel-500 uppercase tracking-widest border-b border-steel-100">
            Suas oficinas ({workshops.length})
          </div>
          {workshops.map(w => {
            const isActive = w.id === current.id;
            return (
              <button
                key={w.id}
                onClick={() => { onSelect(w); setOpen(false); }}
                className={`w-full flex items-center gap-2 px-3 py-2.5 hover:bg-steel-50 transition text-left ${isActive ? 'bg-brand-50' : ''}`}
              >
                <span className="text-base shrink-0">{isActive ? '✅' : '🏪'}</span>
                <div className="flex-1 min-w-0">
                  <div className={`text-sm font-semibold truncate ${isActive ? 'text-brand-600' : 'text-steel-800'}`}>
                    {w.business_name}
                  </div>
                  <div className="text-[10px] text-steel-500 truncate">{w.city}/{w.state}</div>
                </div>
              </button>
            );
          })}
          <button
            onClick={() => { onAddNew(); setOpen(false); }}
            className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-brand-50 transition text-left border-t border-steel-100"
          >
            <span className="text-base shrink-0 text-brand-500">＋</span>
            <span className="text-sm font-semibold text-brand-600">Adicionar nova oficina</span>
          </button>
        </div>
      )}
    </div>
  );
}

function SideItem({ to, icon, label, badge, mobileHidden = false, nested = false, onClick }: NavItem & {
  badge: number; mobileHidden?: boolean; nested?: boolean; onClick: () => void;
}) {
  return (
    <NavLink
      to={to}
      // Peças e Check-up têm sub-rotas com item próprio no menu
      end={to === '/oficina/pecas' || to === '/oficina/checkup'}
      onClick={onClick}
      className={({ isActive }) => `
        ${mobileHidden ? 'hidden lg:flex' : 'flex'} items-center gap-3 px-3 ${nested ? 'py-2.5' : 'py-3'} rounded-xl text-sm font-medium transition-all
        ${isActive
          ? 'bg-brand-500 text-white shadow-brand'
          : 'text-steel-400 hover:text-white hover:bg-steel-800'
        }
      `}
    >
      <span className="text-base w-5 text-center">{icon}</span>
      <span className="flex-1">{label}</span>
      {badge > 0 && (
        <span className="h-5 min-w-5 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold grid place-items-center">
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </NavLink>
  );
}

/* ── Submenu (ex.: Fechamentos → comissões / folha) — abre sozinho quando a tela atual é um dos filhos ── */
function SideSub({ icon, label, children, path, inBottom, onClick }: NavSub & {
  path: string; inBottom: (to: string) => boolean; onClick: () => void;
}) {
  const hasActive = children.some(c => onRoute(path, c.to));
  const [open, setOpen] = useState(hasActive);
  useEffect(() => { if (hasActive) setOpen(true); }, [hasActive]);
  const isOpen = open || hasActive;

  return (
    <div className={children.every(c => inBottom(c.to)) ? 'hidden lg:block' : ''}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={isOpen}
        className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition-all ${
          hasActive ? 'text-white' : 'text-steel-400 hover:text-white hover:bg-steel-800'
        }`}
      >
        <span className="text-base w-5 text-center">{icon}</span>
        <span className="flex-1 text-left">{label}</span>
        <span className={`text-[9px] transition-transform ${isOpen ? '' : '-rotate-90'}`}>▼</span>
      </button>
      {isOpen && (
        <div className="ml-5 pl-2 border-l border-steel-700 space-y-0.5">
          {children.map(c => (
            <SideItem key={c.to} {...c} badge={0} nested mobileHidden={inBottom(c.to)} onClick={onClick} />
          ))}
        </div>
      )}
    </div>
  );
}
