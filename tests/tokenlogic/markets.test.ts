import { describe, it, expect, vi, beforeEach } from "vitest"

beforeEach(() => {
  vi.resetModules()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.stubEnv("TOKENLOGIC_API_KEY", "test")
  vi.stubEnv("TOKENLOGIC_API_BASE_URL", "https://x")
  vi.stubEnv("ALCHEMY_KEY", "test-alchemy")
})

describe("getMarketAggregates", () => {
  it("returns reserves keyed by (market_key, lowercased reserve_address)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          data: [
            {
              protocol: "aave_v3",
              market_key: "plasma-core-v3",
              reserve_address: "0xAAA",
              reserve_symbol: "USDT0",
              deposits: 1_000_000,
              borrows: 500_000,
              available_liquidity: 500_000,
              borrow_capacity: 800_000,
              utilization: 0.5,
              borrow_apy: 0.06,
              supply_apy: 0.03,
              reserve_price: 1.0,
            },
          ],
        }),
      }),
    )
    const { getMarketAggregates, aggregateKey } = await import("@/lib/tokenlogic/markets")

    const r = await getMarketAggregates()
    expect(r.size).toBe(1)
    expect(r.get(aggregateKey("plasma-core-v3", "0xAAA"))?.deposits).toBe(1_000_000)
  })
})
