export function Logo({ size = 32, withText = true }: { size?: number; withText?: boolean }) {
  return (
    <div className="inline-flex items-center gap-2.5">
      <svg width={size} height={size} viewBox="0 0 64 64" aria-label="MecânicoApp">
        <defs>
          <linearGradient id="lg-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#FF7A38" />
            <stop offset="100%" stopColor="#E64500" />
          </linearGradient>
        </defs>
        <rect width="64" height="64" rx="14" fill="#0B1117" />
        <path
          fill="url(#lg-grad)"
          d="M32 10c-7.2 0-13 5.8-13 13 0 4.6 2.4 8.6 6 10.9V50a3 3 0 0 0 3 3h8a3 3 0 0 0 3-3V33.9c3.6-2.3 6-6.3 6-10.9 0-7.2-5.8-13-13-13Zm0 6.5a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13Z"
        />
        <circle cx="32" cy="23" r="3" fill="#0B1117" />
      </svg>
      {withText && (
        <span className="font-display font-bold text-lg tracking-tight">
          Mecânico<span className="text-brand-500">App</span>
        </span>
      )}
    </div>
  );
}
