// Ferramentas do Orçamentista (agente interno do dono): abrir OS, lançar serviços com peças, responsável e resumo.
// Cada ferramenta recebe a oficina (ws) do SERVIDOR e chama uma função do banco (orc_*) que confere que tudo é
// daquela oficina e que só o service_role executa. A IA nunca escolhe a oficina.
//
// As ferramentas não guardam estado: a OS e os itens são identificados pelo NÚMERO da OS e pela ordem dos serviços,
// porque o chat só lembra o texto das respostas (não o resultado das ferramentas).
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { summarizeOs, type OsHead, type OsItem, type TeamMember } from './orcSummary.ts';
import type { ItemRule } from './commissionRules.ts';

type Input = Record<string, unknown>;
export type ToolDef = {
  label: string;
  def: { description: string; input_schema: Record<string, unknown> };
  run: (db: SupabaseClient, ws: string, input: Input) => Promise<unknown>;
};

const str = (v: unknown, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const int = (v: unknown) => { const n = Number(v); return v != null && v !== '' && Number.isFinite(n) ? Math.trunc(n) : null; };
const dec = (v: unknown) => { const n = Number(v); return v != null && v !== '' && Number.isFinite(n) ? n : null; };
const uuid = (v: unknown) => (typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v) ? v : null);
const err = (error: string) => ({ ok: false, error });

async function rpc(db: SupabaseClient, fn: string, args: Record<string, unknown>) {
  const { data, error } = await db.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data;
}

const noProps = { type: 'object', additionalProperties: false, properties: {} };

export const ORC_TOOLS: Record<string, ToolDef> = {
  orc_buscar_cliente: {
    label: 'Buscar cliente (nome, telefone ou placa)',
    def: {
      description: 'Procura o cliente da oficina por nome, telefone ou placa. Devolve até 5 clientes com os carros (veiculo_id, placa, modelo, ano) e as OS abertas. Os ids (cliente_id, veiculo_id) só valem NESTA resposta: em uma conversa nova, busque de novo.',
      input_schema: { type: 'object', additionalProperties: false, required: ['consulta'], properties: { consulta: { type: 'string', description: 'Nome, telefone ou placa' } } },
    },
    run: (db, ws, i) => rpc(db, 'orc_find_customer', { p_workshop: ws, p_query: str(i.consulta) }),
  },

  orc_cadastrar_cliente: {
    label: 'Cadastrar cliente novo (e o carro)',
    def: {
      description: 'Cadastra um cliente novo, com o carro se informado. Se o telefone ou a placa já existirem, NÃO duplica: devolve o cliente que já existe (erro telefone_ja_cadastrado / placa_ja_cadastrada) para você usar. Só cadastre depois de buscar e não achar.',
      input_schema: {
        type: 'object', additionalProperties: false, required: ['nome'],
        properties: {
          nome: { type: 'string' }, telefone: { type: 'string' }, marca: { type: 'string', description: 'Ex.: Chevrolet' },
          modelo: { type: 'string', description: 'Ex.: Onix' }, ano: { type: 'integer' }, placa: { type: 'string' },
        },
      },
    },
    run: (db, ws, i) => rpc(db, 'orc_create_customer', {
      p_workshop: ws, p_nome: str(i.nome, 100), p_telefone: str(i.telefone, 30) || null, p_marca: str(i.marca, 60) || null,
      p_modelo: str(i.modelo, 60) || null, p_ano: int(i.ano), p_placa: str(i.placa, 12) || null,
    }),
  },

  orc_abrir_os: {
    label: 'Abrir a OS do cliente',
    def: {
      description: 'Abre uma OS (status aberta, sem itens) para o cliente e o carro. Devolve o os_numero, que você usa em todas as outras ferramentas e cita ao dono. Se o cliente já tem OS aberta, pergunte ao dono se lança nela ou abre outra antes de chamar.',
      input_schema: {
        type: 'object', additionalProperties: false, required: ['cliente_id'],
        properties: { cliente_id: { type: 'string' }, veiculo_id: { type: 'string', description: 'Carro do cliente (da busca); omita se o cliente não tem carro' }, km: { type: 'integer' } },
      },
    },
    run: async (db, ws, i) => {
      const cliente = uuid(i.cliente_id);
      if (!cliente) return err('cliente_id_invalido: use o cliente_id devolvido pela busca nesta mesma resposta');
      if (i.veiculo_id && !uuid(i.veiculo_id)) return err('veiculo_id_invalido');
      return rpc(db, 'orc_open_os', { p_workshop: ws, p_customer: cliente, p_vehicle: uuid(i.veiculo_id), p_km: int(i.km) });
    },
  },

  orc_buscar_servico: {
    label: 'Buscar serviço na Tabela de serviços',
    def: {
      description: 'Procura o serviço na Tabela de serviços. Para cada um devolve o preço da tabela, o último preço cobrado neste MODELO de carro (se a OS tem carro) e o kit de peças do serviço para este carro (com o custo de cada peça). Use para saber o que vai ser lançado antes de lançar.',
      input_schema: {
        type: 'object', additionalProperties: false, required: ['texto'],
        properties: { texto: { type: 'string', description: 'Ex.: troca de óleo' }, os_numero: { type: 'integer', description: 'OS atual, para considerar o carro dela' } },
      },
    },
    run: (db, ws, i) => rpc(db, 'orc_service_lookup', { p_workshop: ws, p_texto: str(i.texto), p_os_number: int(i.os_numero) }),
  },

  orc_buscar_peca: {
    label: 'Buscar peça no cadastro de peças',
    def: {
      description: 'Procura peças no cadastro (nome, marca ou código). Devolve até 8 com custo e estoque. Use quando o dono pedir uma peça específica e você precisar escolher entre várias.',
      input_schema: { type: 'object', additionalProperties: false, required: ['texto'], properties: { texto: { type: 'string' } } },
    },
    run: (db, ws, i) => rpc(db, 'orc_part_lookup', { p_workshop: ws, p_texto: str(i.texto) }),
  },

  orc_lancar_item: {
    label: 'Lançar serviço com as peças na OS',
    def: {
      description: [
        'Lança UM serviço na OS, com as peças dele. Preço: o que você informar; senão o último cobrado neste modelo de carro; senão o da tabela (a resposta diz a origem). Com usar_kit=true (padrão) entram as peças do kit do serviço para este carro; peças pedidas à parte vão em "pecas".',
        'Dentro de um serviço a peça entra só com CUSTO (o preço que o cliente paga já está no serviço).',
        'Erros que você deve resolver conversando: preco_necessario (pergunte o valor), revisar_pecas (peça com várias opções: pergunte qual; peça fora do cadastro: pergunte o CUSTO e chame de novo com "custo"). Nada é gravado quando há erro.',
        'Devolve item_numero (a ordem do serviço na OS), preco, pecas com custo, avisos e total_os.',
      ].join(' '),
      input_schema: {
        type: 'object', additionalProperties: false, required: ['os_numero'],
        properties: {
          os_numero: { type: 'integer' },
          servico_id: { type: 'string', description: 'servico_id da busca (serviço da tabela)' },
          servico_nome: { type: 'string', description: 'Só para serviço que NÃO está na tabela' },
          preco: { type: 'number', description: 'Valor cobrado do cliente pelo serviço; omita para usar o da regra' },
          usar_kit: { type: 'boolean', description: 'Lançar as peças do kit do serviço (padrão: sim)' },
          pecas: {
            type: 'array', maxItems: 20,
            items: {
              type: 'object', additionalProperties: false,
              properties: {
                nome: { type: 'string' }, peca_id: { type: 'string', description: 'Da busca de peças, quando o dono escolheu uma' },
                qtd: { type: 'number' }, custo: { type: 'number', description: 'Custo unitário; só para peça fora do cadastro' },
              },
            },
          },
        },
      },
    },
    run: async (db, ws, i) => {
      const os = int(i.os_numero);
      if (os == null) return err('os_numero_obrigatorio');
      if (i.servico_id && !uuid(i.servico_id)) return err('servico_id_invalido: use o servico_id da busca nesta mesma resposta');
      const pecas = (Array.isArray(i.pecas) ? i.pecas : []).slice(0, 20).map((p) => {
        const o = (p ?? {}) as Input;
        return { nome: str(o.nome, 120), peca_id: uuid(o.peca_id), qtd: dec(o.qtd) ?? 1, custo: dec(o.custo) };
      });
      return rpc(db, 'orc_add_item', {
        p_workshop: ws, p_os_number: os, p_servico_id: uuid(i.servico_id), p_servico_nome: str(i.servico_nome) || null,
        p_preco: dec(i.preco), p_usar_kit: i.usar_kit !== false, p_pecas: pecas,
      });
    },
  },

  orc_listar_equipe: {
    label: 'Listar a equipe (responsáveis)',
    def: {
      description: 'Lista os colaboradores ativos da oficina e se ganham comissão por serviço. Use antes de definir responsáveis ou quando o dono citar um nome que você não tem certeza.',
      input_schema: noProps,
    },
    run: async (db, ws) => {
      const { data, error } = await db.from('workshop_mechanics')
        .select('name, role_title, no_commission, commission_revenue_only').eq('workshop_id', ws).eq('active', true).order('name');
      if (error) throw new Error(error.message);
      return {
        ok: true,
        equipe: (data ?? []).map((m: any) => ({
          nome: m.name, funcao: m.role_title ?? null,
          comissao_por_servico: !(m.no_commission || m.commission_revenue_only),
        })),
      };
    },
  },

  orc_definir_responsavel: {
    label: 'Definir o responsável de cada item',
    def: {
      description: 'Define quem fez o item N da OS (N = a ordem do serviço na OS, como devolvida em item_numero). O nome é achado pelo início das palavras (ex.: "rafa" → Rafael); se houver mais de um, devolve as opções para você perguntar. É o responsável que define a comissão.',
      input_schema: {
        type: 'object', additionalProperties: false, required: ['os_numero', 'item_numero', 'colaborador'],
        properties: { os_numero: { type: 'integer' }, item_numero: { type: 'integer' }, colaborador: { type: 'string' } },
      },
    },
    run: async (db, ws, i) => {
      const os = int(i.os_numero), item = int(i.item_numero);
      if (os == null || item == null) return err('os_numero_e_item_numero_obrigatorios');
      return rpc(db, 'orc_set_responsible', { p_workshop: ws, p_os_number: os, p_item_number: item, p_colaborador: str(i.colaborador, 80) });
    },
  },

  orc_resumo_os: {
    label: 'Resumo da OS (totais e comissões)',
    def: {
      description: 'Resumo da OS: cada serviço com valor, peças (custo), responsável e comissão, mais os totais: valor dos serviços, total da OS, custo de peças e comissões (por pessoa e total), com a MESMA regra da tela de Comissões. Chame ao terminar de lançar e definir os responsáveis, e sempre que o dono pedir os números.',
      input_schema: { type: 'object', additionalProperties: false, required: ['os_numero'], properties: { os_numero: { type: 'integer' } } },
    },
    run: async (db, ws, i) => {
      const os = int(i.os_numero);
      if (os == null) return err('os_numero_obrigatorio');
      const data = await rpc(db, 'orc_os_data', { p_workshop: ws, p_os_number: os }) as
        { ok: boolean; error?: string; os: OsHead; itens: OsItem[] };
      if (!data?.ok) return data;
      const [{ data: team, error: e1 }, { data: rules, error: e2 }] = await Promise.all([
        db.from('workshop_mechanics').select('id, name, no_commission, commission_revenue_only').eq('workshop_id', ws),
        db.from('commission_item_rules').select('id, workshop_id, keyword, mechanic_id, amount, per_units, percent, active').eq('workshop_id', ws),
      ]);
      if (e1) throw new Error(e1.message);
      if (e2) throw new Error(e2.message);
      const norm: ItemRule[] = (rules ?? []).map((r: any) => ({
        ...r, amount: Number(r.amount), per_units: Number(r.per_units), percent: Number(r.percent ?? 0),
      }));
      const items: OsItem[] = (data.itens ?? []).map((x) => ({
        ...x, quantity: Number(x.quantity), unit_price: Number(x.unit_price),
        unit_cost: x.unit_cost == null ? null : Number(x.unit_cost),
        commission_amount: x.commission_amount == null ? null : Number(x.commission_amount),
      }));
      return { ok: true, ...summarizeOs({ ...data.os, preco: Number(data.os.preco), desconto: Number(data.os.desconto ?? 0) }, items, (team ?? []) as TeamMember[], norm) };
    },
  },
};
