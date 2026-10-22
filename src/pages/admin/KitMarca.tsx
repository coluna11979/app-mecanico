import { ReactNode, useEffect, useState } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { toast } from '@/components/ui/Toast';
import {
  type Audience, type IconVariant, COLORS, DISPLAY_DOMAIN, FLYER_COPY, FLYER_MM, FONTS, LANDING_PATH,
  LOGO_VARIANTS, PHRASES, PUBLIC_URL, SIGNUP_PATH, buildKitZip, canvasToBlob, cmykText, download,
  flyerCanvas, flyerPng, iconPng, iconSvg, logoPng, logoSvg, palettePng, qrPng, qrSvg, rgbText, signupUrl,
} from '@/lib/brandKit';

const SECTIONS = [
  { id: 'links',     label: 'Links e QR codes' },
  { id: 'logo',      label: 'Logotipo' },
  { id: 'icone',     label: 'Ícone' },
  { id: 'cores',     label: 'Cores' },
  { id: 'fontes',    label: 'Fontes' },
  { id: 'panfletos', label: 'Panfletos' },
  { id: 'textos',    label: 'Frases e textos' },
];

const AUD: { a: Audience; label: string; emoji: string }[] = [
  { a: 'oficina',  label: 'Cadastro de oficinas',  emoji: '🏭' },
  { a: 'mecanico', label: 'Cadastro de mecânicos', emoji: '🔧' },
];

const ICONS: { v: IconVariant; label: string; bg: string }[] = [
  { v: 'app',     label: 'Ícone do app',  bg: '#FFFFFF' },
  { v: 'laranja', label: 'Laranja',       bg: '#FFFFFF' },
  { v: 'branco',  label: 'Branco',        bg: '#0B1117' },
  { v: 'preto',   label: 'Preto (1 cor)', bg: '#FFFFFF' },
];

const svgSrc = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

async function copyText(text: string, what = 'Copiado') {
  try { await navigator.clipboard.writeText(text); toast.success(`${what} ✓`); }
  catch { toast.error('Não deu pra copiar. Selecione e copie manualmente.'); }
}

/** Kit da marca: tudo que a gráfica precisa, organizado e pronto pra baixar. */
export default function AdminKitMarca() {
  const [tracked, setTracked] = useState(true);
  const [zipping, setZipping] = useState<string | null>(null);

  async function downloadZip() {
    setZipping('preparando');
    try {
      const blob = await buildKitZip(tracked, s => setZipping(s));
      download('mecanicoapp-kit-grafica.zip', blob);
      toast.success('Pacote baixado ✓');
    } catch (e) {
      toast.error(`Não deu pra montar o pacote: ${(e as Error).message}`);
    }
    setZipping(null);
  }

  return (
    <AdminLayout>
      <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
        <div className="max-w-2xl">
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">Kit da marca</h1>
          <p className="text-steel-500 text-sm mt-1">
            Tudo que a gráfica precisa para criar panfletos, cartões, adesivos e banners. Baixe item por item ou o pacote completo com as instruções.
          </p>
        </div>
        <button onClick={downloadZip} disabled={!!zipping} className="btn-primary min-h-[44px]">
          {zipping ? `Montando… (${zipping})` : '⬇ Baixar pacote para a gráfica (.zip)'}
        </button>
      </div>

      <label className="flex items-start gap-3 bg-white border border-steel-200 rounded-2xl p-3 mb-4 cursor-pointer">
        <input type="checkbox" className="mt-0.5 h-5 w-5 rounded border-steel-300 text-brand-500 shrink-0"
          checked={tracked} onChange={e => setTracked(e.target.checked)} />
        <span className="text-sm text-steel-700">
          <b>Medir quem veio do material impresso</b> (recomendado). Os QR codes levam uma marcação, e esses cadastros aparecem no Painel de Marketing como “impresso”. O link continua funcionando para sempre.
        </span>
      </label>

      <nav className="sticky top-0 z-10 -mx-4 px-4 lg:mx-0 lg:px-0 bg-steel-50/95 backdrop-blur py-2 mb-4 flex gap-2 overflow-x-auto">
        {SECTIONS.map(s => (
          <a key={s.id} href={`#${s.id}`}
            className="whitespace-nowrap text-sm font-semibold px-3 py-2 rounded-lg bg-white border border-steel-200 text-steel-700 hover:border-brand-400 hover:text-brand-600">
            {s.label}
          </a>
        ))}
      </nav>

      <div className="space-y-6">
        <LinksSection tracked={tracked} />
        <LogoSection />
        <IconSection />
        <ColorsSection />
        <FontsSection />
        <FlyersSection tracked={tracked} />
        <TextsSection />
      </div>
    </AdminLayout>
  );
}

function Section({ id, n, title, subtitle, children }: { id: string; n: number; title: string; subtitle: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-16 bg-white border border-steel-200 rounded-2xl p-4 sm:p-6">
      <div className="mb-4">
        <div className="text-[11px] font-bold tracking-widest text-brand-600">{String(n).padStart(2, '0')}</div>
        <h2 className="text-lg font-bold text-steel-900">{title}</h2>
        <p className="text-sm text-steel-500">{subtitle}</p>
      </div>
      {children}
    </section>
  );
}

function DlButton({ children, onClick }: { children: ReactNode; onClick: () => Promise<void> | void }) {
  const [busy, setBusy] = useState(false);
  return (
    <button type="button" disabled={busy}
      onClick={async () => { setBusy(true); try { await onClick(); } catch (e) { toast.error((e as Error).message); } setBusy(false); }}
      className="text-xs font-semibold px-3 py-2 min-h-[36px] rounded-lg border border-steel-200 bg-white text-steel-700 hover:border-brand-400 hover:text-brand-600 disabled:opacity-50">
      {busy ? '…' : children}
    </button>
  );
}

// ── 01 Links e QR ───────────────────────────────────────────────────────────

function LinksSection({ tracked }: { tracked: boolean }) {
  return (
    <Section id="links" n={1} title="Links e QR codes de cadastro" subtitle="O QR vai direto para o cadastro. Use o SVG na gráfica (vetor: não perde qualidade em nenhum tamanho).">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {AUD.map(({ a, label, emoji }) => <QrCard key={a} a={a} label={label} emoji={emoji} tracked={tracked} />)}
      </div>

      <div className="mt-4 border-t border-steel-100 pt-4">
        <div className="text-xs font-semibold text-steel-500 uppercase tracking-wide mb-2">Outros links</div>
        <ul className="space-y-2">
          {[
            { label: 'Site', url: PUBLIC_URL },
            { label: 'Página para oficinas', url: `${PUBLIC_URL}${LANDING_PATH.oficina}` },
            { label: 'Página para mecânicos', url: `${PUBLIC_URL}${LANDING_PATH.mecanico}` },
          ].map(l => (
            <li key={l.url} className="flex items-center gap-3 flex-wrap">
              <span className="text-sm text-steel-600 w-44 shrink-0">{l.label}</span>
              <code className="text-sm text-steel-800 flex-1 min-w-0 truncate">{l.url}</code>
              <button className="text-xs font-semibold text-brand-600 hover:underline min-h-[36px]" onClick={() => copyText(l.url, 'Link copiado')}>Copiar</button>
            </li>
          ))}
        </ul>
      </div>
    </Section>
  );
}

function QrCard({ a, label, emoji, tracked }: { a: Audience; label: string; emoji: string; tracked: boolean }) {
  const url = signupUrl(a, tracked);
  const short = `${DISPLAY_DOMAIN}${SIGNUP_PATH[a]}`;
  const [svg, setSvg] = useState<string | null>(null);
  useEffect(() => { qrSvg(url).then(setSvg); }, [url]);

  return (
    <div className="border border-steel-200 rounded-2xl p-4 flex gap-4 items-start">
      <div className="w-32 h-32 sm:w-36 sm:h-36 shrink-0 rounded-xl border border-steel-100 bg-white grid place-items-center">
        {svg ? <img src={svgSrc(svg)} alt={`QR ${label}`} className="w-full h-full" /> : <span className="text-steel-400 text-xs">…</span>}
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-bold text-steel-900">{emoji} {label}</div>
        <div className="text-xs text-steel-500 mt-1">Texto para imprimir embaixo do QR:</div>
        <code className="text-sm text-brand-700 font-semibold break-all">{short}</code>
        <div className="flex gap-2 flex-wrap mt-3">
          <DlButton onClick={async () => download(`qr-cadastro-${a}.svg`, await qrSvg(url))}>SVG</DlButton>
          <DlButton onClick={async () => download(`qr-cadastro-${a}.png`, await qrPng(url))}>PNG</DlButton>
          <DlButton onClick={() => copyText(url, 'Link copiado')}>Copiar link</DlButton>
        </div>
      </div>
    </div>
  );
}

// ── 02 Logo ─────────────────────────────────────────────────────────────────

function LogoSection() {
  const [svgs, setSvgs] = useState<Record<string, string>>({});
  useEffect(() => {
    Promise.all(LOGO_VARIANTS.map(async l => [l.v, await logoSvg(l.v)] as const))
      .then(list => setSvgs(Object.fromEntries(list)));
  }, []);

  return (
    <Section id="logo" n={2} title="Logotipo" subtitle="Escolha a versão pelo fundo onde ele vai ser aplicado. Nunca distorça nem troque as cores.">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {LOGO_VARIANTS.map(l => (
          <div key={l.v} className="border border-steel-200 rounded-2xl overflow-hidden">
            <div className="h-32 grid place-items-center px-6" style={{ background: l.bg }}>
              {svgs[l.v] ? <img src={svgSrc(svgs[l.v])} alt={l.label} className="max-h-14 w-auto" /> : null}
            </div>
            <div className="p-3 flex items-center justify-between gap-2 flex-wrap">
              <div>
                <div className="font-semibold text-steel-900 text-sm">{l.label}</div>
                <div className="text-xs text-steel-500">{l.hint}</div>
              </div>
              <div className="flex gap-2">
                <DlButton onClick={async () => download(`logo-${l.v}.svg`, await logoSvg(l.v))}>SVG</DlButton>
                <DlButton onClick={async () => download(`logo-${l.v}.png`, await logoPng(l.v))}>PNG</DlButton>
              </div>
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-steel-500 mt-3">
        O SVG do logotipo usa a fonte Space Grotesk: a gráfica precisa ter a fonte instalada (é gratuita) ou usar o PNG.
      </p>
    </Section>
  );
}

// ── 03 Ícone ────────────────────────────────────────────────────────────────

function IconSection() {
  return (
    <Section id="icone" n={3} title="Ícone (símbolo)" subtitle="Para espaços pequenos: adesivo, carimbo, avatar de rede social, bordado em uniforme.">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {ICONS.map(i => (
          <div key={i.v} className="border border-steel-200 rounded-2xl overflow-hidden">
            <div className="h-28 grid place-items-center" style={{ background: i.bg }}>
              <img src={svgSrc(iconSvg(i.v))} alt={i.label} className="h-16 w-16" />
            </div>
            <div className="p-3">
              <div className="font-semibold text-steel-900 text-sm">{i.label}</div>
              <div className="flex gap-2 mt-2">
                <DlButton onClick={() => download(`icone-${i.v}.svg`, iconSvg(i.v))}>SVG</DlButton>
                <DlButton onClick={async () => download(`icone-${i.v}.png`, await iconPng(i.v))}>PNG</DlButton>
              </div>
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

// ── 04 Cores ────────────────────────────────────────────────────────────────

function ColorsSection() {
  return (
    <Section id="cores" n={4} title="Cores da marca" subtitle="Clique num código para copiar. Os valores CMYK são aproximados: peça prova de cor à gráfica.">
      {COLORS.map(g => (
        <div key={g.group} className="mb-4 last:mb-0">
          <div className="text-xs font-semibold text-steel-500 uppercase tracking-wide mb-2">{g.group}</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {g.colors.map(c => (
              <div key={c.hex} className="border border-steel-200 rounded-2xl overflow-hidden">
                <div className="h-16 border-b border-steel-100" style={{ background: c.hex }} />
                <div className="p-3">
                  <div className="font-semibold text-steel-900 text-sm">{c.name}</div>
                  <div className="text-xs text-steel-500 mb-2">{c.use}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {[c.hex, rgbText(c.hex), cmykText(c.hex)].map(v => (
                      <button key={v} onClick={() => copyText(v.replace(/^(RGB|CMYK) /, ''), `${v.split(' ')[0].startsWith('#') ? 'HEX' : v.split(' ')[0]} copiado`)}
                        className="text-[11px] font-mono px-2 py-1 rounded-md bg-steel-50 border border-steel-200 text-steel-700 hover:border-brand-400 min-h-[30px]">
                        {v}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
      <div className="flex items-center gap-3 mt-4 flex-wrap">
        <div className="h-10 w-40 rounded-xl" style={{ background: 'linear-gradient(135deg,#FF7A38,#E64500)' }} />
        <span className="text-sm text-steel-600">Degradê do símbolo: <code>#FF7A38 → #E64500</code> (diagonal)</span>
        <DlButton onClick={async () => download('paleta-mecanicoapp.png', await palettePng())}>Baixar paleta (PNG)</DlButton>
      </div>
    </Section>
  );
}

// ── 05 Fontes ───────────────────────────────────────────────────────────────

function FontsSection() {
  return (
    <Section id="fontes" n={5} title="Fontes" subtitle="As duas são gratuitas no Google Fonts.">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {FONTS.map(f => (
          <div key={f.name} className="border border-steel-200 rounded-2xl p-4">
            <div className={`text-3xl text-steel-900 ${f.name === 'Inter' ? 'font-sans' : 'font-display font-bold'}`}>Aa Mecânico</div>
            <div className="font-semibold text-steel-900 mt-2">{f.name} <span className="text-steel-500 font-normal">· {f.weight}</span></div>
            <div className="text-sm text-steel-500">{f.use}</div>
            <a href={f.url} target="_blank" rel="noreferrer" className="inline-block mt-2 text-sm font-semibold text-brand-600 hover:underline">Baixar no Google Fonts ↗</a>
          </div>
        ))}
      </div>
    </Section>
  );
}

// ── 06 Panfletos ────────────────────────────────────────────────────────────

function FlyersSection({ tracked }: { tracked: boolean }) {
  return (
    <Section id="panfletos" n={6} title="Panfletos prontos (A5)"
      subtitle={`${FLYER_MM.w} × ${FLYER_MM.h} mm com ${FLYER_MM.bleed} mm de sangria, 300 dpi. Pode mandar direto ou usar de base para a gráfica criar o seu.`}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {AUD.map(({ a, emoji }) => <FlyerCard key={a} a={a} emoji={emoji} tracked={tracked} />)}
      </div>
    </Section>
  );
}

function FlyerCard({ a, emoji, tracked }: { a: Audience; emoji: string; tracked: boolean }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    let url: string | null = null;
    flyerCanvas(a, tracked, 0.35).then(canvasToBlob).then(b => {
      url = URL.createObjectURL(b);
      if (alive) setSrc(url);
    });
    return () => { alive = false; if (url) URL.revokeObjectURL(url); };
  }, [a, tracked]);

  return (
    <div className="border border-steel-200 rounded-2xl p-3">
      <div className="aspect-[154/216] bg-steel-100 rounded-xl overflow-hidden grid place-items-center">
        {src ? <img src={src} alt={`Panfleto ${a}`} className="w-full h-full object-contain" /> : <span className="text-steel-400 text-sm">Gerando…</span>}
      </div>
      <div className="flex items-center justify-between gap-2 mt-3 flex-wrap">
        <div className="font-semibold text-steel-900 text-sm">{emoji} {FLYER_COPY[a].kicker.toLowerCase().replace(/^./, c => c.toUpperCase())}</div>
        <DlButton onClick={async () => download(`panfleto-a5-${a}.png`, await flyerPng(a, tracked))}>Baixar PNG 300 dpi</DlButton>
      </div>
    </div>
  );
}

// ── 07 Textos ───────────────────────────────────────────────────────────────

function TextsSection() {
  return (
    <Section id="textos" n={7} title="Frases e textos" subtitle="Frases da marca para chamadas, anúncios e materiais. Clique para copiar.">
      <ul className="space-y-2">
        {PHRASES.map(p => (
          <li key={p.text}>
            <button onClick={() => copyText(p.text, 'Frase copiada')}
              className="w-full text-left border border-steel-200 rounded-xl p-3 hover:border-brand-400 transition">
              <div className="font-semibold text-steel-900">“{p.text}”</div>
              <div className="text-xs text-steel-500 mt-0.5">{p.use}</div>
            </button>
          </li>
        ))}
      </ul>
    </Section>
  );
}
