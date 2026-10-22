import { useCallback, useEffect, useState } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { toast } from '@/components/ui/Toast';
import { supabase } from '@/lib/supabase';

type Row = {
  id: string; name: string; enabled: boolean; workshop_id: string;
  model: string | null; max_tokens: number | null; history_window: number | null; max_tool_turns: number | null;
  workshop: { business_name: string } | null;
};
type Usage = { asks: number; input: number; output: number; errors: number };
type Draft = { model: string; max_tokens: string; history_window: string; max_tool_turns: string };

/** Padrões e tetos — os mesmos da edge function agent-chat */
const LIMITS = {
  max_tokens:     { min: 500, max: 16000, def: 4000, label: 'Máx. tokens da resposta', hint: 'Tamanho máximo de cada resposta. Relatórios grandes (equipe inteira) precisam de mais.' },
  history_window: { min: 2,   max: 60,    def: 20,   label: 'Memória (mensagens)',     hint: 'Quantas mensagens anteriores ele lembra. Mais memória = mais custo por pergunta.' },
  max_tool_turns: { min: 1,   max: 40,    def: 6,    label: 'Máx. voltas de consulta', hint: 'Quantas consultas encadeadas por pergunta. Perguntas amplas ("resumo da semana") precisam de mais.' },
} as const;
type LimitKey = keyof typeof LIMITS;

const toDraft = (r: Row): Draft => ({
  model: r.model ?? '', max_tokens: r.max_tokens?.toString() ?? '',
  history_window: r.history_window?.toString() ?? '', max_tool_turns: r.max_tool_turns?.toString() ?? '',
});
const fmt = (n: number) => n.toLocaleString('pt-BR');

/** Superadmin: modelo e limites de cada agente de IA + uso dos últimos 30 dias. O dono da oficina não vê nem altera isto. */
export default function AdminAgentes() {
  const [rows, setRows] = useState<Row[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [usage, setUsage] = useState<Record<string, Usage>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const [{ data: ag }, { data: log }] = await Promise.all([
      supabase.from('ai_agents')
        .select('id, name, enabled, workshop_id, model, max_tokens, history_window, max_tool_turns, workshop:workshops(business_name)')
        .order('created_at'),
      supabase.from('ai_usage_log').select('workshop_id, input_tokens, output_tokens, ok')
        .eq('feature', 'agent_socio').gte('created_at', since).limit(10000),
    ]);
    const list = (ag ?? []) as unknown as Row[];
    setRows(list);
    setDrafts(Object.fromEntries(list.map(r => [r.id, toDraft(r)])));
    const u: Record<string, Usage> = {};
    for (const l of (log ?? []) as { workshop_id: string; input_tokens: number | null; output_tokens: number | null; ok: boolean }[]) {
      const e = u[l.workshop_id] ?? { asks: 0, input: 0, output: 0, errors: 0 };
      e.asks += 1; e.input += l.input_tokens ?? 0; e.output += l.output_tokens ?? 0; if (!l.ok) e.errors += 1;
      u[l.workshop_id] = e;
    }
    setUsage(u);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const set = (id: string, patch: Partial<Draft>) => setDrafts(d => ({ ...d, [id]: { ...d[id], ...patch } }));

  async function save(r: Row) {
    const d = drafts[r.id];
    const out: Record<string, number | string | null> = { model: d.model.trim() || null };
    for (const k of Object.keys(LIMITS) as LimitKey[]) {
      const raw = d[k].trim();
      if (!raw) { out[k] = null; continue; }
      const n = Number(raw);
      const { min, max, label } = LIMITS[k];
      if (!Number.isInteger(n) || n < min || n > max) return toast.error(`${label}: use um número entre ${fmt(min)} e ${fmt(max)}, ou deixe vazio para o padrão`);
      out[k] = n;
    }
    setSavingId(r.id);
    const { error } = await supabase.from('ai_agents').update(out).eq('id', r.id);
    setSavingId(null);
    if (error) return toast.error(error.message);
    setRows(rs => rs.map(x => x.id === r.id ? { ...x, ...(out as Partial<Row>) } : x));
    toast.success('Agente atualizado ✓');
  }

  return (
    <AdminLayout>
      <div className="max-w-3xl space-y-5">
        <div>
          <h1 className="text-2xl font-bold">🤖 Agentes de IA</h1>
          <p className="text-sm text-steel-500 mt-1">
            Modelo e limites de cada agente. Campo vazio = padrão da plataforma. O dono da oficina não vê nem altera isto.
          </p>
        </div>

        {loading ? <div className="card text-sm text-steel-500">Carregando…</div>
          : rows.length === 0 ? <div className="card text-sm text-steel-500">Nenhuma oficina criou um agente ainda.</div>
          : rows.map(r => {
            const d = drafts[r.id];
            const u = usage[r.workshop_id];
            const dirty = JSON.stringify(d) !== JSON.stringify(toDraft(r));
            return (
              <div key={r.id} className="card space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="font-semibold">{r.workshop?.business_name ?? 'Oficina'}</div>
                  <span className="text-sm text-steel-500">· {r.name}</span>
                  {!r.enabled && <span className="text-xs rounded-full bg-steel-100 dark:bg-steel-700 px-2 py-0.5">desligado</span>}
                </div>

                <div className="text-sm rounded-xl bg-steel-50 dark:bg-steel-900 px-4 py-3">
                  <span className="font-medium">Últimos 30 dias:</span>{' '}
                  {u ? <>{fmt(u.asks)} {u.asks === 1 ? 'pergunta' : 'perguntas'} · {fmt(u.input)} tokens de entrada · {fmt(u.output)} de saída
                    {u.errors > 0 && <span className="text-alert-600"> · {u.errors} com erro</span>}</>
                    : 'sem uso'}
                </div>

                <div>
                  <label className="label">Modelo</label>
                  <input className="input" placeholder="Vazio = modelo padrão da plataforma (Configurações → Inteligência Artificial)"
                    value={d.model} onChange={e => set(r.id, { model: e.target.value })} />
                </div>

                <div className="grid sm:grid-cols-3 gap-3">
                  {(Object.keys(LIMITS) as LimitKey[]).map(k => (
                    <div key={k}>
                      <label className="label">{LIMITS[k].label}</label>
                      <input className="input" inputMode="numeric" placeholder={`padrão ${fmt(LIMITS[k].def)}`}
                        value={d[k]} onChange={e => set(r.id, { [k]: e.target.value.replace(/\D/g, '') })} />
                      <p className="text-xs text-steel-500 mt-1">{LIMITS[k].hint} Até {fmt(LIMITS[k].max)}.</p>
                    </div>
                  ))}
                </div>

                <div className="flex justify-end gap-2">
                  <button className="btn-ghost" disabled={!dirty} onClick={() => set(r.id, toDraft(r))}>Desfazer</button>
                  <button className="btn-primary" disabled={!dirty || savingId === r.id} onClick={() => save(r)}>
                    {savingId === r.id ? 'Salvando…' : 'Salvar'}
                  </button>
                </div>
              </div>
            );
          })}
      </div>
    </AdminLayout>
  );
}
