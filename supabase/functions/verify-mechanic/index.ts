// Verificação de cadastro de mecânico via Infosimples — disparada pelo admin em Aprovações.
// Roda 3 consultas em paralelo (CPF na Receita, antecedentes na PF, mandados no CNJ) em
// segundo plano e grava uma linha em mechanic_verifications assim que cada uma termina.
// Responde na hora (202): o gateway corta respostas com mais de 150s e o CNJ às vezes
// passa disso — a tela acompanha pelos registros gravados.
// Token vem de app_settings.infosimples_token (Admin → Configurações), nunca do navegador.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const API = 'https://api.infosimples.com/api/v2/consultas';
// Infosimples espera até `timeout` segundos pelo site do órgão; cortamos um pouco depois.
// O portal do CNJ (BNMP) é lento — 90s estourou no primeiro teste. Tudo roda em background,
// então o teto é o wall clock de 400s do plano pago.
const SOURCE_TIMEOUT_S = 120;
const CNJ_TIMEOUT_S = 240;

type CheckType = 'cpf' | 'antecedentes_pf' | 'mandados_cnj';
type Status = 'ok' | 'attention' | 'error';
type Outcome = { check_type: CheckType; status: Status; summary: string; details: unknown; api_code: number | null; price: number | null };
type ApiResponse = { code?: number; code_message?: string; errors?: string[]; header?: { price?: string | number }; data?: any[]; data_count?: number };

const onlyDigits = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '');
const norm = (s: string | null | undefined) =>
  (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z ]/g, ' ').replace(/\s+/g, ' ').trim();

async function consulta(service: string, token: string, params: Record<string, string>, timeoutS = SOURCE_TIMEOUT_S): Promise<ApiResponse> {
  const body = new URLSearchParams({ token, timeout: String(timeoutS), ...params });
  const res = await fetch(`${API}/${service}`, {
    method: 'POST',
    body,
    signal: AbortSignal.timeout((timeoutS + 15) * 1000),
  });
  return await res.json();
}

const priceOf = (r: ApiResponse) => (r.header?.price != null ? Number(r.header.price) : null);
const errorMsg = (r: ApiResponse) =>
  [r.code_message, ...(r.errors ?? [])].filter(Boolean).join(' · ') || 'Resposta inesperada da Infosimples';

/** Envolve cada consulta: falha de rede/timeout vira status "error" em vez de derrubar as outras. */
async function run(check_type: CheckType, fn: () => Promise<Outcome>): Promise<Outcome> {
  try {
    return await fn();
  } catch (e) {
    return { check_type, status: 'error', summary: `Não foi possível consultar: ${(e as Error).message}`, details: null, api_code: null, price: null };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'no auth' }, 401);

  const url = Deno.env.get('SUPABASE_URL')!;
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ error: 'unauthorized' }, 401);
  const { data: caller } = await admin.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (caller?.role !== 'admin') return json({ error: 'forbidden' }, 403);

  const { mechanic_id, only } = await req.json().catch(() => ({}));
  if (!mechanic_id) return json({ error: 'mechanic_id obrigatório' }, 400);
  // `only` = repetir só algumas consultas (ex.: a que deu timeout) sem pagar as outras de novo
  const wants = (t: CheckType) => !Array.isArray(only) || only.length === 0 || only.includes(t);

  const { data: setting } = await admin.from('app_settings').select('value').eq('key', 'infosimples_token').maybeSingle();
  const token = setting?.value?.trim();
  if (!token) return json({ error: 'Token da Infosimples não configurado (Admin → Configurações).' }, 400);

  const { data: mech } = await admin
    .from('mechanics')
    .select('id, cpf, birth_date, mother_name, profile:profiles!inner(full_name)')
    .eq('id', mechanic_id)
    .maybeSingle();
  if (!mech) return json({ error: 'mecânico não encontrado' }, 404);

  const cpf = onlyDigits(mech.cpf);
  const nome = (mech as any).profile?.full_name?.trim() ?? '';
  const birthdate: string = mech.birth_date ?? ''; // AAAA-MM-DD
  const nomeMae = mech.mother_name?.trim() ?? '';
  if (cpf.length !== 11) return json({ error: 'CPF do mecânico inválido no cadastro.' }, 400);

  const missing = (what: string, check_type: CheckType): Outcome => ({
    check_type, status: 'error', summary: `Não consultado: cadastro sem ${what}. Peça ao mecânico e edite o cadastro.`,
    details: null, api_code: null, price: null,
  });

  const checks: (Promise<Outcome> | null)[] = [
    // 1) Receita Federal / CPF
    !wants('cpf') ? null : birthdate ? run('cpf', async () => {
      const r = await consulta('receita-federal/cpf', token, { cpf, birthdate });
      if (r.code !== 200 || !r.data?.[0]) {
        return { check_type: 'cpf', status: 'error', summary: errorMsg(r), details: r, api_code: r.code ?? null, price: priceOf(r) };
      }
      const d = r.data[0];
      const situacao = String(d.situacao_cadastral ?? '').trim();
      const regular = norm(situacao) === 'REGULAR';
      const nomeReceita = d.nome_civil || d.nome || '';
      const nomeConfere = norm(nomeReceita) === norm(nome);
      const obito = !!(d.ano_obito || d.normalizado_ano_obito);
      const problems = [
        !regular && `situação ${situacao || 'desconhecida'}`,
        !nomeConfere && `nome na Receita: ${nomeReceita || '—'}`,
        obito && `consta óbito (${d.ano_obito})`,
      ].filter(Boolean);
      return {
        check_type: 'cpf',
        status: problems.length ? 'attention' : 'ok',
        summary: problems.length ? `CPF com pendência: ${problems.join(' · ')}` : `CPF regular, nome confere (${nomeReceita})`,
        details: { situacao_cadastral: situacao, nome: nomeReceita, data_nascimento: d.data_nascimento, ano_obito: d.ano_obito ?? null, data_inscricao: d.data_inscricao, comprovante: d.consulta_comprovante },
        api_code: 200, price: priceOf(r),
      };
    }) : Promise.resolve(missing('data de nascimento', 'cpf')),

    // 2) Antecedentes criminais — Polícia Federal (emissão de certidão)
    !wants('antecedentes_pf') ? null : birthdate && nomeMae ? run('antecedentes_pf', async () => {
      const r = await consulta('antecedentes-criminais/pf/emit', token, { cpf, nome, birthdate, nome_mae: nomeMae });
      if (r.code !== 200 || !r.data?.[0]) {
        return { check_type: 'antecedentes_pf', status: 'error', summary: errorMsg(r), details: r, api_code: r.code ?? null, price: priceOf(r) };
      }
      const d = r.data[0];
      const nadaConsta = d.conseguiu_emitir_certidao_negativa === true;
      return {
        check_type: 'antecedentes_pf',
        status: nadaConsta ? 'ok' : 'attention',
        // Certidão que não sai NÃO prova antecedente (homônimo é comum) — sempre análise manual
        summary: nadaConsta
          ? `Nada consta na PF — certidão ${d.numero ?? ''}${d.validade_data ? `, válida até ${d.validade_data}` : ''}`.trim()
          : `Certidão negativa não emitida${d.mensagem ? `: ${d.mensagem}` : ''} — conferir manualmente (pode ser homônimo)`,
        details: { conseguiu_emitir_certidao_negativa: d.conseguiu_emitir_certidao_negativa, numero: d.numero, emissao_data: d.emissao_data, validade_data: d.validade_data, mensagem: d.mensagem, certidao_codigo: d.certidao_codigo },
        api_code: 200, price: priceOf(r),
      };
    }) : Promise.resolve(missing(!birthdate ? 'data de nascimento' : 'nome da mãe', 'antecedentes_pf')),

    // 3) Mandados de prisão — CNJ / BNMP
    !wants('mandados_cnj') ? null : run('mandados_cnj', async () => {
      const params: Record<string, string> = { cpf };
      if (nome) params.nome = nome;
      if (nomeMae) params.nome_mae = nomeMae;
      const r = await consulta('cnj/mandados-prisao', token, params, CNJ_TIMEOUT_S);
      const list = r.code === 200 ? (r.data ?? []) : [];
      // 612 = consulta feita, nenhum registro encontrado
      if (r.code === 612 || (r.code === 200 && list.length === 0)) {
        return { check_type: 'mandados_cnj', status: 'ok', summary: 'Nenhum mandado de prisão em aberto no CNJ', details: null, api_code: r.code ?? null, price: priceOf(r) };
      }
      if (r.code !== 200) {
        return { check_type: 'mandados_cnj', status: 'error', summary: errorMsg(r), details: r, api_code: r.code ?? null, price: priceOf(r) };
      }
      return {
        check_type: 'mandados_cnj',
        status: 'attention',
        summary: `${list.length} mandado(s) em aberto — conferir se é a mesma pessoa (nome da mãe, nascimento)`,
        details: list.slice(0, 10).map((m: any) => ({ nome: m.nome, mae: m.mae, nascimento_data: m.nascimento_data, tipo: m.tipo, especie_prisao: m.especie_prisao, tribunal: m.tribunal, orgao_judicial: m.orgao_judicial, processo: m.processo, mandado: m.mandado, tipificacao_penal: m.tipificacao_penal, validade_data: m.validade_data })),
        api_code: 200, price: priceOf(r),
      };
    }),
  ];

  const pending = checks.filter((c): c is Promise<Outcome> => c !== null);
  if (pending.length === 0) return json({ error: 'Nenhuma consulta selecionada.' }, 400);

  // Cada consulta grava assim que termina — resultado aparece aos poucos na tela
  const work = Promise.all(pending.map(async p => {
    const o = await p;
    const { error } = await admin.from('mechanic_verifications').insert({ ...o, mechanic_id: mech.id, created_by: user.id });
    if (error) console.error('verify-mechanic insert', o.check_type, error.message);
  }));
  // @ts-ignore EdgeRuntime existe no runtime do Supabase
  EdgeRuntime.waitUntil(work);

  return json({ started: pending.length }, 202);
});
