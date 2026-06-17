import type { UserPositionRow } from "@/lib/tokenlogic/schemas"
import { attributeRow } from "./attribute"
import { classify, isEthenaStack } from "./classify"
import { recursionMetrics } from "./metrics"

export interface ReserveRecursion {
  reserveSymbol: string
  marketKey: string
  ethenaSupplyShare: number
  ethenaCollateralBorrowShare: number
  recursionScore: number
  /** Concentration: supplyShare × recursiveFraction. Display-only. */
  closedLoopShare: number
  borrowsByCollateral: Map<string, number>
  /** Sum of borrowsByCollateral.values() — the denominator the donut Share
   * column should use so wedge percentages add up to 100%. May be < the
   * markets-API aggregateBorrows when Ethena wallets themselves carry
   * (anomaly) borrows or when paginated coverage is partial. */
  attributedBorrowsTotal: number
}

/** A Morpho Blue market borrowing the reserve's asset, as seen from the
 *  reserve view. Caller dedupes by market and passes the market-wide borrow
 *  (not just the share of the vault that supplies into it). */
export interface MorphoReserveMarket {
  collateralSymbol: string | null
  marketBorrowUsd: number
}

export interface ReserveRecursionInput {
  reserveSymbol: string
  marketKey: string
  rows: UserPositionRow[]
  aggregateDeposits: number
  aggregateBorrows: number
  ethenaSupplyByUser: Map<string, number>
  /** Optional cross-protocol view: Morpho markets whose loan asset is this
   *  reserve's symbol. Their borrows are folded into the by-collateral
   *  donut and into the Ethena-stack share's denominator so the reserve view
   *  no longer hides the Morpho-side leverage. */
  morphoMarkets?: MorphoReserveMarket[]
}

const clamp = (n: number) => Math.max(0, Math.min(1, n))

export function computeReserveRecursion(input: ReserveRecursionInput): ReserveRecursion {
  const ethenaSuppliedTotal = Array.from(input.ethenaSupplyByUser.values()).reduce(
    (a, b) => a + b,
    0,
  )
  const ethenaSupplyShare =
    input.aggregateDeposits > 0 ? clamp(ethenaSuppliedTotal / input.aggregateDeposits) : 0

  const borrowsByCollateral = new Map<string, number>()
  let ethenaStackBorrowed = 0
  let attributedBorrowsTotal = 0

  for (const row of input.rows) {
    for (const attribution of attributeRow(row)) {
      if (attribution.borrowSymbol !== input.reserveSymbol) continue
      attributedBorrowsTotal += attribution.borrowedUsd
      const prev = borrowsByCollateral.get(attribution.collateralSymbol) ?? 0
      borrowsByCollateral.set(attribution.collateralSymbol, prev + attribution.borrowedUsd)
      if (isEthenaStack(classify(attribution.collateralSymbol))) {
        ethenaStackBorrowed += attribution.borrowedUsd
      }
    }
  }

  // Fold in any Morpho markets borrowing this reserve's asset. The donut and
  // the Ethena-stack share both account for these so the reserve view reflects
  // cross-protocol leverage, not just Aave's slice.
  for (const mm of input.morphoMarkets ?? []) {
    if (mm.marketBorrowUsd <= 0) continue
    attributedBorrowsTotal += mm.marketBorrowUsd
    const col = mm.collateralSymbol ?? "Unknown"
    borrowsByCollateral.set(col, (borrowsByCollateral.get(col) ?? 0) + mm.marketBorrowUsd)
    if (mm.collateralSymbol && isEthenaStack(classify(mm.collateralSymbol))) {
      ethenaStackBorrowed += mm.marketBorrowUsd
    }
  }

  // Borrow-share denominator = attributedBorrowsTotal, the SAME basis as the
  // numerator (ethenaStackBorrowed): both are attributed from the sampled
  // borrowers plus any folded Morpho markets. Previously this divided the
  // sample-derived numerator by the markets-API `aggregateBorrows` — two
  // different sources that can disagree badly (e.g. Plasma USDT0: aggregate vs
  // sample-attributed differed ~1.7×), yielding an inconsistent borrow-share
  // that could even exceed the donut's own Ethena wedge. Using
  // attributedBorrowsTotal makes the score consistent with the by-collateral
  // donut, bounded to [0,1], and unbiased under one-page (PAGE_SIZE) truncation
  // — a truncated sample now yields the Ethena fraction OF WHAT WAS SAMPLED
  // rather than a numerator-over-full-aggregate undercount. `aggregateBorrows`
  // is retained on the input for display ("total borrowed"), not the score.
  const ethenaCollateralBorrowShare =
    attributedBorrowsTotal > 0 ? clamp(ethenaStackBorrowed / attributedBorrowsTotal) : 0

  // Reserve utilization, used to convert "Ethena's supplied $" (the weight
  // applied downstream) into "Ethena's supplied $ actually borrowed out" —
  // idle supply is not recursive. Computed on a COMBINED basis: the markets-API
  // Aave aggregates plus any folded Morpho markets (drilldown only). Folded
  // Morpho borrows are added to BOTH the borrowed and supplied sides (treating
  // those isolated markets as ~fully utilized). Aave aggregates are full-basis,
  // so the ratio is truncation-safe. This keeps a reserve that has an Aave
  // deposit base AND Morpho leverage from being zeroed by a near-zero Aave
  // utilization, and matches the prior pure-Morpho fallback (deposits 0,
  // borrows 0, Morpho present → utilization 1). Pure Aave is unchanged.
  const morphoBorrows = (input.morphoMarkets ?? []).reduce(
    (s, m) => s + Math.max(0, m.marketBorrowUsd),
    0,
  )
  const utilizationDenominator = input.aggregateDeposits + morphoBorrows
  const utilization =
    utilizationDenominator > 0
      ? clamp((input.aggregateBorrows + morphoBorrows) / utilizationDenominator)
      : 0

  // Score = recursive-borrow fraction × utilization. `ethenaSupplyShare` is
  // deliberately NOT a factor: downstream recursive-$ = ethenaSuppliedUsd ×
  // score, and ethenaSuppliedUsd already embeds Ethena's supply share, so
  // including it here would double-apply it. `ethenaSupplyShare` is still
  // returned for display/diagnostics.
  const { exposureScore, closedLoopShare } = recursionMetrics(
    ethenaSupplyShare,
    ethenaCollateralBorrowShare,
    utilization,
  )

  return {
    reserveSymbol: input.reserveSymbol,
    marketKey: input.marketKey,
    ethenaSupplyShare,
    ethenaCollateralBorrowShare,
    recursionScore: exposureScore,
    closedLoopShare,
    borrowsByCollateral,
    attributedBorrowsTotal,
  }
}
