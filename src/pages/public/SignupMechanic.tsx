import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Logo } from '@/components/Logo';
import { recordConsent } from '@/lib/consent';
import { isValidCpf, maskCep, maskCpf, maskPhone, onlyDigits } from '@/lib/customers';

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

const TOTAL_STEPS = 5;
const STEP_TITLES = ['Seus dados', 'Dados profissionais', 'Onde você atende', 'Referências', 'Especialidades'];

type Ref = { name: string; phone: string; note: string };
const EMPTY_REF: Ref = { name: '', phone: '', note: '' };

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

/** Referência conta quando tem nome e um telefone completo. */
const refFilled = (r: Ref) => r.name.trim() !== '' && onlyDigits(r.phone).length >= 10;

/** Junta as referências num texto só — o admin lê em Aprovações (whitespace-pre-wrap). */
function composeReferences(refs: Ref[]) {
  return refs
    .filter(r => r.name.trim() || r.phone.trim())
    .map(r => [r.name.trim(), r.phone.trim()].filter(Boolean).join(' · ') + (r.note.trim() ? ` — ${r.note.trim()}` : ''))
    .join('\n');
}

export default function SignupMechanic() {
  const nav = useNavigate();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [cepStatus, setCepStatus] = useState<'idle' | 'loading' | 'found' | 'notfound' | 'error'>('idle');
  const refCode = useRefCode();
  const [refInfo, setRefInfo] = useState<{ valid: boolean; name?: string } | null>(null);
  const [f, setF] = useState({
    full_name: '', email: '', password: '', phone: '', cpf: '', cnh: '',
    experience_years: 1, hourly_rate: 80, pix_key: '', skills: [] as string[],
    cep: '', neighborhood: '', city: '', state: '',
  });
  const [refs, setRefs] = useState<Ref[]>([{ ...EMPTY_REF }, { ...EMPTY_REF }]);

  // Pré-preenche com os dados capturados no gate da home (se houver)
  useEffect(() => {
    const lead = consumeLeadPrefill();
    if (!lead.name && !lead.email && !lead.phone) return;
    setF(prev => ({
      ...prev,
      full_name: prev.full_name || lead.name  || '',
      email:     prev.email     || lead.email || '',
      phone:     prev.phone     || (lead.phone ? maskPhone(lead.phone) : ''),
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
    setErrors(prev => { if (!prev[k]) return prev; const n = { ...prev }; delete n[k]; return n; });
  }
  function updateRef(i: number, k: keyof Ref, v: string) {
    setRefs(prev => prev.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
    setErrors(prev => { const key = `ref${i}_${k}`; if (!prev[key]) return prev; const n = { ...prev }; delete n[key]; return n; });
  }
  function toggleSkill(s: string) {
    setF(prev => ({ ...prev, skills: prev.skills.includes(s) ? prev.skills.filter(x => x !== s) : [...prev.skills, s] }));
    setErrors(prev => { if (!prev.skills) return prev; const n = { ...prev }; delete n.skills; return n; });
  }

  /* ── ViaCEP: preenche bairro, cidade e UF ── */
  async function onCepChange(raw: string) {
    const masked = maskCep(raw);
    update('cep', masked);
    const digits = onlyDigits(masked);
    if (digits.length < 8) { setCepStatus('idle'); return; }
    setCepStatus('loading');
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const data = await res.json();
      if (data.erro) { setCepStatus('notfound'); return; }
      setF(prev => ({
        ...prev,
        neighborhood: data.bairro     || prev.neighborhood,
        city:         data.localidade || prev.city,
        state:        (data.uf || prev.state).toUpperCase(),
      }));
      setErrors(prev => { const n = { ...prev }; delete n.neighborhood; delete n.city; delete n.state; return n; });
      setCepStatus('found');
    } catch {
      setCepStatus('error');
    }
  }

  /** Erros de uma etapa (vazio = pode seguir). */
  function validateStep(s: number): Record<string, string> {
    const e: Record<string, string> = {};
    if (s === 1) {
      if (f.full_name.trim().split(/\s+/).length < 2) e.full_name = 'Informe nome e sobrenome.';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) e.email = 'E-mail inválido.';
      if (f.password.length < 6) e.password = 'A senha precisa ter pelo menos 6 caracteres.';
      if (onlyDigits(f.phone).length < 10) e.phone = 'Informe o WhatsApp com DDD.';
    }
    if (s === 2) {
      if (!isValidCpf(f.cpf)) e.cpf = 'CPF inválido. Confira os números.';
      if (!(f.experience_years >= 0)) e.experience_years = 'Informe os anos de experiência.';
      if (!(f.hourly_rate > 0)) e.hourly_rate = 'Informe quanto cobra por hora.';
      if (!f.pix_key.trim()) e.pix_key = 'Sem chave PIX você não recebe os pagamentos.';
    }
    if (s === 3) {
      if (onlyDigits(f.cep).length !== 8) e.cep = 'CEP precisa ter 8 números.';
      if (!f.neighborhood.trim()) e.neighborhood = 'Informe o bairro.';
      if (!f.city.trim()) e.city = 'Informe a cidade.';
      if (!f.state) e.state = 'Escolha a UF.';
    }
    if (s === 4) {
      // Opcional — só cobra coerência de quem começou a preencher
      refs.forEach((r, i) => {
        const hasName = r.name.trim() !== '';
        const phoneDigits = onlyDigits(r.phone).length;
        if (!hasName && !phoneDigits && !r.note.trim()) return;
        if (!hasName) e[`ref${i}_name`] = 'Quem é essa referência?';
        if (phoneDigits < 10) e[`ref${i}_phone`] = 'Informe o telefone com DDD pra gente conseguir ligar.';
      });
    }
    if (s === 5) {
      if (f.skills.length === 0) e.skills = 'Selecione ao menos 1 especialidade.';
    }
    return e;
  }

  function next() {
    const e = validateStep(step);
    setErrors(e);
    if (Object.keys(e).length) return;
    setErr(null);
    setStep(step + 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (step < TOTAL_STEPS) { next(); return; }

    // Revalida tudo antes de enviar e volta pra primeira etapa com problema
    for (let s = 1; s <= TOTAL_STEPS; s++) {
      const stepErrors = validateStep(s);
      if (Object.keys(stepErrors).length) { setErrors(stepErrors); setStep(s); return; }
    }
    if (!acceptedTerms) {
      setErr('Você precisa aceitar os Termos de Uso para continuar.');
      return;
    }
    setLoading(true); setErr(null);

    const { data, error } = await supabase.auth.signUp({
      email: f.email.trim(),
      password: f.password,
      options: {
        data: {
          role: 'mechanic',
          full_name: f.full_name.trim(),
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
          work_reference: composeReferences(refs),
          // Passa o código de indicação, se válido. handle_new_user resolve
          // pra mechanic_id e grava em mechanics.indicado_por.
          indicado_por_codigo: refInfo?.valid ? refCode : null,
        },
      },
    });

    if (error) {
      setLoading(false);
      setErr(/already registered|already exists/i.test(error.message)
        ? 'Esse e-mail já tem cadastro. Tente entrar ou recuperar a senha.'
        : error.message);
      return;
    }

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

  const inputCls = (k: string) => `input ${errors[k] ? 'border-alert-500 focus:ring-alert-500' : ''}`;
  const FieldError = ({ k }: { k: string }) =>
    errors[k] ? <p className="text-xs text-alert-600 mt-1">{errors[k]}</p> : null;
  const refsTouched = refs.some(r => r.name.trim() || r.phone.trim() || r.note.trim());

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
          <p className="text-steel-500 text-sm mt-1">
            Etapa {step} de {TOTAL_STEPS} · {STEP_TITLES[step - 1]}
          </p>

          <form onSubmit={submit} noValidate className="mt-6 space-y-4">
            {step === 1 && (
              <>
                <div><label className="label">Nome completo</label>
                  <input className={inputCls('full_name')} autoComplete="name" value={f.full_name}
                    onChange={e => update('full_name', e.target.value)} />
                  <FieldError k="full_name" /></div>
                <div><label className="label">E-mail</label>
                  <input className={inputCls('email')} type="email" inputMode="email" autoComplete="email"
                    autoCapitalize="none" value={f.email} onChange={e => update('email', e.target.value)} />
                  <FieldError k="email" /></div>
                <div><label className="label">Senha</label>
                  <input className={inputCls('password')} type="password" autoComplete="new-password" value={f.password}
                    onChange={e => update('password', e.target.value)} placeholder="Mínimo 6 caracteres" />
                  <FieldError k="password" /></div>
                <div><label className="label">Telefone (WhatsApp)</label>
                  <input className={inputCls('phone')} type="tel" inputMode="tel" autoComplete="tel" value={f.phone}
                    onChange={e => update('phone', maskPhone(e.target.value))} placeholder="(11) 99999-9999" />
                  <FieldError k="phone" /></div>
              </>
            )}

            {step === 2 && (
              <>
                <div><label className="label">CPF</label>
                  <input className={inputCls('cpf')} inputMode="numeric" value={f.cpf}
                    onChange={e => update('cpf', maskCpf(e.target.value))} placeholder="000.000.000-00" />
                  <FieldError k="cpf" /></div>
                <div><label className="label">CNH (opcional)</label>
                  <input className="input" inputMode="numeric" value={f.cnh}
                    onChange={e => update('cnh', onlyDigits(e.target.value).slice(0, 11))} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="label">Experiência (anos)</label>
                    <input className={inputCls('experience_years')} type="number" inputMode="numeric" min={0}
                      value={f.experience_years} onChange={e => update('experience_years', Number(e.target.value))} />
                    <FieldError k="experience_years" /></div>
                  <div><label className="label">Valor / hora (R$)</label>
                    <input className={inputCls('hourly_rate')} type="number" inputMode="numeric" min={0} step={5}
                      value={f.hourly_rate} onChange={e => update('hourly_rate', Number(e.target.value))} />
                    <FieldError k="hourly_rate" /></div>
                </div>
                <div>
                  <label className="label">Chave PIX (para receber pagamento) ⭐</label>
                  <input className={inputCls('pix_key')} value={f.pix_key} autoCapitalize="none"
                    onChange={e => update('pix_key', e.target.value)}
                    placeholder="CPF, e-mail, telefone ou chave aleatória" />
                  {errors.pix_key
                    ? <FieldError k="pix_key" />
                    : <p className="text-xs text-steel-500 mt-1">Sem chave PIX, você não recebe os pagamentos dos jobs.</p>}
                </div>
              </>
            )}

            {step === 3 && (
              <>
                <div>
                  <label className="label">CEP</label>
                  <input className={inputCls('cep')} inputMode="numeric" autoComplete="postal-code" value={f.cep}
                    onChange={e => onCepChange(e.target.value)} placeholder="00000-000" />
                  {errors.cep ? <FieldError k="cep" /> : (
                    <p className={`text-xs mt-1 ${cepStatus === 'notfound' || cepStatus === 'error' ? 'text-alert-600' : 'text-steel-500'}`}>
                      {cepStatus === 'loading' && 'Buscando endereço…'}
                      {cepStatus === 'found' && '✓ Endereço encontrado — confira abaixo.'}
                      {cepStatus === 'notfound' && 'CEP não encontrado. Preencha bairro e cidade à mão.'}
                      {cepStatus === 'error' && 'Não deu pra buscar o CEP. Preencha bairro e cidade à mão.'}
                      {cepStatus === 'idle' && 'Digite o CEP que a gente preenche o resto.'}
                    </p>
                  )}
                </div>
                <div><label className="label">Bairro</label>
                  <input className={inputCls('neighborhood')} value={f.neighborhood}
                    onChange={e => update('neighborhood', e.target.value)}
                    placeholder="Ex.: Vila Mariana" />
                  <FieldError k="neighborhood" /></div>
                <div className="grid grid-cols-[1fr_100px] gap-3">
                  <div><label className="label">Cidade</label>
                    <input className={inputCls('city')} value={f.city}
                      onChange={e => update('city', e.target.value)}
                      placeholder="Ex.: São Paulo" />
                    <FieldError k="city" /></div>
                  <div><label className="label">UF</label>
                    <select className={inputCls('state')} value={f.state}
                      onChange={e => update('state', e.target.value)}>
                      <option value="">—</option>
                      {UFS.map(uf => <option key={uf}>{uf}</option>)}
                    </select>
                    <FieldError k="state" /></div>
                </div>
              </>
            )}

            {step === 4 && (
              <>
                <div className="bg-brand-500/10 border border-brand-500/30 rounded-xl p-3 flex gap-2">
                  <span className="text-lg leading-none">⭐</span>
                  <div className="text-sm text-brand-700 leading-snug">
                    <b>Referências aceleram sua aprovação.</b>
                    <div className="text-steel-600 mt-0.5">
                      Indique uma oficina, cliente ou colega que já trabalhou com você. Não é obrigatório,
                      mas cadastros com referência são avaliados com mais confiança.
                    </div>
                  </div>
                </div>

                {refs.map((r, i) => (
                  <div key={i} className="rounded-xl border border-steel-200 p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-semibold text-steel-700">Referência {i + 1}</div>
                      {refFilled(r) && <span className="text-xs font-semibold text-emerald-600">✓ Preenchida</span>}
                    </div>
                    <div><label className="label">Nome (oficina, cliente ou colega)</label>
                      <input className={inputCls(`ref${i}_name`)} value={r.name}
                        onChange={e => updateRef(i, 'name', e.target.value)} placeholder="Ex.: Oficina do Zé" />
                      <FieldError k={`ref${i}_name`} /></div>
                    <div><label className="label">Telefone / WhatsApp</label>
                      <input className={inputCls(`ref${i}_phone`)} type="tel" inputMode="tel" value={r.phone}
                        onChange={e => updateRef(i, 'phone', maskPhone(e.target.value))} placeholder="(11) 99999-9999" />
                      <FieldError k={`ref${i}_phone`} /></div>
                    <div><label className="label">O que fez com essa pessoa? (opcional)</label>
                      <input className="input" value={r.note}
                        onChange={e => updateRef(i, 'note', e.target.value)} placeholder="Ex.: trabalhei 3 anos com injeção eletrônica" /></div>
                  </div>
                ))}

                {!refsTouched && (
                  <p className="text-xs text-steel-500 text-center">
                    Sem referência agora? Pode seguir — mas com pelo menos uma a avaliação fica mais rápida.
                  </p>
                )}
              </>
            )}

            {step === 5 && (
              <div className="space-y-4">
                <div>
                  <label className="label">Suas especialidades (selecione ao menos 1)</label>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {SKILLS.map(s => (
                      <button type="button" key={s} onClick={() => toggleSkill(s)}
                        className={`px-3 py-2.5 rounded-xl text-sm font-medium transition ${f.skills.includes(s)
                          ? 'bg-brand-500 text-white shadow-brand'
                          : 'bg-steel-100 text-steel-700 hover:bg-steel-200'}`}>{s}</button>
                    ))}
                  </div>
                  <FieldError k="skills" />
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
              {step > 1 && (
                <button type="button" className="btn-ghost"
                  onClick={() => { setErrors({}); setErr(null); setStep(step - 1); }}>Voltar</button>
              )}
              {step < TOTAL_STEPS
                ? <button key="next" type="submit" className="btn-primary flex-1">
                    {step === 4 && !refsTouched ? 'Pular por enquanto' : 'Próximo'}
                  </button>
                : <button key="send" type="submit" className="btn-primary flex-1" disabled={loading || !acceptedTerms}>
                    {loading ? 'Enviando…' : 'Enviar cadastro'}
                  </button>}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
