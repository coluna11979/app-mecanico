import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import WorkshopLayout from '@/components/layout/WorkshopLayout';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { fmtBRL, fmtDur, fmtPhone, workedMinutes } from '@/components/os/osHelpers';
import { ABSENCE_REASONS, TEAM_STATUS, employmentLabel, expiryState, fmtDay, returnStatus, tenure, type Absence } from '@/lib/team';
import AbsenceReport from '@/components/team/AbsenceReport';
import type { MechanicCertification, TeamStatus, WorkshopMechanic } from '@/types/database';

type MonthOs = {
  workshop_mechanic_id: string | null; price: number; labor_cost: number | null;
  started_at: string | null; completed_at: string | null;
  pauses: { started_at: string; ended_at: string | null }[] | null;
};

type Filter = TeamStatus | 'all' | 'absences';

export default function Equipe() {
  const { currentWorkshop } = useAuth();
  const wid = currentWorkshop?.id ?? null;
  const [list, setList]     = useState<WorkshopMechanic[]>([]);
  const [certs, setCerts]   = useState<MechanicCertification[]>([]);
  const [month, setMonth]   = useState<MonthOs[]>([]);
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<Filter>('active');
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!wid) return;
    let alive = true;
    (async () => {
      const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
      const [m, c, o, ab] = await Promise.all([
        supabase.from('workshop_mechanics').select('*').eq('workshop_id', wid).order('name'),
        supabase.from('workshop_mechanic_certifications').select('*').eq('workshop_id', wid),
        supabase.from('service_orders')
          .select('workshop_mechanic_id, price, labor_cost, started_at, completed_at, pauses:service_order_pauses(started_at, ended_at)')
          .eq('workshop_id', wid).eq('status', 'completed').is('quote_status', null)
          .gte('completed_at', monthStart.toISOString()),
        supabase.from('workshop_mechanic_absences').select('*').eq('workshop_id', wid).order('started_on', { ascending: false }).limit(1000),
      ]);
      if (!alive) return;
      setAbsences((ab.data as Absence[]) ?? []);
      const mechs = (m.data as WorkshopMechanic[]) ?? [];
      setList(mechs);
      setCerts((c.data as MechanicCertification[]) ?? []);
      setMonth((o.data as unknown as MonthOs[]) ?? []);
      setLoading(false);
      const paths = mechs.filter(x => x.photo_url).map(x => x.photo_url!);
      if (paths.length) {
        const { data: signed } = await supabase.storage.from('os-attachments').createSignedUrls(paths, 3600);
        const byPath = new Map((signed ?? []).map(s => [s.path, s.signedUrl]));
        if (alive) setPhotos(Object.fromEntries(mechs.filter(x => x.photo_url).map(x => [x.id, byPath.get(x.photo_url!) ?? ''])));
      }
    })();
    return () => { alive = false; };
  }, [wid]);

  const statusOf = (x: WorkshopMechanic): TeamStatus => x.status ?? (x.active ? 'active' : 'terminated');
  const counts = useMemo(() => ({
    all: list.length,
    active: list.filter(x => statusOf(x) === 'active').length,
    away: list.filter(x => statusOf(x) === 'away').length,
    terminated: list.filter(x => statusOf(x) === 'terminated').length,
    absences: absences.filter(a => !a.returned_on).length,
  }), [list, absences]);
  const openAbsence = (id: string) => absences.find(a => a.mechanic_id === id && !a.returned_on) ?? null;
  const shown = list.filter(x => filter === 'all' || statusOf(x) === filter);

  /** Alertas de validade (CNH e certificados) por colaborador */
  function alertsOf(x: WorkshopMechanic) {
    const out: { text: string; expired: boolean }[] = [];
    const cnh = expiryState(x.cnh_expires_at);
    if (cnh && cnh.state !== 'ok') out.push({ text: cnh.state === 'expired' ? 'CNH vencida' : 'CNH vencendo', expired: cnh.state === 'expired' });
    for (const c of certs.filter(c => c.mechanic_id === x.id)) {
      const e = expiryState(c.expires_at);
      if (e && e.state !== 'ok') out.push({ text: `${c.name} ${e.state === 'expired' ? 'vencido' : 'vencendo'}`, expired: e.state === 'expired' });
    }
    return out;
  }

  function monthStats(id: string, pct: number) {
    const os = month.filter(o => o.workshop_mechanic_id === id);
    const labor = os.reduce((a, o) => a + Number(o.labor_cost ?? 0), 0);
    const worked = os.reduce((a, o) => a + (workedMinutes(o.started_at, o.completed_at, o.pauses) ?? 0), 0);
    return { count: os.length, worked, commission: labor * pct / 100 };
  }

  const FILTERS: { key: Filter; label: string }[] = [
    { key: 'active', label: 'Ativos' }, { key: 'away', label: 'Afastados' },
    { key: 'terminated', label: 'Desligados' }, { key: 'all', label: 'Todos' },
    { key: 'absences', label: '📅 Relatório de afastamentos' },
  ];

  return (
    <WorkshopLayout>
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">👷 Equipe</h1>
            <p className="text-sm text-steel-500 mt-1">Cadastro completo dos colaboradores, documentos e desempenho.</p>
          </div>
          <Link to="/oficina/equipe/novo" className="btn-primary">+ Novo colaborador</Link>
        </div>

        <div className="flex flex-wrap gap-2 mb-5">
          {FILTERS.map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={`text-sm font-semibold px-3.5 py-1.5 rounded-full border transition ${
                filter === f.key ? 'bg-steel-900 text-white border-steel-900' : 'bg-white text-steel-600 border-steel-200'}`}>
              {f.label} {f.key !== 'absences' && <span className="opacity-70">({counts[f.key]})</span>}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">{[1, 2, 3].map(i => <div key={i} className="h-44 bg-white rounded-2xl animate-pulse" />)}</div>
        ) : filter === 'absences' ? (
          <AbsenceReport absences={absences} mechanics={list} />
        ) : shown.length === 0 ? (
          <div className="card text-center py-14">
            <div className="text-4xl mb-2">👷</div>
            <h2 className="text-lg font-bold">{list.length === 0 ? 'Cadastre sua equipe' : 'Ninguém nesta lista'}</h2>
            <p className="text-sm text-steel-500 mt-1 max-w-md mx-auto">
              Com a equipe cadastrada você escolhe quem executa cada OS e acompanha horas trabalhadas e comissões em Desempenho e comissões.
            </p>
            {list.length === 0 && <Link to="/oficina/equipe/novo" className="btn-primary mt-5 inline-block">+ Cadastrar primeiro colaborador</Link>}
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {shown.map(x => {
              const st = TEAM_STATUS[statusOf(x)];
              const alerts = alertsOf(x);
              const s = monthStats(x.id, Number(x.commission_percent ?? 0));
              return (
                <Link key={x.id} to={`/oficina/equipe/${x.id}`} className="card hover:shadow-md hover:-translate-y-0.5 transition block">
                  <div className="flex items-center gap-3">
                    {photos[x.id]
                      ? <img src={photos[x.id]} alt="" className="h-14 w-14 rounded-full object-cover shrink-0" />
                      : <div className="h-14 w-14 rounded-full bg-brand-500/10 grid place-items-center text-brand-600 font-bold text-xl shrink-0">{x.name.charAt(0).toUpperCase()}</div>}
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-steel-900 truncate">{x.name}</div>
                      <div className="text-xs text-steel-500 truncate">
                        {[x.role_title, employmentLabel(x.employment_type), x.specialty].filter(Boolean).join(' · ') || 'Função não informada'}
                      </div>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className={`badge text-[10px] ${st.badge}`}>{st.label}</span>
                        {x.hired_at && <span className="text-[10px] text-steel-400">há {tenure(x.hired_at, x.terminated_at)}</span>}
                      </div>
                    </div>
                  </div>
                  {(() => {
                    const ab = openAbsence(x.id);
                    if (!ab) return null;
                    const rs = returnStatus(ab);
                    return (
                      <div className={`text-xs mt-3 rounded-lg px-2.5 py-1.5 ${rs?.late ? 'bg-alert-50 text-alert-700' : 'bg-pending-50 text-pending-800'}`}>
                        {ABSENCE_REASONS[ab.reason].icon} {ABSENCE_REASONS[ab.reason].label} desde {fmtDay(ab.started_on)}
                        {ab.expected_return ? ` · volta ${fmtDay(ab.expected_return)}` : ' · sem previsão'}
                        {rs?.late && <strong> · {rs.text}</strong>}
                      </div>
                    );
                  })()}
                  {x.phone && <div className="text-xs text-steel-500 mt-3">📞 {fmtPhone(x.phone)}</div>}
                  {alerts.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {alerts.map((a, i) => (
                        <span key={i} className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${a.expired ? 'bg-alert-50 text-alert-700' : 'bg-pending-50 text-pending-800'}`}>⚠️ {a.text}</span>
                      ))}
                    </div>
                  )}
                  <div className="mt-3 pt-3 border-t border-steel-100 grid grid-cols-3 text-center">
                    <div><div className="text-sm font-bold">{s.count}</div><div className="text-[10px] text-steel-400">OS no mês</div></div>
                    <div><div className="text-sm font-bold">{s.worked ? fmtDur(s.worked) : '—'}</div><div className="text-[10px] text-steel-400">trabalhadas</div></div>
                    <div><div className="text-sm font-bold">{fmtBRL(s.commission)}</div><div className="text-[10px] text-steel-400">comissão</div></div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </WorkshopLayout>
  );
}
