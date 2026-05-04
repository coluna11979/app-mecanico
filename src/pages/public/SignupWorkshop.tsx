import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Logo } from '@/components/Logo';

const UFS = ['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO'];

export default function SignupWorkshop() {
  const nav = useNavigate();
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [f, setF] = useState({
    full_name: '', email: '', password: '', phone: '',
    business_name: '', cnpj: '', address: '', city: '', state: 'SP', description: '',
  });
  function up<K extends keyof typeof f>(k: K, v: typeof f[K]) { setF(p => ({ ...p, [k]: v })); }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true); setErr(null);

    // Todos os dados vão no metadata — o trigger do banco cria profile + workshop automaticamente
    const { error } = await supabase.auth.signUp({
      email: f.email,
      password: f.password,
      options: {
        data: {
          role: 'workshop',
          full_name: f.full_name,
          phone: f.phone,
          business_name: f.business_name,
          cnpj: f.cnpj,
          address: f.address,
          city: f.city,
          state: f.state,
          description: f.description || '',
        },
      },
    });

    setLoading(false);
    if (error) { setErr(error.message); return; }
    nav('/aguardando-aprovacao', { replace: true });
  }

  return (
    <div className="min-h-screen bg-steel-50 py-10 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <Logo />
          <Link to="/" className="text-sm text-steel-500 hover:text-brand-500">← Início</Link>
        </div>
        <div className="card">
          <div className="badge-brand mb-2">Sempre 100% gratuito</div>
          <h1 className="text-2xl font-bold">Cadastro de Oficina</h1>
          <p className="text-steel-500 text-sm mt-1">Cadastro sujeito a aprovação · Validamos seu CNPJ</p>

          <form onSubmit={submit} className="mt-6 space-y-4">
            <div className="grid sm:grid-cols-2 gap-3">
              <div><label className="label">Seu nome (responsável)</label>
                <input className="input" required value={f.full_name} onChange={e => up('full_name', e.target.value)} /></div>
              <div><label className="label">Telefone</label>
                <input className="input" required value={f.phone} onChange={e => up('phone', e.target.value)} placeholder="(11) 99999-9999" /></div>
              <div><label className="label">E-mail</label>
                <input className="input" type="email" required value={f.email} onChange={e => up('email', e.target.value)} /></div>
              <div><label className="label">Senha</label>
                <input className="input" type="password" required minLength={6} value={f.password} onChange={e => up('password', e.target.value)} /></div>
            </div>

            <hr className="border-steel-200" />

            <div className="grid sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2"><label className="label">Razão social / Nome fantasia</label>
                <input className="input" required value={f.business_name} onChange={e => up('business_name', e.target.value)} /></div>
              <div><label className="label">CNPJ</label>
                <input className="input" required value={f.cnpj} onChange={e => up('cnpj', e.target.value)} placeholder="00.000.000/0000-00" /></div>
              <div><label className="label">UF</label>
                <select className="input" value={f.state} onChange={e => up('state', e.target.value)}>
                  {UFS.map(uf => <option key={uf}>{uf}</option>)}
                </select></div>
              <div className="sm:col-span-2"><label className="label">Endereço completo</label>
                <input className="input" required value={f.address} onChange={e => up('address', e.target.value)} placeholder="Rua, número, bairro" /></div>
              <div><label className="label">Cidade</label>
                <input className="input" required value={f.city} onChange={e => up('city', e.target.value)} /></div>
            </div>

            <div><label className="label">Sobre a oficina (opcional)</label>
              <textarea className="input" rows={3} value={f.description} onChange={e => up('description', e.target.value)} /></div>

            {err && <div className="text-sm text-alert-600 bg-alert-500/10 px-3 py-2 rounded-lg">{err}</div>}
            <button className="btn-primary w-full btn-lg" disabled={loading}>{loading ? 'Enviando…' : 'Enviar cadastro'}</button>
          </form>
        </div>
      </div>
    </div>
  );
}
