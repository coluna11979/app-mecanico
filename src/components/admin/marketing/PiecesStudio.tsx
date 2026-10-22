import { useEffect, useMemo, useState } from 'react';
import { toast } from '@/components/ui/Toast';
import { type Audience, canvasToBlob, download } from '@/lib/brandKit';
import {
  type FormatId, type Message, type ThemeId, FORMATS, MESSAGES, SOCIAL_FORMATS, THEMES,
  buildPiecesZip, pieceFileName, renderPiece, renderPiecePng,
} from '@/lib/brandPieces';

const THEME_IDS = Object.keys(THEMES) as ThemeId[];
const EDITS_KEY = 'kit_pecas_textos';

type Edits = Record<string, Partial<Pick<Message, 'kicker' | 'title' | 'highlight' | 'bullets' | 'cta' | 'caption'>>>;

function loadEdits(): Edits {
  try { return JSON.parse(localStorage.getItem(EDITS_KEY) || '{}'); } catch { return {}; }
}

/**
 * Gerador de peças: escolhe público, mensagem e formato, vê os 4 temas lado a lado,
 * ajusta o texto e baixa. Os textos editados ficam guardados neste navegador.
 */
export default function PiecesStudio({ tracked }: { tracked: boolean }) {
  const [audience, setAudience] = useState<Audience>('oficina');
  const [format, setFormat] = useState<FormatId>('post');
  const [messageId, setMessageId] = useState('ofi-mao-de-obra');
  const [theme, setTheme] = useState<ThemeId>('grafite');
  const [edits, setEdits] = useState<Edits>(loadEdits);
  const [editing, setEditing] = useState(false);
  const [zipping, setZipping] = useState<string | null>(null);

  const list = MESSAGES.filter(m => m.audience === audience);
  const base = list.find(m => m.id === messageId) ?? list[0];
  const message: Message = useMemo(() => ({ ...base, ...edits[base.id] }), [base, edits]);
  const f = FORMATS[format];

  useEffect(() => {
    try { localStorage.setItem(EDITS_KEY, JSON.stringify(edits)); } catch { /* sem storage: edição vale só nesta visita */ }
  }, [edits]);

  function pickAudience(a: Audience) {
    setAudience(a);
    setMessageId(MESSAGES.find(m => m.audience === a)!.id);
  }

  function edit<K extends keyof Edits[string]>(k: K, v: Edits[string][K]) {
    setEdits(e => ({ ...e, [base.id]: { ...e[base.id], [k]: v } }));
  }
  const edited = !!edits[base.id] && Object.keys(edits[base.id]).length > 0;

  async function downloadOne(t: ThemeId) {
    download(pieceFileName({ message, theme: t, format }), await renderPiecePng({ message, theme: t, format, tracked }));
  }

  async function downloadAll() {
    setZipping('0');
    try {
      const blob = await buildPiecesZip({ audience, format, themes: THEME_IDS, tracked }, (d, t) => setZipping(`${d}/${t}`));
      download(`mecanicoapp-${format}-${audience === 'oficina' ? 'oficinas' : 'mecanicos'}.zip`, blob);
      toast.success('Pacote baixado ✓');
    } catch (e) { toast.error((e as Error).message); }
    setZipping(null);
  }

  async function copyCaption() {
    try { await navigator.clipboard.writeText(message.caption); toast.success('Legenda copiada ✓'); }
    catch { toast.error('Não deu pra copiar. Selecione o texto e copie.'); }
  }

  return (
    <div className="space-y-4">
      {/* Escolhas */}
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
          <label className="label">Mensagem</label>
          <select className="input" value={base.id} onChange={e => setMessageId(e.target.value)}>
            {list.map(m => <option key={m.id} value={m.id}>{m.name}{edits[m.id] ? ' (editada)' : ''}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Formato</label>
          <select className="input" value={format} onChange={e => setFormat(e.target.value as FormatId)}>
            {SOCIAL_FORMATS.map(id => <option key={id} value={id}>{FORMATS[id].label} · {FORMATS[id].hint}</option>)}
          </select>
        </div>
      </div>

      {/* Temas lado a lado */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {THEME_IDS.map(t => (
          <ThemePreview key={t} t={t} selected={t === theme} message={message} format={format} tracked={tracked}
            onSelect={() => setTheme(t)} onDownload={() => downloadOne(t)} />
        ))}
      </div>

      <div className="flex gap-2 flex-wrap">
        <button className="btn-primary min-h-[44px]" onClick={() => downloadOne(theme).catch(e => toast.error(e.message))}>
          ⬇ Baixar {THEMES[theme].label.toLowerCase()} ({f.label})
        </button>
        <button className="btn-secondary min-h-[44px]" onClick={downloadAll} disabled={!!zipping}>
          {zipping ? `Gerando ${zipping}…` : `Baixar todas as mensagens nos 4 temas (.zip)`}
        </button>
        <button className="btn-ghost min-h-[44px]" onClick={() => setEditing(v => !v)}>
          ✏️ {editing ? 'Fechar edição' : 'Editar texto'}
        </button>
      </div>

      {editing && (
        <div className="border border-steel-200 rounded-2xl p-4 bg-steel-50 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="label">Chamada pequena</label>
              <input className="input" value={message.kicker} onChange={e => edit('kicker', e.target.value)} maxLength={40} />
            </div>
            <div>
              <label className="label">Título</label>
              <input className="input" value={message.title} onChange={e => edit('title', e.target.value)} maxLength={70} />
            </div>
            <div>
              <label className="label">Título em destaque (cor)</label>
              <input className="input" value={message.highlight} onChange={e => edit('highlight', e.target.value)} maxLength={60} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[0, 1, 2].map(i => (
              <div key={i}>
                <label className="label">Item {i + 1} {i === 2 && '(pode ficar vazio)'}</label>
                <input className="input" value={message.bullets[i] ?? ''} maxLength={60}
                  onChange={e => { const b = [...message.bullets]; b[i] = e.target.value; edit('bullets', b); }} />
              </div>
            ))}
          </div>
          {f.print && (
            <div>
              <label className="label">Texto ao lado do QR</label>
              <input className="input" value={message.cta} onChange={e => edit('cta', e.target.value)} maxLength={60} />
            </div>
          )}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-xs text-steel-500">O texto editado fica salvo neste navegador para a próxima vez.</p>
            {edited && (
              <button className="text-sm font-semibold text-steel-600 hover:text-alert-600"
                onClick={() => setEdits(e => { const n = { ...e }; delete n[base.id]; return n; })}>
                Voltar ao texto original
              </button>
            )}
          </div>
        </div>
      )}

      {!f.print && (
        <div className="border border-steel-200 rounded-2xl p-4">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="font-semibold text-steel-900 text-sm">Legenda pronta para postar</div>
            <button className="text-sm font-semibold text-brand-600 hover:underline min-h-[36px]" onClick={copyCaption}>Copiar legenda</button>
          </div>
          <textarea className="input text-sm" rows={6} value={message.caption} onChange={e => edit('caption', e.target.value)} />
          <p className="text-xs text-steel-500 mt-1">
            Nas redes, o post leva “link na bio”: deixe o link de cadastro na bio do perfil (copie lá em cima, na seção de links).
          </p>
        </div>
      )}
    </div>
  );
}

function ThemePreview({ t, selected, message, format, tracked, onSelect, onDownload }: {
  t: ThemeId; selected: boolean; message: Message; format: FormatId; tracked: boolean;
  onSelect: () => void; onDownload: () => Promise<void>;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const f = FORMATS[format];

  useEffect(() => {
    let alive = true;
    let url: string | null = null;
    // Espera a digitação parar antes de redesenhar
    const timer = setTimeout(async () => {
      const c = await renderPiece({ message, theme: t, format, tracked, scale: 560 / f.w });
      const b = await canvasToBlob(c);
      url = URL.createObjectURL(b);
      if (alive) setSrc(url); else URL.revokeObjectURL(url);
    }, 250);
    return () => { alive = false; clearTimeout(timer); if (url) URL.revokeObjectURL(url); };
  }, [t, message, format, tracked, f.w]);

  return (
    <div className={`rounded-2xl border-2 p-2 transition ${selected ? 'border-brand-500 bg-brand-50' : 'border-transparent bg-white'}`}>
      <button onClick={onSelect} className="block w-full rounded-xl overflow-hidden bg-steel-100" style={{ aspectRatio: `${f.w} / ${f.h}` }}
        aria-label={`Escolher tema ${THEMES[t].label}`}>
        {src ? <img src={src} alt={`Tema ${THEMES[t].label}`} className="w-full h-full object-contain" /> : null}
      </button>
      <div className="flex items-center justify-between gap-2 mt-2 px-1">
        <span className={`text-sm font-semibold ${selected ? 'text-brand-700' : 'text-steel-700'}`}>{THEMES[t].label}</span>
        <button onClick={() => onDownload().catch(e => toast.error(e.message))}
          className="text-xs font-semibold text-brand-600 hover:underline min-h-[36px] px-1">Baixar</button>
      </div>
    </div>
  );
}
