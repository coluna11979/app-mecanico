import { ReactNode } from 'react';

export default function EmptyState({
  icon = '📋',
  title,
  description,
  actions,
}: {
  icon?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="card text-center py-12 sm:py-16">
      <div className="text-5xl sm:text-6xl mb-3 select-none" aria-hidden>
        {icon}
      </div>
      <p className="text-lg font-bold text-steel-800">{title}</p>
      {description && <p className="text-sm text-steel-500 mt-1.5 max-w-md mx-auto">{description}</p>}
      {actions && <div className="mt-5 flex flex-wrap gap-2 justify-center">{actions}</div>}
    </div>
  );
}
