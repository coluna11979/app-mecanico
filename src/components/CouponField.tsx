import { useEffect, useState } from 'react';
import { getAttribution, validateCoupon, type CouponInfo } from '@/lib/marketingAttribution';

/**
 * Campo opcional de cupom no cadastro. Já vem preenchido quando a pessoa
 * chegou por um link com ?cupom=. Avisa o pai só com cupom válido.
 */
export function CouponField({ audience, onValid }: {
  audience: 'mechanic' | 'workshop';
  onValid: (code: string | null) => void;
}) {
  const initial = getAttribution()?.coupon ?? '';
  const [open, setOpen] = useState(!!initial);
  const [code, setCode] = useState(initial);
  const [info, setInfo] = useState<CouponInfo | null>(null);
  const [state, setState] = useState<'idle' | 'checking' | 'ok' | 'invalid'>('idle');

  async function check(value = code) {
    const clean = value.trim().toUpperCase();
    if (!clean) { setState('idle'); setInfo(null); onValid(null); return; }
    setState('checking');
    const c = await validateCoupon(clean, audience);
    setInfo(c);
    setState(c ? 'ok' : 'invalid');
    onValid(c ? c.code : null);
  }

  useEffect(() => { if (initial) void check(initial); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-sm text-brand-600 font-semibold hover:underline min-h-[44px]">
        🎟️ Tenho um cupom
      </button>
    );
  }

  return (
    <div>
      <label className="label">Cupom (opcional)</label>
      <div className="flex gap-2">
        <input
          className="input uppercase"
          value={code}
          onChange={e => { setCode(e.target.value.toUpperCase()); setState('idle'); }}
          onBlur={() => void check()}
          placeholder="EX: BEMVINDO"
          maxLength={30}
        />
        <button type="button" className="btn-secondary shrink-0" onClick={() => void check()} disabled={state === 'checking'}>
          {state === 'checking' ? '…' : 'Aplicar'}
        </button>
      </div>
      {state === 'ok' && info && (
        <p className="text-sm text-signal-700 bg-signal-500/10 rounded-lg px-3 py-2 mt-2">✅ {info.description}</p>
      )}
      {state === 'invalid' && (
        <p className="text-xs text-alert-600 mt-1">Cupom inválido, vencido ou esgotado. O cadastro segue normalmente sem ele.</p>
      )}
    </div>
  );
}
