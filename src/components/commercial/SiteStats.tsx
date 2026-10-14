import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { fmtBRL } from '@/components/os/osHelpers';

/* ── Site da oficina → resultado no período ─────────────────────────────────────
   Conversas que começaram pelo site (whatsapp_chats.source = 'site') e quantas
   viraram OS: OS do mesmo cliente aberta depois do primeiro contato pelo site. */

type SiteChat = { id: string; customer_id: string | null; source_at: string };
type Os = { id: string; customer_id: string; created_at: string; price: number | null };
type Stats = { contacts: number; registered: number; converted: number; revenue: number };

export default function SiteStats({ workshopId, from, to }: { workshopId: string; from: Date; to: Date }) {
  const [s, setS] = useState<Stats | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.from('whatsapp_chats').select('id, customer_id, source_at')
        .eq('workshop_id', workshopId).eq('source', 'site')
        .gte('source_at', from.toISOString()).lt('source_at', to.toISOString());
      const chats = (data ?? []) as SiteChat[];
      const ids = [...new Set(chats.map(c => c.customer_id).filter(Boolean))] as string[];
      let os: Os[] = [];
      if (ids.length) {
        const oldest = chats.reduce((m, c) => (c.source_at < m ? c.source_at : m), chats[0].source_at);
        const r = await supabase.from('service_orders').select('id, customer_id, created_at, price')
          .in('customer_id', ids).gte('created_at', oldest).neq('status', 'cancelled');
        os = (r.data ?? []) as Os[];
      }
      const counted = new Set<string>();
      let converted = 0, revenue = 0;
      for (const c of chats) {
        const mine = os.filter(o => o.customer_id === c.customer_id && o.created_at >= c.source_at);
        if (mine.length) converted++;
        for (const o of mine) if (!counted.has(o.id)) { counted.add(o.id); revenue += Number(o.price ?? 0); }
      }
      if (alive) setS({ contacts: chats.length, registered: ids.length, converted, revenue });
    })();
    return () => { alive = false; };
  }, [workshopId, from, to]);

  if (!s) return null;
  return (
    <div className="card !py-3 flex flex-wrap items-center gap-x-6 gap-y-2">
      <div className="text-sm font-bold text-steel-800">🌐 Do site <span className="text-xs font-normal text-steel-400">no período</span></div>
      <Stat n={s.contacts} label={s.contacts === 1 ? 'contato' : 'contatos'} />
      <Stat n={s.registered} label="cadastrados" />
      <Stat n={s.converted} label="viraram OS" />
      <div className="flex items-baseline gap-1.5">
        <span className="text-lg font-bold font-display tabular-nums">{fmtBRL(s.revenue)}</span>
        <span className="text-xs text-steel-500">em OS</span>
      </div>
      {s.contacts === 0 && <span className="text-xs text-steel-400">Quem mandar mensagem pelo site da oficina aparece aqui.</span>}
    </div>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-lg font-bold font-display tabular-nums">{n}</span>
      <span className="text-xs text-steel-500">{label}</span>
    </div>
  );
}
