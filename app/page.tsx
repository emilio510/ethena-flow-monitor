import { loadFootprint } from "@/lib/views/footprint"
import { Header } from "@/components/header"
import { KpiCard } from "@/components/kpi-card"
import { KpiStrip } from "@/components/kpi-strip"
import { FootprintTable } from "@/components/footprint-table"
import { IdleBackingTable } from "@/components/idle-backing-table"
import { fmtUsd, fmtPct } from "@/lib/format"

// 1-hour ISR: Ethena's exposure shifts on the order of hours/days, so a
// stale-by-up-to-1h cache hit beats forcing every visitor through the
// 8-15s cold render. The unlucky 1-per-hour visitor still gets the slow
// path in the background while we serve them the previous render.
export const revalidate = 3600
// View A walks every borrower across every market Ethena touches; this
// can run 30-60s on cold load against the busy ethereum + base markets.
export const maxDuration = 90

export default async function Page() {
  const renderedAt = Date.now()
  const {
    rows,
    failedWallets,
    weightedRecursion,
    weightedRecursionApprox,
    deployedUsd,
    idle,
    trueRecursionShare,
  } = await loadFootprint()
  const reserveCount = new Set(rows.map((r) => `${r.marketKey}:${r.reserveSymbol}`)).size
  const chainCount = new Set(rows.map((r) => r.chain)).size
  const anomalyCount = rows.filter((r) => r.isAnomalyBorrow).length
  const totalBacking = deployedUsd + idle.totalUsd

  return (
    <main>
      <Header renderedAt={renderedAt} failedWallets={failedWallets} />
      <section className="px-6 py-6">
        <h1 className="mb-4 text-xl uppercase tracking-wider text-[var(--color-accent)]">
          Ethena footprint
        </h1>
        <KpiStrip>
          <KpiCard label="Deployed in lending" value={fmtUsd(deployedUsd)} />
          <KpiCard
            label="Idle backing"
            value={fmtUsd(idle.totalUsd)}
            subValue={
              idle.uncoveredChains.length > 0
                ? `+ ${idle.uncoveredChains.join(", ")} pending`
                : undefined
            }
          />
          <KpiCard label="Total backing" value={fmtUsd(totalBacking)} />
          <KpiCard
            label="True recursion"
            value={fmtPct(trueRecursionShare)}
            subValue="recursive ÷ total backing"
            tone="recursion"
          />
          <KpiCard
            label="Recursion (deployed)"
            value={fmtPct(weightedRecursion)}
            subValue={
              weightedRecursionApprox
                ? "$-weighted, approx — sampled"
                : "$-weighted across reserves"
            }
          />
          <KpiCard label="Chains active" value={String(chainCount)} />
          <KpiCard label="Reserves touched" value={String(reserveCount)} />
          <KpiCard label="Borrow anomalies" value={String(anomalyCount)} />
        </KpiStrip>
        <div className="mt-6">
          <FootprintTable rows={rows} />
        </div>
        <div className="mt-8">
          <IdleBackingTable
            rows={idle.rows}
            total={idle.totalUsd}
            uncoveredChains={idle.uncoveredChains}
          />
        </div>
      </section>
    </main>
  )
}
