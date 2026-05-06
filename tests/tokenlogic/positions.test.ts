import { describe, it, expect, vi, beforeEach } from "vitest"

const baseRow = {
  protocol: "aave_v3",
  chain: "plasma",
  market_key: "plasma-core-v3",
  market_label: "Core",
  user_address: "0xb8734a14fbd4aa2d44e6aa830405ffc861ba313c",
  wallet_label: null,
  latest_block_day: { value: "2026-05-06" },
  supply_reserve_symbols: ["USDT0"],
  supply_reserve_amount: 100,
  supply_reserve_amount_usd: 99.5,
  total_supply_amount_usd: 99.5,
  borrow_reserve_symbols: [],
  borrow_reserve_amount: 0,
  borrow_reserve_amount_usd: 0,
  total_borrow_amount_usd: 0,
  health_factor: null,
  net_apy: 0.04,
  net_usd_per_day: 0.5,
  days_to_liquidation: null,
}

beforeEach(() => {
  vi.resetModules()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.stubEnv("TOKENLOGIC_API_KEY", "test")
  vi.stubEnv("TOKENLOGIC_API_BASE_URL", "https://x")
})

describe("getEthenaPositions", () => {
  it("queries every wallet and merges results", async () => {
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      const wallet = new URL(url).searchParams.get("user_address")
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ data: [{ ...baseRow, user_address: wallet }] }),
      })
    })
    vi.stubGlobal("fetch", mockFetch)
    const { getEthenaPositions } = await import("@/lib/tokenlogic/positions")

    const result = await getEthenaPositions()
    expect(result.rows).toHaveLength(11)
    expect(result.failedWallets).toEqual([])
    expect(mockFetch).toHaveBeenCalledTimes(11)
  })
})

describe("getMarketPositions", () => {
  it("paginates until exhausted", async () => {
    const PAGE_SIZE = 10_000
    const page1 = Array.from({ length: PAGE_SIZE }, (_, i) => ({
      ...baseRow,
      user_address: `0x${i.toString(16).padStart(40, "0")}`,
    }))
    const page2 = Array.from({ length: 47 }, (_, i) => ({
      ...baseRow,
      user_address: `0x${(PAGE_SIZE + i).toString(16).padStart(40, "0")}`,
    }))
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      const offset = Number(new URL(url).searchParams.get("offset") ?? "0")
      const data = offset === 0 ? page1 : offset === PAGE_SIZE ? page2 : []
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ data }) })
    })
    vi.stubGlobal("fetch", mockFetch)
    const { getMarketPositions } = await import("@/lib/tokenlogic/positions")

    const rows = await getMarketPositions("plasma-core-v3")
    expect(rows).toHaveLength(PAGE_SIZE + 47)
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })
})
