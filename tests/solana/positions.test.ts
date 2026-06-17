/**
 * Tests for Fix A: Kamino/Jupiter per-asset attribution in positions.ts
 *
 * Guards against the USDG-hardcode bug: when Kamino holds PYUSD + USDG, each
 * must emit a separate FootprintRow with the correct symbol and value.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import type { BackingSnapshot } from "@/lib/ethena"

// ---------------------------------------------------------------------------
// Minimal Kamino vault / reserves mocks (set up at module level, mutated per test)
// ---------------------------------------------------------------------------
const mockVault = {
  apy: 2.14,
  sharePrice: 1.0,
  tokensInvestedUsd: 272_500_000,
  numberOfHolders: 42,
}

const mockReserves = [
  {
    reserve: "usdg-reserve",
    liquidityToken: "USDG",
    liquidityTokenMint: "USDG-mint",
    maxLtv: 0,
    borrowApy: 0,
    supplyApy: 0,
    totalSupply: 22_500_000,
    totalBorrow: 0,
    totalSupplyUsd: 22_500_000,
    totalBorrowUsd: 0,
  },
  {
    reserve: "pyusd-reserve",
    liquidityToken: "PYUSD",
    liquidityTokenMint: "PYUSD-mint",
    maxLtv: 0,
    borrowApy: 0,
    supplyApy: 0,
    totalSupply: 250_000_000,
    totalBorrow: 0,
    totalSupplyUsd: 250_000_000,
    totalBorrowUsd: 0,
  },
  {
    reserve: "usde-reserve",
    liquidityToken: "USDe",
    liquidityTokenMint: "USDe-mint",
    maxLtv: 0.92,
    borrowApy: 0,
    supplyApy: 0,
    totalSupply: 500_000_000,
    totalBorrow: 0,
    totalSupplyUsd: 500_000_000,
    totalBorrowUsd: 0,
  },
]

// Minimal Fluid lending mock (1 token, USDG)
const mockFluidLending = [
  {
    id: 1,
    address: "Bd2wJsmaF3YKC6fKLo4AFQDYaFEzWR6SNvoxvTnA6dXc",
    name: "jupiter ethena lend USDG",
    symbol: "jleUSDG",
    uiSymbol: "jleUSDG",
    decimals: 6,
    assetAddress: "2u1tszSeqZ3qBWF3uNGPFc8TzMk2tdiwknnRMWGWjGWH",
    asset: {
      address: "2u1tszSeqZ3qBWF3uNGPFc8TzMk2tdiwknnRMWGWjGWH",
      chainId: "solana",
      name: "Global Dollar",
      symbol: "USDG",
      uiSymbol: "USDG",
      decimals: 6,
      price: "1.0",
      updatedAt: "2026-05-21T04:57:18.000+00:00",
    },
    totalAssets: String(251_400_000 * 1e6),
    totalSupply: String(251_400_000 * 1e6),
    convertToShares: "1000000",
    convertToAssets: "1000000",
    rewardsRate: "0",
    supplyRate: "224",
    totalRate: "224",
    rebalanceDifference: "0",
    liquiditySupplyData: null,
    rewards: [],
  },
]

const mockFluidBorrowing: unknown[] = []

// ---------------------------------------------------------------------------
// Top-level vi.mock — hoisted before tests execute
// ---------------------------------------------------------------------------
vi.mock("@/lib/solana/kamino", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/solana/kamino")>()
  return {
    ...orig,
    fetchEthenaPrimeVaultMetrics: vi.fn().mockResolvedValue(mockVault),
    fetchEthenaMarketReserves: vi.fn().mockResolvedValue(mockReserves),
  }
})

vi.mock("@/lib/solana/fluid", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/solana/fluid")>()
  return {
    ...orig,
    fetchEthenaLendingTokens: vi.fn().mockResolvedValue(mockFluidLending),
    fetchEthenaBorrowingVaults: vi.fn().mockResolvedValue(mockFluidBorrowing),
  }
})

beforeEach(() => {
  vi.resetModules()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

// ---------------------------------------------------------------------------
// Fixture builder
// ---------------------------------------------------------------------------
function makeSnapshot(): BackingSnapshot {
  return {
    timestamp: 1781226081,
    strategies: [
      {
        strategy: "DeFi Lending",
        addressEntries: [],
        aprMin: 2.14,
        aprMax: 2.27,
        percentOfTotal: 11.2,
        value: 523900000,
        counterparties: [
          {
            counterparty: "Kamino",
            addressEntries: [],
            aprMin: 2.14,
            aprMax: 2.14,
            percentOfTotal: 5.1,
            value: 272500000,
            assets: [
              {
                asset: "USDG",
                addressEntries: [],
                aprMin: 2.14,
                aprMax: 2.14,
                percentOfTotal: 0.5,
                value: 22_500_000,
              },
              {
                asset: "PYUSD",
                addressEntries: [],
                aprMin: 2.14,
                aprMax: 2.14,
                percentOfTotal: 5.6,
                value: 250_000_000,
              },
            ],
          },
          {
            counterparty: "Jupiter",
            addressEntries: [],
            aprMin: 2.27,
            aprMax: 2.27,
            percentOfTotal: 5.6,
            value: 251_400_000,
            assets: [
              {
                asset: "USDG",
                addressEntries: [],
                aprMin: 2.27,
                aprMax: 2.27,
                percentOfTotal: 5.6,
                value: 251_400_000,
              },
            ],
          },
        ],
      },
    ],
  }
}

// ---------------------------------------------------------------------------
// extractSolanaLegs unit tests (tests the exported function directly)
// ---------------------------------------------------------------------------
describe("extractSolanaLegs", () => {
  it("returns per-asset legs for Kamino and Jupiter from snapshot", async () => {
    const { extractSolanaLegs } = await import("@/lib/solana/positions")
    const legs = extractSolanaLegs(makeSnapshot())

    expect(legs.kamino).toHaveLength(2)
    expect(legs.jupiter).toHaveLength(1)

    const kUsdg = legs.kamino.find((l) => l.asset === "USDG")
    const kPyusd = legs.kamino.find((l) => l.asset === "PYUSD")
    expect(kUsdg?.value).toBe(22_500_000)
    expect(kPyusd?.value).toBe(250_000_000)

    expect(legs.jupiter[0]!.asset).toBe("USDG")
    expect(legs.jupiter[0]!.value).toBe(251_400_000)
  })

  it("returns empty arrays when a counterparty has no assets", async () => {
    const { extractSolanaLegs } = await import("@/lib/solana/positions")
    const snapshot: BackingSnapshot = {
      timestamp: 1,
      strategies: [
        {
          strategy: "DeFi Lending",
          addressEntries: [],
          aprMin: null,
          aprMax: null,
          percentOfTotal: 0,
          value: 0,
          counterparties: [
            {
              counterparty: "Kamino",
              addressEntries: [],
              aprMin: null,
              aprMax: null,
              percentOfTotal: 0,
              value: 0,
              assets: [],
            },
          ],
        },
      ],
    }
    const legs = extractSolanaLegs(snapshot)
    expect(legs.kamino).toHaveLength(0)
    expect(legs.jupiter).toHaveLength(0)
  })

  it("ignores non-DeFi-Lending strategies", async () => {
    const { extractSolanaLegs } = await import("@/lib/solana/positions")
    const snapshot: BackingSnapshot = {
      timestamp: 1,
      strategies: [
        {
          strategy: "Liquid Stables",
          addressEntries: [],
          aprMin: null,
          aprMax: null,
          percentOfTotal: 5,
          value: 500,
          counterparties: [
            {
              counterparty: "Kamino",
              addressEntries: [],
              aprMin: null,
              aprMax: null,
              percentOfTotal: 5,
              value: 500,
              assets: [
                {
                  asset: "USDC",
                  addressEntries: [],
                  aprMin: null,
                  aprMax: null,
                  percentOfTotal: 5,
                  value: 500,
                },
              ],
            },
          ],
        },
      ],
    }
    const legs = extractSolanaLegs(snapshot)
    expect(legs.kamino).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Integration tests for getEthenaSolanaPositions per-asset attribution
// ---------------------------------------------------------------------------
describe("getEthenaSolanaPositions — per-asset attribution", () => {
  it("emits a PYUSD row at $250M and a USDG Kamino row at $22.5M", async () => {
    const { getEthenaSolanaPositions } = await import("@/lib/solana/positions")
    const result = await getEthenaSolanaPositions(makeSnapshot())

    const pyusdRows = result.rows.filter(
      (r) => r.protocol === "KAMINO" && r.reserveSymbol === "PYUSD",
    )
    expect(pyusdRows).toHaveLength(1)
    expect(pyusdRows[0]!.ethenaSuppliedUsd).toBe(250_000_000)
  })

  it("USDG Kamino row carries 22.5M, NOT the PYUSD value", async () => {
    const { getEthenaSolanaPositions } = await import("@/lib/solana/positions")
    const result = await getEthenaSolanaPositions(makeSnapshot())

    const usdgKamino = result.rows.filter(
      (r) => r.protocol === "KAMINO" && r.reserveSymbol === "USDG",
    )
    expect(usdgKamino).toHaveLength(1)
    expect(usdgKamino[0]!.ethenaSuppliedUsd).toBe(22_500_000)
    expect(usdgKamino[0]!.ethenaSuppliedUsd).not.toBe(250_000_000)
  })

  it("Jupiter row is USDG at $251.4M", async () => {
    const { getEthenaSolanaPositions } = await import("@/lib/solana/positions")
    const result = await getEthenaSolanaPositions(makeSnapshot())

    const jupRows = result.rows.filter((r) => r.protocol === "JUPITER LEND")
    expect(jupRows).toHaveLength(1)
    expect(jupRows[0]!.reserveSymbol).toBe("USDG")
    expect(jupRows[0]!.ethenaSuppliedUsd).toBe(251_400_000)
  })

  it("no row with USDG symbol carries the PYUSD value", async () => {
    const { getEthenaSolanaPositions } = await import("@/lib/solana/positions")
    const result = await getEthenaSolanaPositions(makeSnapshot())

    const usdgRows = result.rows.filter((r) => r.reserveSymbol === "USDG")
    for (const row of usdgRows) {
      expect(row.ethenaSuppliedUsd).not.toBe(250_000_000)
    }
  })

  it("total rows = 3: 2 Kamino (USDG + PYUSD) + 1 Jupiter (USDG)", async () => {
    const { getEthenaSolanaPositions } = await import("@/lib/solana/positions")
    const result = await getEthenaSolanaPositions(makeSnapshot())
    expect(result.rows).toHaveLength(3)
    expect(result.failed).toHaveLength(0)
  })

  it("Kamino row exposure is utilization-aware (70% utilized USDG reserve)", async () => {
    // Give the USDG reserve a 70% utilization: borrow 70 of 100 supplied.
    // recursiveFraction = computeKaminoRecursion = 1.0 (only USDe has maxLtv>0),
    // so exposureScore = recursiveFraction × utilization = 1.0 × 0.7 = 0.7.
    const usdg = mockReserves.find((r) => r.liquidityToken === "USDG")!
    const prevSupply = usdg.totalSupplyUsd
    const prevBorrow = usdg.totalBorrowUsd
    usdg.totalSupplyUsd = 100
    usdg.totalBorrowUsd = 70
    try {
      const { getEthenaSolanaPositions } = await import("@/lib/solana/positions")
      const result = await getEthenaSolanaPositions(makeSnapshot())
      const usdgKamino = result.rows.find(
        (r) => r.protocol === "KAMINO" && r.reserveSymbol === "USDG",
      )!
      expect(usdgKamino.recursionScore).toBeCloseTo(0.7)
      // closedLoopShare = shareOfReserve × recursiveFraction.
      // shareOfReserve = min(1, 22.5M / 100) = 1 here, recursiveFraction = 1.
      expect(usdgKamino.closedLoopShare).toBeCloseTo(
        Math.min(1, 22_500_000 / 100) * 1.0,
      )
    } finally {
      usdg.totalSupplyUsd = prevSupply
      usdg.totalBorrowUsd = prevBorrow
    }
  })

  it("skips legs with value <= 0", async () => {
    const { getEthenaSolanaPositions } = await import("@/lib/solana/positions")

    const snapshot = makeSnapshot()
    const defiStrategy = snapshot.strategies.find((s) => s.strategy === "DeFi Lending")!
    const kaminoCp = defiStrategy.counterparties.find((c) => c.counterparty === "Kamino")!
    const updatedKaminoCp = {
      ...kaminoCp,
      assets: kaminoCp.assets.map((a) => (a.asset === "USDG" ? { ...a, value: 0 } : a)),
    }
    const updatedSnapshot: BackingSnapshot = {
      ...snapshot,
      strategies: snapshot.strategies.map((s) =>
        s.strategy === "DeFi Lending"
          ? {
              ...s,
              counterparties: s.counterparties.map((c) =>
                c.counterparty === "Kamino" ? updatedKaminoCp : c,
              ),
            }
          : s,
      ),
    }

    const result = await getEthenaSolanaPositions(updatedSnapshot)
    const kaminoRows = result.rows.filter((r) => r.protocol === "KAMINO")
    // Only PYUSD $250M survives; USDG=0 is skipped
    expect(kaminoRows).toHaveLength(1)
    expect(kaminoRows[0]!.reserveSymbol).toBe("PYUSD")
  })
})
