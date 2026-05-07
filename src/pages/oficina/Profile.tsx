import { FormEvent, useEffect, useState } from 'react';
import WorkshopLayout from '@/components/layout/WorkshopLayout';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { AvatarUpload } from '@/components/AvatarUpload';
import type { Workshop } from '@/types/database';

export default function WorkshopProfile() {
  const { user, profile, refreshProfile, currentWorkshop, refreshWorkshops, loading: authLoading, workshops } = useAuth();
  const [shop, setShop]             = useState<Workshop | null>(null);
  const [busy, setBusy]             = useState(false);
  const [geoLoading, setGeoLoading] = useState(false);
  const [msg, setMsg]               = useState<{ text: string; ok: boolean } | null>(null);
  const [cep, setCep]               = useState('');
  const [cepLoading, setCepLoading] = useState(false);
  const [cepError, setCepError]     = useState('');
  const [retrying, setRetrying]     = useState(false);

  // O loading é derivado: enquanto auth tá carregando OU enquanto não tem workshop selecionada
  const loading = authLoading;

  // Edita a oficina ATUAL (a selecionada no seletor)
  useEffect(() => {
    setShop(currentWorkshop ?? null);
  }, [currentWorkshop?.id]);

  async function retryLoad() {
    setRetrying(true);
    await refreshWorkshops();
    setRetrying(false);
  }

  /* ── Busca CEP na ViaCEP ── */
  async function fetchCep(raw: string) {
    const digits = raw.replace(/\D/g, '');
    setCep(digits.replace(/(\d{5})(\d)/, '$1-$2'));
    setCepError('');
    if (digits.length < 8) return;

    setCepLoading(true);
    try {
      const res  = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const data = await res.json();
      if (data.erro) { setCepError('CEP não encontrado.'); setCepLoading(false); return; }

      const address = [data.logradouro, data.bairro].filter(Boolean).join(', ');
      setShop(s => s ? {
        ...s,
        address: address || s.address,
        city:    data.localidade || s.city,
        state:   (data.uf ?? '').toUpperCase() || s.state,
      } : s);
    } catch {
      setCepError('Erro ao buscar CEP. Verifique sua conexão.');
    }
    setCepLoading(false);
  }

  /* ── Geocodifica o endereço cadastrado (Nominatim / OpenStreetMap) ── */
  async function geocodeAddress() {
    if (!shop) return;
    const query = [shop.address, shop.city, shop.state, 'Brasil'].filter(Boolean).join(', ');
    if (!query.trim()) { alert('Preencha o endereço antes de localizar.'); return; }

    setGeoLoading(true);
    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&countrycodes=br`;
      const res  = await fetch(url, { headers: { 'Accept-Language': 'pt-BR' } });
      const data = await res.json();
      if (!data?.length) {
        alert('Endereço não encontrado no mapa. Verifique o endereço cadastrado e tente novamente.');
        setGeoLoading(false);
        return;
      }
      setShop({ ...shop, lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) });
    } catch {
      alert('Erro ao buscar localização. Verifique sua conexão.');
    }
    setGeoLoading(false);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!shop) return;
    setBusy(true); setMsg(null);
    const { error } = await supabase.from('workshops').update({
      business_name: shop.business_name,
      address:       shop.address,
      city:          shop.city,
      state:         shop.state,
      description:   shop.description,
      lat:           shop.lat,
      lng:           shop.lng,
    }).eq('id', shop.id);
    setBusy(false);
    if (!error) await refreshWorkshops(); // sincroniza dados atualizados no AuthContext
    setMsg(error
      ? { text: error.message, ok: false }
      : { text: 'Alterações salvas com sucesso!', ok: true });
    setTimeout(() => setMsg(null), 4000);
  }

  function set(field: keyof Workshop) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setShop(s => s ? { ...s, [field]: e.target.value } : s);
  }

  const initials = (shop?.business_name ?? 'O').split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();

  if (loading) return (
    <WorkshopLayout>
      <div className="flex items-center gap-3 text-steel-500 py-10">
        <div className="h-5 w-5 rounded-full border-2 border-brand-500 border-t-transparent animate-spin" />
        Carregando perfil…
      </div>
    </WorkshopLayout>
  );

  if (!shop) return (
    <WorkshopLayout>
      <div className="card max-w-md text-center py-10">
        <div className="text-4xl mb-3">🏪</div>
        <h2 className="text-xl font-bold">
          {workshops.length === 0 ? 'Nenhuma oficina cadastrada' : 'Selecione uma oficina'}
        </h2>
        <p className="text-sm text-steel-500 mt-2">
          {workshops.length === 0
            ? 'Parece que você ainda não tem nenhuma oficina vinculada à sua conta.'
            : 'Escolha qual oficina você quer editar usando o seletor 🏪 no topo do menu.'}
        </p>
        <div className="mt-5 flex gap-2 justify-center">
          <button onClick={retryLoad} disabled={retrying} className="btn-ghost text-sm">
            {retrying ? 'Recarregando…' : 'Recarregar'}
          </button>
          {workshops.length === 0 && (
            <a href="/oficina/nova" className="btn-primary text-sm">Cadastrar oficina</a>
          )}
        </div>
      </div>
    </WorkshopLayout>
  );

  return (
    <WorkshopLayout>
      <h1 className="text-3xl font-bold tracking-tight mb-2">Perfil da oficina</h1>
      <p className="text-steel-500 text-sm mb-8">Gerencie as informações da sua oficina.</p>

      <div className="max-w-2xl space-y-6">

        {/* Hero card */}
        <div className="card flex items-center gap-5">
          <AvatarUpload
            userId={user!.id}
            currentUrl={profile?.avatar_url ?? null}
            initials={initials}
            size="lg"
            onUploaded={() => refreshProfile()}
          />
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold truncate">{shop.business_name}</h2>
            <div className="text-sm text-steel-500 mt-0.5">{shop.cnpj}</div>
            <div className="flex items-center gap-3 mt-2">
              <span className="text-xs font-semibold text-steel-600 bg-steel-100 px-2.5 py-1 rounded-full">
                ★ {shop.rating.toFixed(1)}
              </span>
              <span className="text-xs font-semibold text-steel-600 bg-steel-100 px-2.5 py-1 rounded-full">
                {shop.total_jobs} jobs concluídos
              </span>
            </div>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={save} className="card space-y-5">
          <h3 className="font-bold text-steel-800">Informações da oficina</h3>

          <div>
            <label className="label">Nome fantasia / Razão social</label>
            <input className="input" required value={shop.business_name} onChange={set('business_name')} />
          </div>

          <div>
            <label className="label">CNPJ</label>
            <input className="input bg-steel-100 cursor-not-allowed" value={shop.cnpj} disabled
              title="O CNPJ não pode ser alterado" />
          </div>

          {/* CEP com busca automática */}
          <div>
            <label className="label">CEP</label>
            <div className="relative">
              <input
                className="input !pr-10"
                placeholder="00000-000"
                value={cep}
                maxLength={9}
                onChange={e => fetchCep(e.target.value)}
              />
              {cepLoading && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <div className="h-4 w-4 rounded-full border-2 border-brand-500 border-t-transparent animate-spin" />
                </div>
              )}
            </div>
            {cepError && <p className="text-xs text-red-500 mt-1">{cepError}</p>}
            {!cepError && cep.replace(/\D/g, '').length === 8 && !cepLoading && (
              <p className="text-xs text-signal-600 mt-1">✓ Endereço preenchido automaticamente</p>
            )}
          </div>

          <div>
            <label className="label">Endereço</label>
            <input className="input" value={shop.address} onChange={set('address')}
              placeholder="Rua, número, bairro" />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="label">Cidade</label>
              <input className="input" value={shop.city} onChange={set('city')} />
            </div>
            <div>
              <label className="label">UF</label>
              <input className="input uppercase" maxLength={2} value={shop.state}
                onChange={e => setShop({ ...shop, state: e.target.value.toUpperCase() })} />
            </div>
          </div>

          <div>
            <label className="label">Sobre a oficina</label>
            <textarea className="input" rows={3}
              placeholder="Descreva os serviços, diferenciais, anos de experiência…"
              value={shop.description ?? ''} onChange={set('description')} />
          </div>

          {/* Localização */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="label !mb-0">Localização no mapa</label>
              <button type="button" onClick={geocodeAddress} disabled={geoLoading}
                className="btn-primary !py-1.5 !px-3 text-xs disabled:opacity-60 flex items-center gap-1.5">
                {geoLoading
                  ? <><div className="h-3 w-3 rounded-full border border-white border-t-transparent animate-spin" /> Localizando…</>
                  : <>📍 Localizar endereço no mapa</>
                }
              </button>
            </div>

            <div className="bg-steel-50 border border-steel-200 rounded-xl p-4 space-y-3">
              <p className="text-xs text-steel-500">
                A localização é usada para que os mecânicos vejam sua oficina no mapa e recebam estimativa de chegada.
                Clique em <strong>"Localizar endereço no mapa"</strong> para converter automaticamente o endereço cadastrado acima em coordenadas. Ou preencha manualmente abaixo.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-xs text-steel-400 mb-1 font-medium">Latitude</div>
                  <input className="input font-mono text-sm" type="number" step="any"
                    placeholder="-23.5505"
                    value={shop.lat ?? ''}
                    onChange={e => setShop({ ...shop, lat: e.target.value ? Number(e.target.value) : null })} />
                </div>
                <div>
                  <div className="text-xs text-steel-400 mb-1 font-medium">Longitude</div>
                  <input className="input font-mono text-sm" type="number" step="any"
                    placeholder="-46.6333"
                    value={shop.lng ?? ''}
                    onChange={e => setShop({ ...shop, lng: e.target.value ? Number(e.target.value) : null })} />
                </div>
              </div>
            </div>

            {shop.lat && shop.lng ? (
              <div className="mt-2 flex items-center gap-1.5 text-xs text-signal-600 font-semibold">
                <span>✓</span>
                <span>Localização configurada · os mecânicos conseguem te encontrar no mapa</span>
              </div>
            ) : (
              <div className="mt-2 flex items-center gap-1.5 text-xs text-pending-600 font-semibold">
                <span>⚠️</span>
                <span>Sem localização — use o botão acima para definir automaticamente</span>
              </div>
            )}
          </div>

          {/* Feedback */}
          {msg && (
            <div className={`text-sm font-semibold px-4 py-2.5 rounded-xl ${
              msg.ok
                ? 'bg-signal-500/10 text-signal-700 border border-signal-200'
                : 'bg-alert-500/10 text-alert-700 border border-alert-200'
            }`}>
              {msg.ok ? '✓ ' : '✕ '}{msg.text}
            </div>
          )}

          <button className="btn-primary btn-lg w-full" disabled={busy}>
            {busy ? 'Salvando…' : 'Salvar alterações'}
          </button>
        </form>
      </div>
    </WorkshopLayout>
  );
}
