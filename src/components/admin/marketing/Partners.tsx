import { FormEvent, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from '@/components/ui/Toast';
import { PartnerCard } from '@/components/paraVoce/Cards';
import { type Audience, type Partner, AUDIENCE_LABEL, PARTNER_CATEGORIES, partnerCategory } from '@/lib/paraVoce';
import { Empty, Modal, pct } from './ui';

type Draft = Omit<Partner, 'id' | 'views' | 'clicks' | 'created_at'> & { id?: string };

const EMPTY: Draft = {
  audience: 'all', name: '', category: 'autopecas', logo_url: null, benefit: '', description: '', coupon_code: '',
  link_url: '', starts_at: new Date().toISOString(), ends_at: null, active: true, priority: 0,
};

async function uploadImage(file: File, folder: string) {
  if (!/^image\/(png|jpe?g|webp|svg\+xml)$/.test(file.type)) throw new Error('Use PNG, JPG, WEBP ou SVG.');
  if (file.size > 3_000_000) throw new Error('Imagem até 3 MB.');
  const path = `${folder}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.]+/g, '-').toLowerCase()}`;
  const { error } = await supabase.storage.from('panel-banners').upload(path, file, { contentType: file.type });
  if (error) throw error;
  return supabase.storage.from('panel-banners').getPublicUrl(path).data.publicUrl;
}
export { uploadImage };

/** Vitrine de parceiros: cartões com benefício, cupom e link, mostrados em "Para você". */
export default function Partners() {
  const [list, setList] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Draft | null>(null);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase.from('panel_partners').select('*')
      .order('active', { ascending: false }).order('priority', { ascending: false }).order('created_at', { ascending: false });
    if (error) toast.error(error.message);
    setList((data ?? []) as Partner[]);
    setLoading(false);
  }
  useEffect(() => { void load(); }, []);

  async function toggle(p: Partner) {
    const { error } = await supabase.from('panel_partners').update({ active: !p.active }).eq('id', p.id);
    if (error) return toast.error(error.message);
    setList(l => l.map(x => (x.id === p.id ? { ...x, active: !p.active } : x)));
  }
  async function remove(p: Partner) {
    if (!confirm(`Apagar o parceiro "${p.name}"?`)) return;
    const { error } = await supabase.from('panel_partners').delete().eq('id', p.id);
    if (error) return toast.error(error.message);
    setList(l => l.filter(x => x.id !== p.id));
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-steel-500 max-w-xl">
          Parceiros aparecem em “Benefícios para você” no painel e na tela Para você. Os cliques mostram o interesse de cada um, um bom argumento para vender esse espaço.
        </p>
        <button className="btn-primary min-h-[44px]" onClick={() => setEditing({ ...EMPTY, starts_at: new Date().toISOString() })}>+ Novo parceiro</button>
      </div>

      {loading ? (
        <div className="bg-white border border-steel-200 rounded-2xl p-10 text-center text-steel-500 text-sm">Carregando…</div>
      ) : list.length === 0 ? (
        <Empty emoji="🤝" title="Nenhum parceiro ainda" text="Cadastre autopeças, lojas de ferramentas, cursos e outros parceiros que dão desconto para oficinas e mecânicos." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {list.map(p => (
            <div key={p.id} className={`space-y-2 ${p.active ? '' : 'opacity-60'}`}>
              <div className="pointer-events-none"><PartnerCard p={p} preview /></div>
              <div className="flex items-center justify-between gap-2 px-1 text-xs text-steel-500 flex-wrap">
                <span>{AUDIENCE_LABEL[p.audience]} · {partnerCategory(p.category).label}{p.active ? '' : ' · pausado'}</span>
                <span>{p.views} vistos · {p.clicks} cliques ({pct(p.clicks, p.views)})</span>
              </div>
              <div className="flex gap-2">
                <button className="btn-ghost text-sm" onClick={() => setEditing({ ...p })}>Editar</button>
                <button className="btn-ghost text-sm" onClick={() => toggle(p)}>{p.active ? 'Pausar' : 'Reativar'}</button>
                <button className="btn-ghost text-sm text-steel-500 hover:text-alert-600" onClick={() => remove(p)}>Apagar</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && <PartnerForm initial={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void load(); }} />}
    </div>
  );
}

function PartnerForm({ initial, onClose, onSaved }: { initial: Draft; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<Draft>(initial);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const isNew = !initial.id;
  const up = <K extends keyof Draft>(k: K, v: Draft[K]) => setF(p => ({ ...p, [k]: v }));

  async function onLogo(file?: File) {
    if (!file) return;
    setUploading(true);
    try { up('logo_url', await uploadImage(file, 'parceiros')); } catch (e) { toast.error((e as Error).message); }
    setUploading(false);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (f.name.trim().length < 2) return toast.error('Nome do parceiro.');
    if (f.benefit.trim().length < 3) return toast.error('Escreva o benefício (ex: 10% de desconto em peças).');
    const link = f.link_url?.trim() || '';
    if (link && !link.startsWith('https://')) return toast.error('O link precisa começar com https://');
    if (!link && !f.coupon_code?.trim()) return toast.error('Coloque um cupom, um link, ou os dois.');
    setSaving(true);
    const row = {
      audience: f.audience, name: f.name.trim(), category: f.category, logo_url: f.logo_url,
      benefit: f.benefit.trim(), description: f.description?.trim() || null,
      coupon_code: f.coupon_code?.trim().toUpperCase() || null, link_url: link || null,
      starts_at: f.starts_at, ends_at: f.ends_at, active: f.active, priority: f.priority,
    };
    const { error } = isNew
      ? await supabase.from('panel_partners').insert(row)
      : await supabase.from('panel_partners').update(row).eq('id', initial.id!);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(isNew ? 'Parceiro publicado ✓' : 'Parceiro salvo ✓');
    onSaved();
  }

  const previewP = { ...f, id: 'preview', views: 0, clicks: 0, created_at: '', name: f.name || 'Nome do parceiro', benefit: f.benefit || 'Benefício em destaque' } as Partner;

  return (
    <Modal title={isNew ? 'Novo parceiro' : 'Editar parceiro'} onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <div className="bg-steel-100 rounded-xl p-3">
          <div className="max-w-[280px] mx-auto pointer-events-none"><PartnerCard p={previewP} preview /></div>
        </div>
        <div>
          <div className="label">Quem vê</div>
          <div className="grid grid-cols-3 gap-2">
            {(['mechanic', 'workshop', 'all'] as Audience[]).map(a => (
              <button key={a} type="button" onClick={() => up('audience', a)}
                className={`min-h-[44px] rounded-lg border-2 text-sm font-semibold ${f.audience === a ? 'border-brand-500 text-brand-700 bg-brand-50' : 'border-steel-200 text-steel-600'}`}>
                {AUDIENCE_LABEL[a]}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><label className="label">Nome do parceiro</label>
            <input className="input" value={f.name} maxLength={50} onChange={e => up('name', e.target.value)} /></div>
          <div><label className="label">Categoria</label>
            <select className="input" value={f.category} onChange={e => up('category', e.target.value)}>
              {PARTNER_CATEGORIES.map(c => <option key={c.v} value={c.v}>{c.emoji} {c.label}</option>)}
            </select></div>
        </div>
        <div><label className="label">Benefício (aparece em destaque)</label>
          <input className="input" value={f.benefit} maxLength={60} placeholder="Ex: 10% de desconto em peças" onChange={e => up('benefit', e.target.value)} /></div>
        <div><label className="label">Detalhes (opcional)</label>
          <textarea className="input" rows={2} maxLength={220} value={f.description ?? ''} placeholder="Como usar, regras, lojas participantes…" onChange={e => up('description', e.target.value)} /></div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><label className="label">Cupom (opcional)</label>
            <input className="input uppercase font-mono" value={f.coupon_code ?? ''} maxLength={30} onChange={e => up('coupon_code', e.target.value)} /></div>
          <div><label className="label">Link da oferta (opcional)</label>
            <input className="input" value={f.link_url ?? ''} placeholder="https://…" onChange={e => up('link_url', e.target.value)} /></div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <label className="btn-secondary text-sm cursor-pointer min-h-[40px] inline-flex items-center">
            {uploading ? 'Enviando…' : f.logo_url ? 'Trocar logo' : 'Enviar logo do parceiro'}
            <input type="file" accept="image/*" className="hidden" onChange={e => { void onLogo(e.target.files?.[0]); e.target.value = ''; }} />
          </label>
          {f.logo_url && <button type="button" className="text-sm text-steel-600" onClick={() => up('logo_url', null)}>Tirar logo</button>}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><label className="label">Sai do ar (opcional)</label>
            <input className="input" type="date" value={f.ends_at ? f.ends_at.slice(0, 10) : ''}
              onChange={e => up('ends_at', e.target.value ? new Date(e.target.value + 'T23:59:00').toISOString() : null)} /></div>
          <div><label className="label">Ordem</label>
            <select className="input" value={f.priority} onChange={e => up('priority', Number(e.target.value))}>
              <option value={0}>Normal</option><option value={10}>Destaque (primeiro)</option>
            </select></div>
        </div>
        <button className="btn-primary w-full min-h-[44px]" disabled={saving || uploading}>{saving ? 'Salvando…' : isNew ? 'Publicar parceiro' : 'Salvar'}</button>
      </form>
    </Modal>
  );
}
