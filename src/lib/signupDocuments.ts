// Documentos pedidos no fim do cadastro ("Finalize seu cadastro").
// Cada arquivo enviado vira uma mensagem no histórico (approval_messages) com doc_type;
// um "Solicitar docs" do admin com doc_type faz aquele documento voltar a ser pedido.
import type { ApprovalMessage, DocType } from '@/types/database';

export type { DocType };
export type SignupRole = 'mechanic' | 'workshop';

export type DocSlot = { type: DocType; label: string; hint: string; icon: string };

const SAME_PDF = 'CNH digital em PDF? Envie o mesmo arquivo da frente.';
const ADDRESS_HINT = 'Conta de luz, água, internet ou gás dos últimos 90 dias';

const MECHANIC_SLOTS: DocSlot[] = [
  { type: 'id_front',      label: 'CNH ou RG, frente',       hint: 'Foto nítida, sem reflexo e com os dados legíveis', icon: '🪪' },
  { type: 'id_back',       label: 'CNH ou RG, verso',        hint: SAME_PDF, icon: '🪪' },
  { type: 'address_proof', label: 'Comprovante de endereço', hint: ADDRESS_HINT, icon: '🏠' },
];

const WORKSHOP_SLOTS: DocSlot[] = [
  { type: 'cnpj_card',     label: 'Cartão CNPJ',                        hint: 'Pode ser o PDF emitido no site da Receita Federal', icon: '🏢' },
  { type: 'id_front',      label: 'Documento do responsável, frente',   hint: 'CNH ou RG de quem responde pela oficina', icon: '🪪' },
  { type: 'id_back',       label: 'Documento do responsável, verso',    hint: SAME_PDF, icon: '🪪' },
  { type: 'address_proof', label: 'Comprovante de endereço da oficina', hint: ADDRESS_HINT, icon: '🏠' },
];

export function docSlotsFor(role: SignupRole): DocSlot[] {
  return role === 'workshop' ? WORKSHOP_SLOTS : MECHANIC_SLOTS;
}

export function docLabel(role: SignupRole, type: DocType): string {
  return docSlotsFor(role).find(s => s.type === type)?.label ?? type;
}

export type DocState =
  | { status: 'missing' }
  | { status: 'sent'; upload: ApprovalMessage }
  | { status: 'rejected'; reason: string; upload?: ApprovalMessage };

const time = (m: ApprovalMessage) => new Date(m.created_at).getTime();

function latest(msgs: ApprovalMessage[], pick: (m: ApprovalMessage) => boolean): ApprovalMessage | undefined {
  let best: ApprovalMessage | undefined;
  for (const m of msgs) if (pick(m) && (!best || time(m) >= time(best))) best = m;
  return best;
}

/**
 * Situação de cada documento:
 *  - enviado: o último arquivo do próprio cadastrado com esse doc_type
 *  - recusado: o admin pediu esse documento de novo DEPOIS do último envio (ou sem envio)
 *  - faltando: nada enviado
 */
export function docStates(slots: DocSlot[], msgs: ApprovalMessage[]): Record<DocType, DocState> {
  const out = {} as Record<DocType, DocState>;
  for (const s of slots) {
    const upload = latest(msgs, m =>
      m.doc_type === s.type && m.sender_role === 'user' && !!m.attachment_path);
    const reject = latest(msgs, m =>
      m.doc_type === s.type && m.sender_role === 'admin' && m.kind === 'request_documents');
    if (reject && (!upload || time(reject) > time(upload))) {
      out[s.type] = { status: 'rejected', reason: reject.content, upload };
    } else if (upload) {
      out[s.type] = { status: 'sent', upload };
    } else {
      out[s.type] = { status: 'missing' };
    }
  }
  return out;
}

export type DocsSummary = {
  done: number;
  total: number;
  rejected: number;
  complete: boolean;
  /** Documentos que ainda faltam (ou precisam ser reenviados), na ordem da lista */
  pending: DocSlot[];
};

export function docsSummary(slots: DocSlot[], states: Record<DocType, DocState>): DocsSummary {
  const pending = slots.filter(s => states[s.type]?.status !== 'sent');
  const rejected = slots.filter(s => states[s.type]?.status === 'rejected').length;
  const done = slots.length - pending.length;
  return { done, total: slots.length, rejected, complete: pending.length === 0, pending };
}

/** Atalho: resumo direto das mensagens de um cadastro */
export function summarizeDocs(role: SignupRole, msgs: ApprovalMessage[]): DocsSummary {
  const slots = docSlotsFor(role);
  return docsSummary(slots, docStates(slots, msgs));
}

/** "o verso da CNH ou RG e o comprovante de endereço" — para avisos de "falta enviar" */
export function joinLabels(labels: string[]): string {
  // Só baixa a inicial de palavra comum ("Comprovante" → "comprovante"); sigla fica ("CNH")
  const l = labels.map(s => (/^\p{Lu}\p{Ll}/u.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s));
  if (l.length <= 1) return l.join('');
  return `${l.slice(0, -1).join(', ')} e ${l[l.length - 1]}`;
}
