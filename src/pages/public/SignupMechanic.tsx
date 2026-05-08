import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Logo } from '@/components/Logo';

const SKILLS = ['Motor', 'Suspensão', 'Freios', 'Elétrica', 'Injeção eletrônica', 'Câmbio', 'Ar-condicionado', 'Diagnóstico', 'Diesel'];

export default function SignupMechanic() {
  const nav = useNavigate();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [f, setF] = useState({
    full_name: '', email: '', password: '', phone: '', cpf: '', cnh: '',
    experience_years: 1, hourly_rate: 80, pix_key: '', skills: [] as string[],
  });

  function update<K extends keyof typeof f>(k: K, v: typeof f[K]) {
    setF(prev => ({ ...prev, [k]: v }));
  }
  function toggleSkill(s: string) {
    setF(prev => ({ ...prev, skills: prev.skills.includes(s) ? prev.skills.filter(x => x !== s) : [...prev.skills, s] }));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true); setErr(null);

    // Todos os dados vão no metadata — o trigger do banco cria profile + mechanic automaticamente
    const { error } = await supabase.auth.signUp({
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
        },
      },
    });

    setLoading(false);
    if (error) { setErr(error.message); return; }
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
          <div className="flex gap-1 mb-6">
            {[1,2,3].map(n => (
              <div key={n} className={`h-1.5 flex-1 rounded-full transition ${n <= step ? 'bg-brand-500' : 'bg-steel-200'}`} />
            ))}
          </div>

          <h1 className="text-2xl font-bold">Cadastro de Mecânico</h1>
          <p className="text-steel-500 text-sm mt-1">Etapa {step} de 3 · Cadastro sujeito a aprovação</p>

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
            )}

            {err && <div className="text-sm text-alert-600 bg-alert-500/10 px-3 py-2 rounded-lg">{err}</div>}

            <div className="flex gap-2 pt-2">
              {step > 1 && <button type="button" className="btn-ghost" onClick={() => setStep(step - 1)}>Voltar</button>}
              {step < 3
                ? <button type="button" className="btn-primary flex-1" onClick={() => setStep(step + 1)}>Próximo</button>
                : <button className="btn-primary flex-1" disabled={loading || f.skills.length === 0}>{loading ? 'Enviando…' : 'Enviar cadastro'}</button>}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
