import { useEffect, useState } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { getAllSettings, setSetting, clearSettingsCache } from '@/lib/settings';
import type { AppSetting } from '@/types/database';

interface FieldDef {
  key: string; label: string; description: string;
  type?: 'text' | 'password' | 'number' | 'toggle' | 'key';
  section: string;
}

const FIELDS: FieldDef[] = [
  // Geral
  { key: 'support_email',          label: 'Email de suporte',           description: 'Email exibido para usuários em caso de dúvida.',                                   section: 'Geral' },
  { key: 'maintenance_mode',       label: 'Modo manutenção',            description: 'Bloqueia o acesso ao app para manutenção.',          type: 'toggle',  section: 'Geral' },
  // Financeiro
  { key: 'platform_fee_percent',   label: 'Taxa da plataforma (%)',     description: 'Comissão cobrada do mecânico ao concluir o job.',    type: 'number',  section: 'Financeiro' },
  // Stripe
  { key: 'stripe_publishable_key', label: 'Chave pública (pk_…)',       description: 'Usada no frontend para Stripe Elements.',            type: 'key',     section: 'Stripe' },
  { key: 'stripe_secret_key',      label: 'Chave secreta (sk_…)',       description: 'Usada nas Edge Functions para criar pagamentos.',    type: 'password', section: 'Stripe' },
  { key: 'stripe_webhook_secret',  label: 'Webhook secret (whsec_…)',  description: 'Valida eventos recebidos do Stripe.',                type: 'password', section: 'Stripe' },
  // Mapbox
  { key: 'mapbox_token',           label: 'Token Mapbox',               description: 'Usado nos mapas de rastreamento.',                  type: 'key',     section: 'Mapas' },
];

const SECTION_ICONS: Record<string, string> = {
  Geral: '⚙️', Financeiro: '💰', Stripe: '💳', Mapas: '🗺️',
};

export default function AdminSettings() {
  const [vals, setVals]       = useState<Record<string, string>>({});
  const [saving, setSaving]   = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Record<string, number>>({});
  const [errors, setErrors]   = useState<Record<string, string>>({});
  const [show, setShow]       = useState<Record<string, boolean>>({});

  useEffect(() => {
    getAllSettings().then(({ data }) => {
      const m: Record<string, string> = {};
      (data as AppSetting[]).forEach(s => { m[s.key] = s.value; });
      setVals(m);
    });
  }, []);

  async function save(key: string) {
    setSaving(key);
    setErrors(e => ({ ...e, [key]: '' }));
    const def = FIELDS.find(f => f.key === key);
    const { error } = await setSetting(key, vals[key] ?? '', def?.description);
    clearSettingsCache();
    if (error) setErrors(e => ({ ...e, [key]: 'Erro ao salvar. Verifique sua sessão.' }));
    else setSavedAt(s => ({ ...s, [key]: Date.now() }));
    setSaving(null);
  }

  const sections = Array.from(new Set(FIELDS.map(f => f.section)));

  return (
    <AdminLayout>
      <h1 className="text-3xl font-bold tracking-tight mb-1">Configurações</h1>
      <p className="text-steel-500 mb-8 text-sm">Tudo editável aqui — nada hardcoded no código.</p>

      <div className="space-y-6 max-w-2xl">
        {sections.map(sec => (
          <section key={sec} className="card">
            {/* Cabeçalho da seção */}
            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-steel-100">
              <span className="text-lg">{SECTION_ICONS[sec] ?? '🔧'}</span>
              <h2 className="text-sm font-bold uppercase tracking-wider text-steel-600">{sec}</h2>
            </div>

            {/* Dica Stripe */}
            {sec === 'Stripe' && (
              <div className="bg-brand-50 border border-brand-200 rounded-xl px-3 py-2.5 mb-4 flex gap-2 items-start text-xs">
                <span className="shrink-0 mt-0.5">💳</span>
                <p className="text-brand-700">
                  Chaves salvas aqui ficam seguras no banco e são lidas automaticamente pelas Edge Functions.{' '}
                  <a href="https://supabase.com/dashboard/project/qpwdwjzbgasjsnzpgcyo/settings/edge-functions"
                    target="_blank" rel="noreferrer" className="underline font-semibold">
                    Mover para Secrets (mais seguro)
                  </a>
                </p>
              </div>
            )}

            <div className="space-y-4">
              {FIELDS.filter(f => f.section === sec).map(f => (
                <div key={f.key}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <label className="font-semibold text-sm">{f.label}</label>
                      </div>
                      <p className="text-xs text-steel-400 mb-2">{f.description}</p>

                      {/* Campos por tipo */}
                      {f.type === 'toggle' ? (
                        <button
                          onClick={() => setVals(v => ({ ...v, [f.key]: v[f.key] === 'true' ? 'false' : 'true' }))}
                          className={`relative w-12 h-6 rounded-full transition ${vals[f.key] === 'true' ? 'bg-alert-500' : 'bg-steel-300'}`}
                        >
                          <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform ${vals[f.key] === 'true' ? 'translate-x-6' : ''}`} />
                        </button>
                      ) : f.type === 'key' ? (
                        /* Chaves longas: campo compacto com show/hide e truncate */
                        <div className="flex gap-2">
                          <div className="relative flex-1 min-w-0">
                            <input
                              type={show[f.key] ? 'text' : 'password'}
                              className="input font-mono text-xs pr-10 truncate"
                              value={vals[f.key] ?? ''}
                              onChange={e => setVals(v => ({ ...v, [f.key]: e.target.value }))}
                              placeholder="Cole a chave aqui…"
                            />
                            <button
                              type="button"
                              onClick={() => setShow(s => ({ ...s, [f.key]: !s[f.key] }))}
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-steel-400 hover:text-steel-700 text-xs"
                            >
                              {show[f.key] ? '🙈' : '👁️'}
                            </button>
                          </div>
                        </div>
                      ) : f.type === 'password' ? (
                        <div className="relative">
                          <input
                            type={show[f.key] ? 'text' : 'password'}
                            className="input font-mono text-xs pr-10"
                            value={vals[f.key] ?? ''}
                            onChange={e => setVals(v => ({ ...v, [f.key]: e.target.value }))}
                            placeholder="Cole o secret aqui…"
                          />
                          <button
                            type="button"
                            onClick={() => setShow(s => ({ ...s, [f.key]: !s[f.key] }))}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-steel-400 hover:text-steel-700 text-xs"
                          >
                            {show[f.key] ? '🙈' : '👁️'}
                          </button>
                        </div>
                      ) : (
                        <input
                          type={f.type ?? 'text'}
                          className="input text-sm"
                          value={vals[f.key] ?? ''}
                          onChange={e => setVals(v => ({ ...v, [f.key]: e.target.value }))}
                        />
                      )}

                      {errors[f.key] && <p className="text-xs text-alert-600 mt-1">{errors[f.key]}</p>}
                    </div>

                    <button
                      onClick={() => save(f.key)}
                      disabled={saving === f.key}
                      className="btn-primary text-xs shrink-0 mt-6 disabled:opacity-60"
                    >
                      {saving === f.key
                        ? '…'
                        : savedAt[f.key] && Date.now() - savedAt[f.key] < 3000
                          ? '✓'
                          : 'Salvar'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </AdminLayout>
  );
}
