import { describe, it, expect } from "vitest"
import { MARKETS, getMarket, marketKeyForChain } from "@/config/markets"

describe("MARKETS", () => {
  it("covers exactly the 5 target chains", () => {
    const chains = MARKETS.map((m) => m.chain).sort()
    expect(chains).toEqual(["base", "ethereum", "mantle", "megaeth", "plasma"])
  })

  it("each market has a valid market_key and chain id", () => {
    for (const m of MARKETS) {
      expect(m.marketKey).toMatch(/-core-v3$/)
      expect(typeof m.chainId).toBe("number")
    }
  })
})

describe("marketKeyForChain", () => {
  it("returns the right key", () => {
    expect(marketKeyForChain("plasma")).toBe("plasma-core-v3")
    expect(marketKeyForChain("megaeth")).toBe("megaeth-core-v3")
  })
})

describe("getMarket", () => {
  it("returns a market by key", () => {
    expect(getMarket("ethereum-core-v3")?.chain).toBe("ethereum")
  })

  it("returns undefined for unknown keys", () => {
    expect(getMarket("foo-core-v3")).toBeUndefined()
  })
})
