import { useEffect, useState } from 'react';
import { toast } from '@/components/ui/Toast';
import { type Audience, canvasToBlob, download } from '@/lib/brandKit';
import { type ThemeId, THEMES } from '@/lib/brandPieces';
import { CAROUSELS, buildCarouselZip, renderSlide, renderSlidePng } from '@/lib/carousels';

const THEME_IDS = Object.keys(THEMES) as ThemeId[];

/** Carrosséis prontos: escolhe público, roteiro e tema; baixa os slides numerados + legenda. */
export default function CarouselStudio() {
  const [audience, setAudience] = useState<Audience>('mecanico');
  const list = CAROUSELS.filter(c => c.audience === audience);
  const [id, setId] = useState(list[0].id);
  const [theme, setTheme] = useState<ThemeId>('grafite');
  const [srcs, setSrcs] = useState<string[]>([]);
  const [zipping, setZipping] = useState(false);
  const carousel = list.find(c => c.id === id) ?? list[0];

  useEffect(() => {
    let alive = true;
    const urls: string[] = [];
    setSrcs([]);
    (async () => {
      for (let i = 0; i < carousel.slides.length; i++) {
        const b = await canvasToBlob(await renderSlide(carousel, i, theme, 0.35));
        urls.push(URL.createObjectURL(b));
      }
      if (alive) setSrcs([...urls]); else urls.forEach(u => URL.revokeObjectURL(u));
    })();
    return () => { alive = false; urls.forEach(u => URL.revokeObjectURL(u)); };
  }, [carousel, theme]);

  function pickAudience(a: Audience) {
    setAudience(a);
    setId(CAROUSELS.find(c => c.audience === a)!.id);
  }

  async function zip() {
    setZipping(true);
    try {
      download(`carrossel-${carousel.id}-${theme}.zip`, await buildCarouselZip(carousel, theme));
      toast.success('Carrossel baixado ✓');
    } catch (e) { toast.error((e as Error).message); }
    setZipping(false);
  }

  async function copyCaption() {
    try { await navigator.clipboard.writeText(carousel.caption); toast.success('Legenda copiada ✓'); }
    catch { toast.error('Não deu pra copiar. Selecione o texto e copie.'); }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div>
          <div className="label">Para quem</div>
          <div className="inline-flex bg-steel-100 rounded-xl p-1 w-full">
            {([['oficina', '🏭 Oficinas'], ['mecanico', '🔧 Mecânicos']] as const).map(([a, l]) => (
              <button key={a} onClick={() => pickAudience(a)}
                className={`flex-1 px-3 py-2 min-h-[40px] rounded-lg text-sm font-semibold transition ${audience === a ? 'bg-white shadow text-steel-900' : 'text-steel-500'}`}>
                {l}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="label">Carrossel</label>
          <select className="input" value={carousel.id} onChange={e => setId(e.target.value)}>
            {list.map(c => <option key={c.id} value={c.id}>{c.name} · {c.slides.length} slides</option>)}
          </select>
        </div>
        <div>
          <label className="label">Tema</label>
          <select className="input" value={theme} onChange={e => setTheme(e.target.value as ThemeId)}>
            {THEME_IDS.map(t => <option key={t} value={t}>{THEMES[t].label}</option>)}
          </select>
        </div>
      </div>

      {/* Slides na ordem, rolando de lado como no Instagram */}
      <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0 snap-x">
        {carousel.slides.map((_, i) => (
          <figure key={i} className="shrink-0 w-44 sm:w-52 snap-start">
            <div className="aspect-[4/5] rounded-xl overflow-hidden bg-steel-100">
              {srcs[i] && <img src={srcs[i]} alt={`Slide ${i + 1}`} className="w-full h-full object-cover" />}
            </div>
            <figcaption className="flex items-center justify-between mt-1.5 px-0.5">
              <span className="text-xs text-steel-500">Slide {i + 1}</span>
              <button className="text-xs font-semibold text-brand-600 hover:underline min-h-[32px]"
                onClick={async () => download(`${String(i + 1).padStart(2, '0')}-${carousel.id}.png`, await renderSlidePng(carousel, i, theme))}>
                Baixar
              </button>
            </figcaption>
          </figure>
        ))}
      </div>

      <div className="flex gap-2 flex-wrap">
        <button className="btn-primary min-h-[44px]" onClick={zip} disabled={zipping}>
          {zipping ? 'Gerando…' : `⬇ Baixar carrossel (${carousel.slides.length} slides + legenda)`}
        </button>
        <button className="btn-secondary min-h-[44px]" onClick={copyCaption}>Copiar legenda</button>
      </div>

      <div className="border border-steel-200 rounded-2xl p-4">
        <div className="font-semibold text-steel-900 text-sm mb-2">Legenda</div>
        <p className="text-sm text-steel-700 whitespace-pre-line">{carousel.caption}</p>
        <p className="text-xs text-steel-500 mt-2">
          Os arquivos saem numerados (01, 02…) na ordem certa: é só subir todos juntos no mLabs ou no Instagram.
        </p>
      </div>
    </div>
  );
}
