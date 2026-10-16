type Size = 'sm' | 'md' | 'lg';

/**
 * Placa veicular estilizada no padrão Mercosul (faixa azul no topo, fundo claro).
 * Funciona com placas antigas (AAA-1234) e Mercosul (AAA1A23).
 */
export default function LicensePlate({
  plate,
  size = 'md',
  className = '',
}: { plate: string; size?: Size; className?: string }) {
  const clean = (plate || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const formatted =
    clean.length === 7 ? `${clean.slice(0, 3)}${clean.slice(3, 4)}${clean.slice(4)}` : clean;

  const display =
    formatted.length === 7
      ? `${formatted.slice(0, 3)}${formatted.slice(3, 4)}${formatted.slice(4)}`
      : formatted || 'S/PLACA';

  const sizes: Record<Size, { wrap: string; head: string; text: string }> = {
    sm: { wrap: 'w-[72px]',  head: 'text-[7px] py-[1px]',  text: 'text-[13px] py-0.5 tracking-[1px]' },
    md: { wrap: 'w-[96px]',  head: 'text-[8px] py-0.5',    text: 'text-base py-1 tracking-[1.5px]' },
    lg: { wrap: 'w-[120px]', head: 'text-[10px] py-0.5',   text: 'text-lg py-1.5 tracking-[2px]' },
  };

  const s = sizes[size];
  return (
    <div className={`shrink-0 ${s.wrap} ${className}`}>
      <div className={`rounded-t-md bg-gradient-to-b from-[#0a3d8f] to-[#0d4ea8] text-white text-center font-bold ${s.head}`}>
        BRASIL
      </div>
      <div
        className={`rounded-b-md bg-white text-center font-display font-extrabold text-steel-900 border border-t-0 border-steel-300 ${s.text}`}
        style={{ letterSpacing: undefined }}
      >
        {display}
      </div>
    </div>
  );
}
