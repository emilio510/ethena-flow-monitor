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

  it("converts non-stable reserves from tokens to USD via reserve_price", async () => {
    // The /v1/aave/markets/latest endpoint returns deposits/borrows in token
    // units with reserve_price separately — for stables this looks correct
    // because price ≈ 1, but for wstETH at ~$2500 the unmultiplied value
    // under-reports by ~2500×, which is the bug this assertion guards.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          data: [
            {
              protocol: "aave_v3",
              market_key: "megaeth-core-v3",
              reserve_address: "0xBBB",
              reserve_symbol: "wstETH",
              deposits: 10, // 10 wstETH tokens
              borrows: 4, // 4 wstETH borrowed
              available_liquidity: 6,
              borrow_capacity: 8,
              utilization: 0.4,
              borrow_apy: 0.05,
              supply_apy: 0.02,
              reserve_price: 2500, // $/wstETH
            },
          ],
        }),
      }),
    )
    const { getMarketAggregates, aggregateKey } = await import("@/lib/tokenlogic/markets")
    const r = await getMarketAggregates()
    const row = r.get(aggregateKey("megaeth-core-v3", "0xBBB"))
    expect(row?.deposits).toBe(25_000) // 10 × 2500
    expect(row?.borrows).toBe(10_000) // 4 × 2500
    expect(row?.available_liquidity).toBe(15_000) // 6 × 2500
  })
})
