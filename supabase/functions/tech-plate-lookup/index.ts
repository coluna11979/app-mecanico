// Consulta técnica: placa → carro (marca, modelo, versão, ano).
// Ordem, do mais barato para o mais caro:
//   1) carro já cadastrado nos clientes da oficina (grátis)
//   2) placa já consultada por qualquer oficina (cache, grátis)
//   3) serviço pago de consulta de placa (Simples API) — grava no cache
// Só oficinas com o módulo `consulta` ligado, com teto diário de consultas pagas por oficina.
// A chave fica em app_settings.plate_api_token (Admin → Configurações), nunca no navegador.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const PROVIDER_URL = 'https://api.simplesapi.com.br/v1/vehicle/plate';
const DAILY_PAID_LIMIT = 150;
const NOT_FOUND_TTL_DAYS = 30;
const PLATE_RE = /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/;

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const int = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.round(n) : null; };

type Car = { make: string | null; model: string | null; version: string | null; year: number | null; fuel: string | null; engine_cc: number | null };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'no auth' }, 401);

  const url = Deno.env.get('SUPABASE_URL')!;
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ error: 'unauthorized' }, 401);

  const body = await req.json().catch(() => ({}));
  const workshopId = str(body.workshop_id);
  const plate = String(body.plate ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!workshopId) return json({ error: 'workshop_id obrigatório' }, 400);
  if (!PLATE_RE.test(plate)) return json({ status: 'invalid' });

  // Com o token do usuário: a própria RLS diz se ele enxerga os módulos desta oficina
  const { data: mods } = await userClient.from('workshop_modules')
    .select('enabled_modules, disabled_modules').eq('workshop_id', workshopId).maybeSingle();
  if (!mods) return json({ error: 'forbidden' }, 403);
  if (!(mods.enabled_modules ?? []).includes('consulta') || (mods.disabled_modules ?? []).includes('consulta')) {
    return json({ error: 'Módulo Consulta técnica não está ligado para esta oficina.' }, 403);
  }

  // 1) Carro de cliente desta oficina (também pela RLS do usuário)
  const { data: own } = await userClient.from('vehicles')
    .select('id, plate, make, model, year, tech_vehicle_id').eq('workshop_id', workshopId).eq('plate', plate).limit(1).maybeSingle();
  if (own) {
    return json({
      status: 'found', source: 'cliente', plate, vehicle_id: own.id, tech_vehicle_id: own.tech_vehicle_id,
      car: { make: own.make, model: own.model, version: null, year: own.year, fuel: null, engine_cc: null } as Car,
    });
  }

  // 2) Cache
  const { data: hit } = await admin.from('tech_plate_cache').select('*').eq('plate', plate).maybeSingle();
  if (hit?.found) {
    return json({ status: 'found', source: 'cache', plate,
      car: { make: hit.make, model: hit.model, version: hit.version, year: hit.model_year ?? hit.year, fuel: hit.fuel, engine_cc: hit.engine_cc } as Car });
  }
  if (hit && Date.now() - new Date(hit.created_at).getTime() < NOT_FOUND_TTL_DAYS * 86400e3) return json({ status: 'not_found', plate });

  // 3) Serviço pago
  const { data: setting } = await admin.from('app_settings').select('value').eq('key', 'plate_api_token').maybeSingle();
  const token = setting?.value?.trim();
  if (!token) return json({ status: 'not_configured', plate });

  const since = new Date(Date.now() - 86400e3).toISOString();
  const { count } = await admin.from('tech_plate_cache').select('plate', { count: 'exact', head: true })
    .eq('workshop_id', workshopId).gte('created_at', since);
  if ((count ?? 0) >= DAILY_PAID_LIMIT) return json({ status: 'limit', plate });

  let res: Response;
  try {
    res = await fetch(PROVIDER_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ plate }),
      signal: AbortSignal.timeout(20000),
    });
  } catch (e) {
    console.error('tech-plate-lookup fetch', (e as Error).message);
    return json({ status: 'unavailable', plate });
  }
  const data = await res.json().catch(() => null);
  if (res.status === 404) {
    await admin.from('tech_plate_cache').upsert({ plate, found: false, workshop_id: workshopId, raw: data, created_at: new Date().toISOString() });
    return json({ status: 'not_found', plate });
  }
  const info = data?.vehicle_info;
  if (!res.ok || !info || !str(info.model)) {
    console.error('tech-plate-lookup provider', res.status, JSON.stringify(data)?.slice(0, 300));
    return json({ status: 'unavailable', plate });
  }

  const row = {
    plate, found: true, make: str(info.brand), model: str(info.model), version: str(info.version),
    year: int(info.year), model_year: int(info.model_year), fuel: str(info.fuel), engine_cc: int(info.engine_cc),
    raw: data, workshop_id: workshopId, created_at: new Date().toISOString(),
  };
  const { error } = await admin.from('tech_plate_cache').upsert(row);
  if (error) console.error('tech-plate-lookup cache', error.message);
  return json({ status: 'found', source: 'servico', plate,
    car: { make: row.make, model: row.model, version: row.version, year: row.model_year ?? row.year, fuel: row.fuel, engine_cc: row.engine_cc } as Car });
});
