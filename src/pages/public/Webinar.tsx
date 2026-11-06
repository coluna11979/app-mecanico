import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Logo } from '@/components/Logo';
import { markLeadCaptured } from '@/components/LeadCaptureModal';
import { getAttribution } from '@/lib/marketingAttribution';

interface Webinar { title: string; description: string | null; intent: 'mechanic' | 'workshop'; segments: string[] }

const seenKey = (slug: string) => `webinar-${slug}`;

const CTA = {
  workshop: { to: '/cadastro/oficina', label: 'Quero cadastrar minha oficina', who: 'oficina' },
  mechanic: { to: '/cadastro/mecanico', label: 'Quero ser mecânico parceiro', who: 'mecânico' },
};

function formatPhone(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

// Página pública do webinar gravado (/webinar/:slug), destino dos anúncios:
// nome + WhatsApp liberam o vídeo, e o botão embaixo leva pro cadastro.
export default function WebinarPage() {
  const { slug = '' } = useParams<{ slug: string }>();
  const [webinar, setWebinar] = useState<Webinar | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [lead, setLead] = useState<{ name: string; phone: string } | null>(() => {
    try { const raw = localStorage.getItem(seenKey(slug)); return raw ? JSON.parse(raw) : null; } catch { return null; }
  });
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [part, setPart] = useState(0);

  useEffect(() => {
    supabase.rpc('get_webinar', { p_slug: slug }).then(({ data }) => {
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) setNotFound(true);
      else { setWebinar(row as Webinar); document.title = `${row.title} — MecânicoApp`; }
    });
  }, [slug]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const digits = phone.replace(/\D/g, '');
    if (name.trim().length < 2) return setError('Digite seu nome.');
    if (digits.length < 10) return setError('Digite seu WhatsApp com DDD.');
    setError(null); setBusy(true);
    const a = getAttribution();
    const { data, error: err } = await supabase.rpc('webinar_lead', {
      p_slug: slug, p_name: name.trim(), p_phone: digits,
      p_utm_source: a?.utm_source ?? null, p_utm_medium: a?.utm_medium ?? null,
      p_utm_campaign: a?.utm_campaign ?? null, p_campaign_id: a?.campaign_id ?? null,
      p_user_agent: navigator.userAgent, p_referrer: document.referrer || null,
    });
    setBusy(false);
    if (err || !data) return setError('Não foi possível liberar o vídeo. Tente de novo.');
    const me = { name: name.trim(), phone: digits };
    try { localStorage.setItem(seenKey(slug), JSON.stringify(me)); } catch { /* sem storage, segue */ }
    setLead(me);
  }

  function goSignup() {
    if (!webinar || !lead) return;
    markLeadCaptured(webinar.intent);
    // O cadastro já abre com nome e WhatsApp preenchidos
    try {
      sessionStorage.setItem('lead_prefill', JSON.stringify({ name: lead.name, phone: lead.phone, intent: webinar.intent }));
    } catch { /* sem storage, segue */ }
  }

  if (notFound) {
    return (
      <div className="min-h-[100dvh] bg-steel-50 flex flex-col items-center justify-center gap-4 p-4 text-center">
        <Logo />
        <p className="text-steel-600">Esse webinar não está disponível.</p>
        <Link to="/" className="text-brand-600 font-bold">Conhecer o MecânicoApp</Link>
      </div>
    );
  }
  if (!webinar) return <div className="min-h-[100dvh] grid place-items-center text-steel-500">Carregando…</div>;

  const cta = CTA[webinar.intent];

  return (
    <div className="min-h-[100dvh] bg-steel-900 text-white">
      <header className="max-w-3xl mx-auto px-4 py-4">
        <Logo light />
      </header>

      <main className="max-w-3xl mx-auto px-4 pb-10 space-y-5">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-brand-400">Webinar gravado</p>
          <h1 className="mt-1 text-2xl sm:text-3xl font-bold tracking-tight">{webinar.title}</h1>
          {webinar.description && <p className="mt-2 text-white/70">{webinar.description}</p>}
        </div>

        {!lead ? (
          <form onSubmit={submit} className="bg-white text-steel-900 rounded-2xl p-5 space-y-3">
            <h2 className="font-bold text-lg">Assista agora, de graça</h2>
            <p className="text-sm text-steel-500">Deixe seu nome e WhatsApp pra liberar o vídeo.</p>
            <input
              value={name} onChange={e => setName(e.target.value)} placeholder="Seu nome" autoComplete="name"
              className="w-full rounded-xl border border-steel-300 px-4 py-3 text-base"
            />
            <input
              value={phone} onChange={e => setPhone(formatPhone(e.target.value))} placeholder="WhatsApp com DDD"
              inputMode="tel" autoComplete="tel"
              className="w-full rounded-xl border border-steel-300 px-4 py-3 text-base"
            />
            {error && <p className="text-sm text-alert-600">{error}</p>}
            <button type="submit" disabled={busy}
              className="w-full min-h-[48px] rounded-xl bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white font-bold text-base">
              {busy ? 'Liberando…' : '▶ Assistir ao webinar'}
            </button>
          </form>
        ) : (
          <>
            <div>
              {webinar.segments.length > 1 && (
                <p className="text-xs font-bold text-white/60 mb-1">Parte {part + 1} de {webinar.segments.length}</p>
              )}
              <video
                key={webinar.segments[part]}
                src={webinar.segments[part]}
                controls playsInline preload="metadata" autoPlay={part > 0}
                // Gravação longa vem em partes: emenda uma na outra
                onEnded={() => setPart(p => Math.min(p + 1, webinar.segments.length - 1))}
                className="w-full rounded-2xl bg-black aspect-video"
              />
            </div>
            <div className="bg-white/5 border border-white/10 rounded-2xl p-5 text-center space-y-3">
              <p className="text-white/80">Faça seu cadastro como {cta.who} no MecânicoApp.</p>
              <Link to={cta.to} onClick={goSignup}
                className="flex items-center justify-center w-full min-h-[52px] rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-bold text-lg">
                {cta.label} →
              </Link>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
