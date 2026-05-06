import { useEffect, useState } from 'react';
import MechanicLayout from '@/components/layout/MechanicLayout';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { AvatarUpload } from '@/components/AvatarUpload';
import type { Mechanic, Job } from '@/types/database';

const SKILL_SUGGESTIONS = [
  'Motor', 'Freios', 'Suspensão', 'Elétrica', 'Câmbio', 'Ar condicionado',
  'Injeção eletrônica', 'Escapamento', 'Diagnóstico', 'Transmissão',
  'Embreagem', 'Direção hidráulica', 'Alinhamento', 'Balanceamento', 'Diesel', 'Funilaria',
];

type EditForm = {
  full_name: string; phone: string; pix_key: string;
  cpf: string; cnh: string; experience_years: string; skills: string[];
};

export default function MechanicProfile() {
  const { user, profile, refreshProfile } = useAuth();
  const [me, setMe]             = useState<Mechanic | null>(null);
  const [history, setHistory]   = useState<Job[]>([]);
  const [loading, setLoading]   = useState(true);
  const [editing, setEditing]   = useState(false);
  const [form, setForm]         = useState<EditForm>({ full_name: '', phone: '', pix_key: '', cpf: '', cnh: '', experience_years: '', skills: [] });
  const [newSkill, setNewSkill] = useState('');
  const [saving, setSaving]     = useState(false);
  const [msg, setMsg]           = useState<string | null>(null);

  useEffect(() => { if (user) load(); }, [user]);

  async function load() {
    const { data: m } = await supabase.from('mechanics').select('*').eq('profile_id', user!.id).maybeSingle();
    setMe(m as Mechanic);
    if (m?.id) {
      const { data: jobs } = await supabase
        .from('jobs').select('*').eq('mechanic_id', m.id)
        .eq('status', 'completed').order('completed_at', { ascending: false }).limit(20);
      setHistory((jobs as Job[]) ?? []);
    }
    setLoading(false);
  }

  function openEdit() {
    setForm({
      full_name:        profile?.full_name ?? '',
      phone:            profile?.phone ?? '',
      pix_key:          (me as any)?.pix_key ?? '',
      cpf:              me?.cpf ?? '',
      cnh:              me?.cnh ?? '',
      experience_years: String(me?.experience_years ?? 0),
      skills:           [...(me?.skills ?? [])],
    });
    setEditing(true);
  }

  function addSkill(s: string) {
    const t = s.trim();
    if (t && !form.skills.includes(t)) setForm(f => ({ ...f, skills: [...f.skills, t] }));
    setNewSkill('');
  }

  async function save() {
    if (!me) return;
    setSaving(true);
    await Promise.all([
      supabase.from('profiles').update({ full_name: form.full_name.trim(), phone: form.phone.trim() }).eq('id', user!.id),
      supabase.from('mechanics').update({
        cpf:              form.cpf.trim(),
        cnh:              form.cnh.trim() || null,
        experience_years: Number(form.experience_years),
        skills:           form.skills,
        pix_key:          form.pix_key.trim() || null,
      }).eq('id', me.id),
    ]);
    await Promise.all([load(), refreshProfile()]);
    setSaving(false);
    setEditing(false);
    flash('Perfil atualizado!');
  }

  function flash(text: string) {
    setMsg(text);
    setTimeout(() => setMsg(null), 3000);
  }

  const MECH_PCT = 0.82; // 100% - 18% taxa plataforma
  const totalEarnings = history.reduce((a, j) => a + (j.price ?? 0) * MECH_PCT, 0);
  const monthEarnings = history
    .filter(j => new Date(j.completed_at!).getMonth() === new Date().getMonth())
    .reduce((a, j) => a + (j.price ?? 0) * MECH_PCT, 0);
  const initials = (profile?.full_name ?? 'M').split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();

  if (loading) return (
    <MechanicLayout>
      <div className="flex items-center justify-center pt-20 gap-3 text-steel-500">
        <div className="h-5 w-5 rounded-full border-2 border-brand-500 border-t-transparent animate-spin" />
        Carregando…
      </div>
    </MechanicLayout>
  );

  return (
    <MechanicLayout>
      <div className="px-4 pt-6 pb-4 space-y-4">

        {/* ── Hero ── */}
        <div className="relative rounded-2xl bg-gradient-to-br from-steel-800 to-steel-900 border border-steel-700 p-5 overflow-hidden">
          <div className="absolute top-0 right-0 w-40 h-40 bg-brand-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="flex items-start gap-4">
            <AvatarUpload
              userId={user!.id}
              currentUrl={profile?.avatar_url ?? null}
              initials={initials}
              size="lg"
              dark
              onUploaded={() => refreshProfile()}
            />
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold truncate">{profile?.full_name}</h1>
              <div className="flex items-center gap-2 mt-1 text-xs text-steel-400 flex-wrap">
                <span>★ {(me?.rating ?? 0).toFixed(1)}</span>
                <span className="text-steel-700">·</span>
                <span>{me?.total_jobs ?? 0} jobs</span>
                <span className="text-steel-700">·</span>
                <span>{me?.experience_years ?? 0} anos exp.</span>
              </div>
              <div className={`inline-flex items-center gap-1.5 mt-2 text-[11px] font-semibold px-2.5 py-1 rounded-full ${
                me?.is_available ? 'bg-signal-500/15 text-signal-400' : 'bg-steel-700/50 text-steel-500'
              }`}>
                <span className={`h-1.5 w-1.5 rounded-full ${me?.is_available ? 'bg-signal-400 animate-pulse' : 'bg-steel-500'}`} />
                {me?.is_available ? 'Disponível' : 'Offline'}
              </div>
            </div>
            <button onClick={openEdit}
              className="shrink-0 bg-steel-700 hover:bg-steel-600 text-steel-300 hover:text-white transition rounded-xl px-3 py-2 text-xs font-semibold">
              ✏️ Editar
            </button>
          </div>
        </div>

        {/* ── Ganhos ── */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-steel-800 border border-steel-700 p-4">
            <div className="text-[10px] text-steel-500 uppercase tracking-widest font-semibold">Este mês</div>
            <div className="text-2xl font-bold text-signal-400 font-display mt-1">R$ {monthEarnings.toFixed(0)}</div>
            <div className="text-[11px] text-steel-500 mt-0.5">seus 82%</div>
          </div>
          <div className="rounded-2xl bg-steel-800 border border-steel-700 p-4">
            <div className="text-[10px] text-steel-500 uppercase tracking-widest font-semibold">Total ganho</div>
            <div className="text-2xl font-bold text-white font-display mt-1">R$ {totalEarnings.toFixed(0)}</div>
            <div className="text-[11px] text-steel-500 mt-0.5">{history.length} jobs</div>
          </div>
        </div>

        {/* ── Dados pessoais (view) ── */}
        <div className="rounded-2xl bg-steel-800 border border-steel-700 divide-y divide-steel-700/60">
          <Row label="Telefone"    value={profile?.phone ?? '—'} />
          <Row label="Chave PIX"   value={(me as any)?.pix_key || '—'} />
          <Row label="CPF"         value={me?.cpf ?? '—'} />
          <Row label="CNH"         value={me?.cnh || '—'} />
          <Row label="Experiência" value={`${me?.experience_years ?? 0} anos`} />
        </div>

        {/* ── Habilidades (view) ── */}
        <div className="rounded-2xl bg-steel-800 border border-steel-700 p-4">
          <div className="text-[10px] text-steel-500 uppercase tracking-widest font-semibold mb-3">Habilidades</div>
          <div className="flex flex-wrap gap-2">
            {(me?.skills ?? []).length === 0
              ? <span className="text-sm text-steel-500">Nenhuma cadastrada. Toque em Editar.</span>
              : (me?.skills ?? []).map(s => (
                  <span key={s} className="text-xs font-semibold px-3 py-1.5 rounded-full bg-steel-700 text-steel-300">{s}</span>
                ))
            }
          </div>
        </div>

        {/* ── Histórico ── */}
        <div>
          <div className="text-[10px] text-steel-500 uppercase tracking-widest font-semibold mb-3 px-1">Histórico</div>
          {history.length === 0 ? (
            <div className="rounded-2xl bg-steel-800 border border-steel-700 text-center py-10 text-steel-500 text-sm">
              Nenhum job concluído ainda.
            </div>
          ) : (
            <div className="space-y-2">
              {history.map(j => (
                <div key={j.id} className="rounded-2xl bg-steel-800 border border-steel-700 px-4 py-3 flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm truncate">{j.title}</div>
                    <div className="text-xs text-steel-500 mt-0.5">
                      {new Date(j.completed_at!).toLocaleDateString('pt-BR', { day:'2-digit', month:'short', year:'numeric' })}
                      {j.actual_hours != null && ` · ${j.actual_hours}h`}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-signal-400 font-bold font-display">
                      {(j.price ?? 0) > 0 ? `R$ ${((j.price ?? 0) * MECH_PCT).toFixed(0)}` : '—'}
                    </div>
                    <div className="text-[10px] text-steel-600">seus 82%</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Drawer de edição ── */}
      {editing && (
        <div className="fixed inset-0 z-50 flex flex-col bg-steel-900/95 backdrop-blur overflow-y-auto">
          <div className="sticky top-0 flex items-center justify-between px-4 py-4 border-b border-steel-800 bg-steel-900/95 backdrop-blur">
            <h2 className="text-lg font-bold">Editar perfil</h2>
            <button onClick={() => setEditing(false)} className="text-steel-400 hover:text-white text-2xl leading-none">✕</button>
          </div>

          <div className="flex-1 px-4 py-5 space-y-5">

            <Section title="Dados pessoais">
              <Field label="Nome completo *">
                <input className="input !bg-steel-900 !text-white !border-steel-700" required
                  value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} />
              </Field>
              <Field label="Telefone / WhatsApp">
                <input className="input !bg-steel-900 !text-white !border-steel-700"
                  value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                  placeholder="(11) 99999-9999" />
              </Field>
              <Field label="Chave PIX (para receber pagamentos)">
                <input className="input !bg-steel-900 !text-white !border-steel-700"
                  value={form.pix_key} onChange={e => setForm(f => ({ ...f, pix_key: e.target.value }))}
                  placeholder="CPF, e-mail, telefone ou chave aleatória" />
              </Field>
            </Section>

            <Section title="Documentos">
              <div className="grid grid-cols-2 gap-3">
                <Field label="CPF">
                  <input className="input !bg-steel-900 !text-white !border-steel-700"
                    value={form.cpf} onChange={e => setForm(f => ({ ...f, cpf: e.target.value }))}
                    placeholder="000.000.000-00" />
                </Field>
                <Field label="CNH (opcional)">
                  <input className="input !bg-steel-900 !text-white !border-steel-700"
                    value={form.cnh} onChange={e => setForm(f => ({ ...f, cnh: e.target.value }))} />
                </Field>
              </div>
              <Field label="Anos de experiência">
                <input className="input !bg-steel-900 !text-white !border-steel-700" type="number" min={0} max={50}
                  value={form.experience_years} onChange={e => setForm(f => ({ ...f, experience_years: e.target.value }))} />
              </Field>
            </Section>

            <Section title="Habilidades">
              <div className="flex flex-wrap gap-2 mb-3">
                {form.skills.map(s => (
                  <span key={s} className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full bg-brand-500/20 text-brand-300 border border-brand-500/40">
                    {s}
                    <button type="button" onClick={() => setForm(f => ({ ...f, skills: f.skills.filter(x => x !== s) }))}
                      className="hover:text-red-400 leading-none">×</button>
                  </span>
                ))}
                {form.skills.length === 0 && <span className="text-sm text-steel-500">Nenhuma adicionada ainda.</span>}
              </div>

              <div className="text-[10px] text-steel-500 uppercase tracking-wider mb-2">Sugestões rápidas</div>
              <div className="flex flex-wrap gap-1.5 mb-3">
                {SKILL_SUGGESTIONS.filter(s => !form.skills.includes(s)).map(s => (
                  <button key={s} type="button" onClick={() => addSkill(s)}
                    className="text-xs px-2.5 py-1 rounded-full bg-steel-800 text-steel-400 hover:bg-brand-500/20 hover:text-brand-300 border border-steel-700 hover:border-brand-500/40 transition">
                    + {s}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <input className="input !bg-steel-900 !text-white !border-steel-700 flex-1 text-sm"
                  placeholder="Outra habilidade…" value={newSkill}
                  onChange={e => setNewSkill(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSkill(newSkill); }}} />
                <button type="button" onClick={() => addSkill(newSkill)}
                  className="btn-primary !py-2 !px-4 shrink-0 text-sm">+</button>
              </div>
            </Section>
          </div>

          <div className="sticky bottom-0 px-4 py-4 border-t border-steel-800 bg-steel-900 flex gap-3">
            <button onClick={() => setEditing(false)} className="btn-ghost flex-1">Cancelar</button>
            <button onClick={save} disabled={saving} className="btn-primary flex-1 btn-lg">
              {saving ? 'Salvando…' : 'Salvar alterações'}
            </button>
          </div>
        </div>
      )}

      {msg && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-signal-500 text-white text-sm font-semibold px-5 py-2.5 rounded-full shadow-lg z-50 whitespace-nowrap">
          ✓ {msg}
        </div>
      )}
    </MechanicLayout>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 gap-4">
      <span className="text-xs text-steel-500 uppercase tracking-wider font-semibold shrink-0">{label}</span>
      <span className="text-sm font-medium text-right truncate">{value}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] text-steel-500 uppercase tracking-widest font-semibold mb-3">{title}</div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs text-steel-400 font-semibold mb-1 block">{label}</label>
      {children}
    </div>
  );
}
