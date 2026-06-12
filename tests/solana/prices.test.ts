import { describe, it, expect, vi, beforeEach } from "vitest"
import { readFileSync } from "node:fs"
import path from "node:path"

const fixture = JSON.parse(
  readFileSync(path.join(__dirname, "fixtures", "jupiter-prices.json"), "utf8"),
)

beforeEach(() => {
  vi.resetModules()
  vi.unstubAllGlobals()
})

function stubFetch(payload: unknown, ok = true, status = 200) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok, status, json: async () => payload, text: async () => JSON.stringify(payload) }))
}

describe("fetchJupiterPrices", () => {
  it("returns a mint -> usd map", async () => {
    stubFetch(fixture)
    const { fetchJupiterPrices } = await import("@/lib/solana/prices")
    const prices = await fetchJupiterPrices(["Bd2wJsmaF3YKC6fKLo4AFQDYaFEzWR6SNvoxvTnA6dXc"])
    expect(prices.get("Bd2wJsmaF3YKC6fKLo4AFQDYaFEzWR6SNvoxvTnA6dXc")).toBeCloseTo(1.00203, 4)
  })

  it("omits mints Jupiter cannot price (no default 0)", async () => {
    stubFetch({}) // JAAA-style: empty response
    const { fetchJupiterPrices } = await import("@/lib/solana/prices")
    const prices = await fetchJupiterPrices(["AAAJXeGjpKu7W3X4QTSU4pm1Wbj4G2LPcdg7A6xJLLyG"])
    expect(prices.has("AAAJXeGjpKu7W3X4QTSU4pm1Wbj4G2LPcdg7A6xJLLyG")).toBe(false)
  })

  it("returns empty map for empty input without calling fetch", async () => {
    const spy = vi.fn()
    vi.stubGlobal("fetch", spy)
    const { fetchJupiterPrices } = await import("@/lib/solana/prices")
    const prices = await fetchJupiterPrices([])
    expect(prices.size).toBe(0)
    expect(spy).not.toHaveBeenCalled()
  })
})
