import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from '@/components/ui/Toast';
import { supabase } from '@/lib/supabase';
import AgentHeader from '@/components/agents/AgentHeader';
import { CS_DEFAULTS, type CsAgent, type CsSettings } from '@/lib/agents';

const COLS = 'id, workshop_id, name, enabled, settings';
const STATUS: Record<string, string> = { pending: '⏳ Na fila', sending: '📤 Enviando', sent: '✅ Enviada', skipped: '⏭️ Não enviada', failed: '⚠️ Falhou' };
const KIND: Record<string, string> = { welcome: 'Boas-vindas', post_service: 'Pós-serviço' };
const WHY: Record<string, string> = {
  agente_desligado: 'agente desligado', os_ja_encerrada: 'OS já encerrada', os_reaberta_ou_cancelada: 'OS reaberta ou cancelada',
  cliente_sem_telefone_ou_sem_contato: 'sem telefone ou pediu para não receber', perdeu_o_momento: 'passou da hora (boas-vindas só no mesmo dia)',
  whatsapp_desconectado: 'WhatsApp da oficina desconectado', telefone_invalido: 'telefone inválido', os_nao_encontrada: 'OS não encontrada',
};
type Row = { id: string; kind: string; status: string; send_at: string; detail: string | null; service_order: { number: number | null } | null; customer: { full_name: string } | null };

/** Agente de CS: boas-vindas ao abrir a OS e mensagem pós-serviço com o link de avaliação do Google, pelo WhatsApp da oficina */
export default function CsCard({ workshopId }: { workshopId: string }) {
  const [agent, setAgent] = useState<CsAgent | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [s, setS] = useState<CsSettings>({});
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [hasLink, setHasLink] = useState<boolean | null>(null);
  const [connected, setConnected] = useState<boolean | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [a, w, i, r] = await Promise.all([
      supabase.from('ai_agents').select(COLS).eq('workshop_id', workshopId).eq('template', 'cs').maybeSingle(),
      supabase.from('workshops').select('google_review_url').eq('id', workshopId).maybeSingle(),
      supabase.from('whatsapp_instances').select('status').eq('workshop_id', workshopId).maybeSingle(),
      supabase.from('cs_messages').select('id, kind, status, send_at, detail, service_order:service_orders(number), customer:customers(full_name)')
        .eq('workshop_id', workshopId).order('created_at', { ascending: false }).limit(12),
    ]);
    const ag = a.data as CsAgent | null;
    setAgent(ag); setS(ag?.settings ?? {});
    setHasLink(!!(w.data as { google_review_url: string | null } | null)?.google_review_url?.trim());
    setConnected((i.data as { status: string } | null)?.status === 'connected');
    setRows((r.data ?? []) as unknown as Row[]);
    setLoading(false);
  }, [workshopId]);
  useEffect(() => { load(); }, [load]);

  async function create() {
    const { data, error } = await supabase.from('ai_agents').insert({
      workshop_id: workshopId, template: 'cs', name: 'Atendimento pós-venda (CS)', tools: [], enabled: false,
      system_prompt: 'Agente de CS: envia mensagens prontas (boas-vindas, pós-serviço) pelo WhatsApp da oficina. Os textos ficam em Configurar.',
      settings: { welcome: true, post: true, post_delay_hours: 12 },
    }).select(COLS).single();
    if (error) return toast.error(error.message);
    setAgent(data as CsAgent); setS((data as CsAgent).settings);
    toast.success('Agente de CS criado. Confira os textos e ligue quando quiser ✓');
  }

  async function patch(p: Partial<Pick<CsAgent, 'enabled' | 'settings'>>) {
    if (!agent) return false;
    const { error } = await supabase.from('ai_agents').update(p).eq('id', agent.id);
    if (error) { toast.error(error.message); return false; }
    setAgent({ ...agent, ...p });
    return true;
  }

  async function toggle() {
    if (!agent) return;
    if (!agent.enabled && !window.confirm('Ligar o agente de CS? A partir de agora, cada OS aberta recebe boas-vindas e cada OS concluída recebe a mensagem de pós-serviço, sozinho, pelo WhatsApp da oficina (só em horário comercial).')) return;
    if (await patch({ enabled: !agent.enabled })) toast.success(agent.enabled ? 'Agente de CS desligado' : 'Agente de CS ligado ✓');
  }

  async function save() {
    setSaving(true);
    const clean: CsSettings = {
      welcome: s.welcome !== false, post: s.post !== false,
      post_delay_hours: Math.max(0, Math.min(72, Number(s.post_delay_hours ?? 12) || 0)),
      welcome_text: s.welcome_text?.trim() || undefined, post_text: s.post_text?.trim() || undefined, oil_text: s.oil_text?.trim() || undefined,
    };
    const ok = await patch({ settings: clean });
    setSaving(false);
    if (ok) { setOpen(false); toast.success('Agente de CS atualizado ✓'); }
  }

  if (loading) return <div className="card text-sm text-steel-500">Carregando…</div>;

  if (!agent) {
    return (
      <div className="card p-4 flex items-start gap-3">
        <div className="h-12 w-12 rounded-2xl bg-brand-50 grid place-items-center text-2xl shrink-0" aria-hidden>💬</div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-[15px] text-steel-900">Atendimento pós-venda (CS)</h3>
          <p className="text-xs text-steel-500 mt-1 leading-snug">Manda boas-vindas pelo WhatsApp quando a OS é aberta e, 12 horas depois de concluir, um agradecimento com o link de avaliação do Google. Na troca de óleo, avisa que vamos lembrar da próxima.</p>
          <button className="btn-primary mt-3 w-full sm:w-auto min-h-[44px]" onClick={create}>Criar agente de CS</button>
        </div>
      </div>
    );
  }

  const fmt = (d: string) => new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  return (
    <div className="space-y-3">
      <AgentHeader icon="💬" name={agent.name} tag="Envia sozinho pelo WhatsApp"
        desc="Boas-vindas ao abrir a OS e, depois de concluir, agradecimento com o link de avaliação do Google."
        meta={<span>{agent.enabled ? '🟢 Enviando em horário comercial' : 'Desligado: nenhuma mensagem sai'}</span>}
        enabled={agent.enabled} onToggle={toggle}
        actions={[{ key: 'config', icon: '⚙️', label: 'Configurar textos', onClick: () => setOpen(v => !v), active: open }]} />

      {connected === false && <div className="rounded-xl bg-amber-50 text-amber-800 text-xs p-3">⚠️ O WhatsApp da oficina não está conectado: as mensagens ficam na fila até conectar (descartadas depois de 24 h). Conecte em WhatsApp dos clientes.</div>}
      {hasLink === false && <div className="rounded-xl bg-amber-50 text-amber-800 text-xs p-3">⚠️ Falta o link de avaliação do Google: sem ele, o pós-serviço vai sem o pedido de avaliação. Cadastre em <Link className="underline" to="/oficina/avaliacoes">Avaliações Google</Link>.</div>}

      {open && (
        <div className="card space-y-4">
          <div>
            <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
              <input type="checkbox" checked={s.welcome !== false} onChange={e => setS({ ...s, welcome: e.target.checked })} /> Boas-vindas ao abrir a OS
            </label>
            <textarea className="input min-h-[96px] mt-2" value={s.welcome_text ?? CS_DEFAULTS.welcome_text} onChange={e => setS({ ...s, welcome_text: e.target.value })} />
          </div>
          <div>
            <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
              <input type="checkbox" checked={s.post !== false} onChange={e => setS({ ...s, post: e.target.checked })} /> Pós-serviço depois de concluir a OS
            </label>
            <div className="flex items-center gap-2 text-sm mt-2">Enviar
              <input type="number" min={0} max={72} className="input w-20" value={s.post_delay_hours ?? 12} onChange={e => setS({ ...s, post_delay_hours: Number(e.target.value) })} />
              horas depois de concluir
            </div>
            <textarea className="input min-h-[120px] mt-2" value={s.post_text ?? CS_DEFAULTS.post_text} onChange={e => setS({ ...s, post_text: e.target.value })} />
            <div className="text-xs text-steel-500 mt-2">Quando a OS tem troca de óleo, acrescenta:</div>
            <textarea className="input min-h-[64px] mt-1" value={s.oil_text ?? CS_DEFAULTS.oil_text} onChange={e => setS({ ...s, oil_text: e.target.value })} />
          </div>
          <p className="text-xs text-steel-500">Variáveis: <code>{'{nome}'}</code> (primeiro nome) · <code>{'{carro}'}</code> · <code>{'{os}'}</code> · <code>{'{oficina}'}</code> · <code>{'{link_avaliacao}'}</code>. Só envia de segunda a sábado, das 8h às 20h; não envia para quem está marcado para não receber contato, nem para notas antigas importadas ou vendas de balcão.</p>
          <div className="flex gap-2">
            <button className="btn-primary" onClick={save} disabled={saving}>{saving ? 'Salvando…' : 'Salvar'}</button>
            <button className="btn-ghost" onClick={() => setS({ ...s, welcome_text: undefined, post_text: undefined, oil_text: undefined })}>Restaurar textos</button>
          </div>
        </div>
      )}

      {rows.length > 0 && (
        <div className="card">
          <div className="text-xs font-semibold text-steel-500 uppercase tracking-wide mb-1">Últimas mensagens</div>
          <ul className="divide-y divide-steel-100 text-sm">
            {rows.map(r => (
              <li key={r.id} className="py-1.5 flex flex-wrap items-baseline gap-x-2">
                <span className="font-medium">{r.customer?.full_name ?? 'Cliente'}</span>
                <span className="text-steel-500">OS {r.service_order?.number ?? '—'} · {KIND[r.kind] ?? r.kind}</span>
                <span className="ml-auto text-xs">{STATUS[r.status] ?? r.status} · {fmt(r.send_at)}</span>
                {r.detail && <span className="basis-full text-xs text-steel-400">{WHY[r.detail] ?? r.detail}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
