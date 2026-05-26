import { Header } from "@/components/header"

/** Skeleton for the reserve drill-down. The page can take 5-10s to render
 *  on cache miss because it walks every borrower in the market. */
export default function Loading() {
  return (
    <main>
      <Header />
      <section className="px-6 pb-12 pt-8">
        <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-[1.5fr_1fr]">
          <div className="h-[100px] animate-pulse rounded-[12px] bg-[color:rgba(255,255,255,0.04)]" />
          <div className="h-[100px] animate-pulse rounded-[12px] bg-[color:rgba(255,255,255,0.04)]" />
        </div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="h-[78px] animate-pulse rounded-[12px] border border-[var(--color-border)] bg-[color:rgba(255,255,255,0.04)]"
            />
          ))}
        </div>
        <div className="mt-6 h-[260px] animate-pulse rounded-[12px] border border-[var(--color-border)] bg-[color:rgba(255,255,255,0.04)]" />
        <div className="mt-6 h-[400px] animate-pulse rounded-[12px] border border-[var(--color-border)] bg-[color:rgba(255,255,255,0.04)]" />
      </section>
    </main>
  )
}
