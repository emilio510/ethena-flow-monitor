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
}

export interface ReserveRecursionInput {
  reserveSymbol: string
  marketKey: string
  rows: UserPositionRow[]
  aggregateDeposits: number
  aggregateBorrows: number
  ethenaSupplyByUser: Map<string, number>
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
  let totalBorrowed = 0

  for (const row of input.rows) {
    for (const attribution of attributeRow(row)) {
      if (attribution.borrowSymbol !== input.reserveSymbol) continue
      totalBorrowed += attribution.borrowedUsd
      const prev = borrowsByCollateral.get(attribution.collateralSymbol) ?? 0
      borrowsByCollateral.set(attribution.collateralSymbol, prev + attribution.borrowedUsd)
      if (isEthenaStack(classify(attribution.collateralSymbol))) {
        ethenaStackBorrowed += attribution.borrowedUsd
      }
    }
  }

  const ethenaCollateralBorrowShare =
    totalBorrowed > 0 ? clamp(ethenaStackBorrowed / totalBorrowed) : 0

  return {
    reserveSymbol: input.reserveSymbol,
    marketKey: input.marketKey,
    ethenaSupplyShare,
    ethenaCollateralBorrowShare,
    recursionScore: ethenaSupplyShare * ethenaCollateralBorrowShare,
    borrowsByCollateral,
  }
}
