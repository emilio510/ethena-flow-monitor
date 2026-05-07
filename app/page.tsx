import { loadFootprint } from "@/lib/views/footprint"
import { Header } from "@/components/header"
import { KpiCard } from "@/components/kpi-card"
import { KpiStrip } from "@/components/kpi-strip"
import { FootprintTable } from "@/components/footprint-table"
import { IdleBackingTable } from "@/components/idle-backing-table"
import { DelegatedBackingTable } from "@/components/delegated-backing-table"
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
    ethena,
  } = await loadFootprint()
  const reserveCount = new Set(rows.map((r) => `${r.marketKey}:${r.reserveSymbol}`)).size
  const chainCount = new Set(rows.map((r) => r.chain)).size
  const anomalyCount = rows.filter((r) => r.isAnomalyBorrow).length
  // Use Ethena's official total when their API is up; fall back to our
  // independently-measured on-chain total otherwise.
  const totalBacking = ethena.failed
    ? deployedUsd + idle.totalUsd
    : ethena.totalBackingUsd

  return (
    <main>
      <Header renderedAt={renderedAt} failedWallets={failedWallets} />
      <section className="px-6 py-6">
        <h1 className="mb-4 text-xl uppercase tracking-wider text-[var(--color-accent)]">
          Ethena footprint
        </h1>
        <KpiStrip>
          <KpiCard label="Deployed in lending" value={fmtUsd(deployedUsd)} />
          <KpiCard label="Idle (on-chain)" value={fmtUsd(idle.totalUsd)} />
          <KpiCard
            label="Delegated to CEX"
            value={ethena.failed ? "—" : fmtUsd(ethena.delegatedUsd)}
            subValue={ethena.failed ? "ethena api down" : "funding-rate harvest"}
          />
          <KpiCard
            label="Total backing"
            value={fmtUsd(totalBacking)}
            subValue={ethena.failed ? "on-chain only (CEX feed down)" : "via ethena.fi"}
          />
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
        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <IdleBackingTable rows={idle.rows} total={idle.totalUsd} />
          {ethena.failed ? null : (
            <DelegatedBackingTable
              rows={ethena.byExchange}
              total={ethena.delegatedUsd}
              reserveFundUsd={ethena.reserveFundUsd}
            />
          )}
        </div>
      </section>
    </main>
  )
}
