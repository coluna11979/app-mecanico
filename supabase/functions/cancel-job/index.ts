import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const CANCELLATION_FEE_PCT = 0.30;
const TOLERANCE_MS = 5 * 60 * 1000;

// Prazo de chegada — espelha src/lib/arrivalDeadline.ts (mude nos dois lugares)
const IMMEDIATE_ARRIVAL_MS    = 45 * 60 * 1000; // imediata: 45 min após o aceite
const SCHEDULED_ARRIVAL_GRACE = 30 * 60 * 1000; // agendada: 30 min após o horário marcado

function acceptedAtMs(job: any): number {
  return new Date(job.accepted_at ?? job.created_at).getTime();
}

function arrivalDeadlineMs(job: any): number | null {
  if (!job.mechanic_id || job.arrived_at) return null;
  const immediate = acceptedAtMs(job) + IMMEDIATE_ARRIVAL_MS;
  if (job.scheduled_at) {
    // Nunca menos que o prazo de uma imediata (ex.: agendado pra daqui a 10 min)
    return Math.max(new Date(job.scheduled_at).getTime() + SCHEDULED_ARRIVAL_GRACE, immediate);
  }
  return immediate;
}

// Cancelar sem multa — espelha freeCancelUntil em src/lib/arrivalDeadline.ts (mude nos dois lugares)
const SCHEDULED_MIN_LEAD_MS    = 60 * 60 * 1000;      // agendada = horário marcado mais de 1h depois do aceite
const SCHEDULED_FREE_CANCEL_MS = 2 * 60 * 60 * 1000;  // agendada: sem multa até 2h antes do horário

function freeCancelUntilMs(job: any): number {
  const tolerance = acceptedAtMs(job) + TOLERANCE_MS;
  if (job.scheduled_at) {
    const scheduled = new Date(job.scheduled_at).getTime();
    if (scheduled - acceptedAtMs(job) > SCHEDULED_MIN_LEAD_MS) {
      return Math.max(scheduled - SCHEDULED_FREE_CANCEL_MS, tolerance);
    }
  }
  return tolerance;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return new Response(JSON.stringify({ error: 'no auth' }), { status: 401, headers: { ...CORS, 'Content-Type': 'application/json' } });

    const url = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { ...CORS, 'Content-Type': 'application/json' } });

    const admin = createClient(url, serviceKey);
    const { job_id, reason, cancelled_by } = await req.json();
    if (!job_id || !reason || !cancelled_by) {
      return new Response(JSON.stringify({ error: 'job_id, reason, cancelled_by required' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }
    if (cancelled_by !== 'workshop' && cancelled_by !== 'mechanic') {
      return new Response(JSON.stringify({ error: 'invalid cancelled_by' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    const { data: job } = await admin.from('jobs').select('*').eq('id', job_id).maybeSingle();
    if (!job) return new Response(JSON.stringify({ error: 'job not found' }), { status: 404, headers: { ...CORS, 'Content-Type': 'application/json' } });

    // Permissao: dono pode ter MULTIPLAS oficinas — verifica se job.workshop_id pertence a alguma
    if (cancelled_by === 'workshop') {
      const { data: shops } = await admin.from('workshops').select('id').eq('profile_id', user.id);
      const ownsJob = (shops ?? []).some((w: any) => w.id === job.workshop_id);
      if (!ownsJob) {
        return new Response(JSON.stringify({ error: 'forbidden', detail: 'voce nao e dono desta oficina' }), {
          status: 403, headers: { ...CORS, 'Content-Type': 'application/json' },
        });
      }
    } else {
      const { data: mechs } = await admin.from('mechanics').select('id').eq('profile_id', user.id);
      const ownsAsMech = (mechs ?? []).some((m: any) => m.id === job.mechanic_id);
      if (!ownsAsMech) {
        return new Response(JSON.stringify({ error: 'forbidden', detail: 'voce nao e o mecanico atribuido' }), {
          status: 403, headers: { ...CORS, 'Content-Type': 'application/json' },
        });
      }
    }

    if (job.cancelled_at) return new Response(JSON.stringify({ error: 'job already cancelled' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });
    if (job.status === 'completed') return new Response(JSON.stringify({ error: 'cannot cancel completed job' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });

    // Convite direto aceito e depois desistido: a oficina escolheu ESTE mecânico, então não
    // reabre (só ele veria) — cancela sem multa e a oficina escolhe outro.
    if (cancelled_by === 'mechanic' && job.audience === 'invite' && job.status === 'assigned' && !job.arrived_at && !job.pix_paid_at) {
      await admin.from('jobs').update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancelled_by,
        cancellation_reason: `Mecânico desistiu do convite: ${reason}`,
        cancellation_fee: 0,
        cancellation_refund: 0,
      }).eq('id', job_id);
      try {
        await admin.from('messages').insert({
          job_id, sender_id: user.id,
          content: `⚠️ O mecânico desistiu do convite.\nMotivo: ${reason}\nVocê pode escolher outro mecânico em Buscar profissionais — sem multa.`,
        });
        const { data: shop } = await admin.from('workshops').select('profile_id').eq('id', job.workshop_id).maybeSingle();
        if (shop?.profile_id) {
          await admin.from('notifications').insert({
            user_id: shop.profile_id, type: 'warning', link: '/oficina/buscar',
            title: 'Mecânico desistiu do convite',
            body: `"${job.title}" foi cancelada sem multa. Escolha outro mecânico ou publique para todos.`,
          });
        }
      } catch {}
      return new Response(JSON.stringify({ success: true, scenario: 'mechanic_dropped_invite', kept_open: false, fee: 0, refund: 0 }), {
        status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    if (cancelled_by === 'mechanic' && job.status === 'assigned' && !job.arrived_at && !job.pix_paid_at) {
      await admin.from('jobs').update({
        mechanic_id: null, status: 'open', arrived_at: null,
      }).eq('id', job_id);
      try {
        await admin.from('messages').insert({
          job_id, sender_id: user.id,
          content: `⚠️ O mecânico desistiu da demanda.\nMotivo: ${reason}\nA demanda voltou a estar disponível para outros mecânicos.`,
        });
      } catch {}
      return new Response(JSON.stringify({ success: true, scenario: 'mechanic_dropped', kept_open: true, fee: 0, refund: 0 }), {
        status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    if (job.status === 'in_progress') {
      return new Response(JSON.stringify({
        error: 'service in progress',
        message: 'Serviço em andamento só pode ser cancelado por acordo bilateral.',
      }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    // Pagou: o mecânico inicia. Não existe cancelamento pelo app depois de pago (termos, 5.1);
    // se der problema, a oficina fala com o suporte.
    if (job.pix_paid_at) {
      return new Response(JSON.stringify({
        error: 'Pagamento já feito: esta demanda não pode ser cancelada pelo app. Fale com o suporte.',
      }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    const totalValue = Number(job.price ?? 0);
    const feeAmount = Number((totalValue * CANCELLATION_FEE_PCT).toFixed(2));

    let scenario = 'open_unaccepted';
    let fee = 0;

    if (job.status === 'open' || !job.mechanic_id) {
      scenario = 'open_unaccepted';
    } else if (job.status === 'assigned' && !job.arrived_at) {
      const now = Date.now();
      const deadline = arrivalDeadlineMs(job);
      if (now <= freeCancelUntilMs(job)) scenario = 'within_tolerance';
      else if (deadline !== null && now > deadline) scenario = 'late_arrival'; // mecânico passou do prazo → sem multa
      else { scenario = 'after_tolerance_no_arrival'; fee = feeAmount; }
    } else if (job.arrived_at && !job.pix_paid_at) {
      scenario = 'arrived_not_paid'; fee = feeAmount;
    }

    await admin.from('jobs').update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      cancelled_by,
      cancellation_reason: reason,
      cancellation_fee: fee,
      cancellation_refund: 0,
      mechanic_late_cancel: scenario === 'late_arrival',
    }).eq('id', job_id);

    try {
      const senderProfile = cancelled_by === 'workshop' ? 'a oficina' : 'o mecânico';
      const feeMsg = fee > 0 ? ` Multa de cancelamento: R$ ${fee.toFixed(2)}.` : '';
      const lateMsg = scenario === 'late_arrival' ? ' O mecânico não chegou dentro do prazo — cancelamento sem multa.' : '';
      await admin.from('messages').insert({
        job_id, sender_id: user.id,
        content: `🚫 Demanda cancelada por ${senderProfile}.\nMotivo: ${reason}${feeMsg}${lateMsg}`,
      });
    } catch {}

    return new Response(JSON.stringify({ success: true, scenario, fee, refund: 0 }), {
      status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }
});
