import { useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';

interface Props {
  userId: string;
  currentUrl: string | null;
  initials: string;
  size?: 'md' | 'lg';
  dark?: boolean;
  onUploaded: (url: string) => void;
}

export function AvatarUpload({ userId, currentUrl, initials, size = 'lg', dark, onUploaded }: Props) {
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview]     = useState<string | null>(currentUrl);
  const inputRef = useRef<HTMLInputElement>(null);

  const dim = size === 'lg' ? 'h-20 w-20' : 'h-14 w-14';
  const text = size === 'lg' ? 'text-2xl' : 'text-lg';

  async function handleFile(file: File) {
    if (!file.type.startsWith('image/')) return;
    if (file.size > 5 * 1024 * 1024) { alert('Imagem muito grande. Máximo 5 MB.'); return; }

    // Preview local imediato
    const reader = new FileReader();
    reader.onload = e => setPreview(e.target?.result as string);
    reader.readAsDataURL(file);

    setUploading(true);
    const ext  = file.name.split('.').pop() ?? 'jpg';
    const path = `${userId}/avatar.${ext}`;

    const { error } = await supabase.storage
      .from('avatars')
      .upload(path, file, { upsert: true, contentType: file.type });

    if (error) {
      alert('Erro ao enviar foto. Tente novamente.');
      setUploading(false);
      return;
    }

    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path);

    // Adiciona timestamp para invalidar cache
    const urlWithTs = `${publicUrl}?t=${Date.now()}`;

    await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', userId);
    onUploaded(urlWithTs);
    setPreview(urlWithTs);
    setUploading(false);
  }

  return (
    <div className="relative shrink-0 group">
      {/* Avatar */}
      <div
        className={`${dim} rounded-2xl overflow-hidden cursor-pointer border-2 border-transparent group-hover:border-brand-500 transition`}
        onClick={() => inputRef.current?.click()}
      >
        {preview ? (
          <img src={preview} alt="Avatar" className="w-full h-full object-cover" />
        ) : (
          <div className={`w-full h-full flex items-center justify-center font-bold ${text} ${
            dark ? 'bg-brand-500 text-white' : 'bg-brand-500 text-white'
          }`}>
            {initials}
          </div>
        )}

        {/* Overlay hover */}
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center rounded-2xl">
          <span className="text-white text-xs font-bold text-center leading-tight px-1">
            {uploading ? '…' : '📷 Foto'}
          </span>
        </div>

        {/* Spinner */}
        {uploading && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center rounded-2xl">
            <div className="h-5 w-5 rounded-full border-2 border-white border-t-transparent animate-spin" />
          </div>
        )}
      </div>

      {/* Badge de câmera */}
      <div
        className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full bg-brand-500 border-2 border-white flex items-center justify-center cursor-pointer shadow"
        onClick={() => inputRef.current?.click()}
      >
        <span className="text-[10px]">📷</span>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}
      />
    </div>
  );
}
