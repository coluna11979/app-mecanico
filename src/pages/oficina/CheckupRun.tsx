import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import WorkshopLayout from '@/components/layout/WorkshopLayout';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/components/ui/Toast';
import LicensePlate from '@/components/os/LicensePlate';
import {
  CHECKUP_TEMPLATE, SYSTEM_ICON, STATUS_META, TEMPLATE_BY_KEY,
  checkupPhotoUrl, computeScore, publicReportUrl, scoreMeta, uploadCheckupPhoto, whatsappLink,
  type CheckupItem, type CheckupItemStatus, type VehicleCheckup,
} from '@/lib/checkup';
import { DEMO_ID, DEMO_MECHANICS, demoDraft, saveDemoResult } from '@/lib/checkupDemo';
import type { WorkshopMechanic } from '@/types/database';

const STATUS_ON: Record<CheckupItemStatus, string> = {
  ok:     'bg-signal-500 text-white border-signal-500',
  warn:   'bg-pending-500 text-steel-900 border-pending-500',
  urgent: 'bg-alert-500 text-white border-alert-500',
  na:     'bg-steel-500 text-white border-steel-500',
};
const SCORE_TEXT = { signal: 'text-signal-600', pending: 'text-pending-600', alert: 'text-alert-600' };

type Patch = Partial<Pick<CheckupItem, 'status' | 'measurement' | 'note' | 'photo_path'>>;
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

  async function load() {
    setLoading(true);
    let c: Row | null, list: CheckupItem[];
    if (demo) {
      const d = demoDraft();
      c = { ...d.checkup, os: null }; list = d.items; setMechs(DEMO_MECHANICS);
    } else {
      const [r1, r2] = await Promise.all([
        supabase.from('vehicle_checkups').select('*, os:service_orders(number)').eq('id', id!).maybeSingle(),
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
        </div>

        {done ? (
          <CompletedView checkup={checkup} items={items} workshopName={currentWorkshop?.business_name}
            onReopen={() => patchCheckup({ status: 'draft' })} onDelete={remove} />
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
                        <ItemRow key={item.id} item={item} checkupId={checkup.id} workshopId={checkup.workshop_id}
                          demo={demo} onPatch={p => patchItem(item, p)}
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

/* ─── Incluir item fora do checklist ───────────────────────── */
function AddItem({ system, onAdd }: { system: string; onAdd: (label: string) => Promise<boolean> }) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const l = label.trim();
    if (!l) return;
    setSaving(true);
    const ok = await onAdd(l);
    setSaving(false);
    if (ok) { setLabel(''); setOpen(false); }
  }

  if (!open) {
    return (
      <div className="px-5 py-2.5">
        <button onClick={() => setOpen(true)} className="text-xs font-semibold text-brand-600 hover:underline">
          + Incluir item em {system}
        </button>
      </div>
    );
  }
  return (
    <form onSubmit={submit} className="px-5 py-3 flex gap-2 bg-brand-50/40">
      <input autoFocus value={label} onChange={e => setLabel(e.target.value)} maxLength={80}
        placeholder="Ex.: Bomba de combustível, junta da tampa de válvula…" className="input !py-2 flex-1 min-w-0" />
      <button type="submit" disabled={saving || !label.trim()} className="btn-primary !py-2 text-sm shrink-0">
        {saving ? 'Incluindo…' : 'Incluir'}
      </button>
      <button type="button" onClick={() => { setOpen(false); setLabel(''); }} className="btn-ghost !py-2 text-sm shrink-0">Cancelar</button>
    </form>
  );
}

/* ─── Item do checklist ────────────────────────────────────── */
function ItemRow({ item, checkupId, workshopId, demo, onPatch, onRemove }: {
  item: CheckupItem; checkupId: string; workshopId: string; demo: boolean; onPatch: (p: Patch) => void;
  /** Só itens incluídos à mão podem ser removidos */
  onRemove?: () => void;
}) {
  const tpl = TEMPLATE_BY_KEY[item.item_key];
  const flagged = item.status === 'warn' || item.status === 'urgent';
  const [expanded, setExpanded] = useState(false);
  const [measurement, setMeasurement] = useState(item.measurement ?? '');
  const [note, setNote] = useState(item.note ?? '');
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const showDetails = expanded || flagged;

  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/') && file.type !== '') { toast.error('Envie uma imagem'); return; }
    if (demo) { onPatch({ photo_path: URL.createObjectURL(file) }); return; }
    setUploading(true);
    try {
      onPatch({ photo_path: await uploadCheckupPhoto(file, workshopId, checkupId, item.item_key) });
    } catch {
      toast.error('Erro ao enviar a foto');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="px-5 py-3.5 space-y-2.5">
      <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
        <button onClick={() => setExpanded(v => !v)} className="text-sm text-steel-800 text-left flex-1 min-w-0">
          {item.label}
          {(item.photo_path || item.note) && <span className="ml-1.5 text-[11px]">{item.photo_path ? '📷' : ''}{item.note ? '📝' : ''}</span>}
        </button>
        <div className="flex gap-1.5 shrink-0">
          {(['ok', 'warn', 'urgent'] as const).map(s => (
            <button key={s} onClick={() => onPatch({ status: item.status === s ? null : s })}
              className={`px-3 py-2 rounded-xl text-xs font-bold border transition active:scale-95 flex-1 sm:flex-none ${
                item.status === s ? STATUS_ON[s] : 'border-steel-200 text-steel-600 bg-white hover:bg-steel-50'
              }`}>
              {STATUS_META[s].dot} {STATUS_META[s].short}
            </button>
          ))}
          <button onClick={() => onPatch({ status: item.status === 'na' ? null : 'na' })}
            className={`px-2.5 py-2 rounded-xl text-[11px] font-semibold border ${item.status === 'na' ? STATUS_ON.na : 'border-steel-200 text-steel-400 bg-white'}`}>
            N/A
          </button>
        </div>
      </div>

      {showDetails && (
        <div className="space-y-2 bg-steel-50 rounded-xl p-3">
          <div className="flex gap-2">
            {tpl?.measure && (
              <input value={measurement} onChange={e => setMeasurement(e.target.value)}
                onBlur={() => measurement !== (item.measurement ?? '') && onPatch({ measurement: measurement.trim() || null })}
                placeholder={tpl.measure} className="input !py-2 w-32" />
            )}
            <input value={note} onChange={e => setNote(e.target.value)}
              onBlur={() => note !== (item.note ?? '') && onPatch({ note: note.trim() || null })}
              placeholder="Observação (ex.: trocar em 30 dias)" className="input !py-2 flex-1 min-w-0" />
          </div>
          <div className="flex items-center gap-2">
            {item.photo_path && (
              <a href={checkupPhotoUrl(item.photo_path)} target="_blank" rel="noreferrer" className="shrink-0">
                <img src={checkupPhotoUrl(item.photo_path)} alt="" className="h-14 w-14 rounded-lg object-cover border border-steel-200" />
              </a>
            )}
            <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={onPhoto} className="hidden" />
            <button onClick={() => fileRef.current?.click()} disabled={uploading}
              className="btn-ghost text-xs !py-2 border border-steel-200 bg-white">
              {uploading ? 'Enviando…' : item.photo_path ? '📷 Trocar foto' : '📷 Adicionar foto'}
            </button>
            {item.photo_path && (
              <button onClick={() => onPatch({ photo_path: null })} className="text-xs text-steel-500 px-2 hover:text-alert-600">Remover</button>
            )}
            {onRemove && (
              <button onClick={onRemove} className="ml-auto text-xs text-steel-400 px-2 hover:text-alert-600">🗑 Remover item</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Finalizado ───────────────────────────────────────────── */
function CompletedView({ checkup, items, workshopName, onReopen, onDelete }: {
  checkup: VehicleCheckup; items: CheckupItem[]; workshopName?: string;
  onReopen: () => void; onDelete: () => void;
}) {
  const url = publicReportUrl(checkup.public_token);
  const flagged = items.filter(i => i.status === 'urgent' || i.status === 'warn')
    .sort((a, b) => (a.status === 'urgent' ? 0 : 1) - (b.status === 'urgent' ? 0 : 1));

  async function copy() {
    try { await navigator.clipboard.writeText(url); toast.success('Link copiado'); }
    catch { toast.error('Não foi possível copiar'); }
  }

  return (
    <>
      <div className="card space-y-3">
        <div className="font-bold text-steel-800">📤 Enviar relatório ao cliente</div>
        <div className="flex flex-col sm:flex-row gap-2">
          <a href={whatsappLink(checkup, workshopName)} target="_blank" rel="noreferrer"
            className="btn-primary !bg-[#25D366] text-center flex-1">Enviar pelo WhatsApp</a>
          <button onClick={copy} className="btn-ghost border border-steel-200">Copiar link</button>
          <a href={url} target="_blank" rel="noreferrer" className="btn-ghost border border-steel-200 text-center">Ver relatório</a>
        </div>
      </div>

      {flagged.length > 0 && (
        <div className="card space-y-2">
          <div className="text-[10px] font-bold text-steel-500 uppercase tracking-widest">Serviços recomendados</div>
          {flagged.map(i => (
            <div key={i.id} className="flex items-start gap-2 text-sm py-1">
              <span>{STATUS_META[i.status!].dot}</span>
              <div className="flex-1 min-w-0">
                <div className="text-steel-800">{i.label}{i.measurement && <span className="text-steel-500"> · {i.measurement}</span>}</div>
                {i.note && <div className="text-xs text-steel-500">{i.note}</div>}
              </div>
            </div>
          ))}
          <p className="text-xs text-steel-400 pt-2 border-t border-steel-100">
            Em breve: transformar estes itens em orçamento na Mesa Comercial.
          </p>
        </div>
      )}

      <div className="flex gap-2">
        <button onClick={onReopen} className="btn-ghost text-sm border border-steel-200">✏️ Editar</button>
        <button onClick={onDelete} className="btn-ghost text-sm text-steel-500 hover:text-alert-600">Excluir</button>
      </div>
    </>
  );
}
