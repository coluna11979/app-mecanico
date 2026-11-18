// Ferramentas do "Acompanhante de cadastros" (agente do ADMIN da plataforma).
// Lê o funil de cadastro (mecânicos e oficinas) e prepara/envia e-mails: lembretes individuais (mesmo caminho da tela de
// Aprovações: mensagem no histórico + e-mail pelo send-approval-email) e campanhas (marketing-email: descadastro e consentimento
// de leads valem). Quem chama é conferido como admin na agent-chat; as funções de e-mail conferem de novo com o JWT do admin.
//
// As ferramentas não guardam estado (o chat só lembra o texto): o envio aceita ids da MESMA vez ou uma "seleção" (tipo, estágio,
// dias parado) que é resolvida de novo no servidor, com a contagem que o admin aprovou como trava.
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';

type Input = Record<string, unknown>;
export type AdmCtx = { userId: string; authHeader?: string };
export type AdmToolDef = {
  label: string;
  def: { description: string; input_schema: Record<string, unknown> };
  run: (db: SupabaseClient, ws: string, input: Input, ctx: AdmCtx) => Promise<unknown>;
};

const str = (v: unknown, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const int = (v: unknown) => { const n = Number(v); return v != null && v !== '' && Number.isFinite(n) ? Math.trunc(n) : null; };
const uuid = (v: unknown) => (typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v) ? v : null);
const err = (error: string, extra: Record<string, unknown> = {}) => ({ ok: false, error, ...extra });

async function rpc(db: SupabaseClient, fn: string, args: Record<string, unknown>) {
  const { data, error } = await db.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data;
}

/** Chama uma edge function como o próprio admin (as funções conferem o papel de admin) */
async function callFn(name: string, body: unknown, ctx: AdmCtx) {
  if (!ctx.authHeader) throw new Error('sem credencial do admin');
  const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/${name}`, {
    method: 'POST',
    headers: { Authorization: ctx.authHeader, 'Content-Type': 'application/json', apikey: Deno.env.get('SUPABASE_ANON_KEY') ?? '' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* texto puro */ }
  if (!res.ok) throw new Error(`${name} ${res.status}: ${(json?.error ?? text).toString().slice(0, 200)}`);
  return json;
}

const ESTAGIOS = ['aguardando_cliente', 'respondeu_aguardando_analise', 'cadastro_incompleto', 'aguardando_analise', 'em_espera_regiao', 'aprovado', 'rejeitado'];

const selecaoSchema = {
  type: 'object', additionalProperties: false,
  description: 'Seleção resolvida no servidor na hora do envio (use isto nas conversas em que você não tem mais os ids)',
  properties: {
    tipo: { type: 'string', enum: ['mechanic', 'workshop'] },
    estagio: { type: 'string', enum: ESTAGIOS },
    min_dias_parado: { type: 'integer' },
    busca: { type: 'string', description: 'Nome, telefone ou cidade' },
  },
};

const segmentoSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    audience: { type: 'string', enum: ['mechanic', 'workshop', 'all'], description: 'Quem recebe' },
    status: { type: 'string', enum: ['pending', 'approved', 'all'], description: 'pending = cadastro pendente ou em análise (NÃO inclui os em espera por região); approved = já aprovados' },
    state: { type: 'string', description: 'UF, ex.: SP' },
    include_leads: { type: 'boolean', description: 'Inclui leads com consentimento' },
  },
};

const conteudoSchema = {
  type: 'object', additionalProperties: false, required: ['assunto', 'titulo', 'texto'],
  properties: {
    assunto: { type: 'string' }, titulo: { type: 'string' },
    texto: { type: 'string', description: 'Corpo do e-mail; parágrafos separados por linha em branco; {nome} vira o primeiro nome' },
    botao: { type: 'string', description: 'Texto do botão (opcional)' }, link: { type: 'string', description: 'Link do botão (opcional; só https)' },
  },
};

function toContent(c: Input) {
  const link = str(c.link, 300);
  return {
    subject: str(c.assunto, 150), heading: str(c.titulo, 120), body: str(c.texto, 5000),
    cta_label: str(c.botao, 60) || undefined, cta_url: /^https:\/\//i.test(link) ? link : undefined,
  };
}

export const ADM_TOOLS: Record<string, AdmToolDef> = {
  adm_funil_resumo: {
    label: 'Funil de cadastro: resumo',
    def: {
      description: 'Resumo do funil de cadastro (mecânicos e oficinas): totais por status e, dos que ainda estão em andamento, quantos estão em cada estágio e quantos parados há mais de 7 dias. Estágios: aguardando_cliente (documentos pedidos e sem resposta), respondeu_aguardando_analise (o cadastrado respondeu, falta o admin analisar), cadastro_incompleto (campos vazios), aguardando_analise, em_espera_regiao. Comece por aqui.',
      input_schema: { type: 'object', additionalProperties: false, properties: {} },
    },
    run: async (db) => rpc(db, 'adm_funnel_summary', {}),
  },

  adm_funil_listar: {
    label: 'Funil de cadastro: listar quem falta o quê',
    def: {
      description: 'Lista cadastros (até 50 por vez, os mais parados primeiro) com tipo, status, estágio, dias parado, o que falta preencher, documentos pedidos, respostas e anexos, resultado da última verificação e se tem e-mail. Sem estágio traz todos os em andamento (sem aprovados nem rejeitados). Filtros: tipo, estágio, mínimo de dias parado, busca por nome/telefone/cidade. Próxima página: offset = proximo_offset.',
      input_schema: {
        type: 'object', additionalProperties: false,
        properties: {
          tipo: { type: 'string', enum: ['mechanic', 'workshop'] }, estagio: { type: 'string', enum: ESTAGIOS },
          min_dias_parado: { type: 'integer' }, busca: { type: 'string' }, limite: { type: 'integer' }, offset: { type: 'integer' },
        },
      },
    },
    run: async (db, _ws, i) => rpc(db, 'adm_funnel_list', {
      p_tipo: str(i.tipo, 20) || null, p_estagio: str(i.estagio, 40) || null, p_busca: str(i.busca, 80) || null,
      p_min_dias: int(i.min_dias_parado), p_limit: int(i.limite) ?? 30, p_offset: int(i.offset) ?? 0,
    }),
  },

  adm_cadastro_detalhe: {
    label: 'Cadastro: detalhe e histórico de mensagens',
    def: {
      description: 'Detalhe de UM cadastro (perfil_id de adm_funil_listar, desta mesma vez): o que falta, documentos, verificação, notas do admin e as últimas 10 mensagens do histórico de aprovação (pedidos de documentos, respostas, mudanças de status).',
      input_schema: { type: 'object', additionalProperties: false, required: ['perfil_id'], properties: { perfil_id: { type: 'string' } } },
    },
    run: async (db, _ws, i) => {
      const id = uuid(i.perfil_id);
      if (!id) return err('perfil_id_invalido: liste de novo e use o perfil_id desta vez');
      return rpc(db, 'adm_funnel_detail', { p_profile: id });
    },
  },

  adm_enviar_lembrete: {
    label: 'Enviar lembrete / pedido de documentos',
    def: {
      description: [
        'Envia o lembrete de documentos (ou uma mensagem) para até 50 cadastros: grava no histórico do cadastro e manda o e-mail, igual ao botão "Solicitar documentos" da tela de Aprovações.',
        'Use SÓ depois que o admin aprovou, nesta conversa, o TEXTO e QUEM recebe (confirmado=true).',
        'Informe perfil_ids (desta mesma vez) OU selecao (tipo, estágio, dias parado: resolvida de novo aqui) junto com destinatarios_esperados = quantos o admin aprovou; se o número de agora for diferente, nada é enviado e você mostra o novo número ao admin.',
        'Não envia para aprovados, rejeitados nem para quem está em espera por região (a região ainda não abriu). {nome} no texto vira o primeiro nome.',
      ].join(' '),
      input_schema: {
        type: 'object', additionalProperties: false, required: ['mensagem', 'confirmado'],
        properties: {
          mensagem: { type: 'string' },
          tipo: { type: 'string', enum: ['request_documents', 'note'], description: 'request_documents (padrão) = pedido de documentos; note = mensagem simples' },
          perfil_ids: { type: 'array', maxItems: 50, items: { type: 'string' } },
          selecao: selecaoSchema,
          destinatarios_esperados: { type: 'integer' },
          confirmado: { type: 'boolean', description: 'true só depois do "sim" do admin' },
        },
      },
    },
    run: async (db, _ws, i, ctx) => {
      if (i.confirmado !== true) return err('sem_confirmacao_do_admin: mostre o texto e quem recebe e peça o "sim"');
      const mensagem = str(i.mensagem, 2000);
      if (mensagem.length < 10) return err('mensagem_curta');
      const kind = i.tipo === 'note' ? 'note' : 'request_documents';

      let alvos: { id: string; nome: string; status: string }[] = [];
      const ids = Array.isArray(i.perfil_ids) ? i.perfil_ids.map(uuid).filter((x): x is string => !!x).slice(0, 50) : [];
      if (ids.length) {
        const { data } = await db.from('profiles').select('id, full_name, status, role').in('id', ids).in('role', ['mechanic', 'workshop']);
        alvos = (data ?? []).map((p: any) => ({ id: p.id, nome: p.full_name ?? '', status: p.status }));
      } else if (i.selecao && typeof i.selecao === 'object') {
        const s = i.selecao as Input;
        const esperado = int(i.destinatarios_esperados);
        if (esperado == null) return err('informe_destinatarios_esperados');
        const out = await rpc(db, 'adm_funnel_list', {
          p_tipo: str(s.tipo, 20) || null, p_estagio: str(s.estagio, 40) || null, p_busca: str(s.busca, 80) || null,
          p_min_dias: int(s.min_dias_parado), p_limit: 50, p_offset: 0,
        }) as { total: number; cadastros: { perfil_id: string; nome: string; status: string }[] };
        if (out.total > 50) return err('selecao_grande_demais', { total_agora: out.total, dica: 'Afunile a seleção (tipo, estágio, dias parado) para até 50.' });
        if (out.total !== esperado) return err('contagem_mudou', { total_agora: out.total, esperado, dica: 'Mostre o número atual ao admin e peça um novo sim.' });
        alvos = out.cadastros.map((c) => ({ id: c.perfil_id, nome: c.nome ?? '', status: c.status }));
      } else {
        return err('informe_perfil_ids_ou_selecao');
      }
      if (!alvos.length) return err('ninguem_na_selecao');

      const enviados: string[] = [], pulados: { nome: string; motivo: string }[] = [], falhas: { nome: string; motivo: string }[] = [];
      for (const a of alvos) {
        if (['approved', 'rejected', 'awaiting_region'].includes(a.status)) { pulados.push({ nome: a.nome, motivo: `status ${a.status}` }); continue; }
        try {
          const primeiro = a.nome.trim().split(/\s+/)[0] || 'parceiro';
          const content = mensagem.replaceAll('{nome}', primeiro);
          if (kind === 'request_documents' && a.status === 'pending') await db.from('profiles').update({ status: 'under_review' }).eq('id', a.id);
          const { error } = await db.from('approval_messages').insert({ profile_id: a.id, sender_id: ctx.userId, sender_role: 'admin', kind, content });
          if (error) throw new Error(error.message);
          const r = await callFn('send-approval-email', { profile_id: a.id, content, kind }, ctx);
          if (r?.skipped) throw new Error('e-mail não configurado (Resend)');
          enviados.push(a.nome);
        } catch (e) {
          falhas.push({ nome: a.nome, motivo: e instanceof Error ? e.message.slice(0, 150) : 'erro' });
        }
      }
      return { ok: true, enviados: enviados.length, nomes_enviados: enviados, pulados, falhas };
    },
  },

  adm_campanha_previa: {
    label: 'Campanha de e-mail: quantos recebem',
    def: {
      description: 'Conta quantas pessoas receberiam uma campanha para o segmento (sem enviar nada). Descadastrados nunca entram e leads só com consentimento. Use antes de propor o envio e para a trava do envio.',
      input_schema: { type: 'object', additionalProperties: false, required: ['segmento'], properties: { segmento: segmentoSchema } },
    },
    run: async (_db, _ws, i, ctx) => callFn('marketing-email', { action: 'preview', segment: i.segmento ?? {} }, ctx),
  },

  adm_campanha_teste: {
    label: 'Campanha de e-mail: teste para o admin',
    def: {
      description: 'Manda UMA cópia de teste da campanha para o e-mail do próprio admin (nenhum cliente recebe). Use para o admin ver o e-mail antes de aprovar o envio.',
      input_schema: { type: 'object', additionalProperties: false, required: ['conteudo'], properties: { conteudo: conteudoSchema } },
    },
    run: async (_db, _ws, i, ctx) => callFn('marketing-email', { action: 'test', content: toContent((i.conteudo ?? {}) as Input) }, ctx),
  },

  adm_campanha_enviar: {
    label: 'Campanha de e-mail: enviar',
    def: {
      description: 'ENVIA a campanha de e-mail para o segmento (em lotes, com link de descadastro). Use SÓ depois de o admin ter visto o texto, a contagem e dado o "sim" nesta conversa (confirmado=true). destinatarios_esperados = o número que ele aprovou; se a contagem de agora for diferente, nada é enviado.',
      input_schema: {
        type: 'object', additionalProperties: false, required: ['segmento', 'conteudo', 'destinatarios_esperados', 'confirmado'],
        properties: { segmento: segmentoSchema, conteudo: conteudoSchema, destinatarios_esperados: { type: 'integer' }, confirmado: { type: 'boolean' } },
      },
    },
    run: async (_db, _ws, i, ctx) => {
      if (i.confirmado !== true) return err('sem_confirmacao_do_admin: mostre o e-mail, a contagem e peça o "sim"');
      const esperado = int(i.destinatarios_esperados);
      const seg = i.segmento ?? {};
      const prev = await callFn('marketing-email', { action: 'preview', segment: seg }, ctx) as { count?: number };
      if (esperado == null || prev?.count !== esperado) return err('contagem_mudou', { total_agora: prev?.count ?? null, esperado, dica: 'Mostre o número atual ao admin e peça um novo sim.' });
      const content = toContent((i.conteudo ?? {}) as Input);
      if (!content.subject || !content.heading || !content.body) return err('conteudo_incompleto');
      return callFn('marketing-email', { action: 'send', segment: seg, content }, ctx);
    },
  },
};
