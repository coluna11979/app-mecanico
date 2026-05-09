import { useEffect, useState } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { supabase } from '@/lib/supabase';

interface RepasseRow {
  job_id: string;
  job_title: string;
  completed_at: string | null;
  workshop_confirmed_at: string | null;
  repasse_pago_at: string | null;
  repasse_valor: number | null;
  actual_hours: number | null;
  max_hours: number | null;
  price_per_hour: number;
  price: number;
  platform_fee_pct: number;
  mechanic_amount: number;
  mechanic_name: string;
  mechanic_pix_key: string | null;
  mechanic_phone: string | null;
  workshop_name: string;
  stripe_payment_intent_id: string | null;
}

const FEE = 0.18; // 18% taxa plataforma

export default function AdminRepasses() {
  const [rows, setRows]       = useState<RepasseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab]         = useState<'pendente' | 'pago'>('pendente');
  const [marking, setMarking] = useState<string | null>(null);
  const [copied, setCopied]   = useState<string | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from('jobs')
      .select(`
        id,
        title,
        completed_at,
        workshop_confirmed_at,
        repasse_pago_at,
        repasse_valor,
        actual_hours,
        max_hours,
        price_per_hour,
        price,
        stripe_payment_intent_id,
        mechanic:mechanics!inner(
          pix_key,
          profile:profiles!inner(full_name, phone)
        ),
        workshop:workshops!inner(business_name)
      `)
      .eq('status', 'completed')
      .not('workshop_confirmed_at', 'is', null)
      .order('workshop_confirmed_at', { ascending: false });

    if (data) {
      setRows(data.map((j: any) => {
        // price já é o valor fechado (price_per_hour × max_hours), salvo na criação da demanda
        const total = j.price ?? 0;
        const mechAmount = parseFloat((total * (1 - FEE)).toFixed(2));
        return {
          job_id:                  j.id,
          job_title:               j.title,
          completed_at:            j.completed_at,
          workshop_confirmed_at:   j.workshop_confirmed_at,
          repasse_pago_at:         j.repasse_pago_at,
          repasse_valor:           j.repasse_valor,
          actual_hours:            j.actual_hours,
          max_hours:               j.max_hours,
          price_per_hour:          j.price_per_hour,
          price:                   total,
          platform_fee_pct:        FEE * 100,
          mechanic_amount:         mechAmount,
          mechanic_name:           j.mechanic?.profile?.full_name ?? '—',
          mechanic_pix_key:        j.mechanic?.pix_key ?? null,
          mechanic_phone:          j.mechanic?.profile?.phone ?? null,
          workshop_name:           j.workshop?.business_name ?? '—',
          stripe_payment_intent_id: j.stripe_payment_intent_id,
        };
      }));
    }
    setLoading(false);
  }

  async function markAsPaid(jobId: string, valor: number) {
    setMarking(jobId);
    await supabase.from('jobs').update({
      repasse_pago_at: new Date().toISOString(),
      repasse_valor: valor,
    }).eq('id', jobId);
    await load();
    setMarking(null);
  }

  function copyPix(key: string, jobId: string) {
    navigator.clipboard.writeText(key);
    setCopied(jobId);
    setTimeout(() => setCopied(null), 2000);
  }

  function fmt(v: number) {
    return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }
  function fmtDate(s: string | null) {
    if (!s) return '—';
    return new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  const pendentes = rows.filter(r => !r.repasse_pago_at);
  const pagos     = rows.filter(r =>  r.repasse_pago_at);
  const shown     = tab === 'pendente' ? pendentes : pagos;

  const totalPendente = pendentes.reduce((s, r) => s + r.mechanic_amount, 0);
  const totalPago     = pagos.reduce((s, r) => s + (r.repasse_valor ?? r.mechanic_amount), 0);

  return (
    <AdminLayout>
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Repasses</h1>
        <p className="text-steel-500 mt-1">Controle de pagamentos aos mecânicos após confirmação da oficina.</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div className="card text-center">
          <div className="text-2xl font-bold text-alert-600">{pendentes.length}</div>
          <div className="text-xs text-steel-500 mt-0.5">A pagar</div>
        </div>
        <div className="card text-center">
          <div className="text-2xl font-bold text-alert-600">{fmt(totalPendente)}</div>
          <div className="text-xs text-steel-500 mt-0.5">Total pendente</div>
        </div>
        <div className="card text-center">
          <div className="text-2xl font-bold text-signal-600">{pagos.length}</div>
          <div className="text-xs text-steel-500 mt-0.5">Pagos</div>
        </div>
        <div className="card text-center">
          <div className="text-2xl font-bold text-signal-600">{fmt(totalPago)}</div>
          <div className="text-xs text-steel-500 mt-0.5">Total repassado</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-steel-100 rounded-2xl p-1 mb-6 w-fit">
        {(['pendente', 'pago'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-5 py-2 rounded-xl text-sm font-semibold transition ${
              tab === t ? 'bg-white shadow text-steel-900' : 'text-steel-500 hover:text-steel-700'
            }`}
          >
            {t === 'pendente'
              ? `⏳ A fazer (${pendentes.length})`
              : `✅ Feitos (${pagos.length})`}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="h-10 w-10 rounded-full border-4 border-brand-500 border-t-transparent animate-spin" />
        </div>
      ) : shown.length === 0 ? (
        <div className="card text-center py-16 text-steel-400">
          {tab === 'pendente' ? '🎉 Nenhum repasse pendente' : 'Nenhum repasse registrado ainda'}
        </div>
      ) : (
        <div className="space-y-4">
          {shown.map(r => (
            <div key={r.job_id} className={`card border-l-4 ${r.repasse_pago_at ? 'border-signal-500' : 'border-alert-500'}`}>
              <div className="flex flex-col sm:flex-row sm:items-start gap-4">

                {/* Info principal */}
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                      r.repasse_pago_at
                        ? 'bg-signal-100 text-signal-700'
                        : 'bg-alert-100 text-alert-700'
                    }`}>
                      {r.repasse_pago_at ? '✅ Pago' : '⏳ Pendente'}
                    </span>
                    <span className="font-bold text-steel-900 truncate">{r.job_title}</span>
                  </div>

                  <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                    <div>
                      <span className="text-steel-400">Mecânico</span>
                      <div className="font-semibold">{r.mechanic_name}</div>
                    </div>
                    <div>
                      <span className="text-steel-400">Oficina</span>
                      <div className="font-semibold">{r.workshop_name}</div>
                    </div>
                    <div>
                      <span className="text-steel-400">Concluído</span>
                      <div className="font-semibold">{fmtDate(r.workshop_confirmed_at)}</div>
                    </div>
                    {r.max_hours != null && (
                      <div>
                        <span className="text-steel-400">Tempo</span>
                        <div className="font-semibold">
                          {r.max_hours}h previstas
                          {r.actual_hours != null && (() => {
                            const diff = r.actual_hours - r.max_hours;
                            const tag = diff < -0.1 ? '🟢' : diff > 0.1 ? '🔴' : '🟡';
                            return (
                              <span className="ml-1.5 text-xs font-normal text-steel-500">
                                · {r.actual_hours}h reais {tag}
                              </span>
                            );
                          })()}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Chave PIX */}
                  <div className="bg-steel-50 rounded-xl px-3 py-2 flex items-center justify-between gap-3">
                    <div>
                      <div className="text-xs text-steel-400 uppercase tracking-wider font-bold">Chave PIX do mecânico</div>
                      <div className="font-mono text-sm text-steel-700 mt-0.5">
                        {r.mechanic_pix_key ?? (
                          <span className="text-alert-500 italic">Não cadastrada</span>
                        )}
                      </div>
                    </div>
                    {r.mechanic_pix_key && (
                      <button
                        onClick={() => copyPix(r.mechanic_pix_key!, r.job_id)}
                        className="shrink-0 text-xs bg-steel-200 hover:bg-brand-100 text-steel-700 hover:text-brand-700 font-semibold px-3 py-1.5 rounded-lg transition"
                      >
                        {copied === r.job_id ? '✅ Copiado' : '📋 Copiar'}
                      </button>
                    )}
                  </div>

                  {r.repasse_pago_at && (
                    <div className="text-xs text-steel-400">
                      Pago em {fmtDate(r.repasse_pago_at)}
                      {r.repasse_valor && ` · ${fmt(r.repasse_valor)}`}
                    </div>
                  )}
                </div>

                {/* Valores + ação */}
                <div className="flex flex-row sm:flex-col items-center sm:items-end gap-3 sm:gap-2 shrink-0">
                  {/* Breakdown */}
                  <div className="text-right space-y-1">
                    <div className="text-xs text-steel-400">
                      Total pago <span className="font-mono">{fmt(r.price)}</span>
                    </div>
                    <div className="text-xs text-steel-400">
                      Taxa ({r.platform_fee_pct}%) <span className="font-mono text-brand-600">−{fmt(r.price * FEE)}</span>
                    </div>
                    <div className="text-xl font-bold text-steel-900">
                      {fmt(r.mechanic_amount)}
                    </div>
                    <div className="text-xs text-steel-500">a repassar</div>
                  </div>

                  {!r.repasse_pago_at && (
                    <button
                      onClick={() => markAsPaid(r.job_id, r.mechanic_amount)}
                      disabled={marking === r.job_id}
                      className="btn-primary text-sm whitespace-nowrap disabled:opacity-60"
                    >
                      {marking === r.job_id ? '…' : '✅ Marcar como pago'}
                    </button>
                  )}
                </div>

              </div>
            </div>
          ))}
        </div>
      )}
    </AdminLayout>
  );
}
