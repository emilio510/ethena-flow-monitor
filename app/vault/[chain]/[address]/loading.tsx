import { Header } from "@/components/header"

/** Skeleton for the vault drill-down. Cold render involves the V1 probe
 *  + V2 fallback + adapter chain — typically 3-5s. */
export default function Loading() {
  return (
    <main>
      <Header />
      <section className="px-6 pb-12 pt-8">
        <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-[1.5fr_1fr]">
          <div className="h-[100px] animate-pulse rounded-[12px] bg-[color:rgba(255,255,255,0.04)]" />
          <div className="h-[100px] animate-pulse rounded-[12px] bg-[color:rgba(255,255,255,0.04)]" />
        </div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-[78px] animate-pulse rounded-[12px] border border-[var(--color-border)] bg-[color:rgba(255,255,255,0.04)]"
            />
          ))}
        </div>
        <div className="mt-8 h-[280px] animate-pulse rounded-[12px] border border-[var(--color-border)] bg-[color:rgba(255,255,255,0.04)]" />
        <div className="mt-8 h-[200px] animate-pulse rounded-[12px] border border-[var(--color-border)] bg-[color:rgba(255,255,255,0.04)]" />
      </section>
    </main>
  )
}
