// "Finalize seu cadastro": abre logo depois que a conta é criada (mecânico e oficina).
// Quem mandava documento só fazia isso nos primeiros minutos depois de se cadastrar;
// pedido por e-mail dias depois não tinha resposta. Aqui o pedido vem na hora.
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Logo } from '@/components/Logo';
import { DocumentChecklist } from '@/components/signup/DocumentChecklist';
import {
  docSlotsFor, docStates, docsSummary, joinLabels, type SignupRole,
} from '@/lib/signupDocuments';
import type { ApprovalMessage, DocType } from '@/types/database';

const MECHANIC_STEPS = 6; // 5 etapas do formulário + esta

export default function SignupDocuments() {
  const { user, profile, loading } = useAuth();
  const nav = useNavigate();
  const [messages, setMessages] = useState<ApprovalMessage[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [nudge, setNudge] = useState<DocType[]>([]);

  // Sem sessão (ex.: abriu o link em outro aparelho): entra e volta para cá.
  // Confere a sessão antes: logo depois do cadastro ela pode existir e o contexto
  // ainda não ter atualizado — aí é só esperar, sem mandar para o login.
  useEffect(() => {
    if (loading || user) return;
    let cancelled = false;
    void supabase.auth.getSession().then(({ data }) => {
      if (!cancelled && !data.session) nav('/login?next=/cadastro/documentos', { replace: true });
    });
    return () => { cancelled = true; };
  }, [loading, user]);

  // Quem não tem documento a enviar por aqui vai para a tela certa
  useEffect(() => {
    if (!profile) return;
    if (profile.role === 'admin') nav('/admin/dashboard', { replace: true });
    else if (profile.status === 'approved') {
      nav(profile.role === 'mechanic' ? '/mecanico/dashboard' : '/oficina/painel', { replace: true });
    } else if (profile.status === 'rejected' || profile.status === 'awaiting_region') {
      nav('/aguardando-aprovacao', { replace: true });
    }
  }, [profile?.role, profile?.status]);

  async function load() {
    if (!user) return;
    const { data } = await supabase
      .from('approval_messages')
      .select('*')
      .eq('profile_id', user.id)
      .order('created_at', { ascending: true });
    setMessages((data as ApprovalMessage[]) ?? []);
    setLoaded(true);
  }
  useEffect(() => { if (user) load(); }, [user?.id]);

  const role: SignupRole = profile?.role === 'workshop' ? 'workshop' : 'mechanic';
  const slots = docSlotsFor(role);
  const states = docStates(slots, messages);
  const summary = docsSummary(slots, states);
  const firstName = (profile?.full_name ?? '').trim().split(/\s+/)[0];
  // O destaque some sozinho de cada documento assim que ele é enviado
  const stillMissing = nudge.filter(t => states[t]?.status !== 'sent');

  function finish() {
    if (summary.complete) { nav('/aguardando-aprovacao', { replace: true }); return; }
    const missing = summary.pending.map(s => s.type);
    setNudge(missing);
    document.getElementById(`doc-${missing[0]}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  const ready = loaded && !!profile;

  return (
    <div className="min-h-screen bg-steel-50 px-4 py-8 sm:py-10">
      <div className="mx-auto max-w-xl">
        <div className="mb-6 flex justify-center sm:justify-start"><Logo /></div>

        <div className="card">
          {role === 'mechanic' && (
            <div className="mb-2 flex gap-1" aria-hidden>
              {Array.from({ length: MECHANIC_STEPS }, (_, i) => (
                <div key={i} className="h-1.5 flex-1 rounded-full bg-brand-500" />
              ))}
            </div>
          )}
          <p className="text-sm text-steel-500">
            {role === 'mechanic' ? `Etapa ${MECHANIC_STEPS} de ${MECHANIC_STEPS} · Documentos` : 'Último passo · Documentos'}
          </p>

          <h1 className="mt-3 text-2xl font-bold">
            {summary.complete ? 'Tudo enviado' : firstName ? `Falta pouco, ${firstName}` : 'Falta pouco'}
          </h1>
          <p className="mt-1 text-sm leading-relaxed text-steel-600">
            {summary.complete
              ? 'Recebemos seus documentos. Agora é com a nossa equipe: vamos analisar e te avisar por e-mail.'
              : 'Sua conta foi criada. Envie os documentos abaixo e seu cadastro já entra em análise.'}
          </p>

          <div className="mt-5">
            {!ready || !user ? (
              <div className="space-y-2.5">
                {[0, 1, 2].map(i => <div key={i} className="h-28 animate-pulse rounded-2xl bg-steel-100" />)}
              </div>
            ) : (
              <DocumentChecklist
                userId={user.id}
                slots={slots}
                states={states}
                onUploaded={load}
                highlight={stillMissing}
              />
            )}
          </div>

          {stillMissing.length > 0 && (
            <p className="mt-3 text-sm font-semibold text-brand-700" role="status">
              Falta enviar {joinLabels(slots.filter(s => stillMissing.includes(s.type)).map(s => s.label))}.
            </p>
          )}

          <button type="button" onClick={finish} disabled={!ready} className="btn-primary btn-lg mt-5 w-full">
            {summary.complete ? 'Concluir cadastro' : `Enviar documentos (${summary.done} de ${summary.total})`}
          </button>

          {!summary.complete && (
            <div className="mt-3 text-center">
              <p className="text-xs text-steel-500">Seu cadastro só entra em análise depois dos documentos.</p>
              <Link
                to="/aguardando-aprovacao"
                replace
                className="mt-1 inline-flex min-h-[44px] items-center px-3 text-sm font-semibold text-steel-600 underline underline-offset-2 hover:text-steel-900"
              >
                Prefiro enviar depois
              </Link>
            </div>
          )}

          <p className="mt-4 text-center text-[11px] text-steel-400">
            🔒 Seus documentos ficam protegidos. Só a equipe de análise vê.
          </p>
        </div>
      </div>
    </div>
  );
}
