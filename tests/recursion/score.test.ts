import { describe, it, expect } from "vitest"
import { computeReserveRecursion } from "@/lib/recursion/score"
import type { UserPositionRow } from "@/lib/tokenlogic/schemas"

const row = (overrides: Partial<UserPositionRow>): UserPositionRow => ({
  protocol: "aave_v3",
  chain: "megaeth",
  marketKey: "megaeth-core-v3",
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
  ...overrides,
})

describe("computeReserveRecursion", () => {
  it("computes recursion for the MegaETH/USDM example case (~83%)", () => {
    const ethenaWallet = "0xb8734a14fbd4aa2d44e6aa830405ffc861ba313c"
    const rows: UserPositionRow[] = [
      row({
        userAddress: "0x222",
        supplies: [{ symbol: "USDe", amount: 200_000_000, amountUsd: 200_000_000 }],
        borrows: [{ symbol: "USDm", amount: 179_000_000, amountUsd: 179_000_000 }],
        totalSupplyUsd: 200_000_000,
        totalBorrowUsd: 179_000_000,
      }),
    ]

    const result = computeReserveRecursion({
      reserveSymbol: "USDm",
      marketKey: "megaeth-core-v3",
      rows,
      aggregateDeposits: 600_000_000,
      aggregateBorrows: 179_000_000,
      ethenaSupplyByUser: new Map([[ethenaWallet, 500_000_000]]),
    })

    expect(result.ethenaSupplyShare).toBeCloseTo(500_000_000 / 600_000_000)
    expect(result.ethenaCollateralBorrowShare).toBeCloseTo(1)
    expect(result.recursionScore).toBeCloseTo(500_000_000 / 600_000_000)
    expect(result.borrowsByCollateral.get("USDe")).toBeCloseTo(179_000_000)
  })

  it("returns score 0 when no recursive borrows", () => {
    const result = computeReserveRecursion({
      reserveSymbol: "USDC",
      marketKey: "ethereum-core-v3",
      rows: [
        row({
          userAddress: "0x222",
          supplies: [{ symbol: "WETH", amount: 100, amountUsd: 100 }],
          borrows: [{ symbol: "USDC", amount: 50, amountUsd: 50 }],
          totalSupplyUsd: 100,
          totalBorrowUsd: 50,
        }),
      ],
      aggregateDeposits: 1_000_000,
      aggregateBorrows: 50,
      ethenaSupplyByUser: new Map(),
    })
    expect(result.recursionScore).toBe(0)
  })
})
