import { MouseEvent } from 'react';
import type { ServiceOrder, Customer, Vehicle, WorkshopMechanic, OsStatus } from '@/types/database';
import LicensePlate from './LicensePlate';
import {
  osLabel, osColor, osBorder,
  durationMin, fmtDur, fmtDate, fmtBRL,
  shortOsId, waNumber,
} from './osHelpers';

export type OsRow = ServiceOrder & {
  customer: Customer | null;
  vehicle: Vehicle | null;
  mechanic: WorkshopMechanic | null;
};

interface OsCardProps {
  os: OsRow;
  onClick: () => void;
  onChangeStatus?: (status: OsStatus) => void;
  onCopyLink?: () => void;
}

export default function OsCard({ os, onClick, onChangeStatus, onCopyLink }: OsCardProps) {
  const dur = durationMin(os.started_at, os.completed_at);
  const wa = waNumber(os.customer?.phone);
  const tel = os.customer?.phone?.replace(/\D/g, '') ?? null;
  const isScheduledFuture = os.scheduled_at && os.status === 'open';

  // Evita propagar click pro card principal
  const stop = (e: MouseEvent) => e.stopPropagation();

  const handleQuick = (status: OsStatus) => (e: MouseEvent) => {
    e.stopPropagation();
    onChangeStatus?.(status);
  };

  return (
    <div
      onClick={onClick}
      className={`card w-full text-left cursor-pointer hover:shadow-md transition hover:-translate-y-0.5 active:scale-[0.99] border-l-4 ${osBorder(os.status)}`}
    >
      <div className="flex items-start gap-3 sm:gap-4">
        {/* Placa */}
        {os.vehicle && <LicensePlate plate={os.vehicle.plate} size="sm" />}

        {/* Conteúdo principal */}
        <div className="flex-1 min-w-0">
          {/* linha 1: número + data + status + categoria */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            <span className="font-mono font-bold text-steel-700">#{shortOsId(os.id)}</span>
            <span className="text-steel-400">·</span>
            <span className="text-steel-500">{fmtDate(os.created_at)}</span>
            <span className={`badge ${osColor(os.status)}`}>{osLabel(os.status)}</span>
            {os.category && (
              <span className="badge bg-steel-100 text-steel-600">{os.category}</span>
            )}
            {isScheduledFuture && (
              <span className="badge bg-brand-50 text-brand-700 border border-brand-200">
                📅 {fmtDate(os.scheduled_at!)}
              </span>
            )}
          </div>

          {/* linha 2: título */}
          <div className="font-bold text-steel-800 mt-1 truncate">{os.title}</div>

          {/* linha 3: cliente + contatos + mecânico */}
          {(os.customer || os.mechanic) && (
            <div className="text-xs text-steel-500 mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
              {os.customer && (
                <span className="inline-flex items-center gap-1">
                  <span>👤</span>
                  <span className="font-medium text-steel-700">{os.customer.full_name}</span>
                </span>
              )}
              {tel && (
                <a
                  href={`tel:${tel}`}
                  onClick={stop}
                  className="inline-flex items-center gap-1 text-steel-600 hover:text-brand-600 hover:underline"
                  title="Ligar"
                >
                  📞 {os.customer?.phone}
                </a>
              )}
              {wa && (
                <a
                  href={`https://wa.me/${wa}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={stop}
                  className="inline-flex items-center gap-1 text-signal-600 hover:text-signal-700 hover:underline"
                  title="WhatsApp"
                >
                  💬 WhatsApp
                </a>
              )}
              {os.mechanic && (
                <span className="inline-flex items-center gap-1">
                  <span>🔧</span>
                  <span className="font-medium text-steel-700">{os.mechanic.name}</span>
                </span>
              )}
            </div>
          )}

          {/* linha 4: veículo */}
          {os.vehicle && (
            <div className="text-xs text-steel-500 mt-1 truncate">
              🚗 {os.vehicle.make} {os.vehicle.model}
              {os.vehicle.year ? ` · ${os.vehicle.year}` : ''}
              {os.km_reading != null ? ` · ${os.km_reading.toLocaleString('pt-BR')} km` : ''}
            </div>
          )}

          {/* linha 5: breakdown peças/MO */}
          {(os.parts_cost != null || os.labor_cost != null) && (
            <div className="text-[11px] text-steel-500 mt-1 flex flex-wrap gap-x-3">
              {os.parts_cost != null && <span>Peças <strong className="text-steel-700">{fmtBRL(os.parts_cost)}</strong></span>}
              {os.labor_cost != null && <span>Mão de obra <strong className="text-steel-700">{fmtBRL(os.labor_cost)}</strong></span>}
            </div>
          )}

          {/* duração total se concluído */}
          {dur !== null && (
            <div className="text-[11px] text-steel-400 mt-1">⏱ {fmtDur(dur)}</div>
          )}
        </div>

        {/* Total à direita */}
        <div className="text-right shrink-0">
          <div className="text-[10px] text-steel-400 uppercase tracking-wider">Total</div>
          <div className="text-lg sm:text-xl font-bold font-display text-steel-900">
            {fmtBRL(os.price)}
          </div>
        </div>
      </div>

      {/* Ações rápidas */}
      {(onChangeStatus || onCopyLink) && os.status !== 'cancelled' && (
        <div className="mt-3 pt-3 border-t border-steel-100 flex flex-wrap gap-2">
          {os.status === 'open' && onChangeStatus && (
            <button
              onClick={handleQuick('in_progress')}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-brand-50 text-brand-700 hover:bg-brand-100 border border-brand-200 transition"
            >
              ▶ Iniciar
            </button>
          )}
          {os.status === 'in_progress' && onChangeStatus && (
            <button
              onClick={handleQuick('completed')}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-signal-50 text-signal-700 hover:bg-signal-100 border border-signal-200 transition"
            >
              ✓ Concluir
            </button>
          )}
          {onCopyLink && (
            <button
              onClick={(e) => { e.stopPropagation(); onCopyLink(); }}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-steel-50 text-steel-700 hover:bg-steel-100 border border-steel-200 transition"
            >
              📋 Copiar link
            </button>
          )}
          {os.status !== 'completed' && onChangeStatus && (
            <button
              onClick={handleQuick('cancelled')}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-white text-alert-600 hover:bg-alert-50 border border-steel-200 transition ml-auto"
            >
              ✕ Cancelar
            </button>
          )}
        </div>
      )}
    </div>
  );
}
