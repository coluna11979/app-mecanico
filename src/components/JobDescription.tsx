import { isStructured, parseJobDescription } from '@/lib/jobDescription';

/**
 * Descrição da demanda organizada: um bloco por carro com os serviços dele.
 * Texto livre (sem lista) aparece como parágrafo, respeitando as quebras de linha.
 * `tone="dark"` é o painel do mecânico; `light` as telas claras.
 */
export default function JobDescription({ text, tone = 'dark' }: { text: string | null | undefined; tone?: 'dark' | 'light' }) {
  const p = parseJobDescription(text);
  const dark = tone === 'dark';
  const muted = dark ? 'text-steel-400' : 'text-steel-500';
  const body = dark ? 'text-steel-300' : 'text-steel-700';

  if (!isStructured(p)) {
    const onlyVehicle = p.groups.find(g => g.vehicle);
    return (
      <div className="mt-3 space-y-2">
        {p.notes.length > 0 && <p className={`${body} leading-relaxed whitespace-pre-line`}>{p.notes.join('\n')}</p>}
        {onlyVehicle && (
          <div className={`text-sm font-semibold ${dark ? 'text-white' : 'text-steel-900'}`}>🚗 {onlyVehicle.vehicle}</div>
        )}
      </div>
    );
  }

  const many = p.groups.length > 1;
  return (
    <div className="mt-3 space-y-2.5">
      {many && (
        <div className={`text-xs font-bold uppercase tracking-wider ${dark ? 'text-brand-400' : 'text-brand-600'}`}>
          {p.groups.length} carros · {p.groups.reduce((a, g) => a + g.services.length, 0)} serviços
        </div>
      )}
      {p.groups.map((g, i) => (
        <div key={i} className={`rounded-xl p-3 ${dark ? 'bg-steel-900/60 ring-1 ring-steel-700' : 'bg-steel-50 ring-1 ring-steel-200'}`}>
          {(g.vehicle || many) && (
            <div className="flex items-baseline justify-between gap-2 mb-1.5">
              <div className={`text-sm font-bold ${dark ? 'text-white' : 'text-steel-900'}`}>
                🚗 {many ? `Carro ${i + 1}${g.vehicle ? ` · ${g.vehicle}` : ''}` : g.vehicle}
              </div>
              {g.ref && <span className={`text-[11px] font-semibold shrink-0 ${muted}`}>{g.ref}</span>}
            </div>
          )}
          <ul className="space-y-1.5">
            {g.services.map((s, k) => (
              <li key={k} className="flex gap-2">
                <span className={`mt-0.5 shrink-0 ${dark ? 'text-brand-400' : 'text-brand-600'}`} aria-hidden>✓</span>
                <span className="min-w-0">
                  <span className={`block text-sm font-semibold ${dark ? 'text-steel-100' : 'text-steel-900'}`}>{s.title}</span>
                  {s.detail && <span className={`block text-xs leading-snug ${muted}`}>{s.detail}</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {p.notes.length > 0 && <p className={`text-sm ${body} leading-relaxed whitespace-pre-line`}>{p.notes.join('\n')}</p>}
    </div>
  );
}
