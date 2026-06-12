import { describe, it, expect, vi, beforeEach } from "vitest"

beforeEach(() => {
  vi.resetModules()
  vi.unstubAllGlobals()
})

const FAQ = "4FaQc6QZ5skFjcDF64mKcXRhtCCsnArZcr1xumPNrbtN"
const C23 = "C23FGxQB2LsoTbZsQr5w3R7b3sw5saxPLGJ4ujvyH34L"

function stubBaseFetchers() {
  vi.doMock("@/lib/tokenlogic/positions", () => ({
    getEthenaPositions: vi.fn(async () => ({ rows: [], failedWallets: [] })),
    getMarketPositionsBulk: vi.fn(async () => ({ byMarket: new Map(), failedMarkets: [] })),
  }))
  vi.doMock("@/lib/tokenlogic/markets", () => ({ getMarketAggregates: vi.fn(async () => new Map()) }))
  vi.doMock("@/lib/morpho/positions", () => ({
    getEthenaMorphoPositions: vi.fn(async () => ({ positions: [], failedWallets: [] })),
    getMorphoVaultsBulk: vi.fn(async () => new Map()),
    MORPHO_CHAINS: [],
  }))
  vi.doMock("@/lib/onchain/balances", () => ({
    getEthenaIdleBalances: vi.fn(async () => ({
      rows: [{ symbol: "USDe", totalUsd: 1_000_000, isErc4626: false }],
      totalUsd: 1_000_000,
      reserveFundRows: [], reserveFundTotalUsd: 0, walletIdleUsd: [], failures: [], uncoveredChains: [],
    })),
  }))
  vi.doMock("@/lib/onchain/xrpl", () => ({ getEthenaRlusdHoldings: vi.fn(async () => ({ totalUsd: 0, wallets: [] })) }))
  vi.doMock("@/lib/solana", () => ({ getEthenaSolanaPositions: vi.fn(async () => ({ rows: [], failed: [] })) }))
  vi.doMock("@/lib/solana/balances", () => ({
    getEthenaSolanaIdleBalances: vi.fn(async () => ({
      rows: [{ symbol: "JAAA", totalUsd: 200_000_000, isErc4626: false, approx: true }],
      totalUsd: 200_000_000,
      walletTotalUsd: [
        { address: FAQ, totalUsd: 200_000_000 },
        { address: C23, totalUsd: 251_400_000 },
      ],
      failures: [],
    })),
  }))
}

describe("loadFootprint Solana integration", () => {
  it("folds Solana idle (JAAA) into idle.rows + idle.totalUsd", async () => {
    stubBaseFetchers()
    const { loadFootprint } = await import("@/lib/views/footprint")
    const res = await loadFootprint()
    expect(res.idle.rows.some((r) => r.symbol === "JAAA")).toBe(true)
    expect(res.idle.totalUsd).toBeCloseTo(201_000_000, 0) // 1M USDe + 200M JAAA
    expect(res.failedSolanaBalances).toEqual([])
  })

  it("shows the Solana wallets in inventory at their ON-CHAIN total (incl deployed jleUSDG)", async () => {
    stubBaseFetchers()
    const { loadFootprint } = await import("@/lib/views/footprint")
    const res = await loadFootprint()
    const c23 = res.walletInventory.find((w) => w.address === C23)!
    expect(c23.chain).toBe("solana")
    expect(c23.totalUsd).toBeCloseTo(251_400_000, 0) // on-chain (jleUSDG), NOT snapshot
    const faq = res.walletInventory.find((w) => w.address === FAQ)!
    expect(faq.totalUsd).toBeCloseTo(200_000_000, 0)
  })
})
