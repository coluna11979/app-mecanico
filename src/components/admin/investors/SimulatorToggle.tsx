import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from '@/components/ui/Toast';

const KEY = 'investors_form_show_valuation';

/** Liga ou desliga o simulador de participação no formulário público (/investir).
 *  Ligado, o valuation fica visível para qualquer pessoa que abrir o link. */
export default function SimulatorToggle() {
  const [on, setOn] = useState<boolean | null>(null);

  useEffect(() => {
    supabase.from('app_settings').select('value').eq('key', KEY).maybeSingle()
      .then(({ data }) => setOn(data?.value === 'true'));
  }, []);

  async function flip() {
    const next = !on;
    const { error } = await supabase.from('app_settings').update({ value: String(next) }).eq('key', KEY);
    if (error) return toast.error('Não salvou: ' + error.message);
    setOn(next);
    toast.success(next ? 'Simulador ligado no formulário' : 'Simulador desligado');
  }

  return (
    <section className="rounded-xl border border-steel-200 dark:border-steel-700 p-4 space-y-2">
      <h2 className="font-semibold">Simulador no formulário público</h2>
      <p className="text-xs text-steel-500">
        No formulário <b>/investir</b>, a pessoa aumenta ou diminui o valor e vê a participação estimada (valor ÷ valuation).
        Para isso o <b>valuation aparece na página pública</b>, para qualquer pessoa com o link. Desligado, o formulário não mostra o valuation
        nem o cálculo.
      </p>
      <label className="flex items-center gap-3 cursor-pointer select-none min-h-[44px]">
        <input type="checkbox" className="h-5 w-5" checked={!!on} disabled={on === null} onChange={flip} />
        <span className="text-sm font-semibold">Mostrar o simulador de participação no formulário público</span>
      </label>
    </section>
  );
}
