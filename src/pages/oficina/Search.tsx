import { FormEvent, useEffect, useState } from 'react';
import WorkshopLayout from '@/components/layout/WorkshopLayout';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { MechanicReviews } from '@/components/MechanicReviews';
import { PendingFeesBanner, usePendingFees } from '@/components/PendingFeesGate';
import { toast } from '@/components/ui/Toast';
import type { Mechanic, Profile } from '@/types/database';
import { formatBRL } from '@/lib/payment';
import { inviteFields } from '@/lib/jobInvite';
import { markPlatformItems } from '@/lib/callMechanic';
import OsLinkPicker, { osCar, osNumber, type OsLink } from '@/components/marketplace/OsLinkPicker';

const ALL_SKILLS = ['Motor', 'Suspensão', 'Freios', 'Elétrica', 'Injeção eletrônica', 'Câmbio', 'Ar-condicionado', 'Diagnóstico', 'Diesel'];

type MechRow = Mechanic & { profile: Profile };

export default function WorkshopSearch() {
  const { currentWorkshop } = useAuth();
  const shop = currentWorkshop;
  const [filter, setFilter] = useState({ skill: '', minRating: 0, maxRate: 500 });
  const [list, setList] = useState<MechRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [openReviews, setOpenReviews] = useState<Set<string>>(new Set());
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const hasPendingFees = usePendingFees(shop?.id ?? null);

  function toggleReviews(id: string) {
    setOpenReviews(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function loadFavorites() {
    if (!shop) return;
    const { data } = await supabase
      .from('workshop_favorite_mechanics')
      .select('mechanic_id')
      .eq('workshop_id', shop.id);
    setFavorites(new Set((data ?? []).map(d => d.mechanic_id)));
  }

  async function toggleFavorite(mechanicId: string) {
    if (!shop) return;
    const isFav = favorites.has(mechanicId);
    // Atualização otimista
    setFavorites(prev => {
      const next = new Set(prev);
      if (isFav) next.delete(mechanicId); else next.add(mechanicId);
      return next;
    });
    if (isFav) {
      const { error } = await supabase
        .from('workshop_favorite_mechanics')
        .delete()
        .eq('workshop_id', shop.id)
        .eq('mechanic_id', mechanicId);
      if (error) loadFavorites(); // reverte em caso de erro
    } else {
      const { error } = await supabase
        .from('workshop_favorite_mechanics')
        .insert({ workshop_id: shop.id, mechanic_id: mechanicId });
      if (error) loadFavorites();
    }
  }

  useEffect(() => { loadFavorites(); }, [shop?.id]);

  // hire modal
  const [target, setTarget] = useState<MechRow | null>(null);
  type HireForm = {
    title: string; description: string;
    /** fixed = preço pelo serviço (total); hour = valor/hora × horas */
    pricing: 'hour' | 'fixed'; price_per_hour: number; max_hours: number;
    total: string; est_hours: string;
    when: 'now' | 'scheduled'; scheduled_at: string;
  };
  const blankHire = (rate: number): HireForm => ({
    title: '', description: '', pricing: 'hour', price_per_hour: rate, max_hours: 1,
    total: '', est_hours: '', when: 'now', scheduled_at: '',
  });
  const [job, setJob] = useState<HireForm>(blankHire(0));
  const [osLink, setOsLink] = useState<OsLink | null>(null);

  /* Ligou a uma OS: preenche título/descrição com os serviços (só se estiverem vazios) */
  function linkOs(v: OsLink | null) {
    setOsLink(v);
    if (!v) return;
    const picked = v.items.filter(i => v.itemIds.includes(i.id));
    const car = osCar(v.os);
    const names = picked.length ? picked.map(i => i.text) : [v.os.title];
    const title = (names.length === 1 ? names[0] : `${names[0]} + ${names.length - 1} serviço(s)`) + (car ? ` — ${car}` : '');
    const description = [
      'Serviços a realizar:', ...names.map(n => `• ${n}`), '',
      car || v.os.vehicle?.plate ? `Veículo: ${[car, v.os.vehicle?.plate].filter(Boolean).join(' · ')}` : '',
      `Referência: OS nº ${osNumber(v.os)}`,
    ].filter(l => l !== '').join('\n');
    setJob(j => ({
      ...j,
      title: j.title.trim() ? j.title : title.slice(0, 120),
      description: j.description.trim() ? j.description : description,
    }));
  }
  const [hiring, setHiring] = useState(false);

  useEffect(() => { search(); }, [filter]);

  async function search() {
    setLoading(true);
    let q = supabase.from('mechanics').select('*, profile:profiles!inner(*)').eq('is_available', true).gte('rating', filter.minRating).lte('hourly_rate', filter.maxRate);
    if (filter.skill) q = q.contains('skills', [filter.skill]);
    const { data } = await q.limit(50);
    const rows = (data as unknown as MechRow[] ?? []).filter(r => r.profile?.status === 'approved');
    setList(rows);
    setLoading(false);
  }

  async function hire(e: FormEvent) {
    e.preventDefault();
    if (!shop || !target) return;
    if (hasPendingFees) {
      toast.error('Você tem multa de cancelamento pendente. Quite no painel de Demandas antes de contratar.');
      return;
    }
    const scheduledAt = job.when === 'scheduled' && job.scheduled_at ? new Date(job.scheduled_at) : null;
    if (job.when === 'scheduled' && (!scheduledAt || scheduledAt.getTime() < Date.now())) {
      toast.error('Escolha uma data e hora no futuro para o agendamento.');
      return;
    }
    // Preço pelo serviço: grava valor × 1h (as contas de cobrança não mudam) e o tempo previsto à parte
    const fixed = job.pricing === 'fixed';
    const pph = fixed ? Number(job.total) : (Number(job.price_per_hour) || target.hourly_rate);
    const mh  = fixed ? 1 : (Number(job.max_hours) || 1);
    const est = fixed && job.est_hours ? Number(job.est_hours) : null;
    if (!pph || pph < 1) {
      toast.error(fixed ? 'Informe o valor do serviço (mínimo R$ 1).' : 'Informe o valor por hora (mínimo R$ 1).');
      return;
    }
    if (est != null && !(est > 0 && est <= 99)) { toast.error('Tempo previsto inválido.'); return; }
    if (osLink && osLink.items.length > 0 && osLink.itemIds.length === 0) {
      toast.error('Marque pelo menos um serviço da OS (ou remova a OS).');
      return;
    }
    setHiring(true);
    // Convite direto: nasce pendente e só vira "aceito" quando o mecânico aceitar
    const { data: ins, error } = await supabase.from('jobs').insert({
      workshop_id:     shop.id,
      title:           job.title,
      description:     job.description,
      price_per_hour:  pph,
      max_hours:       mh,
      price:           pph * mh,
      pricing:         fixed ? 'fixed' : 'hour',
      estimated_hours: est,
      scheduled_at:    scheduledAt ? scheduledAt.toISOString() : null,
      service_order_id: osLink?.os.id ?? null,
      ...inviteFields(target.id),
    }).select('id').single();
    // Serviços escolhidos passam a "mecânico da plataforma" e ficam ligados a esta demanda
    if (!error && osLink) {
      await markPlatformItems(shop.id, [osLink.os.id], osLink.itemIds, { jobId: ins?.id });
    }
    setHiring(false);
    if (error) {
      console.error('[hire] erro:', error);
      toast.error('Não foi possível enviar o convite: ' + error.message);
      return; // mantém o modal aberto com os dados
    }
    const firstName = target.profile.full_name.split(' ')[0];
    setTarget(null); setOsLink(null);
    toast.success(`Convite enviado! Avisamos ${firstName} — acompanhe em Demandas até ele aceitar.`);
  }

  return (
    <WorkshopLayout>
      <h1 className="text-3xl font-bold tracking-tight mb-6">Buscar mecânicos disponíveis</h1>

      {/* Multa pendente bloqueia contratação (mesma regra do painel de Demandas) */}
      <PendingFeesBanner workshopId={shop?.id ?? null} />

      <div className="card mb-6 grid md:grid-cols-3 gap-4">
        <div>
          <label className="label">Especialidade</label>
          <select className="input" value={filter.skill} onChange={e => setFilter(f => ({ ...f, skill: e.target.value }))}>
            <option value="">Todas</option>
            {ALL_SKILLS.map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Avaliação mínima</label>
          <input type="number" min={0} max={5} step={0.5} className="input" value={filter.minRating}
            onChange={e => setFilter(f => ({ ...f, minRating: Number(e.target.value) }))} />
        </div>
        <div>
          <label className="label">Valor/hora máximo (R$)</label>
          <input type="number" className="input" value={filter.maxRate}
            onChange={e => setFilter(f => ({ ...f, maxRate: Number(e.target.value) }))} />
        </div>
      </div>

      {loading ? <div className="text-steel-500">Buscando…</div> :
        list.length === 0 ? <div className="card text-center text-steel-500 py-10">Nenhum mecânico encontrado.</div> :
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {list.map(m => (
            <div key={m.id} className="card flex flex-col">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-full bg-brand-500 grid place-items-center text-white font-bold">
                  {m.profile.full_name.charAt(0)}
                </div>
                <div className="flex-1">
                  <div className="font-bold">{m.profile.full_name}</div>
                  <div className="text-xs text-steel-500">★ {m.rating.toFixed(1)} · {m.total_jobs} jobs · {m.experience_years}a</div>
                </div>
                <button
                  type="button"
                  onClick={() => toggleFavorite(m.id)}
                  title={favorites.has(m.id) ? 'Remover dos preferidos' : 'Adicionar aos preferidos'}
                  className={`h-9 w-9 rounded-full grid place-items-center transition active:scale-90 ${
                    favorites.has(m.id)
                      ? 'bg-brand-500/10 text-brand-600 hover:bg-brand-500/20'
                      : 'bg-steel-100 text-steel-400 hover:text-brand-500 hover:bg-brand-50'
                  }`}
                >
                  {favorites.has(m.id) ? '★' : '☆'}
                </button>
              </div>
              <div className="mt-3 flex flex-wrap gap-1">
                {m.skills.slice(0, 4).map(s => <span key={s} className="badge bg-steel-100 text-steel-700">{s}</span>)}
              </div>
              <div className="mt-3 flex justify-between items-center">
                <div><span className="text-2xl font-bold font-display">R$ {formatBRL(m.hourly_rate, { decimals: 0 })}</span><span className="text-xs text-steel-500">/h</span></div>
                <button
                  onClick={() => { setTarget(m); setJob(blankHire(m.hourly_rate)); setOsLink(null); }}
                  disabled={hasPendingFees}
                  title={hasPendingFees ? 'Quite a multa pendente para contratar' : undefined}
                  className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {hasPendingFees ? '🔒 Multa pendente' : 'Contratar'}
                </button>
              </div>
              <button
                type="button"
                onClick={() => toggleReviews(m.id)}
                className="mt-3 text-xs text-brand-600 hover:text-brand-700 font-semibold flex items-center justify-center gap-1 border-t border-steel-100 pt-2"
              >
                {openReviews.has(m.id) ? '▲ Ocultar avaliações' : '▼ Ver avaliações de outras oficinas'}
              </button>
              {openReviews.has(m.id) && (
                <div className="mt-2 bg-steel-50 rounded-lg p-2 border border-steel-100">
                  <MechanicReviews mechanicId={m.id} />
                </div>
              )}
            </div>
          ))}
        </div>}

      {target && (() => {
        const est = job.pricing === 'fixed'
          ? Number(job.total) || 0
          : (Number(job.price_per_hour) || target.hourly_rate) * (Number(job.max_hours) || 1);
        return (
          <div className="fixed inset-0 bg-steel-900/60 grid place-items-center p-4 z-50" onClick={() => setTarget(null)}>
            <form onClick={e => e.stopPropagation()} onSubmit={hire} className="card max-w-md w-full space-y-4 max-h-[92vh] overflow-y-auto">
              <div>
                <h3 className="text-xl font-bold">Contratar {target.profile.full_name}</h3>
                <p className="text-sm text-steel-500 mt-1">Taxa de referência: R$ {formatBRL(target.hourly_rate, { decimals: 0 })}/h · ★ {target.rating.toFixed(1)}</p>
                <p className="text-xs text-steel-500 mt-2 bg-steel-50 border border-steel-200 rounded-lg px-3 py-2">
                  Ele recebe um convite e precisa <strong>aceitar</strong>. O prazo de chegada só começa depois do aceite — e cancelar antes disso não tem multa.
                </p>
              </div>

              {shop && (
                <div>
                  <label className="label">Ordem de serviço</label>
                  <OsLinkPicker wid={shop.id} value={osLink} onChange={linkOs} />
                </div>
              )}

              <div>
                <label className="label">Título do serviço *</label>
                <input className="input" required value={job.title}
                  onChange={e => setJob(j => ({ ...j, title: e.target.value }))}
                  placeholder="Ex.: Troca de pastilha de freio — Civic" />
              </div>

              <div>
                <label className="label">Descrição *</label>
                <textarea className="input" rows={3} required value={job.description}
                  onChange={e => setJob(j => ({ ...j, description: e.target.value }))}
                  placeholder="Descreva o serviço, veículo, detalhes…" />
              </div>

              <div>
                <label className="label">Como cobrar</label>
                <div className="flex gap-1 bg-steel-100 rounded-xl p-1 mb-3">
                  {([['fixed', 'Pelo serviço'], ['hour', 'Por hora']] as const).map(([k, l]) => (
                    <button key={k} type="button" onClick={() => setJob(j => ({ ...j, pricing: k }))}
                      className={`flex-1 min-h-[40px] rounded-lg text-sm font-semibold transition ${
                        job.pricing === k ? 'bg-white shadow text-steel-900' : 'text-steel-500'}`}>
                      {l}
                    </button>
                  ))}
                </div>
                {job.pricing === 'fixed' ? (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-steel-400 text-sm">R$</span>
                        <input type="number" min={1} step={0.01} className="input !pl-9" required
                          placeholder="150" value={job.total}
                          onChange={e => setJob(j => ({ ...j, total: e.target.value }))} />
                      </div>
                      <div className="text-xs text-steel-400 mt-1">Valor do serviço</div>
                    </div>
                    <div>
                      <div className="relative">
                        <input type="number" min={0.5} max={99} step={0.5} className="input !pr-9"
                          placeholder="opcional" value={job.est_hours}
                          onChange={e => setJob(j => ({ ...j, est_hours: e.target.value }))} />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-steel-400 text-sm">h</span>
                      </div>
                      <div className="text-xs text-steel-400 mt-1">Tempo previsto (opcional)</div>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-steel-400 text-sm">R$</span>
                        <input type="number" min={1} className="input !pl-9" required
                          value={job.price_per_hour || ''}
                          placeholder={target.hourly_rate.toFixed(0)}
                          onChange={e => setJob(j => ({ ...j, price_per_hour: Number(e.target.value) }))} />
                      </div>
                      <div className="text-xs text-steel-400 mt-1">Valor por hora</div>
                    </div>
                    <div>
                      <div className="relative">
                        <input type="number" min={0.5} max={24} step={0.5} className="input !pr-9" required
                          value={job.max_hours}
                          onChange={e => setJob(j => ({ ...j, max_hours: Number(e.target.value) }))} />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-steel-400 text-sm">h</span>
                      </div>
                      <div className="text-xs text-steel-400 mt-1">Máx. horas</div>
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="label">Quando</label>
                <div className="grid grid-cols-2 gap-2">
                  {([['now', '⚡ Agora', 'Vem assim que aceitar'], ['scheduled', '📅 Agendar', 'Escolha dia e hora']] as const).map(([v, t, d]) => (
                    <button key={v} type="button" onClick={() => setJob(j => ({ ...j, when: v }))}
                      className={`rounded-xl border-2 p-3 text-left min-h-[44px] transition active:scale-95 ${job.when === v ? 'border-brand-500 bg-brand-50' : 'border-steel-200'}`}>
                      <div className="font-semibold text-sm">{t}</div>
                      <div className="text-xs text-steel-500 mt-0.5">{d}</div>
                    </button>
                  ))}
                </div>
                {job.when === 'scheduled' && (
                  <input type="datetime-local" className="input mt-2" required
                    min={toLocalInput(new Date())}
                    value={job.scheduled_at}
                    onChange={e => setJob(j => ({ ...j, scheduled_at: e.target.value }))} />
                )}
              </div>

              {est > 0 && (
                <div className="bg-brand-50 border border-brand-200 rounded-xl px-4 py-2.5 flex justify-between items-center">
                  <span className="text-sm text-brand-700">{job.pricing === 'fixed' ? 'Valor fechado do serviço' : 'Teto do orçamento'}</span>
                  <span className="font-bold text-brand-700 font-display">R$ {formatBRL(est)}</span>
                </div>
              )}

              <div className="flex gap-2">
                <button type="button" onClick={() => setTarget(null)} className="btn-ghost flex-1">Cancelar</button>
                <button className="btn-primary flex-1" disabled={hiring}>{hiring ? '…' : 'Enviar convite'}</button>
              </div>
            </form>
          </div>
        );
      })()}
    </WorkshopLayout>
  );
}

/** Date → valor de <input type="datetime-local"> no fuso local */
function toLocalInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
