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
  it("MegaETH/USDM: score is utilization-aware (borrowShare × utilization), not supply×borrow", () => {
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

    // utilization = 179M / 600M = 0.2983; borrowShare = 179M/179M = 1.0
    // score = borrowShare × utilization (supplyShare is NOT a factor of the score)
    expect(result.ethenaCollateralBorrowShare).toBeCloseTo(1)
    expect(result.recursionScore).toBeCloseTo(179_000_000 / 600_000_000)
    // recursive$ = ethenaSupplied × score = 500M × 0.2983 ≈ $149M (borrow-anchored)
    expect(500_000_000 * result.recursionScore).toBeCloseTo(149_166_666, -4)
    expect(result.borrowsByCollateral.get("USDe")).toBeCloseTo(179_000_000)
  })

  it("folds Morpho markets matching the reserve into borrowsByCollateral and the share denominator", () => {
    // USDtb reserve: zero Aave activity, but a Steakhouse-style Morpho vault
    // has $108M of USDtb borrowed against sUSDe collateral. The reserve view
    // must surface that sUSDe collateral wedge AND raise the denominator so
    // the Ethena-stack share isn't computed against an Aave-only base.
    const result = computeReserveRecursion({
      reserveSymbol: "USDtb",
      marketKey: "ethereum-core-v3",
      rows: [],
      aggregateDeposits: 0,
      aggregateBorrows: 0,
      ethenaSupplyByUser: new Map(),
      morphoMarkets: [
        { collateralSymbol: "sUSDe", marketBorrowUsd: 108_000_000 },
      ],
    })
    expect(result.borrowsByCollateral.get("sUSDe")).toBeCloseTo(108_000_000)
    expect(result.attributedBorrowsTotal).toBeCloseTo(108_000_000)
    expect(result.ethenaCollateralBorrowShare).toBeCloseTo(1)
  })

  it("a Morpho market with non-Ethena-stack collateral grows the donut but not the Ethena share", () => {
    const result = computeReserveRecursion({
      reserveSymbol: "USDtb",
      marketKey: "ethereum-core-v3",
      rows: [],
      aggregateDeposits: 0,
      aggregateBorrows: 0,
      ethenaSupplyByUser: new Map(),
      morphoMarkets: [
        { collateralSymbol: "sUSDe", marketBorrowUsd: 50_000_000 },
        { collateralSymbol: "WETH", marketBorrowUsd: 50_000_000 },
      ],
    })
    expect(result.borrowsByCollateral.get("sUSDe")).toBeCloseTo(50_000_000)
    expect(result.borrowsByCollateral.get("WETH")).toBeCloseTo(50_000_000)
    expect(result.ethenaCollateralBorrowShare).toBeCloseTo(0.5)
  })

  it("borrow-share divides by the attributed (sample) total, NOT the markets aggregate", () => {
    // Sampled borrowers attribute $400M of USDT0 borrows ($200M vs sUSDe,
    // $200M vs WETH). The markets-API aggregate claims $1B (the two sources
    // disagree — the real Plasma USDT0 bug). Borrow-share must be the
    // consistent sample ratio 200/400 = 50%, NOT 200/1000 = 20%.
    const result = computeReserveRecursion({
      reserveSymbol: "USDT0",
      marketKey: "plasma-core-v3",
      rows: [
        row({
          userAddress: "0xA",
          supplies: [{ symbol: "sUSDe", amount: 200_000_000, amountUsd: 200_000_000 }],
          borrows: [{ symbol: "USDT0", amount: 200_000_000, amountUsd: 200_000_000 }],
          totalSupplyUsd: 200_000_000,
          totalBorrowUsd: 200_000_000,
        }),
        row({
          userAddress: "0xB",
          supplies: [{ symbol: "WETH", amount: 200_000_000, amountUsd: 200_000_000 }],
          borrows: [{ symbol: "USDT0", amount: 200_000_000, amountUsd: 200_000_000 }],
          totalSupplyUsd: 200_000_000,
          totalBorrowUsd: 200_000_000,
        }),
      ],
      aggregateDeposits: 1_000_000_000,
      aggregateBorrows: 1_000_000_000, // markets API disagrees with the sample
      ethenaSupplyByUser: new Map([["0xb8734a14fbd4aa2d44e6aa830405ffc861ba313c", 500_000_000]]),
    })
    expect(result.attributedBorrowsTotal).toBeCloseTo(400_000_000)
    expect(result.ethenaCollateralBorrowShare).toBeCloseTo(0.5) // 200/400, not 200/1000
    // utilization = 1.0 (aggregateBorrows == aggregateDeposits); score = borrowShare × util
    expect(result.recursionScore).toBeCloseTo(0.5)
  })

  it("dampens the score by utilization (idle supply is not recursive)", () => {
    // 1000 supplied, only 600 borrowed, all against USDe.
    const result = computeReserveRecursion({
      reserveSymbol: "USDm",
      marketKey: "megaeth-core-v3",
      rows: [
        row({
          userAddress: "0x1",
          supplies: [{ symbol: "USDe", amount: 700_000_000, amountUsd: 700_000_000 }],
          borrows: [{ symbol: "USDm", amount: 600_000_000, amountUsd: 600_000_000 }],
          totalSupplyUsd: 700_000_000,
          totalBorrowUsd: 600_000_000,
        }),
      ],
      aggregateDeposits: 1_000_000_000,
      aggregateBorrows: 600_000_000,
      ethenaSupplyByUser: new Map([["0xe", 1_000_000_000]]),
    })
    // borrowShare = 1.0, utilization = 0.6 → score = 0.6 (NOT 1.0)
    expect(result.recursionScore).toBeCloseTo(0.6)
  })

  it("at 100% utilization the score equals the recursive borrow fraction (no regression)", () => {
    const result = computeReserveRecursion({
      reserveSymbol: "USDm",
      marketKey: "megaeth-core-v3",
      rows: [
        row({
          userAddress: "0x1",
          supplies: [{ symbol: "USDe", amount: 500_000_000, amountUsd: 500_000_000 }],
          borrows: [{ symbol: "USDm", amount: 500_000_000, amountUsd: 500_000_000 }],
          totalSupplyUsd: 500_000_000,
          totalBorrowUsd: 500_000_000,
        }),
      ],
      aggregateDeposits: 500_000_000,
      aggregateBorrows: 500_000_000,
      ethenaSupplyByUser: new Map([["0xe", 500_000_000]]),
    })
    // utilization = 1.0, borrowShare = 1.0 → score = 1.0
    expect(result.recursionScore).toBeCloseTo(1)
  })

  it("folded-Morpho with no Aave base falls back to utilization=1 (not zeroed)", () => {
    const result = computeReserveRecursion({
      reserveSymbol: "USDtb",
      marketKey: "ethereum-core-v3",
      rows: [],
      aggregateDeposits: 0,
      aggregateBorrows: 0,
      ethenaSupplyByUser: new Map(),
      morphoMarkets: [{ collateralSymbol: "sUSDe", marketBorrowUsd: 108_000_000 }],
    })
    // No Aave deposits → utilization falls back to 1; borrowShare = 1.0 → score = 1.0
    expect(result.recursionScore).toBeCloseTo(1)
  })

  it("Morpho leverage alongside an Aave deposit base is not zeroed by low Aave utilization", () => {
    // Aave has a deposit base but ~zero Aave borrows; the recursion is all on
    // the folded Morpho side. The combined-basis utilization must keep this
    // non-zero rather than nulling the Morpho leverage.
    const result = computeReserveRecursion({
      reserveSymbol: "USDtb",
      marketKey: "ethereum-core-v3",
      rows: [],
      aggregateDeposits: 200_000_000,
      aggregateBorrows: 0,
      ethenaSupplyByUser: new Map(),
      morphoMarkets: [{ collateralSymbol: "sUSDe", marketBorrowUsd: 108_000_000 }],
    })
    // utilization = (0 + 108M) / (200M + 108M) = 0.3506; borrowShare = 1.0
    expect(result.recursionScore).toBeCloseTo(108_000_000 / 308_000_000)
  })

  it("ethenaSuppliedUsd × score equals supplyShare × totalBorrows × recursiveFraction", () => {
    // MegaETH shape: 550M Ethena supply of 565M total; 375M borrowed, all vs USDe.
    const ethenaSupplied = 550_000_000
    const result = computeReserveRecursion({
      reserveSymbol: "USDm",
      marketKey: "megaeth-core-v3",
      rows: [
        row({
          userAddress: "0x1",
          supplies: [{ symbol: "USDe", amount: 400_000_000, amountUsd: 400_000_000 }],
          borrows: [{ symbol: "USDm", amount: 375_000_000, amountUsd: 375_000_000 }],
          totalSupplyUsd: 400_000_000,
          totalBorrowUsd: 375_000_000,
        }),
      ],
      aggregateDeposits: 565_000_000,
      aggregateBorrows: 375_000_000,
      ethenaSupplyByUser: new Map([["0xe", ethenaSupplied]]),
    })
    const recursiveUsd = ethenaSupplied * result.recursionScore
    // supplyShare(550/565) × totalBorrows(375M) × recursiveFraction(1.0) ≈ $365M
    const expected = (ethenaSupplied / 565_000_000) * 375_000_000 * 1.0
    expect(recursiveUsd).toBeCloseTo(expected, -4)
    // And it is NOT the old supply-anchored ~$535M.
    expect(recursiveUsd).toBeLessThan(400_000_000)
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
