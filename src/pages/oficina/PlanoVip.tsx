import { FormEvent, useEffect, useState } from 'react';
import WorkshopLayout from '@/components/layout/WorkshopLayout';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/components/ui/Toast';
import { useWorkshopPlan } from '@/lib/plan';

const BENEFITS: { icon: string; title: string; desc: string }[] = [
  { icon: '🤖', title: 'CRM com IA',                desc: 'Todo dia, a lista de clientes que estão na hora de voltar — com a mensagem de WhatsApp já escrita pela IA, usando o histórico de cada um.' },
  { icon: '💬', title: 'Pós-serviço e avaliações',   desc: 'Mensagem automática perguntando como ficou o carro e pedindo avaliação no Google. Mais estrelas, mais clientes novos.' },
  { icon: '📋', title: 'Orçamentos recuperados',     desc: 'Lembrete para o cliente que não aprovou o orçamento. Dinheiro que hoje fica na mesa.' },
  { icon: '📣', title: 'Marketing com IA',           desc: 'Posts prontos para o Instagram e campanhas da estação (férias, inverno) para a sua base de clientes.' },
  { icon: '💰', title: 'Painel de retorno',          desc: 'Você vê em reais quantos clientes voltaram e quanto faturaram por causa das ações do VIP.' },
  { icon: '🚀', title: 'Destaque da sua oficina',    desc: 'Sua vitrine em destaque na divulgação do MecânicoApp.' },
];

const BEST_TIMES = ['Manhã', 'Tarde', 'Noite', 'Qualquer horário'];

/** (11) 95393-7618 enquanto digita */
function maskPhone(v: string) {
  const d = v.replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '').slice(0, 11);
  if (d.length <= 2) return d ? `(${d}` : '';
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

type Opportunity = { customers: number; sleeping: number; recs: number; ticket: number };

/** Dinheiro parado na base da oficina: clientes sumidos e recomendações em aberto */
function useOpportunity(wid: string | null) {
  const [data, setData] = useState<Opportunity | null>(null);
  useEffect(() => {
    if (!wid) return;
    let alive = true;
    (async () => {
      const [c, o, r] = await Promise.all([
        supabase.from('customers').select('id', { count: 'exact', head: true }).eq('workshop_id', wid),
        supabase.from('service_orders').select('customer_id, completed_at, price')
          .eq('workshop_id', wid).eq('status', 'completed').is('quote_status', null)
          .not('customer_id', 'is', null).limit(20000),
        supabase.from('service_recommendations').select('id', { count: 'exact', head: true })
          .eq('workshop_id', wid).eq('status', 'pending'),
      ]);
      if (!alive) return;
      const last = new Map<string, number>();
      let total = 0, n = 0;
      for (const x of (o.data ?? []) as { customer_id: string; completed_at: string | null; price: number }[]) {
        if (!x.completed_at) continue;
        const t = new Date(x.completed_at).getTime();
        if (t > (last.get(x.customer_id) ?? 0)) last.set(x.customer_id, t);
        if (Number(x.price) > 0) { total += Number(x.price); n += 1; }
      }
      const cutoff = Date.now() - 182 * 86400000;
      setData({
        customers: c.count ?? 0,
        sleeping: [...last.values()].filter(t => t < cutoff).length,
        recs: r.count ?? 0,
        ticket: n ? total / n : 0,
      });
    })();
    return () => { alive = false; };
  }, [wid]);
  return data;
}

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

function OppStat({ value, label, strong = false }: { value: number; label: string; strong?: boolean }) {
  return (
    <div>
      <div className={`text-2xl lg:text-3xl font-bold font-display ${strong ? 'text-brand-700' : 'text-steel-900'}`}>{value.toLocaleString('pt-BR')}</div>
      <div className="text-xs text-steel-600 leading-tight">{label}</div>
    </div>
  );
}

export default function PlanoVip() {
  const { currentWorkshop, profile, user } = useAuth();
  const wid = currentWorkshop?.id ?? null;
  const { plan, isVip, request, loading, refresh } = useWorkshopPlan(wid);
  const [form, setForm] = useState({ name: '', phone: '', time: 'Qualquer horário', message: '' });
  const [sending, setSending] = useState(false);
  const opp = useOpportunity(wid);

  useEffect(() => {
    setForm(f => ({ ...f, name: f.name || profile?.full_name || '', phone: f.phone || maskPhone(profile?.phone ?? '') }));
  }, [profile?.full_name, profile?.phone]);

  const open = request && (request.status === 'pending' || request.status === 'contacted');

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!wid) return;
    if (form.phone.replace(/\D/g, '').length < 10) { toast.error('Informe um telefone com DDD para nosso time te ligar.'); return; }
    setSending(true);
    const { error } = await supabase.from('vip_requests').insert({
      workshop_id: wid, requested_by: user?.id ?? null,
      contact_name: form.name.trim() || null, phone: form.phone.trim(),
      best_time: form.time, message: form.message.trim() || null,
    });
    setSending(false);
    if (error) {
      toast.error(error.code === '23505' ? 'Você já tem uma solicitação em andamento.' : 'Não foi possível enviar: ' + error.message);
      refresh();
      return;
    }
    toast.success('Solicitação enviada! Nosso time vai entrar em contato ⭐');
    refresh();
  }

  return (
    <WorkshopLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Hero */}
        <div className="rounded-3xl bg-gradient-to-br from-steel-900 via-steel-800 to-brand-900 text-white p-6 lg:p-8">
          <div className="text-[11px] font-bold uppercase tracking-widest text-brand-300">⭐ Plano VIP</div>
          <h1 className="text-2xl lg:text-3xl font-bold mt-2 max-w-2xl">
            Seus clientes antigos voltando — e clientes novos chegando — com a ajuda da IA.
          </h1>
          <p className="text-steel-300 mt-2 max-w-2xl text-sm">
            O MecânicoApp já guarda o histórico de cada cliente e carro da sua oficina. No VIP, a gente transforma esse histórico em serviço agendado.
          </p>
          {isVip && (
            <div className="mt-4 inline-flex items-center gap-2 bg-signal-500/20 border border-signal-400/40 text-signal-100 rounded-full px-4 py-1.5 text-sm font-semibold">
              ✓ Sua oficina é VIP{plan?.vip_until ? ` até ${new Date(plan.vip_until).toLocaleDateString('pt-BR')}` : ''}
            </div>
          )}
        </div>

        {/* A oportunidade na base da própria oficina */}
        {opp && opp.customers >= 5 && (opp.sleeping > 0 || opp.recs > 0) && (
          <div className="card border-2 border-brand-200 !bg-brand-50/60">
            <div className="text-[10px] font-bold uppercase tracking-widest text-brand-700">📊 Na sua oficina hoje</div>
            <div className="grid grid-cols-3 gap-3 mt-3">
              <OppStat value={opp.customers} label="clientes cadastrados" />
              <OppStat value={opp.sleeping} label="não voltam há mais de 6 meses" strong />
              <OppStat value={opp.recs} label="serviços recomendados ainda não feitos" strong />
            </div>
            <p className="text-sm text-steel-700 mt-3">
              <strong>É esse dinheiro parado que o VIP vai buscar.</strong>
              {opp.sleeping >= 5 && opp.ticket > 0 && (
                <> Se só 1 em cada 5 desses clientes voltar, com o seu ticket médio de {brl(opp.ticket)}, são cerca de{' '}
                  <strong className="text-brand-700">{brl(Math.round(opp.sleeping / 5) * opp.ticket)}</strong> a mais.</>
              )}
            </p>
          </div>
        )}

        {/* Benefícios */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {BENEFITS.map(b => (
            <div key={b.title} className="card">
              <div className="text-2xl">{b.icon}</div>
              <div className="font-bold mt-2">{b.title}</div>
              <p className="text-sm text-steel-500 mt-1">{b.desc}</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-steel-500 -mt-2">
          Os módulos são liberados por etapas — oficinas VIP recebem cada novidade primeiro, sem custo adicional.
        </p>

        {/* Ação */}
        {loading ? (
          <div className="card h-40 animate-pulse" />
        ) : isVip ? (
          <div className="card text-center py-8">
            <div className="text-4xl">🎉</div>
            <h2 className="text-lg font-bold mt-2">Você já é VIP</h2>
            <p className="text-sm text-steel-500 mt-1">Qualquer dúvida, fale com nosso time pelo WhatsApp de suporte.</p>
          </div>
        ) : open ? (
          <div className="card border-2 border-brand-200">
            <div className="flex items-start gap-3">
              <div className="text-3xl">📞</div>
              <div>
                <h2 className="text-lg font-bold">Recebemos sua solicitação!</h2>
                <p className="text-sm text-steel-600 mt-1">
                  {request!.status === 'contacted'
                    ? 'Nosso time já está conversando com você. Assim que o combinado for fechado, liberamos o VIP na sua oficina.'
                    : `Um colaborador do MecânicoApp vai entrar em contato pelo ${request!.phone ?? 'telefone informado'}${request!.best_time && request!.best_time !== 'Qualquer horário' ? `, no período da ${request!.best_time.toLowerCase()}` : ''}.`}
                </p>
                <p className="text-xs text-steel-400 mt-2">Solicitado em {new Date(request!.created_at).toLocaleDateString('pt-BR')}.</p>
              </div>
            </div>
          </div>
        ) : (
          <>
          {/* Como funciona */}
          <div className="grid sm:grid-cols-3 gap-3">
            {[
              ['1', 'Você solicita', 'Leva 30 segundos, aqui embaixo.'],
              ['2', 'Nosso time liga', 'Para entender sua oficina e combinar o plano ideal.'],
              ['3', 'Liberamos o VIP', 'Na hora, direto no seu painel.'],
            ].map(([n, t, d]) => (
              <div key={n} className="flex items-start gap-3 bg-white rounded-2xl px-4 py-3 border border-steel-100">
                <div className="h-8 w-8 rounded-full bg-brand-500 text-white font-bold grid place-items-center shrink-0">{n}</div>
                <div>
                  <div className="font-semibold text-sm">{t}</div>
                  <div className="text-xs text-steel-500">{d}</div>
                </div>
              </div>
            ))}
          </div>
          <form onSubmit={submit} className="card space-y-4">
            <div>
              <h2 className="text-lg font-bold">Quero ser VIP</h2>
              <p className="text-sm text-steel-500">
                Deixe seu contato: um colaborador do MecânicoApp liga para você, explica os planos, combina o pagamento e libera o VIP na sua oficina.
                Sem compromisso.
              </p>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="label">Seu nome</label>
                <input className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
              </div>
              <div>
                <label className="label">Telefone / WhatsApp *</label>
                <input className="input" inputMode="tel" placeholder="(11) 99999-9999" value={form.phone}
                  onChange={e => setForm({ ...form, phone: maskPhone(e.target.value) })} />
              </div>
            </div>
            <div>
              <label className="label">Melhor horário para falarmos</label>
              <div className="flex flex-wrap gap-1.5">
                {BEST_TIMES.map(t => (
                  <button key={t} type="button" onClick={() => setForm({ ...form, time: t })}
                    className={`text-sm px-3 py-1.5 rounded-full border transition ${form.time === t ? 'bg-brand-500 text-white border-brand-500' : 'bg-white text-steel-600 border-steel-200 hover:border-brand-300'}`}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="label">Quer contar algo? (opcional)</label>
              <textarea className="input" rows={2} placeholder="Ex.: tenho 800 clientes na base e quero trazer eles de volta"
                value={form.message} onChange={e => setForm({ ...form, message: e.target.value })} />
            </div>
            {request?.status === 'declined' && (
              <p className="text-xs text-steel-500">Da última vez não fechamos — sem problema, pode solicitar de novo quando quiser.</p>
            )}
            <button className="btn-primary btn-lg w-full" disabled={sending}>
              {sending ? 'Enviando…' : '⭐ Solicitar plano VIP'}
            </button>
          </form>
          </>
        )}
      </div>
    </WorkshopLayout>
  );
}
