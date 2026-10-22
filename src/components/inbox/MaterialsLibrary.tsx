import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/components/ui/Toast';
import { useMediaUrl } from '@/lib/inbox';

/* ── Biblioteca de materiais: o que a oficina manda sempre (tabela, garantia, fotos…) ── */

export type Material = {
  id: string; title: string; description: string | null;
  kind: 'image' | 'video' | 'document' | 'audio';
  media_path: string; media_mime: string; file_name: string | null; size_bytes: number | null;
};

const KINDS: { key: 'all' | Material['kind']; label: string; icon: string }[] = [
  { key: 'all', label: 'Todos', icon: '🗂️' },
  { key: 'image', label: 'Imagens', icon: '📷' },
  { key: 'video', label: 'Vídeos', icon: '🎥' },
  { key: 'document', label: 'Documentos', icon: '📄' },
  { key: 'audio', label: 'Áudios', icon: '🎤' },
];
const iconOf = (k: Material['kind']) => KINDS.find(x => x.key === k)?.icon ?? '📄';
const kindOf = (mime: string): Material['kind'] =>
  mime.startsWith('image/') ? 'image' : mime.startsWith('video/') ? 'video' : mime.startsWith('audio/') ? 'audio' : 'document';
const MAX_MB = 16;

/** Escolhe um ou mais materiais e devolve para o chat enviar */
export default function MaterialsLibrary({ workshopId, onSend, onClose }: {
  workshopId: string; onSend: (items: Material[]) => Promise<void>; onClose: () => void;
}) {
  const { user } = useAuth();
  const [list, setList] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState<(typeof KINDS)[number]['key']>('all');
  const [picked, setPicked] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('whatsapp_materials')
      .select('id, title, description, kind, media_path, media_mime, file_name, size_bytes')
      .eq('workshop_id', workshopId).order('created_at', { ascending: false });
    if (error) toast.error('Erro ao carregar materiais: ' + error.message);
    setList((data ?? []) as Material[]);
    setLoading(false);
  }, [workshopId]);
  useEffect(() => { load(); }, [load]);

  const q = search.trim().toLowerCase();
  const shown = list.filter(m => (kind === 'all' || m.kind === kind)
    && (!q || m.title.toLowerCase().includes(q) || (m.description ?? '').toLowerCase().includes(q) || (m.file_name ?? '').toLowerCase().includes(q)));

  const toggle = (id: string) => setPicked(p => (p.includes(id) ? p.filter(x => x !== id) : [...p, id]));

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    for (const f of Array.from(files)) {
      if (f.size > MAX_MB * 1024 * 1024) { toast.error(`${f.name}: maior que ${MAX_MB} MB`); continue; }
      const mime = f.type || 'application/octet-stream';
      const safe = f.name.normalize('NFD').replace(/[^\w.-]+/g, '_').slice(-80);
      const path = `${workshopId}/materials/${Date.now()}-${safe}`;
      const up = await supabase.storage.from('whatsapp-media').upload(path, f, { contentType: mime });
      if (up.error) { toast.error(`${f.name}: ${up.error.message}`); continue; }
      const { error } = await supabase.from('whatsapp_materials').insert({
        workshop_id: workshopId, title: f.name.replace(/\.[^.]+$/, ''), kind: kindOf(mime),
        media_path: path, media_mime: mime, file_name: f.name, size_bytes: f.size, created_by: user?.id ?? null,
      });
      if (error) toast.error(`${f.name}: ${error.message}`);
    }
    setUploading(false);
    load();
  }

  async function rename(m: Material) {
    const title = prompt('Nome do material', m.title)?.trim();
    if (!title || title === m.title) return;
    const { error } = await supabase.from('whatsapp_materials').update({ title }).eq('id', m.id);
    if (error) { toast.error('Não salvou: ' + error.message); return; }
    load();
  }

  async function remove(m: Material) {
    if (!confirm(`Apagar “${m.title}” da biblioteca? (o que já foi enviado continua nas conversas)`)) return;
    const { error } = await supabase.from('whatsapp_materials').delete().eq('id', m.id);
    if (error) { toast.error('Não apagou: ' + error.message); return; }
    await supabase.storage.from('whatsapp-media').remove([m.media_path]);
    setPicked(p => p.filter(x => x !== m.id));
    load();
  }

  async function send() {
    const items = picked.map(id => list.find(m => m.id === id)).filter(Boolean) as Material[];
    if (!items.length) return;
    setSending(true);
    try {
      await onSend(items);
      onClose();
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-steel-900/60 grid place-items-center p-4" onClick={onClose}>
      <div className="card max-w-2xl w-full max-h-[88vh] flex flex-col !p-0" onClick={e => e.stopPropagation()}>
        <div className="px-5 pt-4 pb-3 border-b border-steel-100 flex items-center justify-between gap-2">
          <h2 className="text-lg font-bold">📁 Biblioteca de materiais</h2>
          <button type="button" onClick={onClose} className="text-steel-400 hover:text-steel-700 text-xl">✕</button>
        </div>

        <div className="px-5 py-3 space-y-2">
          <div className="flex gap-2">
            <input className="input !py-2 text-sm flex-1" placeholder="🔍 Buscar…" value={search} onChange={e => setSearch(e.target.value)} />
            <input ref={fileInput} type="file" multiple className="hidden" onChange={e => { upload(e.target.files); e.target.value = ''; }} />
            <button type="button" className="btn-secondary !py-2 text-sm shrink-0" disabled={uploading} onClick={() => fileInput.current?.click()}>
              {uploading ? 'Enviando…' : '+ Adicionar'}
            </button>
          </div>
          <div className="flex flex-wrap gap-1">
            {KINDS.map(k => (
              <button key={k.key} type="button" onClick={() => setKind(k.key)}
                className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${kind === k.key ? 'bg-steel-900 text-white border-steel-900' : 'bg-white text-steel-600 border-steel-200 hover:bg-steel-50'}`}>
                {k.icon} {k.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-4">
          {loading ? (
            <p className="text-sm text-steel-500 py-8 text-center">Carregando…</p>
          ) : shown.length === 0 ? (
            <div className="text-center py-10">
              <div className="text-4xl mb-2">📂</div>
              <p className="font-semibold text-steel-700">{list.length ? 'Nada encontrado' : 'Nenhum material ainda'}</p>
              {!list.length && (
                <p className="text-sm text-steel-500 mt-1 max-w-sm mx-auto">
                  Suba o que vocês mandam sempre: tabela de revisões, PDF de garantia, fotos da oficina, vídeo explicando um serviço.
                </p>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {shown.map(m => (
                <MaterialCard key={m.id} m={m} selected={picked.includes(m.id)} onToggle={() => toggle(m.id)}
                  onRename={() => rename(m)} onRemove={() => remove(m)} />
              ))}
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-steel-100 flex items-center justify-between gap-2">
          <span className="text-xs text-steel-500">{picked.length ? `${picked.length} selecionado${picked.length > 1 ? 's' : ''}` : 'Toque nos materiais para escolher'}</span>
          <button type="button" className="btn-primary text-sm" disabled={!picked.length || sending} onClick={send}>
            {sending ? 'Enviando…' : picked.length > 1 ? `Enviar ${picked.length} materiais` : 'Enviar material'}
          </button>
        </div>
      </div>
    </div>
  );
}

function MaterialCard({ m, selected, onToggle, onRename, onRemove }: {
  m: Material; selected: boolean; onToggle: () => void; onRename: () => void; onRemove: () => void;
}) {
  const url = useMediaUrl(m.kind === 'image' ? m.media_path : null);
  return (
    <div className={`group relative rounded-xl border-2 overflow-hidden transition ${selected ? 'border-brand-500' : 'border-steel-200 hover:border-steel-300'}`}>
      <button type="button" onClick={onToggle} className="block w-full text-left">
        <div className="aspect-[4/3] bg-steel-100 grid place-items-center overflow-hidden">
          {m.kind === 'image' && url
            ? <img src={url} alt={m.title} className="w-full h-full object-cover" />
            : <span className="text-4xl">{iconOf(m.kind)}</span>}
        </div>
        <div className="px-2 py-1.5">
          <p className="text-xs font-semibold text-steel-800 truncate">{m.title}</p>
          <p className="text-[10px] text-steel-400 truncate">{m.file_name}{m.size_bytes ? ` · ${(m.size_bytes / 1024 / 1024).toFixed(1)} MB` : ''}</p>
        </div>
      </button>
      <span className={`absolute top-1.5 left-1.5 h-5 w-5 rounded-full border-2 grid place-items-center text-[11px] font-bold ${selected ? 'bg-brand-500 border-brand-500 text-white' : 'bg-white/90 border-steel-300 text-transparent'}`}>✓</span>
      <div className="absolute top-1.5 right-1.5 flex gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition">
        <button type="button" onClick={onRename} title="Renomear" className="h-6 w-6 rounded-md bg-white/90 text-xs shadow">✏️</button>
        <button type="button" onClick={onRemove} title="Apagar" className="h-6 w-6 rounded-md bg-white/90 text-xs shadow">🗑️</button>
      </div>
    </div>
  );
}
