import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import WorkshopLayout from '@/components/layout/WorkshopLayout';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/components/ui/Toast';
import LicensePlate from '@/components/os/LicensePlate';
import {
  DECISION_META, MECHANIC_STAGE_META, SYSTEM_ICON, STATUS_META,
  computeScore, itemQuote, mechanicLinkUrl, mechanicStage, mechanicWhatsappLink, publicReportUrl, uploadCheckupPhoto, whatsappLink,
  CHECKUP_MODELS, CHECKUP_TEMPLATE, changeCheckupModel, modelItemKeys, modelLabel, modelOf,
  type CheckupItem, type CheckupModelKey, type VehicleCheckup,
} from '@/lib/checkup';
import { AddItem, ItemRow } from '@/components/checkup/ChecklistItem';
import { useCheckupAccess } from '@/lib/checkupAccess';
import { OVERALL_META, countsOf, itemsWithoutPrice, nextPendingSystem, overallState, overallText, sendMode, systemsOf } from '@/lib/checkupStatus';
import { fmtBRL, moneyInput, parseMoney } from '@/components/os/osHelpers';
import { loadDefaultMargin, salePriceOf, type WorkshopPart } from '@/lib/parts';
import { DEMO_ID, DEMO_MECHANICS, demoDraft, saveDemoResult } from '@/lib/checkupDemo';
import type { WorkshopMechanic } from '@/types/database';

const TONE_TEXT = { signal: 'text-signal-600', pending: 'text-pending-600', alert: 'text-alert-600' };

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
  // Mecânico (PIN): inspeciona, mas não vê preço, não envia ao cliente e não exclui
  const access = useCheckupAccess();
  const dispatchOnly = !demo && !access.canInspect;
  const isMechanic = !demo && access.isMechanic;

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
    setOpen(nextPendingSystem(list));
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
    setOpen(nextPendingSystem(items.map(i => ids.includes(i.id) ? { ...i, status: 'ok' as const } : i), system));
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
    if (isMechanic) {
      const carName = [checkup.make, checkup.model].filter(Boolean).join(' ') + (checkup.plate ? ` ${checkup.plate}` : '');
      navigate(listPath, { state: { finished: carName.trim() } });
      return;
    }
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

  /** Voltar para rascunho só antes de enviar: depois disso o link do cliente quebraria */
  async function reopen() {
    if (!checkup || checkup.quote_sent_at) { toast.error('Já foi enviado ao cliente — use “Refazer check-up”'); return; }
    await patchCheckup({ status: 'draft' });
  }

  /** Corrigir depois de enviado: novo check-up em rascunho, cópia preenchida. O link antigo segue valendo. */
  async function redo() {
    if (!checkup || demo) return;
    if (!confirm('Criar um novo check-up com tudo já preenchido para você corrigir?\n\nO link que o cliente recebeu continua funcionando. Depois de corrigir, envie o novo.')) return;
    const { data: c, error } = await supabase.from('vehicle_checkups').insert({
      workshop_id: checkup.workshop_id, workshop_mechanic_id: checkup.workshop_mechanic_id,
      service_order_id: checkup.service_order_id, customer_id: checkup.customer_id, vehicle_id: checkup.vehicle_id,
      plate: checkup.plate, make: checkup.make, model: checkup.model, year: checkup.year, km_reading: checkup.km_reading,
      customer_name: checkup.customer_name, customer_phone: checkup.customer_phone, notes: checkup.notes,
    }).select('id').single();
    if (error || !c) { toast.error('Não foi possível refazer — verifique a conexão'); return; }
    const { error: e2 } = await supabase.from('checkup_items').insert(items.map(i => ({
      checkup_id: c.id, system: i.system, item_key: i.item_key, label: i.label, position: i.position,
      status: i.status, measurement: i.measurement, note: i.note, photo_path: i.photo_path,
      quote_service: i.quote_service ?? null, quote_labor: i.quote_labor ?? null,
      quote_part: i.quote_part ?? null, quote_part_id: i.quote_part_id ?? null, quote_parts: i.quote_parts ?? null,
    })));
    // O antigo fica marcado como substituído (não é apagado: o link do cliente continua valendo)
    const { error: e3 } = e2 ? { error: e2 } : await supabase.from('vehicle_checkups')
      .update({ replaced_by: c.id, updated_at: new Date().toISOString() }).eq('id', checkup.id);
    if (e2 || e3) {
      await supabase.from('vehicle_checkups').delete().eq('id', c.id);
      toast.error('Não foi possível refazer — nada foi alterado');
      return;
    }
    toast.success('Novo check-up criado — corrija e envie de novo');
    navigate(`${listPath}/${c.id}`);
  }

  async function remove() {
    if (!checkup) return;
    // Enviado ao cliente: preserva histórico e link — não exclui
    if (checkup.quote_sent_at) { toast.error('Check-up já enviado ao cliente não pode ser excluído'); return; }
    if (!confirm('Excluir este check-up? Não dá pra desfazer.')) return;
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
  const canFinish = !done && !dispatchOnly;

  // Responsável e link do mecânico: no cabeçalho (celular) ou no resumo ao lado (desktop)
  const responsible = (
    <label className="block">
      <span className="label">{isMechanic ? 'Responsável' : 'Inspecionado por'}</span>
      {isMechanic ? (
        checkup.workshop_mechanic_id ? (
          <div className="input bg-steel-50 text-steel-700">{mechs.find(m => m.id === checkup.workshop_mechanic_id)?.name ?? '—'}</div>
        ) : access.mechanicId && !done ? (
          <button onClick={() => patchCheckup({ workshop_mechanic_id: access.mechanicId })} className="btn-primary w-full">Pegar este</button>
        ) : <div className="input bg-steel-50 text-steel-400">Sem responsável</div>
      ) : (
        <select className="input" value={checkup.workshop_mechanic_id ?? ''} disabled={done}
          onChange={e => patchCheckup({ workshop_mechanic_id: e.target.value || null })}>
          <option value="">— Escolher mecânico —</option>
          {mechs.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      )}
    </label>
  );
  const linkBar = !done && !demo && !isMechanic
    ? (compact: boolean) => <MechanicLinkBar checkup={checkup} onSend={sendToMechanic} onCopy={copyMechanicLink} compact={compact} />
    : null;
  const finishButton = (full: boolean) => (
    <button onClick={finish} disabled={finishing} className={`btn-primary ${full ? 'w-full' : ''} ${isMechanic ? '!py-3.5' : ''}`}>
      {finishing ? 'Finalizando…' : isMechanic ? 'Terminar check-up' : 'Finalizar e montar orçamento →'}
    </button>
  );

  return (
    <WorkshopLayout>
      <div className="max-w-[1100px] mx-auto space-y-4">
        <Link to={listPath} className="text-sm text-steel-500 hover:text-steel-800">← Check-ups</Link>

        {/* ── Cabeçalho ── */}
        <div className="card space-y-4">
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
            <ModelLine checkup={checkup} items={items}
              canChange={!done && !demo && items.every(i => !i.status)}
              onChanged={load} />
          </div>
          {/* Celular: resumo compacto + responsável aqui em cima (no desktop ficam ao lado) */}
          <div className="lg:hidden space-y-3 pt-3 border-t border-steel-100">
            <SummaryLine items={items} done={done} />
            {responsible}
            {linkBar?.(false)}
          </div>
        </div>

        {checkup.replaced_by && (
          <div className="card !py-3 bg-steel-50 border-steel-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="text-sm text-steel-700">
              🔁 <strong>Este check-up foi refeito.</strong> Fica aqui só como histórico — o link que o cliente recebeu continua funcionando.
            </div>
            <Link to={`${listPath}/${checkup.replaced_by}`} className="btn-primary text-sm !py-2 shrink-0">Abrir o novo →</Link>
          </div>
        )}

        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-5 lg:items-start">
        <div className="space-y-4 min-w-0">
        {done && isMechanic ? (
          <MechanicDoneView items={items} listPath={listPath} />
        ) : done ? (
          <CompletedView checkup={checkup} items={items} workshopName={currentWorkshop?.business_name} demo={demo}
            onPatchItem={patchItem} onSent={() => patchCheckup({ quote_sent_at: new Date().toISOString() })}
            onReopen={dispatchOnly ? undefined : reopen} onRedo={dispatchOnly || demo ? undefined : redo} onDelete={remove} />
        ) : dispatchOnly ? (
          <DispatchView items={items} hasMechanic={!!checkup.workshop_mechanic_id} sent={!!checkup.mechanic_link_sent_at} onDelete={remove} />
        ) : (
          <>
            {systemsOf(items).map(system => {
              const list = bySystem[system] ?? [];
              if (!list.length) return null;
              const doneCnt = list.filter(i => i.status).length;
              const isOpen  = open === system;
              const flags   = list.filter(i => i.status === 'warn' || i.status === 'urgent').length;
              return (
                <div key={system} className="card !p-0 overflow-hidden">
                  <button onClick={() => setOpen(isOpen ? null : system)}
                    className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-steel-50">
                    <span className="text-xl">{SYSTEM_ICON[system] ?? '🔹'}</span>
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
                {access.canDelete || demo
                  ? <button onClick={remove} className="btn-ghost text-sm text-steel-500 hover:text-alert-600">Excluir check-up</button>
                  : <span />}
                {finishButton(false)}
              </div>
            </div>
          </>
        )}
        </div>

        {/* ── Resumo fixo ao lado (desktop) ── */}
        <aside className="hidden lg:block lg:sticky lg:top-4 space-y-3">
          <div className="card space-y-4">
            <SummaryPanel items={items} done={done} isMechanic={isMechanic} />
            <div className="pt-3 border-t border-steel-100 space-y-3">
              {responsible}
              {linkBar?.(true)}
            </div>
            {canFinish && <div className="pt-1">{finishButton(true)}</div>}
          </div>
        </aside>
        </div>
      </div>
    </WorkshopLayout>
  );
}


/* ─── Tipo do check-up (e trocar antes de começar) ─────────── */
function ModelLine({ checkup, items, canChange, onChanged }: {
  checkup: VehicleCheckup; items: CheckupItem[]; canChange: boolean; onChanged: () => void;
}) {
  const m = modelOf(checkup.template_key);
  const systems = systemsOf(items);
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState<CheckupModelKey>(m.key);
  const [picked, setPicked] = useState<string[]>(m.key === 'custom' ? systems : []);
  const [busy, setBusy] = useState(false);

  async function apply() {
    setBusy(true);
    try {
      await changeCheckupModel(checkup.id, key, picked);
      toast.success('Tipo do check-up trocado ✓');
      setOpen(false);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível trocar o tipo');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="badge bg-steel-100 text-steel-700">{m.icon} {modelLabel(checkup.template_key, systems)} · {items.length} itens</span>
        {canChange && !open && (
          <button onClick={() => setOpen(true)} className="font-semibold text-brand-600 hover:underline">Trocar tipo</button>
        )}
      </div>
      {open && (
        <div className="rounded-xl border border-steel-200 bg-steel-50 p-3 space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {CHECKUP_MODELS.map(x => (
              <button key={x.key} type="button" onClick={() => setKey(x.key)}
                className={`text-xs font-semibold px-3 py-1.5 rounded-full border ${key === x.key ? 'bg-steel-900 text-white border-steel-900' : 'bg-white text-steel-600 border-steel-200'}`}>
                {x.icon} {x.label}{x.key !== 'custom' ? ` (${modelItemKeys(x.key).length})` : ''}
              </button>
            ))}
          </div>
          {key === 'custom' && (
            <div className="flex flex-wrap gap-1.5">
              {CHECKUP_TEMPLATE.map(s => {
                const on = picked.includes(s.system);
                return (
                  <button key={s.system} type="button" onClick={() => setPicked(v => on ? v.filter(x => x !== s.system) : [...v, s.system])}
                    className={`text-xs px-2.5 py-1 rounded-lg border ${on ? 'bg-brand-500 text-white border-brand-500' : 'bg-white text-steel-600 border-steel-200'}`}>
                    {s.icon} {s.system}
                  </button>
                );
              })}
            </div>
          )}
          <div className="flex gap-2 justify-end">
            <button onClick={() => setOpen(false)} className="btn-ghost text-xs !py-1.5">Cancelar</button>
            <button onClick={apply} disabled={busy || (key === 'custom' && !picked.length)} className="btn-primary text-xs !py-1.5">
              {busy ? 'Trocando…' : 'Usar este tipo'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Resumo: progresso + Estado geral + contagens ─────────── */
function stateLine(items: CheckupItem[]) {
  const cnt = countsOf(items);
  const st = overallState(cnt);
  return { cnt, label: st ? OVERALL_META[st].label : 'Aguardando inspeção', tone: st ? TONE_TEXT[OVERALL_META[st].tone] : 'text-steel-400' };
}

/** Coluna ao lado (desktop): fica fixa enquanto rola o checklist */
function SummaryPanel({ items, done, isMechanic }: { items: CheckupItem[]; done: boolean; isMechanic: boolean }) {
  const { cnt, label, tone } = stateLine(items);
  return (
    <div className="space-y-4">
      {!done && (
        <div>
          <div className="flex justify-between items-baseline">
            <span className="label !mb-0">Progresso</span>
            <span className="text-xs font-semibold text-steel-600">{cnt.answered} de {cnt.total}</span>
          </div>
          <div className="h-2 rounded-full bg-steel-100 overflow-hidden mt-2">
            <div className="h-full bg-brand-500 transition-all" style={{ width: `${cnt.progress}%` }} />
          </div>
        </div>
      )}
      <div>
        <span className="label">Estado geral</span>
        <div className={`text-lg font-bold leading-tight ${tone}`}>{label}</div>
        <div className="text-xs text-steel-400 mt-0.5">{cnt.answered} de {cnt.total} itens avaliados</div>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <Count n={cnt.ok} label="OK" cls="bg-signal-50 text-signal-800" />
        <Count n={cnt.warn} label="Atenção" cls="bg-pending-50 text-pending-800" />
        <Count n={cnt.urgent} label="Urgente" cls="bg-alert-50 text-alert-800" />
      </div>
      {cnt.flagged > 0 && (
        <div className="text-sm text-steel-600 space-y-1">
          <div>
            {isMechanic ? '🔧 Para trocar ou consertar: ' : '💰 Vão para o orçamento: '}
            <strong className="text-steel-900">{cnt.flagged} {cnt.flagged === 1 ? 'item' : 'itens'}</strong>
          </div>
          {!isMechanic && !done && (
            <div className="text-xs text-steel-400">Os preços você coloca depois de finalizar a inspeção.</div>
          )}
        </div>
      )}
    </div>
  );
}

function Count({ n, label, cls }: { n: number; label: string; cls: string }) {
  return (
    <div className={`rounded-xl py-2 ${cls}`}>
      <div className="text-xl font-bold font-display leading-none">{n}</div>
      <div className="text-[10px] font-semibold mt-1">{label}</div>
    </div>
  );
}

/** Celular: uma linha compacta no cabeçalho */
function SummaryLine({ items, done }: { items: CheckupItem[]; done: boolean }) {
  const { cnt, label, tone } = stateLine(items);
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className={`text-sm font-bold ${tone}`}>{label}</span>
        <span className="text-xs text-steel-500">{cnt.answered} de {cnt.total} avaliados</span>
      </div>
      {!done && (
        <div className="h-2 rounded-full bg-steel-100 overflow-hidden">
          <div className="h-full bg-brand-500 transition-all" style={{ width: `${cnt.progress}%` }} />
        </div>
      )}
      <div className="text-xs text-steel-600">🟢 {cnt.ok} OK · 🟡 {cnt.warn} Atenção · 🔴 {cnt.urgent} Urgente</div>
    </div>
  );
}

/* ─── Mecânico: terminou — sem preço, sem envio ─────────── */
function MechanicDoneView({ items, listPath }: { items: CheckupItem[]; listPath: string }) {
  const cnt = countsOf(items);
  const state = overallState(cnt);
  const flagged = items.filter(i => i.status === 'warn' || i.status === 'urgent')
    .sort((a, b) => (a.status === 'urgent' ? 0 : 1) - (b.status === 'urgent' ? 0 : 1));
  return (
    <>
      <div className="card text-center space-y-2 py-8">
        <div className="text-5xl">✅</div>
        <div className="text-lg font-bold">Check-up terminado</div>
        <div className="text-sm text-steel-500">O gestor já recebeu.</div>
        {state && <div className={`text-sm font-semibold ${TONE_TEXT[OVERALL_META[state].tone]}`}>{OVERALL_META[state].label}</div>}
        <div className="text-sm text-steel-600">🟢 {cnt.ok} OK · 🟡 {cnt.warn} Atenção · 🔴 {cnt.urgent} Urgente</div>
        <div className="text-xs text-steel-400">{cnt.answered} de {cnt.total} itens avaliados</div>
      </div>
      {flagged.length > 0 && (
        <div className="card space-y-2">
          <div className="text-[10px] font-bold uppercase tracking-widest text-steel-500">O que você apontou</div>
          {flagged.map(i => (
            <div key={i.id} className="flex items-start gap-2 text-sm">
              <span>{STATUS_META[i.status!].dot}</span>
              <div className="min-w-0">
                <div className="text-steel-800">{i.label}{i.measurement && <span className="text-steel-500"> · {i.measurement}</span>}</div>
                {(i.quote_part || i.quote_service) && (
                  <div className="text-xs text-steel-500">{[i.quote_part && `🔩 ${i.quote_part}`, i.quote_service && `🔧 ${i.quote_service}`].filter(Boolean).join(' · ')}</div>
                )}
                {i.note && <div className="text-xs text-steel-500">{i.note}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
      <Link to={listPath} className="btn-primary w-full text-center !py-3.5 block">Voltar para minha fila</Link>
    </>
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
            : !sent ? 'Toque em “Enviar para o mecânico” para mandar o link pelo WhatsApp.'
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
function MechanicLinkBar({ checkup, onSend, onCopy, compact }: {
  checkup: VehicleCheckup; onSend: () => void; onCopy: () => void;
  /** Coluna estreita (resumo ao lado): empilha */
  compact?: boolean;
}) {
  const stage = mechanicStage(checkup);
  const steps = ['sent', 'opened', 'started', 'finished'] as const;
  const at = stage ? steps.indexOf(stage) : -1;
  return (
    <div className={compact ? 'flex flex-col gap-2.5' : 'flex flex-col sm:flex-row sm:items-center gap-3 pt-3 border-t border-steel-100'}>
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
      <div className={compact ? 'flex flex-col gap-2' : 'flex gap-2 shrink-0'}>
        {checkup.mechanic_token && stage && (
          <button onClick={onCopy} className="btn-ghost text-sm !py-2 border border-steel-200">🔗 Copiar link</button>
        )}
        <button onClick={onSend} className={`text-sm !py-2 ${compact ? 'btn-ghost border border-steel-300 bg-white font-semibold' : 'btn-primary'}`}>
          📲 {stage ? 'Reenviar' : 'Enviar para o mecânico'}
        </button>
      </div>
    </div>
  );
}

/* ─── Finalizado: orçamento + envio + resposta do cliente ─── */
function CompletedView({ checkup, items, workshopName, demo, onPatchItem, onSent, onReopen, onRedo, onDelete }: {
  checkup: VehicleCheckup & { os?: { number: number | null } | null }; items: CheckupItem[]; workshopName?: string; demo: boolean;
  onPatchItem: (item: CheckupItem, p: Patch) => void; onSent: () => void;
  /** undefined = quem está operando não pode reabrir a inspeção (caixa/atendente) */
  onReopen?: () => void;
  /** Depois de enviado: cria uma cópia em rascunho (undefined = quem opera não pode) */
  onRedo?: () => void;
  onDelete: () => void;
}) {
  const url = publicReportUrl(checkup.public_token);
  const flagged = items.filter(i => i.status === 'urgent' || i.status === 'warn')
    .sort((a, b) => (a.status === 'urgent' ? 0 : 1) - (b.status === 'urgent' ? 0 : 1));
  const total = flagged.reduce((a, i) => a + itemQuote(i), 0);
  const answered = !!checkup.customer_responded_at;
  const sent = !!checkup.quote_sent_at;
  const replaced = !!checkup.replaced_by;
  // O cliente já viu os valores: nada de alteração silenciosa
  const pricesLocked = answered || replaced || !!checkup.customer_viewed_at;
  const mode = sendMode(items);
  const noPrice = itemsWithoutPrice(items);

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
            {pricesLocked && !answered && (
              <div className="mt-2 rounded-lg bg-steel-50 border border-steel-200 px-3 py-2 text-xs text-steel-600">
                🔒 O cliente já viu estes valores — os preços estão travados. Mudar valores depois disso vai ser por revisão e reenvio (em breve).
              </div>
            )}
          </div>
          <datalist id="ck-services">{services.map(x => <option key={x.name} value={x.name}>{x.price > 0 ? fmtBRL(x.price) : 'preço na hora'}</option>)}</datalist>
          <datalist id="ck-parts">{parts.map(x => <option key={x.id} value={x.name}>{fmtBRL(x.price)}</option>)}</datalist>
          <div className="divide-y divide-steel-100">
            {flagged.map(i => (
              <QuoteRow key={i.id} item={i} readOnly={pricesLocked} answered={answered} services={services} parts={parts} onPatch={p => onPatchItem(i, p)} />
            ))}
          </div>
          <div className="px-5 py-3 bg-steel-50 border-t border-steel-100 flex justify-between items-center">
            <span className="text-sm font-semibold text-steel-600">Total orçado</span>
            <span className="text-xl font-bold font-display">{fmtBRL(total)}</span>
          </div>
        </div>
      )}

      {!replaced && <div className="card space-y-3">
        <div className="font-bold text-steel-800">📤 Enviar ao cliente</div>
        {/* Item 🟡/🔴 sem valor: não sai orçamento pela metade */}
        {noPrice.length > 0 && !answered && (
          <div className="rounded-xl bg-pending-50 border border-pending-200 px-3 py-2.5 text-sm text-steel-700 space-y-1">
            <div className="font-semibold">⚠️ Existem itens sem preço. Complete os valores antes de enviar o orçamento.</div>
            <div className="text-xs text-steel-600">Sem preço: {noPrice.map(i => i.label).join(', ')}</div>
            {mode === 'blocked' && (
              <div className="text-xs text-steel-500">Para mandar só o diagnóstico, deixe todos os valores em branco e use “Enviar somente relatório”.</div>
            )}
          </div>
        )}
        <div className="flex flex-col sm:flex-row gap-2">
          {mode === 'blocked' ? (
            <button disabled className="btn-primary !bg-steel-300 !text-white text-center flex-1 cursor-not-allowed">Enviar orçamento pelo WhatsApp</button>
          ) : (
            <a href={whatsappLink(checkup, workshopName, mode === 'quote' ? total : 0, overallText(items))} target="_blank" rel="noreferrer" onClick={onSent}
              className={`text-center flex-1 ${mode === 'quote' || !noPrice.length ? 'btn-primary !bg-[#25D366]' : 'btn-ghost border border-steel-300 bg-white font-semibold'}`}>
              {mode === 'quote' ? 'Enviar orçamento pelo WhatsApp' : noPrice.length ? 'Enviar somente relatório' : 'Enviar relatório pelo WhatsApp'}
            </a>
          )}
          <button onClick={() => { copy(); onSent(); }} disabled={mode === 'blocked'} className="btn-ghost border border-steel-200 disabled:opacity-40">Copiar link</button>
          <a href={url} target="_blank" rel="noreferrer" className="btn-ghost border border-steel-200 text-center">Ver como o cliente</a>
        </div>
        {mode === 'quote' && !answered && (
          <p className="text-[11px] text-steel-400">No link o cliente aprova item por item e escolhe o horário para trazer o carro. O que ele aprovar vira OS agendada.</p>
        )}
        {mode === 'report' && noPrice.length > 0 && !answered && (
          <p className="text-[11px] text-steel-400">Somente relatório: o cliente recebe só o diagnóstico com fotos — sem valores e sem aprovação de serviço.</p>
        )}
      </div>}

      <div className="flex gap-2">
        {!sent && !answered && onReopen && <button onClick={onReopen} className="btn-ghost text-sm border border-steel-200">✏️ Editar inspeção</button>}
        {sent && !answered && !replaced && onRedo && <button onClick={onRedo} className="btn-ghost text-sm border border-steel-200">🔁 Refazer check-up</button>}
        {/* Enviado ao cliente: preserva histórico e link — não exclui */}
        {!sent && <button onClick={onDelete} className="btn-ghost text-sm text-steel-500 hover:text-alert-600">Excluir</button>}
      </div>
    </>
  );
}

function QuoteRow({ item, readOnly, answered, services, parts, onPatch }: {
  item: CheckupItem; readOnly: boolean; answered: boolean;
  services: { name: string; price: number }[]; parts: { id: string; name: string; price: number }[];
  onPatch: (p: Patch) => void;
}) {
  const [svc, setSvc]     = useState(item.quote_service ?? '');
  const [labor, setLabor] = useState(item.quote_labor != null ? moneyInput(Number(item.quote_labor)) : '');
  const [part, setPart]   = useState(item.quote_part ?? '');
  const [pval, setPval]   = useState(item.quote_parts != null ? moneyInput(Number(item.quote_parts)) : '');
  const money = (v: string) => { const n = parseMoney(v); return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null; };
  const d = item.customer_decision ? DECISION_META[item.customer_decision] : null;

  // O mecânico apontou a peça/serviço no check-up: puxa o preço do cadastro (se ainda não tem)
  useEffect(() => {
    if (readOnly) return;
    const patch: Patch = {};
    const p = item.quote_part && item.quote_parts == null
      ? parts.find(x => x.name.toLowerCase() === item.quote_part!.trim().toLowerCase()) : undefined;
    if (p) { patch.quote_parts = p.price; patch.quote_part_id = p.id; setPval(moneyInput(p.price)); }
    const sv = item.quote_service && item.quote_labor == null
      ? services.find(x => x.name.toLowerCase() === item.quote_service!.trim().toLowerCase()) : undefined;
    if (sv && sv.price > 0) { patch.quote_labor = sv.price; setLabor(moneyInput(sv.price)); }
    if (Object.keys(patch).length) onPatch(patch);
  }, [parts, services]); // eslint-disable-line react-hooks/exhaustive-deps

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
          ? answered
            ? <span className={`text-xs font-bold shrink-0 ${d?.tone ?? 'text-steel-400'}`}>{d ? `${d.icon} ${d.short}` : 'sem resposta'}</span>
            : <span className="text-sm font-bold shrink-0">{itemQuote(item) > 0 ? fmtBRL(itemQuote(item)) : 'sem preço'}</span>
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
