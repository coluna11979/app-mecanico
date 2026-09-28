import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import MechanicLayout from '@/components/layout/MechanicLayout';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/components/ui/Toast';
import {
  CHECKUP_TEMPLATE, SYSTEM_ICON, STATUS_META, TEMPLATE_BY_KEY,
  checkupPhotoUrl, computeScore, publicReportUrl, scoreMeta, uploadCheckupPhoto, whatsappLink,
  type CheckupItem, type CheckupItemStatus, type VehicleCheckup,
} from '@/lib/checkup';
import { DEMO_ID, demoDraft, saveDemoResult } from '@/lib/checkupDemo';

const STATUS_BTN: Record<CheckupItemStatus, { on: string }> = {
  ok:     { on: 'bg-signal-500 text-white border-signal-500' },
  warn:   { on: 'bg-pending-500 text-steel-900 border-pending-500' },
  urgent: { on: 'bg-alert-500 text-white border-alert-500' },
  na:     { on: 'bg-steel-600 text-white border-steel-600' },
};
const SCORE_TEXT = { signal: 'text-signal-500', pending: 'text-pending-500', alert: 'text-alert-500' };

type Patch = Partial<Pick<CheckupItem, 'status' | 'measurement' | 'note' | 'photo_path'>>;

export default function MechanicCheckupRun() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [checkup, setCheckup] = useState<VehicleCheckup | null>(null);
  const [items, setItems]     = useState<CheckupItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen]       = useState<string | null>(null);
  const [notes, setNotes]     = useState('');
  const [finishing, setFinishing] = useState(false);
  // Pré-visualização com dados fictícios, sem banco — só em dev (/demo/checkup)
  const demo = import.meta.env.DEV && id === DEMO_ID;
  const profileId = user?.id ?? 'demo';

  useEffect(() => { if ((user || demo) && id) load(); }, [user, id]);

  async function load() {
    setLoading(true);
    const [{ data: c }, { data: its }] = demo
      ? (d => [{ data: d.checkup }, { data: d.items }])(demoDraft())
      : await Promise.all([
          supabase.from('vehicle_checkups').select('*').eq('id', id!).maybeSingle(),
          supabase.from('checkup_items').select('*').eq('checkup_id', id!).order('position'),
        ]);
    setCheckup(c as VehicleCheckup | null);
    setNotes((c as VehicleCheckup | null)?.notes ?? '');
    const list = (its as CheckupItem[]) ?? [];
    setItems(list);
    // abre o primeiro sistema com item pendente
    const firstPending = CHECKUP_TEMPLATE.find(s => list.some(i => i.system === s.system && !i.status));
    setOpen(firstPending?.system ?? null);
    setLoading(false);
  }

  async function patchItem(item: CheckupItem, patch: Patch) {
    const prev = items;
    setItems(list => list.map(i => i.id === item.id ? { ...i, ...patch } : i));
    if (demo) return;
    const { error } = await supabase.from('checkup_items')
      .update({ ...patch, updated_at: new Date().toISOString() }).eq('id', item.id);
    if (error) {
      setItems(prev);
      toast.error('Não salvou — verifique a conexão');
    }
  }

  async function markSystemOk(system: string) {
    const pending = items.filter(i => i.system === system && !i.status);
    if (!pending.length) return;
    const ids = pending.map(i => i.id);
    const prev = items;
    setItems(list => list.map(i => ids.includes(i.id) ? { ...i, status: 'ok' } : i));
    if (!demo) {
      const { error } = await supabase.from('checkup_items')
        .update({ status: 'ok', updated_at: new Date().toISOString() }).in('id', ids);
      if (error) { setItems(prev); toast.error('Não salvou — verifique a conexão'); return; }
    }
    // avança pro próximo sistema com pendência
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
    const score = computeScore(items);
    const now   = new Date().toISOString();
    if (demo) {
      const done: VehicleCheckup = { ...checkup, status: 'completed', score, notes: notes.trim() || null, completed_at: now };
      setCheckup(done);
      saveDemoResult(done, items);
      setFinishing(false);
      toast.success('Check-up finalizado ✓ (demonstração)');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    const { data, error } = await supabase.from('vehicle_checkups')
      .update({ status: 'completed', score, notes: notes.trim() || null, completed_at: now, updated_at: now })
      .eq('id', checkup.id).select('*').single();
    setFinishing(false);
    if (error || !data) { toast.error('Erro ao finalizar'); return; }
    setCheckup(data as VehicleCheckup);
    toast.success('Check-up finalizado ✓');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function reopen() {
    if (!checkup) return;
    if (demo) { setCheckup({ ...checkup, status: 'draft' }); return; }
    const { data, error } = await supabase.from('vehicle_checkups')
      .update({ status: 'draft', updated_at: new Date().toISOString() })
      .eq('id', checkup.id).select('*').single();
    if (error || !data) { toast.error('Erro ao reabrir'); return; }
    setCheckup(data as VehicleCheckup);
  }

  async function remove() {
    if (!checkup || !confirm('Excluir este check-up? Não dá pra desfazer.')) return;
    if (demo) { toast.info('Demonstração — nada foi excluído'); return; }
    const { error } = await supabase.from('vehicle_checkups').delete().eq('id', checkup.id);
    if (error) { toast.error('Erro ao excluir'); return; }
    navigate('/mecanico/checkup');
  }

  const bySystem = useMemo(() => {
    const map: Record<string, CheckupItem[]> = {};
    items.forEach(i => { (map[i.system] ??= []).push(i); });
    return map;
  }, [items]);

  if (loading) {
    return <MechanicLayout><div className="p-8 text-center text-steel-500 text-sm">Carregando…</div></MechanicLayout>;
  }
  if (!checkup) {
    return (
      <MechanicLayout>
        <div className="p-8 text-center space-y-3">
          <div className="text-steel-400">Check-up não encontrado.</div>
          <Link to="/mecanico/checkup" className="text-brand-500 font-semibold text-sm">← Voltar</Link>
        </div>
      </MechanicLayout>
    );
  }

  const car      = [checkup.make, checkup.model, checkup.year].filter(Boolean).join(' ') || 'Veículo';
  const answered = items.filter(i => i.status).length;
  const progress = items.length ? Math.round((answered / items.length) * 100) : 0;
  const score    = checkup.status === 'completed' ? (checkup.score ?? 0) : computeScore(items);
  const meta     = scoreMeta(score);
  const empty    = checkup.status === 'draft' && answered === 0;
  const warnCnt   = items.filter(i => i.status === 'warn').length;
  const urgentCnt = items.filter(i => i.status === 'urgent').length;

  return (
    <MechanicLayout>
      <div className="p-4 space-y-4">
        {/* ── Cabeçalho do veículo ── */}
        <div className="flex items-center gap-3">
          <Link to={demo ? '/demo/checkup' : '/mecanico/checkup'} className="h-9 w-9 grid place-items-center rounded-xl bg-steel-800 text-steel-400 shrink-0">←</Link>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              {checkup.plate && <span className="text-xs font-mono font-bold bg-steel-700 text-steel-200 rounded px-1.5 py-0.5">{checkup.plate}</span>}
              <span className="font-bold text-white truncate">{car}</span>
            </div>
            <div className="text-xs text-steel-500 truncate">
              {[checkup.customer_name, checkup.km_reading != null && `${checkup.km_reading.toLocaleString('pt-BR')} km`].filter(Boolean).join(' · ') || 'Sem cliente'}
            </div>
          </div>
        </div>

        {/* ── Nota ── */}
        <div className="rounded-2xl bg-steel-800 border border-steel-700 p-4 flex items-center gap-4">
          <div className="text-center shrink-0 w-20">
            <div className={`text-4xl font-bold font-display ${empty ? 'text-steel-600' : SCORE_TEXT[meta.color]}`}>{empty ? '—' : score}</div>
            <div className="text-[10px] text-steel-500">nota de saúde</div>
          </div>
          <div className="flex-1 min-w-0 space-y-2">
            <div className={`font-semibold ${empty ? 'text-steel-400' : SCORE_TEXT[meta.color]}`}>{empty ? 'Aguardando inspeção' : meta.label}</div>
            <div className="flex gap-3 text-xs text-steel-400">
              <span>🟡 {warnCnt} atenção</span>
              <span>🔴 {urgentCnt} urgente</span>
            </div>
            {checkup.status === 'draft' && (
              <div>
                <div className="h-1.5 rounded-full bg-steel-700 overflow-hidden">
                  <div className="h-full bg-brand-500 transition-all" style={{ width: `${progress}%` }} />
                </div>
                <div className="text-[10px] text-steel-500 mt-1">{answered}/{items.length} itens avaliados</div>
              </div>
            )}
          </div>
        </div>

        {checkup.status === 'completed' ? (
          <CompletedView checkup={checkup} items={items} onReopen={reopen} onDelete={remove} />
        ) : (
          <>
            {/* ── Checklist por sistema ── */}
            {CHECKUP_TEMPLATE.map(({ system }) => {
              const list = bySystem[system] ?? [];
              if (!list.length) return null;
              const done   = list.filter(i => i.status).length;
              const isOpen = open === system;
              const flags  = list.filter(i => i.status === 'warn' || i.status === 'urgent').length;
              return (
                <div key={system} className="rounded-2xl bg-steel-800 border border-steel-700 overflow-hidden">
                  <button onClick={() => setOpen(isOpen ? null : system)}
                    className="w-full flex items-center gap-3 p-4 text-left active:bg-steel-700/50">
                    <span className="text-xl">{SYSTEM_ICON[system]}</span>
                    <span className="flex-1 font-semibold text-white">{system}</span>
                    {flags > 0 && <span className="text-xs text-pending-500 font-semibold">{flags} ⚠</span>}
                    <span className={`text-xs font-semibold ${done === list.length ? 'text-signal-500' : 'text-steel-500'}`}>
                      {done === list.length ? '✓' : `${done}/${list.length}`}
                    </span>
                    <span className={`text-steel-500 transition-transform ${isOpen ? 'rotate-180' : ''}`}>▾</span>
                  </button>
                  {isOpen && (
                    <div className="border-t border-steel-700 divide-y divide-steel-700/60">
                      {done < list.length && (
                        <div className="px-4 py-2.5">
                          <button onClick={() => markSystemOk(system)}
                            className="text-xs font-semibold text-signal-500 active:scale-95">
                            ✓ Marcar pendentes como OK
                          </button>
                        </div>
                      )}
                      {list.map(item => (
                        <ItemRow key={item.id} item={item} checkupId={checkup.id} profileId={profileId} demo={demo} onPatch={p => patchItem(item, p)} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {/* ── Observações e finalizar ── */}
            <div className="rounded-2xl bg-steel-800 border border-steel-700 p-4 space-y-3">
              <label className="block">
                <span className="text-xs text-steel-400 font-medium">Observações gerais (aparecem no relatório)</span>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
                  placeholder="Ex.: recomendo revisão de freios nos próximos 30 dias."
                  className="mt-1 w-full rounded-xl bg-steel-900 border border-steel-700 px-3 py-2.5 text-sm text-white placeholder:text-steel-600 focus:outline-none focus:border-brand-500" />
              </label>
              <button onClick={finish} disabled={finishing} className="btn-primary w-full !py-3.5">
                {finishing ? 'Finalizando…' : 'Finalizar e gerar relatório'}
              </button>
              <button onClick={remove} className="w-full text-xs text-steel-500 hover:text-alert-500 py-1">
                Excluir check-up
              </button>
            </div>
          </>
        )}
      </div>
    </MechanicLayout>
  );
}

/* ─── Item do checklist ────────────────────────────────────── */
function ItemRow({ item, checkupId, profileId, demo, onPatch }: {
  item: CheckupItem; checkupId: string; profileId: string; demo: boolean; onPatch: (p: Patch) => void;
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
      const path = await uploadCheckupPhoto(file, profileId, checkupId, item.item_key);
      onPatch({ photo_path: path });
    } catch {
      toast.error('Erro ao enviar a foto');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="px-4 py-3 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <button onClick={() => setExpanded(v => !v)} className="text-sm text-steel-100 text-left flex-1 min-w-0">
          {item.label}
          {(item.photo_path || item.note) && <span className="ml-1.5 text-[10px] text-steel-500">{item.photo_path ? '📷' : ''}{item.note ? '📝' : ''}</span>}
        </button>
        <button onClick={() => onPatch({ status: item.status === 'na' ? null : 'na' })}
          className={`text-[10px] font-semibold px-2 py-1 rounded-lg border ${item.status === 'na' ? STATUS_BTN.na.on : 'border-steel-700 text-steel-500'}`}>
          N/A
        </button>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {(['ok', 'warn', 'urgent'] as const).map(s => (
          <button key={s} onClick={() => onPatch({ status: item.status === s ? null : s })}
            className={`py-2.5 rounded-xl text-xs font-bold border transition active:scale-95 ${
              item.status === s ? STATUS_BTN[s].on : 'border-steel-700 text-steel-400 bg-steel-900/40'
            }`}>
            {STATUS_META[s].dot} {STATUS_META[s].short}
          </button>
        ))}
      </div>

      {showDetails && (
        <div className="space-y-2 pt-1">
          <div className="flex gap-2">
            {tpl?.measure && (
              <input value={measurement} onChange={e => setMeasurement(e.target.value)}
                onBlur={() => measurement !== (item.measurement ?? '') && onPatch({ measurement: measurement.trim() || null })}
                placeholder={tpl.measure}
                className="w-28 rounded-xl bg-steel-900 border border-steel-700 px-3 py-2 text-sm text-white placeholder:text-steel-600 focus:outline-none focus:border-brand-500" />
            )}
            <input value={note} onChange={e => setNote(e.target.value)}
              onBlur={() => note !== (item.note ?? '') && onPatch({ note: note.trim() || null })}
              placeholder="Observação (ex.: trocar em 30 dias)"
              className="flex-1 min-w-0 rounded-xl bg-steel-900 border border-steel-700 px-3 py-2 text-sm text-white placeholder:text-steel-600 focus:outline-none focus:border-brand-500" />
          </div>
          <div className="flex items-center gap-2">
            {item.photo_path && (
              <a href={checkupPhotoUrl(item.photo_path)} target="_blank" rel="noreferrer" className="shrink-0">
                <img src={checkupPhotoUrl(item.photo_path)} alt="" className="h-14 w-14 rounded-lg object-cover border border-steel-700" />
              </a>
            )}
            <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={onPhoto} className="hidden" />
            <button onClick={() => fileRef.current?.click()} disabled={uploading}
              className="text-xs font-semibold text-brand-500 px-3 py-2 rounded-xl border border-steel-700 active:scale-95">
              {uploading ? 'Enviando…' : item.photo_path ? '📷 Trocar foto' : '📷 Adicionar foto'}
            </button>
            {item.photo_path && (
              <button onClick={() => onPatch({ photo_path: null })} className="text-xs text-steel-500 px-2">Remover</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Finalizado: compartilhar ─────────────────────────────── */
function CompletedView({ checkup, items, onReopen, onDelete }: {
  checkup: VehicleCheckup; items: CheckupItem[]; onReopen: () => void; onDelete: () => void;
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
      <div className="rounded-2xl bg-steel-800 border border-steel-700 p-4 space-y-3">
        <div className="font-bold text-white">📤 Enviar relatório ao cliente</div>
        <a href={whatsappLink(checkup)} target="_blank" rel="noreferrer"
          className="flex items-center justify-center gap-2 w-full py-3.5 rounded-xl bg-[#25D366] text-white font-bold active:scale-95">
          Enviar pelo WhatsApp
        </a>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={copy} className="py-3 rounded-xl bg-steel-700 text-steel-200 font-semibold text-sm active:scale-95">Copiar link</button>
          <a href={url} target="_blank" rel="noreferrer" className="py-3 rounded-xl bg-steel-700 text-steel-200 font-semibold text-sm text-center active:scale-95">Ver relatório</a>
        </div>
      </div>

      {flagged.length > 0 && (
        <div className="rounded-2xl bg-steel-800 border border-steel-700 p-4 space-y-2">
          <div className="text-[10px] text-steel-500 uppercase tracking-widest font-semibold">Serviços recomendados</div>
          {flagged.map(i => (
            <div key={i.id} className="flex items-start gap-2 text-sm">
              <span>{STATUS_META[i.status!].dot}</span>
              <div className="flex-1 min-w-0">
                <div className="text-steel-100">{i.label}{i.measurement ? <span className="text-steel-500"> · {i.measurement}</span> : null}</div>
                {i.note && <div className="text-xs text-steel-500">{i.note}</div>}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <button onClick={onReopen} className="flex-1 py-3 rounded-xl bg-steel-800 border border-steel-700 text-steel-300 font-semibold text-sm active:scale-95">✏️ Editar</button>
        <button onClick={onDelete} className="flex-1 py-3 rounded-xl bg-steel-800 border border-steel-700 text-steel-500 font-semibold text-sm active:scale-95">Excluir</button>
      </div>
    </>
  );
}
