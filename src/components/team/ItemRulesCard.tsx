import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from '@/components/ui/Toast';
import { fmtBRL, moneyInput, parseMoney } from '@/components/os/osHelpers';
import { loadItemRules, type ItemRule } from '@/lib/commissionRules';

/**
 * Fechar comissões → "Regras por item": itens que não dão comissão (ex.: alinhamento, pneu)
 * e exceções em valor fixo para quem fez (ex.: Rafael R$ 5 por alinhamento; R$ 10 a cada 2 cambagens).
 * O item é reconhecido pela palavra no nome dele na OS / nota (sem diferenciar acento ou maiúscula).
 */
export default function ItemRulesCard({ wid }: { wid: string }) {
  const [rules, setRules] = useState<ItemRule[] | null>(null);
  const [team, setTeam]   = useState<{ id: string; name: string }[]>([]);
  const [form, setForm]   = useState({ keyword: '', mechanic: '', amount: '', per: '1' });
  const [busy, setBusy]   = useState(false);
  const [open, setOpen]   = useState(false);

  const load = useCallback(async () => {
    const [r, m] = await Promise.all([
      loadItemRules(wid),
      supabase.from('workshop_mechanics').select('id, name').eq('workshop_id', wid).neq('status', 'terminated').order('name'),
    ]);
    setRules(r);
    setTeam((m.data as { id: string; name: string }[]) ?? []);
  }, [wid]);
  useEffect(() => { load(); }, [load]);

  const name = (id: string | null) => (id ? team.find(t => t.id === id)?.name ?? 'Colaborador removido' : 'Todos');
  const byKeyword = useMemo(() => {
    const m = new Map<string, ItemRule[]>();
    for (const r of rules ?? []) m.set(r.keyword.toLowerCase(), [...(m.get(r.keyword.toLowerCase()) ?? []), r]);
    return [...m.entries()];
  }, [rules]);

  async function add() {
    const keyword = form.keyword.trim();
    const amount = form.amount.trim() ? parseMoney(form.amount) : 0;
    const per = Math.max(1, parseInt(form.per, 10) || 1);
    if (keyword.length < 3) return toast.error('Escreva a palavra do item (ex.: alinhamento)');
    if (form.mechanic && !(amount > 0)) return toast.error('Informe o valor fixo para essa pessoa');
    setBusy(true);
    const rows = [];
    // Toda regra tira o item da conta de todos; a de "Todos" já basta para isso
    const hasAll = (rules ?? []).some(r => r.keyword.toLowerCase() === keyword.toLowerCase() && !r.mechanic_id);
    if (!hasAll) rows.push({ workshop_id: wid, keyword, mechanic_id: null, amount: 0, per_units: 1 });
    if (form.mechanic) rows.push({ workshop_id: wid, keyword, mechanic_id: form.mechanic, amount, per_units: per });
    const { error } = rows.length ? await supabase.from('commission_item_rules').insert(rows) : { error: null };
    setBusy(false);
    if (error) return toast.error('Não foi possível salvar: ' + error.message);
    toast.success('Regra salva ✓');
    setForm({ keyword: '', mechanic: '', amount: '', per: '1' });
    load();
  }

  async function remove(r: ItemRule) {
    const all = !r.mechanic_id;
    if (!confirm(all
      ? `Tirar a regra de “${r.keyword}”? O item volta a dar comissão normal (e as exceções dele também saem).`
      : `Tirar o valor fixo de ${name(r.mechanic_id)} em “${r.keyword}”?`)) return;
    const q = supabase.from('commission_item_rules').delete().eq('workshop_id', wid);
    const { error } = all ? await q.ilike('keyword', r.keyword) : await q.eq('id', r.id);
    if (error) return toast.error('Não foi possível remover: ' + error.message);
    load();
  }

  return (
    <div className="card">
      <button type="button" onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between gap-3 text-left">
        <div>
          <div className="font-bold text-steel-900">⚙️ Regras por item</div>
          <div className="text-xs text-steel-500">Itens que não dão comissão e exceções em valor fixo (ex.: alinhamento, pneu, cambagem).</div>
        </div>
        <span className="text-xs font-semibold text-brand-600 shrink-0">{open ? 'Fechar' : `Ver (${byKeyword.length})`}</span>
      </button>

      {open && (
        <div className="mt-4 space-y-4">
          {rules === null ? <div className="h-16 bg-steel-50 rounded-xl animate-pulse" /> : byKeyword.length === 0 ? (
            <p className="text-sm text-steel-400">Nenhuma regra: todos os itens seguem 4% serviço + peças e 10% mão de obra.</p>
          ) : (
            <ul className="divide-y divide-steel-100 border border-steel-100 rounded-xl overflow-hidden">
              {byKeyword.map(([k, list]) => {
                const base = list.find(r => !r.mechanic_id) ?? list[0];
                const fixedOnes = list.filter(r => r.mechanic_id && r.amount > 0);
                return (
                  <li key={k} className="px-3 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm"><strong>“{base.keyword}”</strong> <span className="text-steel-500">— não dá comissão para ninguém</span></div>
                      <button onClick={() => remove(base)} className="text-xs text-steel-400 hover:text-alert-600">remover</button>
                    </div>
                    {fixedOnes.map(r => (
                      <div key={r.id} className="flex items-center justify-between gap-2 text-xs text-steel-600 mt-1 pl-3">
                        <span>↳ exceto <strong>{name(r.mechanic_id)}</strong>: {fmtBRL(r.amount)}{r.per_units > 1 ? ` a cada ${r.per_units}` : ' por unidade'}</span>
                        <button onClick={() => remove(r)} className="text-steel-400 hover:text-alert-600">remover</button>
                      </div>
                    ))}
                  </li>
                );
              })}
            </ul>
          )}

          <div className="rounded-xl bg-steel-50 p-3 space-y-2">
            <div className="text-xs font-semibold text-steel-700">+ Nova regra</div>
            <div className="grid sm:grid-cols-2 gap-2">
              <label className="text-[11px] text-steel-500">Palavra no nome do item *
                <input className="input !py-2 text-sm mt-0.5" placeholder="Ex.: alinhamento" value={form.keyword}
                  onChange={e => setForm(f => ({ ...f, keyword: e.target.value }))} />
              </label>
              <label className="text-[11px] text-steel-500">Quem ganha valor fixo (opcional)
                <select className="input !py-2 text-sm mt-0.5" value={form.mechanic} onChange={e => setForm(f => ({ ...f, mechanic: e.target.value }))}>
                  <option value="">Ninguém — só tira da comissão</option>
                  {team.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </label>
            </div>
            {form.mechanic && (
              <div className="grid grid-cols-2 gap-2">
                <label className="text-[11px] text-steel-500">Valor fixo (R$) *
                  <input className="input !py-2 text-sm mt-0.5 text-right" inputMode="decimal" placeholder="0,00" value={form.amount}
                    onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                    onBlur={e => { const v = parseMoney(e.target.value); if (Number.isFinite(v)) setForm(f => ({ ...f, amount: moneyInput(v) })); }} />
                </label>
                <label className="text-[11px] text-steel-500">A cada quantos
                  <input className="input !py-2 text-sm mt-0.5 text-right" inputMode="numeric" value={form.per}
                    onChange={e => setForm(f => ({ ...f, per: e.target.value.replace(/\D/g, '') }))} />
                </label>
              </div>
            )}
            <p className="text-[11px] text-steel-500">
              O item é reconhecido pela palavra no nome dele na OS ou na nota. Use o nome completo quando a palavra puder confundir
              (ex.: “bico de ar”, para não pegar “limpeza de bicos”).
            </p>
            <button onClick={add} disabled={busy} className="btn-primary text-sm">{busy ? 'Salvando…' : 'Salvar regra'}</button>
          </div>
        </div>
      )}
    </div>
  );
}
