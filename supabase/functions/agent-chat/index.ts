// Chat com um agente interno de IA da oficina (hoje: "Sócio operacional", só leitura, só o dono).
// A IA nunca escolhe a oficina: toda tool consulta com o workshop_id do agente, imposto aqui no servidor.
//
// Só para oficinas com o módulo 'agentes' ligado (workshop_modules) e só para o dono (RLS de ai_agents).
// Chave, modelo e esforço vêm de app_settings (painel admin → Configurações → Inteligência Artificial):
// modelo próprio em 'ai_agent_model'; se vazio, usa o das notas / da leitura de fotos.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import Anthropic from 'npm:@anthropic-ai/sdk';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

// Padrões e tetos; o superadmin ajusta por agente (ai_agents.max_tool_turns / history_window / max_tokens)
const DEFAULT_TURNS = 6, DEFAULT_HISTORY = 20, DEFAULT_MAX_TOKENS = 4000;
const clamp = (v: unknown, min: number, max: number, def: number) => {
  const n = Number(v);
  return Number.isFinite(n) && v != null ? Math.min(max, Math.max(min, Math.round(n))) : def;
};
const MAX_INPUT_CHARS = 2000;
const ROW_LIMIT = 30;

const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }); // AAAA-MM-DD
const num = (v: unknown) => Number(v ?? 0);
const brl = (v: number) => Math.round(v * 100) / 100;
const dateArg = (v: unknown, fallback: string) =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : fallback;
const daysSince = (iso: string | null) =>
  iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000) : null;

type Db = ReturnType<typeof createClient>;

// O Supabase devolve no máximo 1000 linhas por consulta (mesmo helper de src/lib/fetchAll.ts)
async function fetchAll<T = any>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>, size = 1000, max = 20000,
): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; from < max; from += size) {
    const { data, error } = await page(from, from + size - 1);
    if (error) throw error;
    all.push(...(data ?? []));
    if (!data || data.length < size) break;
  }
  return all;
}
type Input = Record<string, unknown>;

/** Catálogo de tools: a chave é o que o dono marca na tela; `run` sempre recebe o workshop_id do servidor. */
export const TOOLS: Record<string, {
  label: string;
  def: { description: string; input_schema: Record<string, unknown> };
  run: (db: Db, ws: string, input: Input) => Promise<unknown>;
}> = {
  faturamento: {
    label: 'Faturamento (recebimentos no caixa)',
    def: {
      description: 'Total recebido pela oficina (pagamentos de OS no caixa, sem cancelados) entre duas datas, com quantidade de recebimentos e ticket médio. Datas AAAA-MM-DD; padrão: mês atual.',
      input_schema: {
        type: 'object', additionalProperties: false,
        properties: { de: { type: 'string', description: 'AAAA-MM-DD' }, ate: { type: 'string', description: 'AAAA-MM-DD, inclusive' } },
      },
    },
    run: async (db, ws, i) => {
      const t = today();
      const de = dateArg(i.de, `${t.slice(0, 7)}-01`);
      const ate = dateArg(i.ate, t);
      const { data, error } = await db.from('os_payments').select('amount, discount')
        .eq('workshop_id', ws).is('cancelled_at', null)
        .gte('created_at', `${de}T00:00:00-03:00`).lte('created_at', `${ate}T23:59:59-03:00`).limit(5000);
      if (error) throw error;
      const total = (data ?? []).reduce((s, r) => s + num(r.amount), 0);
      const n = data?.length ?? 0;
      return { de, ate, total_recebido: brl(total), recebimentos: n, ticket_medio: n ? brl(total / n) : 0 };
    },
  },

  os_em_andamento: {
    label: 'OS abertas / em andamento / paradas',
    def: {
      description: 'Ordens de serviço ainda não concluídas (abertas, aguardando aprovação, aprovadas ou em andamento), da mais antiga para a mais nova, com dias em aberto.',
      input_schema: { type: 'object', additionalProperties: false, properties: {} },
    },
    run: async (db, ws) => {
      const { data, error } = await db.from('service_orders')
        .select('number, title, status, price, created_at, scheduled_at, customers(full_name), vehicles(plate, model)')
        .eq('workshop_id', ws).in('status', ['open', 'awaiting_approval', 'approved', 'in_progress'])
        .order('created_at').limit(ROW_LIMIT);
      if (error) throw error;
      return (data ?? []).map((o: any) => ({
        os: o.number, servico: o.title, status: o.status, valor: brl(num(o.price)),
        dias_em_aberto: daysSince(o.created_at), cliente: o.customers?.full_name ?? null,
        veiculo: [o.vehicles?.model, o.vehicles?.plate].filter(Boolean).join(' ') || null,
      }));
    },
  },

  os_concluidas: {
    label: 'OS concluídas (com serviços e peças)',
    def: {
      description: 'Ordens de serviço CONCLUÍDAS entre duas datas (pela data de conclusão), com valor, desconto, cliente, veículo e a lista de serviços e peças de cada uma. Datas AAAA-MM-DD; padrão: hoje. Para "ontem", use a mesma data em de e ate.',
      input_schema: {
        type: 'object', additionalProperties: false,
        properties: { de: { type: 'string', description: 'AAAA-MM-DD' }, ate: { type: 'string', description: 'AAAA-MM-DD, inclusive' } },
      },
    },
    run: async (db, ws, i) => {
      const t = today();
      const de = dateArg(i.de, t);
      const ate = dateArg(i.ate, t);
      const { data, error } = await db.from('service_orders')
        .select('number, title, price, discount, completed_at, customers(full_name), vehicles(plate, model), service_order_items(kind, description, quantity, unit_price)')
        .eq('workshop_id', ws).eq('status', 'completed').is('quote_status', null)
        .gte('completed_at', `${de}T00:00:00-03:00`).lte('completed_at', `${ate}T23:59:59-03:00`)
        .order('completed_at').limit(ROW_LIMIT);
      if (error) throw error;
      const rows = data ?? [];
      return {
        de, ate, quantidade: rows.length, valor_total: brl(rows.reduce((s, o: any) => s + num(o.price), 0)),
        os: rows.map((o: any) => ({
          os: o.number, titulo: o.title, valor: brl(num(o.price)), desconto: brl(num(o.discount)),
          cliente: o.customers?.full_name ?? null,
          veiculo: [o.vehicles?.model, o.vehicles?.plate].filter(Boolean).join(' ') || null,
          itens: (o.service_order_items ?? []).map((it: any) => ({
            tipo: it.kind, descricao: it.description, qtd: num(it.quantity), valor_unit: brl(num(it.unit_price)),
          })),
        })),
      };
    },
  },

  contas_a_pagar: {
    label: 'Contas a pagar',
    def: {
      description: 'Contas a pagar em aberto (não pagas, não canceladas) com vencimento até a data informada (padrão: hoje + 7 dias), incluindo as já vencidas. Devolve total e itens.',
      input_schema: { type: 'object', additionalProperties: false, properties: { ate: { type: 'string', description: 'AAAA-MM-DD' } } },
    },
    run: async (db, ws, i) => {
      const t = today();
      const plus7 = new Date(Date.now() + 7 * 86_400_000).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
      const ate = dateArg(i.ate, plus7);
      const { data, error } = await db.from('payables')
        .select('description, category, installment, amount, due_date, suppliers(name)')
        .eq('workshop_id', ws).is('paid_at', null).is('cancelled_at', null).lte('due_date', ate)
        .order('due_date').limit(ROW_LIMIT);
      if (error) throw error;
      const rows = data ?? [];
      return {
        ate, total: brl(rows.reduce((s, r) => s + num(r.amount), 0)),
        vencidas: brl(rows.filter((r) => r.due_date < t).reduce((s, r) => s + num(r.amount), 0)),
        itens: rows.map((r: any) => ({
          descricao: r.description, categoria: r.category, parcela: r.installment,
          fornecedor: r.suppliers?.name ?? null, valor: brl(num(r.amount)), vence: r.due_date, vencida: r.due_date < t,
        })),
      };
    },
  },

  a_receber: {
    label: 'OS a receber',
    def: {
      description: 'Relatório de OS a receber: OS concluídas com saldo em aberto (inclui "pagar depois" e parcialmente pagas), vencidas primeiro. Mostra total, total vencido e, por OS, cliente, veículo, saldo, dias desde a conclusão e data combinada.',
      input_schema: { type: 'object', additionalProperties: false, properties: {} },
    },
    // Mesma regra da tela Financeiro (src/lib/finance.ts → receivables)
    run: async (db, ws) => {
      const { data: reg } = await db.from('cash_registers').select('opened_at').eq('workshop_id', ws).order('opened_at').limit(1).maybeSingle();
      const since = reg?.opened_at ? new Date(reg.opened_at).getTime() : Infinity;
      const all = await fetchAll((a, b) => db.from('service_orders')
        .select('id, number, title, price, paid_amount, counter_discount, pay_later_due, pay_later_note, completed_at, customers(full_name, phone), vehicles(plate, model)')
        .eq('workshop_id', ws).eq('status', 'completed').is('quote_status', null).not('completed_at', 'is', null)
        .order('id').range(a, b));
      const todayMs = new Date(`${today()}T00:00:00-03:00`).getTime();
      const itens = all
        .filter((o: any) => !!o.pay_later_due || new Date(o.completed_at).getTime() >= since)
        .map((o: any) => {
          const saldo = brl(num(o.price) - num(o.counter_discount) - num(o.paid_amount));
          const dias = Math.floor((Date.now() - new Date(o.completed_at).getTime()) / 86_400_000);
          const venceEm = o.pay_later_due ? Math.round((new Date(`${o.pay_later_due}T00:00:00-03:00`).getTime() - todayMs) / 86_400_000) : null;
          return {
            os: o.number, servico: o.title, cliente: o.customers?.full_name ?? null, telefone: o.customers?.phone ?? null,
            veiculo: [o.vehicles?.model, o.vehicles?.plate].filter(Boolean).join(' ') || null,
            saldo, parcialmente_pago: num(o.paid_amount) > 0, concluida_ha_dias: dias,
            pagar_depois_ate: o.pay_later_due ?? null, obs: o.pay_later_note ?? null,
            vencida: venceEm != null ? venceEm < 0 : dias > 7,
          };
        })
        .filter((o) => o.saldo > 0.009)
        .sort((x, y) => Number(y.vencida) - Number(x.vencida) || y.concluida_ha_dias - x.concluida_ha_dias);
      const sum = (l: typeof itens) => brl(l.reduce((s, o) => s + o.saldo, 0));
      return {
        total_a_receber: sum(itens), quantidade: itens.length,
        total_vencido: sum(itens.filter((o) => o.vencida)), quantidade_vencida: itens.filter((o) => o.vencida).length,
        total_pagar_depois: sum(itens.filter((o) => o.pagar_depois_ate)),
        regra_vencida: 'com "pagar depois": passou da data combinada; sem data: concluída há mais de 7 dias',
        itens: itens.slice(0, 40), ...(itens.length > 40 ? { aviso: `mostrando 40 de ${itens.length} OS` } : {}),
      };
    },
  },

  comissoes: {
    label: 'Comissões da equipe (dia, quinzena, mês)',
    def: {
      description: 'Comissão de cada colaborador num período, pela mesma regra da tela Comissões: serviço + peças 4%, mão de obra 10%, valores fixos por item, valores digitados na OS e % do faturamento (gerente). Conta quando o serviço é FINALIZADO (não precisa estar pago). periodo: "dia", "quinzena" (1ª = dias 1-15, 2ª = 16-fim) ou "mes"; referencia: qualquer data AAAA-MM-DD dentro do período (padrão: hoje). Para a quinzena também informa se já foi fechada.',
      input_schema: {
        type: 'object', additionalProperties: false, required: ['periodo'],
        properties: {
          periodo: { type: 'string', enum: ['dia', 'quinzena', 'mes'] },
          referencia: { type: 'string', description: 'AAAA-MM-DD, uma data dentro do período' },
        },
      },
    },
    // Espelha src/lib/commission.ts (baseByMechanic + commissionFor) e commissionClosing.ts (quinzena)
    run: async (db, ws, i) => {
      const ref = dateArg(i.referencia, today());
      const periodo = ['dia', 'quinzena', 'mes'].includes(String(i.periodo)) ? String(i.periodo) : 'mes';
      const [y, m, d] = ref.split('-').map(Number);
      const ymd = (yy: number, mm: number, dd: number) => new Date(Date.UTC(yy, mm - 1, dd)).toISOString().slice(0, 10);
      const competence = ref.slice(0, 7);
      let from: string, to: string, rotulo: string, half: 1 | 2 | null = null;
      if (periodo === 'dia') { from = ref; to = ymd(y, m, d + 1); rotulo = `dia ${ref}`; }
      else if (periodo === 'mes') { from = ymd(y, m, 1); to = ymd(y, m + 1, 1); rotulo = `mês ${competence}`; }
      else {
        half = d <= 15 ? 1 : 2;
        from = ymd(y, m, half === 1 ? 1 : 16); to = half === 1 ? ymd(y, m, 16) : ymd(y, m + 1, 1);
        rotulo = `${half}ª quinzena ${competence}`;
      }
      const fromTs = `${from}T00:00:00-03:00`, toTs = `${to}T00:00:00-03:00`;

      const [mechs, base, sales, closed] = await Promise.all([
        db.from('workshop_mechanics')
          .select('id, name, active, commission_percent, commission_parts_percent, commission_revenue_percent, commission_own_parts_percent, no_commission')
          .eq('workshop_id', ws).order('name'),
        fetchAll((a, b) => db.from('os_commission_base')
          .select('service_order_id, mechanic_id, labor, parts, customer_brought_parts, labor_only, done_at, rule_v2, svc_base, mo_base, manual, fixed')
          .eq('workshop_id', ws).not('done_at', 'is', null).gte('done_at', fromTs).lt('done_at', toTs)
          .order('service_order_id').order('mechanic_id', { nullsFirst: true }).order('done_at').range(a, b)),
        fetchAll((a, b) => db.from('service_orders').select('id, price')
          .eq('workshop_id', ws).eq('status', 'completed').is('quote_status', null)
          .gte('completed_at', fromTs).lt('completed_at', toTs).order('id').range(a, b)),
        half
          ? db.from('commission_closings').select('mechanic_id, commission, payable_id').eq('workshop_id', ws).eq('competence', competence).eq('half', half)
          : Promise.resolve({ data: [] as any[] }),
      ]);
      if (mechs.error) throw mechs.error;
      const revenue = sales.reduce((s: number, o: any) => s + num(o.price), 0);
      const closedBy = new Map<string, any>(((closed as any).data ?? []).map((c: any) => [c.mechanic_id, c]));

      const done = new Map<string, any>();
      for (const r of base as any[]) {
        if (!r.mechanic_id) continue;
        const e = done.get(r.mechanic_id) ?? { labor: 0, laborOwn: 0, parts: 0, svc: 0, mo: 0, manual: 0, fixed: 0 };
        if (num(r.fixed) > 0) e.fixed += num(r.fixed);
        if (num(r.manual) > 0) e.manual += num(r.manual);
        if (r.rule_v2) { e.svc += num(r.svc_base); e.mo += num(r.mo_base); }
        else {
          const labor = num(r.labor), only = Math.min(labor, num(r.labor_only));
          if (r.customer_brought_parts) e.laborOwn += labor; else { e.laborOwn += only; e.labor += labor - only; }
          e.parts += num(r.parts);
        }
        done.set(r.mechanic_id, e);
      }

      const colaboradores = (mechs.data ?? []).map((mc: any) => {
        const e = done.get(mc.id);
        const pl = num(mc.commission_percent);
        const pown = mc.commission_own_parts_percent != null ? num(mc.commission_own_parts_percent) : pl;
        const pp = num(mc.commission_parts_percent), pr = num(mc.commission_revenue_percent);
        const rev = pr > 0 ? brl(revenue) : 0;
        const comissao = mc.no_commission ? 0 : brl(
          num(e?.labor) * pl / 100 + num(e?.laborOwn) * pown / 100 + num(e?.parts) * pp / 100
          + num(e?.svc) * 4 / 100 + num(e?.mo) * 10 / 100 + rev * pr / 100 + num(e?.manual) + num(e?.fixed));
        const fechado = closedBy.get(mc.id);
        const relevante = !!fechado || comissao > 0 || (mc.active && !mc.no_commission && (pl > 0 || pown > 0 || pp > 0 || pr > 0));
        return {
          relevante,
          row: {
            colaborador: mc.name, ativo: mc.active, comissao,
            ...(mc.no_commission ? { obs: 'salário fixo, sem comissão' } : {}),
            base: {
              servico_mais_pecas_4pct: brl(num(e?.svc)), mao_de_obra_10pct: brl(num(e?.mo)),
              valores_digitados_na_os: brl(num(e?.manual)), valores_fixos_por_item: brl(num(e?.fixed)),
              ...(pr > 0 ? { percentual_faturamento: pr, faturamento_da_loja: rev } : {}),
            },
            ...(fechado ? { quinzena_fechada: true, valor_fechado: brl(num(fechado.commission)), conta_a_pagar_gerada: !!fechado.payable_id } : {}),
          },
        };
      }).filter((x: any) => x.relevante).map((x: any) => x.row);

      return {
        periodo: rotulo, de: from, ate_exclusive: to,
        total_comissoes: brl(colaboradores.reduce((s: number, r: any) => s + r.comissao, 0)),
        colaboradores,
        nota: 'A comissão conta quando o serviço é finalizado, mesmo que o cliente ainda não tenha pago.',
      };
    },
  },

  estoque_baixo: {
    label: 'Estoque baixo',
    def: {
      description: 'Peças ativas com estoque igual ou abaixo do mínimo cadastrado (só peças que têm mínimo definido).',
      input_schema: { type: 'object', additionalProperties: false, properties: {} },
    },
    run: async (db, ws) => {
      const { data, error } = await db.from('workshop_parts')
        .select('name, brand, unit, stock_qty, min_qty, supplier').eq('workshop_id', ws).eq('active', true).gt('min_qty', 0).limit(2000);
      if (error) throw error;
      return (data ?? []).filter((p) => num(p.stock_qty) <= num(p.min_qty)).slice(0, ROW_LIMIT)
        .map((p) => ({ peca: p.name, marca: p.brand, estoque: num(p.stock_qty), minimo: num(p.min_qty), unidade: p.unit, fornecedor: p.supplier }));
    },
  },

  checkups_sem_resposta: {
    label: 'Check-ups sem resposta do cliente',
    def: {
      description: 'Check-ups com orçamento enviado ao cliente que ainda não foi respondido (aprovado, recusado ou agendado), do mais antigo para o mais novo.',
      input_schema: { type: 'object', additionalProperties: false, properties: {} },
    },
    run: async (db, ws) => {
      const { data, error } = await db.from('vehicle_checkups')
        .select('plate, make, model, customer_name, quote_sent_at, customer_viewed_at')
        .eq('workshop_id', ws).not('quote_sent_at', 'is', null).is('customer_responded_at', null)
        .order('quote_sent_at').limit(ROW_LIMIT);
      if (error) throw error;
      return (data ?? []).map((c) => ({
        cliente: c.customer_name, veiculo: [c.make, c.model, c.plate].filter(Boolean).join(' '),
        enviado_ha_dias: daysSince(c.quote_sent_at), cliente_abriu_o_link: !!c.customer_viewed_at,
      }));
    },
  },
};

export const SOCIO_PROMPT = `Você é o Sócio operacional desta oficina mecânica: um sócio de confiança do dono, direto e prático.
Responda sempre em português do Brasil, em tom de conversa entre sócios, sem enrolação.

Regras:
- Use as ferramentas para buscar os números. NUNCA invente valor, nome, data ou quantidade; se a ferramenta não trouxe, diga que não tem esse dado.
- Dinheiro em reais (R$ 1.234,56). Datas no formato dia/mês.
- Comece pelo que importa: o número ou o problema, depois o contexto. Se houver algo urgente (contas vencidas, OS parada há muitos dias, cliente sem retorno), destaque e sugira o próximo passo.
- Você só consulta dados. Não consegue enviar mensagens, alterar OS nem lançar nada; se pedirem, diga que ainda não faz e sugira como o dono resolve.
- Se a pergunta for ampla ("como foi a semana?"), consulte as ferramentas relevantes antes de responder.`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const url = Deno.env.get('SUPABASE_URL')!;
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  let workshopId: string | null = null;
  let userId: string | null = null;
  let model: string | null = null;
  let inTok = 0, outTok = 0;

  const log = (row: Record<string, unknown>) =>
    admin.from('ai_usage_log').insert({
      workshop_id: workshopId, feature: 'agent_socio', created_by: userId, model,
      input_tokens: inTok || null, output_tokens: outTok || null, ...row,
    });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'no auth' }, 401);
    const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: 'unauthorized' }, 401);
    userId = user.id;

    const body = await req.json();
    const agentId: string | undefined = body.agent_id;
    const message = String(body.message ?? '').trim().slice(0, MAX_INPUT_CHARS);
    if (!agentId || !message) return json({ error: 'agent_id e message são obrigatórios' }, 400);

    // RLS de ai_agents: só o dono da oficina (ou superadmin) enxerga o agente
    const { data: agent } = await userClient.from('ai_agents')
      .select('id, workshop_id, template, system_prompt, tools, enabled, model, max_tokens, history_window, max_tool_turns').eq('id', agentId).maybeSingle();
    if (!agent) return json({ error: 'Agente não encontrado' }, 404);
    workshopId = agent.workshop_id;
    if (!agent.enabled) return json({ error: 'Este agente está desligado' }, 403);

    const { data: modOn } = await admin.rpc('workshop_module_enabled', { _workshop_id: workshopId, _module: 'agentes' });
    if (!modOn) return json({ error: 'Agentes de IA não liberados para esta oficina' }, 403);

    const { data: rows } = await admin.from('app_settings').select('key, value')
      .in('key', ['anthropic_api_key', 'ai_agent_model', 'ai_invoice_model', 'ai_vision_model', 'ai_vision_effort']);
    const cfg: Record<string, string> = {};
    for (const r of rows ?? []) cfg[r.key] = (r.value ?? '').trim();
    if (!cfg.anthropic_api_key) return json({ error: 'A IA ainda não foi configurada. Avise o suporte.' }, 503);
    model = (agent.model ?? '').trim() || cfg.ai_agent_model || cfg.ai_invoice_model || cfg.ai_vision_model;
    if (!model) return json({ error: 'Modelo da IA não configurado no painel admin.' }, 503);

    // Só as tools que o dono marcou (e que existem no catálogo)
    const enabledTools = (agent.tools as string[]).filter((k) => k in TOOLS);
    const toolDefs = enabledTools.map((k) => ({ name: k, ...TOOLS[k].def }));

    const maxTurns = clamp(agent.max_tool_turns, 1, 40, DEFAULT_TURNS);
    const maxTokens = clamp(agent.max_tokens, 500, 16000, DEFAULT_MAX_TOKENS);
    const history = clamp(agent.history_window, 2, 60, DEFAULT_HISTORY);

    const { data: hist } = await admin.from('ai_agent_messages').select('role, content')
      .eq('agent_id', agent.id).order('created_at', { ascending: false }).limit(history);
    const messages: any[] = [...(hist ?? []).reverse(), { role: 'user', content: message }];

    const client = new Anthropic({ apiKey: cfg.anthropic_api_key });
    const system = `${agent.system_prompt}\n\nHoje é ${today()} (horário de Brasília).`;

    let answer = '';
    for (let turn = 0; turn < maxTurns; turn++) {
      const response = await client.messages.create({
        model, max_tokens: maxTokens, system, messages,
        ...(toolDefs.length ? { tools: toolDefs } : {}),
        ...(cfg.ai_vision_effort ? { output_config: { effort: cfg.ai_vision_effort } } : {}),
      } as any);
      inTok += response.usage?.input_tokens ?? 0;
      outTok += response.usage?.output_tokens ?? 0;

      if (response.stop_reason === 'refusal') throw new Error('a IA não conseguiu responder a isso');
      const text = response.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n').trim();

      if (response.stop_reason !== 'tool_use') { answer = text; break; }

      messages.push({ role: 'assistant', content: response.content });
      const results = [];
      for (const block of response.content.filter((b: any) => b.type === 'tool_use') as any[]) {
        try {
          if (!enabledTools.includes(block.name)) throw new Error('ferramenta não liberada');
          const out = await TOOLS[block.name].run(admin, workshopId!, block.input ?? {});
          results.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(out) });
        } catch (e) {
          console.error('[agent-chat tool]', block.name, e);
          results.push({ type: 'tool_result', tool_use_id: block.id, is_error: true, content: 'Não consegui consultar isso agora.' });
        }
      }
      messages.push({ role: 'user', content: results });
    }
    if (!answer) answer = 'Não consegui fechar a análise a tempo. Tente uma pergunta mais específica.';

    await admin.from('ai_agent_messages').insert([
      { agent_id: agent.id, workshop_id: workshopId, role: 'user', content: message },
      { agent_id: agent.id, workshop_id: workshopId, role: 'assistant', content: answer },
    ]);
    await log({});
    return json({ ok: true, answer });
  } catch (e) {
    let msg = e instanceof Error ? e.message : String(e);
    if (e instanceof Anthropic.AuthenticationError) msg = 'chave da IA inválida';
    else if (e instanceof Anthropic.RateLimitError) msg = 'limite da IA atingido, tente de novo em instantes';
    else if (e instanceof Anthropic.APIError) {
      const detail = (e.error as any)?.error?.message ?? '';
      msg = `erro da IA (${e.status})${detail ? `: ${String(detail).slice(0, 300)}` : ''}`;
    }
    console.error('[agent-chat]', e);
    if (workshopId) await log({ ok: false, error: msg.slice(0, 500) });
    return json({ error: msg }, 500);
  }
});
