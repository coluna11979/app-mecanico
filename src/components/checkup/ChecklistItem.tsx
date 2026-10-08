import { useRef, useState } from 'react';
import { toast } from '@/components/ui/Toast';
import { STATUS_META, checkupPhotoUrl, reasonsFor, type CheckupItem, type CheckupItemStatus } from '@/lib/checkup';

/* Linha do checklist — usada na tela da oficina e no link do mecânico (celular). */

export const STATUS_ON: Record<CheckupItemStatus, string> = {
  ok:     'bg-signal-500 text-white border-signal-500',
  warn:   'bg-pending-500 text-steel-900 border-pending-500',
  urgent: 'bg-alert-500 text-white border-alert-500',
  na:     'bg-steel-500 text-white border-steel-500',
};

export type ItemPatch = Partial<Pick<CheckupItem, 'status' | 'measurement' | 'note' | 'photo_path' | 'quote_part' | 'quote_service'>>;


/* ─── Incluir item fora do checklist ───────────────────────── */
export function AddItem({ system, onAdd }: { system: string; onAdd: (label: string) => Promise<boolean> }) {
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
export function ItemRow({ item, uploadPhoto, onPatch, onRemove }: {
  item: CheckupItem;
  /** Envia a foto e devolve o path salvo (ou uma URL blob: na demonstração) */
  uploadPhoto: (file: File, itemKey: string) => Promise<string>;
  onPatch: (p: ItemPatch) => void;
  /** Só itens incluídos à mão podem ser removidos */
  onRemove?: () => void;
}) {
  const flagged = item.status === 'warn' || item.status === 'urgent';
  const [expanded, setExpanded] = useState(false);
  const [note, setNote] = useState(item.note ?? '');
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const showDetails = expanded || flagged;

  /** Toque rápido: liga/desliga a palavra na observação e já salva */
  function toggleTag(tag: string) {
    const parts = note.split(',').map(x => x.trim()).filter(Boolean);
    const has = parts.some(x => x.toLowerCase() === tag.toLowerCase());
    const next = (has ? parts.filter(x => x.toLowerCase() !== tag.toLowerCase()) : [...parts, tag]).join(', ');
    setNote(next);
    onPatch({ note: next || null });
  }
  const tagOn = (tag: string) => note.split(',').some(x => x.trim().toLowerCase() === tag.toLowerCase());

  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/') && file.type !== '') { toast.error('Envie uma imagem'); return; }
    setUploading(true);
    try {
      onPatch({ photo_path: await uploadPhoto(file, item.item_key) });
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
          {/* Item com problema: o mecânico só diz o que viu (toques rápidos) e tira a foto.
              Peça, serviço e preço ficam com o comercial, no orçamento. */}
          {flagged && (
            <div className="flex flex-wrap gap-1.5">
              {reasonsFor(item.item_key).map(t => (
                <button key={t} type="button" onClick={() => toggleTag(t)}
                  className={`text-xs font-semibold px-3 py-2 rounded-full border transition active:scale-95 ${
                    tagOn(t) ? 'bg-steel-900 text-white border-steel-900' : 'bg-white text-steel-600 border-steel-200'}`}>
                  {t}
                </button>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <input value={note} onChange={e => setNote(e.target.value)}
              onBlur={() => note !== (item.note ?? '') && onPatch({ note: note.trim() || null })}
              placeholder={flagged ? 'Quer escrever algo? (opcional)' : 'Observação (opcional)'} className="input !py-2 flex-1 min-w-0" />
          </div>
          <div className="flex items-center gap-2">
            {item.photo_path && (
              <a href={checkupPhotoUrl(item.photo_path)} target="_blank" rel="noreferrer" className="shrink-0">
                <img src={checkupPhotoUrl(item.photo_path)} alt="" className="h-14 w-14 rounded-lg object-cover border border-steel-200" />
              </a>
            )}
            <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={onPhoto} className="hidden" />
            <button onClick={() => fileRef.current?.click()} disabled={uploading}
              className={flagged && !item.photo_path ? 'btn-primary text-sm !py-2.5' : 'btn-ghost text-xs !py-2 border border-steel-200 bg-white'}>
              {uploading ? 'Enviando…' : item.photo_path ? '📷 Trocar foto' : flagged ? '📷 Tirar foto' : '📷 Adicionar foto'}
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
