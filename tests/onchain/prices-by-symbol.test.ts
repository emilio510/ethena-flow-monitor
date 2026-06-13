import { describe, it, expect, vi, beforeEach } from "vitest"
import { readFileSync } from "node:fs"
import path from "node:path"

const fixture = JSON.parse(
  readFileSync(path.join(__dirname, "fixtures", "alchemy-prices-by-symbol.json"), "utf8"),
)

beforeEach(() => {
  vi.resetModules()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.stubEnv("ALCHEMY_KEY", "test-key")
  vi.stubEnv("TOKENLOGIC_API_KEY", "test")
})

function stubFetch(payload: unknown, ok = true, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok,
      status,
      json: async () => payload,
      text: async () => JSON.stringify(payload),
    }),
  )
}

describe("fetchPricesBySymbol", () => {
  it("returns an UPPER-SYMBOL -> price map for known symbols", async () => {
    stubFetch(fixture)
    const { fetchPricesBySymbol } = await import("@/lib/onchain/prices")
    const prices = await fetchPricesBySymbol(["STAC", "JAAA"])
    expect(prices.get("STAC")).toBeCloseTo(1020.44, 2)
    expect(prices.get("JAAA")).toBeCloseTo(1.03757, 5)
  })

  it("omits symbols with no price entry (does NOT default to 0)", async () => {
    stubFetch(fixture)
    const { fetchPricesBySymbol } = await import("@/lib/onchain/prices")
    const prices = await fetchPricesBySymbol(["UNKNOWN_TOKEN"])
    expect(prices.has("UNKNOWN_TOKEN")).toBe(false)
  })

  it("returns empty map for empty input without calling fetch", async () => {
    const spy = vi.fn()
    vi.stubGlobal("fetch", spy)
    const { fetchPricesBySymbol } = await import("@/lib/onchain/prices")
    const prices = await fetchPricesBySymbol([])
    expect(prices.size).toBe(0)
    expect(spy).not.toHaveBeenCalled()
  })

  it("omits non-finite values (never stores 0 or NaN)", async () => {
    stubFetch({
      data: [
        { symbol: "BADTOKEN", prices: [{ currency: "usd", value: "NaN" }] },
      ],
    })
    const { fetchPricesBySymbol } = await import("@/lib/onchain/prices")
    const prices = await fetchPricesBySymbol(["BADTOKEN"])
    expect(prices.has("BADTOKEN")).toBe(false)
  })

  it("uses the symbol uppercased as the map key", async () => {
    stubFetch(fixture)
    const { fetchPricesBySymbol } = await import("@/lib/onchain/prices")
    const prices = await fetchPricesBySymbol(["stac"])
    // response has "STAC" — key should be uppercased regardless of input case
    expect(prices.get("STAC")).toBeCloseTo(1020.44, 2)
  })
})
