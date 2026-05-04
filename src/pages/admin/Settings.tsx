import { useEffect, useState } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { getAllSettings, setSetting, clearSettingsCache } from '@/lib/settings';
import type { AppSetting } from '@/types/database';

interface FieldDef { key: string; label: string; description: string; type?: 'text' | 'password' | 'number' | 'toggle' | 'textarea'; section: string }

const FIELDS: FieldDef[] = [
  { key: 'platform_fee_percent', label: 'Taxa da plataforma (%)', description: 'Comissão cobrada do mecânico quando job é concluído.', type: 'number', section: 'Financeiro' },
  { key: 'pix_key',              label: 'Chave PIX da plataforma', description: 'Chave PIX que recebe os pagamentos no escrow.', section: 'Financeiro' },
  { key: 'pix_client_id',        label: 'PIX · client_id', description: 'Credencial do provedor PIX.', section: 'Financeiro' },
  { key: 'pix_client_secret',    label: 'PIX · client_secret', description: 'Credencial secreta do provedor PIX.', type: 'textarea', section: 'Financeiro' },
  { key: 'mapbox_token',         label: 'Mapbox public token', description: 'Token usado nos mapas. Cole o token completo.', type: 'textarea', section: 'Integrações' },
  { key: 'support_email',        label: 'Email de suporte', description: 'Email exibido para usuários.', section: 'Geral' },
  { key: 'maintenance_mode',     label: 'Modo manutenção', description: 'Bloqueia o acesso ao app inteiro.', type: 'toggle', section: 'Geral' },
];

export default function AdminSettings() {
  const [vals, setVals] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Record<string, number>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

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
    if (error) {
      setErrors(e => ({ ...e, [key]: 'Erro ao salvar. Verifique sua sessão de admin.' }));
    } else {
      setSavedAt(s => ({ ...s, [key]: Date.now() }));
    }
    setSaving(null);
  }

  const sections = Array.from(new Set(FIELDS.map(f => f.section)));

  return (
    <AdminLayout>
      <h1 className="text-3xl font-bold tracking-tight mb-2">Configurações</h1>
      <p className="text-steel-500 mb-8">Tudo é editável aqui — nada está hardcoded no código.</p>

      <div className="space-y-8 max-w-3xl">
        {sections.map(sec => (
          <section key={sec}>
            <h2 className="text-xs font-bold uppercase tracking-wider text-steel-500 mb-3">{sec}</h2>
            <div className="card divide-y divide-steel-100">
              {FIELDS.filter(f => f.section === sec).map(f => (
                <div key={f.key} className="py-4 first:pt-0 last:pb-0">
                  <div className="flex justify-between items-start gap-4">
                    <div className="flex-1">
                      <label className="font-semibold">{f.label}</label>
                      <div className="text-xs text-steel-500 mt-0.5">{f.description}</div>
                      <div className="mt-2">
                        {f.type === 'toggle' ? (
                          <button onClick={() => setVals(v => ({ ...v, [f.key]: v[f.key] === 'true' ? 'false' : 'true' }))}
                            className={`relative w-14 h-7 rounded-full transition ${vals[f.key] === 'true' ? 'bg-alert-500' : 'bg-steel-300'}`}>
                            <span className={`absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white transition ${vals[f.key] === 'true' ? 'translate-x-7' : ''}`} />
                          </button>
                        ) : f.type === 'textarea' ? (
                          <textarea
                            className="input font-mono text-xs resize-none"
                            rows={3}
                            value={vals[f.key] ?? ''}
                            onChange={e => setVals(v => ({ ...v, [f.key]: e.target.value }))}
                          />
                        ) : (
                          <input
                            type={f.type ?? 'text'}
                            className="input"
                            value={vals[f.key] ?? ''}
                            onChange={e => setVals(v => ({ ...v, [f.key]: e.target.value }))}
                          />
                        )}
                        {errors[f.key] && <p className="text-xs text-alert-600 mt-1">{errors[f.key]}</p>}
                      </div>
                    </div>
                    <button onClick={() => save(f.key)} disabled={saving === f.key} className="btn-primary text-xs">
                      {saving === f.key ? '…' : savedAt[f.key] && Date.now() - savedAt[f.key] < 3000 ? '✓ Salvo' : 'Salvar'}
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
