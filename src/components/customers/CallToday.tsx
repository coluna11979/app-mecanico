import { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { toast } from '@/components/ui/Toast';
import { fmtBRL, waNumber } from '@/components/os/osHelpers';
import { Icon, type IconName } from '@/components/home/ui';
import type { CallReason } from '@/lib/customerInsights';
import WhatsAppButton from '@/components/inbox/WhatsAppButton';

export type CallItem = {
  id: string; name: string; phone: string | null; car: string | null; lastService: string | null;
  spent: number; reason: CallReason;
};

type MsgKind = 'quote' | 'service' | 'return';
const msgKind = (r: CallReason): MsgKind => (r.kind === 'quote' ? 'quote' : r.kind === 'service' ? 'service' : 'return');

const DEFAULTS: Record<MsgKind, string> = {
  quote: 'Olá, {nome}! Aqui é da {oficina}. Conseguiu ver o orçamento do seu {carro}? Se tiver qualquer dúvida, é só responder esta mensagem.',
  service: 'Olá, {nome}! Aqui é da {oficina}. 🚗\nEstá chegando a hora da revisão do seu {carro}. Quer agendar? É só responder esta mensagem.',
  // Mesmo texto (e a mesma chave salva) da antiga aba "Reativar clientes"
  return: 'Olá, {nome}! Aqui é da {oficina}. 🚗\nFaz {tempo} desde o último serviço no seu {carro} ({servico}).\nQue tal agendar uma revisão? É só responder esta mensagem.',
};
const LABELS: Record<MsgKind, string> = { quote: 'Orçamento parado', service: 'Revisão próxima', return: 'Em risco e sumidos' };
const keyOf = (wid: string, k: MsgKind) => (k === 'return' ? `reativar-template:${wid}` : `crm-template-${k}:${wid}`);

const ICON: Record<CallReason['kind'], IconName> = { quote: 'clipboard', service: 'calendar', risk: 'clock', gone: 'history' };
/** Selo do motivo: diferença discreta, só laranja claro e cinzas */
const BADGE: Record<CallReason['kind'], { label: string; cls: string }> = {
  quote:   { label: 'Orçamento parado', cls: 'bg-brand-50 text-brand-700 ring-brand-100' },
  service: { label: 'Revisão próxima',  cls: 'bg-white text-steel-700 ring-steel-300' },
  risk:    { label: 'Em risco',         cls: 'bg-steel-100 text-steel-800 ring-steel-200' },
  gone:    { label: 'Sumido',           cls: 'bg-steel-50 text-steel-500 ring-steel-200' },
};
/** Detalhe do motivo, sem repetir o nome do selo */
function reasonDetail(r: CallReason) {
  const span = (d: number) => (d < 60 ? `${d} dias` : `${Math.round(d / 30)} meses`);
  switch (r.kind) {
    case 'quote':   return `parado há ${r.days} dia${r.days === 1 ? '' : 's'}`;
    case 'service': return r.days > 0 ? `vence em ${r.days} dia${r.days === 1 ? '' : 's'}` : r.days === 0 ? 'vence hoje' : `vencida há ${-r.days} dia${r.days === -1 ? '' : 's'}`;
    case 'risk':    return r.intervalDays ? `volta a cada ${span(r.intervalDays)} · faz ${span(r.sinceDays)}` : `faz ${span(r.sinceDays)}`;
    case 'gone':    return `há ${span(r.sinceDays)}`;
  }
}

/** Quantos aparecem antes do "Ver todos" (o bloco não pode empurrar a lista de clientes para baixo) */
const INITIAL = 4;

/** Abas por motivo — orçamento parado primeiro (é dinheiro na mesa) */
type TabKey = 'all' | CallReason['kind'];
const TABS: { key: TabKey; label: string }[] = [
  { key: 'all', label: 'Todos' },
  { key: 'quote', label: 'Orçamentos parados' },
  { key: 'service', label: 'Revisão' },
  { key: 'risk', label: 'Em risco' },
  { key: 'gone', label: 'Sumidos' },
];

/** WhatsApp: a ação principal, em tom suave (a lista tem várias linhas — laranja cheio em todas cansa) */
const BTN_PRI = 'inline-flex items-center justify-center gap-1.5 rounded-lg bg-brand-50 text-brand-700 ring-1 ring-brand-200 px-3 h-10 sm:h-8 text-sm font-semibold hover:bg-brand-500 hover:text-white hover:ring-brand-500 transition';
const BTN_SEC = 'inline-flex items-center justify-center gap-1.5 rounded-lg text-steel-600 px-2.5 h-10 sm:h-8 text-sm font-semibold hover:bg-steel-100 hover:text-steel-900 transition';
/** "Já chamei": secundária, contorno fino e menor que o WhatsApp */
const BTN_OUTLINE = 'inline-flex items-center justify-center gap-1 rounded-lg bg-white text-steel-600 ring-1 ring-steel-200 px-2.5 h-10 sm:h-7 text-xs font-semibold hover:bg-steel-50 hover:text-steel-900 transition';

function loadTpl(wid: string, k: MsgKind) {
  try { return localStorage.getItem(keyOf(wid, k)) || DEFAULTS[k]; } catch { return DEFAULTS[k]; }
}

/** Monta a mensagem do motivo com os dados do cliente */
export function callMessage(wid: string, shopName: string, c: Pick<CallItem, 'name' | 'car' | 'lastService'>, reason: CallReason | null) {
  const k = reason ? msgKind(reason) : 'return';
  const since = reason && (reason.kind === 'risk' || reason.kind === 'gone') ? reason.sinceDays : null;
  const tempo = since == null ? 'um tempo' : since < 60 ? `${since} dias` : since < 365 ? `${Math.round(since / 30)} meses` : `${Math.floor(since / 365)} ano${since >= 730 ? 's' : ''}`;
  const vars: Record<string, string> = {
    '{nome}': c.name.split(' ')[0], '{oficina}': shopName, '{carro}': c.car || 'carro',
    '{tempo}': tempo, '{servico}': c.lastService || 'último serviço',
  };
  return Object.entries(vars).reduce((t, [a, b]) => t.split(a).join(b), loadTpl(wid, k));
}

/**
 * Quem devo chamar hoje — só clientes com motivo claro.
 * WhatsApp só abre a mensagem pronta; o contato é registrado no "Já chamei" (aí o cliente sai da lista por 30 dias).
 */
export default function CallToday({ items, workshopId, shopName, onContacted, onSchedule }: {
  items: CallItem[]; workshopId: string; shopName: string;
  onContacted: (id: string) => void;
  onSchedule: (customerId: string) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>('all');
  const [, force] = useState(0);
  const countOf = (k: TabKey) => (k === 'all' ? items.length : items.filter(c => c.reason.kind === k).length);
  const inTab = tab === 'all' ? items : items.filter(c => c.reason.kind === tab);
  const visible = showAll ? inTab : inTab.slice(0, INITIAL);

  async function contacted(c: CallItem) {
    setBusy(c.id);
    const { error } = await supabase.from('customers').update({ last_contacted_at: new Date().toISOString() }).eq('id', c.id);
    setBusy(null);
    if (error) return toast.error('Não foi possível registrar: ' + error.message);
    toast.success(`${c.name.split(' ')[0]} marcado como chamado — volta à lista em 30 dias se ainda precisar`);
    onContacted(c.id);
  }

  return (
    <section>
      <div className="flex items-center justify-between h-6 mb-2">
        <h2 className="text-sm font-semibold text-steel-900">
          Quem devo chamar hoje {items.length > 0 && <span className="text-steel-400 font-medium">({items.length})</span>}
        </h2>
        <div className="flex items-center gap-3">
          <button onClick={() => setEditing(e => !e)} className="text-xs font-semibold text-steel-500 hover:text-steel-800">
            {editing ? 'Fechar mensagens' : 'Editar mensagens'}
          </button>
          {inTab.length > INITIAL && (
            <button onClick={() => setShowAll(s => !s)} className="text-xs font-semibold text-brand-600 hover:underline">
              {showAll ? 'Mostrar menos' : `Ver todos (${inTab.length})`}
            </button>
          )}
        </div>
      </div>

      {editing && (
        <div className="rounded-xl bg-white ring-1 ring-steel-200/70 p-4 mb-3 space-y-3">
          {(Object.keys(DEFAULTS) as MsgKind[]).map(k => (
            <label key={k} className="block">
              <span className="text-xs font-semibold text-steel-600">{LABELS[k]}</span>
              <textarea className="input text-sm mt-1" rows={3} defaultValue={loadTpl(workshopId, k)}
                onChange={e => { try { localStorage.setItem(keyOf(workshopId, k), e.target.value); } catch { /* sem storage */ } force(n => n + 1); }} />
            </label>
          ))}
          <p className="text-[11px] text-steel-500">
            Use {'{nome}'}, {'{oficina}'}, {'{carro}'}, {'{tempo}'} e {'{servico}'}. Fica salvo neste navegador.
          </p>
        </div>
      )}

      {items.length > 0 && (
        <div className="flex gap-1 overflow-x-auto mb-2 -mx-1 px-1 [scrollbar-width:none]">
          {TABS.filter(t => t.key === 'all' || countOf(t.key) > 0).map(t => (
            <button key={t.key} type="button" onClick={() => { setTab(t.key); setShowAll(false); }}
              className={`shrink-0 inline-flex items-center gap-1.5 px-3 h-7 rounded-full text-xs font-semibold transition ${
                tab === t.key ? 'bg-steel-900 text-white' : 'text-steel-600 hover:bg-steel-100'}`}>
              {t.label}
              <span className={`tabular-nums ${tab === t.key ? 'text-steel-300' : t.key === 'quote' ? 'text-brand-600' : 'text-steel-400'}`}>{countOf(t.key)}</span>
            </button>
          ))}
        </div>
      )}

      {items.length === 0 ? (
        <div className="rounded-xl bg-white ring-1 ring-steel-200/70 px-4 py-3 flex items-center gap-3">
          <span className="h-8 w-8 rounded-full bg-signal-50 text-signal-600 grid place-items-center"><Icon name="check" size={16} /></span>
          <div>
            <div className="font-semibold text-steel-900">Ninguém para chamar agora</div>
            <div className="text-sm text-steel-500">Orçamentos parados, revisões, clientes em risco e sumidos aparecem aqui.</div>
          </div>
        </div>
      ) : (
        <ul className="space-y-2 sm:space-y-0 sm:rounded-xl sm:bg-white sm:ring-1 sm:ring-steel-200/70 sm:divide-y sm:divide-steel-100 sm:overflow-hidden">
          {visible.map(c => {
            const wa = waNumber(c.phone);
            const r = c.reason;
            return (
              <li key={c.id} className="flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-3 sm:py-2.5 rounded-xl sm:rounded-none bg-white ring-1 ring-steel-200/70 sm:ring-0">
                <Link to={`/oficina/clientes/${c.id}`} className="flex items-center gap-3 flex-1 min-w-0 group">
                  <span className="h-8 w-8 rounded-lg bg-steel-100 text-steel-500 grid place-items-center shrink-0"><Icon name={ICON[r.kind]} size={15} /></span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm font-semibold text-steel-900 truncate group-hover:underline">{c.name}</span>
                      <span className={`shrink-0 inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ${BADGE[r.kind].cls}`}>{BADGE[r.kind].label}</span>
                    </div>
                    <div className="text-xs text-steel-500 truncate mt-0.5">
                      {reasonDetail(r)}{c.car ? ` · ${c.car}` : ''}
                      {r.kind === 'quote' && r.value > 0 && <span className="sm:hidden font-semibold text-steel-800"> · {fmtBRL(r.value)}</span>}
                    </div>
                  </div>
                </Link>
                {r.kind === 'quote' && r.value > 0 && (
                  <span className="hidden sm:block text-sm font-bold text-steel-900 tabular-nums shrink-0">{fmtBRL(r.value)}</span>
                )}
                <div className="flex items-center gap-1.5 sm:shrink-0">
                  {r.kind === 'quote' && <Link to={`/oficina/os/${r.osId}`} className={`${BTN_SEC} flex-1 sm:flex-none`}>Ver orçamento</Link>}
                  {r.kind === 'service' && <button onClick={() => onSchedule(c.id)} className={`${BTN_SEC} flex-1 sm:flex-none`}>Agendar</button>}
                  {wa && (
                    <WhatsAppButton phone={wa} text={callMessage(workshopId, shopName, c, r)} customerId={c.id} customerName={c.name}
                      className={`${BTN_PRI} flex-[2] sm:flex-none`}><Icon name="chat" size={15} />WhatsApp</WhatsAppButton>
                  )}
                  <button onClick={() => contacted(c)} disabled={busy === c.id} className={`${BTN_OUTLINE} flex-1 sm:flex-none disabled:opacity-50`} title="Registrar que você já falou com o cliente">
                    <Icon name="check" size={13} />Já chamei
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
