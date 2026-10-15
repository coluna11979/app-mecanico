import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { formatBRL } from '@/lib/payment';

type Method = 'pix' | 'card';
type ChargeResult = {
  method: Method; total: number; card_fee: number;
  pix_code?: string; expires_at?: string | null; payment_url?: string | null;
  error?: string;
};

/**
 * Pagamento da demanda pela NextPay (gateway = nextpay em Configurações).
 * PIX em primeiro ("cai na hora"); cartão abre o checkout seguro da NextPay em outra aba.
 * Quem libera o serviço é o webhook (jobs.pix_paid_at) — a tela de acompanhamento fecha este
 * modal sozinha quando o pagamento cai.
 */
export default function NextpayPayment({ jobId, service, feePassthrough, feePercent }: {
  jobId: string;
  /** Valor fechado do serviço (valor/hora × horas) */
  service: number;
  /** Cobrar a taxa do cartão da oficina (senão: "por nossa conta no lançamento") */
  feePassthrough: boolean;
  feePercent: number;
}) {
  const [method, setMethod] = useState<Method>('pix');
  const [results, setResults] = useState<Partial<Record<Method, ChargeResult>>>({});
  const [loading, setLoading] = useState<Method | null>(null);
  const [copied, setCopied] = useState(false);

  const current = results[method];

  async function load(m: Method, force = false) {
    if (loading || (!force && results[m] && !results[m]!.error)) return;
    setLoading(m);
    const { data, error } = await supabase.functions.invoke('nextpay-charge', { body: { job_id: jobId, method: m } });
    let res = data as ChargeResult | null;
    if (error) {
      // Erro HTTP: a função devolve { error } no corpo
      const body = await (error as { context?: Response }).context?.json?.().catch(() => null);
      res = { method: m, total: service, card_fee: 0, error: body?.error ?? 'Não foi possível gerar o pagamento. Tente de novo.' };
    }
    setResults(r => ({ ...r, [m]: res ?? { method: m, total: service, card_fee: 0, error: 'Sem resposta. Tente de novo.' } }));
    setLoading(null);
  }

  // Gera o pagamento do método escolhido (o do cartão já fica pronto para abrir com um toque)
  useEffect(() => { load(method); }, [method]); // eslint-disable-line react-hooks/exhaustive-deps

  function copy() {
    if (!current?.pix_code) return;
    navigator.clipboard.writeText(current.pix_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  const cardTotal = feePassthrough ? Math.round((service / (1 - feePercent / 100)) * 100) / 100 : service;
  const pctLabel = String(feePercent).replace('.', ',');

  const option = (m: Method, title: string, sub: string, badge?: string) => (
    <button type="button" onClick={() => setMethod(m)}
      className={`w-full text-left rounded-2xl border-2 px-4 py-3 min-h-[56px] transition touch-manipulation ${
        method === m ? 'border-brand-500 bg-brand-50' : 'border-steel-200 bg-white hover:border-steel-300'}`}>
      <div className="flex items-center gap-2">
        <span className={`h-4 w-4 rounded-full border-2 shrink-0 ${method === m ? 'border-brand-500 bg-brand-500 shadow-[inset_0_0_0_2px_white]' : 'border-steel-300'}`} />
        <span className="font-bold text-steel-900">{title}</span>
        {badge && <span className="text-[10px] font-bold uppercase tracking-wider bg-signal-100 text-signal-700 rounded-full px-2 py-0.5">{badge}</span>}
      </div>
      <div className="text-xs text-steel-500 mt-0.5 pl-6">{sub}</div>
    </button>
  );

  const spinner = (text: string) => (
    <div className="flex flex-col items-center gap-3 py-6">
      <div className="h-10 w-10 rounded-full border-4 border-brand-500 border-t-transparent animate-spin" />
      <p className="text-sm text-steel-500">{text}</p>
    </div>
  );

  const failed = (m: Method) => (
    <div className="bg-alert-50 rounded-2xl p-4 text-center space-y-2">
      <p className="text-sm text-alert-700">⚠️ {results[m]?.error}</p>
      <button onClick={() => load(m, true)} className="btn-secondary !py-2 text-sm">Tentar de novo</button>
    </div>
  );

  const waiting = (
    <div className="flex items-center justify-center gap-2 text-xs text-steel-500">
      <span className="h-2 w-2 rounded-full bg-brand-500 animate-pulse" />
      Aguardando o pagamento — a tela atualiza sozinha.
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {option('pix', 'PIX', 'Cai na hora, sem taxa', 'Recomendado')}
        {option('card', 'Cartão de crédito', feePassthrough
          ? `À vista · taxa do cartão de ${pctLabel}% · total R$ ${formatBRL(cardTotal)}`
          : 'À vista · taxa do cartão por nossa conta no lançamento 🎉')}
      </div>

      {method === 'pix' && (
        loading === 'pix' ? spinner('Gerando o PIX…')
        : current?.error ? failed('pix')
        : current?.pix_code ? (
          <div className="space-y-3">
            <div className="bg-steel-50 rounded-2xl p-4 space-y-2">
              <div className="text-xs text-steel-500 uppercase tracking-widest font-bold">PIX Copia e Cola</div>
              <div className="bg-white border border-steel-200 rounded-xl px-3 py-2">
                <p className="text-[11px] text-steel-600 font-mono break-all leading-relaxed line-clamp-3">{current.pix_code}</p>
              </div>
              <button onClick={copy} className="btn-primary w-full !py-3 touch-manipulation">
                {copied ? '✅ Copiado!' : '📋 Copiar código PIX'}
              </button>
              {current.payment_url && (
                <a href={current.payment_url} target="_blank" rel="noopener noreferrer"
                  className="block text-center text-sm font-semibold text-brand-600 hover:underline py-1">
                  Ver QR Code para ler com o celular
                </a>
              )}
            </div>
            {current.expires_at && (
              <p className="text-xs text-steel-400 text-center">
                ⏱ Vale até {new Date(current.expires_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
              </p>
            )}
            {waiting}
          </div>
        ) : null
      )}

      {method === 'card' && (
        loading === 'card' ? spinner('Preparando o pagamento seguro…')
        : current?.error ? failed('card')
        : current?.payment_url ? (
          <div className="space-y-3">
            {feePassthrough ? (
              <div className="bg-steel-50 rounded-2xl p-4 text-sm space-y-1">
                <div className="flex justify-between"><span className="text-steel-600">Serviço</span><span className="font-semibold">R$ {formatBRL(service)}</span></div>
                <div className="flex justify-between"><span className="text-steel-600">Taxa do cartão ({pctLabel}%)</span><span className="font-semibold">R$ {formatBRL(current.card_fee)}</span></div>
                <div className="flex justify-between border-t border-steel-200 pt-1 mt-1"><span className="font-bold">Total no cartão</span><span className="font-bold">R$ {formatBRL(current.total)}</span></div>
                <p className="text-[11px] text-steel-500 pt-1">No PIX você paga só R$ {formatBRL(service)}.</p>
              </div>
            ) : (
              <div className="bg-signal-500/10 rounded-2xl px-4 py-3 text-center">
                <p className="text-sm font-semibold text-signal-700">🎉 Taxa do cartão por nossa conta no lançamento</p>
                <p className="text-xs text-signal-600 mt-0.5">Você paga só o valor do serviço.</p>
              </div>
            )}
            <a href={current.payment_url} target="_blank" rel="noopener noreferrer"
              className="btn-primary w-full touch-manipulation text-center block">
              Pagar R$ {formatBRL(current.total)} com cartão
            </a>
            <p className="text-[11px] text-steel-500 text-center">
              🔒 Abre a página segura de pagamento em outra aba. Depois de pagar, volte aqui.
            </p>
            {waiting}
          </div>
        ) : null
      )}
    </div>
  );
}
