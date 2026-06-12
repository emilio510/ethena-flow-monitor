import { describe, it, expect, vi, beforeEach } from "vitest"
import { readFileSync } from "node:fs"
import path from "node:path"

const fixture = JSON.parse(
  readFileSync(path.join(__dirname, "fixtures", "alchemy-prices.json"), "utf8"),
)

beforeEach(() => {
  vi.resetModules()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.stubEnv("ALCHEMY_KEY", "test-key")
  vi.stubEnv("TOKENLOGIC_API_KEY", "test")
})

function stubFetch(payload: unknown, ok = true, status = 200) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok, status, json: async () => payload, text: async () => JSON.stringify(payload) }))
}

describe("fetchTokenPrices", () => {
  it("returns a network:address -> usd map", async () => {
    stubFetch(fixture)
    const { fetchTokenPrices } = await import("@/lib/onchain/prices")
    const prices = await fetchTokenPrices([
      { network: "base-mainnet", address: "0x5a0f93d040de44e78f251b03c43be9cf317dcf64" },
    ])
    expect(prices.get("base-mainnet:0x5a0f93d040de44e78f251b03c43be9cf317dcf64")).toBeCloseTo(1.03757, 5)
  })

  it("omits addresses with no price (does NOT default to 0)", async () => {
    stubFetch(fixture)
    const { fetchTokenPrices } = await import("@/lib/onchain/prices")
    const prices = await fetchTokenPrices([
      { network: "base-mainnet", address: "0x0000000000000000000000000000000000000000" },
    ])
    expect(prices.has("base-mainnet:0x0000000000000000000000000000000000000000")).toBe(false)
  })

  it("returns empty map for empty input without calling fetch", async () => {
    const spy = vi.fn()
    vi.stubGlobal("fetch", spy)
    const { fetchTokenPrices } = await import("@/lib/onchain/prices")
    const prices = await fetchTokenPrices([])
    expect(prices.size).toBe(0)
    expect(spy).not.toHaveBeenCalled()
  })
})
