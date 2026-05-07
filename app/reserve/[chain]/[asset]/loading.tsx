import { Header } from "@/components/header"

/** Skeleton for the reserve drill-down. The page can take 5-10s to render
 *  on cache miss because it walks every borrower in the market. */
export default function Loading() {
  return (
    <main>
      <Header />
      <section className="px-8 pb-12">
        <div className="mb-6 h-[40px] w-[280px] animate-pulse rounded-md bg-[var(--color-bg-card)]" />
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="h-[78px] animate-pulse rounded-md border border-[var(--color-border)] bg-[var(--color-bg-card)]"
            />
          ))}
        </div>
        <div className="mt-6 h-[260px] animate-pulse rounded-md border border-[var(--color-border)] bg-[var(--color-bg-card)]" />
        <div className="mt-6 h-[400px] animate-pulse rounded-md border border-[var(--color-border)] bg-[var(--color-bg-card)]" />
      </section>
    </main>
  )
}
