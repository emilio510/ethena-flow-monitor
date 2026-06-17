import { describe, it, expect, vi, beforeEach } from "vitest"
import { readFileSync } from "node:fs"
import path from "node:path"

const FIXTURES = path.join(__dirname, "fixtures")
const borrowingFixture = JSON.parse(
  readFileSync(path.join(FIXTURES, "fluid-borrowing-vaults.json"), "utf8"),
)
const lendingFixture = JSON.parse(
  readFileSync(path.join(FIXTURES, "fluid-lending-tokens.json"), "utf8"),
)

beforeEach(() => {
  vi.resetModules()
  vi.unstubAllGlobals()
})

function stubFetch(payload: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => payload }),
  )
}

describe("fetchEthenaBorrowingVaults", () => {
  it("parses the Fluid borrowing-vaults fixture (strings + numbers coerced)", async () => {
    stubFetch(borrowingFixture)
    const { fetchEthenaBorrowingVaults } = await import("@/lib/solana/fluid")
    const vaults = await fetchEthenaBorrowingVaults()
    expect(vaults.length).toBeGreaterThan(0)
    const usdeUsdg = vaults.find(
      (v) => v.supplyToken.symbol === "USDe" && v.borrowToken.symbol === "USDG",
    )!
    expect(usdeUsdg).toBeDefined()
    // collateralFactor/liquidationThreshold arrive as numeric strings.
    expect(typeof usdeUsdg.collateralFactor).toBe("number")
    expect(typeof usdeUsdg.liquidationThreshold).toBe("number")
    expect(usdeUsdg.collateralFactor).toBeGreaterThan(0)
  })
})

describe("fetchEthenaLendingTokens", () => {
  it("parses the jleUSDG lending token fixture", async () => {
    stubFetch(lendingFixture)
    const { fetchEthenaLendingTokens } = await import("@/lib/solana/fluid")
    const tokens = await fetchEthenaLendingTokens()
    expect(tokens.length).toBeGreaterThan(0)
    expect(tokens[0]!.asset.symbol).toBe("USDG")
  })
})

describe("computeJupiterRecursion", () => {
  it("is ~100% — USDG borrows are collateralised by USDe", async () => {
    stubFetch(borrowingFixture)
    const { fetchEthenaBorrowingVaults, computeJupiterRecursion } = await import(
      "@/lib/solana/fluid"
    )
    const vaults = await fetchEthenaBorrowingVaults()
    // Real $-math from borrow amounts — no dependency on a rate flag.
    expect(computeJupiterRecursion(vaults)).toBeCloseTo(1, 2)
  })

  it("returns 0 when no USDG is borrowed", async () => {
    const { computeJupiterRecursion } = await import("@/lib/solana/fluid")
    expect(computeJupiterRecursion([])).toBe(0)
  })
})

describe("totalUsdgBorrowedUsd", () => {
  // Mirror the FluidBorrowingVault fixture shape; only the fields the helper
  // reads (borrowToken.symbol/decimals/price, totalBorrow) need real values.
  function makeVault(opts: {
    borrowSymbol: string
    totalBorrow: number
    borrowDecimals: number
    borrowPrice: number
  }) {
    return {
      id: 0,
      address: "vault",
      supplyToken: { address: "s", chainId: "solana", symbol: "USDe", decimals: 6, price: 1 },
      borrowToken: {
        address: "b",
        chainId: "solana",
        symbol: opts.borrowSymbol,
        decimals: opts.borrowDecimals,
        price: opts.borrowPrice,
      },
      liquidationThreshold: 0.94,
      collateralFactor: 0.92,
      supplyRate: 0,
      borrowRate: 0,
      totalSupply: 0,
      totalBorrow: opts.totalBorrow,
    } as const
  }

  it("sums USDG borrows across borrow vaults, ignoring non-USDG vaults", async () => {
    const { totalUsdgBorrowedUsd } = await import("@/lib/solana/fluid")
    const vaults = [
      makeVault({ borrowSymbol: "USDG", totalBorrow: 100, borrowDecimals: 0, borrowPrice: 1 }),
      makeVault({ borrowSymbol: "USDG", totalBorrow: 50, borrowDecimals: 0, borrowPrice: 1 }),
      makeVault({ borrowSymbol: "WSOL", totalBorrow: 999, borrowDecimals: 0, borrowPrice: 1 }),
    ]
    expect(totalUsdgBorrowedUsd(vaults)).toBeCloseTo(150)
  })
})
