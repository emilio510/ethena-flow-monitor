import type { UserPositionRow } from "@/lib/tokenlogic/schemas"
import { attributeRow } from "./attribute"
import { classify, isEthenaStack } from "./classify"

export interface ReserveRecursion {
  reserveSymbol: string
  marketKey: string
  ethenaSupplyShare: number
  ethenaCollateralBorrowShare: number
  recursionScore: number
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
  let morphoBorrowsTotal = 0
  for (const mm of input.morphoMarkets ?? []) {
    if (mm.marketBorrowUsd <= 0) continue
    morphoBorrowsTotal += mm.marketBorrowUsd
    attributedBorrowsTotal += mm.marketBorrowUsd
    const col = mm.collateralSymbol ?? "Unknown"
    borrowsByCollateral.set(col, (borrowsByCollateral.get(col) ?? 0) + mm.marketBorrowUsd)
    if (mm.collateralSymbol && isEthenaStack(classify(mm.collateralSymbol))) {
      ethenaStackBorrowed += mm.marketBorrowUsd
    }
  }

  const totalBorrowsConsidered = input.aggregateBorrows + morphoBorrowsTotal
  const ethenaCollateralBorrowShare =
    totalBorrowsConsidered > 0
      ? clamp(ethenaStackBorrowed / totalBorrowsConsidered)
      : 0

  return {
    reserveSymbol: input.reserveSymbol,
    marketKey: input.marketKey,
    ethenaSupplyShare,
    ethenaCollateralBorrowShare,
    recursionScore: ethenaSupplyShare * ethenaCollateralBorrowShare,
    borrowsByCollateral,
    attributedBorrowsTotal,
  }
}
