import { ReactNode, useEffect, useRef, useState } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Logo } from '@/components/Logo';
import { supabase } from '@/lib/supabase';
import type { Workshop } from '@/types/database';

interface NavItem  { to: string; icon: string; label: string }
interface SoonItem { icon: string; label: string; desc: string }
interface SoonDept { dept: string; items: SoonItem[] }

const PLATAFORMA: NavItem[] = [
  { to: '/oficina/dashboard',  icon: '⚡', label: 'Demandas'         },
  { to: '/oficina/buscar',     icon: '🔍', label: 'Buscar mecânicos' },
  { to: '/oficina/mensagens',  icon: '💬', label: 'Mensagens'        },
];

const GESTAO: NavItem[] = [
  { to: '/oficina/os',       icon: '📋', label: 'Ordens de Serviço' },
  { to: '/oficina/clientes', icon: '👥', label: 'Clientes'           },
  { to: '/oficina/perfil',   icon: '🏪', label: 'Perfil da oficina'  },
];

// Todos os módulos premium agrupados por departamento
const ADVANCED: SoonDept[] = [
  {
    dept: '👥 RH & Pessoal',
    items: [
      { icon: '🪪', label: 'Funcionários',    desc: 'Cadastro, docs e histórico'     },
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
  { to: '/oficina/dashboard',  icon: '⚡', label: 'Demandas'  },
  { to: '/oficina/mensagens',  icon: '💬', label: 'Mensagens' },
  { to: '/oficina/os',         icon: '📋', label: 'OS'        },
  { to: '/oficina/perfil',     icon: '🏪', label: 'Perfil'    },
];

const LS_KEY = 'oficina_msgs_last_seen';

export default function WorkshopLayout({ children }: { children: ReactNode }) {
  const { signOut, profile, user, workshops, currentWorkshop, setCurrentWorkshop } = useAuth();
  const nav      = useNavigate();
  const location = useLocation();
  const [open, setOpen]         = useState(false);
  const [unread, setUnread]     = useState(0);

  const shopId = currentWorkshop?.id ?? null;

  const firstName = profile?.full_name?.split(' ')[0] ?? 'Oficina';
  const initials  = (profile?.full_name ?? 'O')
    .split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();

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

  return (
    <div className="min-h-screen flex bg-steel-50">

      {/* Overlay mobile */}
      {open && (
        <div className="fixed inset-0 bg-steel-900/60 z-30 lg:hidden" onClick={() => setOpen(false)} />
      )}

      {/* ── Sidebar ── */}
      <aside className={`
        fixed top-0 left-0 h-full w-64 bg-steel-900 text-white z-40 flex flex-col
        transition-transform duration-300
        ${open ? 'translate-x-0' : '-translate-x-full'}
        lg:translate-x-0 lg:static lg:z-auto lg:shrink-0
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
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-6">
          <div>
            <div className="text-[10px] font-bold text-steel-500 uppercase tracking-widest px-3 mb-2">
              Plataforma
            </div>
            <div className="space-y-0.5">
              {PLATAFORMA.map(item => (
                <SideItem
                  key={item.to}
                  {...item}
                  badge={item.to === '/oficina/mensagens' ? unread : 0}
                  onClick={() => setOpen(false)}
                />
              ))}
            </div>
          </div>

          <div>
            <div className="text-[10px] font-bold text-steel-500 uppercase tracking-widest px-3 mb-2">
              Gestão da oficina
            </div>
            <div className="space-y-0.5">
              {GESTAO.map(item => (
                <SideItem key={item.to} {...item} badge={0} onClick={() => setOpen(false)} />
              ))}
            </div>
          </div>

          {/* ── Gestão Avançada (upgrade) ── */}
          <AdvancedSection />
        </nav>

        {/* User footer */}
        <div className="border-t border-steel-800 p-4">
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
        <div className="grid grid-cols-4 h-16">
          {BOTTOM_TABS.map(tab => (
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
          <div className="mx-1 mt-2 bg-brand-500/10 border border-brand-500/20 rounded-xl px-3 py-2.5 text-center">
            <div className="text-[10px] font-bold text-brand-400 uppercase tracking-wider">Quer acesso?</div>
            <div className="text-[9px] text-steel-500 mt-0.5">Fale com nosso time para fazer upgrade</div>
          </div>
        </div>
      )}
    </div>
  );
}
