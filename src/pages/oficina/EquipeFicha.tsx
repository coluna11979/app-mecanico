import { ChangeEvent, FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import WorkshopLayout from '@/components/layout/WorkshopLayout';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/components/ui/Toast';
import { resizeImage } from '@/lib/imageResize';
import AbsencePanel from '@/components/team/AbsencePanel';
import ScheduleEditor from '@/components/team/ScheduleEditor';
import { fmtBRL, fmtDur, moneyInput, osNumber, parseMoney, workedMinutes } from '@/components/os/osHelpers';
import {
  DOCUMENT_KINDS, EMPLOYMENT_TYPES, OFFICE_ROLES, QUALIFICATIONS, SHOP_ROLES, TEAM_STATUS, expiryLabel, roleArea, scheduleSummary, tenure,
} from '@/lib/team';
import type {
  EmploymentType, MechanicCertification, MechanicDocument, MechanicPrivate, TeamStatus, WorkshopMechanic,
} from '@/types/database';

type Tab = 'pessoal' | 'contratacao' | 'qualificacoes' | 'documentos' | 'pagamento' | 'desempenho';

const TABS: { key: Tab; label: string; needsId?: boolean }[] = [
  { key: 'pessoal',       label: '👤 Dados pessoais' },
  { key: 'contratacao',   label: '📄 Contratação' },
  { key: 'qualificacoes', label: '🎓 Qualificações' },
  { key: 'documentos',    label: '📁 Documentos', needsId: true },
  { key: 'pagamento',     label: '💳 Pagamento' },
  { key: 'desempenho',    label: '📈 Desempenho', needsId: true },
];

const EMPTY = {
  // públicos (workshop_mechanics)
  name: '', phone: '', role_title: '', specialty: '', skills: [] as string[],
  employment_type: '' as EmploymentType | '', hired_at: '', work_schedule: '', status: 'active' as TeamStatus,
  terminated_at: '', commission: '', commission_parts: '', commission_revenue: '', cnh_category: '', cnh_expires_at: '', notes: '',
  // sensíveis (workshop_mechanic_private)
  cpf: '', rg: '', birth_date: '', email: '', address: '', emergency_name: '', emergency_phone: '',
  salary: '', pix_key: '', bank_name: '', bank_agency: '', bank_account: '',
};
type Form = typeof EMPTY;

type PerfOs = {
  id: string; number: number | null; title: string; price: number; labor_cost: number | null;
  started_at: string | null; completed_at: string | null; estimated_hours: number | null;
  pauses: { started_at: string; ended_at: string | null }[] | null;
};

export default function EquipeFicha() {
  const { id } = useParams();
  const isNew = id === 'novo';
  const nav = useNavigate();
  const { currentWorkshop, user } = useAuth();
  const wid = currentWorkshop?.id ?? null;

  const [tab, setTab]       = useState<Tab>('pessoal');
  const [f, setF]           = useState<Form>(EMPTY);
  const [mech, setMech]     = useState<WorkshopMechanic | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [certs, setCerts]   = useState<MechanicCertification[]>([]);
  const [docs, setDocs]     = useState<MechanicDocument[]>([]);
  const [perf, setPerf]     = useState<PerfOs[]>([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty]   = useState(false);

  const set = (k: keyof Form) => (e: { target: { value: string } }) => { setF(s => ({ ...s, [k]: e.target.value })); setDirty(true); };

  const load = useCallback(async () => {
    if (isNew || !id) return;
    const [m, p, c, d, o] = await Promise.all([
      supabase.from('workshop_mechanics').select('*').eq('id', id).maybeSingle(),
      supabase.from('workshop_mechanic_private').select('*').eq('mechanic_id', id).maybeSingle(),
      supabase.from('workshop_mechanic_certifications').select('*').eq('mechanic_id', id).order('expires_at'),
      supabase.from('workshop_mechanic_documents').select('*').eq('mechanic_id', id).order('created_at', { ascending: false }),
      supabase.from('service_orders')
        .select('id, number, title, price, labor_cost, started_at, completed_at, estimated_hours, pauses:service_order_pauses(started_at, ended_at)')
        .eq('workshop_mechanic_id', id).eq('status', 'completed').is('quote_status', null)
        .order('completed_at', { ascending: false }).limit(500),
    ]);
    const x = m.data as WorkshopMechanic | null;
    if (!x) { setLoading(false); setMech(null); return; }
    const pv = (p.data as MechanicPrivate | null);
    setMech(x);
    setF({
      name: x.name, phone: x.phone ?? '', role_title: x.role_title ?? '', specialty: x.specialty ?? '', skills: [...(x.skills ?? [])],
      employment_type: (x.employment_type ?? '') as EmploymentType | '', hired_at: x.hired_at ?? '', work_schedule: x.work_schedule ?? '',
      status: x.status ?? (x.active ? 'active' : 'terminated'), terminated_at: x.terminated_at ?? '',
      commission: x.commission_percent ? String(x.commission_percent).replace('.', ',') : '',
      commission_parts: x.commission_parts_percent ? String(x.commission_parts_percent).replace('.', ',') : '',
      commission_revenue: x.commission_revenue_percent ? String(x.commission_revenue_percent).replace('.', ',') : '',
      cnh_category: x.cnh_category ?? '', cnh_expires_at: x.cnh_expires_at ?? '', notes: x.notes ?? '',
      cpf: pv?.cpf ?? '', rg: pv?.rg ?? '', birth_date: pv?.birth_date ?? '', email: pv?.email ?? '', address: pv?.address ?? '',
      emergency_name: pv?.emergency_name ?? '', emergency_phone: pv?.emergency_phone ?? '',
      salary: pv?.salary != null ? moneyInput(Number(pv.salary)) : '',
      pix_key: pv?.pix_key ?? '', bank_name: pv?.bank_name ?? '', bank_agency: pv?.bank_agency ?? '', bank_account: pv?.bank_account ?? '',
    });
    setCerts((c.data as MechanicCertification[]) ?? []);
    setDocs((d.data as MechanicDocument[]) ?? []);
    setPerf((o.data as unknown as PerfOs[]) ?? []);
    if (x.photo_url) {
      const { data: s } = await supabase.storage.from('os-attachments').createSignedUrl(x.photo_url, 3600);
      setPhotoUrl(s?.signedUrl ?? null);
    } else setPhotoUrl(null);
    setDirty(false);
    setLoading(false);
  }, [id, isNew]);

  useEffect(() => { load(); }, [load]);

  // Aviso ao sair com alterações não salvas
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  async function save(e?: FormEvent) {
    e?.preventDefault();
    if (!wid) return;
    if (!f.name.trim()) { toast.error('Informe o nome'); setTab('pessoal'); return; }
    const commission = f.commission ? Number(f.commission.replace(',', '.')) : 0;
    const commissionParts = f.commission_parts ? Number(f.commission_parts.replace(',', '.')) : 0;
    const commissionRevenue = f.commission_revenue ? Number(f.commission_revenue.replace(',', '.')) : 0;
    if ([commission, commissionParts, commissionRevenue].some(n => !Number.isFinite(n) || n < 0 || n > 100)) {
      toast.error('Comissão deve ser entre 0 e 100%'); setTab('contratacao'); return;
    }
    const salary = f.salary ? parseMoney(f.salary) : null;
    if (salary != null && (!Number.isFinite(salary) || salary < 0)) { toast.error('Salário inválido'); setTab('contratacao'); return; }

    const pub = {
      workshop_id: wid,
      name: f.name.trim(), phone: f.phone.trim() || null, role_title: f.role_title || null,
      specialty: f.specialty || null, skills: f.skills,
      employment_type: f.employment_type || null, hired_at: f.hired_at || null, work_schedule: f.work_schedule.trim() || null,
      status: f.status, active: f.status === 'active',
      terminated_at: f.status === 'terminated' ? (f.terminated_at || new Date().toISOString().slice(0, 10)) : null,
      commission_percent: commission,
      commission_parts_percent: commissionParts,
      commission_revenue_percent: commissionRevenue,
      cnh_category: f.cnh_category.trim().toUpperCase() || null, cnh_expires_at: f.cnh_expires_at || null,
      notes: f.notes.trim() || null,
    };
    setSaving(true);
    try {
      let mechId = mech?.id ?? null;
      if (mechId) {
        const { error } = await supabase.from('workshop_mechanics').update(pub).eq('id', mechId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('workshop_mechanics').insert(pub).select('id').single();
        if (error) throw error;
        mechId = data.id;
      }
      const { error: pErr } = await supabase.from('workshop_mechanic_private').upsert({
        mechanic_id: mechId, workshop_id: wid,
        cpf: f.cpf.trim() || null, rg: f.rg.trim() || null, birth_date: f.birth_date || null,
        email: f.email.trim() || null, address: f.address.trim() || null,
        emergency_name: f.emergency_name.trim() || null, emergency_phone: f.emergency_phone.trim() || null,
        salary, pix_key: f.pix_key.trim() || null, bank_name: f.bank_name.trim() || null,
        bank_agency: f.bank_agency.trim() || null, bank_account: f.bank_account.trim() || null,
        updated_at: new Date().toISOString(),
      });
      if (pErr) throw pErr;
      setDirty(false);
      toast.success(isNew ? 'Colaborador cadastrado ✓' : 'Cadastro atualizado ✓');
      if (isNew) nav(`/oficina/equipe/${mechId}`, { replace: true });
      else load();
    } catch (err: any) {
      console.error('[EquipeFicha] erro:', err);
      toast.error('Não foi possível salvar: ' + (err?.message ?? 'erro'));
    } finally {
      setSaving(false);
    }
  }

  // ── Foto ──
  const photoRef = useRef<HTMLInputElement>(null);
  async function onPhoto(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !mech || !wid) return;
    try {
      const blob = await resizeImage(file, 600, 0.85);
      const path = `${wid}/team/${mech.id}-${Date.now()}.jpg`;
      const { error } = await supabase.storage.from('os-attachments').upload(path, blob, { contentType: 'image/jpeg' });
      if (error) throw error;
      const { error: uErr } = await supabase.from('workshop_mechanics').update({ photo_url: path }).eq('id', mech.id);
      if (uErr) throw uErr;
      if (mech.photo_url) await supabase.storage.from('os-attachments').remove([mech.photo_url]);
      toast.success('Foto atualizada ✓');
      load();
    } catch (err: any) {
      toast.error('Não foi possível enviar a foto: ' + (err?.message ?? 'erro'));
    }
  }

  if (loading) {
    return <WorkshopLayout><div className="max-w-5xl mx-auto h-64 bg-white rounded-2xl animate-pulse" /></WorkshopLayout>;
  }
  if (!isNew && !mech) {
    return (
      <WorkshopLayout>
        <div className="card max-w-md mx-auto text-center py-10">
          <div className="text-4xl mb-2">🔎</div>
          <h1 className="text-xl font-bold">Colaborador não encontrado</h1>
          <Link to="/oficina/equipe" className="btn-primary mt-5 inline-block">Ver equipe</Link>
        </div>
      </WorkshopLayout>
    );
  }

  const st = TEAM_STATUS[f.status];

  return (
    <WorkshopLayout>
      <form onSubmit={save} className="max-w-5xl mx-auto">
        <Link to="/oficina/equipe" className="text-sm text-steel-500 hover:text-steel-800">← Equipe</Link>

        {/* Cabeçalho */}
        <div className="card mt-3 mb-4 flex flex-wrap items-center gap-4">
          <button type="button" onClick={() => mech ? photoRef.current?.click() : toast.info('Salve o cadastro para adicionar a foto')}
            className="relative h-20 w-20 rounded-full overflow-hidden bg-brand-500/10 grid place-items-center text-brand-600 font-bold text-3xl shrink-0 group"
            title="Trocar foto">
            {photoUrl ? <img src={photoUrl} alt="" className="h-full w-full object-cover" /> : (f.name.charAt(0).toUpperCase() || '👤')}
            <span className="absolute inset-0 bg-black/40 text-white text-xs font-semibold grid place-items-center opacity-0 group-hover:opacity-100 transition">📷 Foto</span>
          </button>
          <input ref={photoRef} type="file" accept="image/*" className="hidden" onChange={onPhoto} />
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold tracking-tight truncate">{f.name || 'Novo colaborador'}</h1>
            <div className="text-sm text-steel-500">
              {[f.role_title, EMPLOYMENT_TYPES.find(e => e.value === f.employment_type)?.label].filter(Boolean).join(' · ') || 'Preencha função e vínculo em Contratação'}
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className={`badge text-[10px] ${st.badge}`}>{st.label}</span>
              {f.hired_at && <span className="text-xs text-steel-400">na oficina há {tenure(f.hired_at, f.status === 'terminated' ? f.terminated_at : null)}</span>}
              {scheduleSummary(f.work_schedule) && <span className="text-xs text-steel-400">· 🕒 {scheduleSummary(f.work_schedule)}</span>}
            </div>
          </div>
          <div className="flex gap-2 items-center">
            {dirty && <span className="text-xs text-pending-700">Alterações não salvas</span>}
            <button className="btn-primary" disabled={saving}>{saving ? 'Salvando…' : isNew ? 'Cadastrar' : '💾 Salvar'}</button>
          </div>
        </div>

        {/* Afastamento: data de saída, previsão e retorno */}
        {mech && wid && (
          <AbsencePanel workshopId={wid} mechanicId={mech.id} status={f.status} userId={user?.id ?? null}
            onStatusChange={s => { setF(x => ({ ...x, status: s })); setMech(m => m ? { ...m, status: s, active: s === 'active' } : m); }} />
        )}

        {/* Comissão: sempre à vista, em qualquer aba */}
        <CommissionBox value={f.commission} onChange={v => { setF(s => ({ ...s, commission: v })); setDirty(true); }}
          parts={f.commission_parts} onParts={v => { setF(s => ({ ...s, commission_parts: v })); setDirty(true); }}
          revenue={f.commission_revenue} onRevenue={v => { setF(s => ({ ...s, commission_revenue: v })); setDirty(true); }} />

        {/* Abas */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 mb-4">
          {TABS.map(t => {
            const disabled = t.needsId && !mech;
            return (
              <button type="button" key={t.key} disabled={disabled} onClick={() => setTab(t.key)}
                title={disabled ? 'Disponível depois de cadastrar' : undefined}
                className={`shrink-0 text-sm font-semibold px-3.5 py-2 rounded-xl border transition disabled:opacity-40 ${
                  tab === t.key ? 'bg-brand-500 text-white border-brand-500' : 'bg-white text-steel-600 border-steel-200 hover:border-brand-300'}`}>
                {t.label}
              </button>
            );
          })}
        </div>

        <div className="card">
          {tab === 'pessoal' && (
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Nome completo *" className="sm:col-span-2"><input className="input" value={f.name} onChange={set('name')} required /></Field>
              <Field label="Telefone / WhatsApp"><input className="input" inputMode="tel" value={f.phone} onChange={set('phone')} /></Field>
              <Field label="E-mail" sensitive><input className="input" type="email" value={f.email} onChange={set('email')} /></Field>
              <Field label="CPF" sensitive><input className="input" value={f.cpf} onChange={set('cpf')} placeholder="000.000.000-00" /></Field>
              <Field label="RG" sensitive><input className="input" value={f.rg} onChange={set('rg')} /></Field>
              <Field label="Data de nascimento" sensitive><input className="input" type="date" value={f.birth_date} onChange={set('birth_date')} /></Field>
              <Field label="Endereço" sensitive className="sm:col-span-2"><input className="input" value={f.address} onChange={set('address')} placeholder="Rua, número, bairro, cidade" /></Field>
              <Field label="Contato de emergência (nome)" sensitive><input className="input" value={f.emergency_name} onChange={set('emergency_name')} /></Field>
              <Field label="Contato de emergência (telefone)" sensitive><input className="input" inputMode="tel" value={f.emergency_phone} onChange={set('emergency_phone')} /></Field>
            </div>
          )}

          {tab === 'contratacao' && (
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Função">
                <select className="input" value={f.role_title} onChange={set('role_title')}>
                  <option value="">— Selecionar —</option>
                  <optgroup label="Oficina">{SHOP_ROLES.map(r => <option key={r} value={r}>{r}</option>)}</optgroup>
                  <optgroup label="Balcão e escritório">{OFFICE_ROLES.map(r => <option key={r} value={r}>{r}</option>)}</optgroup>
                  <option value="Outro">Outro</option>
                  {f.role_title && !SHOP_ROLES.includes(f.role_title) && !OFFICE_ROLES.includes(f.role_title) && f.role_title !== 'Outro' && (
                    <option value={f.role_title}>{f.role_title}</option>
                  )}
                </select>
              </Field>
              <Field label="Vínculo">
                <select className="input" value={f.employment_type} onChange={set('employment_type')}>
                  <option value="">— Selecionar —</option>
                  {EMPLOYMENT_TYPES.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
                </select>
              </Field>
              <Field label="Data de admissão"><input className="input" type="date" value={f.hired_at} onChange={set('hired_at')} /></Field>
              <Field label="Salário fixo (R$)" sensitive>
                <input className="input" inputMode="decimal" value={f.salary} onChange={set('salary')} placeholder="0,00"
                  onBlur={e => { const v = parseMoney(e.target.value); if (Number.isFinite(v)) setF(s => ({ ...s, salary: moneyInput(v) })); }} />
              </Field>
              <Field label="Situação">
                {f.status === 'away' ? (
                  <p className="text-sm text-pending-800 bg-pending-50 rounded-xl px-3 py-2">
                    Afastado — para registrar a volta, use <strong>✅ Registrar retorno</strong> no topo da ficha.
                  </p>
                ) : (
                <div className="flex gap-2">
                  {(['active', 'terminated'] as TeamStatus[]).map(s => (
                    <button type="button" key={s} onClick={() => { setF(x => ({ ...x, status: s })); setDirty(true); }}
                      className={`flex-1 text-sm font-semibold py-2 rounded-xl border-2 transition ${f.status === s ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-steel-200 text-steel-600'}`}>
                      {TEAM_STATUS[s].label}
                    </button>
                  ))}
                </div>
                )}
                {f.status === 'active' && mech && <p className="text-xs text-steel-500 mt-1">Férias, atestado ou licença? Use <strong>🏖️ Registrar afastamento</strong> no topo da ficha.</p>}
                {f.status === 'terminated' && <p className="text-xs text-steel-500 mt-1">Não aparece para escolher em novas OS. O histórico fica guardado.</p>}
              </Field>
              {f.status === 'terminated' && (
                <Field label="Data de desligamento"><input className="input" type="date" value={f.terminated_at} onChange={set('terminated_at')} /></Field>
              )}
              <Field label="Jornada de trabalho" className="sm:col-span-2">
                <ScheduleEditor value={f.work_schedule} isClt={f.employment_type === 'clt'}
                  onChange={v => { setF(s => ({ ...s, work_schedule: v })); setDirty(true); }} />
              </Field>
              <Field label="Observações" className="sm:col-span-2"><textarea className="input" rows={3} value={f.notes} onChange={set('notes')} /></Field>
            </div>
          )}

          {tab === 'qualificacoes' && (
            <div className="space-y-6">
              <div className="grid sm:grid-cols-2 gap-4">
                <Qualifications role={f.role_title} specialty={f.specialty} skills={f.skills}
                  onSpecialty={v => { setF(x => ({ ...x, specialty: v })); setDirty(true); }}
                  onSkills={v => { setF(x => ({ ...x, skills: v })); setDirty(true); }} />
                <Field label="CNH — categoria"><input className="input uppercase" value={f.cnh_category} onChange={set('cnh_category')} placeholder="Ex.: AB" /></Field>
                <Field label="CNH — validade">
                  <input className="input" type="date" value={f.cnh_expires_at} onChange={set('cnh_expires_at')} />
                  <ExpiryHint date={f.cnh_expires_at} />
                </Field>
              </div>
              <Certifications mechanicId={mech?.id ?? null} workshopId={wid} list={certs} onChange={load} />
            </div>
          )}

          {tab === 'documentos' && mech && wid && (
            <Documents mechanicId={mech.id} workshopId={wid} list={docs} onChange={load} />
          )}

          {tab === 'pagamento' && (
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Chave PIX" sensitive className="sm:col-span-2"><input className="input" value={f.pix_key} onChange={set('pix_key')} placeholder="CPF, telefone, e-mail ou chave aleatória" /></Field>
              <Field label="Banco" sensitive><input className="input" value={f.bank_name} onChange={set('bank_name')} /></Field>
              <Field label="Agência" sensitive><input className="input" value={f.bank_agency} onChange={set('bank_agency')} /></Field>
              <Field label="Conta" sensitive><input className="input" value={f.bank_account} onChange={set('bank_account')} /></Field>
            </div>
          )}

          {tab === 'desempenho' && <Performance list={perf} commissionPct={Number(f.commission.replace(',', '.')) || 0} />}

          {(tab === 'pessoal' || tab === 'contratacao' || tab === 'pagamento') && (
            <p className="text-xs text-steel-400 mt-5 pt-4 border-t border-steel-100">🔒 Campos com cadeado são dados pessoais (LGPD): só o dono da oficina tem acesso.</p>
          )}
        </div>
      </form>
    </WorkshopLayout>
  );
}

function Field({ label, children, className = '', sensitive = false }: {
  label: string; children: React.ReactNode; className?: string; sensitive?: boolean;
}) {
  return (
    <div className={className}>
      <label className="label">{label}{sensitive && <span className="ml-1 text-steel-400" title="Dado sensível — só o dono vê">🔒</span>}</label>
      {children}
    </div>
  );
}

/** Especialidade e habilidades conforme a função (oficina x balcão/escritório) */
function Qualifications({ role, specialty, skills, onSpecialty, onSkills }: {
  role: string; specialty: string; skills: string[]; onSpecialty: (v: string) => void; onSkills: (v: string[]) => void;
}) {
  const area = roleArea(role);
  const groups = area === 'both' ? (['shop', 'office'] as const) : [area];
  const known = new Set(groups.flatMap(g => QUALIFICATIONS[g].skills));
  // habilidades marcadas antes (ex.: de outra função) continuam visíveis para poder desmarcar
  const extra = skills.filter(s => !known.has(s));
  const knownSpecs = groups.flatMap(g => QUALIFICATIONS[g].specialties);
  const toggle = (s: string) => onSkills(skills.includes(s) ? skills.filter(y => y !== s) : [...skills, s]);
  const chip = (s: string) => {
    const on = skills.includes(s);
    return (
      <button type="button" key={s} onClick={() => toggle(s)}
        className={`text-xs px-3 py-1.5 rounded-full border transition ${on ? 'bg-brand-500 text-white border-brand-500' : 'bg-white text-steel-600 border-steel-200 hover:border-brand-300'}`}>
        {on ? '✓ ' : ''}{s}
      </button>
    );
  };

  return (
    <>
      <Field label="Especialidade principal">
        <select className="input" value={specialty} onChange={e => onSpecialty(e.target.value)}>
          <option value="">— Selecionar —</option>
          {groups.length > 1
            ? groups.map(g => (
                <optgroup key={g} label={QUALIFICATIONS[g].label}>
                  {QUALIFICATIONS[g].specialties.map(s => <option key={`${g}-${s}`} value={s}>{s}</option>)}
                </optgroup>
              ))
            : QUALIFICATIONS[groups[0]].specialties.map(s => <option key={s} value={s}>{s}</option>)}
          {specialty && !knownSpecs.includes(specialty) && <option value={specialty}>{specialty}</option>}
        </select>
      </Field>
      <div className="self-end text-xs text-steel-500 pb-2">
        {role ? <>Opções para <strong>{role}</strong>.</> : <>Escolha a função em <strong>Contratação</strong> para ver só as opções dela.</>}
      </div>
      <Field label="Habilidades" className="sm:col-span-2">
        <div className="space-y-3">
          {groups.map(g => (
            <div key={g}>
              {groups.length > 1 && <div className="text-[11px] font-semibold text-steel-400 mb-1.5">{QUALIFICATIONS[g].label}</div>}
              <div className="flex flex-wrap gap-1.5">{QUALIFICATIONS[g].skills.map(chip)}</div>
            </div>
          ))}
          {extra.length > 0 && (
            <div>
              <div className="text-[11px] font-semibold text-steel-400 mb-1.5">Marcadas antes</div>
              <div className="flex flex-wrap gap-1.5">{extra.map(chip)}</div>
            </div>
          )}
        </div>
      </Field>
    </>
  );
}

const COMMISSION_PRESETS = ['0', '20', '30', '40', '50'];
const EXAMPLE_LABOR = 200;

/** % de comissão com atalhos e exemplo calculado na hora */
function CommissionBox({ value, onChange, parts, onParts, revenue, onRevenue }: {
  value: string; onChange: (v: string) => void;
  parts: string; onParts: (v: string) => void;
  revenue: string; onRevenue: (v: string) => void;
}) {
  const pct = Number(value.replace(',', '.'));
  const valid = value === '' || (Number.isFinite(pct) && pct >= 0 && pct <= 100);
  const current = value === '' ? '0' : value;
  return (
    <div className="card mb-4 !py-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="min-w-[180px]">
          <div className="text-sm font-bold text-steel-900">💰 Comissão</div>
          <div className="text-xs text-steel-500">% sobre os serviços que ele fizer</div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {COMMISSION_PRESETS.map(p => (
            <button type="button" key={p} onClick={() => onChange(p === '0' ? '' : p)}
              className={`text-sm font-semibold px-3 py-1.5 rounded-full border transition ${
                current === p ? 'bg-brand-500 text-white border-brand-500' : 'bg-white text-steel-600 border-steel-200 hover:border-brand-300'}`}>
              {p === '0' ? 'Sem comissão' : `${p}%`}
            </button>
          ))}
          <div className="relative w-24">
            <input className={`input !py-1.5 !pr-7 text-sm ${valid ? '' : '!border-alert-500'}`} inputMode="decimal"
              placeholder="outro" value={COMMISSION_PRESETS.includes(current) ? '' : value}
              onChange={e => onChange(e.target.value)} aria-label="Outra porcentagem" />
            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-steel-400 text-sm">%</span>
          </div>
        </div>
        <div className="text-xs sm:ml-auto">
          {!valid ? (
            <span className="text-alert-600 font-semibold">Use um valor entre 0 e 100%</span>
          ) : pct > 0 ? (
            <span className="text-steel-600">
              Ex.: numa OS com {fmtBRL(EXAMPLE_LABOR)} de mão de obra, ele recebe <strong className="text-signal-700">{fmtBRL(EXAMPLE_LABOR * pct / 100)}</strong>
            </span>
          ) : (
            <span className="text-steel-400">Não recebe comissão sobre serviços</span>
          )}
        </div>
      </div>
      <div className="mt-3 pt-3 border-t border-steel-100 grid sm:grid-cols-2 gap-3">
        <PctField label="% sobre as peças" hint="das peças nos itens que ele fizer" value={parts} onChange={onParts} />
        <PctField label="% sobre o faturamento da loja" hint="de tudo que a loja faturar no mês (ex.: gerente 1,5%)" value={revenue} onChange={onRevenue} />
      </div>
      <p className="text-[11px] text-steel-400 mt-2">
        As % se somam. Serviços e peças contam para quem fez cada item da OS — dá para trocar item a item na OS.
      </p>
    </div>
  );
}

function PctField({ label, hint, value, onChange }: { label: string; hint: string; value: string; onChange: (v: string) => void }) {
  const n = Number(value.replace(',', '.'));
  const valid = value === '' || (Number.isFinite(n) && n >= 0 && n <= 100);
  return (
    <label className="flex items-center gap-3">
      <div className="relative w-24 shrink-0">
        <input className={`input !py-1.5 !pr-7 text-sm text-right ${valid ? '' : '!border-alert-500'}`} inputMode="decimal"
          placeholder="0" value={value} onChange={e => onChange(e.target.value)} />
        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-steel-400 text-sm">%</span>
      </div>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-steel-800">{label}</span>
        <span className="block text-[11px] text-steel-500">{hint}</span>
      </span>
    </label>
  );
}

function ExpiryHint({ date }: { date?: string | null }) {
  const e = expiryLabel(date);
  if (!e) return null;
  return <div className={`text-[11px] font-semibold mt-1 inline-block px-2 py-0.5 rounded-full ${e.cls}`}>{e.text}</div>;
}

/** Cursos e certificados, com alerta de validade */
function Certifications({ mechanicId, workshopId, list, onChange }: {
  mechanicId: string | null; workshopId: string | null; list: MechanicCertification[]; onChange: () => void;
}) {
  const [c, setC] = useState({ name: '', issued_at: '', expires_at: '' });
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!mechanicId || !workshopId) { toast.info('Salve o cadastro para adicionar certificados'); return; }
    if (!c.name.trim()) { toast.error('Informe o nome do curso ou certificado'); return; }
    setBusy(true);
    const { error } = await supabase.from('workshop_mechanic_certifications').insert({
      mechanic_id: mechanicId, workshop_id: workshopId, name: c.name.trim(),
      issued_at: c.issued_at || null, expires_at: c.expires_at || null,
    });
    setBusy(false);
    if (error) { toast.error('Erro: ' + error.message); return; }
    setC({ name: '', issued_at: '', expires_at: '' });
    onChange();
  }
  async function remove(id: string) {
    if (!confirm('Remover este certificado?')) return;
    const { error } = await supabase.from('workshop_mechanic_certifications').delete().eq('id', id);
    if (error) { toast.error('Erro: ' + error.message); return; }
    onChange();
  }

  return (
    <div>
      <div className="text-[10px] font-bold text-steel-500 uppercase tracking-widest mb-2">Cursos e certificados</div>
      {list.length === 0 ? <p className="text-sm text-steel-400 mb-3">Nenhum cadastrado.</p> : (
        <ul className="divide-y divide-steel-100 mb-3">
          {list.map(x => (
            <li key={x.id} className="py-2 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold truncate">{x.name}</div>
                <div className="text-xs text-steel-500">
                  {x.issued_at && `emitido em ${new Date(`${x.issued_at}T00:00:00`).toLocaleDateString('pt-BR')}`}
                </div>
                <ExpiryHint date={x.expires_at} />
              </div>
              <button type="button" onClick={() => remove(x.id)} className="text-xs text-steel-400 hover:text-alert-600">Remover</button>
            </li>
          ))}
        </ul>
      )}
      <div className="grid sm:grid-cols-4 gap-2 items-end">
        <input className="input !py-2 sm:col-span-2" placeholder="Ex.: Curso de injeção eletrônica — SENAI" value={c.name} onChange={e => setC(s => ({ ...s, name: e.target.value }))} />
        <label className="text-[10px] text-steel-400 uppercase">Emissão<input className="input !py-2" type="date" value={c.issued_at} onChange={e => setC(s => ({ ...s, issued_at: e.target.value }))} /></label>
        <label className="text-[10px] text-steel-400 uppercase">Validade<input className="input !py-2" type="date" value={c.expires_at} onChange={e => setC(s => ({ ...s, expires_at: e.target.value }))} /></label>
      </div>
      <button type="button" onClick={add} disabled={busy} className="btn-ghost border border-steel-200 text-sm !py-2 mt-2">+ Adicionar certificado</button>
    </div>
  );
}

/** Documentos do colaborador (bucket privado; só o dono) */
function Documents({ mechanicId, workshopId, list, onChange }: {
  mechanicId: string; workshopId: string; list: MechanicDocument[]; onChange: () => void;
}) {
  const [kind, setKind] = useState(DOCUMENT_KINDS[0]);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function upload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { toast.error('Arquivo muito grande (máx. 10 MB)'); return; }
    setBusy(true);
    try {
      const isImage = file.type.startsWith('image/');
      const body = isImage ? await resizeImage(file, 2000, 0.85) : file;
      const ext = isImage ? 'jpg' : (file.name.split('.').pop() || 'pdf').toLowerCase();
      const path = `${workshopId}/${mechanicId}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from('team-documents').upload(path, body, { contentType: isImage ? 'image/jpeg' : file.type });
      if (error) throw error;
      const { error: dErr } = await supabase.from('workshop_mechanic_documents').insert({
        mechanic_id: mechanicId, workshop_id: workshopId, kind, file_path: path, file_name: file.name,
      });
      if (dErr) throw dErr;
      toast.success('Documento enviado ✓');
      onChange();
    } catch (err: any) {
      toast.error('Não foi possível enviar: ' + (err?.message ?? 'erro'));
    } finally {
      setBusy(false);
    }
  }

  async function open(d: MechanicDocument) {
    const { data, error } = await supabase.storage.from('team-documents').createSignedUrl(d.file_path, 300);
    if (error || !data) { toast.error('Não foi possível abrir o arquivo'); return; }
    window.open(data.signedUrl, '_blank', 'noopener');
  }

  async function remove(d: MechanicDocument) {
    if (!confirm(`Excluir o documento "${d.kind}"?`)) return;
    await supabase.storage.from('team-documents').remove([d.file_path]);
    const { error } = await supabase.from('workshop_mechanic_documents').delete().eq('id', d.id);
    if (error) { toast.error('Erro: ' + error.message); return; }
    onChange();
  }

  return (
    <div>
      <div className="flex flex-wrap items-end gap-2 mb-4">
        <label className="text-[10px] text-steel-400 uppercase">Tipo
          <select className="input !py-2" value={kind} onChange={e => setKind(e.target.value)}>
            {DOCUMENT_KINDS.map(k => <option key={k} value={k}>{k}</option>)}
          </select>
        </label>
        <button type="button" onClick={() => fileRef.current?.click()} disabled={busy} className="btn-primary !py-2">
          {busy ? 'Enviando…' : '📎 Enviar foto ou PDF'}
        </button>
        <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={upload} />
      </div>
      {list.length === 0 ? <p className="text-sm text-steel-400">Nenhum documento enviado.</p> : (
        <ul className="divide-y divide-steel-100">
          {list.map(d => (
            <li key={d.id} className="py-2.5 flex items-center justify-between gap-3">
              <button type="button" onClick={() => open(d)} className="min-w-0 text-left">
                <div className="text-sm font-semibold text-brand-700 hover:underline">📄 {d.kind}</div>
                <div className="text-xs text-steel-500 truncate">{d.file_name} · {new Date(d.created_at).toLocaleDateString('pt-BR')}</div>
              </button>
              <button type="button" onClick={() => remove(d)} className="text-xs text-steel-400 hover:text-alert-600 shrink-0">Excluir</button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-steel-400 mt-4">🔒 Documentos ficam guardados de forma privada: só o dono da oficina acessa.</p>
    </div>
  );
}

/** Desempenho mês a mês (OS concluídas, horas trabalhadas, comissão) */
function Performance({ list, commissionPct }: { list: PerfOs[]; commissionPct: number }) {
  if (list.length === 0) return <p className="text-sm text-steel-400">Nenhuma OS concluída por este colaborador ainda.</p>;

  const months = new Map<string, { label: string; count: number; worked: number; labor: number; revenue: number; onTime: number; withEst: number }>();
  for (const o of list) {
    const d = new Date(o.completed_at!);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const row = months.get(key) ?? { label: d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }), count: 0, worked: 0, labor: 0, revenue: 0, onTime: 0, withEst: 0 };
    const w = workedMinutes(o.started_at, o.completed_at, o.pauses) ?? 0;
    row.count += 1; row.worked += w; row.labor += Number(o.labor_cost ?? 0); row.revenue += Number(o.price);
    if (o.estimated_hours && o.started_at) { row.withEst += 1; if (w <= Number(o.estimated_hours) * 60) row.onTime += 1; }
    months.set(key, row);
  }
  const rows = [...months.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 12);

  return (
    <div className="space-y-5">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-steel-50 text-[10px] uppercase tracking-wider text-steel-500">
            <tr>
              <th className="text-left px-3 py-2">Mês</th><th className="text-right px-3 py-2">OS</th>
              <th className="text-right px-3 py-2">Horas trabalhadas</th><th className="text-right px-3 py-2">No prazo</th>
              <th className="text-right px-3 py-2">Faturou</th><th className="text-right px-3 py-2">Comissão</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-steel-100">
            {rows.map(([k, r]) => (
              <tr key={k}>
                <td className="px-3 py-2 capitalize">{r.label}</td>
                <td className="px-3 py-2 text-right">{r.count}</td>
                <td className="px-3 py-2 text-right">{r.worked ? fmtDur(r.worked) : '—'}</td>
                <td className="px-3 py-2 text-right">{r.withEst ? `${Math.round((r.onTime / r.withEst) * 100)}%` : '—'}</td>
                <td className="px-3 py-2 text-right">{fmtBRL(r.revenue)}</td>
                <td className="px-3 py-2 text-right font-semibold">{fmtBRL(r.labor * commissionPct / 100)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div>
        <div className="text-[10px] font-bold text-steel-500 uppercase tracking-widest mb-2">Últimas OS concluídas</div>
        <ul className="divide-y divide-steel-100">
          {list.slice(0, 10).map(o => (
            <li key={o.id}>
              <Link to={`/oficina/os/${o.id}`} className="py-2 flex justify-between gap-3 text-sm hover:bg-steel-50 -mx-2 px-2 rounded-lg">
                <span className="truncate">OS {osNumber(o)} · {o.title}</span>
                <span className="shrink-0 text-steel-500">{new Date(o.completed_at!).toLocaleDateString('pt-BR')} · {fmtBRL(o.price)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
