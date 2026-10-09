import { ReactNode, useState } from 'react';
import SendWhatsAppModal from '@/components/os/SendWhatsAppModal';
import { waNumber } from '@/components/os/osHelpers';
import { useInboxSender } from '@/lib/inbox';

/**
 * Botão "mandar no WhatsApp" das telas (agenda, check-up, cobrança…).
 * Inbox ligado e conectado → abre a janela de envio pelo número da oficina (texto editável);
 * senão é o link wa.me de sempre.
 */
export default function WhatsAppButton({ phone, text = '', customerId, customerName, title, className, onSent, children }: {
  phone: string | null | undefined; text?: string;
  customerId?: string | null; customerName?: string | null; title?: string;
  className?: string; onSent?: () => void; children: ReactNode;
}) {
  const inbox = useInboxSender();
  const [open, setOpen] = useState(false);
  const wa = waNumber(phone);

  if (!inbox.ready) {
    const href = `https://wa.me/${wa ?? ''}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
    return <a href={href} target="_blank" rel="noopener noreferrer" className={className} onClick={onSent}>{children}</a>;
  }

  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>{children}</button>
      {open && (
        <SendWhatsAppModal
          phone={phone}
          messages={[{ key: 'msg', label: 'Mensagem', text }]}
          customerId={customerId}
          customerName={customerName}
          title={title}
          onClose={() => setOpen(false)}
          onSent={() => onSent?.()}
        />
      )}
    </>
  );
}
