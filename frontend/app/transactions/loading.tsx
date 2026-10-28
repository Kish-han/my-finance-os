export default function TransactionsLoading() {
  return (
    <main className="min-h-screen bg-[#10141a] text-[#dfe2eb] pt-20 pb-36 relative overflow-hidden">
      <div className="pointer-events-none fixed -left-32 top-10 h-96 w-96 rounded-full bg-[#10b981]/5 blur-[150px]" />
      <div className="pointer-events-none fixed -right-32 top-1/4 h-[30rem] w-[30rem] rounded-full bg-[#8b5cf6]/5 blur-[160px]" />

      <header className="fixed top-0 left-0 right-0 z-50 border-b border-white/[0.06] bg-[#10141a]/80 backdrop-blur-2xl">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-xl bg-white/5 animate-pulse" />
            <div className="h-4 w-36 rounded-lg bg-white/5 animate-pulse" />
          </div>
        </div>
      </header>

      <div className="relative mx-auto max-w-4xl px-4 sm:px-6 space-y-6">
        {/* Header & Date Presets Skeleton */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="h-3 w-32 rounded bg-white/10 animate-pulse" />
            <div className="h-8 w-48 rounded bg-white/10 animate-pulse" />
          </div>
          <div className="h-10 w-36 rounded-xl bg-white/10 animate-pulse" />
        </div>

        {/* Date presets pills skeleton */}
        <div className="flex gap-2 overflow-hidden py-1">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-8 w-24 rounded-full bg-white/5 animate-pulse shrink-0" />
          ))}
        </div>

        {/* Hero Totals Panel Skeleton */}
        <section className="aura-card-obsidian rounded-[2rem] p-6 sm:p-8 border border-white/10 shadow-2xl animate-pulse space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <div className="h-3 w-20 rounded bg-white/10" />
              <div className="h-8 w-28 rounded-lg bg-white/10" />
            </div>
            <div className="space-y-2">
              <div className="h-3 w-20 rounded bg-white/10" />
              <div className="h-8 w-28 rounded-lg bg-white/10" />
            </div>
            <div className="space-y-2 col-span-2 sm:col-span-1">
              <div className="h-3 w-20 rounded bg-white/10" />
              <div className="h-8 w-28 rounded-lg bg-white/10" />
            </div>
          </div>
        </section>

        {/* Search & Filter Bar Skeleton */}
        <div className="h-12 rounded-2xl bg-white/5 border border-white/10 animate-pulse" />

        {/* Transactions List Skeleton */}
        <div className="space-y-2.5">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="aura-panel h-18 rounded-2xl border border-white/10 bg-white/5 p-4 flex items-center justify-between animate-pulse"
            >
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-white/10 shrink-0" />
                <div className="space-y-2">
                  <div className="h-3.5 w-36 rounded bg-white/10" />
                  <div className="h-2.5 w-24 rounded bg-white/5" />
                </div>
              </div>
              <div className="space-y-2 text-right">
                <div className="h-4 w-20 rounded bg-white/10 ml-auto" />
                <div className="h-3 w-14 rounded bg-white/5 ml-auto" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
