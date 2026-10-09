import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import WorkshopLayout from '@/components/layout/WorkshopLayout';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/components/ui/Toast';
import { fmtPhone } from '@/components/os/osHelpers';
import { onlyDigits } from '@/lib/customers';
import {
  CHAT_COLUMNS, URGENT_MIN, chatTitle, fmtListTime, fmtWait, inboxCall, isAwaiting, isUrgent, minutesSince,
  type InstanceStatus, type WaChat, type WaInstance,
} from '@/lib/inbox';
import ChatAvatar from '@/components/inbox/ChatAvatar';
import ChatView from '@/components/inbox/ChatView';
import ClientPanel from '@/components/inbox/ClientPanel';
import ConnectWhatsApp from '@/components/inbox/ConnectWhatsApp';

type Filter = 'abertas' | 'aguardando' | 'nao_lidas' | 'concluidas' | 'todas';
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'abertas', label: 'Abertas' },
  { key: 'aguardando', label: 'Aguardando' },
  { key: 'nao_lidas', label: 'Não lidas' },
  { key: 'concluidas', label: 'Concluídas' },
  { key: 'todas', label: 'Todas' },
];

/** Inbox do WhatsApp da oficina: conversas com os clientes pelo número da oficina */
export default function WorkshopInbox() {
  const { currentWorkshop } = useAuth();
  const wid = currentWorkshop?.id ?? null;

  const [instance, setInstance] = useState<WaInstance | null>(null);
  const [instanceLoaded, setInstanceLoaded] = useState(false);
  const [chats, setChats] = useState<WaChat[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('abertas');
  const [search, setSearch] = useState('');
  const [showClient, setShowClient] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [now, setNow] = useState(Date.now());

  // Relógio dos "aguardando há…"
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t); }, []);

  /* ── Número conectado ── */
  const loadInstance = useCallback(async () => {
    if (!wid) return;
    const { data } = await supabase.from('whatsapp_instances')
      .select('workshop_id, status, phone_number, profile_name, last_connected_at').eq('workshop_id', wid).maybeSingle();
    setInstance((data as WaInstance) ?? null);
    setInstanceLoaded(true);
  }, [wid]);

  useEffect(() => {
    if (!wid) return;
    loadInstance();
    // Confere o status de verdade na UAZAPI ao abrir (o webhook mantém atualizado depois)
    inboxCall('whatsapp-instance', { action: 'status', workshop_id: wid }).then(loadInstance).catch(() => {});
  }, [wid, loadInstance]);

  /* ── Conversas (tempo real) ── */
  const loadChats = useCallback(async () => {
    if (!wid) return;
    const { data, error } = await supabase.from('whatsapp_chats').select(CHAT_COLUMNS)
      .eq('workshop_id', wid).order('last_message_at', { ascending: false, nullsFirst: false }).limit(500);
    if (error) toast.error('Erro ao carregar conversas: ' + error.message);
    setChats((data ?? []) as unknown as WaChat[]);
    setLoading(false);
  }, [wid]);

  useEffect(() => {
    if (!wid) return;
    setLoading(true);
    loadChats();
    const ch = supabase.channel(`wa-inbox-${wid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_chats', filter: `workshop_id=eq.${wid}` }, async p => {
        if (p.eventType === 'DELETE') { setChats(prev => prev.filter(c => c.id !== (p.old as WaChat).id)); return; }
        // Linha do realtime não traz o cliente (join): busca a conversa completa
        const { data } = await supabase.from('whatsapp_chats').select(CHAT_COLUMNS).eq('id', (p.new as WaChat).id).maybeSingle();
        if (!data) return;
        const row = data as unknown as WaChat;
        setChats(prev => [row, ...prev.filter(c => c.id !== row.id)]
          .sort((a, b) => (b.last_message_at ?? '').localeCompare(a.last_message_at ?? '')));
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'whatsapp_instances', filter: `workshop_id=eq.${wid}` }, () => loadInstance())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'whatsapp_instances', filter: `workshop_id=eq.${wid}` }, () => loadInstance())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [wid, loadChats, loadInstance]);

  const status: InstanceStatus = instance?.status ?? 'none';
  const connected = status === 'connected';

  /* ── Números do topo ── */
  const metrics = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const awaiting = chats.filter(isAwaiting);
    return {
      awaiting: awaiting.length,
      urgent: chats.filter(c => isUrgent(c, now)).length,
      longest: awaiting.reduce((m, c) => Math.max(m, minutesSince(c.awaiting_since, now)), 0),
      resolvedToday: chats.filter(c => c.status === 'resolved' && c.resolved_at && new Date(c.resolved_at) >= today).length,
      unread: chats.filter(c => c.unread_count > 0).length,
    };
  }, [chats, now]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const digits = onlyDigits(q);
    return chats
      .filter(c => {
        if (filter === 'abertas') return c.status === 'open';
        if (filter === 'aguardando') return isAwaiting(c);
        if (filter === 'nao_lidas') return c.unread_count > 0;
        if (filter === 'concluidas') return c.status === 'resolved';
        return true;
      })
      .filter(c => !q || chatTitle(c).toLowerCase().includes(q) || (c.name ?? '').toLowerCase().includes(q)
        || (digits.length >= 3 && c.phone.includes(digits)))
      // Aguardando: quem espera há mais tempo primeiro
      .sort((a, b) => filter === 'aguardando'
        ? (a.awaiting_since ?? '').localeCompare(b.awaiting_since ?? '')
        : (b.last_message_at ?? '').localeCompare(a.last_message_at ?? ''));
  }, [chats, filter, search]);

  const selected = chats.find(c => c.id === selectedId) ?? null;

  async function resolve(chat: WaChat, resolved: boolean) {
    const patch = resolved
      ? { status: 'resolved' as const, resolved_at: new Date().toISOString(), unread_count: 0 }
      : { status: 'open' as const, resolved_at: null };
    setChats(prev => prev.map(c => (c.id === chat.id ? { ...c, ...patch } : c)));
    const { error } = await supabase.from('whatsapp_chats').update(patch).eq('id', chat.id);
    if (error) { toast.error('Não salvou: ' + error.message); loadChats(); return; }
    if (resolved) {
      toast.success('Conversa concluída ✓');
      // Vai para a próxima que está esperando
      const next = visible.find(c => c.id !== chat.id && isAwaiting(c));
      setSelectedId(next?.id ?? null);
    }
  }

  async function disconnect() {
    if (!wid || !confirm('Desconectar o WhatsApp da oficina? As mensagens param de chegar aqui até conectar de novo.')) return;
    try {
      await inboxCall('whatsapp-instance', { action: 'disconnect', workshop_id: wid });
      toast.success('WhatsApp desconectado');
      loadInstance();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível desconectar');
    }
  }

  if (!wid) return <WorkshopLayout><p className="text-steel-500">Selecione uma oficina.</p></WorkshopLayout>;

  return (
    <WorkshopLayout>
      <div
        className="flex flex-col h-[calc(100dvh-56px-16px-84px-env(safe-area-inset-bottom,0px))] lg:h-[calc(100dvh-64px)]"
      >
        <div className="flex-1 min-h-0 flex rounded-2xl overflow-hidden border border-steel-200 bg-white shadow-card">
          {/* ── Lista de conversas ── */}
          <aside className={`w-full lg:w-[360px] shrink-0 border-r border-steel-100 flex-col ${selected ? 'hidden lg:flex' : 'flex'}`}>
            <div className="px-4 pt-3 pb-2 border-b border-steel-100 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <h1 className="text-lg font-bold text-steel-900 leading-tight">WhatsApp</h1>
                  <StatusChip status={status} phone={instance?.phone_number ?? null} loaded={instanceLoaded} />
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {connected && (
                    <button type="button" onClick={() => setNewOpen(true)} className="btn-primary !py-1.5 !px-3 text-xs">+ Nova</button>
                  )}
                  {instance && status !== 'none' && (
                    <button type="button" onClick={connected ? disconnect : () => setConnectOpen(true)}
                      className="btn-ghost !py-1.5 !px-2.5 text-xs" title={connected ? 'Desconectar número' : 'Conectar número'}>
                      {connected ? '⏻' : '🔌'}
                    </button>
                  )}
                </div>
              </div>

              {/* Números do atendimento */}
              <div className="grid grid-cols-3 gap-1.5">
                <Metric label="Aguardando" value={metrics.awaiting} sub={metrics.longest ? `máx. ${fmtWait(metrics.longest)}` : undefined}
                  tone="amber" active={filter === 'aguardando'} onClick={() => setFilter(f => (f === 'aguardando' ? 'abertas' : 'aguardando'))} />
                <Metric label="Urgentes" value={metrics.urgent} sub={`+${URGENT_MIN} min`} tone="red"
                  active={false} onClick={() => setFilter('aguardando')} />
                <Metric label="Concluídas hoje" value={metrics.resolvedToday} tone="green"
                  active={filter === 'concluidas'} onClick={() => setFilter(f => (f === 'concluidas' ? 'abertas' : 'concluidas'))} />
              </div>

              <input className="input !py-2 text-sm" placeholder="🔍 Buscar por nome ou telefone…" value={search} onChange={e => setSearch(e.target.value)} />

              <div className="flex flex-wrap gap-1">
                {FILTERS.map(f => (
                  <button key={f.key} type="button" onClick={() => setFilter(f.key)}
                    className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full border transition ${filter === f.key
                      ? 'bg-steel-900 text-white border-steel-900' : 'bg-white text-steel-600 border-steel-200 hover:bg-steel-50'}`}>
                    {f.label}
                    {f.key === 'nao_lidas' && metrics.unread > 0 && <span className="ml-1 text-emerald-500">{metrics.unread}</span>}
                  </button>
                ))}
              </div>
            </div>

            {/* Aviso de desconectado */}
            {instanceLoaded && !connected && (
              <div className="mx-3 mt-3 rounded-xl border border-alert-500/30 bg-alert-500/5 p-3">
                <p className="text-sm font-bold text-alert-600">
                  {status === 'none' ? 'Conecte o WhatsApp da oficina' : status === 'banned' ? 'Número bloqueado pelo WhatsApp' : 'WhatsApp desconectado'}
                </p>
                <p className="text-xs text-steel-600 mt-0.5">
                  {status === 'none'
                    ? 'Leia o QR code com o celular da oficina para receber e responder os clientes aqui.'
                    : 'As mensagens não estão sendo enviadas nem recebidas.'}
                </p>
                <button type="button" onClick={() => setConnectOpen(true)} className="btn-primary text-sm w-full mt-2">
                  {status === 'none' ? 'Conectar pelo QR code' : 'Reconectar'}
                </button>
              </div>
            )}

            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <p className="text-sm text-steel-500 p-4">Carregando…</p>
              ) : visible.length === 0 ? (
                <div className="text-center px-6 py-12">
                  <div className="text-4xl mb-2">💬</div>
                  <p className="font-semibold text-steel-700">
                    {chats.length === 0 ? 'Nenhuma conversa ainda' : search ? 'Nada encontrado' : 'Nenhuma conversa neste filtro'}
                  </p>
                  {chats.length === 0 && connected && (
                    <p className="text-sm text-steel-500 mt-1">Quando um cliente mandar mensagem para a oficina, ela aparece aqui.</p>
                  )}
                </div>
              ) : (
                visible.map(c => (
                  <ChatRow key={c.id} c={c} now={now} active={c.id === selectedId}
                    onClick={() => { setSelectedId(c.id); setShowClient(false); }} />
                ))
              )}
            </div>
            {visible.length > 0 && (
              <p className="text-[11px] text-steel-400 text-center py-1.5 border-t border-steel-100">
                {visible.length} conversa{visible.length === 1 ? '' : 's'}{search ? ' · busca ativa' : filter !== 'abertas' ? ` · ${FILTERS.find(f => f.key === filter)?.label.toLowerCase()}` : ''}
              </p>
            )}
          </aside>

          {/* ── Conversa aberta ── */}
          {selected ? (
            <>
              <section className={`flex-1 min-w-0 flex ${showClient ? 'hidden md:flex' : 'flex'}`}>
                <ChatView
                  chat={selected}
                  workshopId={wid}
                  connected={connected}
                  onBack={() => setSelectedId(null)}
                  onToggleClient={() => setShowClient(s => !s)}
                  onResolve={r => resolve(selected, r)}
                  onConnect={() => setConnectOpen(true)}
                />
              </section>
              {/* Painel do cliente: fixo no monitor grande, gaveta nas telas menores */}
              <aside className={`${showClient ? 'flex' : 'hidden'} xl:flex w-full md:w-[320px] shrink-0 border-l border-steel-100 flex-col`}>
                <ClientPanel
                  chat={selected}
                  workshopId={wid}
                  onClose={() => setShowClient(false)}
                  onLinked={() => loadChats()}
                />
              </aside>
            </>
          ) : (
            <div className="hidden lg:flex flex-1 flex-col items-center justify-center text-center px-6 bg-steel-50/40">
              <div className="text-6xl mb-3">💬</div>
              <p className="text-xl font-bold text-steel-700">Selecione uma conversa</p>
              <p className="text-sm text-steel-500 mt-1 max-w-sm">
                Responda os clientes pelo número da oficina. Do lado aparecem os carros e as OS de quem está falando.
              </p>
            </div>
          )}
        </div>
      </div>

      {connectOpen && (
        <ConnectWhatsApp workshopId={wid} onClose={() => { setConnectOpen(false); loadInstance(); }}
          onConnected={() => { setConnectOpen(false); loadInstance(); }} />
      )}
      {newOpen && (
        <NewChat workshopId={wid} onClose={() => setNewOpen(false)}
          onStarted={id => { setNewOpen(false); loadChats().then(() => setSelectedId(id)); }} />
      )}
    </WorkshopLayout>
  );
}

function StatusChip({ status, phone, loaded }: { status: InstanceStatus; phone: string | null; loaded: boolean }) {
  if (!loaded) return <p className="text-xs text-steel-400">…</p>;
  const map: Record<InstanceStatus, { dot: string; label: string }> = {
    connected:    { dot: 'bg-emerald-500', label: phone ? `Conectado · ${fmtPhone(phone)}` : 'Conectado' },
    connecting:   { dot: 'bg-pending-500', label: 'Conectando…' },
    disconnected: { dot: 'bg-alert-500', label: 'Desconectado' },
    banned:       { dot: 'bg-alert-500', label: 'Número bloqueado' },
    none:         { dot: 'bg-steel-300', label: 'Não conectado' },
  };
  const s = map[status];
  return (
    <p className="text-xs text-steel-500 flex items-center gap-1.5">
      <span className={`h-2 w-2 rounded-full ${s.dot}`} />{s.label}
    </p>
  );
}

function Metric({ label, value, sub, tone, active, onClick }: {
  label: string; value: number; sub?: string; tone: 'amber' | 'red' | 'green'; active: boolean; onClick: () => void;
}) {
  const colors = {
    amber: value ? 'text-pending-700' : 'text-steel-400',
    red: value ? 'text-alert-600' : 'text-steel-400',
    green: value ? 'text-emerald-600' : 'text-steel-400',
  }[tone];
  return (
    <button type="button" onClick={onClick}
      className={`rounded-xl border px-2 py-1.5 text-left transition ${active ? 'border-steel-900 bg-steel-50' : 'border-steel-200 hover:bg-steel-50'}`}>
      <p className={`text-lg font-bold leading-none ${colors}`}>{value}</p>
      <p className="text-[10px] font-semibold text-steel-500 mt-0.5 leading-tight">{label}</p>
      {sub && <p className="text-[9px] text-steel-400 leading-tight">{sub}</p>}
    </button>
  );
}

function ChatRow({ c, now, active, onClick }: { c: WaChat; now: number; active: boolean; onClick: () => void }) {
  const waiting = isAwaiting(c) ? minutesSince(c.awaiting_since, now) : 0;
  const urgent = isUrgent(c, now);
  return (
    <button type="button" onClick={onClick}
      className={`w-full text-left px-3 py-2.5 flex gap-3 border-b border-steel-50 transition ${active ? 'bg-brand-50' : 'hover:bg-steel-50'} ${urgent ? 'border-l-4 border-l-alert-500' : 'border-l-4 border-l-transparent'}`}>
      <ChatAvatar chat={c} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className={`text-sm truncate ${c.unread_count ? 'font-bold text-steel-900' : 'font-semibold text-steel-800'}`}>{chatTitle(c)}</span>
          <span className={`text-[10px] shrink-0 ${c.unread_count ? 'text-emerald-600 font-bold' : 'text-steel-400'}`}>{fmtListTime(c.last_message_at)}</span>
        </div>
        <div className="flex items-center gap-2">
          <p className="text-xs text-steel-500 truncate flex-1">
            {c.last_message_from_me && <span className="text-steel-400">Você: </span>}
            {c.last_message_preview ?? ''}
          </p>
          {c.unread_count > 0 && (
            <span className="h-5 min-w-5 px-1.5 rounded-full bg-emerald-500 text-white text-[10px] font-bold grid place-items-center shrink-0">{c.unread_count}</span>
          )}
        </div>
        <div className="flex items-center gap-1.5 mt-1">
          {waiting > 0 && (
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${urgent ? 'bg-alert-500 text-white' : 'bg-pending-500/15 text-pending-700'}`}>
              {urgent ? 'URGENTE · ' : ''}Aguardando {fmtWait(waiting)}
            </span>
          )}
          {c.status === 'resolved' && <span className="text-[10px] font-semibold text-emerald-600">✓ Concluída</span>}
          {!c.customer_id && <span className="text-[10px] text-steel-400">· sem cadastro</span>}
        </div>
      </div>
    </button>
  );
}

/** Começar conversa: escolhe um cliente (ou digita o número) e manda a primeira mensagem */
function NewChat({ workshopId, onClose, onStarted }: {
  workshopId: string; onClose: () => void; onStarted: (chatId: string) => void;
}) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<{ id: string; full_name: string; phone: string | null }[]>([]);
  const [picked, setPicked] = useState<{ id: string | null; name: string; phone: string } | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2 || picked) { setResults([]); return; }
    const t = setTimeout(async () => {
      const digits = onlyDigits(term);
      let query = supabase.from('customers').select('id, full_name, phone').eq('workshop_id', workshopId).not('phone', 'is', null).limit(8);
      query = digits.length >= 4 ? query.ilike('phone', `%${digits.slice(-8)}%`) : query.ilike('full_name', `%${term}%`);
      const { data } = await query;
      setResults(data ?? []);
    }, 250);
    return () => clearTimeout(t);
  }, [q, workshopId, picked]);

  const typedDigits = onlyDigits(q);
  const canUseTyped = !picked && typedDigits.length >= 10 && typedDigits.length <= 13;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const target = picked ?? (canUseTyped ? { id: null, name: '', phone: typedDigits } : null);
    if (!target) { toast.error('Escolha um cliente ou digite o número com DDD'); return; }
    if (!text.trim()) { toast.error('Escreva a mensagem'); return; }
    setSending(true);
    try {
      const r = await inboxCall<{ chat_id: string }>('whatsapp-send', {
        workshop_id: workshopId, phone: target.phone, name: target.name || null, customer_id: target.id, text,
      });
      toast.success('Mensagem enviada ✓');
      onStarted(r.chat_id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível enviar');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-steel-900/60 grid place-items-center p-4" onClick={onClose}>
      <form onSubmit={submit} onClick={e => e.stopPropagation()} className="card max-w-md w-full space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Nova conversa</h2>
          <button type="button" onClick={onClose} className="text-steel-400 hover:text-steel-700 text-xl">✕</button>
        </div>

        <div>
          <label className="label">Para</label>
          {picked ? (
            <div className="flex items-center gap-2 rounded-xl border border-steel-200 px-3 py-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{picked.name || fmtPhone(picked.phone)}</p>
                {picked.name && <p className="text-xs text-steel-500">{fmtPhone(picked.phone)}</p>}
              </div>
              <button type="button" onClick={() => { setPicked(null); setQ(''); }} className="text-steel-400 hover:text-steel-700">✕</button>
            </div>
          ) : (
            <>
              <input className="input" autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Nome do cliente ou número com DDD" />
              {results.length > 0 && (
                <div className="mt-2 rounded-xl border border-steel-200 divide-y divide-steel-100 overflow-hidden max-h-56 overflow-y-auto">
                  {results.map(r => (
                    <button key={r.id} type="button" onClick={() => setPicked({ id: r.id, name: r.full_name, phone: r.phone ?? '' })}
                      className="w-full text-left px-3 py-2 hover:bg-steel-50">
                      <span className="block text-sm font-semibold truncate">{r.full_name}</span>
                      <span className="block text-xs text-steel-500">{fmtPhone(r.phone)}</span>
                    </button>
                  ))}
                </div>
              )}
              {canUseTyped && results.length === 0 && (
                <p className="text-xs text-steel-500 mt-1.5">Enviar para {fmtPhone(typedDigits)}</p>
              )}
            </>
          )}
        </div>

        <div>
          <label className="label">Mensagem</label>
          <textarea className="input min-h-[96px]" value={text} onChange={e => setText(e.target.value)} placeholder="Olá! Aqui é da oficina…" />
        </div>

        <button type="submit" disabled={sending} className="btn-primary w-full">{sending ? 'Enviando…' : 'Enviar pelo WhatsApp'}</button>
      </form>
    </div>
  );
}
