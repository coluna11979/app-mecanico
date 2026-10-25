import { useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { Lead } from '@/types/database';

export function MergeLeadsModal({
  leads,
  onClose,
  onMerged,
}: {
  leads: Lead[];
  onClose: () => void;
  onMerged: () => void;
}) {
  const [primaryId, setPrimaryId] = useState(leads[0]?.id ?? '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const primary = leads.find(l => l.id === primaryId);
  const outros  = leads.filter(l => l.id !== primaryId);

  const preview = useMemo(() => {
    if (!primary) return null;
    const fill = <K extends keyof Lead>(k: K): Lead[K] => {
      if (primary[k]) return primary[k];
      for (const o of outros) if (o[k]) return o[k];
      return primary[k];
    };
    const notasConcat = [primary.notas, ...outros.map(o => o.notas)].filter(Boolean).join('\n---\n');
    const tagsUnion = Array.from(new Set([...(primary.tags ?? []), ...outros.flatMap(o => o.tags ?? [])]));
    return {
      name:    primary.name,
      email:   fill('email'),
      phone:   fill('phone'),
      cidade:  fill('cidade'),
      estado:  fill('estado'),
      intent:  primary.intent,
      origem:  primary.origem,
      status:  primary.status,
      notas:   notasConcat || null,
      tags:    tagsUnion,
    };
  }, [primary, outros]);

  async function merge() {
    if (!primary || !preview) return;
    setSaving(true); setErr(null);

    // 1. Atualiza o primário com os campos consolidados
    const { error: upErr } = await supabase
      .from('leads')
      .update(preview)
      .eq('id', primary.id);
    if (upErr) { setErr(upErr.message); setSaving(false); return; }

    // 2. Deleta os outros
    const { error: delErr } = await supabase
      .from('leads')
      .delete()
      .in('id', outros.map(o => o.id));
    if (delErr) { setErr(delErr.message); setSaving(false); return; }

    onMerged();
  }

  if (!primary) return null;

  return (
    <div className="fixed inset-0 bg-steel-900/60 z-50 grid place-items-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
        <div className="p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-xl font-bold">Mesclar {leads.length} leads</h2>
              <p className="text-sm text-steel-500">O primário fica. Os outros são removidos, mas seus dados são preservados.</p>
            </div>
            <button type="button" onClick={onClose} className="text-steel-500 hover:text-steel-800 text-2xl leading-none">×</button>
          </div>

          {/* Seletor de primário */}
          <div className="mb-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-steel-500 mb-2">1. Qual é o primário?</p>
            <div className="space-y-2">
              {leads.map(l => (
                <label key={l.id} className={`flex items-start gap-3 p-3 border-2 rounded-xl cursor-pointer transition ${primaryId === l.id ? 'border-brand-500 bg-brand-50' : 'border-steel-200 hover:border-steel-300'}`}>
                  <input type="radio" name="primary" checked={primaryId === l.id} onChange={() => setPrimaryId(l.id)}
                    className="mt-0.5 h-4 w-4 accent-brand-500" />
                  <div className="flex-1 min-w-0 text-sm">
                    <div className="font-bold text-steel-800">{l.name}</div>
                    <div className="text-xs text-steel-500 mt-0.5">
                      {l.phone && l.phone !== '—' && <>📱 {l.phone} · </>}
                      {l.email && !l.email.endsWith('.lead') && <>✉️ {l.email} · </>}
                      {l.cidade && <>📍 {l.cidade}{l.estado ? `/${l.estado}` : ''} · </>}
                      criado {new Date(l.created_at).toLocaleDateString('pt-BR')}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Preview do merge */}
          {preview && (
            <div className="mb-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-steel-500 mb-2">2. Resultado final</p>
              <div className="bg-steel-50 border border-steel-200 rounded-xl p-4 text-sm space-y-1.5">
                <Row k="Nome"     v={preview.name} />
                <Row k="Telefone" v={preview.phone} />
                <Row k="E-mail"   v={preview.email} />
                <Row k="Cidade"   v={[preview.cidade, preview.estado].filter(Boolean).join('/')} />
                {preview.tags.length > 0 && (
                  <div className="flex gap-2">
                    <span className="text-xs font-semibold text-steel-500 min-w-[70px]">Tags</span>
                    <div className="flex flex-wrap gap-1">
                      {preview.tags.map(t => <span key={t} className="text-[10px] bg-brand-50 border border-brand-200 text-brand-700 rounded-full px-1.5 py-0.5">{t}</span>)}
                    </div>
                  </div>
                )}
                {preview.notas && (
                  <div className="flex gap-2 pt-2 border-t border-steel-200 mt-2">
                    <span className="text-xs font-semibold text-steel-500 min-w-[70px]">Notas</span>
                    <pre className="text-xs text-steel-700 whitespace-pre-wrap font-sans flex-1">{preview.notas}</pre>
                  </div>
                )}
              </div>
            </div>
          )}

          {err && <p className="mt-3 text-sm text-alert-700 bg-alert-50 border border-alert-200 rounded-lg px-3 py-2">{err}</p>}

          <div className="flex items-center justify-end gap-2 mt-5">
            <button type="button" onClick={onClose}
              className="px-4 py-2 rounded-xl text-sm font-semibold text-steel-700 hover:bg-steel-100">
              Cancelar
            </button>
            <button type="button" onClick={merge} disabled={saving}
              className="px-5 py-2 rounded-xl text-sm font-bold bg-brand-500 hover:bg-brand-600 text-white disabled:opacity-50">
              {saving ? 'Mesclando…' : `Mesclar e remover ${outros.length}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string | null | undefined }) {
  if (!v) return null;
  return (
    <div className="flex gap-2">
      <span className="text-xs font-semibold text-steel-500 min-w-[70px]">{k}</span>
      <span className="text-sm text-steel-800">{v}</span>
    </div>
  );
}
