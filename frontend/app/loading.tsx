export default function DashboardLoading() {
  return (
    <main className="min-h-screen bg-[#10141a] text-[#dfe2eb] pt-20 pb-36 relative overflow-hidden">
      {/* Ambient background glows */}
      <div className="pointer-events-none absolute -top-40 left-1/4 h-[500px] w-[500px] rounded-full bg-[#10b981]/5 blur-[130px]" />
      <div className="pointer-events-none absolute top-1/3 -right-40 h-[600px] w-[600px] rounded-full bg-[#3b82f6]/5 blur-[150px]" />

      {/* Top Header Placeholder */}
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-white/[0.06] bg-[#10141a]/80 backdrop-blur-2xl">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-xl bg-white/5 animate-pulse" />
            <div className="h-4 w-28 rounded-lg bg-white/5 animate-pulse" />
          </div>
          <div className="h-7 w-20 rounded-full bg-white/5 animate-pulse" />
        </div>
      </header>

      <div className="relative z-10 mx-auto max-w-5xl px-3 sm:px-6 space-y-6">
        {/* Hero Net Worth Skeleton */}
        <section className="aura-card-obsidian relative overflow-hidden rounded-[2.5rem] p-6 sm:p-9 border border-white/10 shadow-2xl animate-pulse">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="h-3 w-40 rounded bg-white/10" />
              <div className="h-6 w-24 rounded-full bg-white/10" />
            </div>
            <div className="h-14 sm:h-20 w-64 max-w-full rounded-2xl bg-white/10 mt-2" />
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-4 border-t border-white/10">
              <div className="h-12 rounded-xl bg-white/5" />
              <div className="h-12 rounded-xl bg-white/5" />
              <div className="h-12 rounded-xl bg-white/5 col-span-2 sm:col-span-1" />
            </div>
          </div>
        </section>

        {/* Quick Actions 4-Column Skeleton */}
        <div className="grid grid-cols-4 gap-2 sm:gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-20 sm:h-24 rounded-2xl bg-[#181c22]/90 border border-white/[0.08] animate-pulse flex flex-col items-center justify-center gap-2 p-2"
            >
              <div className="h-8 w-8 rounded-xl bg-white/10" />
              <div className="h-2.5 w-12 rounded bg-white/10" />
            </div>
          ))}
        </div>

        {/* Upcoming Payments Skeleton */}
        <section className="aura-panel p-5 sm:p-7 rounded-[2rem] border border-white/10 space-y-4 animate-pulse">
          <div className="flex items-center justify-between">
            <div className="h-4 w-44 rounded bg-white/10" />
            <div className="h-7 w-28 rounded-xl bg-white/5" />
          </div>
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="h-16 rounded-2xl bg-white/5" />
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
