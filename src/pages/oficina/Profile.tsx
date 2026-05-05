import { FormEvent, useEffect, useState } from 'react';
import WorkshopLayout from '@/components/layout/WorkshopLayout';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { Workshop } from '@/types/database';

export default function WorkshopProfile() {
  const { user } = useAuth();
  const [shop, setShop]           = useState<Workshop | null>(null);
  const [loading, setLoading]     = useState(true);
  const [busy, setBusy]           = useState(false);
  const [geoLoading, setGeoLoading] = useState(false);
  const [msg, setMsg]             = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase.from('workshops').select('*').eq('profile_id', user.id).maybeSingle()
      .then(({ data }) => { setShop(data as Workshop); setLoading(false); });
  }, [user]);

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
    setMsg(error
      ? { text: error.message, ok: false }
      : { text: 'Alterações salvas com sucesso!', ok: true });
    setTimeout(() => setMsg(null), 4000);
  }

  function useGps() {
    if (!shop || !navigator.geolocation) return;
    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      pos => {
        setShop({ ...shop, lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGeoLoading(false);
      },
      () => {
        setGeoLoading(false);
        alert('Não foi possível obter a localização. Verifique as permissões do navegador.');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
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
      <div className="card max-w-md text-center py-12">
        <div className="text-4xl mb-3">🏪</div>
        <h2 className="text-xl font-bold">Perfil não encontrado</h2>
        <p className="text-sm text-steel-500 mt-2">Seu cadastro de oficina ainda não foi criado. Contate o suporte.</p>
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
          <div className="h-16 w-16 rounded-2xl bg-brand-500 grid place-items-center text-white text-2xl font-bold shrink-0 shadow-brand">
            {initials}
          </div>
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

          {/* Location */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="label !mb-0">Localização no mapa</label>
              <button type="button" onClick={useGps} disabled={geoLoading}
                className="btn-secondary !py-1.5 !px-3 text-xs disabled:opacity-60 flex items-center gap-1.5">
                {geoLoading
                  ? <><div className="h-3 w-3 rounded-full border border-brand-500 border-t-transparent animate-spin" /> Obtendo…</>
                  : <>📍 Usar minha localização</>
                }
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-xs text-steel-400 mb-1">Latitude</div>
                <input className="input font-mono text-sm" type="number" step="any"
                  placeholder="-23.5505"
                  value={shop.lat ?? ''}
                  onChange={e => setShop({ ...shop, lat: e.target.value ? Number(e.target.value) : null })} />
              </div>
              <div>
                <div className="text-xs text-steel-400 mb-1">Longitude</div>
                <input className="input font-mono text-sm" type="number" step="any"
                  placeholder="-46.6333"
                  value={shop.lng ?? ''}
                  onChange={e => setShop({ ...shop, lng: e.target.value ? Number(e.target.value) : null })} />
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
