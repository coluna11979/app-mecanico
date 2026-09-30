import { create } from 'zustand';
import { supabase } from '@/lib/supabase';

/* ── Funções e permissões ─────────────────────────────────────────────────── */

export type OperatorRole = 'gestor' | 'caixa' | 'atendente' | 'mecanico';
export type OperatorPerm =
  | 'dar_desconto' | 'cancelar_recebimento' | 'reabrir_caixa'
  | 'ver_financeiro' | 'contas_pagar' | 'compras' | 'pecas_estoque' | 'folha' | 'equipe';

export type WorkshopOperator = {
  id: string; workshop_id: string; mechanic_id: string | null; name: string;
  is_owner: boolean; roles: OperatorRole[]; permissions: OperatorPerm[];
  active: boolean; has_pin: boolean; created_at: string; updated_at: string;
};

export const ROLES: Record<OperatorRole, {
  label: string; icon: string; desc: string;
  /** Telas liberadas (prefixo de rota). `null` = todas. */
  routes: string[] | null;
  home: string;
}> = {
  gestor: {
    label: 'Gestor', icon: '👔', desc: 'Acesso completo: financeiro, equipe, acessos e configurações.',
    routes: null, home: '/oficina/painel',
  },
  caixa: {
    label: 'Caixa', icon: '💰', desc: 'Abre e fecha o caixa, recebe as OS, lança vales, despesas e sangrias.',
    routes: ['/oficina/caixa', '/oficina/os', '/oficina/agenda', '/oficina/checkup', '/oficina/importar', '/oficina/clientes',
             '/oficina/dashboard', '/oficina/buscar', '/oficina/job', '/oficina/mensagens', '/oficina/avisos'], home: '/oficina/caixa',
  },
  atendente: {
    label: 'Atendente', icon: '🧑‍💼', desc: 'Abre e acompanha OS, cadastra clientes e responde mensagens.',
    routes: ['/oficina/dashboard', '/oficina/os', '/oficina/agenda', '/oficina/checkup', '/oficina/clientes', '/oficina/mensagens',
             '/oficina/buscar', '/oficina/job', '/oficina/importar', '/oficina/avisos'],
    home: '/oficina/os',
  },
  mecanico: {
    label: 'Mecânico', icon: '🔧', desc: 'Vê e atualiza as ordens de serviço.',
    routes: ['/oficina/os', '/oficina/agenda', '/oficina/checkup', '/oficina/avisos'], home: '/oficina/os',
  },
};

export const ROLE_ORDER: OperatorRole[] = ['gestor', 'caixa', 'atendente', 'mecanico'];

export const PERMS: Record<OperatorPerm, { label: string; desc: string }> = {
  dar_desconto:         { label: 'Dar desconto',          desc: 'Conceder desconto no recebimento' },
  cancelar_recebimento: { label: 'Cancelar recebimento',  desc: 'Estornar um recebimento já lançado' },
  reabrir_caixa:        { label: 'Reabrir caixa',         desc: 'Reabrir um caixa já fechado' },
  ver_financeiro:       { label: 'Painel financeiro',     desc: 'Saúde do negócio: faturamento, lucro, resultado do mês' },
  contas_pagar:         { label: 'Contas a pagar',        desc: 'Ver, lançar e dar baixa em contas' },
  compras:              { label: 'Compras e fornecedores', desc: 'Notas de compra e cadastro de fornecedores' },
  pecas_estoque:        { label: 'Peças e estoque',       desc: 'Catálogo, estoque e custo das peças; tabela de serviços' },
  folha:                { label: 'Fechar comissões e folha', desc: 'Fechar comissões, salários, vales e faltas da equipe' },
  equipe:               { label: 'Equipe',                desc: 'Colaboradores (ficha, salário, documentos) e Desempenho e comissões' },
};

/** Permissões agrupadas por módulo, para a tela de Acessos */
export const PERM_GROUPS: { label: string; perms: OperatorPerm[] }[] = [
  { label: 'Caixa',              perms: ['dar_desconto', 'cancelar_recebimento', 'reabrir_caixa'] },
  { label: 'Financeiro',         perms: ['ver_financeiro', 'contas_pagar', 'folha'] },
  { label: 'Equipe',             perms: ['equipe'] },
  { label: 'Compras e estoque',  perms: ['compras', 'pecas_estoque'] },
];

/** A rota está liberada para a função? */
export function roleAllows(role: OperatorRole, path: string) {
  const routes = ROLES[role].routes;
  return routes === null || routes.some(r => path === r || path.startsWith(`${r}/`));
}

/** Telas extras liberadas por permissão, além das da função */
const PERM_ROUTES: Partial<Record<OperatorPerm, string[]>> = {
  ver_financeiro: ['/oficina/financeiro'],
  contas_pagar:   ['/oficina/contas-a-pagar'],
  compras:        ['/oficina/compras', '/oficina/fornecedores'],
  pecas_estoque:  ['/oficina/pecas', '/oficina/servicos'],
  folha:          ['/oficina/folha', '/oficina/comissoes'],
  equipe:         ['/oficina/equipe', '/oficina/desempenho'],
};

/** A rota está liberada para quem está operando (função + permissões extras)? */
export function sessionAllows(session: OperatorSession, path: string) {
  if (roleAllows(session.role, path)) return true;
  return session.permissions.some(p =>
    (PERM_ROUTES[p] ?? []).some(r => path === r || path.startsWith(`${r}/`)));
}

/* ── Modo balcão (por aparelho e por oficina) ─────────────────────────────── */

export type OperatorSession = {
  session_id: string; operator_id: string; name: string;
  role: OperatorRole; permissions: OperatorPerm[];
};

type DeviceState = { balcao: boolean; session: OperatorSession | null };

const key = (wid: string) => `mec-operator:${wid}`;

function load(wid: string): DeviceState {
  try {
    const raw = localStorage.getItem(key(wid));
    if (raw) return JSON.parse(raw) as DeviceState;
  } catch { /* localStorage indisponível */ }
  return { balcao: false, session: null };
}

function save(wid: string, s: DeviceState) {
  try { localStorage.setItem(key(wid), JSON.stringify(s)); } catch { /* ignora */ }
}

/** Chaves de todas as lojas guardadas neste aparelho */
function storeKeys(): string[] {
  try { return Object.keys(localStorage).filter(k => k.startsWith('mec-operator:')); } catch { return []; }
}

/**
 * O aparelho está travado no modo balcão em alguma loja?
 * A trava vale para o aparelho inteiro: trocar de loja nunca pode abrir o sistema sem PIN.
 */
function deviceLocked(): boolean {
  return storeKeys().some(k => {
    try { return (JSON.parse(localStorage.getItem(k) ?? '{}') as DeviceState).balcao === true; } catch { return false; }
  });
}

type Store = {
  wid: string | null;
  balcao: boolean;
  session: OperatorSession | null;
  bind: (wid: string | null) => void;
  enterBalcao: () => void;
  login: (operatorId: string, pin: string, role: OperatorRole) => Promise<string | null>;
  /** Encerra quem está operando; o aparelho continua no modo balcão (volta pra tela de PIN). */
  switchUser: () => Promise<void>;
  /** Desliga o modo balcão neste aparelho (só a partir de uma sessão de gestor ou ao sair da conta). */
  exitBalcao: () => Promise<void>;
  /** Leva a tela de bloqueio para outra loja: o aparelho continua travado, agora no balcão dela. */
  moveLockTo: (wid: string) => void;
  /** Relê o acesso de quem está operando: permissões mudadas pelo gestor valem na hora. */
  refresh: () => Promise<void>;
};

export const useOperator = create<Store>((set, get) => ({
  wid: null, balcao: false, session: null,

  moveLockTo: (wid) => {
    const s = { balcao: true, session: null };
    save(wid, s); set({ wid, ...s });
  },

  bind: (wid) => {
    if (wid === get().wid) return;
    let s = wid ? load(wid) : { balcao: false, session: null };
    // Aparelho travado em outra loja: esta também abre na tela de PIN
    if (wid && !s.balcao && deviceLocked()) { s = { balcao: true, session: null }; save(wid, s); }
    set({ wid, ...s });
  },

  enterBalcao: () => {
    const { wid, session } = get();
    if (!wid) return;
    if (session) supabase.rpc('operator_logout', { p_session: session.session_id }).then(() => {});
    const s = { balcao: true, session: null };
    save(wid, s); set(s);
  },

  login: async (operatorId, pin, role) => {
    const { wid } = get();
    if (!wid) return 'Oficina não selecionada';
    const { data, error } = await supabase.rpc('operator_login', { p_operator: operatorId, p_pin: pin, p_role: role });
    if (error) return 'Não foi possível entrar. Verifique a conexão.';
    const r = data as { ok: boolean; error?: string } & OperatorSession;
    if (!r.ok) return r.error ?? 'Não foi possível entrar';
    const session: OperatorSession = {
      session_id: r.session_id, operator_id: r.operator_id, name: r.name,
      role: r.role, permissions: r.permissions ?? [],
    };
    const s = { balcao: true, session };
    save(wid, s); set(s);
    return null;
  },

  refresh: async () => {
    const { wid, session } = get();
    if (!wid || !session) return;
    const { data, error } = await supabase.from('workshop_operators')
      .select('roles, permissions, active').eq('id', session.operator_id).maybeSingle();
    if (error) return; // sem conexão: mantém como está
    const o = data as Pick<WorkshopOperator, 'roles' | 'permissions' | 'active'> | null;
    // Acesso desativado ou função retirada: volta para a tela de PIN
    if (!o || !o.active || !o.roles.includes(session.role)) { await get().switchUser(); return; }
    const same = o.permissions.length === session.permissions.length && o.permissions.every(p => session.permissions.includes(p));
    if (same || get().session?.session_id !== session.session_id) return;
    const s = { balcao: true, session: { ...session, permissions: o.permissions } };
    save(wid, s); set(s);
  },

  switchUser: async () => {
    const { wid, session } = get();
    if (!wid) return;
    if (session) await supabase.rpc('operator_logout', { p_session: session.session_id });
    const s = { balcao: true, session: null };
    save(wid, s); set(s);
  },

  exitBalcao: async () => {
    const { wid, session } = get();
    if (!wid) return;
    if (session) await supabase.rpc('operator_logout', { p_session: session.session_id });
    const s = { balcao: false, session: null };
    // Destrava o aparelho inteiro (todas as lojas)
    for (const k of storeKeys()) {
      try { localStorage.setItem(k, JSON.stringify(s)); } catch { /* ignora */ }
    }
    save(wid, s); set(s);
  },
}));

/** Pode fazer X? Fora do modo balcão (aparelho do dono) pode tudo. */
export function canDo(session: OperatorSession | null, balcao: boolean, perm: OperatorPerm | OperatorRole) {
  if (!balcao) return true;
  if (!session) return false;
  return session.role === 'gestor' || session.role === perm || session.permissions.includes(perm as OperatorPerm);
}
