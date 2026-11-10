export default function MoneyTrackerLoading() {
  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] pt-20 pb-36 lg:pl-64 flex flex-col">
      <header className="fixed top-0 left-0 right-0 z-30 h-16 border-b border-white/[0.06] bg-[#10141a]/80 backdrop-blur-2xl lg:left-64">
        <div className="flex h-full items-center justify-between px-4 sm:px-6">
          <div className="h-6 w-36 rounded-lg bg-white/5 animate-pulse" />
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-white/5 animate-pulse" />
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-4 sm:pt-6 space-y-6">
        {/* Navigation Skeleton */}
        <div className="flex items-center gap-2 overflow-hidden py-1">
          <div className="h-10 w-28 rounded-full bg-white/5 animate-pulse shrink-0" />
          <div className="h-10 w-32 rounded-full bg-white/5 animate-pulse shrink-0" />
          <div className="h-10 w-32 rounded-full bg-white/5 animate-pulse shrink-0" />
          <div className="h-10 w-28 rounded-full bg-white/5 animate-pulse shrink-0" />
        </div>

        {/* KPI Skeleton Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5 sm:gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="aura-panel p-4 sm:p-5 rounded-2xl sm:rounded-3xl border border-white/5 animate-pulse space-y-3"
            >
              <div className="h-3.5 w-24 rounded bg-white/10" />
              <div className="h-8 w-36 rounded-lg bg-white/10" />
              <div className="h-3 w-28 rounded bg-white/5" />
            </div>
          ))}
        </div>

        {/* Content Skeleton Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3.5 sm:gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="aura-panel h-48 rounded-2xl sm:rounded-3xl border border-white/5 animate-pulse bg-white/[0.02]"
            />
          ))}
        </div>
      </main>
    </div>
  );
}
