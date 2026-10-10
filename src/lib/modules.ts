import { create } from 'zustand';
import { supabase } from '@/lib/supabase';

/* ── Módulos da oficina (liberados por oficina no superadmin) ─────────────── */

export type ModuleKey =
  | 'painel' | 'os' | 'agenda' | 'checkup' | 'clientes' | 'comercial' | 'inbox' | 'avaliacoes' | 'agentes'
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
  inbox:        { label: 'WhatsApp (Inbox)',   icon: '💬', desc: 'Número da oficina conectado: conversas com os clientes', routes: ['/oficina/inbox'] },
  avaliacoes:   { label: 'Avaliações no Google', icon: '⭐', desc: 'Fila de pedidos de avaliação enviados pelo WhatsApp após a OS', routes: ['/oficina/avaliacoes'] },
  agentes:      { label: 'Agentes de IA',      icon: '🤖', desc: 'Sócio operacional: converse com a IA sobre os números da oficina (só o dono)', routes: ['/oficina/agentes'] },
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
  { label: 'Atendimento',       keys: ['painel', 'os', 'agenda', 'clientes', 'comercial', 'inbox', 'avaliacoes', 'agentes'] },
  { label: 'Check-up',          keys: ['checkup'] },
  { label: 'Financeiro',        keys: ['caixa', 'financeiro', 'contas_pagar'] },
  { label: 'Estoque e compras', keys: ['pecas', 'compras'] },
  { label: 'Equipe',            keys: ['equipe', 'fechamentos', 'acessos'] },
  { label: 'Plataforma',        keys: ['plataforma'] },
  { label: 'Configurações',     keys: ['servicos', 'importar', 'vip'] },
];

export const MODULE_KEYS = Object.keys(MODULES) as ModuleKey[];

/** Módulos opcionais: nascem desligados e o superadmin liga só para as oficinas escolhidas
 *  (ficam em workshop_modules.enabled_modules; o resto continua "ligado até desligar"). */
export const OPT_IN_MODULES: readonly ModuleKey[] = ['inbox', 'avaliacoes', 'agentes'];
export const isOptIn = (k: string) => (OPT_IN_MODULES as readonly string[]).includes(k);

/* ── Ferramentas dentro de cada módulo ────────────────────────────────────────
   Chave `modulo.ferramenta`, guardada nas mesmas listas dos módulos (desligado
   em tudo / só no celular). Ferramenta com `routes` é bloqueada pelo endereço
   (menu, abas e redirecionamento já respeitam); sem `routes`, a própria tela
   consulta com useFeature('modulo.ferramenta').
   Rota: prefixo; `*` = um trecho qualquer (id); `$` no fim = só o endereço exato. */

export type Feature = { key: string; label: string; desc?: string; routes?: string[] };

export const FEATURES: Partial<Record<ModuleKey, Feature[]>> = {
  painel: [
    { key: 'painel.vendas',    label: 'Painel de vendas', routes: ['/oficina/painel'] },
    { key: 'painel.resultado', label: 'Resultado (gestor no celular)', routes: ['/oficina/resultado'] },
  ],
  os: [
    { key: 'os.imprimir', label: 'Imprimir / PDF',          routes: ['/oficina/os/*/imprimir'] },
    { key: 'os.whatsapp', label: 'Enviar pelo WhatsApp',    desc: 'Orçamento, resumo e comprovante' },
    { key: 'os.agendar',  label: 'Agendar serviço' },
  ],
  checkup: [
    { key: 'checkup.painel',    label: 'Painel',    routes: ['/oficina/checkup$'] },
    { key: 'checkup.inspecoes', label: 'Inspeções', routes: ['/oficina/checkup/inspecoes'] },
    { key: 'checkup.historico', label: 'Histórico', routes: ['/oficina/checkup/historico'] },
    { key: 'checkup.modelos',   label: 'Modelos',   routes: ['/oficina/checkup/modelos'] },
  ],
  caixa: [
    { key: 'caixa.vender',     label: 'Vender peças (PDV)' },
    { key: 'caixa.receber',    label: 'Receber OS' },
    { key: 'caixa.movimentos', label: 'Movimentações', desc: 'Vales, despesas e sangrias' },
    { key: 'caixa.fechar',     label: 'Fechar caixa' },
  ],
  financeiro: [
    { key: 'financeiro.geral',   label: 'Visão geral' },
    { key: 'financeiro.receber', label: 'OS a receber' },
  ],
  pecas: [
    { key: 'pecas.painel',   label: 'Painel do estoque', routes: ['/oficina/pecas/painel'] },
    { key: 'pecas.catalogo', label: 'Catálogo de peças', routes: ['/oficina/pecas$'] },
  ],
  compras: [
    { key: 'compras.notas',        label: 'Notas de compra', routes: ['/oficina/compras'] },
    { key: 'compras.fornecedores', label: 'Fornecedores',    routes: ['/oficina/fornecedores'] },
  ],
  equipe: [
    { key: 'equipe.colaboradores', label: 'Colaboradores', routes: ['/oficina/equipe'] },
    { key: 'equipe.desempenho',    label: 'Desempenho',    routes: ['/oficina/desempenho'] },
  ],
  fechamentos: [
    { key: 'fechamentos.comissoes', label: 'Fechar comissões', routes: ['/oficina/comissoes'] },
    { key: 'fechamentos.folha',     label: 'Fechar folha',     routes: ['/oficina/folha'] },
  ],
  plataforma: [
    { key: 'plataforma.demandas',  label: 'Demandas',         routes: ['/oficina/dashboard'] },
    { key: 'plataforma.buscar',    label: 'Buscar mecânicos', routes: ['/oficina/buscar'] },
    { key: 'plataforma.mensagens', label: 'Mensagens',        routes: ['/oficina/mensagens'] },
    { key: 'plataforma.rastreio',  label: 'Rastreio do serviço', routes: ['/oficina/job'] },
  ],
};

const ALL_FEATURES: (Feature & { module: ModuleKey })[] = MODULE_KEYS.flatMap(m =>
  (FEATURES[m] ?? []).map(f => ({ ...f, module: m })));

const onRoute = (path: string, r: string) => path === r || path.startsWith(`${r}/`);

/** Casa a rota com a regra (prefixo, `*` = um trecho, `$` = exato) */
function matchRoute(path: string, rule: string) {
  const exact = rule.endsWith('$');
  const parts = (exact ? rule.slice(0, -1) : rule).split('/');
  const segs = path.replace(/\/$/, '').split('/');
  if (exact ? segs.length !== parts.length : segs.length < parts.length) return false;
  return parts.every((p, i) => p === '*' || p === segs[i]);
}

/** Módulo dono da rota (ou null = tela sempre liberada: Início, Perfil, Avisos…) */
export function moduleOf(path: string): ModuleKey | null {
  return MODULE_KEYS.find(k => MODULES[k].routes.some(r => onRoute(path, r))) ?? null;
}

/** A rota está liberada com esses módulos/ferramentas desligados? */
export function moduleAllows(disabled: readonly string[], path: string) {
  const m = moduleOf(path);
  if (m && disabled.includes(m)) return false;
  return !ALL_FEATURES.some(f => disabled.includes(f.key) && f.routes?.some(r => matchRoute(path, r)));
}

/** Endereço alternativo quando a tela pedida foi desligada mas o módulo tem outra ferramenta liberada
 *  (ex.: Painel do check-up desligado → abre direto o Histórico). null = nenhuma. */
export function moduleEntry(disabled: readonly string[], path: string): string | null {
  if (moduleAllows(disabled, path)) return path;
  const m = moduleOf(path);
  if (!m || disabled.includes(m)) return null;
  for (const f of FEATURES[m] ?? []) {
    for (const r of f.routes ?? []) {
      const to = r.replace(/\$$/, '');
      if (!to.includes('*') && moduleAllows(disabled, to)) return to;
    }
  }
  return null;
}

/* ── Store: módulos desligados da oficina atual ──────────────────────────── */

/** Celular/tablet = a mesma largura em que o menu vira barra inferior (abaixo do `lg` do Tailwind) */
const MOBILE_QUERY = '(max-width: 1023px)';
const isMobileNow = () => typeof window !== 'undefined' && window.matchMedia(MOBILE_QUERY).matches;

type ModulesState = {
  workshopId: string | null;
  /** Desligados em qualquer aparelho */
  off: string[];
  /** Desligados só no celular/tablet */
  mobileOff: string[];
  /** Módulos opcionais ligados para a oficina */
  enabled: string[];
  isMobile: boolean;
  /** O que vale neste aparelho (é o que as telas consultam) */
  disabled: string[];
  loaded: boolean;
  load: (workshopId: string | null) => Promise<void>;
};

/** Opcional não ligado conta como desligado */
const withOptIn = (off: string[], enabled: string[]) =>
  [...off, ...OPT_IN_MODULES.filter(k => !enabled.includes(k) && !off.includes(k))];

const effective = (off: string[], mobileOff: string[], isMobile: boolean) =>
  isMobile ? [...new Set([...off, ...mobileOff])] : off;

export const useWorkshopModules = create<ModulesState>((set, get) => ({
  workshopId: null,
  off: [],
  mobileOff: [],
  enabled: [],
  isMobile: isMobileNow(),
  disabled: [],
  loaded: false,
  async load(workshopId) {
    if (!workshopId) { set({ workshopId: null, off: [], mobileOff: [], enabled: [], disabled: [], loaded: true }); return; }
    if (get().workshopId !== workshopId) set({ workshopId, off: [], mobileOff: [], enabled: [], disabled: [], loaded: false });
    const { data } = await supabase.from('workshop_modules')
      .select('disabled_modules, mobile_disabled_modules, enabled_modules').eq('workshop_id', workshopId).maybeSingle();
    if (get().workshopId !== workshopId) return; // trocou de loja no meio
    const enabled = (data?.enabled_modules ?? []) as string[];
    const off = withOptIn((data?.disabled_modules ?? []) as string[], enabled);
    const mobileOff = (data?.mobile_disabled_modules ?? []) as string[];
    set({ off, mobileOff, enabled, disabled: effective(off, mobileOff, get().isMobile), loaded: true });
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

/** Ferramenta liberada para a oficina atual (neste aparelho)? Ex.: useFeature()('caixa.fechar') */
export function useFeature() {
  const disabled = useWorkshopModules(s => s.disabled);
  return (key: string) => !disabled.includes(key) && !disabled.includes(key.split('.')[0]);
}
