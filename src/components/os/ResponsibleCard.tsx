import { ReactNode, useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { platformJobStatus, splitJobs, type JobTone, type PlatformJob } from '@/lib/platformJob';
import { fmtDateTime } from '@/components/os/osHelpers';
import type { OsStatus } from '@/types/database';

const JOB_COLS = 'id, status, mechanic_id, scheduled_at, created_at, accepted_at, en_route_at, arrived_at, pix_paid_at, started_at, completed_at, workshop_confirmed_at, cancelled_at';

const TONE: Record<JobTone, string> = {
  wait:   'bg-steel-100 text-steel-700',
  move:   'bg-brand-100 text-brand-800',
  action: 'bg-pending-100 text-pending-800',
  done:   'bg-signal-100 text-signal-800',
  off:    'bg-steel-100 text-steel-500',
};

/**
 * Responsável pelo serviço da OS (uso interno da oficina — nada aqui vai para o cliente).
 * Casos: sem responsável · equipe · plataforma com demanda ligada · plataforma sem demanda.
 * Escolher/alterar e chamar a plataforma usam as janelas que já existem (ResponsibleModal / CallMechanicModal);
 * acompanhar, pagar e confirmar continuam na tela de acompanhamento da demanda.
 */
export default function ResponsibleCard({
  os, split, canTrack, canPublish, onDefine, onCallPlatform, onPublish,
}: {
  os: {
    id: string; status: OsStatus; executor?: 'workshop' | 'platform' | null; workshop_mechanic_id: string | null;
    mechanic: { name: string; specialty?: string | null; role_title?: string | null } | null;
    estimated_hours: number | null;
  };
  /** Divisão por serviço (quando cada serviço tem o seu responsável) */
  split?: ReactNode;
  /** Pode abrir a tela de acompanhamento da demanda (/oficina/job) */
  canTrack: boolean;
  /** Pode publicar demanda no MecânicoApp (/oficina/dashboard) */
  canPublish: boolean;
  onDefine: () => void;
  onCallPlatform: () => void;
  onPublish: () => void;
}) {
  const [jobs, setJobs] = useState<PlatformJob[]>([]);
  const [proName, setProName] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from('jobs').select(JOB_COLS).eq('service_order_id', os.id);
    setJobs((data as PlatformJob[]) ?? []);
  }, [os.id]);

  // Abre e ao voltar para a aba (o status da demanda muda fora desta tela)
  useEffect(() => {
    load();
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [load]);

  const { current, history } = splitJobs(jobs);

  // Nome do profissional: mesma consulta da tela de acompanhamento
  useEffect(() => {
    if (!current?.mechanic_id) { setProName(null); return; }
    let alive = true;
    supabase.from('mechanics').select('id, profile:profiles!inner(full_name)').eq('id', current.mechanic_id).maybeSingle()
      .then(({ data }) => {
        if (alive) setProName((data as { profile: { full_name: string | null } | null } | null)?.profile?.full_name ?? null);
      });
    return () => { alive = false; };
  }, [current?.mechanic_id]);

  const active = os.status !== 'completed' && os.status !== 'cancelled';
  const editable = os.status !== 'cancelled';
  const hasTeam = !!os.workshop_mechanic_id && os.executor !== 'platform' && !!os.mechanic;
  const isPlatform = os.executor === 'platform';

  const header = (action?: ReactNode) => (
    <div className="flex items-center justify-between gap-2 mb-2.5">
      <div className="text-[10px] font-bold text-steel-500 uppercase tracking-widest">Responsável pelo serviço</div>
      {action}
    </div>
  );
  const changeLink = editable && (
    <button onClick={onDefine} className="text-xs font-semibold text-brand-600 hover:underline">Alterar responsável</button>
  );

  const jobLine = (j: PlatformJob) => {
    const st = platformJobStatus(j);
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className={`badge ${TONE[st.tone]}`}>{st.label}</span>
        {canTrack && (
          <Link to={`/oficina/job/${j.id}/tracking`} className="ml-auto btn-primary !py-1.5 !px-3 text-xs">Acompanhar</Link>
        )}
      </div>
    );
  };

  const estimate = os.estimated_hours != null && (
    <div className="text-xs text-steel-500 mt-2">⏱ Tempo estimado: {String(os.estimated_hours).replace('.', ',')}h</div>
  );

  const past = history.length > 0 && (
    <details className="mt-2 text-xs text-steel-500">
      <summary className="cursor-pointer hover:text-steel-700">
        {history.length === 1 ? '1 demanda anterior' : `${history.length} demandas anteriores`} no MecânicoApp
      </summary>
      <ul className="mt-1 space-y-0.5 pl-3">
        {history.map(j => (
          <li key={j.id}>{fmtDateTime(j.created_at)} · {platformJobStatus(j).label}</li>
        ))}
      </ul>
    </details>
  );

  /* Cada serviço com o seu responsável: a divisão é o que vale; o responsável geral só leva as peças sem serviço */
  if (split) {
    const general = hasTeam ? os.mechanic!.name
      : isPlatform ? (current ? `🌐 Plataforma${proName ? ` · ${proName}` : ''}` : '🌐 Plataforma (sem demanda vinculada)')
      : 'não definido';
    return (
      <div className="card !p-4">
        {header(changeLink)}
        {split}
        <div className="mt-2.5 pt-2.5 border-t border-steel-100 text-xs text-steel-500 flex justify-between gap-3">
          <span>Responsável geral da OS</span>
          <span className={`font-semibold text-right ${general === 'não definido' ? 'text-pending-700' : 'text-steel-700'}`}>{general}</span>
        </div>
        {current && <div className="mt-2.5">{jobLine(current)}</div>}
        {isPlatform && !current && active && canPublish && (
          <button onClick={onPublish} className="btn-secondary w-full mt-3 !py-2 text-sm">Publicar demanda</button>
        )}
        {estimate}
        {past}
      </div>
    );
  }

  /* Caso 3 — profissional da plataforma com demanda ligada */
  if (current && !hasTeam) {
    return (
      <div className="card !p-4">
        {header(changeLink)}
        <div className="flex items-center gap-3 mb-2.5">
          <div className="h-10 w-10 rounded-full bg-brand-500/10 grid place-items-center shrink-0">🌐</div>
          <div className="min-w-0">
            <div className="font-semibold text-steel-900 truncate">{proName ?? (current.status === 'open' ? 'Aguardando um profissional aceitar' : 'Profissional da plataforma')}</div>
            <div className="text-xs text-steel-500">Profissional da plataforma</div>
          </div>
        </div>
        {jobLine(current)}
        {estimate}
        {past}
      </div>
    );
  }

  /* Caso 2 — profissional da equipe (MecânicoApp não aparece; só se um serviço da OS foi para a plataforma) */
  if (hasTeam) {
    const m = os.mechanic!;
    const sub = [m.role_title, m.specialty].filter(Boolean).join(' · ');
    return (
      <div className="card !p-4">
        {header(changeLink)}
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-brand-500/10 grid place-items-center text-brand-600 font-bold shrink-0">
            {m.name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-steel-900 truncate">{m.name}</div>
            {sub && <div className="text-xs text-steel-500 truncate">{sub}</div>}
          </div>
        </div>
        {current && (
          <div className="mt-3 pt-3 border-t border-steel-100">
            <div className="text-xs text-steel-500 mb-1.5">🌐 Serviço com profissional da plataforma{proName ? ` · ${proName}` : ''}</div>
            {jobLine(current)}
          </div>
        )}
        {estimate}
        {past}
      </div>
    );
  }

  /* Caso 4 — indicado como externo, sem demanda ligada */
  if (isPlatform) {
    return (
      <div className="card !p-4">
        {header(changeLink)}
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-full bg-steel-100 grid place-items-center shrink-0">🌐</div>
          <p className="text-sm text-steel-600">Serviço indicado como externo, mas sem demanda vinculada no MecânicoApp.</p>
        </div>
        {active && canPublish && (
          <button onClick={onPublish} className="btn-secondary w-full mt-3 !py-2 text-sm">Publicar demanda</button>
        )}
        {estimate}
        {past}
      </div>
    );
  }

  /* Caso 1 — sem responsável (não bloqueia nada) */
  return (
    <div className="card !p-4 border-l-4 border-l-pending-500">
      {header()}
      <p className="text-sm text-steel-700">
        {os.status === 'cancelled' ? 'Nenhum responsável definido.' : 'Esta OS ainda está sem responsável.'}
      </p>
      {editable && (
        <div className="flex flex-col sm:flex-row gap-2 mt-3">
          <button onClick={onDefine} className="btn-primary !py-2 text-sm flex-1">Definir responsável</button>
          {active && canPublish && (
            <button onClick={onCallPlatform} className="btn-secondary !py-2 text-sm flex-1">Buscar profissional no MecânicoApp</button>
          )}
        </div>
      )}
      {estimate}
      {past}
    </div>
  );
}
