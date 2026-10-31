import { useNavigate } from 'react-router-dom';
import { formatBRL } from '@/lib/payment';

/** Saldo da carteira no topo do painel; leva para a Carteira */
export default function WalletChip({ total, compact, light }: { total: number; compact?: boolean; light?: boolean }) {
  const nav = useNavigate();
  if (compact) {
    return (
      <button onClick={() => nav('/oficina/carteira')} aria-label={`Carteira: R$ ${formatBRL(total)}`}
        className="shrink-0 h-9 px-2.5 rounded-xl bg-signal-500/10 text-signal-700 text-xs font-bold tabular-nums flex items-center gap-1 active:bg-signal-500/20">
        💰 R$ {formatBRL(total, { decimals: total >= 1000 ? 0 : 2 })}
      </button>
    );
  }
  return (
    <button onClick={() => nav('/oficina/carteira')} title="Abrir a carteira"
      className={`w-full h-9 px-3 rounded-lg flex items-center gap-2 text-[13px] transition ${
        light ? 'bg-signal-500/10 text-signal-700 hover:bg-signal-500/15' : 'bg-white/[0.05] text-steel-300 hover:bg-white/[0.08] hover:text-white'}`}>
      <span>💰</span>
      <span className="flex-1 text-left">Saldo</span>
      <span className="font-bold tabular-nums">R$ {formatBRL(total)}</span>
    </button>
  );
}
