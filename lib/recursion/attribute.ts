import type { UserPositionRow } from "@/lib/tokenlogic/schemas"

export interface Attribution {
  borrowSymbol: string
  collateralSymbol: string
  borrowedUsd: number
  collateralUsd: number
  leverage: number
}

export function attributeRow(row: UserPositionRow): Attribution[] {
  if (row.borrows.length === 0 || row.totalSupplyUsd === 0) return []

  const out: Attribution[] = []
  for (const borrow of row.borrows) {
    for (const supply of row.supplies) {
      const fraction = supply.amountUsd / row.totalSupplyUsd
      const borrowedUsd = borrow.amountUsd * fraction
      out.push({
        borrowSymbol: borrow.symbol,
        collateralSymbol: supply.symbol,
        borrowedUsd,
        collateralUsd: supply.amountUsd,
        leverage: row.totalBorrowUsd / row.totalSupplyUsd,
      })
    }
  }
  return out
}
