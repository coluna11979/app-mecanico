import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import WorkshopLayout from '@/components/layout/WorkshopLayout';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/components/ui/Toast';
import LicensePlate from '@/components/os/LicensePlate';
import OsItemsEditor from '@/components/os/OsItemsEditor';
import OsEditModal from '@/components/os/OsEditModal';
import Recommendations from '@/components/os/Recommendations';
import {
  durationMin, fmtBRL, fmtDateTime, fmtDur, osNumber, osStatusColor, osStatusLabel, waNumber, fmtPhone,
  statusChange, APPROVAL_CHANNELS,
} from '@/components/os/osHelpers';
import type { OsRow } from '@/components/os/OsCard';
import type { OsStatus, ServiceOrderItem } from '@/types/database';

export default function OsDetail() {
  const { id } = useParams();
  const { currentWorkshop } = useAuth();
  const [os, setOs]         = useState<OsRow | null>(null);
  const [items, setItems]   = useState<ServiceOrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy]     = useState(false);
  const [paperUrl, setPaperUrl] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);

  // OS importada de orçamento em papel → mostra a foto original
  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data } = await supabase.from('paper_imports').select('image_path')
        .eq('service_order_id', id).limit(1).maybeSingle();
      if (!data) { setPaperUrl(null); return; }
      const { data: s } = await supabase.storage.from('os-attachments').createSignedUrl(data.image_path, 60 * 60);
      setPaperUrl(s?.signedUrl ?? null);
    })();
  }, [id]);

  const load = useCallback(async () => {
    if (!id) return;
    const [{ data: o, error }, { data: its }] = await Promise.all([
      supabase.from('service_orders')
        .select('*, customer:customers(*), vehicle:vehicles(*), mechanic:workshop_mechanics(*)')
        .eq('id', id).maybeSingle(),
      supabase.from('service_order_items').select('*').eq('service_order_id', id).order('position'),
    ]);
    if (error) console.error('[OsDetail] erro:', error);
    setOs((o as OsRow) ?? null);
    setNotFound(!o);
    setItems((its as ServiceOrderItem[]) ?? []);
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function changeStatus(status: OsStatus, opts: { channel?: string; declined?: boolean; skipConfirm?: boolean } = {}) {
    if (!os) return;
    const confirms: Partial<Record<OsStatus, string>> = {
      cancelled: opts.declined ? 'O cliente não aprovou o orçamento?' : 'Cancelar esta OS?',
      open: 'Reabrir esta OS para corrigir? Ela volta para "Aberta". Depois é só seguir o fluxo de novo.',
    };
    if (!opts.skipConfirm && confirms[status] && !confirm(confirms[status])) return;
    const { patch, message } = statusChange(os, status, opts);
    setBusy(true);
    const { error } = await supabase.from('service_orders').update(patch).eq('id', os.id);
    setBusy(false);
    if (error) { toast.error('Erro ao atualizar a situação: ' + error.message); return; }
    toast.success(message);
    setApproving(false);
    load();
  }

  /** Envia o orçamento ao cliente (WhatsApp) e marca "Aguardando aprovação" */
  function sendForApproval() {
    if (!os) return;
    if (!items.length || os.price <= 0) {
      if (!confirm('O orçamento ainda está sem valores. Enviar mesmo assim?')) return;
    }
    const wa = waNumber(os.customer?.phone);
    if (wa) window.open(`https://wa.me/${wa}?text=${encodeURIComponent(whatsappText('approval'))}`, '_blank', 'noopener');
    else toast.info('Cliente sem telefone — marcado como enviado. Combine a aprovação por outro meio.');
    changeStatus('awaiting_approval', { skipConfirm: true });
  }

  function whatsappText(kind: 'summary' | 'approval' = 'summary'): string {
    if (!os) return '';
    const shop = currentWorkshop?.business_name ?? 'nossa oficina';
    const name = os.customer?.full_name?.split(' ')[0] ?? '';
    const car = os.vehicle ? ` (${os.vehicle.make} ${os.vehicle.model} · ${os.vehicle.plate})` : '';
    const lines = [
      `Olá${name ? `, ${name}` : ''}! Aqui é da *${shop}*.`,
      kind === 'approval'
        ? `Segue o *orçamento da OS nº ${osNumber(os)}*${car} para sua aprovação:`
        : `Segue o resumo da sua *OS nº ${osNumber(os)}*${car}:`,
      '',
    ];
    if (items.length) {
      for (const i of items) {
        const qty = Number(i.quantity) !== 1 ? `${String(i.quantity).replace('.', ',')}x ` : '';
        lines.push(`• ${qty}${i.description} — ${fmtBRL(i.quantity * i.unit_price)}`);
      }
      if (os.discount > 0) lines.push(`• Desconto — − ${fmtBRL(os.discount)}`);
      lines.push('');
    } else {
      lines.push(`• ${os.title}`, '');
    }
    lines.push(`*Total: ${fmtBRL(os.price)}*`);
    if (kind === 'approval') {
      lines.push('', 'Podemos seguir com o serviço? É só responder *SIM* para aprovar. 👍');
    } else {
      lines.push(`Situação: ${osStatusLabel(os)}`);
    }
    return lines.join('\n');
  }

  if (loading) {
    return (
      <WorkshopLayout>
        <div className="space-y-4 animate-pulse">
          <div className="h-8 w-48 bg-steel-200 rounded-lg" />
          <div className="h-40 bg-white rounded-2xl" />
          <div className="h-64 bg-white rounded-2xl" />
        </div>
      </WorkshopLayout>
    );
  }

  if (notFound || !os) {
    return (
      <WorkshopLayout>
        <div className="card max-w-md text-center py-10 mx-auto">
          <div className="text-4xl mb-2">🔎</div>
          <h1 className="text-xl font-bold">OS não encontrada</h1>
          <p className="text-sm text-steel-500 mt-1">Ela pode ter sido removida ou pertence a outra oficina.</p>
          <Link to="/oficina/os" className="btn-primary mt-5 inline-block">Ver ordens de serviço</Link>
        </div>
      </WorkshopLayout>
    );
  }

  const wa = waNumber(os.customer?.phone);
  const tel = os.customer?.phone?.replace(/\D/g, '');
  const dur = durationMin(os.started_at, os.completed_at);
  // Concluída ou cancelada fica travada: para mudar, é preciso reabrir (protege o histórico)
  const closed = os.status === 'cancelled' || os.status === 'completed';

  return (
    <WorkshopLayout>
      <div className="max-w-6xl mx-auto">
        <Link to="/oficina/os" className="text-sm text-steel-500 hover:text-steel-800">← Ordens de Serviço</Link>

        {/* ── Cabeçalho ── */}
        <div className="card mt-3 mb-5">
          <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-sm font-bold text-steel-500">OS nº {osNumber(os)}</span>
                <span className={`badge ${osStatusColor(os)}`}>{osStatusLabel(os)}</span>
                {os.category && <span className="badge bg-steel-100 text-steel-600">{os.category}</span>}
              </div>
              <h1 className="text-2xl lg:text-3xl font-bold tracking-tight mt-1.5">{os.title}</h1>
              <div className="text-xs text-steel-500 mt-1">Aberta em {fmtDateTime(os.created_at)}</div>
            </div>
            <div className="text-left lg:text-right shrink-0">
              <div className="text-[10px] text-steel-400 uppercase tracking-wider">Total</div>
              <div className="text-3xl font-bold font-display text-steel-900">{fmtBRL(os.price)}</div>
            </div>
          </div>

          {/* Ações */}
          {/* Etapa atual do fluxo */}
          <FlowSteps os={os} />

          <div className="mt-4 pt-4 border-t border-steel-100 flex flex-wrap gap-2">
            {os.status === 'open' && (
              <>
                <button onClick={sendForApproval} disabled={busy} className="btn-primary text-sm !py-2">📤 Enviar orçamento para aprovação</button>
                <button onClick={() => setApproving(true)} disabled={busy} className="btn-ghost text-sm !py-2 border border-steel-200">✅ Cliente já aprovou</button>
              </>
            )}
            {os.status === 'awaiting_approval' && (
              <>
                <button onClick={() => setApproving(true)} disabled={busy} className="btn-primary text-sm !py-2 !bg-signal-500">✅ Cliente aprovou</button>
                <button onClick={() => changeStatus('cancelled', { declined: true })} disabled={busy} className="btn-ghost text-sm !py-2 border border-steel-200 text-alert-600">✕ Não aprovou</button>
                {wa && (
                  <a href={`https://wa.me/${wa}?text=${encodeURIComponent(whatsappText('approval'))}`} target="_blank" rel="noopener noreferrer"
                    className="btn-ghost text-sm !py-2 border border-steel-200">↻ Reenviar orçamento</a>
                )}
              </>
            )}
            {os.status === 'approved' && (
              <button onClick={() => changeStatus('in_progress')} disabled={busy} className="btn-primary text-sm !py-2">▶ Iniciar serviço</button>
            )}
            {os.status === 'in_progress' && (
              <button onClick={() => changeStatus('completed')} disabled={busy} className="btn-primary text-sm !py-2 !bg-signal-500">✓ Concluir</button>
            )}
            <Link to={`/oficina/os/${os.id}/imprimir`} className="btn-ghost text-sm !py-2 border border-steel-200">🖨️ Imprimir / PDF</Link>
            {wa && (
              <a href={`https://wa.me/${wa}?text=${encodeURIComponent(whatsappText())}`} target="_blank" rel="noopener noreferrer"
                className="btn-ghost text-sm !py-2 border border-signal-500/40 text-signal-700">
                💬 Enviar resumo no WhatsApp
              </a>
            )}
            {!closed && (
              <button onClick={() => setEditing(true)} className="btn-ghost text-sm !py-2 border border-steel-200">✏️ Editar dados</button>
            )}
            {os.status === 'completed' && (
              <span className="self-center text-xs text-steel-400">🔒 OS concluída — reabra para editar</span>
            )}
            <div className="flex gap-2 sm:ml-auto">
              {(os.status === 'completed' || os.status === 'cancelled') && (
                os.quote_status === 'declined' ? (
                  <button onClick={() => setApproving(true)} disabled={busy} className="btn-primary text-sm !py-2 !bg-signal-500">✅ Cliente aprovou agora</button>
                ) : (
                  <button onClick={() => changeStatus('open')} disabled={busy} className="btn-ghost text-sm !py-2 text-steel-600">✏️ Corrigir OS</button>
                )
              )}
              {os.status !== 'completed' && os.status !== 'cancelled' && (
                <button onClick={() => changeStatus('cancelled')} disabled={busy} className="btn-ghost text-sm !py-2 text-alert-600 hover:bg-alert-50">✕ Cancelar OS</button>
              )}
            </div>
          </div>

          {/* Como o cliente aprovou */}
          {approving && (
            <div className="mt-3 bg-signal-50 border border-signal-200 rounded-xl p-3 flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-signal-800 mr-1">Como o cliente aprovou?</span>
              {APPROVAL_CHANNELS.map(c => (
                <button key={c.value} onClick={() => changeStatus('approved', { channel: c.value, skipConfirm: true })} disabled={busy}
                  className="text-sm px-3 py-1.5 rounded-lg bg-white border border-signal-300 hover:bg-signal-100 font-medium">
                  {c.label}
                </button>
              ))}
              <button onClick={() => setApproving(false)} className="text-xs text-steel-500 hover:underline ml-auto">Cancelar</button>
            </div>
          )}
        </div>

        <div className="grid lg:grid-cols-3 gap-5">
          {/* ── Coluna principal ── */}
          <div className="lg:col-span-2 space-y-5 min-w-0">
            <OsItemsEditor
              osId={os.id}
              workshopId={os.workshop_id}
              items={items}
              discount={Number(os.discount ?? 0)}
              legacy={{ parts: os.parts_cost, labor: os.labor_cost, price: os.price }}
              readOnly={closed}
              onSaved={load}
            />

            {(os.description || os.notes) && (
              <div className="grid sm:grid-cols-2 gap-4">
                {os.description && (
                  <div className="card">
                    <div className="text-[10px] font-bold text-steel-500 uppercase tracking-widest mb-1.5">Descrição / relato</div>
                    <p className="text-sm text-steel-700 whitespace-pre-line">{os.description}</p>
                  </div>
                )}
                {os.notes && (
                  <div className="card !bg-pending-50 border border-pending-200">
                    <div className="text-[10px] font-bold text-pending-700 uppercase tracking-widest mb-1.5">🔒 Notas internas</div>
                    <p className="text-sm text-pending-900 whitespace-pre-line">{os.notes}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Lateral ── */}
          <div className="space-y-4">
            {/* Cliente */}
            <div className="card">
              <div className="text-[10px] font-bold text-steel-500 uppercase tracking-widest mb-2">Cliente</div>
              {os.customer ? (
                <>
                  <div className="font-bold text-steel-900">{os.customer.full_name}</div>
                  <div className="mt-2 space-y-1 text-sm">
                    {tel && <a href={`tel:${tel}`} className="block text-steel-600 hover:text-brand-600">📞 {fmtPhone(os.customer.phone)}</a>}
                    {wa && <a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer" className="block text-signal-700 hover:underline">💬 WhatsApp</a>}
                    {os.customer.email && <div className="text-steel-600 truncate">✉️ {os.customer.email}</div>}
                    {os.customer.cpf && <div className="text-steel-500">🪪 {os.customer.cpf}</div>}
                  </div>
                </>
              ) : (
                <EmptyLink text="Sem cliente vinculado" onClick={closed ? undefined : () => setEditing(true)} />
              )}
            </div>

            {/* Veículo */}
            <div className="card">
              <div className="text-[10px] font-bold text-steel-500 uppercase tracking-widest mb-2">Veículo</div>
              {os.vehicle ? (
                <div className="flex items-center gap-3">
                  <LicensePlate plate={os.vehicle.plate} size="sm" />
                  <div className="min-w-0 text-sm">
                    <div className="font-semibold text-steel-900 truncate">{os.vehicle.make} {os.vehicle.model}</div>
                    {(os.vehicle.year || os.vehicle.color) && (
                      <div className="text-steel-500">{[os.vehicle.year, os.vehicle.color].filter(Boolean).join(' · ')}</div>
                    )}
                    {os.km_reading != null && <div className="text-steel-500">{os.km_reading.toLocaleString('pt-BR')} km</div>}
                  </div>
                </div>
              ) : (
                <EmptyLink text="Sem veículo vinculado" onClick={closed ? undefined : () => setEditing(true)} />
              )}
            </div>

            {/* Recomendado para o futuro (base da reativação de clientes) */}
            {os.customer_id && (
              <Recommendations workshopId={os.workshop_id} customerId={os.customer_id}
                vehicleId={os.vehicle_id} osId={os.id} />
            )}

            {/* Responsável */}
            <div className="card">
              <div className="text-[10px] font-bold text-steel-500 uppercase tracking-widest mb-2">Responsável</div>
              {os.mechanic ? (
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-full bg-brand-500/10 grid place-items-center text-brand-600 font-bold">{os.mechanic.name.charAt(0).toUpperCase()}</div>
                  <div className="text-sm">
                    <div className="font-semibold text-steel-900">{os.mechanic.name}</div>
                    {os.mechanic.specialty && <div className="text-steel-500">{os.mechanic.specialty}</div>}
                  </div>
                </div>
              ) : (
                <EmptyLink text="Nenhum mecânico definido" onClick={closed ? undefined : () => setEditing(true)} />
              )}
              {os.estimated_hours != null && (
                <div className="text-xs text-steel-500 mt-2">⏱ Tempo estimado: {String(os.estimated_hours).replace('.', ',')}h</div>
              )}
            </div>

            {/* Orçamento original (importado do papel) */}
            {paperUrl && (
              <a href={paperUrl} target="_blank" rel="noopener noreferrer" className="card block hover:shadow-md transition">
                <div className="text-[10px] font-bold text-steel-500 uppercase tracking-widest mb-2">📷 Orçamento original</div>
                <img src={paperUrl} alt="Orçamento em papel" className="w-full max-h-48 object-cover rounded-lg" />
                <div className="text-xs text-brand-600 font-semibold mt-2">Abrir foto →</div>
              </a>
            )}

            {/* Linha do tempo */}
            <div className="card">
              <div className="text-[10px] font-bold text-steel-500 uppercase tracking-widest mb-3">Linha do tempo</div>
              <ol className="space-y-3">
                {os.scheduled_at && <Step label="Agendada para" value={fmtDateTime(os.scheduled_at)} done />}
                <Step label="Aberta" value={fmtDateTime(os.created_at)} done />
                {os.approval_requested_at && <Step label="Orçamento enviado" value={fmtDateTime(os.approval_requested_at)} done />}
                {os.approved_at && (
                  <Step label={`Aprovado${os.approval_channel ? ` (${APPROVAL_CHANNELS.find(c => c.value === os.approval_channel)?.label.replace(/^\S+\s/, '').toLowerCase() ?? os.approval_channel})` : ''}`}
                    value={fmtDateTime(os.approved_at)} done />
                )}
                <Step label="Iniciada" value={os.started_at ? fmtDateTime(os.started_at) : '—'} done={!!os.started_at} />
                <Step label={os.status === 'cancelled' ? 'Cancelada' : 'Concluída'}
                  value={os.completed_at ? fmtDateTime(os.completed_at) : os.status === 'cancelled' ? '✕' : '—'}
                  done={!!os.completed_at || os.status === 'cancelled'} />
              </ol>
              {dur !== null && (
                <div className="mt-3 pt-3 border-t border-steel-100 text-xs text-steel-500">
                  Duração do serviço: <strong className="text-brand-600">{fmtDur(dur)}</strong>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {editing && currentWorkshop && (
        <OsEditModal
          os={os}
          workshopId={os.workshop_id}
          onClose={() => setEditing(false)}
          onSaved={() => { setEditing(false); load(); }}
        />
      )}
    </WorkshopLayout>
  );
}

/** Barra de etapas: Aberta → Aguardando aprovação → Aprovada → Em andamento → Concluída */
const FLOW: { key: OsStatus; label: string }[] = [
  { key: 'open',              label: 'Aberta' },
  { key: 'awaiting_approval', label: 'Aguardando aprovação' },
  { key: 'approved',          label: 'Aprovada' },
  { key: 'in_progress',       label: 'Em andamento' },
  { key: 'completed',         label: 'Concluída' },
];

function FlowSteps({ os }: { os: { status: OsStatus; quote_status?: string | null } }) {
  if (os.status === 'cancelled') {
    return (
      <div className={`mt-4 text-sm font-semibold rounded-xl px-3 py-2 ${os.quote_status === 'declined' ? 'bg-pending-50 text-pending-800' : 'bg-steel-100 text-steel-600'}`}>
        {os.quote_status === 'declined' ? '📝 Orçamento não aprovado pelo cliente' : '✕ OS cancelada'}
      </div>
    );
  }
  const current = FLOW.findIndex(s => s.key === os.status);
  return (
    <ol className="mt-4 flex items-center gap-1 overflow-x-auto pb-1">
      {FLOW.map((s, i) => {
        const done = i < current, active = i === current;
        return (
          <li key={s.key} className="flex items-center gap-1 shrink-0">
            <span className={`flex items-center gap-1.5 text-xs font-semibold rounded-full px-2.5 py-1 ${
              active ? 'bg-brand-500 text-white' : done ? 'bg-signal-100 text-signal-700' : 'bg-steel-100 text-steel-400'}`}>
              <span>{done ? '✓' : i + 1}</span>{s.label}
            </span>
            {i < FLOW.length - 1 && <span className={`w-4 h-px ${done ? 'bg-signal-500' : 'bg-steel-200'}`} />}
          </li>
        );
      })}
    </ol>
  );
}

function Step({ label, value, done }: { label: string; value: string; done: boolean }) {
  return (
    <li className="flex items-start gap-3">
      <span className={`mt-1 h-2.5 w-2.5 rounded-full shrink-0 ${done ? 'bg-signal-500' : 'bg-steel-200'}`} />
      <div className="flex-1 flex justify-between gap-2 text-sm">
        <span className={done ? 'text-steel-700 font-medium' : 'text-steel-400'}>{label}</span>
        <span className={done ? 'text-steel-600' : 'text-steel-400'}>{value}</span>
      </div>
    </li>
  );
}

function EmptyLink({ text, onClick }: { text: string; onClick?: () => void }) {
  return (
    <div className="text-sm text-steel-400">
      {text}
      {onClick && <button onClick={onClick} className="block mt-1 text-brand-600 font-semibold hover:underline">+ Adicionar</button>}
    </div>
  );
}
