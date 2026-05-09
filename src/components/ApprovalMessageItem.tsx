import { useEffect, useState } from 'react';
import {
  fileIcon, fmtFileSize, getApprovalAttachmentUrl,
} from '@/lib/approvalAttachments';
import type { ApprovalMessage } from '@/types/database';

const KIND_LABELS: Record<ApprovalMessage['kind'], string> = {
  request_documents: 'Solicitação de documentos',
  reply: 'Resposta',
  note: 'Anotação',
  status_change: 'Mudança de status',
};
const KIND_ICONS: Record<ApprovalMessage['kind'], string> = {
  request_documents: '📋',
  reply: '💬',
  note: '📝',
  status_change: '🔄',
};

interface Props {
  message: ApprovalMessage;
  /** Marcação visual: essa solicitação foi atendida por uma resposta posterior? */
  resolved?: boolean;
  /** Esquema escuro (PendingApproval — cards) ou claro (admin) */
  dark?: boolean;
}

export function ApprovalMessageItem({ message: m, resolved, dark }: Props) {
  const isAdmin = m.sender_role === 'admin';

  return (
    <div
      className={`rounded-2xl p-4 border ${
        isAdmin
          ? dark
            ? 'bg-brand-50 border-brand-200'
            : 'bg-brand-50 border-brand-100'
          : dark
            ? 'bg-steel-100 border-steel-200 ml-8'
            : 'bg-steel-50 border-steel-100 ml-6'
      }`}
    >
      {/* Header */}
      <div className="flex items-center gap-2 text-[11px] text-steel-500 mb-1.5 font-semibold uppercase tracking-wider flex-wrap">
        <span>{KIND_ICONS[m.kind]}</span>
        <span>{isAdmin ? 'Equipe' : 'Usuário'}</span>
        <span>·</span>
        <span className="font-normal normal-case tracking-normal">
          {new Date(m.created_at).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
        </span>
        {m.kind === 'request_documents' && (
          <span
            className={`ml-auto text-[10px] font-bold rounded-full px-2 py-0.5 normal-case tracking-normal ${
              resolved
                ? 'bg-signal-500/15 text-signal-700 border border-signal-500/30'
                : 'bg-pending-500/15 text-pending-700 border border-pending-500/30'
            }`}
          >
            {resolved ? '✅ Respondida' : '⏳ Aguardando resposta'}
          </span>
        )}
      </div>

      <p className="text-steel-800 text-sm whitespace-pre-wrap leading-relaxed">{m.content}</p>

      {/* Anexo */}
      {m.attachment_path && (
        <Attachment
          path={m.attachment_path}
          name={m.attachment_name ?? 'arquivo'}
          size={m.attachment_size ?? 0}
          mime={m.attachment_mime ?? null}
        />
      )}
    </div>
  );
}

/* ── Componente de anexo: lazy-load da URL signed ── */
function Attachment({ path, name, size, mime }: {
  path: string; name: string; size: number; mime: string | null;
}) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    getApprovalAttachmentUrl(path).then(setUrl);
  }, [path]);

  const isImage = mime?.startsWith('image/');

  return (
    <a
      href={url ?? '#'}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-3 flex items-center gap-3 bg-white border border-steel-200 rounded-xl p-3 hover:bg-steel-50 transition group"
      onClick={e => { if (!url) e.preventDefault(); }}
    >
      {isImage && url ? (
        <img
          src={url}
          alt={name}
          className="h-14 w-14 rounded-lg object-cover bg-steel-100 shrink-0"
        />
      ) : (
        <div className="h-14 w-14 rounded-lg bg-steel-100 grid place-items-center text-2xl shrink-0">
          {fileIcon(mime)}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-sm text-steel-800 truncate">{name}</div>
        <div className="text-xs text-steel-500">{fmtFileSize(size)}</div>
      </div>
      <span className="text-brand-500 text-xs font-bold shrink-0 group-hover:underline">
        {url ? 'Abrir' : '…'}
      </span>
    </a>
  );
}

export { KIND_LABELS, KIND_ICONS };
