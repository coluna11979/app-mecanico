import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import AdminLayout from '@/components/layout/AdminLayout';
import { toast } from '@/components/ui/Toast';
import { Modal } from '@/components/admin/marketing/ui';
import { type Audience, canvasToBlob, download } from '@/lib/brandKit';
import { type ThemeId, MESSAGE_GROUPS, MESSAGES, THEMES } from '@/lib/brandPieces';
import {
  type Material, type MaterialOptions, GROUPS, MATERIALS, buildArsenalZip, defaultOptions,
  materialFileBase, materialPdf, materialPngs, orderText,
} from '@/lib/printMaterials';

const THEME_IDS = Object.keys(THEMES) as ThemeId[];
const PERSON_KEY = 'material_cartao_pessoa';

function loadPerson() {
  try { return JSON.parse(localStorage.getItem(PERSON_KEY) || '{}') as { name?: string; phone?: string }; } catch { return {}; }
}

async function copy(text: string, what: string) {
  try { await navigator.clipboard.writeText(text); toast.success(`${what} ✓`); }
  catch { toast.error('Não deu pra copiar. Selecione e copie manualmente.'); }
}

/** Arsenal de material gráfico para captação de oficinas e mecânicos. */
export default function AdminMaterialGrafico() {
  const [tracked, setTracked] = useState(true);
  const [open, setOpen] = useState<Material | null>(null);
  const [zipTheme, setZipTheme] = useState<ThemeId>('grafite');
  const [zipping, setZipping] = useState<string | null>(null);

  async function downloadArsenal() {
    setZipping('preparando');
    try {
      const blob = await buildArsenalZip(tracked, zipTheme, (d, t) => setZipping(`${d}/${t}`));
      download('mecanicoapp-material-grafico.zip', blob);
      toast.success('Arsenal baixado ✓');
    } catch (e) { toast.error(`Não deu pra montar: ${(e as Error).message}`); }
    setZipping(null);
  }

  return (
    <AdminLayout>
      <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
        <div className="max-w-2xl">
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">Material gráfico</h1>
          <p className="text-steel-500 text-sm mt-1">
            Tudo para a captação na rua: cada peça já sai no tamanho certo, em PDF pronto para a gráfica e com o texto do pedido.
            Logos, cores e posts para redes ficam no <Link to="/admin/kit-marca" className="text-brand-600 font-semibold hover:underline">Kit da marca</Link>.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select className="input !w-auto min-h-[44px]" value={zipTheme} onChange={e => setZipTheme(e.target.value as ThemeId)} aria-label="Tema do arsenal">
            {THEME_IDS.map(t => <option key={t} value={t}>Tema {THEMES[t].label}</option>)}
          </select>
          <button onClick={downloadArsenal} disabled={!!zipping} className="btn-primary min-h-[44px]">
            {zipping ? `Gerando ${zipping}…` : '⬇ Baixar arsenal completo (PDFs)'}
          </button>
        </div>
      </div>

      <label className="flex items-start gap-3 bg-white border border-steel-200 rounded-2xl p-3 mb-5 cursor-pointer">
        <input type="checkbox" className="mt-0.5 h-5 w-5 rounded border-steel-300 text-brand-500 shrink-0"
          checked={tracked} onChange={e => setTracked(e.target.checked)} />
        <span className="text-sm text-steel-700">
          <b>Medir quem veio do material impresso</b> (recomendado). Quem se cadastrar pelos QR codes aparece no Painel de Marketing como “impresso”.
        </span>
      </label>

      <div className="space-y-6">
        {GROUPS.map(g => (
          <section key={g.id}>
            <h2 className="text-lg font-bold text-steel-900">{g.label}</h2>
            <p className="text-sm text-steel-500 mb-3">{g.hint}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {MATERIALS.filter(m => m.group === g.id).map(m => (
                <MaterialCard key={m.id} m={m} tracked={tracked} onOpen={() => setOpen(m)} />
              ))}
            </div>
          </section>
        ))}
      </div>

      {open && <MaterialDetail m={open} tracked={tracked} onClose={() => setOpen(null)} />}
    </AdminLayout>
  );
}

function usePreview(m: Material, o: MaterialOptions, height: number) {
  const [srcs, setSrcs] = useState<string[]>([]);
  const key = JSON.stringify(o);
  useEffect(() => {
    let alive = true;
    const urls: string[] = [];
    const t = setTimeout(async () => {
      const full = (m.mm.h + 2 * m.mm.bleed) / 25.4 * m.mm.dpi;
      const pages = await m.render({ ...o, scale: Math.min(1, (height * 2) / full) });
      for (const c of pages) urls.push(URL.createObjectURL(await canvasToBlob(c)));
      if (alive) setSrcs(urls); else urls.forEach(u => URL.revokeObjectURL(u));
    }, 200);
    return () => { alive = false; clearTimeout(t); urls.forEach(u => URL.revokeObjectURL(u)); };
  }, [m, key, height]); // eslint-disable-line react-hooks/exhaustive-deps
  return srcs;
}

function MaterialCard({ m, tracked, onOpen }: { m: Material; tracked: boolean; onOpen: () => void }) {
  const srcs = usePreview(m, defaultOptions('oficina', tracked), 160);
  return (
    <button onClick={onOpen} className="text-left bg-white border border-steel-200 rounded-2xl p-3 hover:border-brand-400 hover:shadow-sm transition">
      <div className="h-44 bg-steel-100 rounded-xl grid place-items-center overflow-hidden px-2">
        <div className="flex gap-2 items-center justify-center max-h-40">
          {srcs.map((s, i) => <img key={i} src={s} alt="" className="max-h-40 max-w-full object-contain shadow-sm" />)}
        </div>
      </div>
      <div className="mt-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-bold text-steel-900">{m.emoji} {m.name}</div>
          <div className="text-xs text-steel-500">{m.size}{m.pages.length > 1 ? ' · frente e verso' : ''}</div>
        </div>
        <span className="text-xs font-semibold text-brand-600 shrink-0 mt-1">Abrir →</span>
      </div>
      <p className="text-sm text-steel-600 mt-1.5 line-clamp-2">{m.use}</p>
    </button>
  );
}

function MaterialDetail({ m, tracked, onClose }: { m: Material; tracked: boolean; onClose: () => void }) {
  const person = loadPerson();
  const [o, setO] = useState<MaterialOptions>({ ...defaultOptions('oficina', tracked), personName: person.name, personPhone: person.phone });
  const [busy, setBusy] = useState<'pdf' | 'png' | null>(null);
  const srcs = usePreview(m, o, 340);
  const msgs = MESSAGES.filter(x => x.audience === o.audience);

  useEffect(() => {
    if (!m.options.person) return;
    try { localStorage.setItem(PERSON_KEY, JSON.stringify({ name: o.personName, phone: o.personPhone })); } catch { /* ok */ }
  }, [m.options.person, o.personName, o.personPhone]);

  function setAudience(a: Audience) {
    setO(p => ({ ...p, audience: a, messageId: MESSAGES.find(x => x.audience === a)!.id }));
  }

  async function pdf() {
    setBusy('pdf');
    try { download(`${materialFileBase(m, o)}.pdf`, await materialPdf(m, o)); toast.success('PDF baixado ✓'); }
    catch (e) { toast.error((e as Error).message); }
    setBusy(null);
  }

  async function png() {
    setBusy('png');
    try {
      const files = await materialPngs(m, o);
      files.forEach((b, i) => download(`${materialFileBase(m, o)}${files.length > 1 ? `-${m.pages[i]}` : ''}.png`, b));
    } catch (e) { toast.error((e as Error).message); }
    setBusy(null);
  }

  return (
    <Modal title={`${m.emoji} ${m.name}`} onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-steel-600">{m.use}</p>

        <div className="bg-steel-100 rounded-xl p-3 flex gap-3 justify-center items-center flex-wrap min-h-[200px]">
          {srcs.length === 0 && <span className="text-steel-400 text-sm">Gerando…</span>}
          {srcs.map((s, i) => (
            <figure key={i} className="text-center">
              <img src={s} alt={m.pages[i]} className="max-h-[340px] max-w-full object-contain shadow" />
              {m.pages.length > 1 && <figcaption className="text-xs text-steel-500 mt-1">{m.pages[i]}</figcaption>}
            </figure>
          ))}
        </div>

        {m.options.audience && (
          <div>
            <div className="label">Para quem</div>
            <div className="inline-flex bg-steel-100 rounded-xl p-1 w-full">
              {([['oficina', '🏭 Oficinas'], ['mecanico', '🔧 Mecânicos']] as const).map(([a, l]) => (
                <button key={a} onClick={() => setAudience(a)}
                  className={`flex-1 px-3 py-2 min-h-[40px] rounded-lg text-sm font-semibold transition ${o.audience === a ? 'bg-white shadow text-steel-900' : 'text-steel-500'}`}>
                  {l}
                </button>
              ))}
            </div>
          </div>
        )}

        {m.options.message && (
          <div>
            <label className="label">Mensagem</label>
            <select className="input" value={o.messageId} onChange={e => setO(p => ({ ...p, messageId: e.target.value }))}>
              {MESSAGE_GROUPS.map(g => {
                const items = msgs.filter(g.match);
                return items.length ? (
                  <optgroup key={g.label} label={g.label}>
                    {items.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </optgroup>
                ) : null;
              })}
            </select>
          </div>
        )}

        {m.options.theme && (
          <div>
            <div className="label">Tema</div>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
              {THEME_IDS.map(t => (
                <button key={t} onClick={() => setO(p => ({ ...p, theme: t }))}
                  className={`min-h-[44px] rounded-lg border-2 text-sm font-semibold transition ${o.theme === t ? 'border-brand-500 text-brand-700 bg-brand-50' : 'border-steel-200 text-steel-600'}`}>
                  {THEMES[t].label}
                </button>
              ))}
            </div>
          </div>
        )}

        {m.options.person && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Nome no cartão (opcional)</label>
              <input className="input" value={o.personName ?? ''} maxLength={32} onChange={e => setO(p => ({ ...p, personName: e.target.value }))} />
            </div>
            <div>
              <label className="label">WhatsApp (opcional)</label>
              <input className="input" value={o.personPhone ?? ''} maxLength={20} inputMode="tel" placeholder="(11) 90000-0000"
                onChange={e => setO(p => ({ ...p, personPhone: e.target.value }))} />
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button className="btn-primary min-h-[44px]" onClick={pdf} disabled={!!busy}>
            {busy === 'pdf' ? 'Gerando PDF…' : '⬇ PDF para a gráfica'}
          </button>
          <button className="btn-secondary min-h-[44px]" onClick={png} disabled={!!busy}>
            {busy === 'png' ? 'Gerando…' : `⬇ PNG${m.pages.length > 1 ? ' (frente e verso)' : ''}`}
          </button>
        </div>

        <div className="border border-steel-200 rounded-xl p-3">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="font-semibold text-steel-900 text-sm">Pedido para a gráfica</div>
            <button className="text-sm font-semibold text-brand-600 hover:underline min-h-[36px]" onClick={() => copy(orderText(m), 'Pedido copiado')}>
              Copiar texto
            </button>
          </div>
          <dl className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-sm">
            <dt className="text-steel-500">Tamanho</dt><dd className="text-steel-800">{m.size}{m.mm.bleed ? ` (+${m.mm.bleed} mm de sangria no arquivo)` : ''}</dd>
            <dt className="text-steel-500">Cores</dt><dd className="text-steel-800">{m.colors}</dd>
            <dt className="text-steel-500">Material</dt><dd className="text-steel-800">{m.paper}</dd>
            <dt className="text-steel-500">Acabamento</dt><dd className="text-steel-800">{m.finish}</dd>
            <dt className="text-steel-500">Quantidade</dt><dd className="text-steel-800">{m.qty} (sugestão)</dd>
          </dl>
          <p className="text-xs text-steel-500 mt-2">Cole no WhatsApp ou e-mail da gráfica e anexe o PDF.</p>
        </div>
      </div>
    </Modal>
  );
}
