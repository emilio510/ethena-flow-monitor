import { describe, it, expect, vi, beforeEach } from "vitest"
import { readFileSync } from "node:fs"
import path from "node:path"

const FIXTURES = path.join(__dirname, "fixtures")
const reservesFixture = JSON.parse(
  readFileSync(path.join(FIXTURES, "kamino-reserves-metrics.json"), "utf8"),
)
const vaultFixture = JSON.parse(
  readFileSync(path.join(FIXTURES, "kamino-vault-metrics.json"), "utf8"),
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

describe("fetchEthenaMarketReserves", () => {
  it("parses the Kamino Ethena Market reserves fixture", async () => {
    stubFetch(reservesFixture)
    const { fetchEthenaMarketReserves } = await import("@/lib/solana/kamino")
    const reserves = await fetchEthenaMarketReserves()
    expect(reserves.length).toBe(6)
    const usde = reserves.find((r) => r.liquidityToken === "USDe")!
    const usdg = reserves.find((r) => r.liquidityToken === "USDG")!
    // USDe is the collateral (maxLtv 0.92), USDG the debt (maxLtv 0).
    expect(usde.maxLtv).toBeGreaterThan(0.5)
    expect(usdg.maxLtv).toBe(0)
    expect(usdg.totalBorrowUsd).toBeGreaterThan(0)
  })
})

describe("fetchEthenaPrimeVaultMetrics", () => {
  it("coerces Kamino's decimal-string fields to numbers", async () => {
    stubFetch(vaultFixture)
    const { fetchEthenaPrimeVaultMetrics } = await import("@/lib/solana/kamino")
    const v = await fetchEthenaPrimeVaultMetrics()
    expect(typeof v.apy).toBe("number")
    expect(typeof v.sharePrice).toBe("number")
    expect(v.tokensInvestedUsd).toBeGreaterThan(0)
    expect(v.numberOfHolders).toBeGreaterThan(0)
  })
})

describe("computeKaminoRecursion", () => {
  it("is ~100% — USDe + sUSDe are the only maxLtv>0 collateral", async () => {
    stubFetch(reservesFixture)
    const { fetchEthenaMarketReserves, computeKaminoRecursion } = await import(
      "@/lib/solana/kamino"
    )
    const reserves = await fetchEthenaMarketReserves()
    expect(computeKaminoRecursion(reserves)).toBeCloseTo(1, 5)
  })

  it("returns 0 when no reserve accepts collateral", async () => {
    const { computeKaminoRecursion } = await import("@/lib/solana/kamino")
    const noCollateral = [
      {
        reserve: "x",
        liquidityToken: "USDG",
        liquidityTokenMint: "m",
        maxLtv: 0,
        borrowApy: 0,
        supplyApy: 0,
        totalSupply: 100,
        totalBorrow: 50,
        totalSupplyUsd: 100,
        totalBorrowUsd: 50,
      },
    ]
    expect(computeKaminoRecursion(noCollateral)).toBe(0)
  })
})
