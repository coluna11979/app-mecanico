import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { toast } from '@/components/ui/Toast';
import { AUDIENCES, Empty, Modal, appOrigin, audienceLabel, brl, copy } from './ui';
import type { Campaign } from './Campaigns';

interface Coupon {
  id: string;
  code: string;
  description: string;
  audience: 'mechanic' | 'workshop' | 'all';
  benefit_type: 'desconto_taxa' | 'credito' | 'bonus' | 'outro';
  benefit_value: number | null;
  max_uses: number | null;
  expires_on: string | null;
  active: boolean;
  campaign_id: string | null;
  created_at: string;
}

interface Redemption {
  profile_id: string;
  coupon_id: string;
  created_at: string;
  benefit_applied_at: string | null;
  profile: { full_name: string; role: string; status: string } | null;
}

const BENEFITS: { v: Coupon['benefit_type']; label: string; unit: string }[] = [
  { v: 'desconto_taxa', label: 'Desconto na taxa da plataforma', unit: '%' },
  { v: 'credito',       label: 'Crédito em reais',               unit: 'R$' },
  { v: 'bonus',         label: 'Bônus em reais (mecânico)',       unit: 'R$' },
  { v: 'outro',         label: 'Outro (descrito no texto)',       unit: '' },
];

const benefitText = (c: Coupon) => {
  const b = BENEFITS.find(x => x.v === c.benefit_type)!;
  if (c.benefit_value == null || !b.unit) return b.label;
  return `${b.label}: ${b.unit === 'R$' ? brl(+c.benefit_value) : `${+c.benefit_value}%`}`;
};

const couponUrl = (c: Coupon) => {
  const path = c.audience === 'workshop' ? '/cadastro/oficina' : c.audience === 'mechanic' ? '/cadastro/mecanico' : '/';
  return `${appOrigin()}${path}?cupom=${c.code}`;
};

export default function Coupons() {
  const [list, setList] = useState<Coupon[]>([]);
  const [redemptions, setRedemptions] = useState<Redemption[]>([]);
  const [campaigns, setCampaigns] = useState<Pick<Campaign, 'id' | 'name'>[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const [c, r, k] = await Promise.all([
      supabase.from('marketing_coupons').select('*').order('created_at', { ascending: false }),
      supabase.from('marketing_attributions')
        .select('profile_id, coupon_id, created_at, benefit_applied_at, profile:profiles(full_name, role, status)')
        .not('coupon_id', 'is', null).order('created_at', { ascending: false }),
      supabase.from('marketing_campaigns').select('id, name').order('created_at', { ascending: false }),
    ]);
    setList((c.data ?? []) as Coupon[]);
    setRedemptions((r.data ?? []) as unknown as Redemption[]);
    setCampaigns((k.data ?? []) as Pick<Campaign, 'id' | 'name'>[]);
    setLoading(false);
  }
  useEffect(() => { void load(); }, []);

  const usesBy = useMemo(() => {
    const m: Record<string, Redemption[]> = {};
    for (const r of redemptions) (m[r.coupon_id] ??= []).push(r);
    return m;
  }, [redemptions]);
  const pendingBenefits = redemptions.filter(r => !r.benefit_applied_at && r.profile?.status === 'approved').length;

  async function toggle(c: Coupon) {
    const { error } = await supabase.from('marketing_coupons').update({ active: !c.active }).eq('id', c.id);
    if (error) return toast.error(error.message);
    setList(l => l.map(x => (x.id === c.id ? { ...x, active: !c.active } : x)));
  }

  async function markApplied(r: Redemption, applied: boolean) {
    const at = applied ? new Date().toISOString() : null;
    const { error } = await supabase.from('marketing_attributions').update({ benefit_applied_at: at }).eq('profile_id', r.profile_id);
    if (error) return toast.error(error.message);
    setRedemptions(l => l.map(x => (x.profile_id === r.profile_id ? { ...x, benefit_applied_at: at } : x)));
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-steel-500 max-w-xl">
          A pessoa digita o cupom no cadastro (ou já chega com ele pelo link). Você acompanha quem usou e marca quando o benefício foi dado.
        </p>
        <button className="btn-primary" onClick={() => setCreating(true)}>+ Novo cupom</button>
      </div>

      {pendingBenefits > 0 && (
        <div className="bg-pending-500/10 border border-pending-500/30 text-pending-800 rounded-2xl px-4 py-3 text-sm">
          🎟️ <b>{pendingBenefits}</b> cadastro(s) aprovado(s) com cupom aguardando o benefício. Abra o cupom para ver quem é.
        </div>
      )}

      {loading ? (
        <div className="bg-white border border-steel-200 rounded-2xl p-10 text-center text-steel-500 text-sm">Carregando…</div>
      ) : list.length === 0 ? (
        <Empty emoji="🎟️" title="Nenhum cupom ainda" text="Crie um cupom de boas-vindas, por exemplo BEMVINDO, com desconto na taxa das primeiras demandas." />
      ) : (
        <div className="space-y-3">
          {list.map(c => {
            const uses = usesBy[c.id] ?? [];
            const expired = c.expires_on && c.expires_on < new Date().toISOString().slice(0, 10);
            const full = c.max_uses != null && uses.length >= c.max_uses;
            return (
              <div key={c.id} className="bg-white border border-steel-200 rounded-2xl p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <code className="text-base font-bold text-brand-600 bg-brand-500/10 px-2 py-0.5 rounded-lg">{c.code}</code>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-lg ${!c.active || expired || full ? 'bg-steel-100 text-steel-500' : 'bg-signal-500/10 text-signal-700'}`}>
                        {!c.active ? 'desativado' : expired ? 'vencido' : full ? 'esgotado' : 'ativo'}
                      </span>
                    </div>
                    <p className="text-sm text-steel-800 mt-1.5">{c.description}</p>
                    <p className="text-xs text-steel-500 mt-0.5">
                      {benefitText(c)} · {audienceLabel(c.audience)}
                      {c.expires_on && ` · até ${new Date(c.expires_on + 'T12:00').toLocaleDateString('pt-BR')}`}
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-steel-900">{uses.length}{c.max_uses != null && <span className="text-sm text-steel-400">/{c.max_uses}</span>}</div>
                    <div className="text-[10px] uppercase tracking-wide text-steel-500">usos</div>
                  </div>
                </div>
                <div className="flex gap-2 mt-3 flex-wrap">
                  <button className="btn-ghost text-sm" onClick={async () => {
                    if (await copy(couponUrl(c))) toast.success('Link com cupom copiado ✓');
                  }}>Copiar link com cupom</button>
                  <button className="btn-ghost text-sm" onClick={() => setOpen(open === c.id ? null : c.id)}>
                    {open === c.id ? 'Esconder usos' : `Ver usos (${uses.length})`}
                  </button>
                  <button className="btn-ghost text-sm text-steel-500" onClick={() => toggle(c)}>{c.active ? 'Desativar' : 'Ativar'}</button>
                </div>

                {open === c.id && (
                  <div className="mt-3 border-t border-steel-100 pt-3">
                    {uses.length === 0 ? <p className="text-sm text-steel-500">Ninguém usou ainda.</p> : (
                      <ul className="divide-y divide-steel-100">
                        {uses.map(r => (
                          <li key={r.profile_id} className="py-2 flex items-center justify-between gap-3 flex-wrap">
                            <div className="min-w-0">
                              <Link to={`/admin/usuario/${r.profile_id}`} className="font-semibold text-steel-800 hover:text-brand-600">
                                {r.profile?.full_name || 'Sem nome'}
                              </Link>
                              <div className="text-xs text-steel-500">
                                {r.profile?.role === 'workshop' ? 'Oficina' : 'Mecânico'} · {r.profile?.status === 'approved' ? 'aprovado' : 'em análise'} · {new Date(r.created_at).toLocaleDateString('pt-BR')}
                              </div>
                            </div>
                            <label className="flex items-center gap-2 text-sm text-steel-700 min-h-[44px] cursor-pointer">
                              <input type="checkbox" className="h-5 w-5 rounded border-steel-300 text-brand-500"
                                checked={!!r.benefit_applied_at} onChange={e => markApplied(r, e.target.checked)} />
                              Benefício dado
                            </label>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {creating && <CouponForm campaigns={campaigns} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); void load(); }} />}
    </div>
  );
}

function CouponForm({ campaigns, onClose, onSaved }: { campaigns: Pick<Campaign, 'id' | 'name'>[]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    code: '', description: '', audience: 'all', benefit_type: 'desconto_taxa' as Coupon['benefit_type'],
    benefit_value: '', max_uses: '', expires_on: '', campaign_id: '',
  });
  const [saving, setSaving] = useState(false);
  const up = <K extends keyof typeof f>(k: K, v: string) => setF(p => ({ ...p, [k]: v }));
  const unit = BENEFITS.find(b => b.v === f.benefit_type)!.unit;

  async function save(e: FormEvent) {
    e.preventDefault();
    const code = f.code.trim().toUpperCase();
    if (!/^[A-Z0-9_-]{3,30}$/.test(code)) return toast.error('Código: 3 a 30 letras/números, sem espaço.');
    if (f.description.trim().length < 5) return toast.error('Escreva o que a pessoa ganha — aparece no cadastro.');
    setSaving(true);
    const { error } = await supabase.from('marketing_coupons').insert({
      code,
      description: f.description.trim(),
      audience: f.audience,
      benefit_type: f.benefit_type,
      benefit_value: f.benefit_value ? Number(f.benefit_value.replace(',', '.')) : null,
      max_uses: f.max_uses ? Number(f.max_uses) : null,
      expires_on: f.expires_on || null,
      campaign_id: f.campaign_id || null,
    });
    setSaving(false);
    if (error) return toast.error(/duplicate|unique/i.test(error.message) ? 'Esse código já existe.' : error.message);
    toast.success('Cupom criado ✓');
    onSaved();
  }

  return (
    <Modal title="Novo cupom" onClose={onClose}>
      <form onSubmit={save} className="space-y-3">
        <div>
          <label className="label">Código</label>
          <input className="input uppercase" value={f.code} placeholder="BEMVINDO" maxLength={30}
            onChange={e => up('code', e.target.value.toUpperCase().replace(/\s/g, ''))} />
        </div>
        <div>
          <label className="label">O que a pessoa ganha (aparece no cadastro)</label>
          <input className="input" value={f.description} placeholder="Ex: Taxa de 10% nas 3 primeiras demandas"
            onChange={e => up('description', e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Tipo de benefício</label>
            <select className="input" value={f.benefit_type} onChange={e => up('benefit_type', e.target.value)}>
              {BENEFITS.map(b => <option key={b.v} value={b.v}>{b.label}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Valor {unit && `(${unit})`}</label>
            <input className="input" inputMode="decimal" value={f.benefit_value} disabled={!unit}
              onChange={e => up('benefit_value', e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="label">Público</label>
            <select className="input" value={f.audience} onChange={e => up('audience', e.target.value)}>
              {AUDIENCES.map(a => <option key={a.v} value={a.v}>{a.label}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Limite de usos</label>
            <input className="input" inputMode="numeric" placeholder="sem limite" value={f.max_uses}
              onChange={e => up('max_uses', e.target.value.replace(/\D/g, ''))} />
          </div>
          <div>
            <label className="label">Vale até</label>
            <input className="input" type="date" value={f.expires_on} onChange={e => up('expires_on', e.target.value)} />
          </div>
        </div>
        {campaigns.length > 0 && (
          <div>
            <label className="label">Campanha (opcional)</label>
            <select className="input" value={f.campaign_id} onChange={e => up('campaign_id', e.target.value)}>
              <option value="">— nenhuma —</option>
              {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}
        <p className="text-xs text-steel-500 bg-steel-50 rounded-lg p-2.5">
          O benefício ainda não é descontado automaticamente no pagamento: você aplica e marca "Benefício dado" na lista de usos.
        </p>
        <button className="btn-primary w-full" disabled={saving}>{saving ? 'Salvando…' : 'Criar cupom'}</button>
      </form>
    </Modal>
  );
}

