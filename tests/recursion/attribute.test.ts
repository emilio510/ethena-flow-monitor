import { describe, it, expect } from "vitest"
import { attributeRow } from "@/lib/recursion/attribute"
import type { UserPositionRow } from "@/lib/tokenlogic/schemas"

const baseRow: UserPositionRow = {
  protocol: "aave_v3",
  chain: "plasma",
  marketKey: "plasma-core-v3",
  marketLabel: "Core",
  userAddress: "0xabc",
  walletLabel: null,
  latestBlockDay: "2026-05-06",
  supplies: [],
  borrows: [],
  totalSupplyUsd: 0,
  totalBorrowUsd: 0,
  healthFactor: null,
  netApy: null,
  netUsdPerDay: null,
  daysToLiquidation: null,
}

describe("attributeRow (pro-rata)", () => {
  it("attributes a single borrow against single collateral", () => {
    const row: UserPositionRow = {
      ...baseRow,
      supplies: [{ symbol: "USDe", amount: 100, amountUsd: 100 }],
      borrows: [{ symbol: "USDT0", amount: 80, amountUsd: 80 }],
      totalSupplyUsd: 100,
      totalBorrowUsd: 80,
    }
    const out = attributeRow(row)
    expect(out).toEqual([
      { borrowSymbol: "USDT0", collateralSymbol: "USDe", borrowedUsd: 80, collateralUsd: 100, leverage: 0.8 },
    ])
  })

  it("splits a single borrow pro-rata across two collaterals", () => {
    const row: UserPositionRow = {
      ...baseRow,
      supplies: [
        { symbol: "USDe", amount: 75, amountUsd: 75 },
        { symbol: "USDC", amount: 25, amountUsd: 25 },
      ],
      borrows: [{ symbol: "USDT0", amount: 80, amountUsd: 80 }],
      totalSupplyUsd: 100,
      totalBorrowUsd: 80,
    }
    const out = attributeRow(row)
    expect(out).toHaveLength(2)
    const usde = out.find((a) => a.collateralSymbol === "USDe")!
    const usdc = out.find((a) => a.collateralSymbol === "USDC")!
    expect(usde.borrowedUsd).toBeCloseTo(60)
    expect(usdc.borrowedUsd).toBeCloseTo(20)
  })

  it("returns empty array for users with no borrows", () => {
    const row: UserPositionRow = {
      ...baseRow,
      supplies: [{ symbol: "USDe", amount: 100, amountUsd: 100 }],
      borrows: [],
      totalSupplyUsd: 100,
      totalBorrowUsd: 0,
    }
    expect(attributeRow(row)).toEqual([])
  })

  it("handles zero-supply borrowers without dividing by zero", () => {
    const row: UserPositionRow = {
      ...baseRow,
      supplies: [],
      borrows: [{ symbol: "USDT0", amount: 80, amountUsd: 80 }],
      totalSupplyUsd: 0,
      totalBorrowUsd: 80,
    }
    expect(attributeRow(row)).toEqual([])
  })
})
