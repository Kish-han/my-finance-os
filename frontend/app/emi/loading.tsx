export default function EmiLoading() {
  return (
    <main className="min-h-screen bg-[#10141a] text-[#dfe2eb] pt-20 pb-36 relative overflow-hidden">
      <div className="pointer-events-none fixed -left-32 top-10 h-96 w-96 rounded-full bg-[#10b981]/5 blur-[150px]" />
      <div className="pointer-events-none fixed -right-32 top-1/4 h-[30rem] w-[30rem] rounded-full bg-[#8b5cf6]/5 blur-[160px]" />

      <header className="fixed top-0 left-0 right-0 z-50 border-b border-white/[0.06] bg-[#10141a]/80 backdrop-blur-2xl">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-xl bg-white/5 animate-pulse" />
            <div className="h-4 w-32 rounded-lg bg-white/5 animate-pulse" />
          </div>
        </div>
      </header>

      <div className="relative mx-auto max-w-4xl px-4 sm:px-6 space-y-6">
        {/* Metric summary skeleton */}
        <section className="aura-card-obsidian rounded-[2.5rem] p-7 sm:p-9 border border-white/10 shadow-2xl animate-pulse space-y-4">
          <div className="h-3 w-40 rounded bg-white/10" />
          <div className="h-14 sm:h-20 w-64 rounded-2xl bg-white/10" />
          <div className="grid grid-cols-2 gap-3 pt-3 border-t border-white/10">
            <div className="h-10 rounded-xl bg-white/5" />
            <div className="h-10 rounded-xl bg-white/5" />
          </div>
        </section>

        {/* Loan list items */}
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="aura-panel h-28 rounded-2xl border border-white/10 bg-white/5 animate-pulse" />
          ))}
        </div>
      </div>
    </main>
  );
}
