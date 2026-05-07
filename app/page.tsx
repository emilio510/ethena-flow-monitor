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
          <KpiCard label="Idle backing" value={fmtUsd(idle.totalUsd)} />
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
        <p className="mt-3 text-[11px] text-[var(--color-text-ghost)]">
          Note: this dashboard tracks the ~87% of Ethena's backing that sits
          on-chain (deployed in lending + idle in wallets). The remaining
          ~13% is delegated to centralised exchanges as collateral for
          delta-neutral funding-rate harvest and is not visible on-chain;
          see{" "}
          <a
            className="underline hover:text-[var(--color-accent)]"
            href="https://app.ethena.fi/dashboards/transparency"
            target="_blank"
            rel="noreferrer"
          >
            app.ethena.fi/dashboards/transparency
          </a>{" "}
          for the full notional.
        </p>
        <div className="mt-6">
          <FootprintTable rows={rows} />
        </div>
        <div className="mt-8">
          <IdleBackingTable rows={idle.rows} total={idle.totalUsd} />
        </div>
      </section>
    </main>
  )
}
