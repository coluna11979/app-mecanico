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
  { key: 'support_email',          label: 'Email de suporte',          description: 'Email exibido para usuários em caso de dúvida.',             section: 'Geral' },
  { key: 'app_public_url',         label: 'URL pública do app',        description: 'Usada nos links dos emails (ex: https://mecanicoapp.com.br).', section: 'Geral' },
  { key: 'maintenance_mode',       label: 'Modo manutenção',           description: 'Bloqueia o acesso de todos os usuários.',   type: 'toggle',   section: 'Geral' },
  { key: 'platform_fee_percent',   label: 'Taxa da plataforma (%)',    description: 'Comissão cobrada do mecânico por job.',     type: 'number',   section: 'Financeiro' },
  { key: 'stripe_publishable_key', label: 'Chave pública',             description: 'Usada no frontend (Stripe Elements).',     type: 'key',      section: 'Stripe' },
  { key: 'stripe_secret_key',      label: 'Chave secreta',             description: 'Usada nas Edge Functions.',                type: 'password', section: 'Stripe' },
  { key: 'stripe_webhook_secret',  label: 'Webhook secret',            description: 'Valida eventos recebidos do Stripe.',      type: 'password', section: 'Stripe' },
  { key: 'mapbox_token',           label: 'Token público',             description: 'Usado nos mapas de rastreamento.',         type: 'key',      section: 'Mapas' },
  { key: 'resend_api_key',         label: 'API Key (re_...)',          description: 'Crie em resend.com/api-keys (free tier 3000 emails/mês).', type: 'password', section: 'Email (Resend)' },
  { key: 'resend_from_email',      label: 'Email remetente',           description: 'Precisa ter o domínio verificado no Resend (ex: noreply@mecanicoapp.com.br).', section: 'Email (Resend)' },
];

type Section = { label: string; icon: string; color: string; bg: string };
const SECTIONS: Record<string, Section> = {
  Geral:             { label: 'Geral',           icon: '⚙️',  color: 'text-steel-600',  bg: 'bg-steel-100'  },
  Financeiro:        { label: 'Financeiro',      icon: '💰',  color: 'text-signal-700', bg: 'bg-signal-50'  },
  Stripe:            { label: 'Stripe',          icon: '💳',  color: 'text-brand-700',  bg: 'bg-brand-50'   },
  Mapas:             { label: 'Mapas',           icon: '🗺️',  color: 'text-steel-600',  bg: 'bg-steel-100'  },
  'Email (Resend)':  { label: 'Email (Resend)',  icon: '📧',  color: 'text-pending-700', bg: 'bg-pending-500/10' },
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
    if (error) setErrors(e => ({ ...e, [key]: 'Erro ao salvar.' }));
    else setSavedAt(s => ({ ...s, [key]: Date.now() }));
    setSaving(null);
  }

  const isSaved = (key: string) => !!savedAt[key] && Date.now() - savedAt[key] < 3000;

  const sections = Array.from(new Set(FIELDS.map(f => f.section)));

  return (
    <AdminLayout>
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Configurações</h1>
        <p className="text-steel-500 text-sm mt-1">Gerencie chaves e parâmetros do sistema. Nada está hardcoded no código.</p>
      </div>

      <div className="max-w-2xl space-y-5">
        {sections.map(sec => {
          const meta = SECTIONS[sec];
          const fields = FIELDS.filter(f => f.section === sec);
          return (
            <div key={sec} className="bg-white rounded-2xl border border-steel-200 shadow-sm overflow-hidden">

              {/* Cabeçalho */}
              <div className={`flex items-center gap-2.5 px-5 py-3.5 border-b border-steel-100 ${meta.bg}`}>
                <span className="text-base leading-none">{meta.icon}</span>
                <span className={`text-xs font-bold uppercase tracking-widest ${meta.color}`}>{meta.label}</span>
              </div>

              {/* Alerta Stripe */}
              {sec === 'Stripe' && (
                <div className="mx-5 mt-4 bg-brand-50 border border-brand-200 rounded-xl px-4 py-2.5 flex gap-3 text-xs text-brand-700">
                  <span className="shrink-0 text-sm">🔒</span>
                  <span>
                    Chaves salvas aqui ficam criptografadas no banco.
                    Em produção, prefira{' '}
                    <a href="https://supabase.com/dashboard/project/qpwdwjzbgasjsnzpgcyo/settings/edge-functions"
                      target="_blank" rel="noreferrer" className="font-semibold underline">
                      Supabase → Edge Function Secrets
                    </a>.
                  </span>
                </div>
              )}

              {/* Tutorial Resend */}
              {sec === 'Email (Resend)' && (
                <div className="mx-5 mt-4 bg-pending-500/10 border border-pending-300 rounded-xl px-4 py-3 text-xs text-steel-700 space-y-1.5">
                  <p className="font-bold text-pending-700 flex items-center gap-1.5">📋 Passo a passo</p>
                  <ol className="list-decimal pl-5 space-y-0.5">
                    <li>Crie conta gratuita em <a href="https://resend.com" target="_blank" rel="noreferrer" className="text-brand-600 font-semibold underline">resend.com</a></li>
                    <li>Em <a href="https://resend.com/domains" target="_blank" rel="noreferrer" className="text-brand-600 font-semibold underline">Domains</a>, adicione <code className="bg-white px-1.5 py-0.5 rounded">mecanicoapp.com.br</code> e configure os DNS (SPF + DKIM)</li>
                    <li>Em <a href="https://resend.com/api-keys" target="_blank" rel="noreferrer" className="text-brand-600 font-semibold underline">API Keys</a>, crie uma key (escolha "Sending access" + seu domínio)</li>
                    <li>Cole a key abaixo (formato <code className="bg-white px-1.5 py-0.5 rounded">re_xxx</code>)</li>
                    <li>Defina o email remetente — ex: <code className="bg-white px-1.5 py-0.5 rounded">noreply@mecanicoapp.com.br</code></li>
                  </ol>
                  <p className="text-[11px] text-steel-500 pt-1">
                    Free tier: 3000 emails/mês · 100/dia. Suficiente pra começar.
                  </p>
                </div>
              )}

              {/* Campos */}
              <div className="divide-y divide-steel-100">
                {fields.map(f => (
                  <div key={f.key} className="px-5 py-4">
                    <div className="flex items-center justify-between gap-4">

                      {/* Label + desc */}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-steel-800">{f.label}</div>
                        <div className="text-xs text-steel-400 mt-0.5">{f.description}</div>
                      </div>

                      {/* Botão salvar */}
                      <button
                        onClick={() => save(f.key)}
                        disabled={saving === f.key}
                        className={`shrink-0 text-xs font-semibold px-4 py-2 rounded-xl transition disabled:opacity-50 ${
                          isSaved(f.key)
                            ? 'bg-signal-500 text-white'
                            : 'bg-brand-500 hover:bg-brand-600 text-white'
                        }`}
                      >
                        {saving === f.key ? '…' : isSaved(f.key) ? '✓ Salvo' : 'Salvar'}
                      </button>
                    </div>

                    {/* Input */}
                    <div className="mt-3">
                      {f.type === 'toggle' ? (
                        <button
                          onClick={() => setVals(v => ({ ...v, [f.key]: v[f.key] === 'true' ? 'false' : 'true' }))}
                          className={`relative w-11 h-6 rounded-full transition-colors ${vals[f.key] === 'true' ? 'bg-alert-500' : 'bg-steel-300'}`}
                        >
                          <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${vals[f.key] === 'true' ? 'translate-x-5' : ''}`} />
                        </button>

                      ) : f.type === 'key' || f.type === 'password' ? (
                        <div className="relative">
                          <input
                            type={show[f.key] ? 'text' : 'password'}
                            className="w-full rounded-xl border border-steel-200 bg-steel-50 px-3 py-2.5 pr-10 text-xs font-mono text-steel-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition"
                            value={vals[f.key] ?? ''}
                            onChange={e => setVals(v => ({ ...v, [f.key]: e.target.value }))}
                            placeholder={f.type === 'key' ? 'pk_… ou token' : 'sk_… ou whsec_…'}
                          />
                          <button
                            type="button"
                            onClick={() => setShow(s => ({ ...s, [f.key]: !s[f.key] }))}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-steel-400 hover:text-steel-700 transition text-sm"
                            title={show[f.key] ? 'Ocultar' : 'Mostrar'}
                          >
                            {show[f.key] ? '🙈' : '👁️'}
                          </button>
                        </div>

                      ) : f.type === 'number' ? (
                        <div className="relative w-32">
                          <input
                            type="number"
                            min={0} max={100}
                            className="w-full rounded-xl border border-steel-200 bg-steel-50 px-3 py-2.5 pr-8 text-sm font-semibold text-steel-800 focus:outline-none focus:ring-2 focus:ring-brand-500 transition"
                            value={vals[f.key] ?? ''}
                            onChange={e => setVals(v => ({ ...v, [f.key]: e.target.value }))}
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-steel-400 text-xs font-bold">%</span>
                        </div>

                      ) : (
                        <input
                          type="text"
                          className="w-full rounded-xl border border-steel-200 bg-steel-50 px-3 py-2.5 text-sm text-steel-800 focus:outline-none focus:ring-2 focus:ring-brand-500 transition"
                          value={vals[f.key] ?? ''}
                          onChange={e => setVals(v => ({ ...v, [f.key]: e.target.value }))}
                        />
                      )}

                      {errors[f.key] && (
                        <p className="text-xs text-alert-600 mt-1.5 flex items-center gap-1">
                          <span>⚠️</span> {errors[f.key]}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </AdminLayout>
  );
}
