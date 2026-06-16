import { notFound } from "next/navigation"
import { loadReserveView, ReserveNotFoundError } from "@/lib/views/reserve"
import { Header } from "@/components/header"
import { KpiCard } from "@/components/kpi-card"
import { KpiStrip } from "@/components/kpi-strip"
import { HeroMeter } from "@/components/ui/hero-meter"
import { ConcentrationPanel } from "@/components/concentration-panel"
import { ReserveTabs } from "@/components/reserve-tabs"
import { RecursionPanel } from "@/components/recursion-panel"
import { ChainIcon } from "@/components/chain-icon"
import { AssetIcon } from "@/components/asset-icon"
import { fmtUsd, fmtPct } from "@/lib/format"
import { isChain } from "@/config/markets"

// 1-hour ISR — see app/page.tsx for rationale.
export const revalidate = 3600
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

  // Donut Share column and the recursion score now share one basis:
  // attributedBorrowsTotal (borrows attributed from the sampled borrowers +
  // folded Morpho markets). So the Ethena-stack wedge equals the recursion's
  // borrow-share component — no intentional divergence anymore.
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
      <Header renderedAt={Date.now()} />
      <section className="px-6 pt-8 pb-6">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.5fr_1fr]">
          <div>
            <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--color-text-ghost)]">
              Aave V3 reserve
            </div>
            <div className="mt-2 flex items-center gap-3">
              <AssetIcon symbol={symbol} size={28} />
              <span className="font-mono text-[28px] font-light leading-none tracking-[-0.02em] text-[var(--color-text)]">
                {symbol}
              </span>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <ChainIcon chain={chain} size={16} />
              <span className="text-[12px] capitalize text-[var(--color-text-ghost)]">{chain}</span>
            </div>
          </div>
          <HeroMeter
            label="Utilization"
            ratio={view.utilization}
            rightCaption={
              <>
                {fmtUsd(view.totalBorrowUsd)} borrowed
                <br />
                of {fmtUsd(view.totalSupplyUsd)} supplied
              </>
            }
            threshold={0.95}
          />
        </div>
      </section>

      <section className="px-6 pb-6">
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
            subValue={
              view.recursionApprox
                ? "utilization-aware, approx, sampled"
                : "utilization-aware"
            }
            tone="recursion"
          />
        </KpiStrip>
      </section>

      <section className="px-6 pb-6">
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <ConcentrationPanel {...view.concentration} />
          <RecursionPanel
            ethenaCollateralBorrowShare={view.recursion.ethenaCollateralBorrowShare}
            breakdown={breakdown}
          />
        </div>
      </section>

      <section className="px-6 pb-8">
        <ReserveTabs
          reserveSymbol={symbol}
          totalSupplyUsd={view.totalSupplyUsd}
          depositors={view.topDepositors}
          borrowers={view.topBorrowers}
          collateralUsers={view.topCollateralUsers}
        />
      </section>
    </main>
  )
}
