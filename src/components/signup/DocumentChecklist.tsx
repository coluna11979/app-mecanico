// Lista de documentos do cadastro: um cartão por documento, com "Tirar foto" (abre a câmera
// no celular) ou "Escolher arquivo". Cada arquivo sobe na hora em que é escolhido — se a pessoa
// fechar o app no meio, o que já mandou fica salvo.
import { ChangeEvent, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  ACCEPT_ATTR, attachmentProblem, shrinkImage, uploadApprovalAttachment,
} from '@/lib/approvalAttachments';
import type { DocSlot, DocState } from '@/lib/signupDocuments';
import type { DocType } from '@/types/database';

export function DocumentChecklist({
  userId, slots, states, onUploaded, highlight = [],
}: {
  userId: string;
  slots: DocSlot[];
  states: Record<DocType, DocState>;
  onUploaded: () => Promise<void> | void;
  /** Documentos para destacar (quem tentou concluir sem enviar tudo) */
  highlight?: DocType[];
}) {
  return (
    <div className="space-y-2.5">
      {slots.map(s => (
        <DocSlotCard
          key={s.type}
          userId={userId}
          slot={s}
          state={states[s.type] ?? { status: 'missing' }}
          onUploaded={onUploaded}
          highlighted={highlight.includes(s.type)}
        />
      ))}
    </div>
  );
}

function DocSlotCard({
  userId, slot, state, onUploaded, highlighted,
}: {
  userId: string;
  slot: DocSlot;
  state: DocState;
  onUploaded: () => Promise<void> | void;
  highlighted: boolean;
}) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [replacing, setReplacing] = useState(false);

  async function handlePick(e: ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0];
    e.target.value = ''; // permite escolher o mesmo arquivo de novo
    if (!picked) return;
    setError(null);
    setBusy(true);
    try {
      const file = await shrinkImage(picked);
      const problem = attachmentProblem(file);
      if (problem) { setError(problem); return; }

      const att = await uploadApprovalAttachment(file, userId);
      const { error: insErr } = await supabase.from('approval_messages').insert({
        profile_id: userId,
        sender_id: userId,
        sender_role: 'user',
        kind: 'reply',
        doc_type: slot.type,
        content: `📎 ${slot.label}`,
        attachment_path: att.path,
        attachment_name: att.name,
        attachment_size: att.size,
        attachment_mime: att.mime,
      });
      if (insErr) throw insErr;
      setReplacing(false);
      await onUploaded();
    } catch {
      setError('Não deu para enviar. Confira a internet e tente de novo.');
    } finally {
      setBusy(false);
    }
  }

  const sent = state.status === 'sent';
  const rejected = state.status === 'rejected';
  const showActions = !sent || replacing;

  const frame = sent
    ? 'border-signal-300 bg-signal-500/10'
    : rejected
      ? 'border-alert-300 bg-alert-500/5'
      : highlighted
        ? 'border-brand-500 bg-white ring-2 ring-brand-500/30'
        : 'border-steel-200 bg-white';

  return (
    <div id={`doc-${slot.type}`} className={`rounded-2xl border p-3.5 transition ${frame}`}>
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 shrink-0 text-xl ${sent ? 'text-signal-600' : ''}`} aria-hidden>
          {sent ? '✅' : slot.icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className={`font-semibold leading-snug ${sent ? 'text-signal-700' : 'text-steel-900'}`}>
            {slot.label}
          </div>
          {sent && (
            <div className="truncate text-xs text-signal-700/80">
              Enviado · {state.upload.attachment_name ?? 'arquivo'}
            </div>
          )}
          {rejected && (
            <div className="mt-0.5 text-xs text-alert-700">
              <span className="font-bold">Precisa enviar de novo:</span>{' '}
              <span className="whitespace-pre-wrap">{state.reason}</span>
            </div>
          )}
          {!sent && !rejected && <div className="text-xs text-steel-500">{slot.hint}</div>}
        </div>
        {sent && !replacing && !busy && (
          <button
            type="button"
            onClick={() => setReplacing(true)}
            className="-mr-1 shrink-0 rounded-lg px-2 py-2 text-xs font-semibold text-steel-500 hover:bg-white/60 hover:text-steel-800"
          >
            Trocar
          </button>
        )}
      </div>

      {busy ? (
        <div className="mt-3 flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-steel-100 text-sm font-semibold text-steel-600">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-steel-300 border-t-brand-500" aria-hidden />
          Enviando…
        </div>
      ) : showActions && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => cameraRef.current?.click()}
            className="min-h-[44px] rounded-xl border border-steel-300 bg-white px-2 text-sm font-semibold text-steel-800 hover:bg-steel-50 active:scale-[0.98]"
          >
            📷 Tirar foto
          </button>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            aria-label="Escolher arquivo: foto da galeria ou PDF"
            className="min-h-[44px] rounded-xl border border-steel-300 bg-white px-2 text-sm font-semibold text-steel-800 hover:bg-steel-50 active:scale-[0.98]"
          >
            📎 Arquivo
          </button>
        </div>
      )}

      {error && <p className="mt-2 text-xs font-semibold text-alert-600">⚠️ {error}</p>}

      <input ref={cameraRef} type="file" accept="image/*" capture="environment" onChange={handlePick} className="hidden" />
      <input ref={fileRef} type="file" accept={ACCEPT_ATTR} onChange={handlePick} className="hidden" />
    </div>
  );
}
