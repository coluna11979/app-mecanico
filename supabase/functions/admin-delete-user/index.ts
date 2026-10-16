import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

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

    const { profile_id } = await req.json();
    if (!profile_id) {
      return new Response(JSON.stringify({ error: 'missing profile_id' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    // Bloqueia auto-exclusão (admin não pode deletar a própria conta por aqui)
    if (profile_id === user.id) {
      return new Response(JSON.stringify({ error: 'cannot delete your own account' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    // Bloqueia deletar outros admins — evita acidente com contas privilegiadas
    const { data: targetProfile } = await admin
      .from('profiles').select('role, full_name').eq('id', profile_id).maybeSingle();
    if (targetProfile?.role === 'admin') {
      return new Response(JSON.stringify({ error: 'cannot delete admin accounts' }), {
        status: 403, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    // Auth.users tem CASCADE para profiles (que cascateia p/ mechanics, workshops,
    // approval_messages, workshop_members, etc.). Basta deletar o auth user.
    const { error: delErr } = await admin.auth.admin.deleteUser(profile_id);
    if (delErr) {
      return new Response(JSON.stringify({ error: delErr.message }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({
      deleted: true,
      profile_id,
      deleted_name: targetProfile?.full_name ?? null,
    }), {
      status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
