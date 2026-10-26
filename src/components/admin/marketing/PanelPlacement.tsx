import { useEffect, useState } from 'react';
import { toast } from '@/components/ui/Toast';
import { setSetting } from '@/lib/settings';
import { type Layout, DEFAULT_LAYOUT, ITEMS, LAYOUT_KEY, PANELS, loadLayout } from '@/lib/panelLayout';

/**
 * Onde banners, dicas do blog e benefícios aparecem em cada painel
 * (acima/abaixo de cada bloco, ou escondido).
 */
export default function PanelPlacement() {
  const [open, setOpen] = useState(false);
  const [layout, setLayout] = useState<Layout | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => { loadLayout(true).then(setLayout); }, []);

  function set(panel: keyof Layout, item: keyof Layout[keyof Layout], pos: string) {
    setLayout(l => (l ? { ...l, [panel]: { ...l[panel], [item]: pos } } : l));
    setDirty(true);
  }

  async function save() {
    if (!layout) return;
    setSaving(true);
    const { error } = await setSetting(LAYOUT_KEY, JSON.stringify(layout), 'Posição de banners, dicas e benefícios nos painéis');
    setSaving(false);
    if (error) return toast.error(error.message);
    void loadLayout(true);
    setDirty(false);
    toast.success('Posições salvas ✓ Valem na próxima vez que o painel abrir.');
  }

  return (
    <div className="bg-white border border-steel-200 rounded-2xl p-4">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between gap-2 min-h-[44px] text-left">
        <span>
          <span className="font-bold text-steel-900">📍 Posição nos painéis</span>
          <span className="block text-xs text-steel-500">Escolha onde banners, dicas do blog e benefícios aparecem em cada painel.</span>
        </span>
        <span className="text-sm font-semibold text-brand-600 shrink-0">{open ? 'Fechar' : 'Ajustar'}</span>
      </button>

      {open && layout && (
        <div className="mt-4 space-y-5">
          {PANELS.map(p => (
            <div key={p.id}>
              <div className="font-semibold text-steel-900 text-sm mb-2">{p.label}</div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {ITEMS.map(it => (
                  <label key={it.id} className="block">
                    <span className="label">{it.label}</span>
                    <select className="input text-sm" value={layout[p.id][it.id]} onChange={e => set(p.id, it.id, e.target.value)}>
                      {p.slots.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                      <option value="oculto">Não mostrar neste painel</option>
                    </select>
                  </label>
                ))}
              </div>
            </div>
          ))}

          <div className="flex items-center gap-2 flex-wrap">
            <button className="btn-primary min-h-[44px]" onClick={save} disabled={saving || !dirty}>{saving ? 'Salvando…' : 'Salvar posições'}</button>
            <button className="btn-ghost min-h-[44px]" onClick={() => { setLayout(structuredClone(DEFAULT_LAYOUT)); setDirty(true); }}>Voltar ao padrão</button>
            <span className="text-xs text-steel-500">Se não houver nada publicado, o espaço não aparece.</span>
          </div>
        </div>
      )}
    </div>
  );
}
