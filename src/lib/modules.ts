import { create } from 'zustand';
import { supabase } from '@/lib/supabase';

/* ── Módulos da oficina (liberados por oficina no superadmin) ─────────────── */

export type ModuleKey =
  | 'painel' | 'os' | 'agenda' | 'checkup' | 'clientes' | 'comercial'
  | 'caixa' | 'financeiro' | 'contas_pagar'
  | 'pecas' | 'compras'
  | 'equipe' | 'fechamentos'
  | 'plataforma'
  | 'servicos' | 'acessos' | 'importar' | 'vip';

export const MODULES: Record<ModuleKey, {
  label: string; icon: string; desc: string;
  /** Telas do módulo (prefixo de rota) */
  routes: string[];
}> = {
  painel:       { label: 'Painel de vendas',   icon: '📊', desc: 'Faturamento e vendas do dia/mês',               routes: ['/oficina/painel', '/oficina/resultado'] },
  os:           { label: 'Ordens de serviço',  icon: '📋', desc: 'Abrir, acompanhar e imprimir OS',               routes: ['/oficina/os'] },
  agenda:       { label: 'Agenda',             icon: '📅', desc: 'Agendamentos da oficina',                       routes: ['/oficina/agenda'] },
  checkup:      { label: 'Check-up',           icon: '🩺', desc: 'Painel, inspeções, histórico e orçamento pelo link', routes: ['/oficina/checkup'] },
  clientes:     { label: 'Clientes',           icon: '👥', desc: 'Cadastro e ficha dos clientes',                 routes: ['/oficina/clientes'] },
  comercial:    { label: 'Comercial',          icon: '🤝', desc: 'Mesa comercial: retorno de orçamentos',         routes: ['/oficina/comercial'] },
  caixa:        { label: 'Caixa',              icon: '💰', desc: 'Abrir/fechar caixa, receber OS, PDV balcão',    routes: ['/oficina/caixa'] },
  financeiro:   { label: 'Visão financeira',   icon: '💵', desc: 'Resultado do mês, a receber',                   routes: ['/oficina/financeiro'] },
  contas_pagar: { label: 'Contas a pagar',     icon: '📤', desc: 'Lançar e dar baixa em contas',                  routes: ['/oficina/contas-a-pagar'] },
  pecas:        { label: 'Peças e estoque',    icon: '🔩', desc: 'Catálogo, estoque e custo das peças',           routes: ['/oficina/pecas'] },
  compras:      { label: 'Compras e fornecedores', icon: '🧾', desc: 'Notas de compra e fornecedores',            routes: ['/oficina/compras', '/oficina/fornecedores'] },
  equipe:       { label: 'Equipe e desempenho', icon: '👷', desc: 'Colaboradores, desempenho e comissões',        routes: ['/oficina/equipe', '/oficina/desempenho'] },
  fechamentos:  { label: 'Fechamentos',        icon: '🧮', desc: 'Fechar comissões e folha',                      routes: ['/oficina/comissoes', '/oficina/folha'] },
  plataforma:   { label: 'Plataforma (mecânicos)', icon: '⚡', desc: 'Demandas, buscar mecânicos, mensagens, rastreio', routes: ['/oficina/dashboard', '/oficina/buscar', '/oficina/mensagens', '/oficina/job'] },
  servicos:     { label: 'Tabela de serviços', icon: '🛠️', desc: 'Preços e serviços padrão',                       routes: ['/oficina/servicos'] },
  acessos:      { label: 'Acessos e modo balcão', icon: '🔐', desc: 'PIN dos colaboradores e funções',            routes: ['/oficina/acessos'] },
  importar:     { label: 'Importar notas antigas', icon: '📷', desc: 'Importar notas/orçamentos por foto',        routes: ['/oficina/importar'] },
  vip:          { label: 'Plano VIP',          icon: '⭐', desc: 'Página do plano VIP',                           routes: ['/oficina/vip'] },
};

/** Agrupado como no menu da oficina, para a tela do superadmin */
export const MODULE_GROUPS: { label: string; keys: ModuleKey[] }[] = [
  { label: 'Atendimento',       keys: ['painel', 'os', 'agenda', 'clientes', 'comercial'] },
  { label: 'Check-up',          keys: ['checkup'] },
  { label: 'Financeiro',        keys: ['caixa', 'financeiro', 'contas_pagar'] },
  { label: 'Estoque e compras', keys: ['pecas', 'compras'] },
  { label: 'Equipe',            keys: ['equipe', 'fechamentos', 'acessos'] },
  { label: 'Plataforma',        keys: ['plataforma'] },
  { label: 'Configurações',     keys: ['servicos', 'importar', 'vip'] },
];

export const MODULE_KEYS = Object.keys(MODULES) as ModuleKey[];

const onRoute = (path: string, r: string) => path === r || path.startsWith(`${r}/`);

/** Módulo dono da rota (ou null = tela sempre liberada: Início, Perfil, Avisos…) */
export function moduleOf(path: string): ModuleKey | null {
  return MODULE_KEYS.find(k => MODULES[k].routes.some(r => onRoute(path, r))) ?? null;
}

/** A rota está liberada com esses módulos desligados? */
export function moduleAllows(disabled: readonly string[], path: string) {
  const m = moduleOf(path);
  return !m || !disabled.includes(m);
}

/* ── Store: módulos desligados da oficina atual ──────────────────────────── */

/** Celular/tablet = a mesma largura em que o menu vira barra inferior (abaixo do `lg` do Tailwind) */
const MOBILE_QUERY = '(max-width: 1023px)';
const isMobileNow = () => typeof window !== 'undefined' && window.matchMedia(MOBILE_QUERY).matches;

type ModulesState = {
  workshopId: string | null;
  /** Desligados em qualquer aparelho */
  off: ModuleKey[];
  /** Desligados só no celular/tablet */
  mobileOff: ModuleKey[];
  isMobile: boolean;
  /** O que vale neste aparelho (é o que as telas consultam) */
  disabled: ModuleKey[];
  loaded: boolean;
  load: (workshopId: string | null) => Promise<void>;
};

const effective = (off: ModuleKey[], mobileOff: ModuleKey[], isMobile: boolean) =>
  isMobile ? [...new Set([...off, ...mobileOff])] : off;

export const useWorkshopModules = create<ModulesState>((set, get) => ({
  workshopId: null,
  off: [],
  mobileOff: [],
  isMobile: isMobileNow(),
  disabled: [],
  loaded: false,
  async load(workshopId) {
    if (!workshopId) { set({ workshopId: null, off: [], mobileOff: [], disabled: [], loaded: true }); return; }
    if (get().workshopId !== workshopId) set({ workshopId, off: [], mobileOff: [], disabled: [], loaded: false });
    const { data } = await supabase.from('workshop_modules')
      .select('disabled_modules, mobile_disabled_modules').eq('workshop_id', workshopId).maybeSingle();
    if (get().workshopId !== workshopId) return; // trocou de loja no meio
    const off = (data?.disabled_modules ?? []) as ModuleKey[];
    const mobileOff = (data?.mobile_disabled_modules ?? []) as ModuleKey[];
    set({ off, mobileOff, disabled: effective(off, mobileOff, get().isMobile), loaded: true });
  },
}));

// Girar o tablet / redimensionar a janela troca o que vale na hora
if (typeof window !== 'undefined') {
  window.matchMedia(MOBILE_QUERY).addEventListener('change', e => {
    const { off, mobileOff } = useWorkshopModules.getState();
    useWorkshopModules.setState({ isMobile: e.matches, disabled: effective(off, mobileOff, e.matches) });
  });
}

/** Atalho para as telas: a rota está liberada para a oficina atual? */
export function useModuleAllows() {
  const disabled = useWorkshopModules(s => s.disabled);
  return (path: string) => moduleAllows(disabled, path);
}
