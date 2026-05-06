import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import WorkshopLayout from '@/components/layout/WorkshopLayout';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import type { Workshop } from '@/types/database';

const UFS = ['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO'];

export default function NovaOficina() {
  const nav = useNavigate();
  const { user, refreshWorkshops, setCurrentWorkshop } = useAuth();
  const [busy, setBusy] = useState(false);
  const [err, setErr]   = useState<string | null>(null);
  const [f, setF] = useState({
    business_name: '', cnpj: '', address: '', city: '', state: 'SP', description: '',
  });
  function up<K extends keyof typeof f>(k: K, v: typeof f[K]) { setF(p => ({ ...p, [k]: v })); }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    setBusy(true); setErr(null);

    const { data, error } = await supabase
      .from('workshops')
      .insert({
        profile_id:    user.id,
        business_name: f.business_name,
        cnpj:          f.cnpj,
        address:       f.address,
        city:          f.city,
        state:         f.state,
        description:   f.description || null,
      })
      .select('*')
      .single();

    setBusy(false);
    if (error) {
      setErr(error.message ?? 'Erro ao criar oficina');
      return;
    }
    // Refresh + define como atual + redireciona
    await refreshWorkshops();
    if (data) setCurrentWorkshop(data as Workshop);
    nav('/oficina/dashboard', { replace: true });
  }

  return (
    <WorkshopLayout>
      <div className="max-w-2xl mx-auto">
        <div className="mb-4">
          <button onClick={() => nav(-1)} className="text-sm text-steel-500 hover:text-brand-500">← Voltar</button>
        </div>

        <div className="card">
          <div className="badge-brand mb-2">Nova oficina</div>
          <h1 className="text-2xl font-bold tracking-tight">Cadastrar mais uma oficina</h1>
          <p className="text-steel-500 text-sm mt-1">
            Você pode gerenciar quantas oficinas quiser na mesma conta. Cada uma tem seus próprios jobs, OS, clientes e mecânicos — você só troca pelo seletor no topo.
          </p>

          <form onSubmit={submit} className="mt-6 space-y-4">
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="label">Razão social / Nome fantasia</label>
                <input className="input" required value={f.business_name}
                  onChange={e => up('business_name', e.target.value)} />
              </div>
              <div>
                <label className="label">CNPJ</label>
                <input className="input" required value={f.cnpj}
                  onChange={e => up('cnpj', e.target.value)} placeholder="00.000.000/0000-00" />
              </div>
              <div>
                <label className="label">UF</label>
                <select className="input" value={f.state}
                  onChange={e => up('state', e.target.value)}>
                  {UFS.map(uf => <option key={uf}>{uf}</option>)}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="label">Endereço completo</label>
                <input className="input" required value={f.address}
                  onChange={e => up('address', e.target.value)} placeholder="Rua, número, bairro" />
              </div>
              <div>
                <label className="label">Cidade</label>
                <input className="input" required value={f.city}
                  onChange={e => up('city', e.target.value)} />
              </div>
            </div>

            <div>
              <label className="label">Sobre essa oficina (opcional)</label>
              <textarea className="input" rows={3} value={f.description}
                onChange={e => up('description', e.target.value)} />
            </div>

            {err && (
              <div className="text-sm text-alert-600 bg-alert-500/10 px-3 py-2 rounded-lg">
                ⚠️ {err}
              </div>
            )}

            <div className="flex gap-3">
              <button type="button" onClick={() => nav(-1)} className="btn-ghost flex-1">Cancelar</button>
              <button type="submit" disabled={busy} className="btn-primary flex-1">
                {busy ? 'Criando…' : 'Criar oficina'}
              </button>
            </div>
          </form>
        </div>

        <div className="mt-4 bg-signal-500/10 border border-signal-500/20 rounded-2xl px-4 py-3 text-sm text-signal-700">
          💡 Depois de criar, ela aparece no seletor 🏪 no topo do menu — você troca entre as suas oficinas a qualquer momento sem deslogar.
        </div>
      </div>
    </WorkshopLayout>
  );
}
