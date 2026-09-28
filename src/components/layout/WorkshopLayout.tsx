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
import { ROLES, sessionAllows, useOperator } from '@/lib/operators';
import OperatorLock from '@/components/operator/OperatorLock';

type ArrivalAlert = { jobId: string; title: string };
type FinishedAlert = { jobId: string; title: string; price: number };
type EnRouteAlert = { jobId: string; title: string };

interface NavItem  { to: string; icon: string; label: string }
interface SoonItem { icon: string; label: string; desc: string }
interface SoonDept { dept: string; items: SoonItem[] }

/** Menu organizado por departamento: cada área com o que é dela */
const SECTIONS: { title: string; items: NavItem[] }[] = [
  { title: 'Vendas', items: [
    { to: '/oficina/painel',     icon: '📊', label: 'Painel de vendas'     },
    { to: '/oficina/clientes',   icon: '👥', label: 'Clientes'             },
  ] },
  { title: 'Financeiro', items: [
    { to: '/oficina/caixa',      icon: '💰', label: 'Caixa'                },
    { to: '/oficina/financeiro', icon: '💵', label: 'Financeiro'           },
  ] },
  { title: 'Operação', items: [
    { to: '/oficina/os',         icon: '📋', label: 'Ordens de Serviço'    },
    { to: '/oficina/checkup',    icon: '🩺', label: 'Check-up'             },
    { to: '/oficina/importar',   icon: '📷', label: 'Importar orçamentos'  },
  ] },
  { title: 'Equipe', items: [
    { to: '/oficina/equipe',     icon: '👷', label: 'Colaboradores'        },
    { to: '/oficina/desempenho', icon: '🏆', label: 'Desempenho e comissões' },
    { to: '/oficina/acessos',    icon: '🔐', label: 'Acessos e funções'    },
  ] },
  { title: 'Plataforma', items: [
    { to: '/oficina/dashboard',  icon: '⚡', label: 'Demandas'             },
    { to: '/oficina/buscar',     icon: '🔍', label: 'Buscar mecânicos'     },
    { to: '/oficina/mensagens',  icon: '💬', label: 'Mensagens'            },
    { to: '/oficina/avisos',     icon: '🔔', label: 'Avisos'               },
  ] },
  { title: 'Oficina', items: [
    { to: '/oficina/perfil',     icon: '🏪', label: 'Perfil e vitrine'     },
    { to: '/oficina/vip',        icon: '⭐', label: 'Plano VIP'            },
  ] },
];

// Gestão Avançada oculta por enquanto — mudar para true quando for retomar o módulo
const SHOW_ADVANCED = false;

// Todos os módulos premium agrupados por departamento
const ADVANCED: SoonDept[] = [
  {
    dept: '🚀 Captação & Inteligência',
    items: [
      { icon: '🔍', label: 'Check-up Premium', desc: 'Captação gratuita + banco de OS' },
      { icon: '🤖', label: 'Análise com IA',   desc: 'Insights automáticos do negócio' },
    ],
  },
  {
    dept: '👥 RH & Pessoal',
    items: [
      { icon: '💵', label: 'Folha de Salário', desc: 'Pagamentos e holerites'         },
      { icon: '%',  label: 'Comissões',        desc: 'Metas, bonificações e ranking'  },
      { icon: '📆', label: 'Ponto Digital',    desc: 'Controle de jornada'            },
    ],
  },
  {
    dept: '💰 Financeiro',
    items: [
      { icon: '📊', label: 'DRE & Caixa',     desc: 'Receitas, despesas, lucro'      },
      { icon: '🧾', label: 'NF-e / Fiscal',   desc: 'Emissão de notas fiscais'       },
      { icon: '💳', label: 'Contas a Receber', desc: 'Cobranças e inadimplência'      },
      { icon: '🏦', label: 'Contas a Pagar',   desc: 'Fornecedores e vencimentos'     },
    ],
  },
  {
    dept: '⚙️ Operações',
    items: [
      { icon: '📅', label: 'Agenda Online',    desc: 'Agendamento pelo cliente'       },
      { icon: '📌', label: 'POPs',             desc: 'Proc. Operacionais Padrão'      },
      { icon: '🗂️', label: 'Garantias',        desc: 'Controle de garantia de peças'  },
      { icon: '🖨️', label: 'OS Impressa',      desc: 'PDF e assinatura digital'       },
    ],
  },
  {
    dept: '📦 Estoque & Compras',
    items: [
      { icon: '📦', label: 'Estoque',          desc: 'Peças, insumos e alertas'       },
      { icon: '🛒', label: 'Pedidos',          desc: 'Compras a fornecedores'         },
    ],
  },
  {
    dept: '⭐ CRM & Marketing',
    items: [
      { icon: '⭐', label: 'NPS & Avaliações', desc: 'Reputação e feedback'           },
      { icon: '🎁', label: 'Fidelidade',       desc: 'Pontos e promoções'             },
      { icon: '📲', label: 'Campanhas',        desc: 'WhatsApp e notificações'        },
      { icon: '📈', label: 'Relatórios',       desc: 'BI e indicadores de gestão'     },
    ],
  },
];

const BOTTOM_TABS: NavItem[] = [
  { to: '/oficina/painel',     icon: '📊', label: 'Vendas'    },
  { to: '/oficina/os',         icon: '📋', label: 'OS'        },
  { to: '/oficina/caixa',      icon: '💰', label: 'Caixa'     },
  { to: '/oficina/dashboard',  icon: '⚡', label: 'Demandas'  },
  { to: '/oficina/mensagens',  icon: '💬', label: 'Mensagens' },
];

const LS_KEY = 'oficina_msgs_last_seen';

export default function WorkshopLayout({ children }: { children: ReactNode }) {
  const { signOut, profile, user, workshops, currentWorkshop, setCurrentWorkshop } = useAuth();
  const nav      = useNavigate();
  const location = useLocation();
  const [open, setOpen]         = useState(false);
  const [unread, setUnread]     = useState(0);
  const unreadNotif = useUnreadNotifications();

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
  const allowed = (to: string) => !role || sessionAllows(op.session!, to);

  /* Tela fora da função → volta pra tela inicial da função */
  useEffect(() => {
    if (role && !sessionAllows(op.session!, location.pathname)) nav(ROLES[role].home, { replace: true });
  }, [role, location.pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  async function enterBalcao() {
    if (!shopId) return;
    const { count } = await supabase.from('workshop_operators')
      .select('id', { count: 'exact', head: true })
      .eq('workshop_id', shopId).eq('active', true).eq('has_pin', true).contains('roles', ['gestor']);
    if (!count) {
      toast.warning('Antes, cadastre o seu PIN de gestor em Acessos e funções.');
      nav('/oficina/acessos');
      setOpen(false);
      return;
    }
    op.enterBalcao();
    setOpen(false);
  }

  if (op.balcao && !op.session && op.wid === shopId) return <OperatorLock />;

  const bottomTabs = BOTTOM_TABS.filter(t => allowed(t.to));

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

      {/* Overlay mobile */}
      {open && (
        <div className="fixed inset-0 bg-steel-900/60 z-30 lg:hidden" onClick={() => setOpen(false)} />
      )}

      {/* ── Sidebar ── */}
      <aside className={`
        fixed top-0 left-0 h-full w-64 bg-steel-900 text-white z-40 flex flex-col
        transition-transform duration-300
        ${open ? 'translate-x-0' : '-translate-x-full'}
        lg:translate-x-0 lg:sticky lg:top-0 lg:h-screen lg:z-auto lg:shrink-0
      `}>

        {/* Logo */}
        <div className="px-5 py-5 border-b border-steel-800">
          <Logo light />
        </div>

        {/* Seletor de oficina */}
        {currentWorkshop && (
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
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-4">
          {SECTIONS.filter(sec => sec.items.some(i => allowed(i.to))).map(sec => (
            <div key={sec.title}>
              <div className="text-[10px] font-bold text-steel-500 uppercase tracking-widest px-3 mb-1.5">
                {sec.title}
              </div>
              <div className="space-y-0.5">
                {sec.items.filter(i => allowed(i.to)).map(item => (
                  <SideItem
                    key={item.to}
                    {...item}
                    badge={item.to === '/oficina/mensagens' ? unread : item.to === '/oficina/avisos' ? unreadNotif : 0}
                    onClick={() => setOpen(false)}
                  />
                ))}
              </div>
            </div>
          ))}

          {/* ── Gestão Avançada (upgrade) ── */}
          {SHOW_ADVANCED && !role && <AdvancedSection />}
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

        {/* Topbar mobile */}
        <header className="lg:hidden sticky top-0 z-20 bg-white border-b border-steel-200 flex items-center gap-2 px-3 h-14 shrink-0">
          <button
            onClick={() => setOpen(true)}
            className="h-10 w-10 rounded-xl bg-steel-100 grid place-items-center shrink-0"
            aria-label="Menu"
          >
            <svg className="w-5 h-5 text-steel-700" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          {/* Switcher mobile (ocupa o espaço central) */}
          {currentWorkshop ? (
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

          {/* Avatar + badge mobile no topo */}
          <div className="relative shrink-0">
            <div className="h-9 w-9 rounded-full bg-brand-500 grid place-items-center text-white font-bold text-sm">
              {initials}
            </div>
            {unread > 0 && (
              <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-red-500 text-white text-[9px] font-bold grid place-items-center">
                {unread > 9 ? '9+' : unread}
              </span>
            )}
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-4 lg:p-8 pb-24 lg:pb-8">
          {children}
        </main>
      </div>

      {/* ── Bottom tab bar (mobile only) ── */}
      <nav className="fixed bottom-0 inset-x-0 bg-white border-t border-steel-200 z-20 lg:hidden safe-area-inset-bottom">
        <div className="grid h-16" style={{ gridTemplateColumns: `repeat(${Math.max(bottomTabs.length, 1)}, minmax(0, 1fr))` }}>
          {bottomTabs.map(tab => (
            <NavLink
              key={tab.to}
              to={tab.to}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center gap-0.5 text-[10px] font-semibold transition-colors relative ${
                  isActive ? 'text-brand-500' : 'text-steel-400'
                }`
              }
            >
              <span className="relative text-xl leading-none">
                {tab.icon}
                {tab.to === '/oficina/mensagens' && unread > 0 && (
                  <span className="absolute -top-1 -right-2 h-4 w-4 rounded-full bg-red-500 text-white text-[9px] font-bold grid place-items-center">
                    {unread > 9 ? '9+' : unread}
                  </span>
                )}
              </span>
              <span>{tab.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
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

function SideItem({ to, icon, label, badge, onClick }: NavItem & { badge: number; onClick: () => void }) {
  return (
    <NavLink
      to={to}
      onClick={onClick}
      className={({ isActive }) => `
        flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition-all
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

/* ── Gestão Avançada — acordeão colapsável ── */
function AdvancedSection() {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-2">
      {/* Botão cabeçalho */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition-all select-none
          ${open
            ? 'bg-brand-500/15 text-brand-300'
            : 'text-steel-400 hover:bg-steel-800 hover:text-steel-200'
          }`}
      >
        <span className="text-base w-5 text-center">🚀</span>
        <div className="flex-1 text-left">
          <div className="text-sm font-semibold leading-none">Gestão Avançada</div>
          <div className="text-[10px] text-steel-500 mt-0.5">Módulos premium</div>
        </div>
        <span className="text-[9px] font-bold bg-brand-500/25 text-brand-400 px-1.5 py-0.5 rounded-full uppercase tracking-wide shrink-0">
          Upgrade
        </span>
        <span className={`text-steel-500 text-xs transition-transform duration-200 ${open ? 'rotate-180' : ''}`}>
          ▼
        </span>
      </button>

      {/* Conteúdo colapsável */}
      {open && (
        <div className="mt-1 ml-2 border-l border-steel-700 pl-3 space-y-4 py-2">
          {ADVANCED.map(dept => (
            <div key={dept.dept}>
              <div className="text-[9px] font-bold text-steel-600 uppercase tracking-widest mb-1.5 px-1">
                {dept.dept}
              </div>
              <div className="space-y-0.5">
                {dept.items.map(item => (
                  <div key={item.label}
                    className="flex items-center gap-2.5 px-2 py-2 rounded-lg cursor-not-allowed select-none opacity-45 hover:opacity-60 transition-opacity">
                    <span className="text-sm w-4 text-center text-steel-500">{item.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-steel-400 leading-none">{item.label}</div>
                      <div className="text-[9px] text-steel-600 mt-0.5 truncate">{item.desc}</div>
                    </div>
                    <span className="text-steel-700 text-[10px] shrink-0">🔒</span>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* CTA upgrade */}
          <NavLink to="/oficina/vip"
            className="block mx-1 mt-2 bg-brand-500/10 border border-brand-500/20 hover:bg-brand-500/20 rounded-xl px-3 py-2.5 text-center transition">
            <div className="text-[10px] font-bold text-brand-400 uppercase tracking-wider">⭐ Quer acesso?</div>
            <div className="text-[9px] text-steel-400 mt-0.5">Solicite o plano VIP — nosso time entra em contato</div>
          </NavLink>
        </div>
      )}
    </div>
  );
}
