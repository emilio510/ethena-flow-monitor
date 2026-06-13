/**
 * Tests for the untracked-holdings audit wiring in loadFootprint.
 *
 * Invariants verified:
 * 1. loadFootprint returns untrackedHoldings.
 * 2. Morpho vault addresses ARE in the exclusion set (not re-flagged).
 * 3. Backing totals (deployedUsd, idle.totalUsd) are UNCHANGED by the audit.
 *
 * BigInt literals use BigInt("...") call form (ES2017 target).
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import type { UntrackedFinding } from "@/lib/onchain/untracked-audit"

beforeEach(() => {
  vi.resetModules()
  vi.unstubAllGlobals()
})

const MORPHO_VAULT_ADDR = "0xbeef000000000000000000000000000000000001"
const UNTRACKED_ADDR    = "0xfeed000000000000000000000000000000000002"

/** Stub all base fetchers to return minimal valid data.
 *  Includes one Morpho position with a known vault address. */
function stubBaseFetchers() {
  vi.doMock("@/lib/tokenlogic/positions", () => ({
    getEthenaPositions: vi.fn(async () => ({ rows: [], failedWallets: [] })),
    getMarketPositionsBulk: vi.fn(async () => ({ byMarket: new Map(), failedMarkets: [] })),
  }))
  vi.doMock("@/lib/tokenlogic/markets", () => ({
    getMarketAggregates: vi.fn(async () => new Map()),
  }))
  vi.doMock("@/lib/morpho/positions", () => ({
    getEthenaMorphoPositions: vi.fn(async () => ({
      positions: [
        {
          chain: "ethereum",
          walletAddress: "0xb8734a14fbd4aa2d44e6aa830405ffc861ba313c",
          vaultAddress: MORPHO_VAULT_ADDR,
          vaultName: "Steakhouse USDC",
          vaultAssetSymbol: "USDC",
          vaultVersion: "V1",
          ethenaSuppliedUsd: 5_000_000,
        },
      ],
      failedWallets: [],
    })),
    getMorphoVaultsBulk: vi.fn(async () => new Map()),
    MORPHO_CHAINS: [{ chain: "ethereum", chainId: 1 }, { chain: "base", chainId: 8453 }],
  }))
  vi.doMock("@/lib/onchain/balances", () => ({
    getEthenaIdleBalances: vi.fn(async () => ({
      rows: [{ symbol: "USDe", totalUsd: 1_000_000, isErc4626: false }],
      totalUsd: 1_000_000,
      reserveFundRows: [],
      reserveFundTotalUsd: 0,
      walletIdleUsd: [],
      failures: [],
      uncoveredChains: [],
    })),
  }))
  vi.doMock("@/lib/onchain/xrpl", () => ({
    getEthenaRlusdHoldings: vi.fn(async () => ({ totalUsd: 0, wallets: [] })),
  }))
  vi.doMock("@/lib/solana", () => ({
    getEthenaSolanaPositions: vi.fn(async () => ({ rows: [], failed: [] })),
  }))
  vi.doMock("@/lib/solana/balances", () => ({
    getEthenaSolanaIdleBalances: vi.fn(async () => ({
      rows: [],
      totalUsd: 0,
      walletTotalUsd: [],
      failures: [],
    })),
  }))
}

describe("loadFootprint — untrackedHoldings wiring", () => {
  it("returns untrackedHoldings field on the result", async () => {
    stubBaseFetchers()

    // Audit returns one finding
    const finding: UntrackedFinding = {
      chain: "ethereum",
      wallet: "0xb8734a14fbd4aa2d44e6aa830405ffc861ba313c",
      address: UNTRACKED_ADDR,
      symbol: "MYSTERY",
      valueUsd: 2_000_000,
      kind: "priced",
    }
    vi.doMock("@/lib/onchain/untracked-audit", () => ({
      auditUntrackedHoldings: vi.fn(async () => [finding]),
    }))

    const { loadFootprint } = await import("@/lib/views/footprint")
    const res = await loadFootprint()

    expect(Array.isArray(res.untrackedHoldings)).toBe(true)
    expect(res.untrackedHoldings).toHaveLength(1)
    expect(res.untrackedHoldings[0]!.symbol).toBe("MYSTERY")
    expect(res.untrackedHoldings[0]!.valueUsd).toBe(2_000_000)
  })

  it("passes morpho vault address in the exclusion set so it is NOT re-flagged", async () => {
    stubBaseFetchers()

    let capturedExclude: ReadonlySet<string> | undefined

    vi.doMock("@/lib/onchain/untracked-audit", () => ({
      auditUntrackedHoldings: vi.fn(async (exclude: ReadonlySet<string>) => {
        capturedExclude = exclude
        return [] as UntrackedFinding[]
      }),
    }))

    const { loadFootprint } = await import("@/lib/views/footprint")
    await loadFootprint()

    expect(capturedExclude).toBeDefined()
    // The Morpho vault address must be in the exclusion set
    expect(capturedExclude!.has(MORPHO_VAULT_ADDR.toLowerCase())).toBe(true)
  })

  it("backing totals (deployedUsd, idle.totalUsd) are UNCHANGED regardless of audit findings", async () => {
    stubBaseFetchers()

    // Audit returns a large finding — must NOT affect backing
    const finding: UntrackedFinding = {
      chain: "ethereum",
      wallet: "0xb8734a14fbd4aa2d44e6aa830405ffc861ba313c",
      address: UNTRACKED_ADDR,
      symbol: "BIG_TOKEN",
      valueUsd: 999_000_000, // $999M — must NOT enter backing
      kind: "erc4626-stable",
    }
    vi.doMock("@/lib/onchain/untracked-audit", () => ({
      auditUntrackedHoldings: vi.fn(async () => [finding]),
    }))

    const { loadFootprint } = await import("@/lib/views/footprint")
    const res = await loadFootprint()

    // idle.totalUsd must be exactly what getEthenaIdleBalances returned ($1M)
    expect(res.idle.totalUsd).toBe(1_000_000)
    // deployedUsd: Morpho supplied $5M, Aave $0 — but Morpho rows filtered by
    // MIN_DUST_USD ($1M) and the vault has no vaultDetail so it still shows.
    // Key invariant: deployedUsd does NOT include the $999M finding.
    expect(res.deployedUsd).toBeLessThan(10_000_000) // well below $999M
    expect(res.untrackedHoldings[0]!.valueUsd).toBe(999_000_000)
  })

  it("returns empty untrackedHoldings when the audit throws (partial-tolerant)", async () => {
    stubBaseFetchers()

    vi.doMock("@/lib/onchain/untracked-audit", () => ({
      auditUntrackedHoldings: vi.fn(async () => {
        throw new Error("RPC unreachable")
      }),
    }))

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})

    const { loadFootprint } = await import("@/lib/views/footprint")
    const res = await loadFootprint()

    expect(res.untrackedHoldings).toEqual([])
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("auditUntrackedHoldings"))

    warnSpy.mockRestore()
  })
})
