import type { ReactNode } from 'react';

/**
 * Cabeçalho padrão dos agentes (mobile-first): ícone, nome, para que serve, situação e o liga/desliga num
 * interruptor; as ações (Versões, Configurar…) ficam numa barra de botões largos embaixo, fáceis de tocar.
 */
export type AgentAction = { key: string; icon: string; label: string; onClick: () => void; active?: boolean };

export function AgentSwitch({ on, onToggle, label }: { on: boolean; onToggle: () => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={onToggle}
      className="flex flex-col items-center gap-1 shrink-0 min-w-[56px] min-h-[44px] justify-center">
      <span className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${on ? 'bg-signal-500' : 'bg-steel-300'}`}>
        <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-6' : 'translate-x-1'}`} />
      </span>
      <span className={`text-[11px] font-semibold ${on ? 'text-signal-700' : 'text-steel-500'}`}>{on ? 'Ligado' : 'Desligado'}</span>
    </button>
  );
}

export default function AgentHeader({ icon, name, desc, tag, meta, badge, enabled, onToggle, actions = [] }: {
  icon: string; name: string; desc?: string;
  /** Etiqueta curta do que ele pode fazer (ex.: "Só conversa", "Grava no sistema") */
  tag?: string;
  meta?: ReactNode; badge?: ReactNode;
  enabled?: boolean; onToggle?: () => void;
  actions?: AgentAction[];
}) {
  return (
    <div className="card p-0 overflow-hidden">
      <div className="flex items-start gap-3 p-4">
        <div className="h-12 w-12 rounded-2xl bg-brand-50 grid place-items-center text-2xl shrink-0" aria-hidden>{icon}</div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="font-semibold text-[15px] leading-tight text-steel-900 break-words">{name}</h3>
            {badge}
          </div>
          {desc && <p className="text-xs text-steel-500 mt-1 leading-snug">{desc}</p>}
          {(tag || meta) && (
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-steel-500">
              {tag && <span className="rounded-full bg-steel-100 px-2 py-0.5 font-medium text-steel-600">{tag}</span>}
              {meta}
            </div>
          )}
        </div>
        {onToggle && enabled !== undefined && <AgentSwitch on={enabled} onToggle={onToggle} label={`Ligar ou desligar ${name}`} />}
      </div>
      {actions.length > 0 && (
        <div className="grid border-t border-steel-100 divide-x divide-steel-100" style={{ gridTemplateColumns: `repeat(${actions.length}, minmax(0, 1fr))` }}>
          {actions.map(a => (
            <button key={a.key} type="button" onClick={a.onClick}
              className={`min-h-[48px] flex items-center justify-center gap-2 text-sm font-medium transition ${a.active ? 'bg-brand-50 text-brand-700' : 'text-steel-700 hover:bg-steel-50'}`}>
              <span aria-hidden>{a.icon}</span>{a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
