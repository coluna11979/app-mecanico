import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { brl } from '@/lib/cash';
import { osNumber } from '@/components/os/osHelpers';
import type { receivables } from '@/lib/finance';
import WhatsAppButton from '@/components/inbox/WhatsAppButton';
import ReceiveOsModal, { RECEIVE_OS_SELECT, type ReceiveOs } from '@/components/cash/ReceiveOsModal';
import { supabase } from '@/lib/supabase';
import { toast } from '@/components/ui/Toast';
import type { WorkshopMechanic } from '@/types/database';

/**
 * Financeiro → "OS a receber": todas as OS concluídas com saldo em aberto, inclusive as combinadas
 * para "Pagar depois". Filtra por situação, busca por cliente/placa/nº e leva direto ao Caixa
 * Receber abre o recebimento aqui mesmo (data e formas de pagamento), igual ao do Caixa.
 */

type Rec = ReturnType<typeof receivables>;
type Row = Rec['rows'][number];
type Filter = 'todas' | 'hoje' | 'depois' | 'vencidas' | 'sem_data';

const FILTERS: [Filter, string][] = [
  ['todas', 'Todas'], ['hoje', '📅 A receber hoje'], ['depois', '🕒 Pagar depois'], ['vencidas', '⚠️ Vencidas'], ['sem_data', 'Sem data combinada'],
];

const br = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('pt-BR');
const digits = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '');

function dueText(r: Row) {
  if (r.dueIn == null) return r.days === 0 ? 'concluída hoje' : `concluída há ${r.days} dia${r.days === 1 ? '' : 's'}`;
  if (r.dueIn < 0) return `vencido há ${-r.dueIn} dia${r.dueIn === -1 ? '' : 's'} (${br(r.os.pay_later_due!)})`;
  return r.dueIn === 0 ? 'vence hoje' : `vence ${br(r.os.pay_later_due!)}`;
}

/** Receber aqui mesmo: quem é e o que pode no caixa */
type ReceiveCtx = { wid: string; sid: string | null; canDiscount: boolean; onReceived: () => void };

export default function ReceivablesTab({ data, firstOpen, shopName, receive }: {
  data: Rec; firstOpen: string | null; shopName?: string; receive?: ReceiveCtx;
}) {
  const [filter, setFilter] = useState<Filter>('todas');
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<{ os: ReceiveOs; team: WorkshopMechanic[]; cashOpen: boolean } | null>(null);
  const [opening, setOpening] = useState<string | null>(null);

  async function openReceive(id: string) {
    if (!receive) return;
    setOpening(id);
    const [o, m, r] = await Promise.all([
      supabase.from('service_orders').select(RECEIVE_OS_SELECT).eq('id', id).maybeSingle(),
      supabase.from('workshop_mechanics').select('*').eq('workshop_id', receive.wid).neq('status', 'terminated').order('name'),
      supabase.from('cash_registers').select('id').eq('workshop_id', receive.wid).eq('status', 'open').limit(1),
    ]);
    setOpening(null);
    if (!o.data) return toast.error('Não consegui abrir essa OS');
    setPicked({ os: o.data as unknown as ReceiveOs, team: (m.data as WorkshopMechanic[]) ?? [], cashOpen: (r.data ?? []).length > 0 });
  }

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return data.rows.filter(r => {
      if (filter === 'hoje' && r.dueIn !== 0) return false;
      if (filter === 'depois' && r.dueIn == null) return false;
      if (filter === 'vencidas' && !r.overdue) return false;
      if (filter === 'sem_data' && r.dueIn != null) return false;
      if (!t) return true;
      const o = r.os;
      return osNumber(o).includes(t) || o.title.toLowerCase().includes(t)
        || (o.customer?.full_name ?? '').toLowerCase().includes(t)
        || (o.vehicle?.plate ?? '').toLowerCase().replace(/[^a-z0-9]/g, '').includes(t.replace(/[^a-z0-9]/g, ''));
    });
  }, [data.rows, filter, q]);

  const total = rows.reduce((a, r) => a + r.open, 0);
  const count = (f: Filter) => data.rows.filter(r =>
    f === 'todas' ? true : f === 'hoje' ? r.dueIn === 0 : f === 'depois' ? r.dueIn != null : f === 'vencidas' ? r.overdue : r.dueIn == null).length;
  /** Combinadas para pagar hoje */
  const today = data.rows.filter(r => r.dueIn === 0);
  const todayTotal = today.reduce((a, r) => a + r.open, 0);

  const waText = (r: Row) => {
    const name = (r.os.customer?.full_name ?? '').split(' ')[0];
    return `Olá${name ? ` ${name}` : ''}! Tudo bem? Passando para lembrar do valor de ${brl(r.open)} da OS nº ${osNumber(r.os)}`
      + `${r.os.title ? ` (${r.os.title})` : ''}${r.os.pay_later_due ? `, combinado para ${br(r.os.pay_later_due)}` : ''}.`
      + ` Qualquer dúvida estamos à disposição${shopName ? ` — ${shopName}` : ''}.`;
  };

  return (
    <div className="space-y-4">
      {/* Resumo */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Box label="Total a receber" value={brl(data.total)} note={`${data.rows.length} OS`} strong />
        <Box label="📅 A receber hoje" value={brl(todayTotal)} note={`${today.length} OS com pagamento combinado para hoje`}
          tone={todayTotal > 0 ? 'today' : undefined} onClick={today.length ? () => setFilter('hoje') : undefined} />
        <Box label="🕒 Pagar depois" value={brl(data.laterTotal)} note={`${data.laterCount} combinada${data.laterCount === 1 ? '' : 's'}`} />
        <Box label="⚠️ Vencido" value={brl(data.overdueTotal)} note={`${data.overdue.length} OS`} tone={data.overdueTotal > 0 ? 'bad' : undefined} />
        <Box label="Sem data combinada" value={brl(data.total - data.laterTotal)} note="concluídas sem quitar" />
      </div>

      <div className="card">
        <div className="flex flex-wrap items-center gap-2">
          {FILTERS.map(([k, l]) => (
            <button key={k} onClick={() => setFilter(k)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition ${
                filter === k ? 'bg-steel-900 text-white border-steel-900' : 'bg-white text-steel-600 border-steel-200 hover:border-steel-300'}`}>
              {l} <span className="opacity-70">({count(k)})</span>
            </button>
          ))}
          <input className="input !py-1.5 text-sm flex-1 min-w-[180px] sm:ml-auto sm:max-w-xs" placeholder="Buscar cliente, placa, nº da OS…"
            value={q} onChange={e => setQ(e.target.value)} />
        </div>

        <div className="flex justify-between items-baseline mt-3 mb-1 text-sm">
          <span className="text-steel-500">{rows.length} OS</span>
          <strong>{brl(total)}</strong>
        </div>

        {rows.length === 0 ? (
          <p className="text-sm text-steel-400 py-6 text-center">
            {data.rows.length === 0 ? 'Tudo recebido. Nenhuma OS com saldo em aberto. 👏' : 'Nenhuma OS neste filtro.'}
          </p>
        ) : (
          <ul className="divide-y divide-steel-100">
            {rows.map(r => {
              const o = r.os;
              const phone = digits((o.customer as { phone?: string | null } | null)?.phone);
              return (
                <li key={o.id} className="py-3 flex flex-wrap items-center gap-3">
                  <Link to={`/oficina/os/${o.id}`} state={{ backLabel: 'Visão financeira' }} className="flex-1 min-w-[200px] hover:text-brand-700">
                    <div className="text-sm font-semibold truncate">OS {osNumber(o)} · {o.customer?.full_name ?? 'Sem cliente'}</div>
                    <div className="text-xs text-steel-500 truncate">
                      {[o.vehicle?.plate, o.title].filter(Boolean).join(' · ')}
                      {r.partial && <> · pago {brl(o.paid_amount)} de {brl(o.price)}</>}
                    </div>
                    <div className={`text-[11px] mt-0.5 ${r.overdue ? 'text-alert-600 font-semibold' : r.dueIn != null ? 'text-brand-700' : 'text-steel-400'}`}>
                      {r.dueIn != null ? '🕒 ' : ''}{dueText(r)}
                      {o.pay_later_note && <span className="text-steel-500 font-normal"> · 📝 {o.pay_later_note}</span>}
                    </div>
                  </Link>
                  <div className="text-right shrink-0">
                    <div className="font-bold">{brl(r.open)}</div>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    {phone.length >= 10 && (
                      <WhatsAppButton phone={phone} text={waText(r)} customerName={o.customer?.full_name} title="Lembrar o pagamento"
                        className="btn-secondary text-xs !px-2.5 !py-1.5">💬 Cobrar</WhatsAppButton>
                    )}
                    {receive ? (
                      <button onClick={() => openReceive(o.id)} disabled={opening === o.id} className="btn-primary text-xs !px-2.5 !py-1.5">
                        {opening === o.id ? 'Abrindo…' : '💰 Receber'}
                      </button>
                    ) : (
                      <Link to={`/oficina/caixa?os=${o.id}`} className="btn-primary text-xs !px-2.5 !py-1.5">💰 Receber</Link>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {!firstOpen && (
          <p className="text-[11px] text-steel-400 mt-3">
            OS concluídas antes do 1º caixa não entram (o pagamento delas não foi registrado no sistema), exceto as combinadas para pagar depois.
          </p>
        )}
      </div>

      {picked && receive && (
        <ReceiveOsModal os={picked.os} wid={receive.wid} sid={receive.sid} canDiscount={receive.canDiscount} team={picked.team}
          cashClosed={!picked.cashOpen}
          onClose={() => setPicked(null)}
          onDone={() => { setPicked(null); receive.onReceived(); }} />
      )}
    </div>
  );
}

function Box({ label, value, note, strong, tone, onClick }: {
  label: string; value: string; note: string; strong?: boolean; tone?: 'bad' | 'today'; onClick?: () => void;
}) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag onClick={onClick}
      className={`text-left rounded-2xl px-4 py-3 border ${strong ? 'bg-steel-900 text-white border-steel-900'
        : tone === 'today' ? 'bg-brand-50 border-brand-200 hover:border-brand-300' : 'bg-white border-steel-200'}`}>
      <div className={`text-[11px] ${strong ? 'text-steel-400' : tone === 'today' ? 'text-brand-700 font-semibold' : 'text-steel-500'}`}>{label}</div>
      <div className={`text-xl font-bold mt-0.5 ${tone === 'bad' ? 'text-alert-600' : tone === 'today' ? 'text-brand-700' : ''}`}>{value}</div>
      <div className={`text-[11px] ${strong ? 'text-steel-400' : 'text-steel-400'}`}>{note}</div>
    </Tag>
  );
}
