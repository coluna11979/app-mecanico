import { useEffect, useState } from 'react';
import { toast } from '@/components/ui/Toast';
import { download } from '@/lib/brandKit';
import { type ThemeId, THEMES } from '@/lib/brandPieces';
import { HIGHLIGHTS, buildHighlightsZip, renderHighlight, renderHighlightPng } from '@/lib/highlights';

const THEME_IDS = Object.keys(THEMES) as ThemeId[];

/** Capas de destaque: mostra já no círculo, como fica no perfil. */
export default function HighlightsStudio() {
  const [theme, setTheme] = useState<ThemeId>('grafite');
  const [withLabel, setWithLabel] = useState(false);
  const [srcs, setSrcs] = useState<Record<string, string>>({});
  const [zipping, setZipping] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const out: Record<string, string> = {};
      for (const h of HIGHLIGHTS) {
        const c = await renderHighlight(h, theme, withLabel, 0.3);
        // Recorte do quadrado central (o círculo é feito no CSS)
        const sq = document.createElement('canvas');
        sq.width = sq.height = c.width;
        sq.getContext('2d')!.drawImage(c, 0, (c.height - c.width) / 2, c.width, c.width, 0, 0, c.width, c.width);
        out[h.id] = sq.toDataURL('image/png');
      }
      if (alive) setSrcs(out);
    })();
    return () => { alive = false; };
  }, [theme, withLabel]);

  async function zip() {
    setZipping(true);
    try {
      download(`destaques-instagram-${theme}.zip`, await buildHighlightsZip(theme, withLabel));
      toast.success('Capas baixadas ✓');
    } catch (e) { toast.error((e as Error).message); }
    setZipping(false);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-3 flex-wrap">
        <div>
          <label className="label">Tema</label>
          <select className="input !w-auto" value={theme} onChange={e => setTheme(e.target.value as ThemeId)}>
            {THEME_IDS.map(t => <option key={t} value={t}>{THEMES[t].label}</option>)}
          </select>
        </div>
        <label className="flex items-center gap-2 text-sm text-steel-700 min-h-[44px] cursor-pointer">
          <input type="checkbox" className="h-5 w-5 rounded border-steel-300 text-brand-500"
            checked={withLabel} onChange={e => setWithLabel(e.target.checked)} />
          Escrever o nome dentro da capa
        </label>
        <button className="btn-primary min-h-[44px] ml-auto" onClick={zip} disabled={zipping}>
          {zipping ? 'Gerando…' : `⬇ Baixar as ${HIGHLIGHTS.length} capas (.zip)`}
        </button>
      </div>

      {/* Como fica no perfil */}
      <div className="bg-white border border-steel-200 rounded-2xl p-4">
        <div className="text-xs font-semibold text-steel-500 uppercase tracking-wide mb-3">Como fica no perfil</div>
        <div className="flex gap-4 overflow-x-auto pb-1">
          {HIGHLIGHTS.map(h => (
            <div key={h.id} className="shrink-0 w-[72px] text-center">
              <div className="h-[72px] w-[72px] rounded-full p-[3px] border border-steel-300">
                {srcs[h.id] ? <img src={srcs[h.id]} alt="" className="h-full w-full rounded-full object-cover" /> : <div className="h-full w-full rounded-full bg-steel-100" />}
              </div>
              <div className="text-[11px] text-steel-700 mt-1 truncate">{h.name}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {HIGHLIGHTS.map(h => (
          <div key={h.id} className="border border-steel-200 rounded-2xl p-3 flex items-center gap-3">
            <div className="h-16 w-16 shrink-0 rounded-full overflow-hidden bg-steel-100">
              {srcs[h.id] && <img src={srcs[h.id]} alt="" className="h-full w-full object-cover" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-steel-900 text-sm">{h.name}</div>
              <div className="text-xs text-steel-500 line-clamp-2">{h.hint}</div>
            </div>
            <button className="text-xs font-semibold text-brand-600 hover:underline min-h-[36px] shrink-0"
              onClick={async () => download(`destaque-${h.id}-${theme}.png`, await renderHighlightPng(h, theme, withLabel))}>
              Baixar
            </button>
          </div>
        ))}
      </div>

      <p className="text-xs text-steel-500">
        Para trocar a capa: no perfil, segure o destaque → Editar destaque → Editar capa → escolha a imagem. Use o mesmo tema em todas para o perfil ficar organizado.
      </p>
    </div>
  );
}
