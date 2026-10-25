import { FormEvent, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { supabase } from '@/lib/supabase';
import { toast } from '@/components/ui/Toast';
import { AUDIENCES, CHANNELS, Card, Empty, Modal, appOrigin, audienceLabel, brl, channelLabel, copy, pct, slugify } from './ui';
import type { FunnelRow } from './Overview';

export interface Campaign {
  id: string;
  name: string;
  slug: string;
  channel: string;
  audience: 'mechanic' | 'workshop' | 'all';
  destination: string;
  cost: number;
  starts_on: string | null;
  ends_on: string | null;
  status: 'ativa' | 'pausada' | 'encerrada';
  notes: string | null;
  created_at: string;
}

const DESTINATIONS = [
  { v: '/',                  label: 'Página inicial' },
  { v: '/mecanico',          label: 'Página do mecânico' },
  { v: '/oficina',           label: 'Página da oficina' },
  { v: '/cadastro/mecanico', label: 'Direto no cadastro de mecânico' },
  { v: '/cadastro/oficina',  label: 'Direto no cadastro de oficina' },
];

const STATUS_STYLE: Record<Campaign['status'], string> = {
  ativa: 'bg-signal-500/10 text-signal-700',
  pausada: 'bg-pending-500/10 text-pending-700',
  encerrada: 'bg-steel-100 text-steel-500',
};

export const campaignUrl = (slug: string) => `${appOrigin()}/c/${slug}`;

export default function Campaigns() {
  const [list, setList] = useState<Campaign[]>([]);
  const [stats, setStats] = useState<Record<string, FunnelRow>>({});
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<Campaign> | null>(null);
  const [qr, setQr] = useState<Campaign | null>(null);

  async function load() {
    setLoading(true);
    const [c, f] = await Promise.all([
      supabase.from('marketing_campaigns').select('*').order('created_at', { ascending: false }),
      supabase.rpc('marketing_funnel', { p_from: '2020-01-01T00:00:00Z' }),
    ]);
    setList(((c.data ?? []) as Campaign[]).map(x => ({ ...x, cost: +x.cost })));
    const map: Record<string, FunnelRow> = {};
    for (const r of (f.data ?? []) as FunnelRow[]) if (r.campaign_id) map[r.campaign_id] = r;
    setStats(map);
    setLoading(false);
  }
  useEffect(() => { void load(); }, []);

  async function setStatus(c: Campaign, status: Campaign['status']) {
    const { error } = await supabase.from('marketing_campaigns').update({ status }).eq('id', c.id);
    if (error) return toast.error(error.message);
    setList(l => l.map(x => (x.id === c.id ? { ...x, status } : x)));
  }

  async function copyLink(c: Campaign) {
    if (await copy(campaignUrl(c.slug))) toast.success('Link copiado ✓');
    else toast.error('Não deu pra copiar — selecione o link e copie manualmente.');
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-steel-500 max-w-xl">
          Cada campanha ganha um link curto (e QR code). Quem entrar por ele fica marcado, e você vê aqui quantos cadastros cada uma trouxe.
        </p>
        <button className="btn-primary" onClick={() => setEditing({ channel: 'instagram', audience: 'all', destination: '/', cost: 0, status: 'ativa' })}>
          + Nova campanha
        </button>
      </div>

      {loading ? (
        <div className="bg-white border border-steel-200 rounded-2xl p-10 text-center text-steel-500 text-sm">Carregando…</div>
      ) : list.length === 0 ? (
        <Empty emoji="📣" title="Nenhuma campanha ainda"
          text="Crie a primeira: por exemplo, um post no Instagram para mecânicos. Você recebe o link pra colocar na bio ou no anúncio." />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {list.map(c => {
            const s = stats[c.id];
            const ch = channelLabel(c.channel);
            return (
              <div key={c.id} className="bg-white border border-steel-200 rounded-2xl p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-bold text-steel-900 truncate">{ch.emoji} {c.name}</div>
                    <div className="text-xs text-steel-500 mt-0.5">
                      {ch.label} · {audienceLabel(c.audience)}{c.cost > 0 && ` · ${brl(c.cost)}`}
                    </div>
                  </div>
                  <span className={`text-xs font-semibold px-2 py-1 rounded-lg shrink-0 ${STATUS_STYLE[c.status]}`}>{c.status}</span>
                </div>

                <div className="mt-3 flex items-center gap-2 bg-steel-50 border border-steel-200 rounded-xl px-3 py-2">
                  <code className="text-xs text-steel-700 truncate flex-1">{campaignUrl(c.slug).replace(/^https?:\/\//, '')}</code>
                  <button onClick={() => copyLink(c)} className="text-xs font-semibold text-brand-600 hover:underline min-h-[36px] px-1">Copiar</button>
                  <button onClick={() => setQr(c)} className="text-xs font-semibold text-brand-600 hover:underline min-h-[36px] px-1">QR</button>
                </div>

                <div className="grid grid-cols-4 gap-2 mt-3 text-center">
                  <Stat label="Cliques" v={s?.clicks ?? 0} />
                  <Stat label="Leads" v={s?.leads ?? 0} />
                  <Stat label="Cadastros" v={s?.signups ?? 0} sub={s ? pct(+s.signups, +s.clicks) : undefined} />
                  <Stat label="Ativos" v={s?.activated ?? 0} />
                </div>

                <div className="flex gap-2 mt-3 flex-wrap">
                  <button className="btn-ghost text-sm" onClick={() => setEditing(c)}>Editar</button>
                  {c.status === 'ativa'
                    ? <button className="btn-ghost text-sm" onClick={() => setStatus(c, 'pausada')}>Pausar</button>
                    : <button className="btn-ghost text-sm" onClick={() => setStatus(c, 'ativa')}>Reativar</button>}
                  {c.status !== 'encerrada' && <button className="btn-ghost text-sm text-steel-500" onClick={() => setStatus(c, 'encerrada')}>Encerrar</button>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editing && <CampaignForm initial={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void load(); }} />}
      {qr && <QrModal campaign={qr} onClose={() => setQr(null)} />}
    </div>
  );
}

function Stat({ label, v, sub }: { label: string; v: number; sub?: string }) {
  return (
    <div className="bg-steel-50 rounded-xl py-2">
      <div className="text-lg font-bold text-steel-900">{v}</div>
      <div className="text-[10px] uppercase tracking-wide text-steel-500">{label}{sub && sub !== '—' ? ` · ${sub}` : ''}</div>
    </div>
  );
}

function CampaignForm({ initial, onClose, onSaved }: { initial: Partial<Campaign>; onClose: () => void; onSaved: () => void }) {
  const isNew = !initial.id;
  const [f, setF] = useState({
    name: initial.name ?? '',
    slug: initial.slug ?? '',
    channel: initial.channel ?? 'instagram',
    audience: initial.audience ?? 'all',
    destination: initial.destination ?? '/',
    cost: String(initial.cost ?? 0),
    starts_on: initial.starts_on ?? '',
    ends_on: initial.ends_on ?? '',
    notes: initial.notes ?? '',
  });
  const [slugTouched, setSlugTouched] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const up = <K extends keyof typeof f>(k: K, v: string) => setF(p => ({ ...p, [k]: v }));

  async function save(e: FormEvent) {
    e.preventDefault();
    const slug = slugify(f.slug || f.name);
    if (f.name.trim().length < 3) return toast.error('Dê um nome para a campanha.');
    if (slug.length < 2) return toast.error('O link precisa de pelo menos 2 letras.');
    const cost = Number(f.cost.replace(',', '.')) || 0;
    setSaving(true);
    const row = {
      name: f.name.trim(), slug, channel: f.channel, audience: f.audience, destination: f.destination,
      cost, starts_on: f.starts_on || null, ends_on: f.ends_on || null, notes: f.notes.trim() || null,
    };
    const { error } = isNew
      ? await supabase.from('marketing_campaigns').insert(row)
      : await supabase.from('marketing_campaigns').update(row).eq('id', initial.id!);
    setSaving(false);
    if (error) return toast.error(/duplicate|unique/i.test(error.message) ? 'Já existe uma campanha com esse link. Troque o final do link.' : error.message);
    toast.success(isNew ? 'Campanha criada ✓' : 'Campanha salva ✓');
    onSaved();
  }

  return (
    <Modal title={isNew ? 'Nova campanha' : 'Editar campanha'} onClose={onClose}>
      <form onSubmit={save} className="space-y-3">
        <div>
          <label className="label">Nome</label>
          <input className="input" value={f.name} placeholder="Ex: Instagram outubro — mecânicos"
            onChange={e => { up('name', e.target.value); if (!slugTouched) up('slug', slugify(e.target.value)); }} />
        </div>
        <div>
          <label className="label">Link</label>
          <div className="flex items-center input !p-0 overflow-hidden">
            <span className="pl-3 text-steel-400 text-sm whitespace-nowrap">/c/</span>
            <input className="flex-1 px-1 py-2.5 outline-none bg-transparent" value={f.slug}
              onChange={e => { setSlugTouched(true); up('slug', slugify(e.target.value)); }} />
          </div>
          {!isNew && <p className="text-xs text-pending-700 mt-1">Mudar o link quebra os que já foram divulgados.</p>}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Canal</label>
            <select className="input" value={f.channel} onChange={e => up('channel', e.target.value)}>
              {CHANNELS.map(c => <option key={c.v} value={c.v}>{c.emoji} {c.label}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Público</label>
            <select className="input" value={f.audience} onChange={e => up('audience', e.target.value)}>
              {AUDIENCES.map(a => <option key={a.v} value={a.v}>{a.label}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="label">Para onde o link leva</label>
          <select className="input" value={f.destination} onChange={e => up('destination', e.target.value)}>
            {DESTINATIONS.map(d => <option key={d.v} value={d.v}>{d.label}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="label">Investimento (R$)</label>
            <input className="input" inputMode="decimal" value={f.cost} onChange={e => up('cost', e.target.value)} />
          </div>
          <div>
            <label className="label">Início</label>
            <input className="input" type="date" value={f.starts_on} onChange={e => up('starts_on', e.target.value)} />
          </div>
          <div>
            <label className="label">Fim</label>
            <input className="input" type="date" value={f.ends_on} onChange={e => up('ends_on', e.target.value)} />
          </div>
        </div>
        <div>
          <label className="label">Anotações (opcional)</label>
          <textarea className="input" rows={2} value={f.notes} onChange={e => up('notes', e.target.value)} />
        </div>
        <button className="btn-primary w-full" disabled={saving}>{saving ? 'Salvando…' : 'Salvar'}</button>
      </form>
    </Modal>
  );
}

function QrModal({ campaign, onClose }: { campaign: Campaign; onClose: () => void }) {
  const [src, setSrc] = useState<string | null>(null);
  const url = campaignUrl(campaign.slug);
  useEffect(() => {
    QRCode.toDataURL(url, { width: 640, margin: 2, color: { dark: '#111827', light: '#FFFFFF' } }).then(setSrc);
  }, [url]);

  return (
    <Modal title={`QR code — ${campaign.name}`} onClose={onClose}>
      <div className="text-center">
        {src ? <img src={src} alt="QR code da campanha" className="mx-auto w-64 h-64" /> : <div className="h-64 grid place-items-center text-steel-400">Gerando…</div>}
        <p className="text-xs text-steel-500 mt-2 break-all">{url}</p>
        <p className="text-sm text-steel-600 mt-3">Use em panfleto, adesivo, cartão ou banner. Cada leitura conta como clique.</p>
        {src && (
          <a href={src} download={`qr-${campaign.slug}.png`} className="btn-primary inline-block mt-4">Baixar PNG</a>
        )}
      </div>
    </Modal>
  );
}
