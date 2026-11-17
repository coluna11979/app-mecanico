import { useState } from 'react';
import { toast } from '@/components/ui/Toast';
import { saveKit, type KitCar, type KitProposal } from '@/lib/osKits';
import { useServiceCategories } from '@/lib/serviceCategories';

/**
 * Ao concluir a OS: "esse serviço usou estas peças — salvar como kit na Tabela de serviços?"
 * Serviço sem kit → salva o kit. Serviço que usou o kit com mudança → o kit original fica como está e a
 * oficina escolhe se cria um kit novo (serviço novo na tabela). Cada serviço é decidido separadamente.
 */
export default function SaveKitsModal({ proposals, workshopId, car, onClose }: {
  proposals: KitProposal[]; workshopId: string; car: KitCar | null; onClose: () => void;
}) {
  const categories = useServiceCategories(workshopId);
  const [done, setDone] = useState<Record<string, 'saved' | 'skipped'>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [names, setNames] = useState<Record<string, string>>(() => Object.fromEntries(proposals.map(p => [p.key, `${p.name} (ajustado)`])));
  const [forModel, setForModel] = useState<Record<string, boolean>>(() => Object.fromEntries(proposals.map(p => [p.key, !!car?.model])));
  const [error, setError] = useState<Record<string, string>>({});
  const pending = proposals.filter(p => !done[p.key]);

  async function save(p: KitProposal) {
    setBusy(p.key); setError(e => ({ ...e, [p.key]: '' }));
    const err = await saveKit(p, { workshopId, name: names[p.key], forModel: !!forModel[p.key], car, categories: categories.names });
    setBusy(null);
    if (err) { setError(e => ({ ...e, [p.key]: err })); return; }
    toast.success(p.kind === 'new' ? 'Kit salvo na Tabela de serviços' : 'Kit novo criado na Tabela de serviços');
    setDone(d => ({ ...d, [p.key]: 'saved' }));
  }

  return (
    <div className="fixed inset-0 z-[70] bg-steel-900/70 flex items-end sm:items-center justify-center sm:p-4" onClick={() => !busy && onClose()}>
      <div onClick={e => e.stopPropagation()} className="w-full sm:max-w-lg bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[92vh] flex flex-col">
        <div className="px-5 pt-5 pb-3 border-b border-steel-100">
          <h2 className="text-lg font-bold text-steel-900">Salvar kits desta OS?</h2>
          <p className="text-xs text-steel-500 mt-0.5">Assim a Tabela de serviços vai ganhando os kits que a oficina realmente usa. Na próxima OS as peças já vêm sugeridas.</p>
        </div>

        <div className="px-5 py-4 space-y-3 overflow-y-auto">
          {proposals.map(p => {
            const st = done[p.key];
            return (
              <div key={p.key} className={`rounded-xl border p-3 ${st ? 'border-steel-100 bg-steel-50' : 'border-steel-200'}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="font-semibold text-steel-900 min-w-0">{p.name}</div>
                  {st && <span className={`shrink-0 text-xs font-bold ${st === 'saved' ? 'text-signal-700' : 'text-steel-400'}`}>{st === 'saved' ? '✓ salvo' : 'ficou de fora'}</span>}
                </div>
                <ul className="mt-1.5 text-sm text-steel-700 space-y-0.5">
                  {p.parts.map(x => <li key={x.part_id ?? x.description}>{x.quantity !== 1 ? `${String(x.quantity).replace('.', ',')}× ` : ''}{x.description}</li>)}
                </ul>

                {!st && (
                  <>
                    {p.kind === 'new' ? (
                      <p className="mt-2 text-xs text-steel-600">
                        {p.service ? 'Este serviço ainda não tem kit' : 'Este serviço ainda não está na Tabela de serviços'}{car?.model && forModel[p.key] ? ' para este carro' : ''}. Salvar essas peças como kit?
                      </p>
                    ) : (
                      <div className="mt-2 text-xs text-steel-600 space-y-1">
                        <p>Você usou o kit {p.originalModel ? `do ${p.originalModel}` : 'geral'} com mudanças. <strong>O kit original continua como está.</strong></p>
                        <p className="text-steel-500">
                          {[p.added.length ? `+ ${p.added.join(', ')}` : '', p.removed.length ? `− ${p.removed.join(', ')}` : '', p.qtyChanged.length ? `quantidade: ${p.qtyChanged.join(', ')}` : ''].filter(Boolean).join('  ·  ')}
                        </p>
                        <p>Criar um kit novo na Tabela de serviços?</p>
                        <input className="input !py-2 text-sm" value={names[p.key] ?? ''} onChange={e => setNames(n => ({ ...n, [p.key]: e.target.value }))}
                          placeholder="Nome do serviço novo" aria-label="Nome do serviço novo" />
                      </div>
                    )}

                    {car?.model && (
                      <div className="mt-2 flex gap-1 bg-steel-100 rounded-lg p-1 text-xs font-semibold">
                        {([[true, `Só para ${car.model}`], [false, 'Qualquer carro']] as const).map(([v, l]) => (
                          <button key={String(v)} type="button" onClick={() => setForModel(m => ({ ...m, [p.key]: v }))}
                            className={`flex-1 min-h-[36px] rounded-md px-2 truncate ${!!forModel[p.key] === v ? 'bg-white shadow text-steel-900' : 'text-steel-500'}`}>{l}</button>
                        ))}
                      </div>
                    )}

                    {error[p.key] && <p className="mt-2 text-xs font-semibold text-alert-700">{error[p.key]}</p>}
                    <div className="mt-3 flex gap-2">
                      <button type="button" disabled={busy === p.key} onClick={() => save(p)}
                        className="flex-1 min-h-[44px] rounded-xl bg-brand-500 text-white text-sm font-bold active:scale-[0.98] disabled:opacity-60">
                        {busy === p.key ? 'Salvando…' : p.kind === 'new' ? 'Salvar kit' : 'Criar kit novo'}
                      </button>
                      <button type="button" disabled={busy === p.key} onClick={() => setDone(d => ({ ...d, [p.key]: 'skipped' }))}
                        className="min-h-[44px] px-4 rounded-xl border border-steel-200 text-sm font-semibold text-steel-600">Agora não</button>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>

        <div className="px-5 py-3 border-t border-steel-100 flex justify-end">
          <button type="button" onClick={onClose} disabled={!!busy} className="min-h-[44px] px-5 rounded-xl bg-steel-900 text-white text-sm font-bold">
            {pending.length ? 'Fechar sem salvar o resto' : 'Pronto'}
          </button>
        </div>
      </div>
    </div>
  );
}
