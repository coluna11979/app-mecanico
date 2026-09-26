import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Logo } from '@/components/Logo';
import { recordConsent } from '@/lib/consent';

/** Lê (e consome) o pré-preenchimento de lead capturado na home. */
function consumeLeadPrefill(): { name?: string; email?: string; phone?: string } {
  try {
    const raw = sessionStorage.getItem('lead_prefill');
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    sessionStorage.removeItem('lead_prefill');
    return {
      name:  typeof parsed.name  === 'string' ? parsed.name  : undefined,
      email: typeof parsed.email === 'string' ? parsed.email : undefined,
      phone: typeof parsed.phone === 'string' ? parsed.phone : undefined,
    };
  } catch { return {}; }
}

const SKILLS = ['Motor', 'Suspensão', 'Freios', 'Elétrica', 'Injeção eletrônica', 'Câmbio', 'Ar-condicionado', 'Diagnóstico', 'Diesel'];
const UFS = ['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO'];

const TOTAL_STEPS = 4;

/** Lê ?ref=CODIGO da URL (também aceita ?ref via sessionStorage caso venha da landing). */
function useRefCode(): string | null {
  const [params] = useSearchParams();
  const fromQuery = params.get('ref');
  // Se veio na URL, guarda em sessionStorage — assim sobrevive a etapas do form.
  useEffect(() => {
    if (fromQuery) {
      try { sessionStorage.setItem('signup_ref_code', fromQuery.trim().toUpperCase()); } catch { /* ignore */ }
    }
  }, [fromQuery]);
  if (fromQuery) return fromQuery.trim().toUpperCase();
  try {
    return sessionStorage.getItem('signup_ref_code');
  } catch {
    return null;
  }
}

export default function SignupMechanic() {
  const nav = useNavigate();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const refCode = useRefCode();
  const [refInfo, setRefInfo] = useState<{ valid: boolean; name?: string } | null>(null);
  const [f, setF] = useState({
    full_name: '', email: '', password: '', phone: '', cpf: '', cnh: '',
    experience_years: 1, hourly_rate: 80, pix_key: '', skills: [] as string[],
    cep: '', neighborhood: '', city: '', state: 'SP', work_reference: '',
  });

  // Pré-preenche com os dados capturados no gate da home (se houver)
  useEffect(() => {
    const lead = consumeLeadPrefill();
    if (!lead.name && !lead.email && !lead.phone) return;
    setF(prev => ({
      ...prev,
      full_name: prev.full_name || lead.name  || '',
      email:     prev.email     || lead.email || '',
      phone:     prev.phone     || lead.phone || '',
    }));
  }, []);

  // Valida o código de indicação (silenciosamente — se der ruim, o cadastro segue igual)
  useEffect(() => {
    if (!refCode) { setRefInfo(null); return; }
    let alive = true;
    (async () => {
      const { data } = await supabase.rpc('resolver_codigo_indicacao', { p_codigo: refCode });
      if (!alive) return;
      if (!data) { setRefInfo({ valid: false }); return; }
      // Busca nome do embaixador pra dar cara humana
      const { data: mech } = await supabase
        .from('mechanics')
        .select('profile:profiles!inner(full_name)')
        .eq('id', data)
        .maybeSingle();
      const name = (mech as any)?.profile?.full_name?.split(' ')[0];
      setRefInfo({ valid: true, name });
    })();
    return () => { alive = false; };
  }, [refCode]);

  function update<K extends keyof typeof f>(k: K, v: typeof f[K]) {
    setF(prev => ({ ...prev, [k]: v }));
  }
  function toggleSkill(s: string) {
    setF(prev => ({ ...prev, skills: prev.skills.includes(s) ? prev.skills.filter(x => x !== s) : [...prev.skills, s] }));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!acceptedTerms) {
      setErr('Você precisa aceitar os Termos de Uso para continuar.');
      return;
    }
    setLoading(true); setErr(null);

    const { data, error } = await supabase.auth.signUp({
      email: f.email,
      password: f.password,
      options: {
        data: {
          role: 'mechanic',
          full_name: f.full_name,
          phone: f.phone,
          cpf: f.cpf,
          cnh: f.cnh || '',
          skills: f.skills,
          experience_years: Number(f.experience_years),
          hourly_rate: Number(f.hourly_rate),
          pix_key: f.pix_key.trim() || null,
          cep: f.cep.trim(),
          neighborhood: f.neighborhood.trim(),
          city: f.city.trim(),
          state: f.state,
          work_reference: f.work_reference.trim(),
          // Passa o código de indicação, se válido. handle_new_user resolve
          // pra mechanic_id e grava em mechanics.indicado_por.
          indicado_por_codigo: refInfo?.valid ? refCode : null,
        },
      },
    });

    if (error) { setLoading(false); setErr(error.message); return; }

    // Limpa o código consumido
    try { sessionStorage.removeItem('signup_ref_code'); } catch { /* ignore */ }

    // Registra aceite dos termos (não bloqueia o signup se falhar)
    if (data.user) {
      try { await recordConsent(data.user.id, 'mechanic'); } catch { /* ignora */ }
      // Email de boas-vindas (silencioso — se Resend não configurado ou der erro, ignora)
      void supabase.functions.invoke('send-welcome-email', {
        body: { profile_id: data.user.id },
      }).catch(() => { /* fire-and-forget */ });
    }

    setLoading(false);
    nav('/aguardando-aprovacao', { replace: true });
  }

  return (
    <div className="min-h-screen bg-steel-50 py-10 px-4">
      <div className="max-w-xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <Logo />
          <Link to="/" className="text-sm text-steel-500 hover:text-brand-500">← Início</Link>
        </div>

        <div className="card">
          {refInfo?.valid && (
            <div className="mb-4 bg-brand-500/10 border border-brand-500/30 rounded-xl p-3 flex items-center gap-2">
              <span className="text-lg">🤝</span>
              <div className="text-sm text-brand-700 leading-tight">
                Você foi convidado{refInfo.name ? ` por ${refInfo.name}` : ''} pra entrar na plataforma.
                <div className="text-xs text-steel-500 mt-0.5">Cadastro segue normal — 100% seu.</div>
              </div>
            </div>
          )}

          <div className="flex gap-1 mb-6">
            {Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1).map(n => (
              <div key={n} className={`h-1.5 flex-1 rounded-full transition ${n <= step ? 'bg-brand-500' : 'bg-steel-200'}`} />
            ))}
          </div>

          <h1 className="text-2xl font-bold">Cadastro de Mecânico</h1>
          <p className="text-steel-500 text-sm mt-1">Etapa {step} de {TOTAL_STEPS} · Cadastro sujeito a aprovação</p>

          <form onSubmit={submit} className="mt-6 space-y-4">
            {step === 1 && (
              <>
                <div><label className="label">Nome completo</label>
                  <input className="input" required value={f.full_name} onChange={e => update('full_name', e.target.value)} /></div>
                <div><label className="label">E-mail</label>
                  <input className="input" type="email" required value={f.email} onChange={e => update('email', e.target.value)} /></div>
                <div><label className="label">Senha</label>
                  <input className="input" type="password" required minLength={6} value={f.password} onChange={e => update('password', e.target.value)} /></div>
                <div><label className="label">Telefone (WhatsApp)</label>
                  <input className="input" required value={f.phone} onChange={e => update('phone', e.target.value)} placeholder="(11) 99999-9999" /></div>
              </>
            )}

            {step === 2 && (
              <>
                <div><label className="label">CPF</label>
                  <input className="input" required value={f.cpf} onChange={e => update('cpf', e.target.value)} placeholder="000.000.000-00" /></div>
                <div><label className="label">CNH (opcional)</label>
                  <input className="input" value={f.cnh} onChange={e => update('cnh', e.target.value)} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="label">Experiência (anos)</label>
                    <input className="input" type="number" min={0} value={f.experience_years} onChange={e => update('experience_years', Number(e.target.value))} /></div>
                  <div><label className="label">Valor / hora (R$)</label>
                    <input className="input" type="number" min={0} step={5} value={f.hourly_rate} onChange={e => update('hourly_rate', Number(e.target.value))} /></div>
                </div>
                <div>
                  <label className="label">Chave PIX (para receber pagamento) ⭐</label>
                  <input className="input" required value={f.pix_key}
                    onChange={e => update('pix_key', e.target.value)}
                    placeholder="CPF, e-mail, telefone ou chave aleatória" />
                  <p className="text-xs text-steel-500 mt-1">
                    Sem chave PIX, você não recebe os pagamentos dos jobs.
                  </p>
                </div>
              </>
            )}

            {step === 3 && (
              <>
                <div>
                  <label className="label">CEP</label>
                  <input className="input" required value={f.cep}
                    onChange={e => update('cep', e.target.value)}
                    placeholder="00000-000" />
                </div>
                <div><label className="label">Bairro</label>
                  <input className="input" required value={f.neighborhood}
                    onChange={e => update('neighborhood', e.target.value)}
                    placeholder="Ex.: Vila Mariana" /></div>
                <div className="grid grid-cols-[1fr_100px] gap-3">
                  <div><label className="label">Cidade</label>
                    <input className="input" required value={f.city}
                      onChange={e => update('city', e.target.value)}
                      placeholder="Ex.: São Paulo" /></div>
                  <div><label className="label">UF</label>
                    <select className="input" value={f.state}
                      onChange={e => update('state', e.target.value)}>
                      {UFS.map(uf => <option key={uf}>{uf}</option>)}
                    </select></div>
                </div>
                <div>
                  <label className="label">Referência de trabalho (opcional)</label>
                  <textarea className="input" rows={3} value={f.work_reference}
                    onChange={e => update('work_reference', e.target.value)}
                    placeholder="Ex.: Oficina do Zé (11) 99999-9999 · trabalhei 3 anos com injeção eletrônica" />
                  <p className="text-xs text-steel-500 mt-1">
                    Uma oficina, cliente ou colega que já trabalhou contigo e pode dar referência.
                    Ajuda muito na aprovação, mas não é obrigatório.
                  </p>
                </div>
              </>
            )}

            {step === 4 && (
              <div className="space-y-4">
                <div>
                  <label className="label">Suas especialidades (selecione ao menos 1)</label>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {SKILLS.map(s => (
                      <button type="button" key={s} onClick={() => toggleSkill(s)}
                        className={`px-3 py-2 rounded-xl text-sm font-medium transition ${f.skills.includes(s)
                          ? 'bg-brand-500 text-white shadow-brand'
                          : 'bg-steel-100 text-steel-700 hover:bg-steel-200'}`}>{s}</button>
                    ))}
                  </div>
                </div>

                {/* Aceite dos Termos */}
                <label className="flex items-start gap-3 bg-steel-50 border border-steel-200 rounded-xl p-3 cursor-pointer hover:bg-steel-100 transition">
                  <input
                    type="checkbox"
                    checked={acceptedTerms}
                    onChange={e => setAcceptedTerms(e.target.checked)}
                    className="mt-0.5 h-5 w-5 rounded border-steel-300 text-brand-500 focus:ring-brand-500 shrink-0"
                  />
                  <span className="text-sm text-steel-700 leading-relaxed">
                    Li e concordo com os{' '}
                    <Link to="/termos?tab=mechanic" target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:underline font-semibold">
                      Termos de Uso
                    </Link>
                    {' '}e a{' '}
                    <Link to="/privacidade" target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:underline font-semibold">
                      Política de Privacidade
                    </Link>
                    , incluindo as regras de cancelamento, taxas e responsabilidade.
                  </span>
                </label>
              </div>
            )}

            {err && <div className="text-sm text-alert-600 bg-alert-500/10 px-3 py-2 rounded-lg">{err}</div>}

            <div className="flex gap-2 pt-2">
              {step > 1 && <button type="button" className="btn-ghost" onClick={() => setStep(step - 1)}>Voltar</button>}
              {step < TOTAL_STEPS
                ? <button type="button" className="btn-primary flex-1" onClick={() => setStep(step + 1)}>Próximo</button>
                : <button className="btn-primary flex-1" disabled={loading || f.skills.length === 0 || !acceptedTerms}>
                    {loading ? 'Enviando…' : 'Enviar cadastro'}
                  </button>}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
