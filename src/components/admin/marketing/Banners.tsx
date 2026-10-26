import { FormEvent, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from '@/components/ui/Toast';
import {
  BANNER_BADGES, BANNER_THEMES, BannerCard, DEMO_BANNERS,
  type BannerBadge, type BannerTheme, type PanelBanner,
} from '@/components/banners/BannerCard';
import { Empty, Modal, pct } from './ui';
import LibraryPicker, { countUse } from './LibraryPicker';

const AUDIENCE_LABEL: Record<PanelBanner['audience'], string> = {
  workshop: '🏭 Oficinas', mechanic: '🔧 Mecânicos', all: '👥 Todos',
};

/** Atalhos para destinos do app (o admin também pode colar um link https). */
const DESTINATIONS: { audience: PanelBanner['audience'] | 'any'; label: string; url: string }[] = [
  { audience: 'mechanic', label: 'Painel do mecânico',   url: '/mecanico/dashboard' },
  { audience: 'mechanic', label: 'Perfil do mecânico',   url: '/mecanico/perfil' },
  { audience: 'mechanic', label: 'Programa Embaixador',  url: '/mecanico/embaixador' },
  { audience: 'mechanic', label: 'Ganhos',               url: '/mecanico/ganhos' },
  { audience: 'mechanic', label: 'Agenda do mecânico',   url: '/mecanico/agenda' },
  { audience: 'workshop', label: 'Demandas (chamar mecânico)', url: '/oficina/dashboard' },
  { audience: 'workshop', label: 'Início da oficina',    url: '/oficina/inicio' },
];

type Draft = Omit<PanelBanner, 'id' | 'views' | 'clicks' | 'created_at'> & { id?: string };

/** Modelos prontos para começar rápido. */
const TEMPLATES: { name: string; draft: Partial<Draft> }[] = [
  { name: '🌟 Seja embaixador (mecânico)', draft: {
    audience: 'mechanic', theme: 'laranja', badge: 'novidade',
    title: 'Indique mecânicos e ganhe com isso',
    body: 'Vire embaixador: você recebe uma parte da nossa comissão pelos serviços de quem você indicar.',
    cta_label: 'Quero ser embaixador', cta_url: '/mecanico/embaixador' } },
  { name: '👤 Complete seu perfil (mecânico)', draft: {
    audience: 'mechanic', theme: 'grafite', badge: 'aviso',
    title: 'Perfil completo recebe mais chamados',
    body: 'Foto, especialidades e valor/hora em dia ajudam as oficinas a escolherem você.',
    cta_label: 'Completar perfil', cta_url: '/mecanico/perfil' } },
  { name: '⚡ Chame reforço (oficina)', draft: {
    audience: 'workshop', theme: 'grafite', badge: 'novidade',
    title: 'Pátio cheio? Chame um mecânico em minutos',
    body: 'Publique a demanda e profissionais verificados da sua região aceitam.',
    cta_label: 'Chamar mecânico', cta_url: '/oficina/dashboard' } },
  { name: '🚀 Lançamento (todos)', draft: {
    audience: 'all', theme: 'impacto', badge: 'lancamento',
    title: 'Novidade no MecânicoApp',
    body: 'Escreva aqui o que mudou e por que é bom para quem usa.' } },
];

const EMPTY: Draft = {
  audience: 'mechanic', title: '', body: '', cta_label: '', cta_url: '', theme: 'grafite', badge: null,
  image_url: null, starts_at: new Date().toISOString(), ends_at: null, active: true, priority: 0, dismissible: true,
};

function status(b: PanelBanner) {
  const now = Date.now();
  if (!b.active) return { label: 'pausado', cls: 'bg-steel-100 text-steel-500' };
  if (new Date(b.starts_at).getTime() > now) return { label: 'agendado', cls: 'bg-blue-50 text-blue-700' };
  if (b.ends_at && new Date(b.ends_at).getTime() <= now) return { label: 'encerrado', cls: 'bg-steel-100 text-steel-500' };
  return { label: 'no ar', cls: 'bg-signal-500/10 text-signal-700' };
}

/** datetime-local ⇄ ISO */
const toLocal = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const fromLocal = (v: string) => (v ? new Date(v).toISOString() : null);

export default function Banners() {
  const [list, setList] = useState<PanelBanner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Draft | null>(null);

  async function load() {
    setLoading(true);
    const { data, error: err } = await supabase.from('panel_banners').select('*')
      .order('active', { ascending: false }).order('priority', { ascending: false }).order('created_at', { ascending: false });
    setError(err ? err.message : null);
    // No localhost, sem a tabela no banco: mostra exemplos pra ver o visual
    setList(err && import.meta.env.DEV ? DEMO_BANNERS : (data ?? []) as PanelBanner[]);
    setLoading(false);
  }
  useEffect(() => { void load(); }, []);

  async function toggle(b: PanelBanner) {
    const { error: err } = await supabase.from('panel_banners').update({ active: !b.active }).eq('id', b.id);
    if (err) return toast.error(err.message);
    setList(l => l.map(x => (x.id === b.id ? { ...x, active: !b.active } : x)));
  }

  async function remove(b: PanelBanner) {
    if (!confirm(`Apagar o banner "${b.title}"? Os números dele também somem.`)) return;
    const { error: err } = await supabase.from('panel_banners').delete().eq('id', b.id);
    if (err) return toast.error(err.message);
    setList(l => l.filter(x => x.id !== b.id));
    toast.success('Banner apagado');
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-steel-500 max-w-xl">
          Banners aparecem no topo do painel da oficina ou do mecânico. Use para novidades, promoções e avisos.
          Com mais de um no ar, a pessoa desliza para ver os outros.
        </p>
        <button className="btn-primary min-h-[44px]" onClick={() => setEditing({ ...EMPTY, starts_at: new Date().toISOString() })}>+ Novo banner</button>
      </div>

      {error && import.meta.env.DEV && (
        <div className="bg-pending-500/10 border border-pending-500/30 text-pending-800 rounded-2xl p-4 text-sm">
          <b>Exemplos locais.</b> A tabela de banners ainda não foi criada no banco, então aqui aparecem banners de exemplo
          só para ver o visual. Criar, editar e pausar passam a funcionar depois da tabela criada.
        </div>
      )}
      {error && !import.meta.env.DEV && (
        <div className="bg-alert-500/10 text-alert-700 rounded-2xl p-4 text-sm">
          Não deu para carregar os banners: {error}
          {/relation .* does not exist|panel_banners/.test(error) && ' (a tabela ainda não foi criada no banco).'}
        </div>
      )}

      {loading ? (
        <div className="bg-white border border-steel-200 rounded-2xl p-10 text-center text-steel-500 text-sm">Carregando…</div>
      ) : list.length === 0 && !error ? (
        <Empty emoji="🪧" title="Nenhum banner ainda"
          text="Comece por um modelo: convite para o programa de embaixadores, aviso para completar o perfil ou novidade para oficinas." />
      ) : (
        <div className="space-y-3">
          {list.map(b => {
            const st = status(b);
            return (
              <div key={b.id} className="bg-white border border-steel-200 rounded-2xl p-3 sm:p-4 grid grid-cols-1 lg:grid-cols-[minmax(0,420px)_1fr] gap-4 items-center">
                <div className="pointer-events-none"><BannerCard b={b} /></div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs font-semibold px-2 py-1 rounded-lg ${st.cls}`}>{st.label}</span>
                    <span className="text-xs text-steel-500">{AUDIENCE_LABEL[b.audience]}</span>
                    {b.priority > 0 && <span className="text-xs text-steel-500">· prioridade {b.priority}</span>}
                  </div>
                  <div className="text-xs text-steel-500 mt-1.5">
                    {new Date(b.starts_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                    {' → '}{b.ends_at ? new Date(b.ends_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : 'sem data para sair'}
                  </div>
                  <div className="grid grid-cols-3 gap-2 mt-3 max-w-sm text-center">
                    <div className="bg-steel-50 rounded-xl py-2"><div className="font-bold text-steel-900">{b.views}</div><div className="text-[10px] uppercase text-steel-500">vistos</div></div>
                    <div className="bg-steel-50 rounded-xl py-2"><div className="font-bold text-steel-900">{b.clicks}</div><div className="text-[10px] uppercase text-steel-500">cliques</div></div>
                    <div className="bg-steel-50 rounded-xl py-2"><div className="font-bold text-steel-900">{pct(b.clicks, b.views)}</div><div className="text-[10px] uppercase text-steel-500">taxa</div></div>
                  </div>
                  <div className="flex gap-2 mt-3 flex-wrap">
                    <button className="btn-ghost text-sm" onClick={() => setEditing({ ...b })}>Editar</button>
                    <button className="btn-ghost text-sm" onClick={() => toggle(b)}>{b.active ? 'Pausar' : 'Reativar'}</button>
                    <button className="btn-ghost text-sm text-steel-500 hover:text-alert-600" onClick={() => remove(b)}>Apagar</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editing && <BannerForm initial={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void load(); }} />}
    </div>
  );
}

function BannerForm({ initial, onClose, onSaved }: { initial: Draft; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<Draft>(initial);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const isNew = !initial.id;
  const up = <K extends keyof Draft>(k: K, v: Draft[K]) => setF(p => ({ ...p, [k]: v }));
  const dests = DESTINATIONS.filter(d => f.audience === 'all' || d.audience === f.audience);

  async function upload(file: File | undefined) {
    if (!file) return;
    if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) return toast.error('Use PNG, JPG ou WEBP.');
    if (file.size > 3_000_000) return toast.error('Imagem até 3 MB.');
    setUploading(true);
    const path = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.]+/g, '-').toLowerCase()}`;
    const { error } = await supabase.storage.from('panel-banners').upload(path, file, { contentType: file.type, upsert: false });
    setUploading(false);
    if (error) return toast.error(`Upload falhou: ${error.message}`);
    up('image_url', supabase.storage.from('panel-banners').getPublicUrl(path).data.publicUrl);
    up('illustration_url', null);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (f.title.trim().length < 3) return toast.error('Escreva um título.');
    const cta = f.cta_url?.trim() || '';
    if (cta && !cta.startsWith('/') && !cta.startsWith('https://')) return toast.error('O link do botão precisa começar com / (página do app) ou https://');
    if (cta && !f.cta_label?.trim()) return toast.error('Escreva o texto do botão.');
    if (f.ends_at && new Date(f.ends_at) <= new Date(f.starts_at)) return toast.error('A data de saída precisa ser depois da entrada.');
    setSaving(true);
    const row = {
      audience: f.audience, title: f.title.trim(), body: f.body?.trim() || null,
      cta_label: cta ? f.cta_label!.trim() : null, cta_url: cta || null,
      theme: f.theme, badge: f.badge, image_url: f.image_url, starts_at: f.starts_at, ends_at: f.ends_at,
      active: f.active, priority: f.priority, dismissible: f.dismissible,
      // Só manda o campo quando há ilustração (ou havia): banner sem ilustração salva mesmo antes da coluna existir
      ...(f.illustration_url || initial.illustration_url ? { illustration_url: f.illustration_url ?? null } : {}),
    };
    let err;
    if (isNew) {
      const { data: { user } } = await supabase.auth.getUser();
      ({ error: err } = await supabase.from('panel_banners').insert({ ...row, created_by: user?.id ?? null }));
    } else {
      ({ error: err } = await supabase.from('panel_banners').update(row).eq('id', initial.id!));
    }
    setSaving(false);
    if (err) return toast.error(err.message);
    toast.success(isNew ? 'Banner criado ✓' : 'Banner salvo ✓');
    onSaved();
  }

  return (
    <Modal title={isNew ? 'Novo banner' : 'Editar banner'} onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        {isNew && (
          <div>
            <div className="label">Começar de um modelo</div>
            <div className="flex gap-2 flex-wrap">
              {TEMPLATES.map(t => (
                <button key={t.name} type="button" onClick={() => setF(p => ({ ...p, ...t.draft }))}
                  className="text-xs font-semibold px-3 py-2 min-h-[36px] rounded-lg border border-steel-200 hover:border-brand-400 hover:text-brand-600">
                  {t.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Prévia no tamanho do celular */}
        <div className="bg-steel-100 rounded-xl p-3">
          <div className="text-[11px] font-semibold text-steel-500 uppercase tracking-wide mb-2">Prévia no celular</div>
          <div className="max-w-[343px] mx-auto pointer-events-none">
            <BannerCard b={{ ...f, title: f.title || 'Título do banner', cta_label: f.cta_label || null, cta_url: f.cta_url || null }} onDismiss={() => {}} />
          </div>
        </div>

        <div>
          <div className="label">Quem vê</div>
          <div className="grid grid-cols-3 gap-2">
            {(['mechanic', 'workshop', 'all'] as const).map(a => (
              <button key={a} type="button" onClick={() => up('audience', a)}
                className={`min-h-[44px] rounded-lg border-2 text-sm font-semibold ${f.audience === a ? 'border-brand-500 text-brand-700 bg-brand-50' : 'border-steel-200 text-steel-600'}`}>
                {AUDIENCE_LABEL[a]}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="label">Título</label>
          <input className="input" value={f.title} maxLength={80} onChange={e => up('title', e.target.value)} />
        </div>
        <div>
          <label className="label">Texto (opcional)</label>
          <textarea className="input" rows={2} value={f.body ?? ''} maxLength={180} onChange={e => up('body', e.target.value)} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="label">Texto do botão (opcional)</label>
            <input className="input" value={f.cta_label ?? ''} maxLength={30} placeholder="Ex: Saiba mais" onChange={e => up('cta_label', e.target.value)} />
          </div>
          <div>
            <label className="label">Para onde o botão leva</label>
            <input className="input" value={f.cta_url ?? ''} placeholder="/mecanico/perfil ou https://…" list="banner-dests"
              onChange={e => up('cta_url', e.target.value)} />
            <datalist id="banner-dests">
              {dests.map(d => <option key={d.url} value={d.url}>{d.label}</option>)}
            </datalist>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <div className="label">Tema</div>
            <div className="grid grid-cols-4 gap-1.5">
              {BANNER_THEMES.map(t => (
                <button key={t.v} type="button" onClick={() => up('theme', t.v as BannerTheme)}
                  className={`min-h-[40px] rounded-lg border-2 text-xs font-semibold ${f.theme === t.v ? 'border-brand-500 text-brand-700 bg-brand-50' : 'border-steel-200 text-steel-600'}`}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="label">Selo</label>
            <select className="input" value={f.badge ?? ''} onChange={e => up('badge', (e.target.value || null) as BannerBadge | null)}>
              <option value="">Sem selo</option>
              {BANNER_BADGES.map(b => <option key={b.v} value={b.v}>{b.emoji} {b.label}</option>)}
            </select>
          </div>
        </div>

        <div className="border border-steel-200 rounded-xl p-3">
          <div className="label">🎨 Ilustração da biblioteca (opcional)</div>
          <p className="text-xs text-steel-500 mb-2">Fica ao lado do texto (em cima, no celular), no estilo dos cartões de apps grandes.</p>
          <LibraryPicker selected={f.illustration_url ?? null} audience={f.audience}
            onPick={i => { up('illustration_url', i?.url ?? null); if (i) { up('image_url', null); countUse(i); } }} />
        </div>

        <div className="border border-steel-200 rounded-xl p-3">
          <div className="label">Arte pronta (opcional)</div>
          <p className="text-xs text-steel-500 mb-2">Se subir uma imagem (feita no Canva, por exemplo), ela substitui o desenho. Tamanho bom: 1200×400.</p>
          <div className="flex items-center gap-2 flex-wrap">
            <label className="btn-secondary text-sm cursor-pointer min-h-[40px] inline-flex items-center">
              {uploading ? 'Enviando…' : f.image_url ? 'Trocar imagem' : 'Escolher imagem'}
              <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" disabled={uploading}
                onChange={e => { void upload(e.target.files?.[0]); e.target.value = ''; }} />
            </label>
            {f.image_url && <button type="button" className="text-sm font-semibold text-steel-600 hover:text-alert-600" onClick={() => up('image_url', null)}>Tirar imagem</button>}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="label">Entra no ar</label>
            <input className="input" type="datetime-local" value={toLocal(f.starts_at)} onChange={e => up('starts_at', fromLocal(e.target.value) ?? new Date().toISOString())} />
          </div>
          <div>
            <label className="label">Sai do ar (opcional)</label>
            <input className="input" type="datetime-local" value={toLocal(f.ends_at)} onChange={e => up('ends_at', fromLocal(e.target.value))} />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="label">Ordem</label>
            <select className="input" value={f.priority} onChange={e => up('priority', Number(e.target.value))}>
              <option value={0}>Normal</option>
              <option value={10}>Primeiro da fila</option>
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm text-steel-700 min-h-[44px] cursor-pointer sm:mt-6">
            <input type="checkbox" className="h-5 w-5 rounded border-steel-300 text-brand-500" checked={f.dismissible} onChange={e => up('dismissible', e.target.checked)} />
            A pessoa pode fechar o banner
          </label>
        </div>

        <button className="btn-primary w-full min-h-[44px]" disabled={saving || uploading}>{saving ? 'Salvando…' : isNew ? 'Publicar banner' : 'Salvar'}</button>
      </form>
    </Modal>
  );
}
