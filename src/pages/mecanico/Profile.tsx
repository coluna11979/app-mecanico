import { FormEvent, useEffect, useState } from 'react';
import MechanicLayout from '@/components/layout/MechanicLayout';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { Mechanic, Job } from '@/types/database';

const SKILL_SUGGESTIONS = [
  'Motor', 'Freios', 'Suspensão', 'Elétrica', 'Câmbio', 'Ar condicionado',
  'Injeção eletrônica', 'Escapamento', 'Funilaria', 'Pintura', 'Diagnóstico',
  'Transmissão', 'Embreagem', 'Direção hidráulica', 'Alinhamento', 'Balanceamento',
];

export default function MechanicProfile() {
  const { user, profile } = useAuth();
  const [me, setMe]               = useState<Mechanic | null>(null);
  const [history, setHistory]     = useState<Job[]>([]);
  const [loading, setLoading]     = useState(true);

  // Edição
  const [editRate, setEditRate]   = useState(false);
  const [rateVal, setRateVal]     = useState('');
  const [editSkills, setEditSkills] = useState(false);
  const [skills, setSkills]       = useState<string[]>([]);
  const [newSkill, setNewSkill]   = useState('');
  const [saving, setSaving]       = useState(false);
  const [msg, setMsg]             = useState<string | null>(null);

  useEffect(() => { if (user) load(); }, [user]);

  async function load() {
    const { data: m } = await supabase.from('mechanics').select('*').eq('profile_id', user!.id).maybeSingle();
    setMe(m as Mechanic);
    setSkills(m?.skills ?? []);
    setRateVal(String(m?.hourly_rate ?? ''));
    if (m?.id) {
      const { data: jobs } = await supabase
        .from('jobs').select('*').eq('mechanic_id', m.id)
        .eq('status', 'completed').order('completed_at', { ascending: false }).limit(20);
      setHistory((jobs as Job[]) ?? []);
    }
    setLoading(false);
  }

  async function saveRate(e: FormEvent) {
    e.preventDefault();
    if (!me) return;
    setSaving(true);
    await supabase.from('mechanics').update({ hourly_rate: Number(rateVal) }).eq('id', me.id);
    setMe({ ...me, hourly_rate: Number(rateVal) });
    setEditRate(false); setSaving(false);
    flash('Valor/hora atualizado!');
  }

  async function saveSkills() {
    if (!me) return;
    setSaving(true);
    await supabase.from('mechanics').update({ skills }).eq('id', me.id);
    setMe({ ...me, skills });
    setEditSkills(false); setSaving(false);
    flash('Habilidades atualizadas!');
  }

  function addSkill(s: string) {
    const trimmed = s.trim();
    if (trimmed && !skills.includes(trimmed)) setSkills(prev => [...prev, trimmed]);
    setNewSkill('');
  }

  function flash(text: string) {
    setMsg(text);
    setTimeout(() => setMsg(null), 3000);
  }

  const totalEarnings  = history.reduce((a, j) => a + j.price * 0.85, 0);
  const monthEarnings  = history
    .filter(j => new Date(j.completed_at!).getMonth() === new Date().getMonth())
    .reduce((a, j) => a + j.price * 0.85, 0);

  const initials = (profile?.full_name ?? 'M').split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();

  if (loading) return (
    <MechanicLayout>
      <div className="flex items-center justify-center pt-20 gap-3 text-steel-500">
        <div className="h-5 w-5 rounded-full border-2 border-brand-500 border-t-transparent animate-spin" />
        Carregando perfil…
      </div>
    </MechanicLayout>
  );

  return (
    <MechanicLayout>
      <div className="px-4 pt-6 pb-4 space-y-5">

        {/* ── Hero ── */}
        <div className="relative rounded-2xl bg-gradient-to-br from-steel-800 to-steel-900 border border-steel-700 p-5 overflow-hidden">
          <div className="absolute top-0 right-0 w-40 h-40 bg-brand-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="h-16 w-16 rounded-2xl bg-brand-500 grid place-items-center text-white text-2xl font-bold shadow-brand">
                {initials}
              </div>
              <div className={`absolute -bottom-1 -right-1 h-4 w-4 rounded-full border-2 border-steel-800 ${me?.is_available ? 'bg-signal-500' : 'bg-steel-600'}`} />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold truncate">{profile?.full_name}</h1>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className="text-xs text-steel-400">★ {(me?.rating ?? 0).toFixed(1)}</span>
                <span className="text-steel-700">·</span>
                <span className="text-xs text-steel-400">{me?.total_jobs ?? 0} jobs</span>
                <span className="text-steel-700">·</span>
                <span className="text-xs text-steel-400">{me?.experience_years ?? 0} anos exp.</span>
              </div>
              <div className={`inline-flex items-center gap-1.5 mt-2 text-[11px] font-semibold px-2.5 py-1 rounded-full ${
                me?.is_available ? 'bg-signal-500/15 text-signal-400' : 'bg-steel-700/50 text-steel-500'
              }`}>
                <span className={`h-1.5 w-1.5 rounded-full ${me?.is_available ? 'bg-signal-400' : 'bg-steel-500'}`} />
                {me?.is_available ? 'Disponível' : 'Offline'}
              </div>
            </div>
          </div>
        </div>

        {/* ── Stats de ganhos ── */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-steel-800 border border-steel-700 p-4">
            <div className="text-[10px] text-steel-500 uppercase tracking-widest font-semibold">Este mês</div>
            <div className="text-2xl font-bold text-signal-400 font-display mt-1">
              R$ {monthEarnings.toFixed(0)}
            </div>
            <div className="text-[11px] text-steel-500 mt-0.5">seus 85%</div>
          </div>
          <div className="rounded-2xl bg-steel-800 border border-steel-700 p-4">
            <div className="text-[10px] text-steel-500 uppercase tracking-widest font-semibold">Total ganho</div>
            <div className="text-2xl font-bold text-white font-display mt-1">
              R$ {totalEarnings.toFixed(0)}
            </div>
            <div className="text-[11px] text-steel-500 mt-0.5">{history.length} jobs</div>
          </div>
        </div>

        {/* ── Valor/hora ── */}
        <div className="rounded-2xl bg-steel-800 border border-steel-700 p-4">
          <div className="flex items-center justify-between mb-1">
            <div className="text-[10px] text-steel-500 uppercase tracking-widest font-semibold">Seu valor / hora</div>
            {!editRate && (
              <button onClick={() => setEditRate(true)}
                className="text-xs text-brand-400 hover:text-brand-300 font-semibold transition">
                Editar
              </button>
            )}
          </div>
          {editRate ? (
            <form onSubmit={saveRate} className="flex gap-2 mt-2">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-steel-400 text-sm">R$</span>
                <input
                  className="input !bg-steel-900 !text-white !border-steel-600 !pl-9 text-xl font-bold"
                  type="number" min={10} step={5} autoFocus
                  value={rateVal} onChange={e => setRateVal(e.target.value)}
                />
              </div>
              <button type="submit" disabled={saving} className="btn-primary !py-2 !px-4 shrink-0">
                {saving ? '…' : 'Salvar'}
              </button>
              <button type="button" onClick={() => setEditRate(false)} className="btn-ghost !py-2 !px-3 shrink-0 text-sm">
                ✕
              </button>
            </form>
          ) : (
            <div className="text-3xl font-bold font-display text-white mt-1">
              R$ {me?.hourly_rate?.toFixed(0) ?? '—'}
              <span className="text-sm font-normal text-steel-400 ml-1">/hora</span>
            </div>
          )}
        </div>

        {/* ── Habilidades ── */}
        <div className="rounded-2xl bg-steel-800 border border-steel-700 p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-[10px] text-steel-500 uppercase tracking-widest font-semibold">Habilidades</div>
            {!editSkills ? (
              <button onClick={() => setEditSkills(true)}
                className="text-xs text-brand-400 hover:text-brand-300 font-semibold transition">
                Editar
              </button>
            ) : (
              <div className="flex gap-2">
                <button onClick={() => { setSkills(me?.skills ?? []); setEditSkills(false); }}
                  className="text-xs text-steel-500 hover:text-steel-300 transition">Cancelar</button>
                <button onClick={saveSkills} disabled={saving}
                  className="text-xs text-brand-400 hover:text-brand-300 font-semibold transition">
                  {saving ? '…' : 'Salvar'}
                </button>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {skills.map(s => (
              <span key={s}
                className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full transition ${
                  editSkills
                    ? 'bg-brand-500/20 text-brand-300 border border-brand-500/40'
                    : 'bg-steel-700 text-steel-300'
                }`}>
                {s}
                {editSkills && (
                  <button type="button" onClick={() => setSkills(prev => prev.filter(x => x !== s))}
                    className="text-brand-400 hover:text-red-400 leading-none ml-0.5">×</button>
                )}
              </span>
            ))}
            {skills.length === 0 && !editSkills && (
              <span className="text-sm text-steel-500">Nenhuma habilidade cadastrada.</span>
            )}
          </div>

          {editSkills && (
            <div className="mt-4 space-y-3">
              {/* Sugestões rápidas */}
              <div>
                <div className="text-[10px] text-steel-500 mb-2 uppercase tracking-wider">Adicionar sugestão</div>
                <div className="flex flex-wrap gap-1.5">
                  {SKILL_SUGGESTIONS.filter(s => !skills.includes(s)).map(s => (
                    <button key={s} type="button" onClick={() => addSkill(s)}
                      className="text-xs px-2.5 py-1 rounded-full bg-steel-700/50 text-steel-400 hover:bg-brand-500/20 hover:text-brand-300 border border-steel-700 hover:border-brand-500/40 transition">
                      + {s}
                    </button>
                  ))}
                </div>
              </div>
              {/* Campo livre */}
              <div className="flex gap-2">
                <input
                  className="input !bg-steel-900 !text-white !border-steel-600 flex-1 text-sm"
                  placeholder="Outra habilidade…"
                  value={newSkill}
                  onChange={e => setNewSkill(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSkill(newSkill); }}}
                />
                <button type="button" onClick={() => addSkill(newSkill)}
                  className="btn-primary !py-2 !px-4 shrink-0 text-sm">
                  +
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Histórico ── */}
        <div>
          <div className="text-[10px] text-steel-500 uppercase tracking-widest font-semibold mb-3 px-1">
            Histórico de jobs
          </div>
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
                      R$ {(j.price * 0.85).toFixed(0)}
                    </div>
                    <div className="text-[10px] text-steel-600">seus 85%</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>

      {/* Toast */}
      {msg && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-signal-500 text-white text-sm font-semibold px-5 py-2.5 rounded-full shadow-lg z-50 whitespace-nowrap">
          ✓ {msg}
        </div>
      )}
    </MechanicLayout>
  );
}
