import { Logo } from '@/components/Logo';

/** Slogan da marca: o mesmo da assinatura dos e-mails (supabase/functions/_shared/brandSignature.ts) */
export const BRAND_SLOGAN = 'Tecnologia que conecta';

/** Assinatura da MecânicoApp (logo + slogan) no fim dos comunicados oficiais */
export function BrandSignature({ dark = false }: { dark?: boolean }) {
  return (
    <div className={`mt-3 pt-3 border-t flex items-center gap-2.5 ${dark ? 'border-steel-700' : 'border-steel-100'}`}>
      <Logo size={26} withText={false} light={dark} />
      <div className="leading-tight">
        <div className={`font-display font-bold text-[13px] tracking-tight ${dark ? 'text-white' : 'text-steel-900'}`}>
          Mecânico<span className="text-brand-500">App</span>
        </div>
        <div className={`text-[11px] ${dark ? 'text-steel-400' : 'text-steel-500'}`}>{BRAND_SLOGAN}</div>
      </div>
    </div>
  );
}
