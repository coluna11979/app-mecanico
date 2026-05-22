import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import MechanicLayout from '@/components/layout/MechanicLayout';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { mechanicNet } from '@/lib/payment';
import { formatScheduled } from '@/lib/scheduling';
import type { Job, Workshop } from '@/types/database';

type AgendaJob = Job & { workshop: Pick<Workshop, 'business_name' | 'city' | 'state'> | null };

export default function MechanicAgenda() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [jobs, setJobs] = useState<AgendaJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [departing, setDeparting] = useState<string | null>(null);

  useEffect(() => { if (user) load(); }, [user]);

  async function load() {
    setLoading(true);
    const { data: m } = await supabase.from('mechanics').select('id').eq('profile_id', user!.id).maybeSingle();
    if (m?.id) {
      // Agendados aceitos mas ainda não iniciados (en_route_at null)
      const { data } = await supabase
        .from('jobs')
        .select('*, workshop:workshops(business_name, city, state)')
        .eq('mechanic_id', m.id)
        .eq('status', 'assigned')
        .is('en_route_at', null)
        .order('scheduled_at', { ascending: true });
      setJobs((data as AgendaJob[]) ?? []);
    }
    setLoading(false);
  }

  /* Realtime — agenda some quando o job muda (saiu a caminho, cancelou) */
  useEffect(() => {
    const ch = supabase.channel('mecanico:agenda')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'jobs' }, () => {
        if (user) load();
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function startDeparture(job: AgendaJob) {
    setDeparting(job.id);
    await supabase.from('jobs')
      .update({ en_route_at: new Date().toISOString() })
      .eq('id', job.id);
    setDeparting(null);
    nav(`/mecanico/job/${job.id}/tracking`);
  }

  /* Agrupa por dia (Hoje / Amanhã / data) */
  function dayLabel(iso: string | null): string {
    if (!iso) return 'Sem data';
    const d = new Date(iso);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const target = new Date(d); target.setHours(0, 0, 0, 0);
    const diff = Math.round((target.getTime() - today.getTime()) / (24 * 3600 * 1000));
    if (diff === 0) return 'Hoje';
    if (diff === 1) return 'Amanhã';
    return d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
  }

  const grouped = jobs.reduce((acc, j) => {
    const key = dayLabel(j.scheduled_at);
    (acc[key] = acc[key] || []).push(j);
    return acc;
  }, {} as Record<string, AgendaJob[]>);

  return (
    <MechanicLayout>
      <div className="p-4 space-y-5">
        <div>
          <h1 className="text-2xl font-bold text-white">Agenda</h1>
          <p className="text-sm text-steel-400 mt-1">
            Seus serviços agendados. Quando for sair, toque em "Estou indo".
          </p>
        </div>

        {loading ? (
          <div className="space-y-2">
            {[1, 2].map(i => <div key={i} className="rounded-2xl bg-steel-800 h-24 animate-pulse" />)}
          </div>
        ) : jobs.length === 0 ? (
          <div className="card !bg-steel-800 text-center py-12">
            <div className="text-4xl mb-2">📅</div>
            <div className="font-bold text-white">Nenhum agendamento</div>
            <div className="text-sm text-steel-400 mt-1">
              Jobs marcados pra uma data futura aparecem aqui depois que você aceita.
            </div>
          </div>
        ) : (
          Object.entries(grouped).map(([day, dayJobs]) => (
            <div key={day}>
              <h2 className="text-xs font-bold text-steel-400 uppercase tracking-widest mb-2 capitalize">{day}</h2>
              <div className="space-y-2">
                {dayJobs.map(j => {
                  const net = mechanicNet((j.price_per_hour ?? 0) * (j.max_hours ?? 1));
                  return (
                    <div key={j.id} className="card !bg-steel-800 border border-pending-500/30">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 text-pending-300 text-sm font-bold">
                            <span>🕐</span>
                            <span>{j.scheduled_at ? formatScheduled(j.scheduled_at) : 'Sem horário'}</span>
                          </div>
                          <div className="font-bold text-white mt-1 truncate">{j.title}</div>
                          {j.workshop && (
                            <div className="text-xs text-steel-400 mt-0.5">
                              🏭 {j.workshop.business_name} · {j.workshop.city}
                            </div>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-signal-400 font-bold font-display text-xl">R$ {net.toFixed(0)}</div>
                          <div className="text-[10px] text-steel-500 uppercase tracking-wider">no seu PIX</div>
                        </div>
                      </div>
                      <div className="flex gap-2 mt-3">
                        <button
                          onClick={() => nav(`/mecanico/job/${j.id}`)}
                          className="btn-ghost flex-1 text-sm !border-steel-700"
                        >
                          Ver detalhes
                        </button>
                        <button
                          onClick={() => startDeparture(j)}
                          disabled={departing === j.id}
                          className="btn-primary flex-1 text-sm disabled:opacity-50"
                        >
                          {departing === j.id ? 'Saindo…' : '🚗 Estou indo'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </MechanicLayout>
  );
}
