import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from '@/components/ui/Toast';
import { resizeImage } from '@/lib/imageResize';
import {
  AMENITIES, BRAND_SUGGESTIONS, CUSTOMER_TYPES, EQUIPMENT, PAYMENT_METHODS, PHOTO_SLOTS, PRICE_TIERS,
  SHOWCASE_SERVICES, VEHICLE_TYPES, WEEK_DAYS, completeness, emptyShowcase,
  type PhotoKind, type Section, type Showcase, type ShowcasePhoto,
} from '@/lib/showcase';

const BUCKET = 'workshop-showcase';
const photoUrl = (path: string) => supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;

const SECTIONS: { key: Section; icon: string; title: string; why: string }[] = [
  { key: 'photos',     icon: '📸', title: 'Fotos da oficina',          why: 'O cliente confia muito mais numa oficina que ele consegue ver antes de ir.' },
  { key: 'services',   icon: '🔧', title: 'Serviços e especialidades', why: 'Levamos até você quem procura exatamente o que você faz.' },
  { key: 'structure',  icon: '🏗️', title: 'Estrutura',                 why: 'Estrutura é um dos principais motivos na hora de escolher uma oficina.' },
  { key: 'audience',   icon: '👥', title: 'Público que você atende',   why: 'A divulgação fala com o cliente certo e você não gasta com quem não é o seu perfil.' },
  { key: 'contact',    icon: '🕒', title: 'Funcionamento e contato',   why: 'Cliente que não sabe o horário ou como falar com você liga para outra oficina.' },
  { key: 'highlights', icon: '⭐', title: 'Seus diferenciais',          why: 'É o seu argumento de venda: vira o texto da sua divulgação.' },
];

export default function ShowcaseEditor({ workshopId, userId }: { workshopId: string; userId: string }) {
  const [s, setS] = useState<Showcase>(() => emptyShowcase(workshopId));
  const [photos, setPhotos] = useState<ShowcasePhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<Section | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const [{ data: row }, { data: ph }] = await Promise.all([
        supabase.from('workshop_showcase').select('*').eq('workshop_id', workshopId).maybeSingle(),
        supabase.from('workshop_showcase_photos').select('*').eq('workshop_id', workshopId).order('position').order('created_at'),
      ]);
      if (!alive) return;
      setS(row ? { ...emptyShowcase(workshopId), ...(row as Showcase) } : emptyShowcase(workshopId));
      setPhotos((ph as ShowcasePhoto[]) ?? []);
      setDirty(false);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [workshopId]);

  // Link direto (ex.: lembrete do Painel → /oficina/perfil#vitrine)
  useEffect(() => {
    if (!loading && window.location.hash === '#vitrine') rootRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [loading]);

  const c = useMemo(() => completeness(s, photos), [s, photos]);

  function patch(p: Partial<Showcase>) { setS(cur => ({ ...cur, ...p })); setDirty(true); }

  async function save(extra: Partial<Showcase> = {}, quiet = false) {
    setSaving(true);
    const { updated_at: _u, ...row } = { ...s, ...extra };
    const { error } = await supabase.from('workshop_showcase').upsert(row, { onConflict: 'workshop_id' });
    setSaving(false);
    if (error) { toast.error('Não foi possível salvar: ' + error.message); return false; }
    setS(cur => ({ ...cur, ...extra }));
    setDirty(false);
    if (!quiet) toast.success('Vitrine salva ✓');
    return true;
  }

  async function toggleConsent(on: boolean) {
    const ok = await save(on ? { consent_at: new Date().toISOString(), consent_by: userId } : { consent_at: null, consent_by: null }, true);
    if (ok) toast.success(on ? 'Obrigado! Autorização registrada ✓' : 'Autorização removida — nada será divulgado.');
  }

  async function addPhoto(kind: PhotoKind, file: File) {
    try {
      const blob = await resizeImage(file, 1600, 0.85);
      const path = `${workshopId}/${kind}-${crypto.randomUUID()}.jpg`;
      const up = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg' });
      if (up.error) throw up.error;
      const { data, error } = await supabase.from('workshop_showcase_photos')
        .insert({ workshop_id: workshopId, kind, path, position: photos.filter(p => p.kind === kind).length })
        .select('*').single();
      if (error) { await supabase.storage.from(BUCKET).remove([path]); throw error; }
      setPhotos(cur => [...cur, data as ShowcasePhoto]);
      toast.success('Foto adicionada 📸');
    } catch (e) {
      toast.error('Não foi possível enviar a foto: ' + (e instanceof Error ? e.message : String(e)));
    }
  }

  async function removePhoto(p: ShowcasePhoto) {
    if (!confirm('Remover esta foto?')) return;
    const { error } = await supabase.from('workshop_showcase_photos').delete().eq('id', p.id);
    if (error) { toast.error('Erro ao remover: ' + error.message); return; }
    await supabase.storage.from(BUCKET).remove([p.path]);
    setPhotos(cur => cur.filter(x => x.id !== p.id));
  }

  if (loading) return <div className="card h-40 animate-pulse" />;

  const bar = c.percent >= 80 ? 'bg-signal-500' : c.percent >= 40 ? 'bg-brand-500' : 'bg-pending-500';

  return (
    <div ref={rootRef} id="vitrine" className="space-y-3 scroll-mt-4">
      {/* Cabeçalho: objetivo + progresso */}
      <div className="card !bg-gradient-to-br from-steel-900 to-steel-800 text-white">
        <div className="text-[10px] font-bold uppercase tracking-widest text-brand-300">🚀 Vitrine da oficina</div>
        <h3 className="text-xl font-bold mt-1">Quanto mais a gente conhece sua oficina, mais clientes conseguimos levar até você.</h3>
        <p className="text-sm text-steel-300 mt-1.5">
          Vamos usar essas informações para <strong className="text-white">divulgar sua oficina</strong> e trazer clientes novos.
          Tudo é opcional: preencha no seu ritmo, um bloco de cada vez.
        </p>
        <div className="mt-4">
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="font-semibold">Vitrine {c.percent}% completa</span>
            {c.percent === 100 && <span className="text-signal-300 font-semibold">🎉 Completa!</span>}
          </div>
          <div className="h-2.5 rounded-full bg-white/15 overflow-hidden">
            <div className={`h-full rounded-full transition-all ${bar}`} style={{ width: `${Math.max(3, c.percent)}%` }} />
          </div>
          {c.next && (
            <button type="button" onClick={() => setOpen(c.next!.section)}
              className="mt-3 text-sm font-semibold text-brand-200 hover:text-white">
              👉 Próximo passo: {c.next.label} <span className="text-brand-300">(+{c.next.points}%)</span>
            </button>
          )}
        </div>
      </div>

      {/* Blocos */}
      {SECTIONS.map(sec => {
        const st = c.bySection(sec.key);
        const isOpen = open === sec.key;
        const complete = st.done === st.total;
        return (
          <div key={sec.key} className="card !p-0 overflow-hidden">
            <button type="button" onClick={() => setOpen(isOpen ? null : sec.key)}
              className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left hover:bg-steel-50">
              <div className="min-w-0">
                <div className="font-bold text-steel-900">{sec.icon} {sec.title}</div>
                <div className="text-xs text-steel-500 mt-0.5">💡 {sec.why}</div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${complete ? 'bg-signal-100 text-signal-800' : st.done ? 'bg-brand-100 text-brand-800' : 'bg-steel-100 text-steel-500'}`}>
                  {complete ? '✓ Completo' : `${st.done}/${st.total}`}
                </span>
                <span className="text-steel-400">{isOpen ? '▴' : '▾'}</span>
              </div>
            </button>

            {isOpen && (
              <div className="px-5 pb-5 pt-1 border-t border-steel-100 space-y-5">
                {sec.key === 'photos' && (
                  <PhotosBlock photos={photos} onAdd={addPhoto} onRemove={removePhoto} />
                )}

                {sec.key === 'services' && (
                  <>
                    <Field label="Serviços que você faz" hint="Toque para marcar.">
                      <Chips options={SHOWCASE_SERVICES} value={s.services} onChange={v => patch({ services: v })} />
                    </Field>
                    <Field label="Tipos de veículo que atende">
                      <Chips options={VEHICLE_TYPES} value={s.vehicle_types} onChange={v => patch({ vehicle_types: v })} />
                    </Field>
                    <Field label="Marcas que atende / é especialista" hint="Pode digitar uma marca que não está na lista.">
                      <Chips options={BRAND_SUGGESTIONS} value={s.brands} onChange={v => patch({ brands: v })} allowCustom />
                    </Field>
                  </>
                )}

                {sec.key === 'structure' && (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Nº de boxes / vagas de serviço">
                        <input className="input" type="number" min={0} value={s.bays ?? ''}
                          onChange={e => patch({ bays: e.target.value === '' ? null : Number(e.target.value) })} />
                      </Field>
                      <Field label="Nº de elevadores">
                        <input className="input" type="number" min={0} value={s.lifts ?? ''}
                          onChange={e => patch({ lifts: e.target.value === '' ? null : Number(e.target.value) })} />
                      </Field>
                    </div>
                    <Field label="Equipamentos">
                      <Chips options={EQUIPMENT} value={s.equipment} onChange={v => patch({ equipment: v })} allowCustom />
                    </Field>
                    <Field label="Comodidades para o cliente">
                      <Chips options={AMENITIES} value={s.amenities} onChange={v => patch({ amenities: v })} allowCustom />
                    </Field>
                  </>
                )}

                {sec.key === 'audience' && (
                  <>
                    <Field label="Que tipo de cliente você atende?">
                      <Chips options={CUSTOMER_TYPES} value={s.customer_types} onChange={v => patch({ customer_types: v })} allowCustom />
                    </Field>
                    <Field label="Faixa de preço" hint="Ajuda a divulgar para o público que combina com você — nenhuma é melhor que a outra.">
                      <div className="grid sm:grid-cols-3 gap-2">
                        {PRICE_TIERS.map(t => (
                          <button key={t.value} type="button" onClick={() => patch({ price_tier: s.price_tier === t.value ? null : t.value })}
                            className={`rounded-xl border-2 p-3 text-left transition ${s.price_tier === t.value ? 'border-brand-500 bg-brand-50' : 'border-steel-200 hover:border-brand-300'}`}>
                            <div className="font-semibold text-sm">{t.label}</div>
                            <div className="text-[11px] text-steel-500">{t.hint}</div>
                          </button>
                        ))}
                      </div>
                    </Field>
                    <Field label="Bairros / região que você atende" hint="Ex.: Jardim Ângela, Capão Redondo, M'Boi Mirim e região — até uns 10 km.">
                      <textarea className="input" rows={2} value={s.service_area ?? ''} onChange={e => patch({ service_area: e.target.value })} />
                    </Field>
                  </>
                )}

                {sec.key === 'contact' && (
                  <>
                    <Field label="Horário de funcionamento">
                      <HoursEditor value={s.hours} onChange={v => patch({ hours: v })} />
                    </Field>
                    <div className="grid sm:grid-cols-2 gap-3">
                      <Field label="WhatsApp comercial">
                        <input className="input" inputMode="tel" placeholder="(11) 99999-9999" value={s.whatsapp ?? ''}
                          onChange={e => patch({ whatsapp: e.target.value })} />
                      </Field>
                      <Field label="Instagram">
                        <input className="input" placeholder="@suaoficina" value={s.instagram ?? ''} onChange={e => patch({ instagram: e.target.value })} />
                      </Field>
                      <Field label="Link do Google (Maps / Meu Negócio)">
                        <input className="input" placeholder="https://g.page/…" value={s.google_url ?? ''} onChange={e => patch({ google_url: e.target.value })} />
                      </Field>
                      <Field label="Site">
                        <input className="input" placeholder="https://…" value={s.website ?? ''} onChange={e => patch({ website: e.target.value })} />
                      </Field>
                      <Field label="Ano de fundação" hint="&quot;Desde 1998&quot; passa confiança.">
                        <input className="input" type="number" min={1900} max={2100} value={s.founded_year ?? ''}
                          onChange={e => patch({ founded_year: e.target.value === '' ? null : Number(e.target.value) })} />
                      </Field>
                      <Field label="Garantia dos serviços">
                        <select className="input" value={s.warranty_days ?? ''} onChange={e => patch({ warranty_days: e.target.value === '' ? null : Number(e.target.value) })}>
                          <option value="">— escolha —</option>
                          {[30, 60, 90, 180, 365].map(d => <option key={d} value={d}>{d === 365 ? '1 ano' : `${d} dias`}</option>)}
                          {s.warranty_days != null && ![30, 60, 90, 180, 365].includes(s.warranty_days) && (
                            <option value={s.warranty_days}>{s.warranty_days} dias</option>
                          )}
                        </select>
                      </Field>
                    </div>
                    <Field label="Formas de pagamento">
                      <Chips options={PAYMENT_METHODS} value={s.payment_methods} onChange={v => patch({ payment_methods: v })} />
                    </Field>
                  </>
                )}

                {sec.key === 'highlights' && (
                  <>
                    <Field label="Por que o cliente deve escolher sua oficina?"
                      hint="Escreva como se estivesse falando com o cliente. Ex.: &quot;Somos uma oficina familiar há 25 anos. Mostramos a peça trocada, damos garantia de 90 dias e você acompanha tudo por foto no WhatsApp.&quot;">
                      <textarea className="input" rows={4} value={s.highlights ?? ''} onChange={e => patch({ highlights: e.target.value })} />
                      <div className={`text-[11px] mt-1 ${(s.highlights ?? '').trim().length >= 40 ? 'text-signal-700' : 'text-steel-400'}`}>
                        {(s.highlights ?? '').trim().length} caracteres{(s.highlights ?? '').trim().length < 40 ? ' — escreva pelo menos umas duas frases' : ' ✓'}
                      </div>
                    </Field>
                    <Field label="Certificações, redes e parcerias" hint="Ex.: Bosch Car Service, curso SENAI, parceira da seguradora X.">
                      <input className="input" value={s.certifications ?? ''} onChange={e => patch({ certifications: e.target.value })} />
                    </Field>
                  </>
                )}

                {sec.key !== 'photos' && (
                  <div className="flex items-center gap-3">
                    <button type="button" onClick={() => save()} disabled={saving || !dirty} className="btn-primary text-sm !py-2 disabled:opacity-50">
                      {saving ? 'Salvando…' : dirty ? 'Salvar este bloco' : '✓ Salvo'}
                    </button>
                    {dirty && <span className="text-xs text-pending-700">Alterações não salvas</span>}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Autorização */}
      <label className={`card flex items-start gap-3 cursor-pointer ${s.consent_at ? '!bg-signal-50 border border-signal-200' : 'border border-pending-200 !bg-pending-50'}`}>
        <input type="checkbox" className="mt-1 h-4 w-4 accent-brand-500" checked={!!s.consent_at} disabled={saving}
          onChange={e => toggleConsent(e.target.checked)} />
        <span className="text-sm">
          <strong>Autorizo o MecânicoApp a usar as informações e fotos da minha vitrine para divulgar minha oficina</strong>{' '}
          (página da oficina, anúncios e redes sociais). Posso retirar a autorização quando quiser.
          <span className="block text-xs mt-1 text-steel-500">
            {s.consent_at
              ? `✓ Autorizado em ${new Date(s.consent_at).toLocaleDateString('pt-BR')}.`
              : 'Sem essa autorização nada é publicado. Se houver fotos da equipe, confirme que eles concordam em aparecer.'}
          </span>
        </span>
      </label>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="label !mb-1">{label}</div>
      {hint && <p className="text-[11px] text-steel-500 -mt-0.5 mb-2">{hint}</p>}
      {children}
    </div>
  );
}

function Chips({ options, value, onChange, allowCustom = false }: {
  options: string[]; value: string[]; onChange: (v: string[]) => void; allowCustom?: boolean;
}) {
  const [custom, setCustom] = useState('');
  const all = [...options, ...value.filter(v => !options.includes(v))];
  const toggle = (o: string) => onChange(value.includes(o) ? value.filter(x => x !== o) : [...value, o]);
  function addCustom() {
    const v = custom.trim();
    if (v && !value.some(x => x.toLowerCase() === v.toLowerCase())) onChange([...value, v]);
    setCustom('');
  }
  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {all.map(o => {
          const on = value.includes(o);
          return (
            <button key={o} type="button" onClick={() => toggle(o)}
              className={`text-xs px-3 py-1.5 rounded-full border transition ${on ? 'bg-brand-500 text-white border-brand-500' : 'bg-white text-steel-600 border-steel-200 hover:border-brand-300'}`}>
              {on ? '✓ ' : ''}{o}
            </button>
          );
        })}
      </div>
      {allowCustom && (
        <div className="flex gap-2 mt-2">
          <input className="input !py-1.5 text-sm" placeholder="Outro… (digite e toque em Adicionar)" value={custom}
            onChange={e => setCustom(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustom(); } }} />
          <button type="button" onClick={addCustom} className="btn-ghost text-sm !py-1.5 border border-steel-200 shrink-0">Adicionar</button>
        </div>
      )}
    </div>
  );
}

function HoursEditor({ value, onChange }: { value: Showcase['hours']; onChange: (v: Showcase['hours']) => void }) {
  const set = (key: string, p: Partial<{ open: string; close: string; closed: boolean }>) =>
    onChange({ ...value, [key]: { open: value[key]?.open ?? '08:00', close: value[key]?.close ?? '18:00', closed: value[key]?.closed ?? false, ...p } });
  const preset = () => {
    const next = { ...value };
    for (const d of ['mon', 'tue', 'wed', 'thu', 'fri']) next[d] = { open: '08:00', close: '18:00' };
    next.sat = { open: '08:00', close: '12:00' };
    next.sun = { open: '', close: '', closed: true };
    onChange(next);
  };
  return (
    <div className="space-y-1.5">
      <button type="button" onClick={preset} className="text-xs font-semibold text-brand-600 hover:underline mb-1">
        ⚡ Preencher padrão (seg–sex 8h–18h, sáb 8h–12h)
      </button>
      {WEEK_DAYS.map(d => {
        const h = value[d.key];
        const closed = h?.closed ?? !h;
        return (
          <div key={d.key} className="flex flex-wrap items-center gap-2 text-sm">
            <span className="w-20 font-medium text-steel-700">{d.label}</span>
            <label className="flex items-center gap-1.5 text-xs text-steel-500">
              <input type="checkbox" checked={!closed} onChange={e => set(d.key, { closed: !e.target.checked })} className="accent-brand-500" />
              Aberto
            </label>
            {!closed && (
              <>
                <input type="time" className="input !py-1 !w-auto text-sm" value={h?.open ?? '08:00'} onChange={e => set(d.key, { open: e.target.value })} />
                <span className="text-steel-400">às</span>
                <input type="time" className="input !py-1 !w-auto text-sm" value={h?.close ?? '18:00'} onChange={e => set(d.key, { close: e.target.value })} />
              </>
            )}
            {closed && <span className="text-xs text-steel-400">Fechado</span>}
          </div>
        );
      })}
    </div>
  );
}

function PhotosBlock({ photos, onAdd, onRemove }: {
  photos: ShowcasePhoto[]; onAdd: (k: PhotoKind, f: File) => Promise<void>; onRemove: (p: ShowcasePhoto) => void;
}) {
  const [busy, setBusy] = useState<PhotoKind | null>(null);
  return (
    <div className="space-y-5">
      <p className="text-xs text-steel-500">
        Dica: fotos na horizontal, com boa luz e a oficina organizada. As fotos são salvas na hora — não precisa clicar em salvar.
      </p>
      {PHOTO_SLOTS.map(slot => {
        const list = photos.filter(p => p.kind === slot.kind);
        return (
          <div key={slot.kind}>
            <div className="flex items-baseline justify-between gap-2">
              <div className="font-semibold text-sm text-steel-800">{slot.label} {list.length > 0 && <span className="text-signal-600">✓</span>}</div>
              <div className="text-[11px] text-steel-400">{list.length}/{slot.max}</div>
            </div>
            <p className="text-[11px] text-steel-500 mb-2">{slot.tip}</p>
            <div className="flex flex-wrap gap-2">
              {list.map(p => (
                <div key={p.id} className="relative group">
                  <img src={photoUrl(p.path)} alt={slot.label} className="h-24 w-32 object-cover rounded-lg border border-steel-200" />
                  <button type="button" onClick={() => onRemove(p)}
                    className="absolute top-1 right-1 h-6 w-6 rounded-full bg-black/60 text-white text-xs opacity-80 hover:opacity-100">✕</button>
                </div>
              ))}
              {list.length < slot.max && (
                <label className={`h-24 w-32 rounded-lg border-2 border-dashed grid place-items-center text-center cursor-pointer transition ${
                  busy === slot.kind ? 'border-brand-300 bg-brand-50' : 'border-steel-200 hover:border-brand-400 hover:bg-brand-50/50'}`}>
                  <input type="file" accept="image/*" className="hidden" disabled={!!busy}
                    onChange={async e => {
                      const f = e.target.files?.[0];
                      e.target.value = '';
                      if (!f) return;
                      setBusy(slot.kind);
                      await onAdd(slot.kind, f);
                      setBusy(null);
                    }} />
                  <span className="text-xs text-steel-500">
                    {busy === slot.kind ? 'Enviando…' : <>📷<br />Adicionar foto</>}
                  </span>
                </label>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
