import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import WorkshopLayout from '@/components/layout/WorkshopLayout';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/components/ui/Toast';
import LicensePlate from '@/components/os/LicensePlate';
import {
  CHECKUP_TEMPLATE, DECISION_META, MECHANIC_STAGE_META, SYSTEM_ICON, STATUS_META,
  computeScore, itemQuote, mechanicLinkUrl, mechanicStage, mechanicWhatsappLink, publicReportUrl, scoreMeta, uploadCheckupPhoto, whatsappLink,
  type CheckupItem, type VehicleCheckup,
} from '@/lib/checkup';
import { AddItem, ItemRow } from '@/components/checkup/ChecklistItem';
import { useOperator } from '@/lib/operators';
import { fmtBRL, moneyInput, parseMoney } from '@/components/os/osHelpers';
import { loadDefaultMargin, salePriceOf, type WorkshopPart } from '@/lib/parts';
import { DEMO_ID, DEMO_MECHANICS, demoDraft, saveDemoResult } from '@/lib/checkupDemo';
import type { WorkshopMechanic } from '@/types/database';

const SCORE_TEXT = { signal: 'text-signal-600', pending: 'text-pending-600', alert: 'text-alert-600' };

type Patch = Partial<Pick<CheckupItem, 'status' | 'measurement' | 'note' | 'photo_path'
  | 'quote_service' | 'quote_labor' | 'quote_part' | 'quote_part_id' | 'quote_parts'>>;
type Row = VehicleCheckup & { os: { number: number | null } | null };

export default function WorkshopCheckupRun() {
  const { id } = useParams<{ id: string }>();
  const { currentWorkshop } = useAuth();
  const navigate = useNavigate();
  // Pré-visualização com dados fictícios, sem banco — só em dev (/demo/checkup/demo)
  const demo = import.meta.env.DEV && id === DEMO_ID;
  const listPath = demo ? '/demo/checkup' : '/oficina/checkup';

  const [checkup, setCheckup] = useState<Row | null>(null);
  const [items, setItems]     = useState<CheckupItem[]>([]);
  const [mechs, setMechs]     = useState<Pick<WorkshopMechanic, 'id' | 'name'>[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen]       = useState<string | null>(null);
  const [notes, setNotes]     = useState('');
  const [finishing, setFinishing] = useState(false);

  useEffect(() => { if ((currentWorkshop || demo) && id) load(); }, [currentWorkshop?.id, id]);

  // Enviado ao celular do mecânico: acompanha o preenchimento sem recarregar a página
  // Caixa/atendente no modo balcão: abre, escolhe o mecânico e envia o link — não preenche a inspeção
  const { balcao, session } = useOperator();
  const dispatchOnly = !demo && balcao && (session?.role === 'caixa' || session?.role === 'atendente');
  const linkSent = !demo && checkup?.status === 'draft' && !!checkup.mechanic_link_sent_at;
  useEffect(() => {
    if (!linkSent || !checkup) return;
    const cid = checkup.id;
    const t = setInterval(async () => {
      if (document.hidden) return;
      const [r1, r2] = await Promise.all([
        supabase.from('vehicle_checkups')
          .select('status, mechanic_opened_at, mechanic_started_at, mechanic_finished_at').eq('id', cid).maybeSingle(),
        supabase.from('checkup_items').select('*').eq('checkup_id', cid).order('position'),
      ]);
      const fresh = r1.data as Pick<VehicleCheckup, 'status' | 'mechanic_opened_at' | 'mechanic_started_at' | 'mechanic_finished_at'> | null;
      if (!fresh) return;
      if (fresh.status === 'completed') { toast.success('O mecânico finalizou o check-up ✓'); load(); return; }
      setCheckup(c => c && c.id === cid ? { ...c, ...fresh } : c);
      if (r2.data) setItems(r2.data as CheckupItem[]);
    }, 15000);
    return () => clearInterval(t);
  }, [linkSent, checkup?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    setLoading(true);
    let c: Row | null, list: CheckupItem[];
    if (demo) {
      const d = demoDraft();
      c = { ...d.checkup, os: null }; list = d.items; setMechs(DEMO_MECHANICS);
    } else {
      const [r1, r2] = await Promise.all([
        // 2 FKs para OS (origem e sale_os_id): o embed precisa dizer qual
        supabase.from('vehicle_checkups').select('*, os:service_orders!vehicle_checkups_service_order_id_fkey(number)').eq('id', id!).maybeSingle(),
        supabase.from('checkup_items').select('*').eq('checkup_id', id!).order('position'),
      ]);
      c = r1.data as Row | null; list = (r2.data as CheckupItem[]) ?? [];
      if (c) {
        const { data: m } = await supabase.from('workshop_mechanics').select('id, name')
          .eq('workshop_id', c.workshop_id).order('name');
        setMechs(m ?? []);
      }
    }
    setCheckup(c);
    setNotes(c?.notes ?? '');
    setItems(list);
    const firstPending = CHECKUP_TEMPLATE.find(s => list.some(i => i.system === s.system && !i.status));
    setOpen(firstPending?.system ?? null);
    setLoading(false);
  }

  async function patchCheckup(patch: Partial<VehicleCheckup>) {
    if (!checkup) return false;
    const next = { ...checkup, ...patch };
    setCheckup(next);
    if (demo) return true;
    const { error } = await supabase.from('vehicle_checkups')
      .update({ ...patch, updated_at: new Date().toISOString() }).eq('id', checkup.id);
    if (error) { setCheckup(checkup); toast.error('Não salvou — verifique a conexão'); return false; }
    return true;
  }

  async function patchItem(item: CheckupItem, patch: Patch) {
    const prev = items;
    setItems(list => list.map(i => i.id === item.id ? { ...i, ...patch } : i));
    if (demo) return;
    const { error } = await supabase.from('checkup_items')
      .update({ ...patch, updated_at: new Date().toISOString() }).eq('id', item.id);
    if (error) { setItems(prev); toast.error('Não salvou — verifique a conexão'); }
  }

  /** Item fora do checklist padrão, só neste check-up (item_key começa com "extra_") */
  async function addItem(system: string, label: string) {
    if (!checkup) return false;
    const row = {
      checkup_id: checkup.id,
      system,
      item_key:   `extra_${Date.now().toString(36)}`,
      label,
      position:   items.reduce((m, i) => Math.max(m, i.position), 0) + 1,
    };
    if (demo) {
      setItems(list => [...list, { ...row, id: row.item_key, status: null, measurement: null, note: null, photo_path: null }]);
      return true;
    }
    const { data, error } = await supabase.from('checkup_items').insert(row).select('*').single();
    if (error) { toast.error('Não foi possível incluir o item'); return false; }
    setItems(list => [...list, data as CheckupItem]);
    return true;
  }

  async function removeItem(item: CheckupItem) {
    if (!confirm(`Remover “${item.label}” deste check-up?`)) return;
    const prev = items;
    setItems(list => list.filter(i => i.id !== item.id));
    if (demo) return;
    const { error } = await supabase.from('checkup_items').delete().eq('id', item.id);
    if (error) { setItems(prev); toast.error('Não foi possível remover'); }
  }

  async function markSystemOk(system: string) {
    const ids = items.filter(i => i.system === system && !i.status).map(i => i.id);
    if (!ids.length) return;
    const prev = items;
    setItems(list => list.map(i => ids.includes(i.id) ? { ...i, status: 'ok' } : i));
    if (!demo) {
      const { error } = await supabase.from('checkup_items')
        .update({ status: 'ok', updated_at: new Date().toISOString() }).in('id', ids);
      if (error) { setItems(prev); toast.error('Não salvou — verifique a conexão'); return; }
    }
    const idx  = CHECKUP_TEMPLATE.findIndex(s => s.system === system);
    const next = CHECKUP_TEMPLATE.slice(idx + 1).find(s => items.some(i => i.system === s.system && !i.status));
    setOpen(next?.system ?? null);
  }

  async function finish() {
    if (!checkup) return;
    const answered = items.filter(i => i.status);
    if (!answered.length) { toast.error('Avalie ao menos um item'); return; }
    const missing = items.length - answered.length;
    if (missing > 0 && !confirm(`${missing} ${missing === 1 ? 'item não foi avaliado e não vai' : 'itens não foram avaliados e não vão'} aparecer no relatório. Finalizar mesmo assim?`)) return;
    setFinishing(true);
    const now = new Date().toISOString();
    const patch = { status: 'completed' as const, score: computeScore(items), notes: notes.trim() || null, completed_at: now };
    const ok = await patchCheckup(patch);
    setFinishing(false);
    if (!ok) return;
    if (demo) saveDemoResult({ ...checkup, ...patch }, items);
    toast.success('Check-up finalizado ✓');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function sendToMechanic() {
    if (!checkup) return;
    if (!checkup.workshop_mechanic_id) { toast.error('Escolha o mecânico em “Inspecionado por” primeiro'); return; }
    // Abre a aba já no clique: depois do await o navegador do celular bloquearia o pop-up
    const win = window.open('', '_blank');
    const { data, error } = await supabase.rpc('checkup_send_to_mechanic', { p_checkup: checkup.id });
    if (error || !data) { win?.close(); toast.error(error?.message ?? 'Não foi possível gerar o link'); return; }
    const link = data as { token: string; mechanic_name: string | null; mechanic_phone: string | null; has_pin: boolean };
    const url = mechanicWhatsappLink(checkup, link);
    if (win) win.location.href = url; else window.location.href = url;
    setCheckup(c => c && ({ ...c, mechanic_token: link.token, mechanic_link_sent_at: new Date().toISOString() }));
    if (!link.has_pin) toast.warning(`${link.mechanic_name ?? 'O mecânico'} ainda não tem PIN: o link abre sem senha. Cadastre em Acessos e funções.`, 8000);
    else if (!link.mechanic_phone) toast.info('Mecânico sem celular na Equipe: escolha o contato no WhatsApp.', 6000);
  }

  async function copyMechanicLink() {
    if (!checkup?.mechanic_token) return;
    try { await navigator.clipboard.writeText(mechanicLinkUrl(checkup.mechanic_token)); toast.success('Link copiado'); }
    catch { toast.error('Não foi possível copiar'); }
  }

  async function remove() {
    if (!checkup || !confirm('Excluir este check-up? Não dá pra desfazer.')) return;
    if (demo) { toast.info('Demonstração — nada foi excluído'); return; }
    const { error } = await supabase.from('vehicle_checkups').delete().eq('id', checkup.id);
    if (error) { toast.error('Erro ao excluir'); return; }
    navigate(listPath);
  }

  const bySystem = useMemo(() => {
    const map: Record<string, CheckupItem[]> = {};
    items.forEach(i => { (map[i.system] ??= []).push(i); });
    return map;
  }, [items]);

  if (loading) {
    return <WorkshopLayout><div className="card max-w-md mx-auto text-center text-steel-500 text-sm py-10">Carregando…</div></WorkshopLayout>;
  }
  if (!checkup) {
    return (
      <WorkshopLayout>
        <div className="card max-w-md text-center py-10 mx-auto space-y-3">
          <div className="text-4xl">🔍</div>
          <h1 className="text-xl font-bold">Check-up não encontrado</h1>
          <Link to={listPath} className="btn-primary inline-block">Ver check-ups</Link>
        </div>
      </WorkshopLayout>
    );
  }

  const car       = [checkup.make, checkup.model, checkup.year].filter(Boolean).join(' ') || 'Veículo';
  const done      = checkup.status === 'completed';
  const answered  = items.filter(i => i.status).length;
  const progress  = items.length ? Math.round((answered / items.length) * 100) : 0;
  const score     = done ? (checkup.score ?? 0) : computeScore(items);
  const meta      = scoreMeta(score);
  const empty     = !done && answered === 0;
  const warnCnt   = items.filter(i => i.status === 'warn').length;
  const urgentCnt = items.filter(i => i.status === 'urgent').length;

  return (
    <WorkshopLayout>
      <div className="max-w-3xl mx-auto space-y-4">
        <Link to={listPath} className="text-sm text-steel-500 hover:text-steel-800">← Check-ups</Link>

        {/* ── Cabeçalho ── */}
        <div className="card space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div className="min-w-0 space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                {checkup.plate && <LicensePlate plate={checkup.plate} size="sm" />}
                <h1 className="text-xl font-bold tracking-tight">{car}</h1>
              </div>
              <div className="text-sm text-steel-500">
                {[checkup.customer_name, checkup.km_reading != null && `${checkup.km_reading.toLocaleString('pt-BR')} km`].filter(Boolean).join(' · ') || 'Cliente avulso'}
              </div>
              {checkup.service_order_id && (
                <Link to={`/oficina/os/${checkup.service_order_id}`} className="text-xs font-semibold text-brand-600 hover:underline">
                  📋 OS nº {checkup.os?.number ?? '—'}
                </Link>
              )}
            </div>
            <div className="flex items-center gap-4 shrink-0">
              <div className="text-center">
                <div className={`text-4xl font-bold font-display ${empty ? 'text-steel-300' : SCORE_TEXT[meta.color]}`}>{empty ? '—' : score}</div>
                <div className="text-[10px] text-steel-400 uppercase tracking-wider">nota de saúde</div>
              </div>
              <div className="text-sm space-y-0.5">
                <div className={`font-semibold ${empty ? 'text-steel-400' : SCORE_TEXT[meta.color]}`}>{empty ? 'Aguardando inspeção' : meta.label}</div>
                <div className="text-steel-500">🟡 {warnCnt} atenção</div>
                <div className="text-steel-500">🔴 {urgentCnt} urgente</div>
              </div>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-3 pt-3 border-t border-steel-100">
            <label className="block">
              <span className="label">Inspecionado por</span>
              <select className="input" value={checkup.workshop_mechanic_id ?? ''} disabled={done}
                onChange={e => patchCheckup({ workshop_mechanic_id: e.target.value || null })}>
                <option value="">— Escolher mecânico —</option>
                {mechs.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </label>
            {!done && (
              <div>
                <span className="label">Progresso</span>
                <div className="h-2 rounded-full bg-steel-100 overflow-hidden mt-3">
                  <div className="h-full bg-brand-500 transition-all" style={{ width: `${progress}%` }} />
                </div>
                <div className="text-xs text-steel-500 mt-1">{answered}/{items.length} itens avaliados</div>
              </div>
            )}
          </div>

          {!done && !demo && (
            <MechanicLinkBar checkup={checkup} onSend={sendToMechanic} onCopy={copyMechanicLink} />
          )}
        </div>

        {done ? (
          <CompletedView checkup={checkup} items={items} workshopName={currentWorkshop?.business_name} demo={demo}
            onPatchItem={patchItem} onSent={() => patchCheckup({ quote_sent_at: new Date().toISOString() })}
            onReopen={dispatchOnly ? undefined : () => patchCheckup({ status: 'draft' })} onDelete={remove} />
        ) : dispatchOnly ? (
          <DispatchView items={items} hasMechanic={!!checkup.workshop_mechanic_id} sent={!!checkup.mechanic_link_sent_at} onDelete={remove} />
        ) : (
          <>
            {CHECKUP_TEMPLATE.map(({ system }) => {
              const list = bySystem[system] ?? [];
              if (!list.length) return null;
              const doneCnt = list.filter(i => i.status).length;
              const isOpen  = open === system;
              const flags   = list.filter(i => i.status === 'warn' || i.status === 'urgent').length;
              return (
                <div key={system} className="card !p-0 overflow-hidden">
                  <button onClick={() => setOpen(isOpen ? null : system)}
                    className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-steel-50">
                    <span className="text-xl">{SYSTEM_ICON[system]}</span>
                    <span className="flex-1 font-semibold text-steel-800">{system}</span>
                    {flags > 0 && <span className="text-xs text-pending-600 font-semibold">{flags} ⚠</span>}
                    <span className={`text-xs font-semibold ${doneCnt === list.length ? 'text-signal-600' : 'text-steel-400'}`}>
                      {doneCnt === list.length ? '✓' : `${doneCnt}/${list.length}`}
                    </span>
                    <span className={`text-steel-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}>▾</span>
                  </button>
                  {isOpen && (
                    <div className="border-t border-steel-100 divide-y divide-steel-100">
                      {doneCnt < list.length && (
                        <div className="px-5 py-2.5 bg-steel-50/60">
                          <button onClick={() => markSystemOk(system)} className="text-xs font-semibold text-signal-600 hover:underline">
                            ✓ Marcar pendentes como OK
                          </button>
                        </div>
                      )}
                      {list.map(item => (
                        <ItemRow key={item.id} item={item} onPatch={p => patchItem(item, p)}
                          uploadPhoto={(file, key) => demo ? Promise.resolve(URL.createObjectURL(file))
                            : uploadCheckupPhoto(file, checkup.workshop_id, checkup.id, key)}
                          onRemove={item.item_key.startsWith('extra_') ? () => removeItem(item) : undefined} />
                      ))}
                      <AddItem system={system} onAdd={label => addItem(system, label)} />
                    </div>
                  )}
                </div>
              );
            })}

            <div className="card space-y-3">
              <label className="block">
                <span className="label">Observações gerais (aparecem no relatório)</span>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} className="input"
                  placeholder="Ex.: recomendamos revisão de freios nos próximos 30 dias." />
              </label>
              <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-between">
                <button onClick={remove} className="btn-ghost text-sm text-steel-500 hover:text-alert-600">Excluir check-up</button>
                <button onClick={finish} disabled={finishing} className="btn-primary">
                  {finishing ? 'Finalizando…' : 'Finalizar e gerar relatório'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </WorkshopLayout>
  );
}


/* ─── Caixa/atendente: só acompanha (quem preenche é o mecânico) ─── */
function DispatchView({ items, hasMechanic, sent, onDelete }: {
  items: CheckupItem[]; hasMechanic: boolean; sent: boolean; onDelete: () => void;
}) {
  const flagged = items.filter(i => i.status === 'warn' || i.status === 'urgent');
  return (
    <>
      <div className="card space-y-2">
        <div className="font-bold text-steel-800">📲 Quem faz a inspeção é o mecânico, pelo celular dele</div>
        <p className="text-sm text-steel-600">
          {!hasMechanic ? '1. Escolha o mecânico em “Inspecionado por”.  2. Toque em “Enviar para o mecânico”.'
            : !sent ? 'Toque em “Enviar para o mecânico” acima para mandar o link pelo WhatsApp.'
            : 'Link enviado. Esta tela acompanha o preenchimento sozinha e avisa quando ele finalizar.'}
        </p>
      </div>
      {flagged.length > 0 && (
        <div className="card space-y-2">
          <div className="text-[10px] font-bold uppercase tracking-widest text-steel-500">Encontrado até agora</div>
          {flagged.map(i => (
            <div key={i.id} className="flex items-start gap-2 text-sm">
              <span>{STATUS_META[i.status!].dot}</span>
              <div className="min-w-0">
                <div className="text-steel-800">{i.label}{i.measurement && <span className="text-steel-500"> · {i.measurement}</span>}</div>
                {i.note && <div className="text-xs text-steel-500">{i.note}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="flex justify-end">
        <button onClick={onDelete} className="btn-ghost text-sm text-steel-500 hover:text-alert-600">Excluir check-up</button>
      </div>
    </>
  );
}

/* ─── Enviar para o celular do mecânico ───────────────────── */
function MechanicLinkBar({ checkup, onSend, onCopy }: {
  checkup: VehicleCheckup; onSend: () => void; onCopy: () => void;
}) {
  const stage = mechanicStage(checkup);
  const steps = ['sent', 'opened', 'started', 'finished'] as const;
  const at = stage ? steps.indexOf(stage) : -1;
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-3 border-t border-steel-100">
      <div className="flex-1 min-w-0">
        {stage ? (
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs">
            {steps.map((s, i) => (
              <span key={s} className="flex items-center gap-1.5">
                {i > 0 && <span className="text-steel-300">→</span>}
                <span className={i <= at ? (i === at ? 'font-bold text-brand-700' : 'font-semibold text-steel-700') : 'text-steel-400'}>
                  {MECHANIC_STAGE_META[s].icon} {MECHANIC_STAGE_META[s].short}
                </span>
              </span>
            ))}
          </div>
        ) : (
          <div className="text-sm text-steel-500">
            O mecânico pode fazer este check-up pelo celular dele. Envie o link pelo WhatsApp.
          </div>
        )}
      </div>
      <div className="flex gap-2 shrink-0">
        {checkup.mechanic_token && stage && (
          <button onClick={onCopy} className="btn-ghost text-sm !py-2 border border-steel-200">🔗 Copiar link</button>
        )}
        <button onClick={onSend} className="btn-primary text-sm !py-2">
          📲 {stage ? 'Reenviar' : 'Enviar para o mecânico'}
        </button>
      </div>
    </div>
  );
}

/* ─── Finalizado: orçamento + envio + resposta do cliente ─── */
function CompletedView({ checkup, items, workshopName, demo, onPatchItem, onSent, onReopen, onDelete }: {
  checkup: VehicleCheckup & { os?: { number: number | null } | null }; items: CheckupItem[]; workshopName?: string; demo: boolean;
  onPatchItem: (item: CheckupItem, p: Patch) => void; onSent: () => void;
  /** undefined = quem está operando não pode reabrir a inspeção (caixa/atendente) */
  onReopen?: () => void; onDelete: () => void;
}) {
  const url = publicReportUrl(checkup.public_token);
  const flagged = items.filter(i => i.status === 'urgent' || i.status === 'warn')
    .sort((a, b) => (a.status === 'urgent' ? 0 : 1) - (b.status === 'urgent' ? 0 : 1));
  const total = flagged.reduce((a, i) => a + itemQuote(i), 0);
  const answered = !!checkup.customer_responded_at;

  // Sugestões: Tabela de serviços e cadastro de peças (preço de venda)
  const [services, setServices] = useState<{ name: string; price: number }[]>([]);
  const [parts, setParts] = useState<{ id: string; name: string; price: number }[]>([]);
  useEffect(() => {
    if (demo) return;
    (async () => {
      const [s, p, m] = await Promise.all([
        supabase.from('workshop_services').select('name, price').eq('workshop_id', checkup.workshop_id).eq('active', true).order('name'),
        supabase.from('workshop_parts').select('id, name, cost, margin_percent, sale_price').eq('workshop_id', checkup.workshop_id).eq('active', true).order('name'),
        loadDefaultMargin(checkup.workshop_id),
      ]);
      setServices(((s.data ?? []) as { name: string; price: number }[]).map(x => ({ name: x.name, price: Number(x.price) })));
      setParts(((p.data ?? []) as Pick<WorkshopPart, 'id' | 'name' | 'cost' | 'margin_percent' | 'sale_price'>[])
        .map(x => ({ id: x.id, name: x.name, price: salePriceOf(x, m) })));
    })();
  }, [checkup.workshop_id, demo]);

  async function copy() {
    try { await navigator.clipboard.writeText(url); toast.success('Link copiado'); }
    catch { toast.error('Não foi possível copiar'); }
  }

  const stepCls = (on: boolean) => `flex-1 text-center text-[11px] font-semibold rounded-lg px-2 py-1.5 ${on ? 'bg-signal-100 text-signal-800' : 'bg-steel-100 text-steel-400'}`;
  const fmtWhen = (iso?: string | null) => iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';

  return (
    <>
      {/* Funil: enviado → cliente viu → respondeu → virou OS */}
      <div className="card space-y-2">
        <div className="flex gap-1.5">
          <span className={stepCls(!!checkup.quote_sent_at)}>📤 Enviado</span>
          <span className={stepCls(!!checkup.customer_viewed_at)}>👀 Cliente viu</span>
          <span className={stepCls(answered)}>💬 Respondeu</span>
          <span className={stepCls(!!checkup.sale_os_id)}>🧾 Virou OS</span>
        </div>
        <div className="text-xs text-steel-500">
          {checkup.sale_os_id ? (
            <>✅ Cliente aprovou{checkup.customer_scheduled_at && <> e agendou para <strong className="text-steel-800">{fmtWhen(checkup.customer_scheduled_at)}</strong></>}
              {' · '}<Link to={`/oficina/os/${checkup.sale_os_id}`} className="font-semibold text-brand-600 hover:underline">abrir a OS</Link></>
          ) : answered ? 'Cliente respondeu sem aprovar nenhum item agora. O que ele pediu para lembrar foi para a ficha dele.'
            : checkup.customer_viewed_at ? `Cliente abriu o link em ${fmtWhen(checkup.customer_viewed_at)} e ainda não respondeu — vale uma ligação.`
            : checkup.quote_sent_at ? `Enviado em ${fmtWhen(checkup.quote_sent_at)} · aguardando o cliente abrir.`
            : total > 0 ? 'Orçamento pronto — envie para o cliente aprovar pelo link.' : 'Coloque o valor de cada item e envie para o cliente aprovar.'}
        </div>
      </div>

      {/* Orçamento */}
      {flagged.length > 0 && (
        <div className="card !p-0 overflow-hidden">
          <div className="px-5 pt-5 pb-3">
            <div className="font-bold text-steel-800">💰 Orçamento dos itens</div>
            <p className="text-xs text-steel-500">
              {answered ? 'Resposta do cliente em cada item.' : 'Serviço e peça de cada item. O cliente vê os valores no link e aprova o que quiser fazer.'}
            </p>
          </div>
          <datalist id="ck-services">{services.map(x => <option key={x.name} value={x.name}>{x.price > 0 ? fmtBRL(x.price) : 'preço na hora'}</option>)}</datalist>
          <datalist id="ck-parts">{parts.map(x => <option key={x.id} value={x.name}>{fmtBRL(x.price)}</option>)}</datalist>
          <div className="divide-y divide-steel-100">
            {flagged.map(i => (
              <QuoteRow key={i.id} item={i} readOnly={answered} services={services} parts={parts} onPatch={p => onPatchItem(i, p)} />
            ))}
          </div>
          <div className="px-5 py-3 bg-steel-50 border-t border-steel-100 flex justify-between items-center">
            <span className="text-sm font-semibold text-steel-600">Total orçado</span>
            <span className="text-xl font-bold font-display">{fmtBRL(total)}</span>
          </div>
        </div>
      )}

      <div className="card space-y-3">
        <div className="font-bold text-steel-800">📤 Enviar ao cliente</div>
        <div className="flex flex-col sm:flex-row gap-2">
          <a href={whatsappLink(checkup, workshopName, total)} target="_blank" rel="noreferrer" onClick={onSent}
            className="btn-primary !bg-[#25D366] text-center flex-1">
            {total > 0 ? 'Enviar orçamento pelo WhatsApp' : 'Enviar relatório pelo WhatsApp'}
          </a>
          <button onClick={() => { copy(); onSent(); }} className="btn-ghost border border-steel-200">Copiar link</button>
          <a href={url} target="_blank" rel="noreferrer" className="btn-ghost border border-steel-200 text-center">Ver como o cliente</a>
        </div>
        {total > 0 && !answered && (
          <p className="text-[11px] text-steel-400">No link o cliente aprova item por item e escolhe o horário para trazer o carro. O que ele aprovar vira OS agendada.</p>
        )}
      </div>

      <div className="flex gap-2">
        {!answered && onReopen && <button onClick={onReopen} className="btn-ghost text-sm border border-steel-200">✏️ Editar inspeção</button>}
        <button onClick={onDelete} className="btn-ghost text-sm text-steel-500 hover:text-alert-600">Excluir</button>
      </div>
    </>
  );
}

function QuoteRow({ item, readOnly, services, parts, onPatch }: {
  item: CheckupItem; readOnly: boolean;
  services: { name: string; price: number }[]; parts: { id: string; name: string; price: number }[];
  onPatch: (p: Patch) => void;
}) {
  const [svc, setSvc]     = useState(item.quote_service ?? '');
  const [labor, setLabor] = useState(item.quote_labor != null ? moneyInput(Number(item.quote_labor)) : '');
  const [part, setPart]   = useState(item.quote_part ?? '');
  const [pval, setPval]   = useState(item.quote_parts != null ? moneyInput(Number(item.quote_parts)) : '');
  const money = (v: string) => { const n = parseMoney(v); return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null; };
  const d = item.customer_decision ? DECISION_META[item.customer_decision] : null;

  function pickService(v: string) {
    setSvc(v);
    const s = services.find(x => x.name.toLowerCase() === v.trim().toLowerCase());
    if (s && s.price > 0 && !labor) { setLabor(moneyInput(s.price)); onPatch({ quote_service: s.name, quote_labor: s.price }); }
  }
  function pickPart(v: string) {
    setPart(v);
    const p = parts.find(x => x.name.toLowerCase() === v.trim().toLowerCase());
    if (p) { setPval(moneyInput(p.price)); onPatch({ quote_part: p.name, quote_part_id: p.id, quote_parts: p.price }); }
  }

  return (
    <div className="px-5 py-3 space-y-2">
      <div className="flex items-start gap-2">
        <span>{STATUS_META[item.status!].dot}</span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-steel-800">{item.label}{item.measurement && <span className="font-normal text-steel-500"> · {item.measurement}</span>}</div>
          {item.note && <div className="text-xs text-steel-500">{item.note}</div>}
        </div>
        {readOnly
          ? <span className={`text-xs font-bold shrink-0 ${d?.tone ?? 'text-steel-400'}`}>{d ? `${d.icon} ${d.short}` : 'sem resposta'}</span>
          : <span className="text-sm font-bold shrink-0">{itemQuote(item) > 0 ? fmtBRL(itemQuote(item)) : ''}</span>}
      </div>
      {readOnly ? (
        (item.quote_service || item.quote_part) && (
          <div className="text-xs text-steel-500 pl-6 space-y-0.5">
            {Number(item.quote_labor ?? 0) > 0 && <div>🔧 Mão de obra{item.quote_service ? ` — ${item.quote_service}` : ''}: {fmtBRL(Number(item.quote_labor))}</div>}
            {Number(item.quote_parts ?? 0) > 0 && <div>🔩 Peça{item.quote_part ? ` — ${item.quote_part}` : ''}: {fmtBRL(Number(item.quote_parts))}</div>}
          </div>
        )
      ) : (
        <div className="pl-6 space-y-2">
          {/* Mão de obra */}
          <div className="flex items-center gap-2">
            <span className="w-28 shrink-0 text-xs font-semibold text-steel-600">🔧 Mão de obra</span>
            <input className="input !py-1.5 text-sm flex-1 min-w-0" list="ck-services" placeholder="Qual serviço? (ex.: Troca das pastilhas)"
              value={svc} onChange={e => pickService(e.target.value)}
              onBlur={() => svc.trim() !== (item.quote_service ?? '') && onPatch({ quote_service: svc.trim() || null })} />
            <div className="relative w-32 shrink-0">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-steel-400 text-xs">R$</span>
              <input className="input !py-1.5 !pl-8 text-sm text-right" inputMode="decimal" placeholder="0,00" value={labor}
                onChange={e => setLabor(e.target.value)}
                onBlur={() => { const n = money(labor); setLabor(n != null ? moneyInput(n) : ''); if (n !== (item.quote_labor ?? null)) onPatch({ quote_labor: n }); }} />
            </div>
          </div>
          {/* Peça */}
          <div className="flex items-center gap-2">
            <span className="w-28 shrink-0 text-xs font-semibold text-steel-600">🔩 Peça</span>
            <input className="input !py-1.5 text-sm flex-1 min-w-0" list="ck-parts" placeholder="Qual peça? (vazio se não precisar)"
              value={part} onChange={e => pickPart(e.target.value)}
              onBlur={() => { if (part.trim() !== (item.quote_part ?? '')) onPatch({ quote_part: part.trim() || null, quote_part_id: parts.find(x => x.name === part.trim())?.id ?? null }); }} />
            <div className="relative w-32 shrink-0">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-steel-400 text-xs">R$</span>
              <input className="input !py-1.5 !pl-8 text-sm text-right" inputMode="decimal" placeholder="0,00" value={pval}
                onChange={e => setPval(e.target.value)}
                onBlur={() => { const n = money(pval); setPval(n != null ? moneyInput(n) : ''); if (n !== (item.quote_parts ?? null)) onPatch({ quote_parts: n }); }} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
