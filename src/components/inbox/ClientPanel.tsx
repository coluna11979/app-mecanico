import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { toast } from '@/components/ui/Toast';
import LicensePlate from '@/components/os/LicensePlate';
import CustomerForm from '@/components/customers/CustomerForm';
import { fmtBRL, fmtPhone, osNumber, osStatusColor, osStatusLabel, statusChange } from '@/components/os/osHelpers';
import { isSale, onlyDigits, timeAgo } from '@/lib/customers';
import { chatTitle, type WaChat } from '@/lib/inbox';
import type { Customer, Vehicle } from '@/types/database';
import ChatAvatar from './ChatAvatar';
import ChatNotes from './ChatNotes';

type PanelOs = {
  id: string; number: number | null; title: string; status: string; quote_status: string | null;
  price: number | null; created_at: string; completed_at: string | null; rework_of_id: string | null;
  started_at: string | null;
};

const OPEN = ['open', 'awaiting_approval', 'approved', 'in_progress'];
/** OS em andamento mostradas antes do "ver mais" */
const OPEN_SHOWN = 3;

/** Painel da direita: quem é o contato na oficina (cliente, carros, OS) */
export default function ClientPanel({ chat, workshopId, onLinked, onClose }: {
  chat: WaChat; workshopId: string; onLinked: (customerId: string | null) => void; onClose?: () => void;
}) {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [os, setOs] = useState<PanelOs[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [reload, setReload] = useState(0);
  const [allOpen, setAllOpen] = useState(false);

  useEffect(() => {
    if (!chat.customer_id) { setCustomer(null); setVehicles([]); setOs([]); return; }
    let alive = true;
    setLoading(true);
    Promise.all([
      supabase.from('customers').select('*').eq('id', chat.customer_id).maybeSingle(),
      supabase.from('vehicles').select('*').eq('customer_id', chat.customer_id).order('created_at'),
      supabase.from('service_orders')
        .select('id, number, title, status, quote_status, price, created_at, completed_at, rework_of_id, started_at')
        .eq('customer_id', chat.customer_id).order('created_at', { ascending: false }).limit(200),
    ]).then(([c, v, o]) => {
      if (!alive) return;
      setCustomer((c.data as Customer) ?? null);
      setVehicles((v.data as Vehicle[]) ?? []);
      setOs((o.data as PanelOs[]) ?? []);
      setLoading(false);
    });
    return () => { alive = false; };
  }, [chat.customer_id, reload]);

  /** Cliente respondeu na conversa: aprova (pelo WhatsApp) ou marca que não aprovou, sem sair do Inbox */
  async function decide(o: PanelOs, approved: boolean) {
    if (!approved && !confirm(`O cliente não aprovou o orçamento da OS ${osNumber(o)}?`)) return;
    const { patch, message } = approved
      ? statusChange(o, 'approved', { channel: 'whatsapp' })
      : statusChange(o, 'cancelled', { declined: true });
    const { error } = await supabase.from('service_orders').update(patch).eq('id', o.id);
    if (error) { toast.error('Não salvou: ' + error.message); return; }
    toast.success(message);
    setReload(n => n + 1);
  }

  async function link(customerId: string | null) {
    const { error } = await supabase.from('whatsapp_chats').update({ customer_id: customerId }).eq('id', chat.id);
    if (error) { toast.error('Não salvou: ' + error.message); return; }
    onLinked(customerId);
  }

  const sales = os.filter(o => isSale({ ...o, price: Number(o.price ?? 0), customer_id: chat.customer_id, vehicle_id: null }));
  const spent = sales.reduce((s, o) => s + Number(o.price ?? 0), 0);
  const open = os.filter(o => OPEN.includes(o.status));
  const lastVisit = sales[0]?.completed_at ?? sales[0]?.created_at ?? null;

  return (
    <div className="h-full flex flex-col bg-white">
      <div className="px-4 pt-4 pb-3 border-b border-steel-100">
        {onClose && (
          <div className="flex justify-end -mt-1 -mr-1 mb-1">
            <button type="button" onClick={onClose} className="text-steel-400 hover:text-steel-700 text-lg" aria-label="Fechar">✕</button>
          </div>
        )}
        <div className="flex items-center gap-3">
          <ChatAvatar chat={chat} size={56} />
          <div className="min-w-0">
            <p className="font-bold text-steel-900 truncate">{chatTitle(chat)}</p>
            <p className="text-sm text-steel-500">{fmtPhone(chat.phone)}</p>
            {chat.name && customer && chat.name !== customer.full_name && (
              <p className="text-[11px] text-steel-400 truncate">No WhatsApp: {chat.name}</p>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        <ChatNotes chatId={chat.id} workshopId={workshopId} />

        {!chat.customer_id ? (
          <NotLinked chat={chat} workshopId={workshopId} onPick={id => link(id)} onCreate={() => setCreating(true)} />
        ) : loading || !customer ? (
          <p className="text-sm text-steel-500">Carregando…</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              <Stat label="Gasto total" value={fmtBRL(spent)} tone="emerald" />
              <Stat label="Visitas" value={String(sales.length)} tone="sky" />
            </div>
            <p className="text-xs text-steel-500 -mt-3">Última visita: {timeAgo(lastVisit)}</p>

            <div className="flex gap-2">
              <Link to={`/oficina/clientes/${customer.id}`} className="btn-secondary flex-1 text-sm text-center">Ver ficha</Link>
              <Link to={`/oficina/os?nova=1&cliente=${customer.id}${vehicles.length === 1 ? `&veiculo=${vehicles[0].id}` : ''}`} className="btn-primary flex-1 text-sm text-center">+ Nova OS</Link>
            </div>

            {customer.contact_opt_out && (
              <p className="text-xs font-semibold text-pending-700 bg-pending-500/10 rounded-lg px-3 py-2">
                Este cliente pediu para não receber mensagens de marketing.
              </p>
            )}

            <Section title="🚗 Veículos">
              {vehicles.length === 0 ? <Empty>Nenhum carro cadastrado</Empty> : vehicles.map(v => (
                <div key={v.id} className="flex items-center gap-2 py-1.5">
                  <LicensePlate plate={v.plate} size="sm" />
                  <span className="text-sm text-steel-700 truncate">{v.make} {v.model}{v.year ? ` ${v.year}` : ''}</span>
                </div>
              ))}
            </Section>

            <Section title="📋 OS em andamento" count={open.length}>
              {open.length === 0 ? <Empty>Nenhuma OS aberta</Empty> : (
                <>
                  {/* Aguardando aprovação primeiro (é onde se aprova pela conversa) */}
                  {[...open].sort((a, b) => Number(b.status === 'awaiting_approval') - Number(a.status === 'awaiting_approval'))
                    .slice(0, allOpen ? undefined : OPEN_SHOWN)
                    .map(o => <OsRow key={o.id} o={o} onDecide={ok => decide(o, ok)} />)}
                  {open.length > OPEN_SHOWN && (
                    <button type="button" onClick={() => setAllOpen(v => !v)} className="text-xs font-semibold text-brand-600 hover:underline">
                      {allOpen ? 'Mostrar menos' : `Ver mais ${open.length - OPEN_SHOWN}`}
                    </button>
                  )}
                </>
              )}
            </Section>

            {os.length > open.length && (
              <Section title="🗂️ Últimas OS" count={os.length - open.length} collapsible storageKey="inbox_panel_last_os">
                {os.filter(o => !open.includes(o)).slice(0, 5).map(o => <OsLine key={o.id} o={o} />)}
                <Link to={`/oficina/clientes/${customer.id}`} className="block text-xs font-semibold text-brand-600 hover:underline mt-1.5">
                  Ver todas na ficha →
                </Link>
              </Section>
            )}

            {customer.notes && (
              <Section title="📝 Observações">
                <p className="text-sm text-steel-700 whitespace-pre-wrap">{customer.notes}</p>
              </Section>
            )}

            <button type="button" onClick={() => link(null)} className="text-xs text-steel-400 hover:text-alert-600 underline">
              Não é este cliente? Desvincular
            </button>
          </>
        )}
      </div>

      {creating && (
        <CustomerForm
          workshopId={workshopId}
          initial={{ full_name: chat.name ?? '', phone: chat.phone }}
          onClose={() => setCreating(false)}
          onSaved={id => { setCreating(false); link(id); }}
        />
      )}
    </div>
  );
}

/** Contato sem cadastro: procurar cliente existente ou cadastrar */
function NotLinked({ chat, workshopId, onPick, onCreate }: {
  chat: WaChat; workshopId: string; onPick: (id: string) => void; onCreate: () => void;
}) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<{ id: string; full_name: string; phone: string | null }[]>([]);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      const digits = onlyDigits(term);
      let query = supabase.from('customers').select('id, full_name, phone').eq('workshop_id', workshopId).limit(8);
      query = digits.length >= 4 ? query.ilike('phone', `%${digits.slice(-8)}%`) : query.ilike('full_name', `%${term}%`);
      const { data } = await query;
      setResults(data ?? []);
    }, 250);
    return () => clearTimeout(t);
  }, [q, workshopId]);

  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-pending-500/10 px-3 py-2.5">
        <p className="text-sm font-semibold text-pending-700">Contato ainda não está no cadastro</p>
        <p className="text-xs text-steel-600 mt-0.5">Cadastre ou ligue a um cliente para ver carros e OS aqui.</p>
      </div>
      <button type="button" onClick={onCreate} className="btn-primary w-full text-sm">+ Cadastrar cliente</button>
      <div>
        <label className="label">Ou ligar a um cliente existente</label>
        <input className="input text-sm" value={q} onChange={e => setQ(e.target.value)} placeholder="Nome ou telefone…" />
        {results.length > 0 && (
          <div className="mt-2 rounded-xl border border-steel-200 divide-y divide-steel-100 overflow-hidden">
            {results.map(r => (
              <button key={r.id} type="button" onClick={() => onPick(r.id)} className="w-full text-left px-3 py-2 hover:bg-steel-50">
                <span className="block text-sm font-semibold text-steel-800 truncate">{r.full_name}</span>
                <span className="block text-xs text-steel-500">{fmtPhone(r.phone) || 'sem telefone'}</span>
              </button>
            ))}
          </div>
        )}
        {q.trim().length >= 2 && results.length === 0 && <p className="text-xs text-steel-400 mt-2">Nenhum cliente encontrado para “{q.trim()}”.</p>}
      </div>
      <p className="text-[11px] text-steel-400">WhatsApp: {chat.name || 'sem nome'} · {fmtPhone(chat.phone)}</p>
    </div>
  );
}

function OsRow({ o, onDecide }: { o: PanelOs; onDecide?: (approved: boolean) => void }) {
  const waiting = o.status === 'awaiting_approval' && !!onDecide;
  return (
    <div className={`rounded-xl border mb-1.5 overflow-hidden ${waiting ? 'border-pending-300' : 'border-steel-200'}`}>
      <Link to={`/oficina/os/${o.id}`} className="block px-3 py-2 hover:bg-steel-50">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-bold text-steel-500">{osNumber(o)}</span>
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${osStatusColor(o)}`}>{osStatusLabel(o)}</span>
        </div>
        <p className="text-sm font-semibold text-steel-800 truncate">{o.title}</p>
        <p className="text-xs text-steel-500">{fmtBRL(o.price)} · {new Date(o.created_at).toLocaleDateString('pt-BR')}</p>
      </Link>
      {waiting && (
        <div className="flex border-t border-pending-200">
          <button type="button" onClick={() => onDecide!(true)}
            className="flex-1 py-1.5 text-xs font-bold text-white bg-emerald-500 hover:bg-emerald-600">✅ Cliente aprovou</button>
          <button type="button" onClick={() => onDecide!(false)}
            className="px-3 py-1.5 text-xs font-semibold text-alert-600 bg-white hover:bg-alert-500/5">✕ Não aprovou</button>
        </div>
      )}
    </div>
  );
}

/** Linha compacta do histórico: nº · serviço · situação · valor */
function OsLine({ o }: { o: PanelOs }) {
  return (
    <Link to={`/oficina/os/${o.id}`} className="flex items-center gap-2 py-1.5 border-b border-steel-100 last:border-0 hover:bg-steel-50 -mx-1 px-1 rounded">
      <span className="text-[11px] font-bold text-steel-400 shrink-0">{osNumber(o)}</span>
      <span className="text-sm text-steel-700 truncate flex-1">{o.title}</span>
      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0 ${osStatusColor(o)}`}>{osStatusLabel(o)}</span>
      <span className="text-xs text-steel-500 tabular-nums shrink-0">{fmtBRL(o.price)}</span>
    </Link>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: 'emerald' | 'sky' }) {
  const cls = tone === 'emerald' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-sky-50 border-sky-200 text-sky-700';
  return (
    <div className={`rounded-xl border px-3 py-2 ${cls}`}>
      <p className="text-[10px] font-bold uppercase tracking-wide opacity-80">{label}</p>
      <p className="text-lg font-bold">{value}</p>
    </div>
  );
}

function Section({ title, count, collapsible, storageKey, children }: {
  title: string; count?: number; collapsible?: boolean; storageKey?: string; children: React.ReactNode;
}) {
  // Recolhível começa fechado; lembra a escolha neste aparelho
  const [open, setOpen] = useState(() => {
    if (!collapsible) return true;
    try { return storageKey ? localStorage.getItem(storageKey) === '1' : false; } catch { return false; }
  });
  function toggle() {
    setOpen(v => {
      try { if (storageKey) localStorage.setItem(storageKey, v ? '0' : '1'); } catch { /* sem localStorage */ }
      return !v;
    });
  }
  const label = <>{title}{count != null && count > 0 && <span className="ml-1 text-steel-400">({count})</span>}</>;
  return (
    <div>
      {collapsible ? (
        <button type="button" onClick={toggle} aria-expanded={open}
          className="w-full flex items-center justify-between text-[11px] font-bold uppercase tracking-widest text-steel-500 hover:text-steel-800 mb-1.5">
          <span>{label}</span>
          <span className={`text-[10px] transition-transform ${open ? 'rotate-90' : ''}`}>▶</span>
        </button>
      ) : (
        <p className="text-[11px] font-bold uppercase tracking-widest text-steel-500 mb-1.5">{label}</p>
      )}
      {open && children}
    </div>
  );
}

const Empty = ({ children }: { children: React.ReactNode }) => <p className="text-sm text-steel-400 italic">{children}</p>;
