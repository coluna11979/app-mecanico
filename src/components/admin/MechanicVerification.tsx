import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

/** Verificação de cadastro (Infosimples): CPF na Receita, antecedentes na PF e mandados no CNJ. */

type Verification = {
  id: string;
  check_type: 'cpf' | 'antecedentes_pf' | 'mandados_cnj';
  status: 'ok' | 'attention' | 'error';
  summary: string;
  details: any;
  api_code: number | null;
  price: number | null;
  created_at: string;
};

const CHECKS: { key: Verification['check_type']; label: string }[] = [
  { key: 'cpf',             label: 'CPF na Receita Federal' },
  { key: 'antecedentes_pf', label: 'Antecedentes criminais (PF)' },
  { key: 'mandados_cnj',    label: 'Mandados de prisão (CNJ)' },
];

const STYLE: Record<Verification['status'], { icon: string; cls: string }> = {
  ok:        { icon: '✓', cls: 'border-signal-500/30 bg-signal-500/10 text-signal-700' },
  attention: { icon: '⚠', cls: 'border-pending-500/40 bg-pending-500/10 text-pending-700' },
  error:     { icon: '✕', cls: 'border-steel-200 bg-steel-50 text-steel-600' },
};

export function MechanicVerification({ mechanicId }: { mechanicId: string }) {
  const [items, setItems] = useState<Verification[]>([]);
  const [running, setRunning] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [openDetails, setOpenDetails] = useState<string | null>(null);

  useEffect(() => { load(); }, [mechanicId]);

  async function load() {
    const { data } = await supabase
      .from('mechanic_verifications')
      .select('*')
      .eq('mechanic_id', mechanicId)
      .order('created_at', { ascending: false });
    const rows = (data as Verification[]) ?? [];
    setItems(rows);
    return rows;
  }

  async function verify(only?: Verification['check_type'][]) {
    const n = only?.length ?? 3;
    const what = only
      ? `Repetir ${n === 1 ? 'a consulta' : `as ${n} consultas`} que ${n === 1 ? 'falhou' : 'falharam'}`
      : items.length > 0 ? 'Rodar as 3 consultas de novo' : 'Verificar este mecânico';
    if (!confirm(`${what}? Até R$ ${(0.27 * n).toFixed(2).replace('.', ',')} na Infosimples (falha por site fora do ar não é cobrada).`)) return;
    setRunning(true); setErr(null);
    const before = new Set(items.map(i => i.id));
    const { data, error } = await supabase.functions.invoke('verify-mechanic', { body: { mechanic_id: mechanicId, only } });
    if (error || data?.error) {
      setRunning(false);
      let msg = data?.error as string | undefined;
      if (!msg && error && 'context' in error) {
        try { msg = (await (error as any).context.json()).error; } catch { /* ignore */ }
      }
      setErr(msg || error?.message || 'Falha ao verificar.');
      return;
    }
    // As consultas rodam no servidor e cada uma grava quando termina — acompanha até chegarem todas
    const expected: number = data?.started ?? n;
    const deadline = Date.now() + 5 * 60 * 1000;
    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 4000));
      const rows = await load();
      if (rows.filter(r => !before.has(r.id)).length >= expected) break;
    }
    setRunning(false);
  }

  // Última consulta de cada tipo
  const latest = CHECKS.map(c => ({ ...c, v: items.find(i => i.check_type === c.key) }));
  const lastRun = items[0]?.created_at;
  const spent = items.reduce((s, i) => s + (Number(i.price) || 0), 0);
  const failed = latest.filter(l => l.v?.status === 'error').map(l => l.key);

  return (
    <div className="space-y-2">
      {latest.map(({ key, label, v }) => {
        if (!v) return (
          <div key={key} className="rounded-xl border border-dashed border-steel-200 px-3 py-2 text-sm text-steel-400">
            {label} — não verificado
          </div>
        );
        const st = STYLE[v.status];
        return (
          <div key={key} className={`rounded-xl border px-3 py-2 ${st.cls}`}>
            <div className="flex items-start gap-2">
              <span className="font-bold leading-5">{st.icon}</span>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold uppercase tracking-wide opacity-80">{label}</div>
                <div className="text-sm text-steel-800">{v.summary}</div>
                {v.details && (
                  <button type="button" className="text-[11px] underline mt-0.5"
                    onClick={() => setOpenDetails(openDetails === v.id ? null : v.id)}>
                    {openDetails === v.id ? 'Ocultar detalhes' : 'Ver detalhes'}
                  </button>
                )}
                {openDetails === v.id && (
                  <pre className="mt-1 text-[11px] bg-white/70 rounded-lg p-2 overflow-x-auto whitespace-pre-wrap text-steel-700">
                    {JSON.stringify(v.details, null, 2)}
                  </pre>
                )}
              </div>
            </div>
          </div>
        );
      })}

      {err && <div className="text-sm text-alert-600 bg-alert-500/10 px-3 py-2 rounded-lg">{err}</div>}

      <div className="flex items-center justify-between gap-3 pt-1">
        <div className="text-[11px] text-steel-400">
          {lastRun
            ? <>Última verificação: {new Date(lastRun).toLocaleString('pt-BR')} · gasto total R$ {spent.toFixed(2).replace('.', ',')}</>
            : 'Consulta paga, roda só quando você clicar.'}
        </div>
        <div className="flex flex-wrap justify-end gap-2 shrink-0">
          {failed.length > 0 && !running && (
            <button type="button" onClick={() => verify(failed)} className="btn-primary text-sm">
              🔁 Repetir só o que falhou
            </button>
          )}
          <button type="button" onClick={() => verify()} disabled={running}
            className={`${failed.length > 0 ? 'btn-ghost' : 'btn-primary'} text-sm`}>
            {running ? 'Consultando… (CNJ pode levar até 4 min)' : items.length ? '🔄 Verificar tudo de novo' : '🛡️ Verificar mecânico'}
          </button>
        </div>
      </div>

      <p className="text-[11px] text-steel-400 leading-snug">
        Certidão da PF que não sai ou mandado com nome parecido <b>não</b> provam nada sozinhos (homônimos são comuns) —
        confira nome da mãe e nascimento antes de recusar.
      </p>
    </div>
  );
}
