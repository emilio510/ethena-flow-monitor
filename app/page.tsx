import { loadFootprint } from "@/lib/views/footprint"
import { Header } from "@/components/header"
import { KpiCard } from "@/components/kpi-card"
import { KpiStrip } from "@/components/kpi-strip"
import { FootprintTable } from "@/components/footprint-table"
import { fmtUsd, fmtPct } from "@/lib/format"

export const revalidate = 300
// View A walks every borrower across every market Ethena touches; this
// can run 30-60s on cold load against the busy ethereum + base markets.
export const maxDuration = 90

export default async function Page() {
  const { rows, freshness, failedWallets, weightedRecursion, weightedRecursionApprox } =
    await loadFootprint()
  const totalSupplied = rows
    .filter((r) => !r.isAnomalyBorrow)
    .reduce((a, r) => a + r.ethenaSuppliedUsd, 0)
  const reserveCount = new Set(rows.map((r) => `${r.marketKey}:${r.reserveSymbol}`)).size
  const chainCount = new Set(rows.map((r) => r.chain)).size
  const anomalyCount = rows.filter((r) => r.isAnomalyBorrow).length

  return (
    <main>
      <Header freshness={freshness} failedWallets={failedWallets} />
      <section className="px-6 py-6">
        <h1 className="mb-4 text-xl uppercase tracking-wider text-[var(--color-accent)]">
          Ethena footprint
        </h1>
        <KpiStrip>
          <KpiCard label="Total supplied" value={fmtUsd(totalSupplied)} />
          <KpiCard label="Reserves touched" value={String(reserveCount)} />
          <KpiCard label="Chains active" value={String(chainCount)} />
          <KpiCard label="Borrow anomalies" value={String(anomalyCount)} />
          <KpiCard
            label="Weighted recursion"
            value={fmtPct(weightedRecursion)}
            subValue={
              weightedRecursionApprox
                ? "$-weighted, approx — sampled"
                : "$-weighted across reserves"
            }
            tone="recursion"
          />
        </KpiStrip>
        <div className="mt-6">
          <FootprintTable rows={rows} />
        </div>
      </section>
    </main>
  )
}
