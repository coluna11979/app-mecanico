import { FormEvent, useEffect, useState } from 'react';
import WorkshopLayout from '@/components/layout/WorkshopLayout';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { Workshop } from '@/types/database';

export default function WorkshopProfile() {
  const { user } = useAuth();
  const [shop, setShop] = useState<Workshop | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase.from('workshops').select('*').eq('profile_id', user.id).maybeSingle()
      .then(({ data }) => setShop(data as Workshop));
  }, [user]);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!shop) return;
    setBusy(true); setMsg(null);
    const { error } = await supabase.from('workshops').update({
      business_name: shop.business_name, address: shop.address, city: shop.city,
      state: shop.state, description: shop.description, lat: shop.lat, lng: shop.lng,
    }).eq('id', shop.id);
    setBusy(false);
    setMsg(error ? error.message : 'Salvo!');
  }

  if (!shop) return <WorkshopLayout><div className="text-steel-500">Carregando…</div></WorkshopLayout>;

  return (
    <WorkshopLayout>
      <h1 className="text-3xl font-bold tracking-tight mb-6">Perfil da oficina</h1>
      <form onSubmit={save} className="card max-w-2xl space-y-4">
        <div><label className="label">Razão social / Nome fantasia</label>
          <input className="input" value={shop.business_name} onChange={e => setShop({ ...shop, business_name: e.target.value })} /></div>
        <div><label className="label">CNPJ (não editável)</label>
          <input className="input bg-steel-100" value={shop.cnpj} disabled /></div>
        <div><label className="label">Endereço</label>
          <input className="input" value={shop.address} onChange={e => setShop({ ...shop, address: e.target.value })} /></div>
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2"><label className="label">Cidade</label>
            <input className="input" value={shop.city} onChange={e => setShop({ ...shop, city: e.target.value })} /></div>
          <div><label className="label">UF</label>
            <input className="input" value={shop.state} onChange={e => setShop({ ...shop, state: e.target.value })} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">Latitude</label>
            <input className="input" type="number" step="any" value={shop.lat ?? ''} onChange={e => setShop({ ...shop, lat: e.target.value ? Number(e.target.value) : null })} /></div>
          <div><label className="label">Longitude</label>
            <input className="input" type="number" step="any" value={shop.lng ?? ''} onChange={e => setShop({ ...shop, lng: e.target.value ? Number(e.target.value) : null })} /></div>
        </div>
        <div><label className="label">Sobre</label>
          <textarea className="input" rows={3} value={shop.description ?? ''} onChange={e => setShop({ ...shop, description: e.target.value })} /></div>
        {msg && <div className="text-sm text-signal-600 bg-signal-500/10 px-3 py-2 rounded-lg">{msg}</div>}
        <button className="btn-primary" disabled={busy}>{busy ? 'Salvando…' : 'Salvar alterações'}</button>
      </form>
    </WorkshopLayout>
  );
}
