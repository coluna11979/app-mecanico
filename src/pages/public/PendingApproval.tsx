import { Link, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Logo } from '@/components/Logo';

export default function PendingApproval() {
  const { profile, signOut } = useAuth();
  const nav = useNavigate();
  const rejected = profile?.status === 'rejected';

  // Redireciona automaticamente quando o admin aprovar
  useEffect(() => {
    if (profile?.status === 'approved') {
      if (profile.role === 'mechanic') nav('/mecanico/dashboard', { replace: true });
      else if (profile.role === 'workshop') nav('/oficina/dashboard', { replace: true });
    }
  }, [profile?.status]);

  return (
    <div className="min-h-screen grid place-items-center bg-steel-50 p-6">
      <div className="max-w-md w-full card text-center">
        <div className="flex justify-center mb-4"><Logo /></div>
        <div className={`text-5xl mb-3`}>{rejected ? '✋' : '⏳'}</div>
        <h1 className="text-2xl font-bold">
          {rejected ? 'Cadastro não aprovado' : 'Aguardando aprovação'}
        </h1>
        <p className="text-steel-500 mt-2">
          {rejected
            ? 'Seu cadastro foi recusado. Entre em contato com nosso suporte para entender o motivo.'
            : 'Recebemos seu cadastro. Nossa equipe está validando seus dados — você receberá um aviso assim que for aprovado.'}
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <Link to="/" className="btn-secondary">Voltar ao início</Link>
          <button onClick={async () => { await signOut(); nav('/login', { replace: true }); }} className="btn-ghost">
            Entrar com outra conta
          </button>
          <button onClick={signOut} className="btn-ghost text-steel-400 text-xs">Sair</button>
        </div>
      </div>
    </div>
  );
}
