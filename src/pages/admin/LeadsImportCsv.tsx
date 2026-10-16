import { ChangeEvent, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AdminLayout from '@/components/layout/AdminLayout';
import { supabase } from '@/lib/supabase';
import { mapHeaders, normalizeIntent, parseCsv } from '@/lib/csvParser';

type DefaultIntent = 'mechanic' | 'workshop';

interface PreviewRow {
  idx:    number;
  name:   string;
  email:  string;
  phone:  string;
  intent: DefaultIntent;
  cidade: string | null;
  estado: string | null;
  notas:  string | null;
  valido: boolean;
  erro:   string | null;
  duplicado: boolean;
}

const SAMPLE = `nome,telefone,email,cidade,uf,tipo
Oficina do João,11987654321,joao@oficina.com,São Paulo,SP,oficina
Carlos Mecânico,11999887766,carlos@gmail.com,Guarulhos,SP,mecanico
Auto Center Alpha,11955443322,contato@alpha.com,Osasco,SP,oficina`;

export default function AdminLeadsImportCsv() {
  const nav = useNavigate();
  const [raw, setRaw] = useState('');
  const [defaultIntent, setDefaultIntent] = useState<DefaultIntent>('workshop');
  const [importing, setImporting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [importedCount, setImportedCount] = useState<number | null>(null);
  const [existingPhones, setExistingPhones] = useState<Set<string>>(new Set());
  const [checkingDupes, setCheckingDupes] = useState(false);

  function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setRaw(String(reader.result ?? ''));
    reader.readAsText(file, 'utf-8');
    setImportedCount(null); setErr(null);
  }

  const parsed = useMemo(() => raw.trim() ? parseCsv(raw) : null, [raw]);
  const mapping = useMemo(() => parsed ? mapHeaders(parsed.headers) : null, [parsed]);

  const preview: PreviewRow[] = useMemo(() => {
    if (!parsed || !mapping) return [];
    return parsed.rows.map((r, idx): PreviewRow => {
      const nome    = (mapping.name   !== null ? r[mapping.name]   : '').trim();
      const email   = (mapping.email  !== null ? r[mapping.email]  : '').trim();
      const phone   = (mapping.phone  !== null ? r[mapping.phone]  : '').trim();
      const cidade  =  mapping.cidade !== null ? r[mapping.cidade].trim() : '';
      const estado  = (mapping.estado !== null ? r[mapping.estado] : '').trim().toUpperCase().slice(0, 2);
      const intent  = normalizeIntent(mapping.intent !== null ? r[mapping.intent] : undefined, defaultIntent);
      const notas   =  mapping.notas  !== null ? r[mapping.notas].trim() : '';

      let valido = true; let erro: string | null = null;
      if (!nome) { valido = false; erro = 'Falta nome'; }
      else if (!email && !phone) { valido = false; erro = 'Falta e-mail ou telefone'; }

      const digits = phone.replace(/\D/g, '');
      const duplicado = !!digits && existingPhones.has(digits);

      return { idx, name: nome, email, phone, intent, cidade: cidade || null, estado: estado || null, notas: notas || null, valido, erro, duplicado };
    });
  }, [parsed, mapping, defaultIntent, existingPhones]);

  async function verificarDuplicados() {
    const phones = preview.map(p => p.phone.replace(/\D/g, '')).filter(Boolean);
    if (!phones.length) return;
    setCheckingDupes(true);
    const { data } = await supabase.from('leads').select('phone').in('phone', phones);
    const set = new Set((data ?? []).map((r: { phone: string }) => (r.phone ?? '').replace(/\D/g, '')));
    setExistingPhones(set);
    setCheckingDupes(false);
  }

  const importaveis = preview.filter(p => p.valido && !p.duplicado);
  const invalidos   = preview.filter(p => !p.valido);
  const duplicados  = preview.filter(p => p.duplicado && p.valido);

  async function importar() {
    if (!importaveis.length) return;
    setImporting(true); setErr(null);

    const payload = importaveis.map(p => ({
      name: p.name,
      email: p.email || `csv-${Date.now()}-${p.idx}@mecanicoapp.lead`,
      phone: p.phone || '—',
      intent: p.intent,
      consent: true,
      origem: 'importado_csv' as const,
      status: 'lead_novo' as const,
      cidade: p.cidade,
      estado: p.estado,
      notas: p.notas,
      tags: ['csv_import'],
    }));

    const { data, error } = await supabase.from('leads').insert(payload).select('id');
    if (error) {
      setErr(error.message);
      setImporting(false);
      return;
    }
    setImportedCount(data?.length ?? payload.length);
    setImporting(false);
    setRaw(''); // limpa pra evitar reimportar sem querer
    setExistingPhones(new Set());
  }

  return (
    <AdminLayout>
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <Link to="/admin/leads" className="text-xs text-steel-500 hover:text-brand-500 mb-1 inline-block">← Pipeline de Leads</Link>
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">Importar leads por CSV</h1>
          <p className="text-steel-500 text-sm mt-1">Cole uma lista ou envie um arquivo. Nós fazemos o mapeamento das colunas automaticamente.</p>
        </div>
      </div>

      {importedCount !== null && (
        <div className="bg-signal-500/10 border border-signal-300 rounded-xl px-4 py-3 text-sm text-signal-700 mb-4 flex items-center justify-between">
          <span>✅ <b>{importedCount}</b> lead{importedCount === 1 ? '' : 's'} importado{importedCount === 1 ? '' : 's'} com sucesso.</span>
          <button onClick={() => nav('/admin/leads')} className="font-bold text-signal-800 hover:text-signal-900 underline">
            Ver no pipeline →
          </button>
        </div>
      )}

      <div className="bg-white border border-steel-200 rounded-2xl p-5 mb-4">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div>
            <h3 className="font-bold text-steel-800 mb-2">1. Envie seu CSV</h3>
            <div className="flex items-center gap-3 mb-2">
              <label className="cursor-pointer bg-brand-500 hover:bg-brand-600 text-white font-bold text-sm px-4 py-2 rounded-xl inline-block">
                📁 Escolher arquivo
                <input type="file" accept=".csv,text/csv,text/plain" onChange={onFile} className="hidden" />
              </label>
              <span className="text-xs text-steel-500">ou cole o conteúdo direto abaixo</span>
            </div>
            <textarea
              value={raw}
              onChange={e => { setRaw(e.target.value); setImportedCount(null); setErr(null); }}
              rows={8}
              placeholder={SAMPLE}
              className="w-full px-3 py-2 border border-steel-200 rounded-lg text-xs font-mono resize-none focus:outline-none focus:border-brand-500"
            />
          </div>
          <div>
            <h3 className="font-bold text-steel-800 mb-2">2. Configuração</h3>
            <label className="flex flex-col gap-1 mb-3">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-steel-500">Tipo padrão (se o CSV não tiver coluna "tipo")</span>
              <select value={defaultIntent} onChange={e => setDefaultIntent(e.target.value as DefaultIntent)}
                className="px-3 py-2 border border-steel-200 rounded-lg text-sm bg-white">
                <option value="workshop">🏭 Oficina</option>
                <option value="mechanic">🔧 Mecânico</option>
              </select>
            </label>
            <div className="bg-steel-50 border border-steel-200 rounded-xl p-3 text-xs text-steel-600">
              <div className="font-bold text-steel-800 mb-1.5">📋 Colunas reconhecidas:</div>
              <div className="space-y-0.5">
                <div><code className="bg-white px-1 rounded">nome</code> / name / razaosocial / empresa <span className="text-alert-600">*</span></div>
                <div><code className="bg-white px-1 rounded">telefone</code> / phone / celular / whatsapp / fone</div>
                <div><code className="bg-white px-1 rounded">email</code> / mail</div>
                <div><code className="bg-white px-1 rounded">cidade</code> / city / municipio</div>
                <div><code className="bg-white px-1 rounded">uf</code> / estado / state</div>
                <div><code className="bg-white px-1 rounded">tipo</code> → "mecanico" ou "oficina"</div>
                <div><code className="bg-white px-1 rounded">notas</code> / obs / observacao</div>
              </div>
              <div className="mt-2 text-[11px] text-steel-500"><span className="text-alert-600 font-bold">*</span> nome é obrigatório · precisa de telefone <b>ou</b> e-mail</div>
            </div>
          </div>
        </div>
      </div>

      {parsed && parsed.errors.length > 0 && (
        <div className="bg-pending-500/10 border border-pending-300 rounded-xl px-4 py-3 text-xs text-pending-800 mb-4">
          <b>Avisos ao ler o arquivo:</b>
          <ul className="list-disc pl-5 mt-1 space-y-0.5">
            {parsed.errors.slice(0, 5).map((e, i) => <li key={i}>{e}</li>)}
            {parsed.errors.length > 5 && <li>…e mais {parsed.errors.length - 5}</li>}
          </ul>
        </div>
      )}

      {err && (
        <div className="bg-alert-50 border border-alert-200 rounded-xl px-4 py-3 text-sm text-alert-700 mb-4">{err}</div>
      )}

      {parsed && mapping && (
        <>
          <div className="bg-white border border-steel-200 rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-steel-200 bg-steel-50 flex-wrap gap-2">
              <div className="text-sm">
                <b>{preview.length}</b> linhas · <b className="text-signal-700">{importaveis.length}</b> prontas ·
                {duplicados.length > 0 && <> <b className="text-pending-700">{duplicados.length}</b> duplicadas · </>}
                {invalidos.length > 0 && <> <b className="text-alert-700">{invalidos.length}</b> inválidas</>}
              </div>
              <div className="flex gap-2">
                <button onClick={verificarDuplicados} disabled={checkingDupes || !preview.length}
                  className="text-xs font-semibold text-steel-700 border border-steel-300 hover:bg-steel-100 px-3 py-1.5 rounded-lg disabled:opacity-50">
                  {checkingDupes ? 'Verificando…' : '🔍 Verificar duplicados'}
                </button>
                <button onClick={importar} disabled={!importaveis.length || importing}
                  className="bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white font-bold text-sm rounded-lg px-4 py-1.5">
                  {importing ? 'Importando…' : `Importar ${importaveis.length} lead${importaveis.length === 1 ? '' : 's'}`}
                </button>
              </div>
            </div>

            {mapping.name === null && (
              <div className="bg-alert-50 border-b border-alert-200 px-4 py-2 text-xs text-alert-700">
                ⚠️ Nenhuma coluna de "nome" reconhecida. Ajuste o cabeçalho do CSV para incluir uma coluna chamada "nome" ou "name".
              </div>
            )}

            <div className="overflow-x-auto max-h-[500px]">
              <table className="w-full text-sm">
                <thead className="bg-steel-50 text-steel-600 text-xs uppercase tracking-wider sticky top-0">
                  <tr>
                    <th className="text-left px-3 py-2 w-10">#</th>
                    <th className="text-left px-3 py-2">Nome</th>
                    <th className="text-left px-3 py-2">Tipo</th>
                    <th className="text-left px-3 py-2">Telefone</th>
                    <th className="text-left px-3 py-2">E-mail</th>
                    <th className="text-left px-3 py-2">Cidade/UF</th>
                    <th className="text-left px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-steel-100">
                  {preview.map(p => {
                    const bg = !p.valido ? 'bg-alert-50/50' : p.duplicado ? 'bg-pending-500/5' : '';
                    return (
                      <tr key={p.idx} className={bg}>
                        <td className="px-3 py-2 text-steel-400 text-xs">{p.idx + 2}</td>
                        <td className="px-3 py-2 font-semibold text-steel-800 truncate max-w-[180px]">{p.name || <span className="text-steel-400 italic">—</span>}</td>
                        <td className="px-3 py-2 text-xs">{p.intent === 'mechanic' ? '🔧 Mec.' : '🏭 Oficina'}</td>
                        <td className="px-3 py-2 text-xs text-steel-600">{p.phone || '—'}</td>
                        <td className="px-3 py-2 text-xs text-steel-600 truncate max-w-[200px]">{p.email || '—'}</td>
                        <td className="px-3 py-2 text-xs text-steel-600">{p.cidade ?? ''}{p.estado ? `/${p.estado}` : ''}</td>
                        <td className="px-3 py-2 text-xs">
                          {!p.valido
                            ? <span className="text-alert-700 font-bold">❌ {p.erro}</span>
                            : p.duplicado
                              ? <span className="text-pending-700 font-bold">⚠️ Já existe</span>
                              : <span className="text-signal-700 font-bold">✓ Pronto</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {!parsed && !raw && (
        <div className="bg-steel-50 border border-steel-200 rounded-2xl p-10 text-center">
          <div className="text-5xl mb-2">📥</div>
          <p className="text-steel-600 text-sm">Escolha um arquivo CSV ou cole o conteúdo acima.</p>
          <details className="mt-4 inline-block text-left">
            <summary className="text-xs text-brand-600 cursor-pointer font-semibold">Ver exemplo de formato</summary>
            <pre className="mt-2 text-[11px] bg-white p-3 rounded-lg border border-steel-200 text-steel-700 font-mono">{SAMPLE}</pre>
          </details>
        </div>
      )}
    </AdminLayout>
  );
}
