import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import AdminLayout from '@/components/layout/AdminLayout';
import { supabase } from '@/lib/supabase';
import { ApprovalMessageItem } from '@/components/ApprovalMessageItem';
import type { Profile, Mechanic, Workshop, ApprovalMessage, ProfileStatus } from '@/types/database';

const STATUS_LABEL: Record<ProfileStatus, string> = {
  pending:      '🆕 Novo',
  under_review: '🔍 Em análise',
  approved:     '✅ Aprovado',
  rejected:     '❌ Rejeitado',
};
const STATUS_COLOR: Record<ProfileStatus, string> = {
  pending:      'bg-brand-50 text-brand-700 border-brand-200',
  under_review: 'bg-pending-500/10 text-pending-700 border-pending-300',
  approved:     'bg-signal-500/10 text-signal-700 border-signal-300',
  rejected:     'bg-alert-500/10 text-alert-700 border-alert-300',
};

export default function AdminUserDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const [profile, setProfile]   = useState<Profile | null>(null);
  const [mechanic, setMechanic] = useState<Mechanic | null>(null);
  const [workshop, setWorkshop] = useState<Workshop | null>(null);
  const [messages, setMessages] = useState<ApprovalMessage[]>([]);
  const [loading, setLoading]   = useState(true);
  const [busy, setBusy]         = useState(false);
  const [saved, setSaved]       = useState(false);
  const [userEmail, setUserEmail] = useState<string>('');
  const [emailDraft, setEmailDraft] = useState('');
  const [emailEditing, setEmailEditing] = useState(false);
  const [emailMsg, setEmailMsg]   = useState<{ text: string; ok: boolean } | null>(null);

  // Form state
  const [edit, setEdit] = useState({
    full_name: '', phone: '',
    cpf: '', cnh: '', experience_years: 0, hourly_rate: 0, pix_key: '',
    business_name: '', cnpj: '', address: '', city: '', state: '', description: '',
    admin_notes: '',
  });

  useEffect(() => { if (id) load(); }, [id]);

  async function load() {
    if (!id) return;
    setLoading(true);

    const { data: p } = await supabase.from('profiles').select('*').eq('id', id).maybeSingle();
    if (!p) { setLoading(false); return; }
    setProfile(p as Profile);

    // Busca email via RPC admin
    const { data: emailData } = await supabase.rpc('admin_get_user_email', { target_profile_id: id });
    if (emailData) {
      setUserEmail(emailData as string);
      setEmailDraft(emailData as string);
    }

    if (p.role === 'mechanic') {
      const { data: m } = await supabase.from('mechanics').select('*').eq('profile_id', id).maybeSingle();
      setMechanic(m as Mechanic);
      setEdit(e => ({
        ...e,
        full_name: p.full_name, phone: p.phone ?? '',
        cpf: m?.cpf ?? '', cnh: m?.cnh ?? '',
        experience_years: m?.experience_years ?? 0,
        hourly_rate: m?.hourly_rate ?? 0,
        pix_key: (m as any)?.pix_key ?? '',
        admin_notes: p.admin_notes ?? '',
      }));
    } else if (p.role === 'workshop') {
      const { data: w } = await supabase.from('workshops').select('*').eq('profile_id', id).maybeSingle();
      setWorkshop(w as Workshop);
      setEdit(e => ({
        ...e,
        full_name: p.full_name, phone: p.phone ?? '',
        business_name: w?.business_name ?? '', cnpj: w?.cnpj ?? '',
        address: w?.address ?? '', city: w?.city ?? '', state: w?.state ?? '',
        description: w?.description ?? '',
        admin_notes: p.admin_notes ?? '',
      }));
    }

    const { data: msgs } = await supabase
      .from('approval_messages')
      .select('*')
      .eq('profile_id', id)
      .order('created_at', { ascending: true });
    setMessages((msgs as ApprovalMessage[]) ?? []);

    setLoading(false);
  }

  async function save() {
    if (!profile) return;
    setBusy(true);

    await supabase.from('profiles').update({
      full_name: edit.full_name.trim(),
      phone:     edit.phone.trim() || null,
      admin_notes: edit.admin_notes.trim() || null,
    }).eq('id', profile.id);

    if (profile.role === 'mechanic' && mechanic) {
      await supabase.from('mechanics').update({
        cpf: edit.cpf.trim(),
        cnh: edit.cnh.trim() || null,
        experience_years: Number(edit.experience_years) || 0,
        hourly_rate: Number(edit.hourly_rate) || 0,
        pix_key: edit.pix_key.trim() || null,
      }).eq('id', mechanic.id);
    }

    if (profile.role === 'workshop' && workshop) {
      await supabase.from('workshops').update({
        business_name: edit.business_name.trim(),
        cnpj:    edit.cnpj.trim(),
        address: edit.address.trim(),
        city:    edit.city.trim(),
        state:   edit.state.trim().toUpperCase(),
        description: edit.description.trim() || null,
      }).eq('id', workshop.id);
    }

    setBusy(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
    load();
  }

  async function saveEmail() {
    if (!profile || !emailDraft.trim()) return;
    setBusy(true);
    setEmailMsg(null);
    const { data, error } = await supabase.functions.invoke('admin-update-user-email', {
      body: { profile_id: profile.id, new_email: emailDraft.trim() },
    });
    setBusy(false);
    if (error || data?.error) {
      setEmailMsg({ text: data?.error ?? error?.message ?? 'Erro ao alterar email', ok: false });
      return;
    }
    setUserEmail(emailDraft.trim());
    setEmailEditing(false);
    setEmailMsg({ text: 'Email alterado com sucesso', ok: true });
    setTimeout(() => setEmailMsg(null), 4000);
  }

  async function changeStatus(status: ProfileStatus) {
    if (!profile) return;
    setBusy(true);
    await supabase.from('profiles').update({ status }).eq('id', profile.id);
    setBusy(false);
    load();
  }

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center gap-3 py-10 text-steel-500">
          <div className="h-5 w-5 rounded-full border-2 border-brand-500 border-t-transparent animate-spin" />
          Carregando…
        </div>
      </AdminLayout>
    );
  }

  if (!profile) {
    return (
      <AdminLayout>
        <div className="card text-center py-16">
          <div className="text-5xl mb-3">🤔</div>
          <h2 className="text-xl font-bold">Cadastro não encontrado</h2>
          <Link to="/admin/aprovacoes" className="btn-primary mt-4 inline-block">Voltar</Link>
        </div>
      </AdminLayout>
    );
  }

  const isMechanic = profile.role === 'mechanic';

  return (
    <AdminLayout>
      <button onClick={() => nav(-1)} className="text-sm text-steel-500 hover:text-brand-500 mb-2">← Voltar</button>

      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-6 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className={`badge text-xs ${isMechanic ? 'badge-brand' : 'bg-steel-200 text-steel-700'}`}>
              {isMechanic ? '🔧 Mecânico' : '🏪 Oficina'}
            </span>
            <span className={`text-xs font-bold rounded-full px-2.5 py-0.5 border ${STATUS_COLOR[profile.status]}`}>
              {STATUS_LABEL[profile.status]}
            </span>
          </div>
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight truncate">
            {workshop?.business_name ?? profile.full_name}
          </h1>
          <div className="text-sm text-steel-500">Cadastrado em {new Date(profile.created_at).toLocaleDateString('pt-BR')}</div>
        </div>

        {/* Status quick-change */}
        <div className="flex gap-2 flex-wrap">
          <button
            disabled={busy || profile.status === 'under_review'}
            onClick={() => changeStatus('under_review')}
            className="btn-ghost text-xs py-1.5 px-3 border border-pending-300 text-pending-700 disabled:opacity-50"
          >🔍 Em análise</button>
          <button
            disabled={busy || profile.status === 'rejected'}
            onClick={() => changeStatus('rejected')}
            className="btn-ghost text-xs py-1.5 px-3 border border-alert-300 text-alert-700 disabled:opacity-50"
          >❌ Rejeitar</button>
          <button
            disabled={busy || profile.status === 'approved'}
            onClick={() => changeStatus('approved')}
            className="btn-primary text-xs py-1.5 px-3 disabled:opacity-50"
          >✅ Aprovar</button>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* ── Coluna 1: dados editáveis ── */}
        <div className="space-y-5">
          <div className="card space-y-4">
            <h3 className="text-sm font-bold text-steel-700 uppercase tracking-wider">Dados pessoais</h3>
            <Field label="Nome completo">
              <input className="input" value={edit.full_name} onChange={e => setEdit(s => ({ ...s, full_name: e.target.value }))} />
            </Field>
            <Field label="Telefone / WhatsApp">
              <input className="input" value={edit.phone} onChange={e => setEdit(s => ({ ...s, phone: e.target.value }))} />
            </Field>

            {/* Email — usa edge function pra atualizar */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-steel-500 uppercase tracking-wider">
                  📧 Email (login + notificações)
                </label>
                {!emailEditing && userEmail && (
                  <button
                    onClick={() => { setEmailEditing(true); setEmailMsg(null); }}
                    className="text-xs text-brand-500 hover:underline font-semibold"
                  >
                    Alterar
                  </button>
                )}
              </div>
              {!emailEditing ? (
                <div className="bg-steel-50 border border-steel-200 rounded-xl px-3 py-2.5 text-sm font-mono text-steel-700 break-all">
                  {userEmail || '— (carregando)'}
                </div>
              ) : (
                <div className="space-y-2">
                  <input
                    className="input text-sm"
                    type="email"
                    value={emailDraft}
                    onChange={e => setEmailDraft(e.target.value)}
                    placeholder="email@dominio.com"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setEmailEditing(false); setEmailDraft(userEmail); setEmailMsg(null); }}
                      className="btn-ghost flex-1 text-sm py-2"
                    >Cancelar</button>
                    <button
                      onClick={saveEmail}
                      disabled={busy || !emailDraft.trim() || emailDraft === userEmail}
                      className="btn-primary flex-1 text-sm py-2 disabled:opacity-50"
                    >{busy ? 'Salvando…' : 'Salvar email'}</button>
                  </div>
                  <p className="text-[11px] text-steel-500">
                    ⚠️ Mudar o email vai trocar o login do usuário também. Próximos emails de notificação serão enviados pra esse novo endereço.
                  </p>
                </div>
              )}
              {emailMsg && (
                <p className={`text-xs mt-1.5 font-semibold ${emailMsg.ok ? 'text-signal-600' : 'text-alert-600'}`}>
                  {emailMsg.ok ? '✓ ' : '✕ '}{emailMsg.text}
                </p>
              )}
            </div>
          </div>

          {isMechanic && (
            <div className="card space-y-4">
              <h3 className="text-sm font-bold text-steel-700 uppercase tracking-wider">Dados profissionais</h3>
              <div className="grid grid-cols-2 gap-3">
                <Field label="CPF">
                  <input className="input" value={edit.cpf} onChange={e => setEdit(s => ({ ...s, cpf: e.target.value }))} />
                </Field>
                <Field label="CNH (opcional)">
                  <input className="input" value={edit.cnh} onChange={e => setEdit(s => ({ ...s, cnh: e.target.value }))} />
                </Field>
                <Field label="Anos de experiência">
                  <input className="input" type="number" min={0} max={50}
                    value={edit.experience_years}
                    onChange={e => setEdit(s => ({ ...s, experience_years: Number(e.target.value) }))} />
                </Field>
                <Field label="Valor/hora (R$)">
                  <input className="input" type="number" min={0}
                    value={edit.hourly_rate}
                    onChange={e => setEdit(s => ({ ...s, hourly_rate: Number(e.target.value) }))} />
                </Field>
              </div>
              <Field label="Chave PIX">
                <input className="input" value={edit.pix_key}
                  placeholder="CPF, e-mail, telefone ou chave aleatória"
                  onChange={e => setEdit(s => ({ ...s, pix_key: e.target.value }))} />
              </Field>
              {mechanic?.skills && mechanic.skills.length > 0 && (
                <Field label="Habilidades">
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {mechanic.skills.map(s => (
                      <span key={s} className="badge bg-steel-100 text-steel-700">{s}</span>
                    ))}
                  </div>
                </Field>
              )}
              <div className="text-xs text-steel-500 pt-2 border-t border-steel-100">
                ★ {mechanic?.rating.toFixed(1) ?? '—'} · {mechanic?.total_jobs ?? 0} jobs concluídos
              </div>
            </div>
          )}

          {!isMechanic && (
            <div className="card space-y-4">
              <h3 className="text-sm font-bold text-steel-700 uppercase tracking-wider">Dados da oficina</h3>
              <Field label="Razão social">
                <input className="input" value={edit.business_name} onChange={e => setEdit(s => ({ ...s, business_name: e.target.value }))} />
              </Field>
              <Field label="CNPJ">
                <input className="input" value={edit.cnpj} onChange={e => setEdit(s => ({ ...s, cnpj: e.target.value }))} />
              </Field>
              <Field label="Endereço">
                <input className="input" value={edit.address} onChange={e => setEdit(s => ({ ...s, address: e.target.value }))} />
              </Field>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <Field label="Cidade">
                    <input className="input" value={edit.city} onChange={e => setEdit(s => ({ ...s, city: e.target.value }))} />
                  </Field>
                </div>
                <Field label="UF">
                  <input className="input uppercase" maxLength={2} value={edit.state} onChange={e => setEdit(s => ({ ...s, state: e.target.value.toUpperCase() }))} />
                </Field>
              </div>
              <Field label="Sobre">
                <textarea className="input" rows={3} value={edit.description} onChange={e => setEdit(s => ({ ...s, description: e.target.value }))} />
              </Field>
              <div className="text-xs text-steel-500 pt-2 border-t border-steel-100">
                ★ {workshop?.rating.toFixed(1) ?? '—'} · {workshop?.total_jobs ?? 0} jobs concluídos
              </div>
            </div>
          )}

          <div className="card space-y-2">
            <h3 className="text-sm font-bold text-steel-700 uppercase tracking-wider">Notas internas</h3>
            <textarea
              className="input text-sm resize-none"
              rows={3}
              placeholder="Anotações privadas sobre o cadastro…"
              value={edit.admin_notes}
              onChange={e => setEdit(s => ({ ...s, admin_notes: e.target.value }))}
            />
            <p className="text-[11px] text-steel-400">Somente o admin vê estas notas.</p>
          </div>

          <button onClick={save} disabled={busy} className="btn-primary w-full btn-lg">
            {busy ? 'Salvando…' : '💾 Salvar alterações'}
          </button>
          {saved && (
            <p className="text-center text-signal-600 text-sm font-semibold">✓ Alterações salvas com sucesso</p>
          )}
        </div>

        {/* ── Coluna 2: histórico ── */}
        <div className="space-y-5">
          <div className="card">
            <h3 className="text-sm font-bold text-steel-700 uppercase tracking-wider mb-3">
              💬 Histórico ({messages.length})
            </h3>
            {messages.length === 0 ? (
              <p className="text-sm text-steel-400 text-center py-6">Nenhuma mensagem ainda.</p>
            ) : (
              <div className="space-y-2 max-h-[600px] overflow-y-auto">
                {messages.map(m => {
                  const reqStates: Record<string, boolean> = {};
                  if (m.kind === 'request_documents') {
                    const reqTime = new Date(m.created_at).getTime();
                    reqStates[m.id] = messages.some(r =>
                      r.kind === 'reply' && r.sender_role === 'user' &&
                      new Date(r.created_at).getTime() > reqTime
                    );
                  }
                  return (
                    <ApprovalMessageItem
                      key={m.id}
                      message={m}
                      resolved={m.kind === 'request_documents' ? reqStates[m.id] : undefined}
                    />
                  );
                })}
              </div>
            )}
            <div className="mt-4 pt-3 border-t border-steel-100">
              <Link to="/admin/aprovacoes" className="btn-secondary w-full text-sm text-center block">
                📋 Gerenciar aprovações (mensagens, docs, etc)
              </Link>
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-semibold text-steel-500 uppercase tracking-wider mb-1 block">{label}</label>
      {children}
    </div>
  );
}
