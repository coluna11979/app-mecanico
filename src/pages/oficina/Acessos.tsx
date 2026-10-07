import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import WorkshopLayout from '@/components/layout/WorkshopLayout';
import TeamTabs from '@/components/team/TeamTabs';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/components/ui/Toast';
import { PERM_GROUPS, PERMS, ROLES, ROLE_ORDER, type OperatorPerm, type OperatorRole, type WorkshopOperator } from '@/lib/operators';
import type { WorkshopMechanic } from '@/types/database';

/** Uma linha da lista: o dono ou um colaborador da Equipe, com o acesso (se já tiver). */
type Row = { key: string; name: string; subtitle: string; mechanicId: string | null; isOwner: boolean; op: WorkshopOperator | null };

export default function Acessos() {
  const { currentWorkshop, profile, user } = useAuth();
  const wid = currentWorkshop?.id ?? null;
  const isOwner = !!currentWorkshop && currentWorkshop.profile_id === user?.id;

  const [rows, setRows]       = useState<Row[] | null>(null);
  const [editing, setEditing] = useState<Row | null>(null);

  async function load() {
    if (!wid) return;
    const [o, m] = await Promise.all([
      supabase.from('workshop_operators').select('*').eq('workshop_id', wid),
      supabase.from('workshop_mechanics').select('*').eq('workshop_id', wid).order('name'),
    ]);
    const ops = (o.data as WorkshopOperator[]) ?? [];
    const mechs = (m.data as WorkshopMechanic[]) ?? [];
    const owner = ops.find(x => x.is_owner) ?? null;
    const list: Row[] = [{
      key: 'owner', name: owner?.name ?? profile?.full_name ?? 'Dono da oficina',
      subtitle: 'Dono da oficina', mechanicId: null, isOwner: true, op: owner,
    }];
    for (const x of mechs) {
      const op = ops.find(p => p.mechanic_id === x.id) ?? null;
      const terminated = (x.status ?? (x.active ? 'active' : 'terminated')) === 'terminated';
      if (terminated && !op?.active) continue;
      list.push({
        key: x.id, name: x.name, mechanicId: x.id, isOwner: false, op,
        subtitle: [x.role_title, terminated ? 'Desligado' : null].filter(Boolean).join(' · ') || 'Colaborador',
      });
    }
    setRows(list);
  }

  useEffect(() => { load(); }, [wid]); // eslint-disable-line react-hooks/exhaustive-deps

  const configured = rows?.filter(r => r.op?.active && r.op.has_pin && r.op.roles.length > 0).length ?? 0;

  return (
    <WorkshopLayout>
      <div className="max-w-4xl mx-auto">
        <TeamTabs />
        <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">🔐 Acessos e funções</h1>
            <p className="text-sm text-steel-500 mt-1">
              Defina em quais funções cada pessoa trabalha e o PIN pessoal dela.
            </p>
          </div>
          <Link to="/oficina/equipe/novo" className="btn-secondary">+ Novo colaborador</Link>
        </div>

        <div className="card bg-steel-900 text-white border-steel-900 mb-5">
          <div className="font-bold">Como funciona o modo balcão</div>
          <ol className="text-sm text-steel-300 mt-2 space-y-1 list-decimal list-inside">
            <li>Cadastre o seu PIN de gestor e o PIN de cada colaborador aqui.</li>
            <li>No computador do balcão, toque em <strong className="text-white">🔒 Ativar modo balcão</strong> no menu.</li>
            <li>Cada pessoa toca no nome, escolhe a função e digita o PIN. A tela mostra só o que aquela função usa.</li>
            <li>Tudo o que for lançado fica registrado em nome de quem fez. Para trocar, é só tocar em <strong className="text-white">🔒 Trocar</strong>.</li>
          </ol>
          <div className="text-xs text-steel-400 mt-3">
            {configured === 0 ? 'Ninguém com acesso configurado ainda.' : `${configured} ${configured === 1 ? 'pessoa pronta' : 'pessoas prontas'} para usar o modo balcão.`}
          </div>
        </div>

        {!isOwner && (
          <div className="card bg-pending-50 border-pending-200 text-sm text-pending-800 mb-5">
            Só o dono da oficina pode alterar os acessos.
          </div>
        )}

        <div className="grid sm:grid-cols-2 gap-3 mb-6">
          {ROLE_ORDER.map(r => (
            <div key={r} className="rounded-2xl border border-steel-200 bg-white px-4 py-3">
              <div className="font-semibold text-sm">{ROLES[r].icon} {ROLES[r].label}</div>
              <div className="text-xs text-steel-500 mt-0.5">{ROLES[r].desc}</div>
            </div>
          ))}
        </div>

        {rows === null ? (
          <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-20 bg-white rounded-2xl animate-pulse" />)}</div>
        ) : (
          <div className="card p-0 divide-y divide-steel-100">
            {rows.map(r => {
              const op = r.op;
              const on = !!op && op.active && op.roles.length > 0;
              return (
                <div key={r.key} className="flex items-center gap-3 px-4 py-3.5">
                  <div className={`h-11 w-11 rounded-full grid place-items-center font-bold shrink-0 ${on ? 'bg-brand-500 text-white' : 'bg-steel-100 text-steel-400'}`}>
                    {r.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate">{r.name}</div>
                    <div className="text-xs text-steel-500 truncate">{r.subtitle}</div>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {!on ? (
                        <span className="badge text-[10px] bg-steel-100 text-steel-500">Sem acesso ao sistema</span>
                      ) : (
                        <>
                          {ROLE_ORDER.filter(x => op!.roles.includes(x)).map(x => (
                            <span key={x} className="badge text-[10px] bg-brand-50 text-brand-700">{ROLES[x].icon} {ROLES[x].label}</span>
                          ))}
                          {op!.has_pin
                            ? <span className="badge text-[10px] bg-signal-100 text-signal-700">PIN ok</span>
                            : <span className="badge text-[10px] bg-pending-100 text-pending-800">Falta o PIN</span>}
                        </>
                      )}
                    </div>
                  </div>
                  {isOwner && (
                    <button onClick={() => setEditing(r)} className="btn-secondary text-sm shrink-0">
                      {on ? 'Editar' : 'Liberar acesso'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {rows && rows.length === 1 && (
          <p className="text-sm text-steel-500 text-center mt-4">
            Cadastre os colaboradores em <Link to="/oficina/equipe" className="text-brand-600 font-semibold">Equipe</Link> para liberar o acesso deles.
          </p>
        )}
      </div>

      {editing && wid && (
        <AccessModal
          row={editing}
          workshopId={wid}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </WorkshopLayout>
  );
}

function AccessModal({ row, workshopId, onClose, onSaved }: {
  row: Row; workshopId: string; onClose: () => void; onSaved: () => void;
}) {
  const op = row.op;
  const [roles, setRoles]   = useState<OperatorRole[]>(op?.roles ?? (row.isOwner ? ['gestor'] : []));
  const [perms, setPerms]   = useState<OperatorPerm[]>(op?.permissions ?? []);
  /** Em quais funções cada permissão vale (só quando a pessoa tem mais de uma função) */
  const [permRoles, setPermRoles] = useState<Partial<Record<OperatorPerm, OperatorRole[]>>>(op?.perm_roles ?? {});
  const [active, setActive] = useState(op?.active ?? true);
  const [pin, setPin]       = useState('');
  const [pin2, setPin2]     = useState('');
  const [saving, setSaving] = useState(false);

  const isGestor = roles.includes('gestor');
  const toggleRole = (r: OperatorRole) => setRoles(rs => rs.includes(r) ? rs.filter(x => x !== r) : [...rs, r]);
  const togglePerm = (p: OperatorPerm) => setPerms(ps => ps.includes(p) ? ps.filter(x => x !== p) : [...ps, p]);
  const multiRole = roles.length > 1;
  /** Funções em que a permissão vale (vazio = todas) */
  const rolesOf = (p: OperatorPerm) => { const only = (permRoles[p] ?? []).filter(r => roles.includes(r)); return only.length ? only : roles; };
  function togglePermRole(p: OperatorPerm, r: OperatorRole) {
    const cur = rolesOf(p);
    const next = cur.includes(r) ? cur.filter(x => x !== r) : [...cur, r];
    if (!next.length) { toast.info('A permissão precisa valer em pelo menos uma função. Para tirar, desmarque a permissão.'); return; }
    setPermRoles(m => ({ ...m, [p]: next.length === roles.length ? [] : next }));
  }

  async function save() {
    if (row.isOwner && !isGestor) return toast.error('O dono precisa ter a função Gestor.');
    if (pin && !/^[0-9]{4,6}$/.test(pin)) return toast.error('O PIN precisa ter de 4 a 6 números.');
    if (pin !== pin2) return toast.error('Os dois PINs não conferem.');
    if (active && roles.length > 0 && !op?.has_pin && !pin) return toast.error('Cadastre um PIN para essa pessoa entrar.');

    setSaving(true);
    const payload = {
      workshop_id: workshopId, mechanic_id: row.mechanicId, name: row.name, is_owner: row.isOwner,
      roles: ROLE_ORDER.filter(r => roles.includes(r)),
      permissions: isGestor ? [] : perms,
      // Só guarda as permissões restritas a algumas funções (e só das funções que a pessoa ainda tem)
      perm_roles: isGestor ? {} : Object.fromEntries(perms
        .map(p => [p, (permRoles[p] ?? []).filter(r => roles.includes(r))] as const)
        .filter(([, rs]) => rs.length > 0 && rs.length < roles.length)),
      active: row.isOwner ? true : active,
      updated_at: new Date().toISOString(),
    };
    const res = op
      ? await supabase.from('workshop_operators').update(payload).eq('id', op.id).select('id').single()
      : await supabase.from('workshop_operators').insert(payload).select('id').single();
    if (res.error || !res.data) {
      setSaving(false);
      return toast.error('Não foi possível salvar o acesso.');
    }
    if (pin) {
      const { error } = await supabase.rpc('set_operator_pin', { p_operator: res.data.id, p_pin: pin });
      if (error) {
        setSaving(false);
        return toast.error(error.message || 'Não foi possível salvar o PIN.');
      }
    }
    setSaving(false);
    toast.success('Acesso salvo');
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 bg-steel-900/60 grid place-items-center p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold">{row.name}</h2>
            <div className="text-sm text-steel-500">{row.subtitle}</div>
          </div>
          <button onClick={onClose} className="text-steel-400 hover:text-steel-700 text-xl leading-none" aria-label="Fechar">×</button>
        </div>

        <div className="label mt-5 mb-2">Funções</div>
        <div className="space-y-2">
          {ROLE_ORDER.map(r => {
            const locked = row.isOwner && r === 'gestor';
            return (
              <label key={r} className={`flex items-start gap-3 rounded-xl border px-3 py-2.5 cursor-pointer transition ${
                roles.includes(r) ? 'border-brand-500 bg-brand-50/50' : 'border-steel-200'} ${locked ? 'opacity-70 cursor-not-allowed' : ''}`}>
                <input type="checkbox" className="mt-1" checked={roles.includes(r)} disabled={locked} onChange={() => toggleRole(r)} />
                <div>
                  <div className="font-semibold text-sm">{ROLES[r].icon} {ROLES[r].label}</div>
                  <div className="text-xs text-steel-500">{ROLES[r].desc}</div>
                </div>
              </label>
            );
          })}
        </div>

        <div className="label mt-5 mb-2">Permissões extras</div>
        {isGestor ? (
          <div className="text-xs text-steel-500 rounded-xl bg-steel-50 px-3 py-2.5">A função Gestor já pode fazer tudo.</div>
        ) : (
          <div className="space-y-3">
            {PERM_GROUPS.map(g => (
              <div key={g.label}>
                <div className="text-[11px] font-semibold text-steel-400 mb-1.5">{g.label}</div>
                <div className="grid sm:grid-cols-2 gap-2">
                  {g.perms.map(p => (
                    <div key={p} className={`rounded-xl border px-3 py-2 transition ${perms.includes(p) ? 'border-brand-300 bg-brand-50/40' : 'border-steel-200'}`}>
                      <label className="flex items-start gap-2 cursor-pointer">
                        <input type="checkbox" className="mt-1" checked={perms.includes(p)} onChange={() => togglePerm(p)} />
                        <div>
                          <div className="text-sm font-semibold">{PERMS[p].label}</div>
                          <div className="text-[11px] text-steel-500">{PERMS[p].desc}</div>
                        </div>
                      </label>
                      {multiRole && perms.includes(p) && (
                        <div className="mt-2 pt-2 border-t border-brand-100">
                          <div className="text-[10px] text-steel-500 mb-1">Vale quando entrar como:</div>
                          <div className="flex flex-wrap gap-1">
                            {ROLE_ORDER.filter(r => roles.includes(r)).map(r => {
                              const on = rolesOf(p).includes(r);
                              return (
                                <button type="button" key={r} onClick={() => togglePermRole(p, r)}
                                  className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border transition ${
                                    on ? 'bg-brand-500 text-white border-brand-500' : 'bg-white text-steel-400 border-steel-200 line-through'}`}>
                                  {ROLES[r].icon} {ROLES[r].label}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="label mt-5 mb-2">{op?.has_pin ? 'Trocar PIN (deixe em branco para manter)' : 'PIN pessoal (4 a 6 números)'}</div>
        <div className="grid grid-cols-2 gap-2">
          <input className="input" type="password" inputMode="numeric" autoComplete="new-password" maxLength={6}
            placeholder="PIN" value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ''))} />
          <input className="input" type="password" inputMode="numeric" autoComplete="new-password" maxLength={6}
            placeholder="Repita o PIN" value={pin2} onChange={e => setPin2(e.target.value.replace(/\D/g, ''))} />
        </div>

        {!row.isOwner && op && (
          <label className="flex items-center gap-2 mt-5 text-sm">
            <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} />
            Acesso ativo <span className="text-steel-400 text-xs">(desmarque para bloquear sem apagar o histórico)</span>
          </label>
        )}

        <div className="flex gap-2 mt-6">
          <button onClick={onClose} className="btn-ghost flex-1">Cancelar</button>
          <button onClick={save} disabled={saving} className="btn-primary flex-[2]">{saving ? 'Salvando…' : 'Salvar acesso'}</button>
        </div>
      </div>
    </div>
  );
}
