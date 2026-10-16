export default function OsSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card animate-pulse">
          <div className="flex items-start gap-4">
            <div className="h-14 w-24 bg-steel-100 rounded-md shrink-0" />
            <div className="flex-1 min-w-0 space-y-2">
              <div className="flex gap-2">
                <div className="h-5 w-20 bg-steel-100 rounded-full" />
                <div className="h-5 w-24 bg-steel-100 rounded-full" />
              </div>
              <div className="h-4 w-2/3 bg-steel-100 rounded" />
              <div className="h-3 w-1/2 bg-steel-100 rounded" />
            </div>
            <div className="text-right shrink-0">
              <div className="h-6 w-20 bg-steel-100 rounded" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
