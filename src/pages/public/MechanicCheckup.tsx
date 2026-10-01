import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Logo } from '@/components/Logo';
import { toast } from '@/components/ui/Toast';
import LicensePlate from '@/components/os/LicensePlate';
import { AddItem, ItemRow, type CatalogNames, type ItemPatch } from '@/components/checkup/ChecklistItem';
import {
  CHECKUP_TEMPLATE, STATUS_META, SYSTEM_ICON, computeScore, scoreMeta, uploadMechanicPhoto,
  type CheckupItem,
} from '@/lib/checkup';

/* Check-up pelo celular do mecânico, aberto pelo link que a oficina mandou no
   WhatsApp. Sem login: tudo passa pelas funções mech_checkup_* com o token do
   link (+ o token deste aparelho, liberado com o PIN na primeira vez). */

type Car = {
  plate: string | null; make: string | null; model: string | null; year: number | null;
  km_reading: number | null; mechanic_name: string | null; workshop_name: string | null;
};
type Info = {
  id: string; workshop_id: string; status: 'draft' | 'completed'; score: number | null;
  notes: string | null; upload_key: string | null; customer_first_name: string | null;
};
type OpenResult = { ok: boolean; error?: string; need_pin?: boolean; car?: Car; checkup?: Info; items?: CheckupItem[] };

const DEVICE_KEY = 'mec-checkup-device';
const readDevice = () => { try { return localStorage.getItem(DEVICE_KEY); } catch { return null; } };
const saveDevice = (d: string) => { try { localStorage.setItem(DEVICE_KEY, d); } catch { /* ignora */ } };

const SCORE_TEXT = { signal: 'text-signal-600', pending: 'text-pending-600', alert: 'text-alert-600' };

export default function MechanicCheckup() {
  const { token } = useParams<{ token: string }>();
  const [device, setDevice] = useState<string | null>(readDevice);
  const [state, setState]   = useState<'loading' | 'pin' | 'ok' | 'error'>('loading');
  const [error, setError]   = useState('');
  const [car, setCar]       = useState<Car | null>(null);
  const [info, setInfo]     = useState<Info | null>(null);
  const [items, setItems]   = useState<CheckupItem[]>([]);
  const [catalog, setCatalog] = useState<CatalogNames | undefined>(undefined);
  const [open, setOpen]     = useState<string | null>(null);
  const [notes, setNotes]   = useState('');
  const [finishing, setFinishing] = useState(false);

  useEffect(() => { if (token) load(); }, [token, device]); // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    const { data, error } = await supabase.rpc('mech_checkup_open', { p_token: token, p_device: device });
    const r = data as OpenResult | null;
    if (error || !r) { setError('Não foi possível abrir. Verifique a internet e tente de novo.'); setState('error'); return; }
    if (r.car) setCar(r.car);
    if (!r.ok) { setError(r.error ?? 'Link inválido'); setState('error'); return; }
    if (r.need_pin) { setState('pin'); return; }
    const list = r.items ?? [];
    setInfo(r.checkup!);
    setNotes(r.checkup!.notes ?? '');
    setItems(list);
    setCatalog((r as { catalog?: CatalogNames }).catalog);
    const firstPending = CHECKUP_TEMPLATE.find(s => list.some(i => i.system === s.system && !i.status));
    setOpen(firstPending?.system ?? null);
    setState('ok');
  }

  /** Erro vindo das funções do banco (link vencido, finalizado pela oficina…) */
  function fail(e: { message: string } | null) {
    if (!e) return false;
    if (/vencido|inválido|finalizado|PIN/.test(e.message)) { toast.error(e.message); load(); }
    else toast.error('Não salvou — verifique a internet');
    return true;
  }

  async function patchItems(ids: string[], patch: ItemPatch) {
    const prev = items;
    setItems(list => list.map(i => ids.includes(i.id) ? { ...i, ...patch } : i));
    const { error } = await supabase.rpc('mech_checkup_update_items',
      { p_token: token, p_device: device, p_items: ids, p_patch: patch });
    if (fail(error)) { setItems(prev); return false; }
    return true;
  }

  async function markSystemOk(system: string) {
    const ids = items.filter(i => i.system === system && !i.status).map(i => i.id);
    if (!ids.length || !(await patchItems(ids, { status: 'ok' }))) return;
    const idx  = CHECKUP_TEMPLATE.findIndex(s => s.system === system);
    const next = CHECKUP_TEMPLATE.slice(idx + 1).find(s => items.some(i => i.system === s.system && !i.status));
    setOpen(next?.system ?? null);
  }

  async function addItem(system: string, label: string) {
    const { data, error } = await supabase.rpc('mech_checkup_add_item',
      { p_token: token, p_device: device, p_system: system, p_label: label });
    if (fail(error) || !data) return false;
    setItems(list => [...list, data as CheckupItem]);
    return true;
  }

  async function removeItem(item: CheckupItem) {
    if (!confirm(`Remover “${item.label}”?`)) return;
    const prev = items;
    setItems(list => list.filter(i => i.id !== item.id));
    const { error } = await supabase.rpc('mech_checkup_remove_item', { p_token: token, p_device: device, p_item: item.id });
    if (fail(error)) setItems(prev);
  }

  async function finish() {
    const answered = items.filter(i => i.status).length;
    if (!answered) { toast.error('Avalie ao menos um item'); return; }
    const missing = items.length - answered;
    if (!confirm(missing > 0
      ? `${missing} ${missing === 1 ? 'item não foi avaliado' : 'itens não foram avaliados'}. Finalizar e mandar para a oficina mesmo assim?`
      : 'Finalizar e mandar para a oficina? Depois não dá mais pra alterar.')) return;
    setFinishing(true);
    const { error } = await supabase.rpc('mech_checkup_finish', { p_token: token, p_device: device, p_notes: notes });
    setFinishing(false);
    if (fail(error)) return;
    window.scrollTo({ top: 0, behavior: 'smooth' });
    load();
  }

  const bySystem = useMemo(() => {
    const map: Record<string, CheckupItem[]> = {};
    items.forEach(i => { (map[i.system] ??= []).push(i); });
    return map;
  }, [items]);

  const carName = car ? [car.make, car.model, car.year].filter(Boolean).join(' ') || 'Veículo' : '';

  const header = (
    <div className="bg-steel-900 text-white px-4 pt-4 pb-5">
      <div className="max-w-xl mx-auto space-y-3">
        <div className="flex items-center justify-between gap-3">
          <Logo light />
          {car?.workshop_name && <span className="text-xs text-steel-400 truncate">{car.workshop_name}</span>}
        </div>
        {car && (
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              {car.plate && <LicensePlate plate={car.plate} size="sm" />}
              <h1 className="text-lg font-bold">{carName}</h1>
            </div>
            <div className="text-xs text-steel-400">
              {[car.km_reading != null && `${car.km_reading.toLocaleString('pt-BR')} km`,
                car.mechanic_name && `🔧 ${car.mechanic_name}`].filter(Boolean).join(' · ')}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  if (state === 'loading') {
    return <div className="min-h-screen grid place-items-center bg-steel-50 text-steel-500 text-sm">Abrindo check-up…</div>;
  }

  if (state === 'error') {
    return (
      <div className="min-h-screen bg-steel-50">
        {header}
        <div className="max-w-xl mx-auto p-6 text-center space-y-2">
          <div className="text-4xl">🔒</div>
          <div className="font-bold text-steel-800">{error}</div>
        </div>
      </div>
    );
  }

  if (state === 'pin') {
    return (
      <div className="min-h-screen bg-steel-50">
        {header}
        <PinPad name={car?.mechanic_name ?? null} token={token!}
          onOk={d => { if (d) { saveDevice(d); setDevice(d); } else load(); }} />
      </div>
    );
  }

  const done      = info?.status === 'completed';
  const answered  = items.filter(i => i.status).length;
  const progress  = items.length ? Math.round((answered / items.length) * 100) : 0;
  const warnCnt   = items.filter(i => i.status === 'warn').length;
  const urgentCnt = items.filter(i => i.status === 'urgent').length;

  if (done) {
    const score = info?.score ?? computeScore(items);
    const meta  = scoreMeta(score);
    const flagged = items.filter(i => i.status === 'warn' || i.status === 'urgent');
    return (
      <div className="min-h-screen bg-steel-50">
        {header}
        <div className="max-w-xl mx-auto p-4 space-y-4">
          <div className="card text-center space-y-2 py-8">
            <div className="text-5xl">✅</div>
            <div className="text-lg font-bold">Check-up enviado para a oficina</div>
            <div className={`text-sm font-semibold ${SCORE_TEXT[meta.color]}`}>Nota {score} · {meta.label}</div>
            <p className="text-xs text-steel-500">Pode fechar esta página. Obrigado!</p>
          </div>
          {flagged.length > 0 && (
            <div className="card space-y-2">
              <div className="label">O que você apontou</div>
              {flagged.map(i => (
                <div key={i.id} className="text-sm flex gap-2">
                  <span>{STATUS_META[i.status!].dot}</span>
                  <span className="flex-1">{i.label}{i.note && <span className="text-steel-500"> — {i.note}</span>}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-steel-50 pb-10">
      {header}
      <div className="max-w-xl mx-auto px-3 -mt-3 space-y-3">
        <div className="card !py-3 space-y-1.5">
          <div className="flex justify-between text-xs text-steel-500">
            <span>{answered}/{items.length} itens avaliados</span>
            <span>🟡 {warnCnt} · 🔴 {urgentCnt}</span>
          </div>
          <div className="h-2 rounded-full bg-steel-100 overflow-hidden">
            <div className="h-full bg-brand-500 transition-all" style={{ width: `${progress}%` }} />
          </div>
        </div>

        {CHECKUP_TEMPLATE.map(({ system }) => {
          const list = bySystem[system] ?? [];
          if (!list.length) return null;
          const doneCnt = list.filter(i => i.status).length;
          const isOpen  = open === system;
          const flags   = list.filter(i => i.status === 'warn' || i.status === 'urgent').length;
          return (
            <div key={system} className="card !p-0 overflow-hidden">
              <button onClick={() => setOpen(isOpen ? null : system)}
                className="w-full flex items-center gap-3 px-4 py-4 text-left active:bg-steel-50">
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
                      <button onClick={() => markSystemOk(system)} className="text-xs font-semibold text-signal-600">
                        ✓ Marcar pendentes como OK
                      </button>
                    </div>
                  )}
                  {list.map(item => (
                    <ItemRow key={item.id} item={item} catalog={catalog} onPatch={p => patchItems([item.id], p)}
                      uploadPhoto={(file, key) => uploadMechanicPhoto(file, info!.workshop_id, info!.id, info!.upload_key ?? '', key)}
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
            <span className="label">Observações gerais</span>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} className="input"
              placeholder="Ex.: freio dianteiro no limite, trocar logo." />
          </label>
          <button onClick={finish} disabled={finishing} className="btn-primary w-full !py-3.5">
            {finishing ? 'Enviando…' : 'Finalizar e enviar para a oficina'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── PIN na primeira vez neste celular ────────────────────── */
function PinPad({ name, token, onOk }: { name: string | null; token: string; onOk: (device: string | null) => void }) {
  const [pin, setPin]     = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy]   = useState(false);

  async function submit() {
    if (pin.length < 4 || busy) return;
    setBusy(true); setError(null);
    const { data, error } = await supabase.rpc('mech_checkup_pin', { p_token: token, p_pin: pin });
    setBusy(false);
    const r = data as { ok: boolean; error?: string; device?: string | null } | null;
    if (error || !r) { setError('Sem conexão. Tente de novo.'); return; }
    if (!r.ok) { setError(r.error ?? 'PIN incorreto'); setPin(''); return; }
    onOk(r.device ?? null);
  }

  const press = (d: string) => { setError(null); setPin(p => (p.length >= 6 ? p : p + d)); };

  return (
    <div className="max-w-xs mx-auto px-4 py-8 text-center">
      <div className="text-lg font-bold text-steel-800">{name ? `Oi, ${name.split(' ')[0]}!` : 'Olá!'}</div>
      <p className="text-sm text-steel-500 mt-1">Digite o seu PIN. É só na primeira vez neste celular.</p>

      <div className="flex justify-center gap-3 mt-6 h-4">
        {Array.from({ length: Math.max(4, pin.length) }).map((_, i) => (
          <span key={i} className={`h-3.5 w-3.5 rounded-full ${i < pin.length ? 'bg-steel-800' : 'bg-steel-200'}`} />
        ))}
      </div>
      <div className="h-6 mt-3 text-sm text-alert-600">{error}</div>

      <div className="grid grid-cols-3 gap-3 mt-2">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(d => (
          <button key={d} onClick={() => press(d)}
            className="h-16 rounded-2xl bg-white border border-steel-200 active:bg-steel-100 text-2xl font-semibold">{d}</button>
        ))}
        <button onClick={() => setPin(p => p.slice(0, -1))} aria-label="Apagar" className="h-16 rounded-2xl text-steel-500 text-xl">⌫</button>
        <button onClick={() => press('0')}
          className="h-16 rounded-2xl bg-white border border-steel-200 active:bg-steel-100 text-2xl font-semibold">0</button>
        <button onClick={submit} disabled={pin.length < 4 || busy}
          className="h-16 rounded-2xl bg-brand-500 text-white disabled:opacity-40 font-bold">
          {busy ? '…' : 'Entrar'}
        </button>
      </div>
    </div>
  );
}
