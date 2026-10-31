import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import WorkshopLayout from '@/components/layout/WorkshopLayout';
import NextpayPayment from '@/components/payment/NextpayPayment';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { getSetting } from '@/lib/settings';
import { formatBRL } from '@/lib/payment';
import { KIND_LABEL, useWallet, type WalletEntry } from '@/lib/wallet';

const PRESETS = [300, 500, 1000];

/**
 * Carteira da oficina: saldo, depósito (PIX/cartão pela NextPay) e extrato.
 * Depositar só acontece aqui — na chegada do mecânico aparece apenas "Pagar com saldo".
 */
export default function Carteira() {
  const { currentWorkshop } = useAuth();
  const shopId = currentWorkshop?.id ?? null;
  const { cfg, balance, enabled } = useWallet(shopId);

  const [entries, setEntries] = useState<WalletEntry[] | null>(null);
  const [preset, setPreset] = useState<number | 'outro'>(500);
  const [other, setOther] = useState('');
  const [paying, setPaying] = useState<number | null>(null);   // valor do depósito em andamento
  const [justPaid, setJustPaid] = useState<number | null>(null);
  const [feeCfg, setFeeCfg] = useState({ passthrough: false, percent: 4.2 });
  const startedAt = useRef<string | null>(null);

  useEffect(() => {
    Promise.all([getSetting('card_fee_passthrough', 'false'), getSetting('card_fee_percent', '4.20')])
      .then(([p, pct]) => setFeeCfg({ passthrough: p === 'true', percent: Number(pct.replace(',', '.')) || 0 }));
  }, []);

  // Extrato: recarrega a cada movimento (o saldo do useWallet muda junto)
  useEffect(() => {
    if (!shopId || !enabled) return;
    supabase.from('workshop_wallet_entries').select('*').eq('workshop_id', shopId)
      .order('created_at', { ascending: false }).limit(100)
      .then(({ data }) => {
        const list = (data ?? []) as WalletEntry[];
        setEntries(list);
        // Depósito em andamento caiu → fecha o pagamento e comemora
        if (startedAt.current && list.some(e => e.kind === 'deposit' && e.created_at > startedAt.current!)) {
          setJustPaid(paying);
          setPaying(null);
          startedAt.current = null;
        }
      });
  }, [shopId, enabled, balance?.total]); // eslint-disable-line react-hooks/exhaustive-deps

  const min = cfg?.minDeposit ?? 50;
  const amount = preset === 'outro' ? Number(other.replace(/\./g, '').replace(',', '.')) || 0 : preset;
  const amountOk = amount >= min;

  function startDeposit() {
    if (!amountOk) return;
    setJustPaid(null);
    startedAt.current = new Date(Date.now() - 5_000).toISOString();
    setPaying(amount);
  }

  if (cfg && !enabled) {
    return (
      <WorkshopLayout>
        <h1 className="text-3xl font-bold tracking-tight text-steel-900 mb-4">Carteira</h1>
        <div className="card max-w-xl text-steel-600">A carteira ainda não está disponível.</div>
      </WorkshopLayout>
    );
  }

  const low = balance && cfg && balance.total < cfg.lowBalance;

  return (
    <WorkshopLayout>
      <div className="max-w-2xl space-y-5">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-steel-900">Carteira</h1>
          <p className="text-sm text-steel-500 mt-1">Deixe saldo aqui e pague as demandas com um toque quando o mecânico chegar.</p>
        </div>

        {/* Saldo */}
        <div className="rounded-2xl bg-steel-900 text-white p-5 space-y-3">
          <div className="text-xs uppercase tracking-widest text-steel-400 font-bold">Saldo disponível</div>
          <div className="text-4xl font-bold font-display">
            {balance ? `R$ ${formatBRL(balance.total)}` : <span className="inline-block h-9 w-40 rounded-lg bg-white/10 animate-pulse" />}
          </div>
          {balance && balance.credit > 0 && (
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-xl bg-white/[0.06] px-3 py-2">
                <div className="text-[11px] text-steel-400">Seu dinheiro</div>
                <div className="font-semibold">R$ {formatBRL(balance.cash)}</div>
              </div>
              <div className="rounded-xl bg-white/[0.06] px-3 py-2">
                <div className="text-[11px] text-steel-400">🎁 Crédito da plataforma</div>
                <div className="font-semibold">R$ {formatBRL(balance.credit)}</div>
              </div>
            </div>
          )}
          {low && (
            <p className="text-xs text-pending-300">Saldo baixo: deposite para pagar as próximas demandas com um toque.</p>
          )}
        </div>

        {justPaid !== null && (
          <div className="rounded-2xl bg-signal-500/10 border border-signal-300 px-4 py-3 text-sm font-semibold text-signal-700">
            ✅ Depósito confirmado{justPaid ? `: R$ ${formatBRL(justPaid)} na sua carteira` : ''}.
          </div>
        )}

        {/* Depositar */}
        <div className="card space-y-4">
          <h2 className="text-lg font-bold text-steel-900">Depositar</h2>
          {paying === null ? (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {PRESETS.map(v => (
                  <button key={v} type="button" onClick={() => setPreset(v)}
                    className={`min-h-[48px] rounded-xl border-2 font-bold transition touch-manipulation ${
                      preset === v ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-steel-200 text-steel-700 hover:border-steel-300'}`}>
                    R$ {formatBRL(v, { decimals: 0 })}
                  </button>
                ))}
                <button type="button" onClick={() => setPreset('outro')}
                  className={`min-h-[48px] rounded-xl border-2 font-bold transition touch-manipulation ${
                    preset === 'outro' ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-steel-200 text-steel-700 hover:border-steel-300'}`}>
                  Outro valor
                </button>
              </div>
              {preset === 'outro' && (
                <div>
                  <label className="text-xs font-semibold text-steel-500 uppercase tracking-wider mb-1 block">Valor (R$)</label>
                  <input className="input" inputMode="decimal" placeholder={`Mínimo ${formatBRL(min, { decimals: 0 })}`} autoFocus
                    value={other} onChange={e => setOther(e.target.value.replace(/[^\d,.]/g, ''))} />
                </div>
              )}
              {!amountOk && preset === 'outro' && other && (
                <p className="text-xs text-alert-700">O depósito mínimo é R$ {formatBRL(min)}.</p>
              )}
              <button onClick={startDeposit} disabled={!amountOk} className="btn-primary w-full touch-manipulation disabled:opacity-50">
                Depositar {amountOk ? `R$ ${formatBRL(amount)}` : ''}
              </button>
            </>
          ) : shopId && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-sm text-steel-600">Depósito de <span className="font-bold text-steel-900">R$ {formatBRL(paying)}</span></div>
                <button onClick={() => { setPaying(null); startedAt.current = null; }} className="text-sm font-semibold text-steel-500 hover:text-steel-800">Trocar valor</button>
              </div>
              <NextpayPayment key={paying} request={{ fn: 'wallet-deposit', body: { workshop_id: shopId, amount: paying } }}
                service={paying} feePassthrough={feeCfg.passthrough} feePercent={feeCfg.percent} />
            </div>
          )}
        </div>

        {/* Extrato */}
        <div className="card space-y-1">
          <h2 className="text-lg font-bold text-steel-900 mb-2">Extrato</h2>
          {entries === null ? (
            <div className="space-y-2">{[0, 1, 2].map(i => <div key={i} className="h-12 rounded-xl bg-steel-100 animate-pulse" />)}</div>
          ) : entries.length === 0 ? (
            <p className="text-sm text-steel-500 py-4 text-center">Nenhuma movimentação ainda.</p>
          ) : (
            <ul className="divide-y divide-steel-100">
              {entries.map(e => {
                const k = KIND_LABEL[e.kind];
                const amt = Number(e.amount);
                return (
                  <li key={e.id} className="flex items-center gap-3 py-3">
                    <span className="h-9 w-9 rounded-full bg-steel-100 grid place-items-center shrink-0">{k.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-steel-900 flex items-center gap-1.5">
                        {k.label}
                        {e.bucket === 'credit' && <span className="text-[10px] font-bold uppercase tracking-wider bg-brand-50 text-brand-700 rounded-full px-1.5 py-0.5">crédito</span>}
                      </div>
                      <div className="text-xs text-steel-500 truncate">
                        {e.job_id ? <Link to={`/oficina/job/${e.job_id}/tracking`} className="hover:underline">{e.note ?? 'Demanda'}</Link> : e.note}
                        {' · '}{new Date(e.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                    <span className={`text-sm font-bold tabular-nums shrink-0 ${amt > 0 ? 'text-signal-700' : 'text-steel-900'}`}>
                      {amt > 0 ? '+' : '−'} R$ {formatBRL(Math.abs(amt))}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="text-xs text-steel-500 space-y-1 px-1 pb-4">
          <p>• Quando o mecânico chegar, a opção <b>Pagar com saldo</b> aparece no pagamento.</p>
          <p>• Cancelamentos com estorno voltam para a carteira na hora.</p>
          <p>• O crédito da plataforma vale só para demandas. Para receber de volta o seu dinheiro, fale com o suporte.</p>
        </div>
      </div>
    </WorkshopLayout>
  );
}
