import { describe, it, expect } from "vitest"
import { classify } from "@/lib/recursion/classify"

describe("classify", () => {
  it("returns TIER_1 for Ethena-issued tokens", () => {
    expect(classify("USDe")).toBe("TIER_1")
    expect(classify("sUSDe")).toBe("TIER_1")
    expect(classify("USDtb")).toBe("TIER_1")
  })

  it("returns PT for any PT-* maturity", () => {
    expect(classify("PT-sUSDe-25JUN2026")).toBe("PT")
  })

  it("returns TIER_2 for backing assets", () => {
    expect(classify("USDC")).toBe("TIER_2")
    expect(classify("USDT0")).toBe("TIER_2")
    expect(classify("PYUSD")).toBe("TIER_2")
  })

  it("returns OTHER for everything else", () => {
    expect(classify("WETH")).toBe("OTHER")
    expect(classify("syrupUSDT")).toBe("OTHER")
  })

  it("classifies PT before TIER lookups", () => {
    expect(classify("PT-USDe-1JAN2027")).toBe("PT")
  })
})
