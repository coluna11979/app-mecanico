import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/** Gera uma senha temporária amigável (fácil de ditar). Ex: "mec7392", "ofi5041" */
function generateTempPassword(role: string): string {
  const prefix = role === 'mechanic' ? 'mec' : 'ofi';
  const num = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}${num}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'no auth' }), {
        status: 401, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const url = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    // Verifica que quem chama é admin
    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(url, serviceKey);
    const { data: callerProfile } = await admin
      .from('profiles').select('role').eq('id', user.id).maybeSingle();
    if (callerProfile?.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'forbidden' }), {
        status: 403, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const { role, email, full_name, phone } = body;

    if (!role || !email || !full_name) {
      return new Response(JSON.stringify({ error: 'missing required fields (role, email, full_name)' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }
    if (role !== 'mechanic' && role !== 'workshop') {
      return new Response(JSON.stringify({ error: 'role must be mechanic or workshop' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return new Response(JSON.stringify({ error: 'invalid email format' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const password = generateTempPassword(role);

    // Monta user_metadata que o trigger handle_new_user vai consumir
    const user_metadata: Record<string, unknown> = {
      role,
      full_name: String(full_name).trim(),
      phone: phone ? String(phone).trim() : null,
    };

    if (role === 'mechanic') {
      user_metadata.cpf = body.cpf ? String(body.cpf).trim() : '';
      user_metadata.cnh = body.cnh ? String(body.cnh).trim() : '';
      user_metadata.skills = Array.isArray(body.skills) ? body.skills : [];
      user_metadata.experience_years = Number(body.experience_years) || 0;
      user_metadata.hourly_rate = Number(body.hourly_rate) || 0;
      user_metadata.pix_key = body.pix_key ? String(body.pix_key).trim() : null;
      user_metadata.cep = body.cep ? String(body.cep).trim() : '';
      user_metadata.neighborhood = body.neighborhood ? String(body.neighborhood).trim() : '';
      user_metadata.city = body.city ? String(body.city).trim() : '';
      user_metadata.state = body.state ? String(body.state).trim() : '';
      user_metadata.work_reference = body.work_reference ? String(body.work_reference).trim() : '';
    } else {
      user_metadata.business_name = body.business_name ? String(body.business_name).trim() : '';
      user_metadata.cnpj = body.cnpj ? String(body.cnpj).trim() : '';
      user_metadata.address = body.address ? String(body.address).trim() : '';
      user_metadata.number = body.number ? String(body.number).trim() : '';
      user_metadata.neighborhood = body.neighborhood ? String(body.neighborhood).trim() : '';
      user_metadata.cep = body.cep ? String(body.cep).trim() : '';
      user_metadata.city = body.city ? String(body.city).trim() : '';
      user_metadata.state = body.state ? String(body.state).trim() : 'SP';
      user_metadata.description = body.description ? String(body.description).trim() : '';
    }

    // Cria o usuário via Admin API — já confirma email (não exige verificação por link)
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: email.trim().toLowerCase(),
      password,
      email_confirm: true,
      user_metadata,
    });

    if (createErr || !created.user) {
      return new Response(JSON.stringify({ error: createErr?.message ?? 'failed to create user' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    // Dispara email de boas-vindas (silencioso — se Resend não configurado, ignora)
    try {
      await admin.functions.invoke('send-welcome-email', {
        body: { profile_id: created.user.id },
      });
    } catch (_e) { /* fire-and-forget */ }

    return new Response(JSON.stringify({
      created: true,
      profile_id: created.user.id,
      email: created.user.email,
      temp_password: password,
    }), {
      status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
