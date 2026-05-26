import { Header } from "@/components/header"

/** Skeleton for View A — rendered as a Suspense fallback while the slow
 *  loadFootprint() server pass runs. Matches the page's KPI strip + footprint
 *  table + idle table layout so the user sees the structure immediately. */
export default function Loading() {
  return (
    <main>
      <Header />
      <section className="px-6 py-6">
        <div className="mb-6 h-[120px] w-full animate-pulse rounded-[12px] bg-[color:rgba(255,255,255,0.04)]" />
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="h-[78px] animate-pulse rounded-[12px] border border-[var(--color-border)] bg-[color:rgba(255,255,255,0.04)]"
            />
          ))}
        </div>
        <div className="mt-6 h-[340px] animate-pulse rounded-[12px] border border-[var(--color-border)] bg-[color:rgba(255,255,255,0.04)]" />
        <div className="mt-8 h-[300px] animate-pulse rounded-[12px] border border-[var(--color-border)] bg-[color:rgba(255,255,255,0.04)]" />
      </section>
    </main>
  )
}
