import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { getSetting } from '@/lib/settings';

interface PendingFees {
  total: number;
  count_jobs: number;
  job_ids: string[];
}

interface Props {
  workshopId: string | null;
  /** Disparado quando o usuário efetivamente paga as multas pendentes */
  onPaid?: () => void;
}

/**
 * Banner permanente no Dashboard da oficina que aparece quando há multas
 * pendentes de cancelamento. Bloqueia ações como publicar nova demanda
 * até que as multas sejam pagas. Provê fluxo de pagamento via Stripe.
 *
 * Use em conjunto com `usePendingFees` pra controlar o botão "+ Nova demanda".
 */
export function PendingFeesBanner({ workshopId, onPaid }: Props) {
  const [pending, setPending] = useState<PendingFees | null>(null);
  const [open, setOpen]       = useState(false);

  const loadPending = async () => {
    if (!workshopId) { setPending(null); return; }
    const { data } = await supabase.functions.invoke('pay-cancellation-fees', {
      body: { workshop_id: workshopId, action: 'check' },
    });
    if (data && data.total > 0) setPending(data as PendingFees);
    else setPending(null);
  };

  useEffect(() => { loadPending(); }, [workshopId]);

  if (!pending || pending.total <= 0) return null;

  return (
    <>
      <div className="bg-gradient-to-r from-alert-50 to-pending-50 border-2 border-alert-300 rounded-2xl p-4 mb-6 flex items-start gap-3">
        <div className="text-3xl shrink-0 animate-pulse">⚠️</div>
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-alert-700">
            Multa pendente: R$ {pending.total.toFixed(2)}
          </h3>
          <p className="text-sm text-steel-700 mt-1 leading-relaxed">
            Você tem {pending.count_jobs === 1 ? '1 cancelamento' : `${pending.count_jobs} cancelamentos`} com multa em aberto.
            Para publicar novas demandas, é necessário quitar.
          </p>
          <button
            onClick={() => setOpen(true)}
            className="btn-primary text-sm mt-3"
          >
            💳 Pagar multa agora
          </button>
        </div>
      </div>

      {open && (
        <PayFeeModal
          workshopId={workshopId!}
          pending={pending}
          onClose={() => setOpen(false)}
          onPaid={() => {
            setOpen(false);
            setPending(null);
            onPaid?.();
            loadPending();
          }}
        />
      )}
    </>
  );
}

/**
 * Hook helper: retorna se a oficina está bloqueada de criar novas demandas
 * por causa de multas pendentes. Use isso no botão "+ Nova demanda".
 */
export function usePendingFees(workshopId: string | null) {
  const [hasPending, setHasPending] = useState(false);

  useEffect(() => {
    if (!workshopId) { setHasPending(false); return; }
    supabase.functions.invoke('pay-cancellation-fees', {
      body: { workshop_id: workshopId, action: 'check' },
    }).then(({ data }) => {
      setHasPending(!!data && data.total > 0);
    });
  }, [workshopId]);

  return hasPending;
}

/* ──────────────── Modal de pagamento da multa ──────────────── */

function PayFeeModal({
  workshopId, pending, onClose, onPaid,
}: {
  workshopId: string;
  pending: PendingFees;
  onClose: () => void;
  onPaid: () => void;
}) {
  const [stripe, setStripe]           = useState<any>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [loading, setLoading]         = useState(true);
  const [processing, setProcessing]   = useState(false);
  const [success, setSuccess]         = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const cardDivRef = useRef<HTMLDivElement>(null);
  const cardElRef  = useRef<any>(null);

  // Carrega Stripe.js
  useEffect(() => {
    (async () => {
      const envKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string;
      const key = envKey || await getSetting('stripe_publishable_key', '');
      if (!key) return;
      const { loadStripe } = await import('@stripe/stripe-js');
      const s = await loadStripe(key);
      setStripe(s);
    })();
  }, []);

  // Cria PaymentIntent
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.functions.invoke('pay-cancellation-fees', {
        body: { workshop_id: workshopId, action: 'create_payment_intent' },
      });
      if (error || data?.error) {
        setError(data?.error ?? error?.message ?? 'Erro ao preparar pagamento');
        setLoading(false);
        return;
      }
      setClientSecret(data?.client_secret ?? null);
      setLoading(false);
    })();
  }, [workshopId]);

  // Monta Card Element
  useEffect(() => {
    if (!stripe || !clientSecret || cardElRef.current) return;
    const tryMount = () => {
      if (!cardDivRef.current) { requestAnimationFrame(tryMount); return; }
      const el = stripe.elements().create('card', {
        hidePostalCode: true,
        style: {
          base: { fontSize: '16px', fontFamily: 'system-ui, sans-serif', color: '#111827' },
          invalid: { color: '#ef4444' },
        },
      });
      el.mount(cardDivRef.current);
      cardElRef.current = el;
    };
    requestAnimationFrame(tryMount);
  }, [stripe, clientSecret]);

  async function pay() {
    if (!stripe || !cardElRef.current || !clientSecret) return;
    setProcessing(true);
    setError(null);

    const { error, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
      payment_method: { card: cardElRef.current },
    });

    if (error) {
      setError(error.message ?? 'Erro no pagamento.');
      setProcessing(false);
      return;
    }

    if (paymentIntent?.status === 'succeeded') {
      // Marca como pago via edge function (webhook tb fará isso, mas aceleramos)
      await supabase.functions.invoke('pay-cancellation-fees', {
        body: { workshop_id: workshopId, action: 'mark_paid' },
      });
      setSuccess(true);
      setProcessing(false);
      setTimeout(onPaid, 1500);
    }
  }

  return (
    <div className="fixed inset-0 bg-steel-900/85 grid place-items-center p-4 z-[60]" onClick={() => !processing && onClose()}>
      <div onClick={e => e.stopPropagation()} className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
        <div className="flex items-start gap-3">
          <span className="text-3xl shrink-0">💳</span>
          <div className="flex-1">
            <h3 className="text-xl font-bold text-steel-900">Pagar multa de cancelamento</h3>
            <p className="text-sm text-steel-600 mt-1">
              {pending.count_jobs === 1
                ? '1 cancelamento com multa em aberto'
                : `${pending.count_jobs} cancelamentos com multa em aberto`}
            </p>
          </div>
        </div>

        <div className="bg-alert-50 border border-alert-200 rounded-2xl px-4 py-3 text-center">
          <div className="text-xs text-alert-600 uppercase tracking-widest font-bold">Total a pagar</div>
          <div className="text-3xl font-bold font-display text-alert-700 mt-1">
            R$ {pending.total.toFixed(2)}
          </div>
        </div>

        {success ? (
          <div className="bg-signal-500/10 rounded-2xl p-6 text-center">
            <div className="text-5xl">✅</div>
            <p className="text-lg font-bold text-signal-700 mt-2">Multa quitada!</p>
            <p className="text-sm text-signal-600 mt-1">Agora você pode publicar novas demandas.</p>
          </div>
        ) : (
          <>
            <div>
              <label className="text-xs font-bold text-steel-500 uppercase tracking-widest mb-2 block">
                Dados do cartão
              </label>
              <div className="relative">
                <div
                  ref={cardDivRef}
                  className="border border-steel-300 rounded-xl px-4 py-3.5 bg-white min-h-[52px]"
                />
                {(loading || !cardElRef.current) && (
                  <div className="absolute inset-0 bg-white/95 rounded-xl flex items-center justify-center gap-2 pointer-events-none">
                    <div className="h-4 w-4 rounded-full border-2 border-brand-500 border-t-transparent animate-spin" />
                    <p className="text-sm text-steel-500">Preparando…</p>
                  </div>
                )}
              </div>
            </div>

            {error && (
              <div className="text-sm text-alert-600 bg-alert-50 rounded-lg px-3 py-2">
                ⚠️ {error}
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={onClose}
                disabled={processing}
                className="btn-ghost flex-1"
              >
                Voltar
              </button>
              <button
                onClick={pay}
                disabled={processing || loading}
                className="btn-primary flex-[2] disabled:opacity-50"
              >
                {processing ? 'Processando…' : `Pagar R$ ${pending.total.toFixed(2)}`}
              </button>
            </div>

            <p className="text-[11px] text-steel-400 text-center">
              🔒 Pagamento seguro processado pela Stripe
            </p>
          </>
        )}
      </div>
    </div>
  );
}
