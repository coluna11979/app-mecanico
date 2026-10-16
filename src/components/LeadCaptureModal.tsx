import { FormEvent, useState } from 'react';
import { supabase } from '@/lib/supabase';

type Intent = 'mechanic' | 'workshop';

interface Props {
  intent: Intent;
  /** Chamado depois do submit (sucesso ou skip). Recebe os dados preenchidos ou null se pulou. */
  onComplete: (data: { name: string; email: string; phone: string } | null) => void;
  onClose: () => void;
}

const LS_KEY = (intent: Intent) => `lead_captured_${intent}`;

/** Marca que o lead já foi capturado nesse navegador. */
export function markLeadCaptured(intent: Intent) {
  try { localStorage.setItem(LS_KEY(intent), '1'); } catch { /* ignore */ }
}

/** Verifica se já capturamos lead pra esse intent (não mostra modal de novo). */
export function isLeadCaptured(intent: Intent): boolean {
  try { return localStorage.getItem(LS_KEY(intent)) === '1'; } catch { return false; }
}

export function LeadCaptureModal({ intent, onComplete, onClose }: Props) {
  const [name,    setName]    = useState('');
  const [email,   setEmail]   = useState('');
  const [phone,   setPhone]   = useState('');
  const [consent, setConsent] = useState(true);
  const [busy,    setBusy]    = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const isMechanic = intent === 'mechanic';
  const title = isMechanic ? 'Bem-vindo, mecânico!' : 'Bem-vindo, oficina!';
  const subtitle = isMechanic
    ? 'Antes de explorar a plataforma, deixa a gente saber quem você é.'
    : 'Antes de explorar a plataforma, deixa a gente saber sobre sua oficina.';

  function formatPhone(raw: string): string {
    const digits = raw.replace(/\D/g, '').slice(0, 11);
    if (digits.length <= 2)  return digits;
    if (digits.length <= 6)  return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const phoneDigits = phone.replace(/\D/g, '');
    if (name.trim().length < 3)  return setError('Informe seu nome completo.');
    if (!/^[^@]+@[^@]+\.[^@]+$/.test(email)) return setError('Email inválido.');
    if (phoneDigits.length < 10) return setError('Telefone inválido. Use DDD + número.');
    if (!consent)                return setError('É preciso aceitar para receber contato.');

    setBusy(true);
    try {
      // Tenta gravar; se falhar (rede, RLS), libera mesmo assim — UX vem primeiro
      await supabase.from('leads').insert({
        name:       name.trim(),
        email:      email.trim().toLowerCase(),
        phone:      phoneDigits,
        intent,
        consent,
        user_agent: navigator.userAgent.slice(0, 240),
        referrer:   document.referrer.slice(0, 240) || null,
      });
    } catch { /* ignore */ }
    markLeadCaptured(intent);
    // Guarda em sessionStorage pra pré-preencher o cadastro depois do hop por /mecanico ou /oficina
    try {
      sessionStorage.setItem('lead_prefill', JSON.stringify({
        name: name.trim(), email: email.trim().toLowerCase(), phone: phoneDigits, intent,
      }));
    } catch { /* ignore */ }
    setBusy(false);
    onComplete({ name: name.trim(), email: email.trim().toLowerCase(), phone: phoneDigits });
  }

  function skip() {
    onComplete(null);
  }

  return (
    <div className="fixed inset-0 z-[100] bg-steel-900/80 backdrop-blur grid place-items-center p-4 animate-fade-in">
      <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-6 sm:p-8 relative">
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar"
          className="absolute top-4 right-4 h-8 w-8 grid place-items-center rounded-full text-steel-400 hover:text-steel-700 hover:bg-steel-100 transition"
        >✕</button>

        <div className="text-3xl">{isMechanic ? '🔧' : '🏪'}</div>
        <h2 className="mt-3 text-2xl font-bold tracking-tight text-steel-900">{title}</h2>
        <p className="mt-1 text-sm text-steel-500">{subtitle}</p>

        <form onSubmit={submit} className="mt-5 space-y-3">
          <div>
            <label className="text-xs font-bold text-steel-700 uppercase tracking-wider">Nome completo *</label>
            <input
              type="text"
              required
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Como você se chama?"
              className="input mt-1"
              autoFocus
            />
          </div>

          <div>
            <label className="text-xs font-bold text-steel-700 uppercase tracking-wider">Email *</label>
            <input
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="seu@email.com"
              className="input mt-1"
              autoComplete="email"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-steel-700 uppercase tracking-wider">Telefone (WhatsApp) *</label>
            <input
              type="tel"
              required
              value={phone}
              onChange={e => setPhone(formatPhone(e.target.value))}
              placeholder="(11) 98765-4321"
              className="input mt-1"
              inputMode="numeric"
              autoComplete="tel"
            />
          </div>

          <label className="flex items-start gap-2 cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={consent}
              onChange={e => setConsent(e.target.checked)}
              className="mt-1 accent-brand-500"
            />
            <span className="text-xs text-steel-600 leading-relaxed">
              Aceito receber contato e novidades sobre a plataforma por email e WhatsApp.
              Você pode descadastrar a qualquer momento.
            </span>
          </label>

          {error && (
            <div className="bg-alert-50 border border-alert-200 text-alert-700 text-sm rounded-xl px-3 py-2">
              ⚠️ {error}
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className={`w-full font-bold rounded-2xl px-6 py-4 transition flex items-center justify-center gap-2 shadow-lg disabled:opacity-50 ${
              isMechanic
                ? 'bg-steel-900 text-white hover:bg-steel-800 shadow-steel-900/10'
                : 'bg-brand-500 text-white hover:bg-brand-600 shadow-brand-500/30'
            }`}
          >
            {busy ? 'Enviando…' : 'Continuar →'}
          </button>

          <button
            type="button"
            onClick={skip}
            className="w-full text-xs text-steel-400 hover:text-steel-700 underline-offset-2 hover:underline py-1"
          >
            Pular por enquanto
          </button>
        </form>
      </div>
    </div>
  );
}
