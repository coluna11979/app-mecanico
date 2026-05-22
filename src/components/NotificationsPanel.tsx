import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

interface Notification {
  id: string;
  title: string;
  body: string;
  icon: string | null;
  link: string | null;
  read: boolean;
  created_at: string;
}

/** Lista de avisos do usuário. `dark` ajusta cores pro tema do mecânico. */
export function NotificationsPanel({ dark = false }: { dark?: boolean }) {
  const { user } = useAuth();
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { if (user) load(); }, [user]);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user!.id)
      .order('created_at', { ascending: false })
      .limit(50);
    setItems((data as Notification[]) ?? []);
    setLoading(false);
    // Marca todos como lidos ao abrir
    const unreadIds = (data as Notification[] ?? []).filter(n => !n.read).map(n => n.id);
    if (unreadIds.length) {
      await supabase.from('notifications').update({ read: true }).in('id', unreadIds);
    }
  }

  const card    = dark ? 'bg-steel-800 border-steel-700' : 'bg-white border-steel-200';
  const titleC  = dark ? 'text-white' : 'text-steel-900';
  const bodyC   = dark ? 'text-steel-300' : 'text-steel-600';
  const muted   = dark ? 'text-steel-500' : 'text-steel-400';

  function timeAgo(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const min = Math.floor(diff / 60000);
    if (min < 1) return 'agora';
    if (min < 60) return `há ${min} min`;
    const h = Math.floor(min / 60);
    if (h < 24) return `há ${h}h`;
    const d = Math.floor(h / 24);
    return `há ${d}d`;
  }

  if (loading) {
    return <div className={`text-center py-10 ${muted}`}>Carregando avisos…</div>;
  }
  if (items.length === 0) {
    return (
      <div className={`text-center py-16 ${muted}`}>
        <div className="text-4xl mb-2">🔔</div>
        <div className="font-bold">Nenhum aviso ainda</div>
        <div className="text-sm mt-1">Novidades e comunicados aparecem aqui.</div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {items.map(n => {
        const inner = (
          <div className={`rounded-2xl border p-4 flex gap-3 ${card} ${!n.read ? 'ring-1 ring-brand-400/40' : ''}`}>
            <div className="text-2xl shrink-0">{n.icon || '🔔'}</div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <h3 className={`font-bold text-sm leading-tight ${titleC}`}>{n.title}</h3>
                <span className={`text-[10px] shrink-0 ${muted}`}>{timeAgo(n.created_at)}</span>
              </div>
              <p className={`text-sm mt-1 leading-relaxed ${bodyC}`}>{n.body}</p>
              {n.link && (
                <div className="text-xs text-brand-400 font-semibold mt-2">Abrir →</div>
              )}
            </div>
          </div>
        );
        return n.link
          ? <Link key={n.id} to={n.link} className="block">{inner}</Link>
          : <div key={n.id}>{inner}</div>;
      })}
    </div>
  );
}
