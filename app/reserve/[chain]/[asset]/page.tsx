import { notFound } from "next/navigation"
import { loadReserveView, ReserveNotFoundError } from "@/lib/views/reserve"
import { Header } from "@/components/header"
import { KpiCard } from "@/components/kpi-card"
import { KpiStrip } from "@/components/kpi-strip"
import { ConcentrationPanel } from "@/components/concentration-panel"
import { DepositorsTable } from "@/components/depositors-table"
import { RecursionPanel } from "@/components/recursion-panel"
import { ChainIcon } from "@/components/chain-icon"
import { fmtUsd, fmtPct } from "@/lib/format"
import { isChain } from "@/config/markets"

export const revalidate = 300
export const maxDuration = 90

export default async function Page({
  params,
}: {
  params: Promise<{ chain: string; asset: string }>
}) {
  const { chain, asset } = await params
  // T3.1 — validate the path param is a known chain before it reaches the API,
  // so an attacker-controlled URL can not surface a raw stack trace.
  if (!isChain(chain)) notFound()
  const symbol = decodeURIComponent(asset)
  let view
  try {
    view = await loadReserveView(chain, symbol)
  } catch (err) {
    if (err instanceof ReserveNotFoundError) notFound()
    throw err
  }

  // Donut Share column uses the row-attributed total so wedges sum to 100%.
  // The headline recursion score still uses the markets-API aggregate so the
  // two numbers can disagree (intentional — see ReserveRecursion docs).
  const denom = view.recursion.attributedBorrowsTotal
  const breakdown = Array.from(view.recursion.borrowsByCollateral.entries())
    .map(([collateralSymbol, borrowedUsd]) => ({
      collateralSymbol,
      borrowedUsd,
      shareOfTotal: denom > 0 ? borrowedUsd / denom : 0,
    }))
    .sort((a, b) => b.borrowedUsd - a.borrowedUsd)

  return (
    <main>
      <Header freshness={view.freshness} />
      <section className="px-8 pb-12">
        <div className="mb-7 flex items-center gap-3">
          <ChainIcon chain={chain} size={28} />
          <div className="flex items-baseline gap-3">
            <h1 className="mono text-[28px] font-semibold tracking-tight text-[var(--color-text)]">
              {symbol}
            </h1>
            <span className="text-sm text-[var(--color-text-dim)]">
              on <span className="capitalize">{chain}</span>
            </span>
            <span className="mono text-[11px] text-[var(--color-text-ghost)]">
              {view.marketKey}
            </span>
          </div>
        </div>

        <KpiStrip>
          <KpiCard label="Total supplied" value={fmtUsd(view.totalSupplyUsd)} />
          <KpiCard label="Total borrowed" value={fmtUsd(view.totalBorrowUsd)} />
          <KpiCard label="Utilization" value={fmtPct(view.utilization)} />
          <KpiCard
            label="Supply / Borrow APY"
            value={`${fmtPct(view.supplyApy)} / ${fmtPct(view.borrowApy)}`}
          />
          <KpiCard label="Borrow cap" value={fmtUsd(view.borrowCap)} />
          <KpiCard
            label="Recursion score"
            value={fmtPct(view.recursion.recursionScore)}
            subValue={view.recursionApprox ? "approx, sampled" : undefined}
            tone="recursion"
          />
        </KpiStrip>

        <div className="mt-8 grid grid-cols-1 gap-5 lg:grid-cols-2">
          <ConcentrationPanel {...view.concentration} />
          <RecursionPanel
            ethenaCollateralBorrowShare={view.recursion.ethenaCollateralBorrowShare}
            breakdown={breakdown}
          />
        </div>

        <div className="mt-8">
          <h2 className="mb-4 text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--color-text-dim)]">
            Top depositors
          </h2>
          <DepositorsTable rows={view.topDepositors} totalSupplyUsd={view.totalSupplyUsd} />
        </div>
      </section>
    </main>
  )
}
