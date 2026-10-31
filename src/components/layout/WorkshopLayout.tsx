import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
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
import { isPlatformOnly, moduleAllows, moduleEntry, useWorkshopModules } from '@/lib/modules';
import { useInboxAlerts } from '@/hooks/useInboxAlerts';
import { useWallet } from '@/lib/wallet';
import WalletChip from '@/components/wallet/WalletChip';
import { Icon, type IconName } from '@/components/home/ui';

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

/** Itens soltos no topo do menu */
const TOP_ITEMS: NavItem[] = [
  { to: '/oficina/inicio', icon: '🏠', label: 'Início' },
];

/**
 * Menu por fluxo de trabalho. Só muda a organização e os nomes: as rotas (e com elas as permissões
 * do modo balcão e os módulos do superadmin) são as mesmas. `icon` (emoji) é usado só na gaveta do celular.
 */
const SECTIONS: NavGroup[] = [
  { key: 'atendimento', title: 'Atendimento', items: [
    { to: '/oficina/os',         icon: '📋', label: 'Ordens de serviço'    },
    { to: '/oficina/agenda',     icon: '📅', label: 'Agenda'               },
    // Check-up é um dos diferenciais: fica junto do atendimento, com as telas dele num submenu
    { icon: '🩺', label: 'Check-up', children: [
      { to: '/oficina/checkup',            icon: '🩺', label: 'Painel do check-up' },
      { to: '/oficina/checkup/inspecoes',  icon: '🔍', label: 'Inspeções'          },
      { to: '/oficina/checkup/historico',  icon: '🗂️', label: 'Histórico'          },
      { to: '/oficina/checkup/modelos',    icon: '🧩', label: 'Modelos'            },
    ] },
    { to: '/oficina/clientes',   icon: '👥', label: 'Clientes'             },
    { to: '/oficina/comercial',  icon: '🤝', label: 'Comercial'            },
  ] },
  { key: 'comunicacao', title: 'Comunicação', items: [
    { to: '/oficina/inbox',      icon: '💬', label: 'WhatsApp dos clientes' },
    { to: '/oficina/inbox/painel', icon: '📊', label: 'Painel do WhatsApp' },
    { to: '/oficina/avaliacoes', icon: '⭐', label: 'Avaliações Google'    },
    { to: '/oficina/agentes',    icon: '🤖', label: 'Agentes de IA'        },
  ] },
  { key: 'financeiro', title: 'Financeiro', items: [
    { to: '/oficina/caixa',      icon: '💰', label: 'Caixa'                },
    { to: '/oficina/contas-a-pagar', icon: '📤', label: 'Contas a pagar'   },
    { to: '/oficina/financeiro', icon: '💵', label: 'Visão financeira'     },
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
  ] },
  { key: 'relatorios', title: 'Relatórios', items: [
    { to: '/oficina/resultado',  icon: '📈', label: 'Resultado'            },
    { to: '/oficina/painel',     icon: '📊', label: 'Painel de vendas'     },
  ] },
  { key: 'plataforma', title: 'MecânicoApp', items: [
    { to: '/oficina/dashboard',  icon: '⚡', label: 'Demandas'             },
    { to: '/oficina/carteira',   icon: '💰', label: 'Carteira'             },
    { to: '/oficina/plataforma/painel', icon: '📊', label: 'Painel da plataforma' },
    { to: '/oficina/plataforma/clientes', icon: '📇', label: 'Clientes e orçamentos' },
    { to: '/oficina/buscar',     icon: '🔍', label: 'Buscar profissionais' },
    { to: '/oficina/mensagens',  icon: '💬', label: 'Mensagens da plataforma' },
  ] },
  { key: 'config', title: 'Configurações', items: [
    { to: '/oficina/perfil',     icon: '🏪', label: 'Perfil e vitrine'     },
    { to: '/oficina/servicos',   icon: '🛠️', label: 'Tabela de serviços'   },
    { to: '/oficina/acessos',    icon: '🔐', label: 'Acessos e funções'    },
    { to: '/oficina/importar',   icon: '📷', label: 'Importar notas antigas' },
    { to: '/oficina/vip',        icon: '⭐', label: 'Plano VIP'            },
  ] },
];

/** Pacote "Só mecânicos": sem Configurações à parte, o perfil da oficina fica junto da Plataforma */
const PLATFORM_SECTIONS: NavGroup[] = SECTIONS.filter(sec => sec.key !== 'config').map(sec => (sec.key === 'plataforma'
  ? { ...sec, items: [...sec.items, { to: '/oficina/perfil', icon: '🏪', label: 'Perfil da oficina' }] }
  : sec))
  // O produto principal fica em primeiro, mesmo com pacotes extras (ex.: Atendimento) ligados
  .sort((a, b) => Number(b.key === 'plataforma') - Number(a.key === 'plataforma'));

/** Ícone de cada bloco na gaveta "Mais" (celular) */
const SECTION_ICON: Record<string, string> = {
  top: '📊', atendimento: '📋', comunicacao: '💬', financeiro: '💵', estoque: '📦',
  equipe: '👷', relatorios: '📈', plataforma: '⚡', config: '⚙️',
};

/** Ícone de traço de cada grupo (menu do computador e busca rápida) */
const GROUP_ICON: Record<string, IconName> = {
  top: 'home', atendimento: 'clipboard', comunicacao: 'chat', financeiro: 'wallet', estoque: 'box',
  equipe: 'users', relatorios: 'bars', plataforma: 'zap', config: 'gear',
};

/** Grupo de uma rota (para abrir sozinho o grupo da tela atual) */
function groupOf(path: string, sections = SECTIONS): string | null {
  for (const sec of sections) if (leaves(sec.items).some(i => onRoute(path, i.to))) return sec.key;
  return null;
}

/** Telas do Check-up que são do gestor (o mecânico vê só a fila dele em /oficina/checkup) */
const CHECKUP_MANAGER_ONLY = ['/oficina/checkup/inspecoes', '/oficina/checkup/historico', '/oficina/checkup/modelos'];

/* ── Tema do menu (claro/escuro) e menu recolhido: preferências deste aparelho ── */
type SideTheme = 'dark' | 'light';
const LS_THEME = 'oficina_menu_tema';
const LS_RAIL = 'oficina_menu_recolhido';
const readLS = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const writeLS = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* sem storage */ } };

/** Cores do menu em cada tema: o laranja fica só no que está ativo */
const SIDE: Record<SideTheme, {
  aside: string; line: string; title: string; item: string; itemActive: string; bar: string;
  group: string; groupOpen: string; icon: string; iconActive: string; tool: string; kbd: string;
  guide: string; avatar: string; muted: string; strong: string;
}> = {
  dark: {
    aside: 'bg-steel-900 text-steel-300',
    line: 'border-white/[0.06]',
    title: 'text-steel-500',
    item: 'text-steel-400 hover:text-white hover:bg-white/[0.05]',
    itemActive: 'text-white bg-white/[0.07]',
    bar: 'bg-brand-500',
    group: 'text-steel-300 hover:text-white hover:bg-white/[0.04]',
    groupOpen: 'text-white hover:bg-white/[0.04]',
    icon: 'text-steel-500',
    iconActive: 'text-brand-400',
    tool: 'text-steel-400 hover:text-white hover:bg-white/[0.06]',
    kbd: 'bg-white/[0.06] text-steel-400 ring-1 ring-white/10',
    guide: 'border-white/[0.08]',
    avatar: 'bg-white/10 text-white',
    muted: 'text-steel-500',
    strong: 'text-white',
  },
  light: {
    aside: 'bg-white text-steel-700 border-r border-steel-200/80',
    line: 'border-steel-200/70',
    title: 'text-steel-400',
    item: 'text-steel-500 hover:text-steel-900 hover:bg-steel-100/70',
    itemActive: 'text-steel-900 bg-brand-50/70',
    bar: 'bg-brand-500',
    group: 'text-steel-600 hover:text-steel-900 hover:bg-steel-100/60',
    groupOpen: 'text-steel-900 hover:bg-steel-100/60',
    icon: 'text-steel-400',
    iconActive: 'text-brand-600',
    tool: 'text-steel-400 hover:text-steel-800 hover:bg-steel-100',
    kbd: 'bg-steel-100 text-steel-500 ring-1 ring-steel-200',
    guide: 'border-steel-200',
    avatar: 'bg-steel-900 text-white',
    muted: 'text-steel-400',
    strong: 'text-steel-900',
  },
};

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

/**
 * Barra inferior (celular) por função; o resto fica no "Mais". Sem modo balcão = gestor.
 * Gestor no celular acompanha resultado (não opera): Resultado, pendências do dia, Plataforma (emergência) e equipe.
 */
const TAB = {
  resultado: { to: '/oficina/resultado', icon: '📈', label: 'Resultado' },
  hoje:      { to: '/oficina/inicio',    icon: '🏠', label: 'Hoje'      },
  plataforma:{ to: '/oficina/dashboard', icon: '⚡', label: 'Plataforma' },
  demandas:  { to: '/oficina/dashboard', icon: '⚡', label: 'Demandas'  },
  inicioPlataforma: { to: '/oficina/dashboard', icon: '🏠', label: 'Início' },
  /** Abre a Nova demanda (a tela de Demandas lê o ?nova=1) */
  chamar:    { to: '/oficina/dashboard?nova=1', icon: '＋', label: 'Chamar' },
  buscar:    { to: '/oficina/buscar',    icon: '🔍', label: 'Buscar'    },
  mensagens: { to: '/oficina/mensagens', icon: '💬', label: 'Mensagens' },
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
/** Pacote "Só mecânicos": a barra é só a Plataforma */
const PLATFORM_TABS: NavItem[] = [TAB.inicioPlataforma, TAB.chamar, TAB.mensagens];
const HOME = '/oficina/inicio';
/** Para onde o login e os redirecionamentos mandam a oficina sem ela ter escolhido (Login.destino, ProtectedRoute) */
const LANDING_PATHS = [HOME, '/oficina/painel', '/oficina/resultado'];

const LS_KEY = 'oficina_msgs_last_seen';

export default function WorkshopLayout({ children }: { children: ReactNode }) {
  const { signOut, profile, user, workshops, currentWorkshop, setCurrentWorkshop } = useAuth();
  const nav      = useNavigate();
  const location = useLocation();
  const [open, setOpen]         = useState(false);
  const [sheetGroup, setSheetGroup] = useState<string | null>(null);   // bloco aberto na gaveta "Mais"
  const [unread, setUnread]     = useState(0);
  const unreadNotif = useUnreadNotifications();
  // Sanfona: um grupo aberto por vez; abre sozinho o grupo da tela atual
  const [openGroup, setOpenGroup] = useState<string | null>(() => groupOf(location.pathname));
  const platformOnlyNow = useWorkshopModules(s => isPlatformOnly(s.disabled));
  useEffect(() => {
    const g = groupOf(location.pathname, platformOnlyNow ? PLATFORM_SECTIONS : SECTIONS);
    if (g) setOpenGroup(g);
  }, [location.pathname, platformOnlyNow]);
  // Tema do menu e menu recolhido: preferência deste aparelho
  const [sideTheme, setSideTheme] = useState<SideTheme>(() => (readLS(LS_THEME) === 'light' ? 'light' : 'dark'));
  const toggleTheme = () => setSideTheme(t => { const n: SideTheme = t === 'dark' ? 'light' : 'dark'; writeLS(LS_THEME, n); return n; });
  const [rail, setRail] = useState(() => readLS(LS_RAIL) === '1');
  const [flyout, setFlyout] = useState<{ key: string; top: number } | null>(null);
  const flyRef = useRef<HTMLDivElement>(null);
  const toggleRail = (v: boolean) => { setRail(v); writeLS(LS_RAIL, v ? '1' : '0'); setFlyout(null); };
  useEffect(() => { setFlyout(null); }, [location.pathname]);
  useEffect(() => {
    if (!flyout) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (flyRef.current?.contains(t) || t.closest?.('[data-rail]')) return;
      setFlyout(null);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [flyout]);
  // Busca rápida: Ctrl+K / ⌘K em qualquer tela
  const [palette, setPalette] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette(p => !p); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const shopId = currentWorkshop?.id ?? null;
  // Carteira (saldo pré-pago): item do menu e saldo no topo só com ela ligada em Configurações
  const wallet = useWallet(shopId);

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
  useEffect(() => { if (!open) setSheetGroup(null); }, [open]);
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
  // Sem OS (pacote "Só mecânicos") o Início, que é todo de OS, some e a entrada vira as Demandas
  const platformOnly = isPlatformOnly(mods.disabled);
  const allowed = (to: string) => !(platformOnly && to === HOME)
    // Meus cadastros é o básico de quem não tem o módulo Clientes: com ele ligado, usa o completo
    && !(to === '/oficina/plataforma/clientes' && !mods.disabled.includes('clientes'))
    && !(to === '/oficina/carteira' && !wallet.enabled)
    && moduleAllows(mods.disabled, to) && (!role || sessionAllows(op.session!, to));
  // WhatsApp: conversas não lidas no menu + som de mensagem nova (só para quem pode abrir o Inbox)
  const inboxUnread = useInboxAlerts(shopId, allowed('/oficina/inbox'), role);
  const badgeOf = (to: string) => (to === '/oficina/mensagens' ? unread : to === '/oficina/inbox' ? inboxUnread : 0);
  // Tela de entrada desligada (ex.: Painel do check-up) → o item leva pra primeira ferramenta liberada do módulo
  const fix = <T extends NavItem>(i: T): T => ({ ...i, to: moduleEntry(mods.disabled, i.to) ?? i.to });
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
      ? [ROLES[role].home, HOME, ...(ROLES[role].routes ?? [])]
      : [HOME];
    return [...candidates, '/oficina/dashboard'].find(allowed) ?? '/oficina/avisos';
  }

  /* Módulo/ferramenta desligado pra esta oficina → outra ferramenta do módulo ou a tela inicial */
  useEffect(() => {
    if (mods.loaded && mods.workshopId === shopId && platformOnly && location.pathname === HOME) {
      nav(homePath(), { replace: true });
      return;
    }
    if (mods.loaded && mods.workshopId === shopId && !moduleAllows(mods.disabled, location.pathname)) {
      const alt = moduleEntry(mods.disabled, location.pathname);
      if (alt && allowed(alt)) { nav(alt, { replace: true }); return; }
      // Tela de entrada padrão (login cai no Painel/Resultado): vai pra tela certa sem aviso
      if (LANDING_PATHS.includes(location.pathname)) { nav(homePath(), { replace: true }); return; }
      const onlyDesktop = mods.isMobile && moduleAllows(mods.off, location.pathname);
      toast.warning(onlyDesktop
        ? 'Esse módulo está liberado só no computador.'
        : 'Esse módulo não está liberado para esta oficina.');
      nav(homePath(), { replace: true });
    }
  }, [mods.loaded, mods.disabled, shopId, location.pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  // Modo balcão só faz sentido com o módulo "Acessos e modo balcão" (é lá que se cadastram os PINs)
  const balcaoOk = !mods.off.includes('acessos');

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

  const bottomTabs = (platformOnly ? PLATFORM_TABS : BOTTOM_TABS[role ?? 'gestor']).map(fix).filter(t => allowed(t.to));
  // No celular, o "Mais" abre este mesmo menu sem repetir o que já está na barra inferior
  const inBottom = (to: string) => bottomTabs.some(t => t.to === to);
  const path = location.pathname;
  const showMsgs = allowed('/oficina/mensagens');
  // Mensagens da plataforma: o contador vai na aba Plataforma quando ela está na barra; senão, no "Mais"
  const msgsTab = inBottom('/oficina/mensagens') ? '/oficina/mensagens' : inBottom('/oficina/dashboard') ? '/oficina/dashboard' : null;

  /** Grupos do menu com só o que a função pode abrir (submenu sem filho liberado some) */
  const navSections = (platformOnly ? PLATFORM_SECTIONS : SECTIONS).flatMap(sec => {
    const entries = sec.items
      .map(e => (isSub(e) ? {
        ...e,
        // Mecânico: no Check-up só a fila dele
        children: e.children.map(fix).filter(c => allowed(c.to) && !(isMechanicSession && CHECKUP_MANAGER_ONLY.includes(c.to))),
      } : fix(e)))
      .filter(e => (isSub(e) ? e.children.length > 0 : allowed(e.to)))
      // Submenu com uma tela só vira item direto (com o nome do submenu)
      .map(e => (isSub(e) && e.children.length === 1 ? { ...e.children[0], label: e.label } : e));
    return entries.length ? [{ ...sec, entries }] : [];
  });
  // Gaveta "Mais" (celular): grupos em atalhos, sem repetir o que já está na barra
  const sheetGroups = [
    { key: 'top', title: 'Painéis', items: TOP_ITEMS.map(fix).filter(i => allowed(i.to) && !inBottom(i.to)) },
    ...navSections.map(sec => ({ key: sec.key, title: sec.title, items: leaves(sec.entries).filter(i => !inBottom(i.to)) })),
  ].filter(g => g.items.length > 0);
  const moreActive = open || !bottomTabs.some(t => onRoute(path, t.to));
  const T = SIDE[sideTheme];

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
            {/* Sem "depois": o mecânico só começa depois do pagamento. Cancelar (com multa) fica na tela do serviço */}
            <button
              onClick={() => {
                const target = `/oficina/job/${arrivalAlert.jobId}/tracking`;
                setArrivalAlert(null);
                nav(target);
              }}
              className="btn-primary w-full btn-lg"
            >
              💳 Pagar agora
            </button>
            <button
              onClick={() => {
                const target = `/oficina/job/${arrivalAlert.jobId}/tracking`;
                setArrivalAlert(null);
                nav(target);
              }}
              className="w-full min-h-[44px] text-xs font-semibold text-steel-500 underline underline-offset-2 hover:text-alert-600"
            >
              Não vai seguir? Cancelar com multa
            </button>
          </div>
        </div>
      )}

      {/* ── Menu lateral (computador; no celular o menu é a gaveta do "Mais") ── */}
      <aside className={`hidden lg:flex flex-col sticky top-0 h-screen shrink-0 transition-[width] duration-200 ease-out ${T.aside} ${rail ? 'w-[68px]' : 'w-64'}`}>

        {/* Logo + avisos */}
        <div className={`h-16 shrink-0 flex items-center border-b ${T.line} ${rail ? 'justify-center px-2' : 'justify-between pl-5 pr-3'}`}>
          {rail ? <Logo size={28} withText={false} /> : <Logo light={sideTheme === 'dark'} />}
          {!rail && (
            <button onClick={() => nav('/oficina/avisos')} aria-label="Avisos" title="Avisos"
              className={`relative h-9 w-9 grid place-items-center rounded-lg transition ${onRoute(path, '/oficina/avisos') ? `${T.itemActive}` : T.tool}`}>
              <Icon name="bell" size={18} />
              {unreadNotif > 0 && <Badge n={unreadNotif} />}
            </button>
          )}
        </div>

        {/* Loja + busca rápida */}
        <div className={`shrink-0 pt-3 space-y-2 ${rail ? 'px-2.5' : 'px-3'}`}>
          {currentWorkshop && canSwitchStore && (rail ? (
            <button onClick={() => toggleRail(false)} title={`${currentWorkshop.business_name} — abrir o menu para trocar de loja`}
              className={`w-full h-10 grid place-items-center rounded-lg transition ${T.tool}`}>
              <Icon name="store" size={18} />
            </button>
          ) : (
            <WorkshopSwitcher workshops={workshops} current={currentWorkshop} light={sideTheme === 'light'}
              onSelect={(w) => setCurrentWorkshop(w)} onAddNew={() => nav('/oficina/nova')} />
          ))}
          {!rail && wallet.balance && allowed('/oficina/carteira') && (
            <WalletChip total={wallet.balance.total} light={sideTheme === 'light'} />
          )}
          <button onClick={() => setPalette(true)} title="Buscar tela (Ctrl+K)"
            className={`w-full flex items-center rounded-lg transition ${T.tool} ${rail ? 'h-10 justify-center' : 'h-9 gap-2.5 px-3'}`}>
            <Icon name="search" size={16} />
            {!rail && (
              <>
                <span className="flex-1 text-left text-[13px]">Buscar tela…</span>
                <kbd className={`font-mono text-[10px] leading-none rounded px-1.5 py-1 ${T.kbd}`}>{isMac ? '⌘K' : 'Ctrl K'}</kbd>
              </>
            )}
          </button>
        </div>

        {/* Navegação */}
        <nav className={`flex-1 overflow-y-auto overflow-x-hidden py-3 ${rail ? 'px-2.5 space-y-1' : 'px-3 space-y-0.5'}`}>
          {TOP_ITEMS.map(fix).filter(i => allowed(i.to)).map(i => (rail ? (
            <RailButton key={i.to} T={T} icon="home" label={i.label} active={onRoute(path, i.to)} onClick={() => nav(i.to)} />
          ) : (
            <NavLink key={i.to} to={i.to}
              className={({ isActive }) => `relative flex items-center gap-3 h-9 px-3 rounded-lg text-[13.5px] font-medium transition ${isActive ? T.itemActive : T.group}`}>
              {({ isActive }) => (
                <>
                  {isActive && <span className={`absolute left-0 top-2 bottom-2 w-[2px] rounded-full ${T.bar}`} />}
                  <Icon name="home" size={17} className={isActive ? T.iconActive : T.icon} />
                  {i.label}
                </>
              )}
            </NavLink>
          )))}

          {!rail && <div className={`my-2 border-t ${T.line}`} />}

          {navSections.map(({ entries, ...sec }) => {
            const items = leaves(entries);
            const hasActive = items.some(i => onRoute(path, i.to));
            const isOpen = openGroup === sec.key;
            const groupBadge = items.reduce((n, i) => n + badgeOf(i.to), 0);
            const icon = GROUP_ICON[sec.key] ?? 'clipboard';

            if (rail) return (
              <RailButton key={sec.key} T={T} icon={icon} label={sec.title} active={hasActive} dot={groupBadge > 0}
                pressed={flyout?.key === sec.key}
                onClick={e => {
                  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                  setFlyout(f => (f?.key === sec.key ? null : { key: sec.key, top: r.top }));
                }} />
            );

            return (
              <div key={sec.key}>
                <button type="button" onClick={() => setOpenGroup(g => (g === sec.key ? null : sec.key))} aria-expanded={isOpen}
                  className={`w-full flex items-center gap-3 h-9 px-3 rounded-lg text-[13.5px] font-medium transition ${isOpen || hasActive ? T.groupOpen : T.group}`}>
                  <Icon name={icon} size={17} className={hasActive ? T.iconActive : T.icon} />
                  <span className="flex-1 text-left truncate">{sec.title}</span>
                  {!isOpen && groupBadge > 0 && <Badge n={groupBadge} inline />}
                  <Icon name="chevron" size={14} className={`${T.muted} transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
                </button>
                {/* Sanfona: só um grupo aberto por vez */}
                <div className={`grid transition-[grid-template-rows] duration-200 ease-out ${isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
                  <div className="overflow-hidden">
                    <div className={`ml-[21px] pl-3 border-l ${T.guide} py-1 space-y-px`}>
                      {entries.map(e => isSub(e) ? (
                        <SideSub key={e.label} T={T} {...e} path={path} badgeOf={badgeOf} />
                      ) : (
                        <SideItem key={e.to} T={T} {...e} badge={badgeOf(e.to)} />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </nav>

        {/* Rodapé: quem está usando, modo balcão e preferências do menu */}
        <div className={`shrink-0 border-t ${T.line} ${rail ? 'p-2.5 space-y-1' : 'p-3 space-y-2'}`}>
          {!rail && (op.balcao && op.session ? (
            <div className="flex items-center gap-2.5 px-1">
              <div className={`h-8 w-8 rounded-full grid place-items-center text-xs font-bold shrink-0 ${T.avatar}`}>{op.session.name.charAt(0).toUpperCase()}</div>
              <div className="flex-1 min-w-0">
                <div className={`text-[13px] font-semibold truncate ${T.strong}`}>{op.session.name}</div>
                <div className={`text-[11px] truncate ${T.muted}`}>{ROLES[op.session.role].label}</div>
              </div>
              <button onClick={() => op.switchUser()} title="Trocar operador ou função"
                className={`h-8 px-2.5 inline-flex items-center gap-1.5 rounded-lg text-xs font-semibold transition ${T.tool}`}>
                <Icon name="lock" size={14} />Trocar
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2.5 px-1">
              <div className={`h-8 w-8 rounded-full grid place-items-center text-xs font-bold shrink-0 ${T.avatar}`}>{initials}</div>
              <div className="flex-1 min-w-0">
                <div className={`text-[13px] font-semibold truncate ${T.strong}`}>{firstName}</div>
                <div className={`text-[11px] truncate ${T.muted}`}>Oficina</div>
              </div>
              <button onClick={() => { signOut(); nav('/login'); }} title="Sair" aria-label="Sair"
                className={`h-8 w-8 grid place-items-center rounded-lg transition ${T.tool}`}>
                <Icon name="logout" size={16} />
              </button>
            </div>
          ))}

          {/* Ações do rodapé: modo balcão, tema e recolher */}
          <div className={rail ? 'space-y-1' : 'flex items-center gap-1'}>
            {op.balcao && op.session?.role === 'gestor' ? (
              rail ? <RailButton T={T} icon="lock" label="Trocar operador" onClick={() => op.switchUser()} /> : (
                <button onClick={() => op.exitBalcao()} className={`flex-1 h-8 px-2 rounded-lg text-[11px] font-medium text-left transition ${T.tool}`}>
                  Desligar modo balcão
                </button>
              )
            ) : !op.balcao ? (
              !balcaoOk ? (rail ? null : <span className="flex-1" />)
              : rail ? <RailButton T={T} icon="lock" label="Ativar modo balcão" onClick={enterBalcao} /> : (
                <button onClick={enterBalcao} title="Cada colaborador entra com o próprio PIN e vê só as telas da função dele"
                  className={`flex-1 h-8 px-2 inline-flex items-center gap-2 rounded-lg text-xs font-semibold transition ${T.tool}`}>
                  <Icon name="lock" size={14} />Modo balcão
                </button>
              )
            ) : rail ? <RailButton T={T} icon="lock" label="Trocar operador" onClick={() => op.switchUser()} /> : <span className="flex-1" />}
            {rail ? (
              <>
                <RailButton T={T} icon={sideTheme === 'dark' ? 'sun' : 'moon'} label={sideTheme === 'dark' ? 'Menu claro' : 'Menu escuro'} onClick={toggleTheme} />
                <RailButton T={T} icon="panel" label="Expandir menu" onClick={() => toggleRail(false)} />
              </>
            ) : (
              <>
                <button onClick={toggleTheme} title={sideTheme === 'dark' ? 'Deixar o menu claro' : 'Deixar o menu escuro'}
                  aria-label={sideTheme === 'dark' ? 'Menu claro' : 'Menu escuro'}
                  className={`h-8 w-8 grid place-items-center rounded-lg transition ${T.tool}`}>
                  <Icon name={sideTheme === 'dark' ? 'sun' : 'moon'} size={16} />
                </button>
                <button onClick={() => toggleRail(true)} title="Recolher o menu" aria-label="Recolher o menu"
                  className={`h-8 w-8 grid place-items-center rounded-lg transition ${T.tool}`}>
                  <Icon name="panel" size={16} />
                </button>
              </>
            )}
          </div>
        </div>
      </aside>

      {/* Menu recolhido: itens do grupo num painel ao lado do ícone */}
      {rail && flyout && (() => {
        const sec = navSections.find(s => s.key === flyout.key);
        if (!sec) return null;
        return (
          <div ref={flyRef} className="hidden lg:block fixed z-50 left-[76px] w-60 rounded-xl bg-white shadow-2xl ring-1 ring-steel-200 py-2 animate-fade-in"
            style={{ top: Math.min(flyout.top - 8, window.innerHeight - 40 - leaves(sec.entries).length * 36) }}>
            <div className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-steel-400">{sec.title}</div>
            {leaves(sec.entries).map(i => (
              <NavLink key={i.to} to={i.to} end={i.to === '/oficina/pecas' || i.to === '/oficina/checkup'} onClick={() => setFlyout(null)}
                className={({ isActive }) => `relative flex items-center gap-2 mx-1.5 px-2.5 h-9 rounded-lg text-[13.5px] transition ${
                  isActive ? 'bg-brand-50 text-steel-900 font-semibold' : 'text-steel-600 hover:bg-steel-100 hover:text-steel-900'}`}>
                <span className="flex-1 truncate">{i.label}</span>
                {badgeOf(i.to) > 0 && <Badge n={badgeOf(i.to)} inline />}
              </NavLink>
            ))}
          </div>
        );
      })()}

      {/* Busca rápida (Ctrl+K / ⌘K): vai direto para qualquer tela liberada */}
      {palette && (
        <CommandPalette onClose={() => setPalette(false)} onGo={to => { setPalette(false); nav(to); }}
          items={[
            ...TOP_ITEMS.map(fix).filter(i => allowed(i.to)).map(i => ({ to: i.to, label: i.label, group: '', icon: 'home' as IconName })),
            ...navSections.flatMap(s => leaves(s.entries).map(i => ({ to: i.to, label: i.label, group: s.title, icon: GROUP_ICON[s.key] ?? 'clipboard' }))),
            ...(allowed('/oficina/avisos') ? [{ to: '/oficina/avisos', label: 'Avisos', group: '', icon: 'bell' as IconName }] : []),
          ]} />
      )}

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

          {wallet.balance && allowed('/oficina/carteira') && <WalletChip total={wallet.balance.total} compact />}

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
        <main className="flex-1 min-w-0 overflow-x-clip p-4 lg:p-8 pb-[calc(84px+env(safe-area-inset-bottom,0px))] lg:pb-8">
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
                  tab.to.includes('?') ? 'text-brand-600' : isActive && !open ? 'text-brand-600' : 'text-steel-400 active:text-steel-600'}`}>
                {({ isActive }) => (
                  <>
                    <span className={`relative grid place-items-center h-7 w-12 rounded-full text-lg leading-none transition-all duration-200 ${
                      tab.to.includes('?') ? 'bg-brand-500 text-white font-bold group-active:scale-90'
                      : isActive && !open ? 'bg-brand-50' : 'grayscale-[35%] opacity-80 group-active:scale-90'}`}>
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
              {(() => {
                const g = sheetGroups.find(x => x.key === sheetGroup);
                if (g) return (
                  <section key={g.key} className="animate-fade-in">
                    <button type="button" onClick={() => setSheetGroup(null)}
                      className="flex items-center gap-1 h-9 -ml-1 pr-3 text-sm font-semibold text-steel-500 active:text-steel-800">
                      <Chev className="rotate-90" /> Voltar
                    </button>
                    <div className="flex items-center gap-2.5 px-1 mt-1 mb-3">
                      <span className="text-2xl leading-none">{SECTION_ICON[g.key] ?? '•'}</span>
                      <h3 className="text-lg font-bold text-steel-900">{g.title}</h3>
                    </div>
                    <ul className="rounded-2xl bg-white ring-1 ring-steel-200/70 divide-y divide-steel-100 overflow-hidden">
                      {g.items.map(i => (
                        <li key={i.to}>
                          <NavLink to={i.to} end={i.to === '/oficina/pecas' || i.to === '/oficina/checkup'} onClick={() => setOpen(false)}
                            className={({ isActive }) => `flex items-center gap-3 px-4 min-h-[56px] py-2.5 transition ${isActive ? 'bg-brand-50' : 'active:bg-steel-50'}`}>
                            {({ isActive }) => (
                              <>
                                <span className={`grid place-items-center h-9 w-9 rounded-xl text-lg shrink-0 ${isActive ? 'bg-brand-500' : 'bg-steel-100'}`}>{i.icon}</span>
                                <span className={`flex-1 min-w-0 truncate text-[15px] font-semibold ${isActive ? 'text-brand-700' : 'text-steel-800'}`}>{i.label}</span>
                                {i.to === '/oficina/mensagens' && unread > 0 && <Badge n={unread} inline />}
                                <Chev className="-rotate-90 text-steel-300" />
                              </>
                            )}
                          </NavLink>
                        </li>
                      ))}
                    </ul>
                  </section>
                );
                return (
                  <div className="grid grid-cols-2 gap-2.5">
                    {sheetGroups.map(x => {
                      const here = x.items.some(i => onRoute(path, i.to));
                      const badge = x.items.some(i => i.to === '/oficina/mensagens') ? unread : 0;
                      return (
                        <button key={x.key} type="button"
                          // Bloco com uma tela só já abre a tela
                          onClick={() => (x.items.length === 1 ? nav(x.items[0].to) : setSheetGroup(x.key))}
                          className={`relative flex flex-col items-start text-left gap-2 min-h-[104px] p-3.5 rounded-2xl transition active:scale-[0.98] ${
                            here ? 'bg-white ring-2 ring-brand-500' : 'bg-white ring-1 ring-steel-200/70'}`}>
                          <span className={`grid place-items-center h-10 w-10 rounded-xl text-[22px] leading-none ${here ? 'bg-brand-50' : 'bg-steel-100'}`}>
                            {SECTION_ICON[x.key] ?? '•'}
                          </span>
                          <span className="min-w-0 w-full">
                            <span className="block text-[15px] font-bold text-steel-900 truncate">{x.title}</span>
                            <span className="block text-[11px] text-steel-500 leading-snug line-clamp-2">
                              {x.items.map(i => i.label).join(' · ')}
                            </span>
                          </span>
                          {badge > 0 && <span className="absolute top-2.5 right-2.5"><Badge n={badge} inline /></span>}
                        </button>
                      );
                    })}
                  </div>
                );
              })()}

              {!sheetGroup && !op.balcao && balcaoOk && (
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
  workshops, current, onSelect, onAddNew, compact = false, light = false,
}: {
  workshops: Workshop[];
  current: Workshop;
  onSelect: (w: Workshop) => void;
  onAddNew: () => void;
  compact?: boolean;
  /** Menu lateral no tema claro */
  light?: boolean;
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
    : light
      ? 'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg bg-steel-50 hover:bg-steel-100 ring-1 ring-steel-200 transition'
      : 'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg bg-white/[0.04] hover:bg-white/[0.07] ring-1 ring-white/[0.08] transition';
  const labelCls = compact ? 'text-xs font-bold text-steel-800' : light ? 'text-[13px] font-semibold text-steel-900' : 'text-[13px] font-semibold text-white';
  const subCls   = compact ? 'text-[9px] text-steel-500' : light ? 'text-[10.5px] text-steel-500' : 'text-[10.5px] text-steel-400';
  const iconCls  = compact || light ? 'text-steel-500' : 'text-steel-400';

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen(o => !o)} className={triggerCls}>
        <Icon name="store" size={16} className={`shrink-0 ${iconCls}`} />
        <div className="flex-1 min-w-0 text-left">
          <div className={`${labelCls} truncate leading-tight`}>{current.business_name}</div>
          {workshops.length > 1 && (
            <div className={`${subCls} truncate leading-tight`}>{current.city}/{current.state}</div>
          )}
        </div>
        <Icon name="chevron" size={14} className={`shrink-0 ${iconCls} transition-transform ${open ? 'rotate-180' : ''}`} />
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

type SideTokens = (typeof SIDE)[SideTheme];

/** Item do grupo: texto sobre a linha-guia; o ativo ganha o filete laranja em cima da linha */
function SideItem({ T, to, label, badge }: { T: SideTokens; to: string; label: string; badge: number }) {
  return (
    <NavLink to={to}
      // Peças e Check-up têm sub-rotas com item próprio no menu
      end={to === '/oficina/pecas' || to === '/oficina/checkup'}
      className={({ isActive }) => `relative flex items-center gap-2 h-8 px-2.5 rounded-md text-[13px] transition ${
        isActive ? `${T.itemActive} font-semibold` : T.item}`}>
      {({ isActive }) => (
        <>
          {isActive && <span className={`absolute -left-[13px] top-1.5 bottom-1.5 w-[2px] rounded-full ${T.bar}`} />}
          <span className="flex-1 truncate">{label}</span>
          {badge > 0 && <Badge n={badge} inline />}
        </>
      )}
    </NavLink>
  );
}

/* ── Submenu (ex.: Check-up → painel / inspeções / histórico / modelos) — abre sozinho quando a tela atual é um dos filhos ── */
function SideSub({ T, label, children, path, badgeOf }: NavSub & {
  T: SideTokens; path: string; badgeOf: (to: string) => number;
}) {
  const hasActive = children.some(c => onRoute(path, c.to));
  const [open, setOpen] = useState(hasActive);
  useEffect(() => { if (hasActive) setOpen(true); }, [hasActive]);
  const isOpen = open || hasActive;
  return (
    <div>
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={isOpen}
        className={`w-full flex items-center gap-2 h-8 px-2.5 rounded-md text-[13px] transition ${hasActive ? `${T.groupOpen} font-semibold` : T.item}`}>
        <span className="flex-1 text-left truncate">{label}</span>
        <Icon name="chevron" size={13} className={`${T.muted} transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen && (
        <div className={`ml-2.5 pl-3 border-l ${T.guide} space-y-px`}>
          {children.map(c => <SideItem key={c.to} T={T} to={c.to} label={c.label} badge={badgeOf(c.to)} />)}
        </div>
      )}
    </div>
  );
}

/** Botão do menu recolhido (só ícone; o nome aparece ao passar o mouse) */
function RailButton({ T, icon, label, active = false, pressed = false, dot = false, onClick }: {
  T: SideTokens; icon: IconName; label: string; active?: boolean; pressed?: boolean; dot?: boolean;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button type="button" data-rail onClick={onClick} title={label} aria-label={label}
      className={`relative w-full h-10 grid place-items-center rounded-lg transition ${active || pressed ? T.itemActive : T.tool}`}>
      {active && <span className={`absolute left-0 top-2.5 bottom-2.5 w-[2px] rounded-full ${T.bar}`} />}
      <Icon name={icon} size={18} className={active ? T.iconActive : ''} />
      {dot && <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-alert-500" />}
    </button>
  );
}

type PaletteItem = { to: string; label: string; group: string; icon: IconName };
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Busca rápida: digite parte do nome da tela; ↑ ↓ para escolher, Enter para abrir */
function CommandPalette({ items, onGo, onClose }: { items: PaletteItem[]; onGo: (to: string) => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const list = useMemo(() => {
    const n = norm(q.trim());
    if (!n) return items;
    return items
      .filter(i => norm(`${i.label} ${i.group}`).includes(n))
      .sort((a, b) => Number(!norm(a.label).startsWith(n)) - Number(!norm(b.label).startsWith(n)));
  }, [q, items]);
  useEffect(() => { setIdx(0); }, [q]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${idx}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [idx]);

  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setIdx(i => Math.min(i + 1, list.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIdx(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (list[idx]) onGo(list[idx].to); }
    else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
  }

  return (
    <div className="fixed inset-0 z-[90] px-4" role="dialog" aria-modal="true" aria-label="Buscar tela">
      <div className="absolute inset-0 bg-steel-900/40 backdrop-blur-[2px] animate-fade-in" onClick={onClose} />
      <div className="relative mx-auto mt-[12vh] max-w-lg rounded-2xl bg-white shadow-2xl ring-1 ring-steel-200 overflow-hidden animate-fade-in">
        <div className="flex items-center gap-3 px-4 h-14 border-b border-steel-100">
          <Icon name="search" size={18} className="text-steel-400 shrink-0" />
          <input autoFocus value={q} onChange={e => setQ(e.target.value)} onKeyDown={onKey}
            placeholder="Para onde você quer ir?"
            className="flex-1 min-w-0 bg-transparent text-[15px] text-steel-900 placeholder:text-steel-400 outline-none" />
          <kbd className="font-mono text-[10px] text-steel-500 bg-steel-100 ring-1 ring-steel-200 rounded px-1.5 py-1">Esc</kbd>
        </div>
        <div ref={listRef} className="max-h-[50vh] overflow-y-auto py-1.5">
          {list.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-steel-500">Nenhuma tela com “{q}”.</div>
          ) : list.map((i, n) => (
            <button key={i.to} data-idx={n} onMouseEnter={() => setIdx(n)} onClick={() => onGo(i.to)}
              className={`w-full flex items-center gap-3 px-3 mx-0 h-11 text-left transition ${n === idx ? 'bg-steel-50' : ''}`}>
              <span className={`ml-1 h-7 w-7 rounded-md grid place-items-center shrink-0 ${n === idx ? 'bg-brand-50 text-brand-600' : 'bg-steel-100 text-steel-500'}`}>
                <Icon name={i.icon} size={15} />
              </span>
              <span className="flex-1 min-w-0 truncate text-sm font-medium text-steel-900">{i.label}</span>
              {i.group && <span className="text-xs text-steel-400 shrink-0">{i.group}</span>}
              <span className={`font-mono text-[11px] w-4 text-steel-400 shrink-0 ${n === idx ? '' : 'invisible'}`}>↵</span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-4 px-4 h-9 border-t border-steel-100 bg-steel-50/70 font-mono text-[10.5px] text-steel-400">
          <span>↑ ↓ navegar</span><span>↵ abrir</span><span>esc fechar</span>
        </div>
      </div>
    </div>
  );
}

/** Setinha (aponta pra baixo; gire com rotate-90 / -rotate-90) */
function Chev({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`h-4 w-4 shrink-0 ${className}`} fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}
