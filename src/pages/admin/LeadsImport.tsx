import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AdminLayout from '@/components/layout/AdminLayout';
import { supabase } from '@/lib/supabase';
import { getSetting } from '@/lib/settings';
import { parseCidadeUf, PlaceResult, searchPlaces } from '@/lib/googlePlaces';

const UFS = ['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO'];

const TIPO_QUERIES = [
  { key: 'oficina mecânica',     label: '🏭 Oficinas mecânicas',   intent: 'workshop' as const },
  { key: 'mecânico automotivo',  label: '🔧 Mecânicos (autônomos)', intent: 'mechanic' as const },
  { key: 'auto elétrica',        label: '⚡ Auto elétricas',        intent: 'workshop' as const },
  { key: 'funilaria e pintura',  label: '🎨 Funilarias',           intent: 'workshop' as const },
  { key: 'borracharia',          label: '🛞 Borracharias',          intent: 'workshop' as const },
];

export default function AdminLeadsImport() {
  const nav = useNavigate();
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [tipoIdx, setTipoIdx] = useState(0);
  const [cidade, setCidade] = useState('');
  const [uf, setUf] = useState('SP');
  const [termoExtra, setTermoExtra] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [existentes, setExistentes] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const [importedCount, setImportedCount] = useState<number | null>(null);

  useEffect(() => {
    getSetting('google_places_api_key', '').then(k => setApiKey(k || null));
  }, []);

  async function buscar(e: FormEvent) {
    e.preventDefault();
    if (!apiKey) { setErr('Configure a API Key do Google Places em Configurações primeiro.'); return; }
    if (!cidade.trim()) { setErr('Informe a cidade.'); return; }
    setLoading(true); setErr(null); setImportedCount(null); setSelected(new Set());

    const tipo = TIPO_QUERIES[tipoIdx];
    const query = [tipo.key, termoExtra.trim(), cidade.trim(), uf].filter(Boolean).join(' ');

    try {
      const places = await searchPlaces({ apiKey, query, maxResults: 20 });
      setResults(places);

      // Marca os que já existem como leads (por telefone ou nome)
      const phones = places.map(p => (p.telefone ?? '').replace(/\D/g, '')).filter(Boolean);
      if (phones.length) {
        const { data } = await supabase.from('leads').select('phone').in('phone', phones);
        const existentesPhones = new Set((data ?? []).map((r: { phone: string }) => (r.phone ?? '').replace(/\D/g, '')));
        setExistentes(existentesPhones);
      } else {
        setExistentes(new Set());
      }

      // Pré-seleciona todos que ainda não existem
      const auto = new Set<string>();
      places.forEach(p => {
        const digits = (p.telefone ?? '').replace(/\D/g, '');
        if (!digits || !existentes.has(digits)) auto.add(p.placeId);
      });
      setSelected(auto);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erro na busca');
    }
    setLoading(false);
  }

  function toggleAll() {
    if (selected.size === results.length) setSelected(new Set());
    else setSelected(new Set(results.map(r => r.placeId)));
  }

  function toggle(placeId: string) {
    setSelected(prev => {
      const n = new Set(prev);
      if (n.has(placeId)) n.delete(placeId); else n.add(placeId);
      return n;
    });
  }

  async function importar() {
    if (!selected.size) return;
    setImporting(true); setErr(null);

    const tipo = TIPO_QUERIES[tipoIdx];
    const payload = results
      .filter(r => selected.has(r.placeId))
      .map(r => {
        const parsed = parseCidadeUf(r.endereco);
        return {
          name: r.nome,
          email: `${r.placeId}@google-places.lead`, // email obrigatório; usa placeId como placeholder único
          phone: r.telefone ?? '—',
          intent: tipo.intent,
          origem: 'google_maps' as const,
          status: 'lead_novo' as const,
          consent: true,
          cidade: parsed.cidade ?? cidade,
          estado: parsed.estado ?? uf,
          notas: [
            `Importado do Google Places (${new Date().toLocaleDateString('pt-BR')})`,
            r.rating ? `⭐ ${r.rating} (${r.reviews ?? 0} avaliações)` : null,
            r.endereco ? `📍 ${r.endereco}` : null,
            r.mapsUrl ? `🗺️ ${r.mapsUrl}` : null,
          ].filter(Boolean).join('\n'),
          tags: ['google_places', tipo.key],
        };
      });

    const { error, data } = await supabase.from('leads').insert(payload).select('id');
    if (error) {
      setErr(error.message);
      setImporting(false);
      return;
    }
    setImportedCount(data?.length ?? payload.length);
    setImporting(false);
    setSelected(new Set());
  }

  return (
    <AdminLayout>
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <Link to="/admin/leads" className="text-xs text-steel-500 hover:text-brand-500 mb-1 inline-block">← Pipeline de Leads</Link>
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">Captação ativa — Google Places</h1>
          <p className="text-steel-500 text-sm mt-1">Busque oficinas e mecânicos por cidade e importe em lote como leads.</p>
        </div>
      </div>

      {apiKey === null ? (
        <div className="bg-steel-100 border border-steel-200 rounded-2xl p-10 text-center text-steel-500 text-sm">Carregando configuração…</div>
      ) : !apiKey ? (
        <div className="bg-pending-500/10 border border-pending-300 rounded-2xl p-6">
          <h2 className="font-bold text-pending-800 text-lg mb-2">⚠️ API Key não configurada</h2>
          <p className="text-sm text-steel-700 mb-3">
            Para usar a busca ativa, você precisa:
          </p>
          <ol className="text-sm text-steel-700 list-decimal pl-5 space-y-1 mb-4">
            <li>Criar uma chave no <a href="https://console.cloud.google.com/google/maps-apis/credentials" target="_blank" rel="noreferrer" className="text-brand-600 font-semibold underline">Google Cloud Console</a></li>
            <li>Habilitar <b>Places API (New)</b> no projeto</li>
            <li>Em "Restrict key", escolher <b>HTTP referrers</b> e adicionar seu domínio (ex: <code className="bg-white px-1 rounded">mecanicoapp.com.br/*</code>)</li>
            <li>Colar a key em <Link to="/admin/configuracoes" className="text-brand-600 font-semibold underline">Configurações → Captação (Google Places)</Link></li>
          </ol>
          <p className="text-xs text-steel-500">
            <b>Custo:</b> Google oferece US$ 200/mês grátis. Cada busca Text Search custa ~US$ 0,032 — dá pra fazer ~6.000 buscas/mês dentro do free tier.
          </p>
        </div>
      ) : (
        <>
          {/* Form de busca */}
          <form onSubmit={buscar} className="bg-white border border-steel-200 rounded-2xl p-5 mb-4">
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
              <label className="lg:col-span-2 flex flex-col gap-1">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-steel-500">O que buscar</span>
                <select value={tipoIdx} onChange={e => setTipoIdx(Number(e.target.value))}
                  className="px-3 py-2 border border-steel-200 rounded-lg text-sm bg-white">
                  {TIPO_QUERIES.map((t, i) => <option key={i} value={i}>{t.label}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-steel-500">Cidade</span>
                <input value={cidade} onChange={e => setCidade(e.target.value)} placeholder="Ex: São Paulo"
                  className="px-3 py-2 border border-steel-200 rounded-lg text-sm" required />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-steel-500">UF</span>
                <select value={uf} onChange={e => setUf(e.target.value)}
                  className="px-3 py-2 border border-steel-200 rounded-lg text-sm bg-white">
                  {UFS.map(u => <option key={u}>{u}</option>)}
                </select>
              </label>
              <label className="lg:col-span-3 flex flex-col gap-1">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-steel-500">Termo extra (opcional)</span>
                <input value={termoExtra} onChange={e => setTermoExtra(e.target.value)} placeholder="Ex: diesel, injeção eletrônica, bairro específico…"
                  className="px-3 py-2 border border-steel-200 rounded-lg text-sm" />
              </label>
              <button type="submit" disabled={loading}
                className="bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white font-bold rounded-xl px-4 py-2 self-end">
                {loading ? 'Buscando…' : '🔍 Buscar'}
              </button>
            </div>
          </form>

          {err && (
            <div className="bg-alert-50 border border-alert-200 rounded-xl px-4 py-3 text-sm text-alert-700 mb-4">
              {err}
            </div>
          )}

          {importedCount !== null && (
            <div className="bg-signal-500/10 border border-signal-300 rounded-xl px-4 py-3 text-sm text-signal-700 mb-4 flex items-center justify-between">
              <span>✅ <b>{importedCount}</b> lead{importedCount === 1 ? '' : 's'} importado{importedCount === 1 ? '' : 's'} com sucesso.</span>
              <button onClick={() => nav('/admin/leads')} className="font-bold text-signal-800 hover:text-signal-900 underline">
                Ver no pipeline →
              </button>
            </div>
          )}

          {/* Resultados */}
          {results.length > 0 && (
            <div className="bg-white border border-steel-200 rounded-2xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-steel-200 bg-steel-50">
                <div className="text-sm">
                  <b>{results.length}</b> resultados · <b className="text-brand-600">{selected.size}</b> selecionados
                  {existentes.size > 0 && <span className="text-steel-500 ml-2">({existentes.size} já no pipeline)</span>}
                </div>
                <div className="flex gap-2">
                  <button onClick={toggleAll}
                    className="text-xs font-semibold text-steel-600 hover:text-steel-900 px-3 py-1.5 rounded-lg hover:bg-steel-100">
                    {selected.size === results.length ? 'Desmarcar todos' : 'Marcar todos'}
                  </button>
                  <button onClick={importar} disabled={!selected.size || importing}
                    className="bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white font-bold text-sm rounded-lg px-4 py-1.5">
                    {importing ? 'Importando…' : `Importar ${selected.size} como lead${selected.size === 1 ? '' : 's'}`}
                  </button>
                </div>
              </div>

              <div className="divide-y divide-steel-100">
                {results.map(r => {
                  const digits = (r.telefone ?? '').replace(/\D/g, '');
                  const jaExiste = digits && existentes.has(digits);
                  const isSel = selected.has(r.placeId);
                  return (
                    <div key={r.placeId}
                      className={`flex items-start gap-3 px-4 py-3 hover:bg-steel-50 cursor-pointer ${isSel ? 'bg-brand-50/40' : ''}`}
                      onClick={() => toggle(r.placeId)}>
                      <input type="checkbox" checked={isSel} onChange={() => toggle(r.placeId)}
                        onClick={e => e.stopPropagation()}
                        className="mt-1 h-4 w-4 accent-brand-500" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-steel-800 text-sm">{r.nome}</span>
                          {r.rating && (
                            <span className="text-xs text-pending-700 font-bold">⭐ {r.rating.toFixed(1)} ({r.reviews ?? 0})</span>
                          )}
                          {jaExiste && (
                            <span className="text-[10px] font-bold text-steel-500 bg-steel-100 border border-steel-200 rounded-full px-2 py-0.5">
                              JÁ NO PIPELINE
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-steel-500 mt-0.5">{r.endereco}</div>
                        <div className="text-xs text-steel-600 mt-1 flex gap-3 flex-wrap">
                          {r.telefone && <span>📱 {r.telefone}</span>}
                          {r.mapsUrl && (
                            <a href={r.mapsUrl} target="_blank" rel="noreferrer"
                              onClick={e => e.stopPropagation()}
                              className="text-brand-600 hover:underline">🗺️ Ver no Maps</a>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {!loading && results.length === 0 && !err && (
            <div className="bg-steel-50 border border-steel-200 rounded-2xl p-10 text-center">
              <div className="text-5xl mb-2">🔎</div>
              <p className="text-steel-600 text-sm">Preencha a busca acima e clique em "Buscar" para começar.</p>
              <p className="text-steel-500 text-xs mt-2">Dica: cada busca retorna até 20 resultados. Se precisar mais, varie o termo (bairros, especialidade).</p>
            </div>
          )}
        </>
      )}
    </AdminLayout>
  );
}
