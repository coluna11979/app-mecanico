import { useState } from 'react';
import { Link } from 'react-router-dom';
import { formatBRL } from '@/lib/payment';
import { useWallet } from '@/lib/wallet';

const LS_INTRO = 'carteira_novidade_fechada';
const readLS = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const writeLS = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* sem storage */ } };

/**
 * Avisos da carteira no painel da oficina (nunca no pagamento):
 * saldo baixo, ou a novidade para quem ainda não usou (pode fechar).
 */
export default function WalletBanner({ workshopId, className = '' }: { workshopId: string | null; className?: string }) {
  const { cfg, balance, enabled } = useWallet(workshopId);
  const [introClosed, setIntroClosed] = useState(() => readLS(LS_INTRO) === '1');
  if (!enabled || !balance || !cfg) return null;

  if (balance.total > 0 && balance.total < cfg.lowBalance) {
    return (
      <Link to="/oficina/carteira"
        className={`flex items-center gap-3 rounded-2xl border border-pending-300 bg-pending-500/10 px-4 py-3 ${className}`}>
        <span className="text-xl">💰</span>
        <span className="flex-1 text-sm text-steel-800">
          Seu saldo está em <b>R$ {formatBRL(balance.total)}</b>. Deposite para pagar as próximas demandas com um toque.
        </span>
        <span className="text-sm font-bold text-brand-600 shrink-0">Depositar</span>
      </Link>
    );
  }

  if (balance.total === 0 && !introClosed) {
    return (
      <div className={`flex items-start gap-3 rounded-2xl border border-brand-200 bg-brand-50 px-4 py-3 ${className}`}>
        <span className="text-xl">💰</span>
        <div className="flex-1 text-sm text-steel-800">
          <b>Novidade: carteira da oficina.</b> Deixe saldo e, quando o mecânico chegar, pague com um toque, sem PIX ou cartão na hora.{' '}
          <Link to="/oficina/carteira" className="font-bold text-brand-600 hover:underline">Conhecer</Link>
        </div>
        <button onClick={() => { writeLS(LS_INTRO, '1'); setIntroClosed(true); }} aria-label="Fechar aviso"
          className="h-8 w-8 -mr-1 -mt-1 grid place-items-center rounded-lg text-steel-400 hover:bg-white shrink-0">✕</button>
      </div>
    );
  }

  return null;
}
