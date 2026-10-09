import { useCallback, useEffect, useState } from 'react';
import WorkshopLayout from '@/components/layout/WorkshopLayout';
import SendWhatsAppModal from '@/components/os/SendWhatsAppModal';
import { toast } from '@/components/ui/Toast';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

type Row = {
  id: string; status: 'pending' | 'sent' | 'skipped'; created_at: string; sent_at: string | null;
  customer: { id: string; full_name: string; phone: string | null } | null;
  os: { number: number | null; title: string; completed_at: string | null; vehicle: { make: string | null; model: string | null } | null } | null;
};

const SELECT = 'id, status, created_at, sent_at, customer:customers(id, full_name, phone), os:service_orders(number, title, completed_at, vehicle:vehicles(make, model))';

const DEFAULT_TEXT = `Oi, {nome}! Aqui é da {oficina} 😊
Obrigado por confiar no nosso serviço no seu {carro}. Sua opinião ajuda muito a gente! Pode nos avaliar no Google? Leva 30 segundos:
{link}

Se algo não saiu como esperado, é só responder essa mensagem que a gente resolve.`;

const isLink = (u: string) => /^https?:\/\/\S+$/i.test(u.trim());
const carOf = (v: { make: string | null; model: string | null } | null | undefined) =>
  [v?.make, v?.model].filter(Boolean).join(' ');

export default function Avaliacoes() {
  const { currentWorkshop, refreshWorkshops } = useAuth();
  const wid = currentWorkshop?.id;
  const [tab, setTab] = useState<'pending' | 'sent'>('pending');
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [link, setLink] = useState('');
  const [savedLink, setSavedLink] = useState('');
  const [savingLink, setSavingLink] = useState(false);
  const [sending, setSending] = useState<Row | null>(null);

  const load = useCallback(async () => {
    if (!wid) return;
    setLoading(true);
    const [{ data }, { data: w }] = await Promise.all([
      supabase.from('review_requests').select(SELECT).eq('workshop_id', wid)
        .order('created_at', { ascending: false }).limit(200),
      supabase.from('workshops').select('google_review_url').eq('id', wid).maybeSingle(),
    ]);
    setRows((data ?? []) as unknown as Row[]);
    const url = (w as { google_review_url: string | null } | null)?.google_review_url ?? '';
    setLink(url); setSavedLink(url);
    setLoading(false);
  }, [wid]);
  useEffect(() => { load(); }, [load]);

  async function saveLink() {
    if (!wid) return;
    const v = link.trim();
    if (v && !isLink(v)) return toast.error('Cole o link completo (começa com https://)');
    setSavingLink(true);
    const { error } = await supabase.from('workshops').update({ google_review_url: v || null }).eq('id', wid);
    setSavingLink(false);
    if (error) return toast.error(error.message);
    setSavedLink(v);
    toast.success('Link salvo ✓');
    refreshWorkshops();
  }

  async function mark(r: Row, status: 'sent' | 'skipped') {
    const { data: { user } } = await supabase.auth.getUser();
    const sentAt = status === 'sent' ? new Date().toISOString() : null;
    const { error } = await supabase.from('review_requests')
      .update({ status, sent_at: sentAt, sent_by: user?.id ?? null }).eq('id', r.id);
    if (error) return toast.error(error.message);
    if (status === 'sent' && r.customer) {
      await supabase.from('customers').update({ last_contacted_at: sentAt }).eq('id', r.customer.id);
    }
    setRows(rs => rs.map(x => x.id === r.id ? { ...x, status, sent_at: sentAt } : x));
  }

  function buildText(r: Row) {
    const first = (r.customer?.full_name ?? '').trim().split(/\s+/)[0] || 'tudo bem';
    return DEFAULT_TEXT
      .replace('{nome}', first)
      .replace('{oficina}', currentWorkshop?.business_name ?? 'nossa oficina')
      .replace('{carro}', carOf(r.os?.vehicle) || 'veículo')
      .replace('{link}', savedLink);
  }

  const pending = rows.filter(r => r.status === 'pending');
  const sent = rows.filter(r => r.status === 'sent');
  const list = tab === 'pending' ? pending : sent;
  const fmt = (iso: string | null) => iso ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '';

  return (
    <WorkshopLayout>
      <div className="max-w-3xl space-y-5">
        <div>
          <h1 className="text-2xl font-bold">⭐ Avaliações no Google</h1>
          <p className="text-sm text-steel-500 mt-1">
            Quando uma OS é concluída e quitada, o cliente entra na fila. Você confere e envia o pedido pelo WhatsApp com 1 clique.
            Cada cliente recebe no máximo 1 pedido a cada 90 dias.
          </p>
        </div>

        <div className={`card space-y-2 ${savedLink ? '' : 'border-amber-300 bg-amber-50'}`}>
          <label className="label">Link de avaliação do Google desta loja ({currentWorkshop?.business_name})</label>
          <div className="flex gap-2">
            <input className="input flex-1" placeholder="https://search.google.com/local/writereview?placeid=..." value={link} onChange={e => setLink(e.target.value)} />
            <button className="btn-primary" onClick={saveLink} disabled={savingLink || link.trim() === savedLink}>{savingLink ? 'Salvando…' : 'Salvar'}</button>
          </div>
          {!savedLink && (
            <p className="text-xs text-amber-800">
              Cadastre o link para liberar o envio. No Google Maps: perfil da loja → Avaliações → Escrever uma avaliação → copie o endereço.
            </p>
          )}
        </div>

        <div className="flex gap-2">
          {([['pending', `Para enviar (${pending.length})`], ['sent', `Enviados (${sent.length})`]] as const).map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`text-sm font-semibold px-3 py-1.5 rounded-full border transition ${tab === k ? 'bg-steel-900 text-white border-steel-900' : 'bg-white text-steel-600 border-steel-200'}`}>
              {label}
            </button>
          ))}
        </div>

        {loading ? <p className="text-steel-500">Carregando…</p> : list.length === 0 ? (
          <div className="card text-center py-10 text-steel-500">
            {tab === 'pending' ? 'Nenhum pedido na fila. Quando uma OS for concluída e quitada, o cliente aparece aqui.' : 'Nenhum pedido enviado ainda.'}
          </div>
        ) : (
          <div className="space-y-2">
            {list.map(r => (
              <div key={r.id} className="card flex flex-wrap items-center gap-3">
                <div className="flex-1 min-w-[200px]">
                  <div className="font-semibold">{r.customer?.full_name ?? 'Cliente'}</div>
                  <div className="text-xs text-steel-500">
                    OS {r.os?.number ? `#${r.os.number}` : ''} · {r.os?.title}
                    {carOf(r.os?.vehicle) && ` · ${carOf(r.os?.vehicle)}`}
                    {' · '}{tab === 'pending' ? `concluída ${fmt(r.os?.completed_at ?? r.created_at)}` : `enviado ${fmt(r.sent_at)}`}
                  </div>
                </div>
                {tab === 'pending' ? (
                  <>
                    <button className="btn-ghost text-sm" onClick={() => mark(r, 'skipped')}>Dispensar</button>
                    <button className="btn-primary !bg-signal-500 hover:!bg-signal-600 text-sm" disabled={!savedLink}
                      title={savedLink ? '' : 'Cadastre o link da loja primeiro'} onClick={() => setSending(r)}>
                      📲 Enviar pedido
                    </button>
                  </>
                ) : <span className="text-xs text-emerald-700 font-semibold">✓ enviado</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      {sending && (
        <SendWhatsAppModal
          title="Pedir avaliação no Google"
          phone={sending.customer?.phone}
          customerId={sending.customer?.id}
          customerName={sending.customer?.full_name}
          messages={[{ key: 'avaliacao', label: 'Pedido de avaliação', text: buildText(sending) }]}
          onClose={() => setSending(null)}
          onSent={() => mark(sending, 'sent')}
        />
      )}
    </WorkshopLayout>
  );
}
