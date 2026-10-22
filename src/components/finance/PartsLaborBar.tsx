/** Divisão geral peças × mão de obra dentro dos serviços (fecha sempre em 100%) */
export default function PartsLaborBar({ partsPct }: { partsPct: number }) {
  const labor = 100 - partsPct;
  return (
    <div className="mt-4 pt-3 border-t border-steel-100">
      <div className="text-[11px] font-semibold text-steel-500 mb-1.5">Dentro dos serviços</div>
      <div className="flex h-2.5 rounded-full overflow-hidden bg-steel-100">
        <div className="bg-steel-500" style={{ width: `${partsPct}%` }} />
        <div className="bg-brand-500" style={{ width: `${labor}%` }} />
      </div>
      <div className="flex justify-between text-xs mt-1.5 text-steel-600">
        <span className="flex items-center gap-1.5"><i className="w-2 h-2 rounded-sm bg-steel-500 inline-block" />Peças <strong>{partsPct}%</strong></span>
        <span className="flex items-center gap-1.5"><i className="w-2 h-2 rounded-sm bg-brand-500 inline-block" />Mão de obra <strong>{labor}%</strong></span>
      </div>
    </div>
  );
}
