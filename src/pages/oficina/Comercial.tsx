import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import WorkshopLayout from '@/components/layout/WorkshopLayout';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import LicensePlate from '@/components/os/LicensePlate';
import { fmtBRL, waNumber } from '@/components/os/osHelpers';
import { itemQuote, publicReportUrl, saleStage, type VehicleCheckup } from '@/lib/checkup';
import { fetchAll } from '@/lib/fetchAll';
import PeriodPicker, { usePeriod } from '@/components/PeriodPicker';

type Item = { status: string | null; quote_labor: number | null; quote_parts: number | null; customer_decision: string | null };
type Row = VehicleCheckup & {
  mechanic: { name: string } | null;
  items: Item[];
  sale_os: { number: number | null; status: string; price: number } | null;
};

/** Colunas do funil de venda do check-up */
const COLUMNS = [
  { key: 'quote',    title: '💰 Montar orçamento', hint: 'Finalizado, falta colocar valor ou enviar' },
  { key: 'sent',     title: '📤 Enviado',          hint: 'Cliente ainda não abriu o link' },
  { key: 'viewed',   title: '👀 Cliente viu',       hint: 'Abriu e não respondeu — ligue' },
  { key: 'won',      title: '✅ Aprovado',          hint: 'Virou OS' },
  { key: 'answered', title: '❌ Não aprovou',       hint: 'Respondeu sem aprovar agora' },
] as const;
type ColKey = typeof COLUMNS[number]['key'];


const flaggedOf = (r: Row) => r.items.filter(i => i.status === 'warn' || i.status === 'urgent');
const quoted = (r: Row) => flaggedOf(r).reduce((a, i) => a + itemQuote(i), 0);
const approvedValue = (r: Row) => flaggedOf(r).filter(i => i.customer_decision === 'approve').reduce((a, i) => a + itemQuote(i), 0);
const daysSince = (iso: string | null | undefined) => iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86400000) : null;

export default function Comercial() {
  const { currentWorkshop } = useAuth();
  const wid = currentWorkshop?.id ?? null;
  const period = usePeriod('comercial-periodo', 'month');
  const [rows, setRows] = useState<Row[] | null>(null);
  const fromIso = period.range.from.toISOString();
  const toIso = period.range.to.toISOString();

  useEffect(() => {
    if (!wid) return;
    setRows(null);
    // Entra no período o check-up feito nele OU respondido pelo cliente nele
    // (ex.: em "Hoje" aparece o orçamento de dias atrás que o cliente aprovou hoje)
    fetchAll((a, b) => supabase.from('vehicle_checkups')
      .select('*, mechanic:workshop_mechanics(name), items:checkup_items(status, quote_labor, quote_parts, customer_decision), sale_os:service_orders!vehicle_checkups_sale_os_id_fkey(number, status, price)')
      .eq('workshop_id', wid).eq('status', 'completed')
      .or(`and(completed_at.gte.${fromIso},completed_at.lt.${toIso}),and(customer_responded_at.gte.${fromIso},customer_responded_at.lt.${toIso})`)
      .order('completed_at', { ascending: false }).order('id').range(a, b))
      .then(({ data }) => setRows((data as unknown as Row[]) ?? []));
  }, [wid, fromIso, toIso]);

  const byCol = useMemo(() => {
    const m: Record<ColKey, Row[]> = { quote: [], sent: [], viewed: [], won: [], answered: [] };
    for (const r of rows ?? []) {
      const st = saleStage(r);
      if (st !== 'draft') m[st].push(r);
    }
    return m;
  }, [rows]);

  const k = useMemo(() => {
    const list = rows ?? [];
    const sent = list.filter(r => r.quote_sent_at || r.customer_viewed_at || r.customer_responded_at);
    const won = list.filter(r => r.sale_os_id);
    const quotedSum = list.reduce((a, r) => a + quoted(r), 0);
    const approvedSum = list.reduce((a, r) => a + approvedValue(r), 0);
    return {
      total: list.length, sent: sent.length, won: won.length,
      conversion: sent.length ? Math.round((won.length / sent.length) * 100) : null,
      quotedSum, approvedSum,
      onTable: quotedSum - approvedSum,
      ticket: won.length ? approvedSum / won.length : 0,
      waiting: byCol.viewed.length + byCol.sent.length,
    };
  }, [rows, byCol]);

  return (
    <WorkshopLayout>
      <div className="max-w-7xl mx-auto space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">💼 Comercial</h1>
            <p className="text-sm text-steel-500 mt-1">Cada check-up é uma venda: acompanhe do orçamento até virar OS e cobre quem não respondeu.</p>
          </div>
          <Link to="/oficina/checkup" className="btn-primary !py-1.5 text-sm">+ Novo check-up</Link>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs text-steel-500">{period.label} · check-ups feitos ou respondidos pelo cliente no período</div>
          <PeriodPicker period={period} />
        </div>

        {/* Números */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <Kpi label="Check-ups" value={String(k.total)} sub={`${k.sent} enviados ao cliente`} />
          <Kpi label="Conversão" value={k.conversion == null ? '—' : `${k.conversion}%`} sub={`${k.won} viraram OS`} tone="text-signal-700" />
          <Kpi label="Vendido" value={fmtBRL(k.approvedSum)} sub={k.won ? `ticket ${fmtBRL(k.ticket)}` : 'aprovado pelos clientes'} tone="text-signal-700" dark />
          <Kpi label="Orçado" value={fmtBRL(k.quotedSum)} sub="soma dos orçamentos" />
          <Kpi label="Dinheiro na mesa" value={fmtBRL(k.onTable)} sub={k.waiting ? `${k.waiting} esperando resposta` : 'orçado e não aprovado'} tone="text-pending-700" />
        </div>

        {rows === null ? (
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">{COLUMNS.map(c => <div key={c.key} className="card h-48 animate-pulse" />)}</div>
        ) : rows.length === 0 ? (
          <div className="card text-center py-12 space-y-3">
            <div className="text-4xl">🩺</div>
            <h2 className="text-lg font-bold">Nada no período — {period.label.toLowerCase()}</h2>
            <p className="text-sm text-steel-500 max-w-md mx-auto">
              Faça o check-up, coloque o valor de cada item e envie pelo WhatsApp. O cliente aprova pelo link e a venda aparece aqui.
            </p>
            <Link to="/oficina/checkup" className="btn-primary inline-block">Fazer um check-up</Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-3 items-start">
            {COLUMNS.map(c => {
              const list = byCol[c.key];
              const sum = list.reduce((a, r) => a + (c.key === 'won' ? approvedValue(r) : quoted(r)), 0);
              return (
                <div key={c.key} className="rounded-2xl bg-steel-100/70 p-2 space-y-2">
                  <div className="px-2 pt-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm text-steel-800">{c.title}</span>
                      <span className="text-xs font-bold text-steel-500">{list.length}</span>
                    </div>
                    <div className="text-[11px] text-steel-500">{c.hint}{sum > 0 && <> · <strong>{fmtBRL(sum)}</strong></>}</div>
                  </div>
                  {list.map(r => <SaleCard key={r.id} r={r} col={c.key} workshopName={currentWorkshop?.business_name} />)}
                  {list.length === 0 && <div className="text-[11px] text-steel-400 px-2 pb-2">Nada aqui</div>}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </WorkshopLayout>
  );
}

function Kpi({ label, value, sub, tone, dark }: { label: string; value: string; sub?: string; tone?: string; dark?: boolean }) {
  return (
    <div className={`card !py-3 ${dark ? '!bg-steel-900 text-white' : ''}`}>
      <div className={`text-[10px] font-bold uppercase tracking-widest ${dark ? 'text-steel-400' : 'text-steel-500'}`}>{label}</div>
      <div className={`text-xl lg:text-2xl font-bold font-display ${dark ? 'text-white' : tone ?? 'text-steel-900'}`}>{value}</div>
      {sub && <div className={`text-[11px] ${dark ? 'text-steel-400' : 'text-steel-500'}`}>{sub}</div>}
    </div>
  );
}

function SaleCard({ r, col, workshopName }: { r: Row; col: ColKey; workshopName?: string }) {
  const car = [r.make, r.model, r.year].filter(Boolean).join(' ') || 'Veículo';
  const flagged = flaggedOf(r);
  const q = quoted(r);
  const ap = approvedValue(r);
  const since = daysSince(col === 'viewed' ? r.customer_viewed_at : col === 'sent' ? r.quote_sent_at : r.completed_at);
  const first = r.customer_name?.trim().split(' ')[0];
  const phone = waNumber(r.customer_phone);
  const nudge = `Olá${first ? ` ${first}` : ''}! Aqui é da ${workshopName ?? 'oficina'}. ` +
    `Conseguiu ver o orçamento do check-up do ${car}${r.plate ? ` (${r.plate})` : ''}? ` +
    `Pelo link você aprova o que quiser e já escolhe o horário: ${publicReportUrl(r.public_token)}`;

  return (
    <div className="bg-white rounded-xl border border-steel-200 p-3 space-y-2 shadow-sm">
      <Link to={`/oficina/checkup/${r.id}`} className="block space-y-1">
        <div className="flex items-center gap-2">
          {r.plate && <LicensePlate plate={r.plate} size="sm" />}
          <span className="text-sm font-semibold truncate">{car}</span>
        </div>
        <div className="text-xs text-steel-500 truncate">
          {[r.customer_name, r.mechanic?.name && `🔧 ${r.mechanic.name}`].filter(Boolean).join(' · ') || 'Cliente avulso'}
        </div>
      </Link>
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-steel-500">
          {flagged.length} {flagged.length === 1 ? 'item' : 'itens'}{col !== 'quote' && since != null ? ` · há ${since === 0 ? 'hoje' : `${since}d`}` : ''}
        </span>
        <span className="font-bold text-sm">
          {col === 'won' ? fmtBRL(ap) : q > 0 ? fmtBRL(q) : <span className="text-pending-700 text-xs">sem valor</span>}
        </span>
      </div>
      {col === 'won' && r.sale_os && (
        <Link to={`/oficina/os/${r.sale_os_id}`} className="block text-xs font-semibold text-brand-600 hover:underline">
          🧾 OS nº {String(r.sale_os.number ?? '').padStart(4, '0')}
          {r.customer_scheduled_at && ` · ${new Date(r.customer_scheduled_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`}
          {r.sale_os.status === 'completed' && ' · faturada ✓'}
        </Link>
      )}
      {col === 'answered' && ap === 0 && (
        <div className="text-[11px] text-steel-500">Itens com "me lembra depois" foram para a ficha do cliente.</div>
      )}
      {(col === 'sent' || col === 'viewed') && phone && (
        <a href={`https://wa.me/${phone}?text=${encodeURIComponent(nudge)}`} target="_blank" rel="noreferrer"
          className="block text-center text-xs font-semibold px-2 py-1.5 rounded-lg bg-[#25D366] text-white">
          💬 Cobrar resposta
        </a>
      )}
      {col === 'quote' && (
        <Link to={`/oficina/checkup/${r.id}`} className="block text-center text-xs font-semibold px-2 py-1.5 rounded-lg bg-brand-50 text-brand-700 border border-brand-200">
          {q > 0 ? 'Enviar ao cliente →' : 'Colocar os valores →'}
        </Link>
      )}
    </div>
  );
}
