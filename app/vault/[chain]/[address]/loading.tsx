import { Header } from "@/components/header"

/** Skeleton for the vault drill-down. Cold render involves the V1 probe
 *  + V2 fallback + adapter chain — typically 3-5s. */
export default function Loading() {
  return (
    <main>
      <Header />
      <section className="px-8 pb-12">
        <div className="mb-6 h-[40px] w-[320px] animate-pulse rounded-md bg-[var(--color-bg-card)]" />
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-[78px] animate-pulse rounded-md border border-[var(--color-border)] bg-[var(--color-bg-card)]"
            />
          ))}
        </div>
        <div className="mt-8 h-[280px] animate-pulse rounded-md border border-[var(--color-border)] bg-[var(--color-bg-card)]" />
        <div className="mt-8 h-[200px] animate-pulse rounded-md border border-[var(--color-border)] bg-[var(--color-bg-card)]" />
      </section>
    </main>
  )
}
