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
  run: (db: SupabaseClient, ws: string, input: Input, ctx: { userId: string; authHeader?: string }) => Promise<unknown>;
};

const str = (v: unknown, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const int = (v: unknown) => { const n = Number(v); return v != null && v !== '' && Number.isFinite(n) ? Math.trunc(n) : null; };
const dec = (v: unknown) => { const n = Number(v); return v != null && v !== '' && Number.isFinite(n) ? n : null; };
const uuid = (v: unknown) => (typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v) ? v : null);
const err = (error: string) => ({ ok: false, error });
const norm = (v: string) => v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

/** Serviço pelo código (mesma resposta) ou pelo nome: só segue se achar um único (ou o de nome igual) */
async function resolveService(db: SupabaseClient, ws: string, id: unknown, nome: unknown):
  Promise<{ id: string } | { error: Record<string, unknown> }> {
  const direct = uuid(id);
  if (direct) return { id: direct };
  const name = str(nome);
  if (!name) return { error: err('servico_id_ou_servico_nome_obrigatorio') };
  const lk = await rpc(db, 'orc_service_lookup', { p_workshop: ws, p_texto: name, p_os_number: null }) as { servicos?: { servico_id: string; nome: string }[] };
  const list = lk?.servicos ?? [];
  const exact = list.filter((x) => norm(x.nome) === norm(name));
  const pick = list.length === 1 ? list[0] : exact.length === 1 ? exact[0] : null;
  if (!pick) return { error: { ok: false, error: list.length ? 'varios_servicos' : 'servico_nao_encontrado', opcoes: list.map((x) => x.nome) } };
  return { id: pick.servico_id };
}

async function rpc(db: SupabaseClient, fn: string, args: Record<string, unknown>) {
  const { data, error } = await db.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data;
}

const PART_CATEGORIES = ['freios', 'suspensao', 'motor', 'ignicao_injecao', 'eletrica', 'oleos_filtros', 'arrefecimento', 'transmissao', 'rodas', 'escapamento', 'ar_condicionado', 'carroceria', 'outros'];

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
      description: 'Cadastra um cliente novo, com o carro se informado. O carro EXIGE o modelo (erro modelo_obrigatorio: pergunte o modelo antes, não só o ano). Se o telefone ou a placa já existirem, NÃO duplica: devolve o cliente que já existe (erro telefone_ja_cadastrado / placa_ja_cadastrada) para você usar. Só cadastre depois de buscar e não achar.',
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
      description: 'Abre uma OS (status aberta, sem itens) para o cliente e o carro. O carro é obrigatório e precisa ter MODELO e ANO: se faltar, a OS não abre (carro_obrigatorio = cliente sem carro, use orc_cadastrar_carro; carro_incompleto = veja "faltando", pergunte ao dono e complete com orc_atualizar_carro). Devolve o os_numero, que você usa em todas as outras ferramentas e cita ao dono. Se o cliente já tem OS aberta, pergunte ao dono se lança nela ou abre outra antes de chamar.',
      input_schema: {
        type: 'object', additionalProperties: false, required: ['cliente_id'],
        properties: { cliente_id: { type: 'string' }, veiculo_id: { type: 'string', description: 'Carro do cliente (da busca ou do cadastro, desta mesma vez)' }, km: { type: 'integer' } },
      },
    },
    run: async (db, ws, i) => {
      const cliente = uuid(i.cliente_id);
      if (!cliente) return err('cliente_id_invalido: use o cliente_id devolvido pela busca nesta mesma resposta');
      if (!uuid(i.veiculo_id)) return err('veiculo_id_invalido: busque o cliente de novo e use o veiculo_id do carro (a OS precisa de carro com modelo e ano)');
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
        'Lança UM serviço na OS, com as peças dele. Preço: o que você informar; senão o último cobrado neste modelo de carro; senão o da tabela (a resposta diz a origem). Com usar_kit=true (padrão) entram as peças do kit do serviço para este carro; peças pedidas à parte vão em "pecas". Troca de óleo sem kit para o carro: faça antes a consulta técnica (orc_ficha_tecnica) e salve o kit (orc_salvar_kit_ficha).',
        'Dentro de um serviço a peça entra só com CUSTO (o preço que o cliente paga já está no serviço).',
        'REGRA: peça SEM CUSTO não entra na OS. Erros que você deve resolver conversando: preco_necessario (pergunte o valor), revisar_pecas (varias_no_cadastro: pergunte qual; sem_cadastro ou sem_custo: pergunte o CUSTO ao dono e chame de novo com "custo" na peça; kit_sem_custo: a peça do kit está sem custo no cadastro: lance com usar_kit=false e passe as peças em "pecas" com o custo que o dono disser). Nunca invente custo nem lance com custo zero. Nada é gravado quando há erro.',
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

  orc_atualizar_carro: {
    label: 'Completar o cadastro do carro',
    def: {
      description: 'Completa marca, modelo e ano de um carro. Informe veiculo_id (carro do cliente, ANTES de abrir a OS) ou os_numero (carro da OS). Só preenche o que está vazio ("Não informado" conta como vazio): dado já preenchido não é trocado. Use quando o carro estiver sem modelo ou ano, depois de perguntar ao dono.',
      input_schema: {
        type: 'object', additionalProperties: false,
        properties: {
          veiculo_id: { type: 'string', description: 'Carro do cliente (da busca, desta mesma vez)' },
          os_numero: { type: 'integer', description: 'Alternativa ao veiculo_id: o carro desta OS' },
          marca: { type: 'string' }, modelo: { type: 'string', description: 'Ex.: Onix, Uno, Gol' }, ano: { type: 'integer' },
        },
      },
    },
    run: async (db, ws, i) => {
      const marca = str(i.marca, 60) || null, modelo = str(i.modelo, 60) || null, ano = int(i.ano);
      if (i.veiculo_id) {
        const v = uuid(i.veiculo_id);
        if (!v) return err('veiculo_id_invalido: busque o cliente de novo');
        return rpc(db, 'orc_update_vehicle_by_id', { p_workshop: ws, p_vehicle: v, p_marca: marca, p_modelo: modelo, p_ano: ano });
      }
      const os = int(i.os_numero);
      if (os == null) return err('informe_veiculo_id_ou_os_numero');
      return rpc(db, 'orc_update_vehicle', { p_workshop: ws, p_os_number: os, p_marca: marca, p_modelo: modelo, p_ano: ano });
    },
  },

  orc_cadastrar_carro: {
    label: 'Cadastrar carro para cliente existente',
    def: {
      description: 'Cadastra um carro para um cliente que já existe (sem carro, ou carro novo). EXIGE o modelo (modelo_obrigatorio: pergunte o modelo, não só o ano); marca e ano também devem ser perguntados. Não duplica placa (devolve o carro que já existe).',
      input_schema: {
        type: 'object', additionalProperties: false, required: ['cliente_id', 'modelo'],
        properties: {
          cliente_id: { type: 'string', description: 'Da busca, desta mesma vez' },
          marca: { type: 'string' }, modelo: { type: 'string' }, ano: { type: 'integer' }, placa: { type: 'string' },
        },
      },
    },
    run: async (db, ws, i) => {
      const c = uuid(i.cliente_id);
      if (!c) return err('cliente_id_invalido: busque o cliente de novo');
      return rpc(db, 'orc_add_vehicle', { p_workshop: ws, p_customer: c, p_marca: str(i.marca, 60) || null, p_modelo: str(i.modelo, 60) || null, p_ano: int(i.ano), p_placa: str(i.placa, 12) || null });
    },
  },

  orc_consultar_placa: {
    label: 'Consulta de placa (descobre o carro)',
    def: {
      description: 'Descobre o carro pela PLACA (marca, modelo, versão, ano, combustível), usando a mesma consulta técnica da tela: primeiro o carro já cadastrado na oficina, depois o histórico de placas consultadas e por fim o serviço de consulta de placa. Use quando o dono passar só a placa e orc_buscar_cliente não achar o carro. Não grava nada: depois cadastre o cliente com o carro (orc_cadastrar_cliente) usando marca, modelo e ano devolvidos. Status: found (use "carro"), not_found (placa não achada: pergunte o modelo e o ano), invalid (placa inválida), limit/unavailable/not_configured (diga que a consulta não está disponível agora e pergunte o modelo e o ano).',
      input_schema: { type: 'object', additionalProperties: false, required: ['placa'], properties: { placa: { type: 'string', description: 'Ex.: ABC1D23' } } },
    },
    run: async (_db, ws, i, ctx) => {
      const placa = str(i.placa, 12).toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (!placa) return err('placa_obrigatoria');
      if (!ctx.authHeader) return err('sem_credencial');
      const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/tech-plate-lookup`, {
        method: 'POST',
        headers: { Authorization: ctx.authHeader, 'Content-Type': 'application/json', apikey: Deno.env.get('SUPABASE_ANON_KEY') ?? '' },
        body: JSON.stringify({ workshop_id: ws, plate: placa }),
        signal: AbortSignal.timeout(30000),
      });
      const out = await res.json().catch(() => null) as { status?: string; error?: string; car?: unknown; source?: string } | null;
      if (!res.ok) return err(out?.error ?? `consulta_placa_${res.status}`);
      return { ok: true, placa, ...(out ?? {}) };
    },
  },

  orc_ficha_tecnica: {
    label: 'Consulta técnica (óleo e filtros do carro)',
    def: {
      description: [
        'Consulta a ficha técnica do carro da OS: óleo (viscosidade, norma, litros da ficha e litros no kit, já arredondados para cima) e filtros (óleo, ar, combustível, cabine), cruzados com as peças do cadastro da oficina, mais uma sugestao_kit.',
        'Resultados: carro_sem_modelo (complete o carro com orc_atualizar_carro); motivo "escolher_versao" (várias versões: pergunte ao dono e chame de novo com "versao" em texto, ex.: "LT 1.0"); motivo "modelo_sem_ficha" (o modelo não está no catálogo); ou a ficha com verificada=true/false.',
        'verificada=false significa ficha em RASCUNHO (ainda não conferida): o dono precisa conferir antes de você salvar qualquer coisa. Não grava nada.',
      ].join(' '),
      input_schema: {
        type: 'object', additionalProperties: false, required: ['os_numero'],
        properties: {
          os_numero: { type: 'integer' },
          versao: { type: 'string', description: 'A versão/motor que o dono escolheu, em texto (ex.: "LT 1.0", "1.4 8V")' },
          ficha_id: { type: 'string', description: 'Só se veio de uma resposta de ferramenta desta mesma vez' },
          servico_id: { type: 'string', description: 'Para saber se já existe kit deste serviço para este carro' },
        },
      },
    },
    run: async (db, ws, i) => {
      const os = int(i.os_numero);
      if (os == null) return err('os_numero_obrigatorio');
      if (i.ficha_id && !uuid(i.ficha_id)) return err('ficha_id_invalido: use a versão em texto');
      const out = await rpc(db, 'orc_tech_sheet', {
        p_workshop: ws, p_os_number: os, p_ficha: uuid(i.ficha_id), p_servico: uuid(i.servico_id), p_escolha: str(i.versao, 80) || null,
      }) as { ok?: boolean; ficha?: { ficha_id: string } | null; motivo?: string; carro?: { modelo?: string; ano?: number } };
      // Registra a busca como a tela faz: é o que diz ao admin quais modelos cadastrar primeiro
      if (out?.ok && (out.ficha || out.motivo === 'modelo_sem_ficha') && out.carro?.modelo) {
        await db.from('tech_lookup_log').insert({ workshop_id: ws, query: out.carro.modelo, year: out.carro.ano ?? null, vehicle_id: out.ficha?.ficha_id ?? null });
      }
      return out;
    },
  },

  orc_salvar_kit_ficha: {
    label: 'Salvar peças e kit da ficha (e conferir a ficha)',
    def: {
      description: [
        'GRAVA: cria no cadastro as peças que faltam, monta o KIT do serviço para este carro na Tabela de serviços, vincula o carro à ficha e, com conferir_ficha=true, marca a ficha como conferida (vale para todas as oficinas).',
        'SÓ chame depois que o dono disser SIM, nesta conversa, ao que você explicou. Use conferir_ficha=true só se ele concordou em marcar a ficha como conferida.',
        'pecas: [{tipo: oleo | filtro_oleo | filtro_ar | filtro_combustivel | filtro_cabine, nome, qtd, custo?, marca?, codigo?}]. Peça que já existe no cadastro entra pelo nome igual; peça nova EXIGE custo (óleo: custo por litro). Óleo: qtd em litros inteiros (litros_no_kit).',
        'Devolve revisar_pecas (sem_custo etc.) sem gravar nada, ou o que foi criado.',
      ].join(' '),
      input_schema: {
        type: 'object', additionalProperties: false, required: ['os_numero', 'pecas'],
        properties: {
          os_numero: { type: 'integer' },
          servico_nome: { type: 'string', description: 'Ex.: Troca de óleo' },
          servico_id: { type: 'string', description: 'Só se veio de uma resposta de ferramenta desta mesma vez' },
          versao: { type: 'string', description: 'A versão/motor da ficha escolhida, em texto, se o carro ainda não está vinculado' },
          ficha_id: { type: 'string', description: 'Só se veio de uma resposta de ferramenta desta mesma vez' },
          conferir_ficha: { type: 'boolean' },
          pecas: {
            type: 'array', minItems: 1, maxItems: 8,
            items: {
              type: 'object', additionalProperties: false, required: ['tipo', 'nome'],
              properties: {
                tipo: { type: 'string', enum: ['oleo', 'filtro_oleo', 'filtro_ar', 'filtro_combustivel', 'filtro_cabine'] },
                nome: { type: 'string' }, qtd: { type: 'number' }, custo: { type: 'number' }, marca: { type: 'string' }, codigo: { type: 'string' },
              },
            },
          },
        },
      },
    },
    run: async (db, ws, i, ctx) => {
      const os = int(i.os_numero);
      if (os == null) return err('os_numero_obrigatorio');
      const svc = await resolveService(db, ws, i.servico_id, i.servico_nome);
      if ('error' in svc) return svc.error;
      let ficha = uuid(i.ficha_id);
      if (!ficha) {
        const sh = await rpc(db, 'orc_tech_sheet', { p_workshop: ws, p_os_number: os, p_ficha: null, p_servico: svc.id, p_escolha: str(i.versao, 80) || null }) as
          { ok?: boolean; ficha?: { ficha_id: string } | null; motivo?: string; candidatos?: unknown };
        if (!sh?.ok) return sh;
        if (!sh.ficha?.ficha_id) return { ok: false, error: 'ficha_nao_definida', motivo: sh.motivo, candidatos: sh.candidatos };
        ficha = sh.ficha.ficha_id;
      }
      const pecas = (Array.isArray(i.pecas) ? i.pecas : []).slice(0, 8).map((p) => {
        const o = (p ?? {}) as Input;
        return { tipo: str(o.tipo, 30), nome: str(o.nome, 120), qtd: dec(o.qtd) ?? 1, custo: dec(o.custo), marca: str(o.marca, 60) || null, codigo: str(o.codigo, 60) || null };
      });
      return rpc(db, 'orc_save_kit', {
        p_workshop: ws, p_os_number: os, p_servico: svc.id, p_ficha: ficha, p_pecas: pecas, p_verify: i.conferir_ficha === true, p_user: ctx.userId,
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

  orc_alterar_item: {
    label: 'Alterar item da OS (serviço e peças)',
    def: {
      description: [
        'Altera um serviço da OS ABERTA (não vale para OS concluída ou cancelada), pelo NÚMERO do serviço na OS (1, 2, … na ordem em que foi lançado; veja em orc_resumo_os).',
        'acao: alterar_servico (nome e/ou preco do serviço), remover_servico (tira o serviço e as peças dele), alterar_peca (qtd e/ou custo de uma peça do serviço), remover_peca, adicionar_peca (peça do cadastro pelo nome; fora do cadastro EXIGE custo).',
        'Antes de mudar, diga ao dono o antes e o depois (e, em remover, o que vai sair) e só aplique com o "sim" dele (confirmado=true); mudança que ele pediu com todos os dados claros ("troca o preço do item 2 para 180") já conta como pedido, mas remover sempre confirme.',
        'Devolve os servicos da OS já atualizados (n, servico, preco, pecas) e o total_os. Erros: varias_pecas (pergunte qual), peca_nao_encontrada_no_servico, varias_no_cadastro, sem_cadastro_informe_o_custo.',
      ].join(' '),
      input_schema: {
        type: 'object', additionalProperties: false, required: ['os_numero', 'item_numero', 'acao'],
        properties: {
          os_numero: { type: 'integer' },
          item_numero: { type: 'integer', description: 'Número do serviço na OS (1, 2, …)' },
          acao: { type: 'string', enum: ['alterar_servico', 'remover_servico', 'alterar_peca', 'remover_peca', 'adicionar_peca'] },
          nome: { type: 'string', description: 'Novo nome do serviço (alterar_servico)' },
          preco: { type: 'number', description: 'Novo valor do serviço (alterar_servico)' },
          peca: { type: 'string', description: 'Nome da peça (alterar_peca, remover_peca, adicionar_peca)' },
          qtd: { type: 'number', description: 'Quantidade (alterar_peca, adicionar_peca)' },
          custo: { type: 'number', description: 'Custo unitário da peça (alterar_peca, adicionar_peca fora do cadastro)' },
          confirmado: { type: 'boolean', description: 'true: o dono confirmou (obrigatório em remover_servico e remover_peca)' },
        },
      },
    },
    run: async (db, ws, i) => {
      const os = int(i.os_numero), item = int(i.item_numero), acao = str(i.acao, 30);
      if (os == null || item == null) return err('os_numero_e_item_numero_obrigatorios');
      if ((acao === 'remover_servico' || acao === 'remover_peca') && i.confirmado !== true) return err('sem_confirmacao_do_dono: mostre o que vai sair e peça o "sim"');
      return rpc(db, 'orc_edit_item', {
        p_workshop: ws, p_os_number: os, p_item_number: item, p_acao: acao,
        p_nome: str(i.nome, 200) || null, p_preco: dec(i.preco), p_peca: str(i.peca, 120) || null, p_qtd: dec(i.qtd), p_custo: dec(i.custo),
      });
    },
  },

  orc_cancelar_os: {
    label: 'Cancelar a OS',
    def: {
      description: 'Cancela a OS pelo número (o estoque volta como na tela). Use SÓ depois do "sim" do dono nesta conversa. Com nao_aprovado=true marca como orçamento não aprovado pelo cliente (fica salvo para retomar o contato). Não cancela OS concluída nem com recebimento lançado (os_concluida_nao_cancela / os_com_recebimento: o dono resolve pelo caixa ou pela tela da OS).',
      input_schema: {
        type: 'object', additionalProperties: false, required: ['os_numero'],
        properties: { os_numero: { type: 'integer' }, nao_aprovado: { type: 'boolean', description: 'true = o cliente não aprovou o orçamento' } },
      },
    },
    run: async (db, ws, i) => {
      const os = int(i.os_numero);
      if (os == null) return err('os_numero_obrigatorio');
      return rpc(db, 'orc_cancel_os', { p_workshop: ws, p_os_number: os, p_declined: i.nao_aprovado === true });
    },
  },

  orc_corrigir_cadastro: {
    label: 'Corrigir cadastro do cliente e do carro',
    def: {
      description: 'CORRIGE (troca) dados já cadastrados: nome, telefone e e-mail do cliente; marca, modelo, ano e placa do carro. Informe os_numero (cliente e carro da OS) ou cliente_id/veiculo_id (desta mesma vez) e só os campos que mudam. Use só depois do "sim" do dono. Não duplica telefone nem placa (erro telefone_ja_cadastrado / placa_ja_cadastrada: diga de quem é). Se mudar modelo ou ano, a ficha técnica do carro é solta: consulte de novo com orc_ficha_tecnica. Para só PREENCHER campo vazio use orc_atualizar_carro.',
      input_schema: {
        type: 'object', additionalProperties: false,
        properties: {
          os_numero: { type: 'integer' }, cliente_id: { type: 'string' }, veiculo_id: { type: 'string' },
          nome: { type: 'string' }, telefone: { type: 'string' }, email: { type: 'string' },
          marca: { type: 'string' }, modelo: { type: 'string' }, ano: { type: 'integer' }, placa: { type: 'string' },
        },
      },
    },
    run: async (db, ws, i) => {
      const os = int(i.os_numero), c = uuid(i.cliente_id), v = uuid(i.veiculo_id);
      if (os == null && !c && !v) return err('informe_os_numero_ou_ids');
      return rpc(db, 'orc_fix_registration', {
        p_workshop: ws, p_os_number: os, p_customer: c, p_vehicle: v,
        p_nome: str(i.nome, 100) || null, p_telefone: str(i.telefone, 30) || null, p_email: str(i.email, 120) || null,
        p_marca: str(i.marca, 60) || null, p_modelo: str(i.modelo, 60) || null, p_ano: int(i.ano), p_placa: str(i.placa, 12) || null,
      });
    },
  },

  orc_pecas_resumo: {
    label: 'Cadastro de peças: diagnóstico',
    def: {
      description: 'Fotografia do cadastro de peças da oficina: ativas, categoria "outros", sem marca, sem código, sem veículo vinculado, universais, por categoria e quantos grupos de peças repetidas (por nome+marca e por código+marca). Use para começar qualquer organização do cadastro.',
      input_schema: noProps,
    },
    run: async (db, ws) => rpc(db, 'orc_parts_overview', { p_workshop: ws }),
  },

  orc_pecas_listar: {
    label: 'Cadastro de peças: listar por problema',
    def: {
      description: 'Lista peças ativas (até 40 por vez) com categoria, marca, código, custo, estoque e os veículos já vinculados. problema: "outros" (categoria Outros), "sem_marca", "sem_codigo", "sem_veiculo" (sem carro vinculado e não universal). Também filtra por categoria e por busca (nome, marca ou código). Para a próxima página use offset = proximo_offset. Os peca_id valem só nesta mesma vez: edite logo em seguida.',
      input_schema: {
        type: 'object', additionalProperties: false,
        properties: {
          problema: { type: 'string', enum: ['outros', 'sem_marca', 'sem_codigo', 'sem_veiculo'] },
          categoria: { type: 'string', enum: PART_CATEGORIES },
          busca: { type: 'string' }, limite: { type: 'integer' }, offset: { type: 'integer' },
        },
      },
    },
    run: async (db, ws, i) => rpc(db, 'orc_parts_list', {
      p_workshop: ws, p_problema: str(i.problema, 20) || null, p_categoria: str(i.categoria, 30) || null,
      p_busca: str(i.busca, 80) || null, p_limit: int(i.limite) ?? 30, p_offset: int(i.offset) ?? 0,
    }),
  },

  orc_pecas_corrigir: {
    label: 'Cadastro de peças: corrigir categoria, marca e veículos',
    def: {
      description: 'Corrige até 50 peças por chamada: categoria, marca, nome, código, universal e VINCULA veículos (marca, modelo, ano_de, ano_ate; modelo vazio = todos os modelos da marca; sem ano = qualquer ano). Os veículos informados são ACRESCENTADOS aos que já existem (substituir_veiculos=true troca a lista). Use os peca_id de orc_pecas_listar desta mesma vez. Só aplique depois de mostrar ao dono o que vai mudar e ter o "sim" dele (pode ser um "sim" para o lote inteiro). Categorias válidas: ' + PART_CATEGORIES.join(', ') + '.',
      input_schema: {
        type: 'object', additionalProperties: false, required: ['pecas'],
        properties: {
          pecas: {
            type: 'array', maxItems: 50,
            items: {
              type: 'object', additionalProperties: false, required: ['peca_id'],
              properties: {
                peca_id: { type: 'string' }, categoria: { type: 'string', enum: PART_CATEGORIES },
                marca: { type: 'string' }, nome: { type: 'string' }, codigo: { type: 'string' }, universal: { type: 'boolean' },
                substituir_veiculos: { type: 'boolean' },
                veiculos: {
                  type: 'array', maxItems: 20,
                  items: { type: 'object', additionalProperties: false, required: ['marca'], properties: { marca: { type: 'string' }, modelo: { type: 'string' }, ano_de: { type: 'integer' }, ano_ate: { type: 'integer' } } },
                },
              },
            },
          },
        },
      },
    },
    run: async (db, ws, i) => {
      const list = Array.isArray(i.pecas) ? i.pecas.slice(0, 50) : [];
      if (!list.length) return err('lista_vazia');
      return rpc(db, 'orc_parts_edit', { p_workshop: ws, p_items: list });
    },
  },

  orc_pecas_duplicadas: {
    label: 'Cadastro de peças: achar duplicadas',
    def: {
      description: 'Mostra grupos de peças repetidas (mesmo nome e marca, ou mesmo código e marca), até 25 grupos por vez, com custo, estoque, categoria, quantos usos (OS, compras, kits) e veículos de cada peça. Próxima página: offset = proximo_offset. Os peca_id valem só nesta mesma vez: una logo em seguida, depois do "sim" do dono.',
      input_schema: { type: 'object', additionalProperties: false, properties: { limite: { type: 'integer' }, offset: { type: 'integer' } } },
    },
    run: async (db, ws, i) => rpc(db, 'orc_parts_duplicates', { p_workshop: ws, p_limit: int(i.limite) ?? 15, p_offset: int(i.offset) ?? 0 }),
  },

  orc_pecas_unir: {
    label: 'Cadastro de peças: unir duplicadas',
    def: {
      description: 'Une peças repetidas: em cada grupo, a peça "manter" recebe tudo das "remover" (OS, compras, histórico de estoque, kits da Tabela de serviços e veículos vinculados; completa marca/código vazios) e as removidas ficam DESATIVADAS (nada é apagado). somar_estoque=true soma o estoque das removidas na que fica; deixe false quando o estoque parece contado em duplicidade, e pergunte ao dono se os dois têm estoque. Escolha para manter a peça mais completa (com marca, código, mais usos). Até 25 grupos por chamada. Só depois do "sim" do dono.',
      input_schema: {
        type: 'object', additionalProperties: false, required: ['grupos'],
        properties: {
          grupos: {
            type: 'array', maxItems: 25,
            items: {
              type: 'object', additionalProperties: false, required: ['manter', 'remover'],
              properties: { manter: { type: 'string' }, remover: { type: 'array', items: { type: 'string' } }, somar_estoque: { type: 'boolean' } },
            },
          },
        },
      },
    },
    run: async (db, ws, i) => {
      const list = Array.isArray(i.grupos) ? i.grupos.slice(0, 25) : [];
      if (!list.length) return err('lista_vazia');
      return rpc(db, 'orc_parts_merge', { p_workshop: ws, p_groups: list });
    },
  },

  orc_pecas_excluir: {
    label: 'Cadastro de peças: excluir',
    def: {
      description: 'EXCLUI peças do cadastro (até 50 por chamada), com os peca_id de orc_pecas_listar ou orc_pecas_duplicadas DESTA mesma vez. Peça sem nenhum uso é apagada de verdade; peça que já foi usada em OS, compra, estoque, kit ou check-up não pode ser apagada sem quebrar o histórico e fica ARQUIVADA (desativada). Use SÓ depois de mostrar ao dono a lista exata (nome, marca, código, estoque) e ter o "sim" dele para ESTA lista (confirmado=true). Não use para duplicadas: nelas prefira orc_pecas_unir, que preserva o histórico.',
      input_schema: {
        type: 'object', additionalProperties: false, required: ['peca_ids', 'confirmado'],
        properties: {
          peca_ids: { type: 'array', maxItems: 50, items: { type: 'string' } },
          confirmado: { type: 'boolean', description: 'true só depois do "sim" do dono para esta lista' },
        },
      },
    },
    run: async (db, ws, i) => {
      if (i.confirmado !== true) return err('sem_confirmacao_do_dono: mostre a lista e peça o "sim"');
      const ids = Array.isArray(i.peca_ids) ? i.peca_ids.map(uuid).filter((x): x is string => !!x).slice(0, 50) : [];
      if (!ids.length) return err('lista_vazia');
      return rpc(db, 'orc_parts_remove', { p_workshop: ws, p_ids: ids });
    },
  },

  orc_fechar_os: {
    label: 'Fechar a OS (receber e concluir)',
    def: {
      description: [
        'FECHA a OS: registra o recebimento no caixa ABERTO, combina "pagar depois" se sobrar saldo e marca a OS como concluída (baixa o estoque das peças). É o mesmo que "Receber OS" + "Concluir" da tela.',
        'SÓ chame depois de: (1) orc_resumo_os para a OS; (2) mostrar ao gestor o RESUMO (valor da OS e em aberto, formas de pagamento com valores, custo de peças, comissões por pessoa e total, avisos) e perguntar "posso fechar?"; (3) ter o "sim" dele NESTA conversa. Sem o sim, confirmado=false: não grava nada.',
        'formas: [{forma: dinheiro | pix | debito | credito, valor, parcelas?}]. valor_em_aberto_aprovado = o "em aberto" que você mostrou (se o valor mudou, não fecha). Se as formas não cobrem tudo, informe pagar_depois_vencimento (AAAA-MM-DD) para o saldo. Sem desconto aqui.',
        'Erros que você resolve conversando: faltam_responsaveis (defina com orc_definir_responsavel), caixa_fechado (peça para o gestor abrir o caixa), valor_mudou (refaça o resumo), falta_valor, so_gestor_fecha_a_os.',
      ].join(' '),
      input_schema: {
        type: 'object', additionalProperties: false, required: ['os_numero', 'valor_em_aberto_aprovado', 'confirmado'],
        properties: {
          os_numero: { type: 'integer' },
          valor_em_aberto_aprovado: { type: 'number', description: 'O valor em aberto que o gestor aprovou no resumo' },
          formas: {
            type: 'array', maxItems: 6,
            items: {
              type: 'object', additionalProperties: false, required: ['forma', 'valor'],
              properties: { forma: { type: 'string', enum: ['dinheiro', 'pix', 'debito', 'credito'] }, valor: { type: 'number' }, parcelas: { type: 'integer' } },
            },
          },
          pagar_depois_vencimento: { type: 'string', description: 'AAAA-MM-DD, quando o saldo restante fica para pagar depois' },
          pagar_depois_obs: { type: 'string' },
          confirmado: { type: 'boolean', description: 'true só depois do "sim" do gestor ao resumo' },
        },
      },
    },
    run: async (db, ws, i, ctx) => {
      if (i.confirmado !== true) return err('sem_confirmacao_do_gestor: mostre o resumo e peça o "sim"');
      const os = int(i.os_numero), esperado = dec(i.valor_em_aberto_aprovado);
      if (os == null || esperado == null) return err('os_numero_e_valor_em_aberto_obrigatorios');
      const formas = (Array.isArray(i.formas) ? i.formas : []).slice(0, 6).map((f: any) => ({
        method: str(f?.forma, 20), amount: dec(f?.valor), installments: int(f?.parcelas) ?? 1,
      }));
      const due = str(i.pagar_depois_vencimento, 10);
      if (due && !/^\d{4}-\d{2}-\d{2}$/.test(due)) return err('vencimento_invalido: use AAAA-MM-DD');
      return rpc(db, 'orc_close_os', {
        p_workshop: ws, p_user: ctx.userId, p_os_number: os, p_parts: formas, p_expected: esperado,
        p_later_due: due || null, p_later_note: str(i.pagar_depois_obs, 200) || null,
      });
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
