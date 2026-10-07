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
  painel:       { label: 'Painel de vendas',   icon: '📊', desc: 'Faturamento e vendas do dia/mês',               routes: ['/oficina/painel'] },
  os:           { label: 'Ordens de serviço',  icon: '📋', desc: 'Abrir, acompanhar e imprimir OS',               routes: ['/oficina/os'] },
  agenda:       { label: 'Agenda',             icon: '📅', desc: 'Agendamentos da oficina',                       routes: ['/oficina/agenda'] },
  checkup:      { label: 'Check-up',           icon: '🩺', desc: 'Check-up do veículo e orçamento pelo link',     routes: ['/oficina/checkup'] },
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
  { label: 'Atendimento',       keys: ['painel', 'os', 'agenda', 'checkup', 'clientes', 'comercial'] },
  { label: 'Financeiro',        keys: ['caixa', 'financeiro', 'contas_pagar'] },
  { label: 'Estoque e compras', keys: ['pecas', 'compras'] },
  { label: 'Equipe',            keys: ['equipe', 'fechamentos'] },
  { label: 'Plataforma',        keys: ['plataforma'] },
  { label: 'Configurações',     keys: ['servicos', 'acessos', 'importar', 'vip'] },
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

type ModulesState = {
  workshopId: string | null;
  disabled: ModuleKey[];
  loaded: boolean;
  load: (workshopId: string | null) => Promise<void>;
};

export const useWorkshopModules = create<ModulesState>((set, get) => ({
  workshopId: null,
  disabled: [],
  loaded: false,
  async load(workshopId) {
    if (!workshopId) { set({ workshopId: null, disabled: [], loaded: true }); return; }
    if (get().workshopId !== workshopId) set({ workshopId, disabled: [], loaded: false });
    const { data } = await supabase.from('workshop_modules')
      .select('disabled_modules').eq('workshop_id', workshopId).maybeSingle();
    if (get().workshopId !== workshopId) return; // trocou de loja no meio
    set({ disabled: (data?.disabled_modules ?? []) as ModuleKey[], loaded: true });
  },
}));

/** Atalho para as telas: a rota está liberada para a oficina atual? */
export function useModuleAllows() {
  const disabled = useWorkshopModules(s => s.disabled);
  return (path: string) => moduleAllows(disabled, path);
}
