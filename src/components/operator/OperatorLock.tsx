import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Logo } from '@/components/Logo';
import { ROLES, ROLE_ORDER, useOperator, type OperatorRole, type WorkshopOperator } from '@/lib/operators';

/** Tela de bloqueio do modo balcão: escolhe quem vai operar, a função e digita o PIN. */
export default function OperatorLock() {
  const { currentWorkshop, signOut } = useAuth();
  const { login, exitBalcao } = useOperator();
  const nav = useNavigate();
  const wid = currentWorkshop?.id ?? null;

  const [ops, setOps]         = useState<WorkshopOperator[] | null>(null);
  const [picked, setPicked]   = useState<WorkshopOperator | null>(null);
  const [role, setRole]       = useState<OperatorRole | null>(null);
  const [pin, setPin]         = useState('');
  const [error, setError]     = useState<string | null>(null);
  const [busy, setBusy]       = useState(false);

  useEffect(() => {
    if (!wid) return;
    supabase.from('workshop_operators').select('*')
      .eq('workshop_id', wid).eq('active', true).eq('has_pin', true).order('is_owner', { ascending: false }).order('name')
      .then(({ data }) => setOps(((data as WorkshopOperator[]) ?? []).filter(o => o.roles.length > 0)));
  }, [wid]);

  function pick(o: WorkshopOperator) {
    setPicked(o);
    setRole(ROLE_ORDER.find(r => o.roles.includes(r)) ?? null);
    setPin(''); setError(null);
  }

  async function submit() {
    if (!picked || !role || pin.length < 4 || busy) return;
    setBusy(true); setError(null);
    const err = await login(picked.id, pin, role);
    setBusy(false);
    if (err) { setError(err); setPin(''); return; }
    nav(ROLES[role].home);
  }

  function press(d: string) {
    setError(null);
    setPin(p => (p.length >= 6 ? p : p + d));
  }

  /* Teclado físico também funciona */
  useEffect(() => {
    if (!picked) return;
    const onKey = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') setPin(p => p.slice(0, -1));
      else if (e.key === 'Enter') submit();
      else if (e.key === 'Escape') setPicked(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  async function leaveAccount() {
    await exitBalcao();
    await signOut();
    nav('/login');
  }

  return (
    <div className="fixed inset-0 z-[90] bg-steel-900 text-white overflow-y-auto">
      <div className="min-h-full flex flex-col items-center px-4 py-8">
        <Logo light />
        <div className="mt-2 text-sm text-steel-400">{currentWorkshop?.business_name}</div>

        {!picked ? (
          <div className="w-full max-w-2xl mt-10">
            <h1 className="text-2xl font-bold text-center">Quem vai usar o sistema?</h1>
            <p className="text-sm text-steel-400 text-center mt-1">Toque no seu nome e digite o seu PIN.</p>

            {ops === null ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-8">
                {[1, 2, 3].map(i => <div key={i} className="h-32 rounded-2xl bg-steel-800 animate-pulse" />)}
              </div>
            ) : ops.length === 0 ? (
              <div className="text-center text-steel-400 mt-10 text-sm">
                Nenhum colaborador com PIN cadastrado.<br />Saia da conta e entre com a senha da oficina para configurar os acessos.
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-8">
                {ops.map(o => (
                  <button key={o.id} onClick={() => pick(o)}
                    className="rounded-2xl bg-steel-800 hover:bg-steel-700 transition p-4 flex flex-col items-center gap-2 text-center">
                    <div className="h-14 w-14 rounded-full bg-brand-500 grid place-items-center font-bold text-xl">
                      {o.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="font-semibold leading-tight">{o.name}</div>
                    <div className="text-[11px] text-steel-400">
                      {ROLE_ORDER.filter(r => o.roles.includes(r)).map(r => ROLES[r].label).join(' · ')}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="w-full max-w-sm mt-10">
            <button onClick={() => setPicked(null)} className="text-sm text-steel-400 hover:text-white">← Trocar pessoa</button>
            <div className="text-center mt-4">
              <div className="h-16 w-16 mx-auto rounded-full bg-brand-500 grid place-items-center font-bold text-2xl">
                {picked.name.charAt(0).toUpperCase()}
              </div>
              <div className="text-xl font-bold mt-2">{picked.name}</div>
            </div>

            {picked.roles.length > 1 && (
              <div className="mt-5">
                <div className="text-xs text-steel-400 text-center mb-2">Entrar como</div>
                <div className="flex flex-wrap justify-center gap-2">
                  {ROLE_ORDER.filter(r => picked.roles.includes(r)).map(r => (
                    <button key={r} onClick={() => setRole(r)}
                      className={`px-3.5 py-2 rounded-full text-sm font-semibold border transition ${
                        role === r ? 'bg-brand-500 border-brand-500' : 'border-steel-600 text-steel-300 hover:border-steel-400'}`}>
                      {ROLES[r].icon} {ROLES[r].label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-center gap-3 mt-6 h-4">
              {Array.from({ length: Math.max(4, pin.length) }).map((_, i) => (
                <span key={i} className={`h-3.5 w-3.5 rounded-full ${i < pin.length ? 'bg-white' : 'bg-steel-700'}`} />
              ))}
            </div>
            <div className="h-6 mt-3 text-center text-sm text-alert-300">{error}</div>

            <div className="grid grid-cols-3 gap-3 mt-2">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(d => (
                <button key={d} onClick={() => press(d)}
                  className="h-16 rounded-2xl bg-steel-800 hover:bg-steel-700 active:bg-steel-600 text-2xl font-semibold transition">{d}</button>
              ))}
              <button onClick={() => setPin(p => p.slice(0, -1))} aria-label="Apagar"
                className="h-16 rounded-2xl text-steel-400 hover:text-white text-xl">⌫</button>
              <button onClick={() => press('0')}
                className="h-16 rounded-2xl bg-steel-800 hover:bg-steel-700 active:bg-steel-600 text-2xl font-semibold transition">0</button>
              <button onClick={submit} disabled={pin.length < 4 || !role || busy}
                className="h-16 rounded-2xl bg-brand-500 hover:bg-brand-600 disabled:opacity-40 font-bold transition">
                {busy ? '…' : 'Entrar'}
              </button>
            </div>
          </div>
        )}

        <button onClick={leaveAccount} className="mt-auto pt-10 text-xs text-steel-500 hover:text-steel-300">
          Sair da conta da oficina
        </button>
      </div>
    </div>
  );
}
