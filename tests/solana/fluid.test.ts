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
    // computeJupiterRecursion also needs the lending token; pull it too.
    stubFetch(lendingFixture)
    const { fetchEthenaLendingTokens } = await import("@/lib/solana/fluid")
    const lending = await fetchEthenaLendingTokens()
    const score = computeJupiterRecursion(vaults, lending[0]!)
    expect(score).toBeCloseTo(1, 2)
  })
})
