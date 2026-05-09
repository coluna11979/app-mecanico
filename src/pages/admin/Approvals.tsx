import { useEffect, useState } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { ApprovalMessageItem } from '@/components/ApprovalMessageItem';
import type { Profile, Mechanic, Workshop, ApprovalMessage, ProfileStatus } from '@/types/database';

type Row = Profile & { mechanic?: Mechanic; workshop?: Workshop };
type TabKey = 'pending' | 'under_review' | 'approved' | 'rejected';

const TABS: { key: TabKey; label: string; emoji: string; color: string }[] = [
  { key: 'pending',      label: 'Novos',          emoji: '🆕', color: 'text-brand-600 bg-brand-50' },
  { key: 'under_review', label: 'Em análise',     emoji: '🔍', color: 'text-pending-600 bg-pending-500/10' },
  { key: 'approved',     label: 'Aprovados',      emoji: '✅', color: 'text-signal-600 bg-signal-500/10' },
  { key: 'rejected',     label: 'Rejeitados',     emoji: '❌', color: 'text-alert-600 bg-alert-500/10' },
];

export default function AdminApprovals() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [counts, setCounts] = useState<Record<TabKey, number>>({ pending: 0, under_review: 0, approved: 0, rejected: 0 });
  const [tab, setTab] = useState<TabKey>('pending');
  const [loading, setLoading] = useState(true);
  const [opened, setOpened] = useState<Row | null>(null);

  useEffect(() => { load(); }, [tab]);

  async function load() {
    setLoading(true);

    // Carrega contagens de todos os status (pra mostrar nas abas)
    const allCounts = await Promise.all(
      TABS.map(t =>
        supabase.from('profiles').select('id', { count: 'exact', head: true })
          .eq('status', t.key).neq('role', 'admin')
          .then(({ count }) => [t.key, count ?? 0] as const)
      )
    );
    setCounts(Object.fromEntries(allCounts) as Record<TabKey, number>);

    // Carrega rows da tab selecionada
    const { data: profiles } = await supabase
      .from('profiles')
      .select('*')
      .eq('status', tab)
      .neq('role', 'admin')
      .order('created_at', { ascending: false });

    const result: Row[] = [];
    for (const p of (profiles ?? []) as Profile[]) {
      const row: Row = { ...p };
      if (p.role === 'mechanic') {
        const { data } = await supabase.from('mechanics').select('*').eq('profile_id', p.id).maybeSingle();
        row.mechanic = data as Mechanic;
      } else if (p.role === 'workshop') {
        const { data } = await supabase.from('workshops').select('*').eq('profile_id', p.id).maybeSingle();
        row.workshop = data as Workshop;
      }
      result.push(row);
    }
    setRows(result);
    setLoading(false);
  }

  return (
    <AdminLayout>
      <h1 className="text-2xl lg:text-3xl font-bold tracking-tight mb-2">Cadastros</h1>
      <p className="text-steel-500 text-sm mb-6">Analise, solicite documentos e aprove os cadastros de mecânicos e oficinas.</p>

      {/* Tabs */}
      <div className="flex gap-1 bg-steel-100 rounded-2xl p-1 mb-6 overflow-x-auto">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 min-w-fit px-4 py-2.5 rounded-xl text-sm font-bold transition flex items-center justify-center gap-2 whitespace-nowrap ${
              tab === t.key
                ? 'bg-white shadow text-steel-900'
                : 'text-steel-500 hover:text-steel-700'
            }`}
          >
            <span>{t.emoji}</span>
            <span>{t.label}</span>
            {counts[t.key] > 0 && (
              <span className={`text-[11px] font-bold rounded-full px-2 py-0.5 ${t.color}`}>
                {counts[t.key]}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => <div key={i} className="card h-28 animate-pulse bg-steel-100" />)}
        </div>
      ) : rows.length === 0 ? (
        <div className="card text-center py-16 text-steel-500">
          <div className="text-4xl mb-3">{TABS.find(t => t.key === tab)?.emoji}</div>
          <div className="font-semibold">Nenhum cadastro {TABS.find(t => t.key === tab)?.label.toLowerCase()}</div>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map(r => (
            <RowCard key={r.id} row={r} onOpen={() => setOpened(r)} />
          ))}
        </div>
      )}

      {/* Drawer de detalhes / ações */}
      {opened && user && (
        <ApprovalDrawer
          row={opened}
          adminId={user.id}
          onClose={() => setOpened(null)}
          onChanged={() => { setOpened(null); load(); }}
        />
      )}
    </AdminLayout>
  );
}

/* ──────────────── RowCard ──────────────── */

function RowCard({ row, onOpen }: { row: Row; onOpen: () => void }) {
  const statusLabel: Record<ProfileStatus, string> = {
    pending: '🆕 Novo',
    under_review: '🔍 Em análise',
    approved: '✅ Aprovado',
    rejected: '❌ Rejeitado',
  };
  const statusColor: Record<ProfileStatus, string> = {
    pending: 'bg-brand-50 text-brand-700',
    under_review: 'bg-pending-500/10 text-pending-700',
    approved: 'bg-signal-500/10 text-signal-700',
    rejected: 'bg-alert-500/10 text-alert-700',
  };

  return (
    <button
      onClick={onOpen}
      className="card w-full text-left hover:shadow-md transition active:scale-[0.99]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span className={`badge text-xs ${row.role === 'mechanic' ? 'badge-brand' : 'bg-steel-200 text-steel-700'}`}>
              {row.role === 'mechanic' ? '🔧 Mecânico' : '🏪 Oficina'}
            </span>
            <span className={`text-xs font-bold rounded-full px-2.5 py-0.5 ${statusColor[row.status]}`}>
              {statusLabel[row.status]}
            </span>
          </div>
          <h3 className="font-bold text-steel-900 truncate">
            {row.workshop?.business_name ?? row.full_name}
          </h3>
          <div className="text-sm text-steel-500 mt-0.5 truncate">
            {row.role === 'workshop' && row.workshop?.cnpj && `CNPJ ${row.workshop.cnpj} · `}
            {row.role === 'mechanic' && row.mechanic?.cpf && `CPF ${row.mechanic.cpf} · `}
            {row.phone}
          </div>
          <div className="text-xs text-steel-400 mt-0.5">
            Cadastrado em {new Date(row.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
          </div>
        </div>
        <span className="text-steel-400 text-xl shrink-0">→</span>
      </div>
    </button>
  );
}

/* ──────────────── Drawer de detalhes + ações ──────────────── */

function ApprovalDrawer({
  row, adminId, onClose, onChanged,
}: {
  row: Row;
  adminId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [messages, setMessages] = useState<ApprovalMessage[]>([]);
  const [adminNotes, setAdminNotes] = useState(row.admin_notes ?? '');
  const [busy, setBusy] = useState<string | null>(null);

  // Modal de solicitação de documentos
  const [reqOpen, setReqOpen] = useState(false);
  const [reqText, setReqText] = useState('');

  // Modal de rejeição
  const [rejOpen, setRejOpen] = useState(false);
  const [rejText, setRejText] = useState('');

  useEffect(() => { loadMessages(); }, [row.id]);

  async function loadMessages() {
    const { data } = await supabase
      .from('approval_messages')
      .select('*')
      .eq('profile_id', row.id)
      .order('created_at', { ascending: true });
    setMessages((data as ApprovalMessage[]) ?? []);
  }

  async function changeStatus(status: ProfileStatus, message?: string) {
    setBusy(status);
    await supabase.from('profiles').update({ status }).eq('id', row.id);

    // Registra no histórico
    const labels: Record<ProfileStatus, string> = {
      pending:      'cadastro reaberto como pendente',
      under_review: 'cadastro marcado como em análise',
      approved:     'cadastro aprovado',
      rejected:     'cadastro rejeitado',
    };
    const content = message
      ? `${labels[status]} — ${message}`
      : labels[status];

    await supabase.from('approval_messages').insert({
      profile_id: row.id,
      sender_id: adminId,
      sender_role: 'admin',
      kind: status === 'rejected' || status === 'approved' ? 'status_change' : 'note',
      content,
    });

    setBusy(null);
    onChanged();
  }

  async function requestDocuments() {
    if (!reqText.trim()) return;
    setBusy('req_docs');
    // Marca como em análise + manda mensagem
    await supabase.from('profiles').update({ status: 'under_review' }).eq('id', row.id);
    await supabase.from('approval_messages').insert({
      profile_id: row.id,
      sender_id: adminId,
      sender_role: 'admin',
      kind: 'request_documents',
      content: reqText.trim(),
    });
    setBusy(null);
    setReqOpen(false);
    setReqText('');
    onChanged();
  }

  async function reject() {
    if (!rejText.trim()) return;
    await changeStatus('rejected', rejText.trim());
    setRejOpen(false);
    setRejText('');
  }

  async function saveNotes() {
    setBusy('notes');
    await supabase.from('profiles').update({ admin_notes: adminNotes.trim() || null }).eq('id', row.id);
    setBusy(null);
  }

  /* Calcula quais request_documents foram resolvidas */
  const requestStates: Record<string, boolean> = {};
  for (const m of messages) {
    if (m.kind !== 'request_documents') continue;
    const reqTime = new Date(m.created_at).getTime();
    requestStates[m.id] = messages.some(r =>
      r.kind === 'reply' &&
      r.sender_role === 'user' &&
      new Date(r.created_at).getTime() > reqTime
    );
  }

  const pendingRequests = Object.entries(requestStates).filter(([_, v]) => !v).length;

  return (
    <div className="fixed inset-0 z-50 bg-steel-900/70 backdrop-blur flex justify-end">
      <div className="bg-white w-full max-w-2xl h-full overflow-y-auto shadow-2xl flex flex-col">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-steel-200 px-6 py-4 flex items-center justify-between gap-3 z-10">
          <div className="min-w-0">
            <span className={`badge text-xs ${row.role === 'mechanic' ? 'badge-brand' : 'bg-steel-200 text-steel-700'}`}>
              {row.role === 'mechanic' ? '🔧 Mecânico' : '🏪 Oficina'}
            </span>
            <h2 className="text-xl font-bold mt-1 truncate">
              {row.workshop?.business_name ?? row.full_name}
            </h2>
          </div>
          <button onClick={onClose} className="text-steel-400 hover:text-steel-700 text-2xl shrink-0">✕</button>
        </div>

        <div className="flex-1 px-6 py-5 space-y-6">

          {/* Dados de cadastro */}
          <Section title="Dados pessoais">
            <Field label="Nome">{row.full_name}</Field>
            <Field label="Telefone / WhatsApp">{row.phone || '—'}</Field>
            <Field label="Cadastrado em">
              {new Date(row.created_at).toLocaleString('pt-BR')}
            </Field>
          </Section>

          {row.mechanic && (
            <Section title="Dados profissionais">
              <Field label="CPF">{row.mechanic.cpf}</Field>
              <Field label="CNH">{row.mechanic.cnh || '—'}</Field>
              <Field label="Anos de experiência">{row.mechanic.experience_years} anos</Field>
              <Field label="Valor/hora">R$ {row.mechanic.hourly_rate}/h</Field>
              <Field label="Chave PIX">{(row.mechanic as any).pix_key || '— (não cadastrada)'}</Field>
              {row.mechanic.skills?.length > 0 && (
                <Field label="Habilidades">
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {row.mechanic.skills.map(s => (
                      <span key={s} className="badge bg-steel-100 text-steel-700 text-xs">{s}</span>
                    ))}
                  </div>
                </Field>
              )}
            </Section>
          )}

          {row.workshop && (
            <Section title="Dados da oficina">
              <Field label="Razão social">{row.workshop.business_name}</Field>
              <Field label="CNPJ">{row.workshop.cnpj}</Field>
              <Field label="Endereço">{row.workshop.address}, {row.workshop.city}/{row.workshop.state}</Field>
              <Field label="Sobre">{row.workshop.description || '—'}</Field>
            </Section>
          )}

          {/* Notas internas */}
          <Section title="Notas internas (privadas)">
            <textarea
              className="input text-sm resize-none"
              rows={3}
              placeholder="Anotações privadas sobre o cadastro… (não compartilhadas com o usuário)"
              value={adminNotes}
              onChange={e => setAdminNotes(e.target.value)}
              onBlur={saveNotes}
            />
            {busy === 'notes' && (
              <p className="text-xs text-steel-400">Salvando…</p>
            )}
          </Section>

          {/* Banner de pendências */}
          {pendingRequests > 0 && (
            <div className="bg-pending-500/10 border border-pending-300 rounded-2xl p-4 flex items-start gap-3">
              <span className="text-2xl shrink-0">⏳</span>
              <div className="flex-1">
                <div className="font-bold text-pending-700">
                  {pendingRequests === 1
                    ? '1 solicitação aguardando resposta do usuário'
                    : `${pendingRequests} solicitações aguardando resposta do usuário`}
                </div>
                <p className="text-xs text-steel-600 mt-0.5">
                  O usuário foi notificado e pode anexar documentos pela tela /aguardando-aprovacao.
                </p>
              </div>
            </div>
          )}

          {/* Histórico de mensagens */}
          {messages.length > 0 && (
            <Section title={`Histórico (${messages.length})`}>
              <div className="space-y-2">
                {messages.map(m => (
                  <ApprovalMessageItem
                    key={m.id}
                    message={m}
                    resolved={m.kind === 'request_documents' ? requestStates[m.id] : undefined}
                  />
                ))}
              </div>
            </Section>
          )}
        </div>

        {/* Footer: ações */}
        <div className="sticky bottom-0 bg-white border-t border-steel-200 px-6 py-4 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => changeStatus('under_review')}
              disabled={busy !== null || row.status === 'under_review'}
              className="btn-ghost text-sm py-2.5 border border-pending-300 text-pending-700 disabled:opacity-50"
            >
              🔍 Em análise
            </button>
            <button
              onClick={() => setReqOpen(true)}
              disabled={busy !== null}
              className="btn-ghost text-sm py-2.5 border border-steel-300 disabled:opacity-50"
            >
              📋 Solicitar docs
            </button>
            <button
              onClick={() => setRejOpen(true)}
              disabled={busy !== null || row.status === 'rejected'}
              className="btn-ghost text-sm py-2.5 border border-alert-300 text-alert-700 disabled:opacity-50"
            >
              ❌ Rejeitar
            </button>
            <button
              onClick={() => changeStatus('approved')}
              disabled={busy !== null || row.status === 'approved'}
              className="btn-primary text-sm py-2.5 disabled:opacity-50"
            >
              {busy === 'approved' ? '…' : '✅ Aprovar'}
            </button>
          </div>
        </div>
      </div>

      {/* Modal: solicitar documentos */}
      {reqOpen && (
        <div className="fixed inset-0 z-[60] bg-steel-900/70 grid place-items-center p-4" onClick={() => setReqOpen(false)}>
          <div onClick={e => e.stopPropagation()} className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4">
            <div>
              <h3 className="text-lg font-bold">📋 Solicitar documentação</h3>
              <p className="text-sm text-steel-500 mt-1">
                O cadastro será marcado como "Em análise" e o usuário receberá esta mensagem.
              </p>
            </div>
            <textarea
              className="input text-sm resize-none"
              rows={5}
              placeholder="Ex.: Por favor envie foto do RG (frente e verso) e comprovante de residência atualizado."
              value={reqText}
              onChange={e => setReqText(e.target.value)}
              autoFocus
            />
            <div className="flex gap-2">
              <button onClick={() => setReqOpen(false)} className="btn-ghost flex-1">Cancelar</button>
              <button
                onClick={requestDocuments}
                disabled={busy !== null || !reqText.trim()}
                className="btn-primary flex-1 disabled:opacity-50"
              >
                {busy === 'req_docs' ? '…' : 'Enviar e marcar em análise'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: rejeitar */}
      {rejOpen && (
        <div className="fixed inset-0 z-[60] bg-steel-900/70 grid place-items-center p-4" onClick={() => setRejOpen(false)}>
          <div onClick={e => e.stopPropagation()} className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4">
            <div>
              <h3 className="text-lg font-bold text-alert-700">❌ Rejeitar cadastro</h3>
              <p className="text-sm text-steel-500 mt-1">
                Informe o motivo. Será registrado no histórico e ficará visível pro usuário.
              </p>
            </div>
            <textarea
              className="input text-sm resize-none"
              rows={4}
              placeholder="Motivo da rejeição…"
              value={rejText}
              onChange={e => setRejText(e.target.value)}
              autoFocus
            />
            <div className="flex gap-2">
              <button onClick={() => setRejOpen(false)} className="btn-ghost flex-1">Cancelar</button>
              <button
                onClick={reject}
                disabled={busy !== null || !rejText.trim()}
                className="btn-ghost border border-alert-500 text-alert-700 flex-1 disabled:opacity-50"
              >
                {busy === 'rejected' ? '…' : 'Rejeitar cadastro'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ──────────────── Helpers ──────────────── */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-[10px] text-steel-400 uppercase tracking-widest font-bold mb-2">{title}</h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="text-sm flex justify-between gap-3">
      <span className="text-steel-500 shrink-0">{label}</span>
      <span className="text-steel-900 font-medium text-right">{children}</span>
    </div>
  );
}
