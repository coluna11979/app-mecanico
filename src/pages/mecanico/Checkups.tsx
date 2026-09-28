import { FormEvent, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import MechanicLayout from '@/components/layout/MechanicLayout';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/components/ui/Toast';
import { scoreMeta, templateRows, type VehicleCheckup } from '@/lib/checkup';
import { startDemo } from '@/lib/checkupDemo';

const EMPTY = { plate: '', make: '', model: '', year: '', km: '', customer_name: '', customer_phone: '' };

export default function MechanicCheckups() {
  const { user } = useAuth();
  const navigate = useNavigate();
  // Pré-visualização sem banco — só em dev (/demo/checkup)
  const { pathname } = useLocation();
  const demo = import.meta.env.DEV && pathname.startsWith('/demo/');
  const [list, setList]       = useState<VehicleCheckup[]>([]);
  const [loading, setLoading] = useState(!demo);
  const [showNew, setShowNew] = useState(demo);
  const [form, setForm]       = useState(EMPTY);
  const [saving, setSaving]   = useState(false);

  useEffect(() => { if (user && !demo) load(); }, [user]);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from('vehicle_checkups').select('*')
      .eq('created_by', user!.id)
      .order('created_at', { ascending: false });
    setList((data as VehicleCheckup[]) ?? []);
    setLoading(false);
  }

  async function create(e: FormEvent) {
    e.preventDefault();
    if (!form.plate.trim() && !form.model.trim()) {
      toast.error('Informe ao menos a placa ou o modelo');
      return;
    }
    const vehicle = {
      plate:          form.plate.trim().toUpperCase() || null,
      make:           form.make.trim() || null,
      model:          form.model.trim() || null,
      year:           form.year ? parseInt(form.year) : null,
      km_reading:     form.km ? parseInt(form.km.replace(/\D/g, '')) : null,
      customer_name:  form.customer_name.trim() || null,
      customer_phone: form.customer_phone.trim() || null,
    };
    if (demo) {
      startDemo(vehicle);
      navigate('/demo/checkup/demo');
      return;
    }
    setSaving(true);
    const { data: c, error } = await supabase.from('vehicle_checkups')
      .insert({ created_by: user!.id, ...vehicle }).select('id').single();
    if (error || !c) {
      setSaving(false);
      toast.error('Erro ao criar check-up');
      return;
    }
    const { error: itemsErr } = await supabase.from('checkup_items').insert(templateRows(c.id));
    setSaving(false);
    if (itemsErr) {
      toast.error('Erro ao montar o checklist');
      return;
    }
    navigate(`/mecanico/checkup/${c.id}`);
  }

  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const drafts    = list.filter(c => c.status === 'draft');
  const completed = list.filter(c => c.status === 'completed');

  return (
    <MechanicLayout>
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-white">Check-up</h1>
            <p className="text-sm text-steel-400">Inspeção guiada com relatório pro cliente</p>
          </div>
          {!showNew && (
            <button onClick={() => setShowNew(true)} className="btn-primary text-sm !py-2.5 !px-4 shrink-0">
              + Novo
            </button>
          )}
        </div>

        {showNew && (
          <form onSubmit={create} className="rounded-2xl bg-steel-800 border border-steel-700 p-4 space-y-3">
            <div className="font-bold text-white">🔍 Novo check-up</div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Placa"  value={form.plate} onChange={set('plate')} placeholder="ABC1D23" upper />
              <Field label="KM"     value={form.km}    onChange={set('km')}    placeholder="85000" inputMode="numeric" />
              <Field label="Marca"  value={form.make}  onChange={set('make')}  placeholder="Fiat" />
              <Field label="Modelo" value={form.model} onChange={set('model')} placeholder="Uno" />
              <Field label="Ano"    value={form.year}  onChange={set('year')}  placeholder="2018" inputMode="numeric" />
            </div>
            <div className="pt-1 text-[10px] text-steel-500 uppercase tracking-widest font-semibold">Cliente (opcional)</div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Nome"     value={form.customer_name}  onChange={set('customer_name')}  placeholder="João Silva" />
              <Field label="WhatsApp" value={form.customer_phone} onChange={set('customer_phone')} placeholder="(11) 99999-9999" inputMode="tel" />
            </div>
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={() => { setShowNew(false); setForm(EMPTY); }}
                className="flex-1 py-3 rounded-xl bg-steel-700 text-steel-300 font-semibold text-sm active:scale-95">
                Cancelar
              </button>
              <button type="submit" disabled={saving} className="flex-1 btn-primary text-sm !py-3">
                {saving ? 'Criando…' : 'Começar inspeção →'}
              </button>
            </div>
          </form>
        )}

        {loading ? (
          <div className="text-steel-500 text-sm py-8 text-center">Carregando…</div>
        ) : list.length === 0 && !showNew ? (
          <div className="rounded-2xl bg-steel-800 border border-steel-700 p-6 text-center space-y-3">
            <div className="text-4xl">🔍</div>
            <div className="font-bold text-white">Nenhum check-up ainda</div>
            <p className="text-sm text-steel-400">
              Inspecione o carro item por item, tire fotos e mande um relatório com nota de saúde pro cliente pelo WhatsApp.
            </p>
            <button onClick={() => setShowNew(true)} className="btn-primary text-sm">Fazer o primeiro</button>
          </div>
        ) : (
          <>
            {drafts.length > 0 && <Section title="Em andamento" items={drafts} />}
            {completed.length > 0 && <Section title="Finalizados" items={completed} />}
          </>
        )}
      </div>
    </MechanicLayout>
  );
}

function Section({ title, items }: { title: string; items: VehicleCheckup[] }) {
  return (
    <div className="space-y-2">
      <div className="text-[10px] text-steel-500 uppercase tracking-widest font-semibold">{title}</div>
      {items.map(c => <CheckupRow key={c.id} c={c} />)}
    </div>
  );
}

const SCORE_TEXT = { signal: 'text-signal-500', pending: 'text-pending-500', alert: 'text-alert-500' };

function CheckupRow({ c }: { c: VehicleCheckup }) {
  const car = [c.make, c.model, c.year].filter(Boolean).join(' ') || 'Veículo';
  const meta = c.score != null ? scoreMeta(c.score) : null;
  return (
    <Link to={`/mecanico/checkup/${c.id}`}
      className="flex items-center gap-3 rounded-2xl bg-steel-800 border border-steel-700 p-4 hover:border-steel-600 active:scale-[0.99] transition">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          {c.plate && <span className="text-xs font-mono font-bold bg-steel-700 text-steel-200 rounded px-1.5 py-0.5">{c.plate}</span>}
          <span className="font-semibold text-white truncate">{car}</span>
        </div>
        <div className="text-xs text-steel-500 mt-1 truncate">
          {c.customer_name ? `${c.customer_name} · ` : ''}
          {new Date(c.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
        </div>
      </div>
      {c.status === 'completed' && meta ? (
        <div className="text-right shrink-0">
          <div className={`text-2xl font-bold font-display ${SCORE_TEXT[meta.color]}`}>{c.score}</div>
          <div className="text-[10px] text-steel-500">/100</div>
        </div>
      ) : (
        <span className="badge bg-pending-500/15 text-pending-500 shrink-0">Continuar →</span>
      )}
    </Link>
  );
}

function Field({ label, upper, ...props }: {
  label: string; upper?: boolean;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="text-xs text-steel-400 font-medium">{label}</span>
      <input {...props}
        className={`mt-1 w-full rounded-xl bg-steel-900 border border-steel-700 px-3 py-2.5 text-sm text-white placeholder:text-steel-600 focus:outline-none focus:border-brand-500 ${upper ? 'uppercase' : ''}`} />
    </label>
  );
}
