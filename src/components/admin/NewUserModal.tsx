import { FormEvent, useState } from 'react';
import { supabase } from '@/lib/supabase';

type Role = 'mechanic' | 'workshop';

const SKILLS = ['Motor', 'Suspensão', 'Freios', 'Elétrica', 'Injeção eletrônica', 'Câmbio', 'Ar-condicionado', 'Diagnóstico', 'Diesel'];
const UFS = ['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO'];

interface Props {
  onClose: () => void;
  onCreated: () => void;
}

export function NewUserModal({ onClose, onCreated }: Props) {
  const [role, setRole] = useState<Role>('mechanic');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<{ email: string; password: string } | null>(null);

  const [f, setF] = useState({
    full_name: '', email: '', phone: '',
    // mechanic
    cpf: '', cnh: '', experience_years: 1, hourly_rate: 80, pix_key: '',
    skills: [] as string[], work_reference: '',
    // workshop
    business_name: '', cnpj: '', address: '', number: '', description: '',
    // shared location
    cep: '', neighborhood: '', city: '', state: 'SP',
  });

  function up<K extends keyof typeof f>(k: K, v: typeof f[K]) {
    setF(p => ({ ...p, [k]: v }));
  }
  function toggleSkill(s: string) {
    setF(p => ({ ...p, skills: p.skills.includes(s) ? p.skills.filter(x => x !== s) : [...p.skills, s] }));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr(null);

    if (role === 'mechanic' && f.skills.length === 0) {
      setErr('Selecione ao menos 1 especialidade.');
      return;
    }

    setLoading(true);

    const payload = role === 'mechanic'
      ? {
          role,
          full_name: f.full_name, email: f.email, phone: f.phone,
          cpf: f.cpf, cnh: f.cnh,
          experience_years: f.experience_years, hourly_rate: f.hourly_rate,
          pix_key: f.pix_key, skills: f.skills, work_reference: f.work_reference,
          cep: f.cep, neighborhood: f.neighborhood, city: f.city, state: f.state,
        }
      : {
          role,
          full_name: f.full_name, email: f.email, phone: f.phone,
          business_name: f.business_name, cnpj: f.cnpj,
          address: f.address, number: f.number,
          cep: f.cep, neighborhood: f.neighborhood, city: f.city, state: f.state,
          description: f.description,
        };

    const { data, error } = await supabase.functions.invoke('admin-create-user', {
      body: payload,
    });

    setLoading(false);

    if (error || data?.error) {
      setErr(data?.error ?? error?.message ?? 'Erro ao criar cadastro');
      return;
    }

    setResult({ email: data.email, password: data.temp_password });
  }

  function finish() {
    setResult(null);
    onCreated();
  }

  // Tela de sucesso — mostra a senha temporária
  if (result) {
    return (
      <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
        <div onClick={e => e.stopPropagation()} className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4">
          <div>
            <h3 className="text-lg font-bold text-signal-700">✅ Cadastro criado!</h3>
            <p className="text-sm text-steel-500 mt-1">
              Anote ou fotografe essa senha e passe pra pessoa oralmente.
              Ela pode trocar depois via "Esqueci minha senha".
            </p>
          </div>

          <div className="bg-brand-50 border-2 border-brand-200 rounded-xl p-4 space-y-3">
            <div>
              <div className="text-[10px] text-steel-500 uppercase tracking-widest font-bold">Email de login</div>
              <div className="font-mono text-sm text-steel-900 mt-0.5 break-all">{result.email}</div>
            </div>
            <div>
              <div className="text-[10px] text-steel-500 uppercase tracking-widest font-bold">Senha temporária</div>
              <div className="font-mono text-2xl text-brand-700 font-bold mt-0.5 tracking-wider">{result.password}</div>
            </div>
          </div>

          <p className="text-xs text-steel-500">
            O email de boas-vindas foi enviado. Se o Resend estiver configurado,
            a pessoa vai receber com link pra criar nova senha.
          </p>

          <button onClick={finish} className="btn-primary w-full">
            Entendi, fechar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="bg-white rounded-2xl max-w-2xl w-full p-6 space-y-4 my-8">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold">➕ Novo cadastro</h3>
            <p className="text-sm text-steel-500 mt-1">
              Cria o cadastro na hora (trabalho de campo). Sistema gera senha temporária pra você passar oralmente.
            </p>
          </div>
          <button onClick={onClose} className="text-steel-400 hover:text-steel-700 text-2xl leading-none">×</button>
        </div>

        <form onSubmit={submit} className="space-y-4">
          {/* Tipo */}
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setRole('mechanic')}
              className={`px-4 py-3 rounded-xl text-sm font-bold transition ${
                role === 'mechanic' ? 'bg-brand-500 text-white' : 'bg-steel-100 text-steel-700'
              }`}>🔧 Mecânico</button>
            <button type="button" onClick={() => setRole('workshop')}
              className={`px-4 py-3 rounded-xl text-sm font-bold transition ${
                role === 'workshop' ? 'bg-brand-500 text-white' : 'bg-steel-100 text-steel-700'
              }`}>🏪 Oficina</button>
          </div>

          {/* Comuns */}
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2"><label className="label">Nome completo *</label>
              <input className="input" required value={f.full_name} onChange={e => up('full_name', e.target.value)} /></div>
            <div><label className="label">Email *</label>
              <input className="input" type="email" required value={f.email} onChange={e => up('email', e.target.value)} placeholder="pessoa@email.com" /></div>
            <div><label className="label">Telefone (WhatsApp)</label>
              <input className="input" value={f.phone} onChange={e => up('phone', e.target.value)} placeholder="(11) 99999-9999" /></div>
          </div>

          {role === 'mechanic' ? (
            <>
              <div className="grid sm:grid-cols-2 gap-3">
                <div><label className="label">CPF *</label>
                  <input className="input" required value={f.cpf} onChange={e => up('cpf', e.target.value)} placeholder="000.000.000-00" /></div>
                <div><label className="label">CNH (opcional)</label>
                  <input className="input" value={f.cnh} onChange={e => up('cnh', e.target.value)} /></div>
                <div><label className="label">Anos experiência</label>
                  <input className="input" type="number" min={0} value={f.experience_years} onChange={e => up('experience_years', Number(e.target.value))} /></div>
                <div><label className="label">Valor/hora (R$)</label>
                  <input className="input" type="number" min={0} step={5} value={f.hourly_rate} onChange={e => up('hourly_rate', Number(e.target.value))} /></div>
              </div>
              <div><label className="label">Chave PIX</label>
                <input className="input" value={f.pix_key} onChange={e => up('pix_key', e.target.value)} placeholder="CPF, email, telefone ou chave aleatória" /></div>
              <div>
                <label className="label">Especialidades (ao menos 1) *</label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {SKILLS.map(s => (
                    <button type="button" key={s} onClick={() => toggleSkill(s)}
                      className={`px-3 py-1.5 rounded-xl text-sm font-medium transition ${
                        f.skills.includes(s) ? 'bg-brand-500 text-white' : 'bg-steel-100 text-steel-700 hover:bg-steel-200'
                      }`}>{s}</button>
                  ))}
                </div>
              </div>
              <div><label className="label">Referência de trabalho (opcional)</label>
                <textarea className="input" rows={2} value={f.work_reference} onChange={e => up('work_reference', e.target.value)}
                  placeholder="Ex.: Oficina do Zé (11) 99999-9999 · trabalhei 3 anos com injeção" /></div>
            </>
          ) : (
            <>
              <div><label className="label">Razão social / Nome fantasia *</label>
                <input className="input" required value={f.business_name} onChange={e => up('business_name', e.target.value)} /></div>
              <div><label className="label">CNPJ *</label>
                <input className="input" required value={f.cnpj} onChange={e => up('cnpj', e.target.value)} placeholder="00.000.000/0000-00" /></div>
              <div className="grid grid-cols-[1fr_120px] gap-3">
                <div><label className="label">Rua / Avenida</label>
                  <input className="input" value={f.address} onChange={e => up('address', e.target.value)} /></div>
                <div><label className="label">Número</label>
                  <input className="input" value={f.number} onChange={e => up('number', e.target.value)} /></div>
              </div>
              <div><label className="label">Sobre a oficina (opcional)</label>
                <textarea className="input" rows={2} value={f.description} onChange={e => up('description', e.target.value)} /></div>
            </>
          )}

          {/* Localização (comum) */}
          <div className="pt-2 border-t border-steel-200">
            <div className="text-xs font-bold text-steel-500 uppercase tracking-widest mb-2">📍 Localização</div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div><label className="label">CEP</label>
                <input className="input" value={f.cep} onChange={e => up('cep', e.target.value)} placeholder="00000-000" /></div>
              <div><label className="label">Bairro</label>
                <input className="input" value={f.neighborhood} onChange={e => up('neighborhood', e.target.value)} /></div>
              <div className="sm:col-span-2 grid grid-cols-[1fr_100px] gap-3">
                <div><label className="label">Cidade</label>
                  <input className="input" value={f.city} onChange={e => up('city', e.target.value)} /></div>
                <div><label className="label">UF</label>
                  <select className="input" value={f.state} onChange={e => up('state', e.target.value)}>
                    {UFS.map(uf => <option key={uf}>{uf}</option>)}
                  </select></div>
              </div>
            </div>
          </div>

          {err && <div className="text-sm text-alert-600 bg-alert-500/10 px-3 py-2 rounded-lg">{err}</div>}

          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-ghost flex-1">Cancelar</button>
            <button className="btn-primary flex-1" disabled={loading}>
              {loading ? 'Criando…' : 'Criar cadastro'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
