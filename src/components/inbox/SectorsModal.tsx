import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from '@/components/ui/Toast';
import { ROLES, ROLE_ORDER, type OperatorRole } from '@/lib/operators';
import { DEFAULT_SECTORS, type Sector, type SectorKind } from '@/lib/inbox';

/* ── Setores do Inbox: quem atende o quê (configuração do gestor) ───────────── */

const KINDS: { key: SectorKind; label: string }[] = [
  { key: 'atendimento', label: 'Atendimento (recebe contato novo)' },
  { key: 'comercial', label: 'Comercial (orçamentos e interessados)' },
  { key: 'financeiro', label: 'Financeiro (cobranças)' },
  { key: 'outro', label: 'Outro' },
];
const ICONS = ['🧑‍💼', '🤝', '💰', '🔧', '📅', '🛞', '🚗', '📦', '⭐', '💬'];
/** Funções que podem receber um setor (o Gestor vê todos) */
const ROLE_OPTS = ROLE_ORDER.filter(r => r !== 'gestor') as OperatorRole[];

export default function SectorsModal({ workshopId, sectors, reload, onClose }: {
  workshopId: string; sectors: Sector[]; reload: () => void; onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);

  async function activateDefaults() {
    setBusy(true);
    const { data, error } = await supabase.from('whatsapp_sectors')
      .insert(DEFAULT_SECTORS.map(s => ({ ...s, workshop_id: workshopId }))).select('id, is_default');
    if (!error) {
      // Conversas que já existem vão para o setor padrão
      const def = (data ?? []).find(s => s.is_default);
      if (def) await supabase.from('whatsapp_chats').update({ sector_id: def.id }).eq('workshop_id', workshopId).is('sector_id', null);
    }
    setBusy(false);
    if (error) { toast.error('Não salvou: ' + error.message); return; }
    toast.success('Setores ativados ✓');
    reload();
  }

  async function patch(s: Sector, p: Partial<Sector>) {
    // Só um padrão por oficina: tira o anterior antes
    if (p.is_default) await supabase.from('whatsapp_sectors').update({ is_default: false }).eq('workshop_id', workshopId).eq('is_default', true);
    const { error } = await supabase.from('whatsapp_sectors').update(p).eq('id', s.id);
    if (error) toast.error('Não salvou: ' + error.message);
    reload();
  }

  async function add() {
    const name = prompt('Nome do setor (ex.: Pneus, Agendamento)')?.trim();
    if (!name) return;
    const { error } = await supabase.from('whatsapp_sectors').insert({
      workshop_id: workshopId, name, icon: '💬', kind: 'outro', roles: [], position: sectors.length,
    });
    if (error) { toast.error('Não salvou: ' + error.message); return; }
    reload();
  }

  async function remove(s: Sector) {
    if (!confirm(`Apagar o setor “${s.name}”? As conversas dele ficam sem setor (o gestor continua vendo).`)) return;
    const { error } = await supabase.from('whatsapp_sectors').delete().eq('id', s.id);
    if (error) { toast.error('Não apagou: ' + error.message); return; }
    reload();
  }

  async function turnOff() {
    if (!confirm('Desligar os setores? As conversas voltam a aparecer todas juntas para quem tem acesso ao WhatsApp.')) return;
    await supabase.from('whatsapp_sectors').update({ active: false }).eq('workshop_id', workshopId);
    reload();
  }

  const anyActive = sectors.some(s => s.active);

  return (
    <div className="fixed inset-0 z-50 bg-steel-900/60 grid place-items-center p-4" onClick={onClose}>
      <div className="card max-w-2xl w-full max-h-[88vh] flex flex-col !p-0" onClick={e => e.stopPropagation()}>
        <div className="px-5 pt-4 pb-3 border-b border-steel-100 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold">⚙️ Setores do WhatsApp</h2>
            <p className="text-xs text-steel-500">Cada conversa fica num setor; cada função do balcão vê só os setores dela. O Gestor vê todos.</p>
          </div>
          <button type="button" onClick={onClose} className="text-steel-400 hover:text-steel-700 text-xl">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {sectors.length === 0 ? (
            <div className="text-center py-6">
              <div className="text-4xl mb-2">🗂️</div>
              <p className="font-semibold text-steel-800">Separar as conversas por setor</p>
              <p className="text-sm text-steel-500 mt-1 max-w-md mx-auto">
                Ex.: o balcão atende quem chama, o vendedor cuida dos orçamentos e o caixa das cobranças.
                Quem não usa setores continua com o Inbox como está.
              </p>
              <button type="button" className="btn-primary mt-4" disabled={busy} onClick={activateDefaults}>
                {busy ? 'Ativando…' : 'Ativar setores (Atendimento, Comercial, Financeiro)'}
              </button>
            </div>
          ) : sectors.map(s => (
            <div key={s.id} className={`rounded-2xl border p-3 space-y-2.5 ${s.active ? 'border-steel-200' : 'border-steel-100 opacity-60'}`}>
              <div className="flex items-center gap-2">
                <select className="input !w-auto !py-1.5 !px-2 text-lg" value={s.icon} onChange={e => patch(s, { icon: e.target.value })}>
                  {[...new Set([s.icon, ...ICONS])].map(i => <option key={i} value={i}>{i}</option>)}
                </select>
                <input className="input !py-1.5 text-sm font-semibold flex-1" defaultValue={s.name}
                  onBlur={e => { const v = e.target.value.trim(); if (v && v !== s.name) patch(s, { name: v }); }} />
                <label className="flex items-center gap-1.5 text-xs font-semibold text-steel-600 shrink-0">
                  <input type="checkbox" checked={s.active} onChange={e => patch(s, { active: e.target.checked })} /> Ativo
                </label>
                <button type="button" onClick={() => remove(s)} className="text-steel-400 hover:text-alert-600 text-sm shrink-0" title="Apagar">🗑️</button>
              </div>
              <div className="grid sm:grid-cols-2 gap-2">
                <select className="input !py-1.5 text-xs" value={s.kind} onChange={e => patch(s, { kind: e.target.value as SectorKind })}>
                  {KINDS.map(k => <option key={k.key} value={k.key}>{k.label}</option>)}
                </select>
                <label className={`flex items-center gap-2 text-xs font-semibold rounded-xl border px-3 ${s.is_default ? 'border-brand-300 bg-brand-50 text-brand-700' : 'border-steel-200 text-steel-600'}`}>
                  <input type="radio" name="default-sector" checked={s.is_default} onChange={() => patch(s, { is_default: true })} />
                  Contato novo cai aqui
                </label>
              </div>
              <div>
                <p className="text-[11px] font-semibold text-steel-500 mb-1">Quem vê no modo balcão {s.roles.length === 0 && <span className="font-normal">(todas as funções)</span>}</p>
                <div className="flex flex-wrap gap-1">
                  {ROLE_OPTS.map(r => {
                    const on = s.roles.includes(r);
                    return (
                      <button key={r} type="button"
                        onClick={() => patch(s, { roles: on ? s.roles.filter(x => x !== r) : [...s.roles, r] })}
                        className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${on ? 'bg-steel-900 text-white border-steel-900' : 'border-steel-200 text-steel-500 hover:bg-steel-50'}`}>
                        {ROLES[r].icon} {ROLES[r].label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>

        {sectors.length > 0 && (
          <div className="px-5 py-3 border-t border-steel-100 flex items-center justify-between gap-2">
            {anyActive
              ? <button type="button" onClick={turnOff} className="text-xs font-semibold text-steel-400 hover:text-alert-600">Desligar setores</button>
              : <span className="text-xs text-steel-400">Setores desligados</span>}
            <button type="button" onClick={add} className="btn-secondary text-sm">+ Novo setor</button>
          </div>
        )}
      </div>
    </div>
  );
}
