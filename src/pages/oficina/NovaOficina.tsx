import { ChangeEvent, FormEvent, useRef, useState } from 'react';
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
    business_name: '', cnpj: '',
    cep: '', address: '', number: '', neighborhood: '',
    city: '', state: 'SP', description: '',
  });
  const [cepLoading, setCepLoading] = useState(false);
  const [cepError, setCepError]     = useState<string | null>(null);

  const [photo, setPhoto]           = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function up<K extends keyof typeof f>(k: K, v: typeof f[K]) {
    setF(p => ({ ...p, [k]: v }));
  }

  /* ── ViaCEP autocompletar ── */
  async function fetchCep(raw: string) {
    const digits = raw.replace(/\D/g, '');
    up('cep', digits.replace(/(\d{5})(\d)/, '$1-$2'));
    setCepError(null);
    if (digits.length < 8) return;

    setCepLoading(true);
    try {
      const res  = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const data = await res.json();
      if (data.erro) {
        setCepError('CEP não encontrado.');
        setCepLoading(false);
        return;
      }
      setF(prev => ({
        ...prev,
        address:      data.logradouro || prev.address,
        neighborhood: data.bairro     || prev.neighborhood,
        city:         data.localidade || prev.city,
        state:        (data.uf ?? prev.state).toUpperCase(),
      }));
    } catch {
      setCepError('Erro ao buscar CEP. Verifique sua conexão.');
    }
    setCepLoading(false);
  }

  /* ── Foto upload ── */
  function onPickPhoto(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setErr('Imagem muito grande (máx 5MB).');
      return;
    }
    setPhoto(file);
    setPhotoPreview(URL.createObjectURL(file));
    setErr(null);
  }

  async function uploadPhoto(workshopId: string): Promise<string | null> {
    if (!photo) return null;
    const ext = photo.name.split('.').pop() || 'jpg';
    const path = `${workshopId}/photo-${Date.now()}.${ext}`;
    const { error } = await supabase.storage
      .from('workshops')
      .upload(path, photo, { cacheControl: '3600', upsert: true, contentType: photo.type });
    if (error) {
      console.warn('[upload] error:', error.message);
      return null;
    }
    const { data } = supabase.storage.from('workshops').getPublicUrl(path);
    return data.publicUrl;
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    setBusy(true); setErr(null);

    // Cria oficina (sem foto ainda — precisa do ID)
    const { data, error } = await supabase
      .from('workshops')
      .insert({
        profile_id:    user.id,
        business_name: f.business_name,
        cnpj:          f.cnpj,
        cep:           f.cep || null,
        address:       f.address,
        number:        f.number || null,
        neighborhood:  f.neighborhood || null,
        city:          f.city,
        state:         f.state,
        description:   f.description || null,
      })
      .select('*')
      .single();

    if (error) {
      setErr(error.message ?? 'Erro ao criar oficina');
      setBusy(false);
      return;
    }

    // Faz upload da foto e atualiza logo_url
    if (photo && data) {
      const url = await uploadPhoto(data.id);
      if (url) {
        await supabase.from('workshops').update({ logo_url: url }).eq('id', data.id);
      }
    }

    // Refresh + define como atual + redireciona
    await refreshWorkshops();
    if (data) setCurrentWorkshop(data as Workshop);
    setBusy(false);
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

          <form onSubmit={submit} className="mt-6 space-y-5">

            {/* ── 1. Identificação ── */}
            <div>
              <div className="text-[10px] font-bold text-steel-500 uppercase tracking-widest mb-2">1. Identificação</div>
              <div className="space-y-3">
                <div>
                  <label className="label">Razão social / Nome fantasia</label>
                  <input className="input" required value={f.business_name}
                    onChange={e => up('business_name', e.target.value)} />
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
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
                </div>
              </div>
            </div>

            {/* ── 2. Foto ── */}
            <div>
              <div className="text-[10px] font-bold text-steel-500 uppercase tracking-widest mb-2">2. Foto da oficina (opcional)</div>
              <div className="flex items-center gap-4">
                {photoPreview ? (
                  <img src={photoPreview} alt=""
                    className="h-20 w-20 rounded-2xl object-cover border-2 border-steel-200" />
                ) : (
                  <div className="h-20 w-20 rounded-2xl bg-steel-100 grid place-items-center text-3xl border-2 border-dashed border-steel-300">
                    🏪
                  </div>
                )}
                <div className="flex-1">
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={onPickPhoto}
                  />
                  <button type="button" onClick={() => fileRef.current?.click()}
                    className="btn-ghost text-sm !py-2">
                    {photo ? 'Trocar foto' : 'Escolher foto'}
                  </button>
                  <p className="text-xs text-steel-500 mt-1">JPG/PNG até 5MB</p>
                </div>
              </div>
            </div>

            {/* ── 3. Endereço ── */}
            <div>
              <div className="text-[10px] font-bold text-steel-500 uppercase tracking-widest mb-2">3. Endereço</div>
              <div className="space-y-3">
                <div>
                  <label className="label">CEP</label>
                  <div className="relative">
                    <input className="input pr-10" value={f.cep} maxLength={9}
                      onChange={e => fetchCep(e.target.value)}
                      placeholder="00000-000" />
                    {cepLoading && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        <div className="h-4 w-4 rounded-full border-2 border-brand-500 border-t-transparent animate-spin" />
                      </div>
                    )}
                  </div>
                  {cepError && <p className="text-xs text-alert-600 mt-1">⚠️ {cepError}</p>}
                </div>

                <div className="grid sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <label className="label">Rua / Logradouro</label>
                    <input className="input" required value={f.address}
                      onChange={e => up('address', e.target.value)} placeholder="Av. Paulista" />
                  </div>
                  <div>
                    <label className="label">Número</label>
                    <input className="input" required value={f.number}
                      onChange={e => up('number', e.target.value)} placeholder="1234" />
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label className="label">Bairro</label>
                    <input className="input" value={f.neighborhood}
                      onChange={e => up('neighborhood', e.target.value)} placeholder="Bela Vista" />
                  </div>
                  <div>
                    <label className="label">Cidade</label>
                    <input className="input" required value={f.city}
                      onChange={e => up('city', e.target.value)} />
                  </div>
                </div>
              </div>
            </div>

            {/* ── 4. Sobre ── */}
            <div>
              <label className="label">Sobre essa oficina (opcional)</label>
              <textarea className="input" rows={3} value={f.description}
                onChange={e => up('description', e.target.value)}
                placeholder="Mecânica completa, especialista em motor, atende a domicílio…" />
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
