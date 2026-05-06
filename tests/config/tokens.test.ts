import { describe, it, expect } from "vitest"
import { isTier1Symbol, isTier2Symbol, isPtSymbol } from "@/config/tokens"

describe("isTier1Symbol", () => {
  it("recognises Ethena-issued stables", () => {
    expect(isTier1Symbol("USDe")).toBe(true)
    expect(isTier1Symbol("sUSDe")).toBe(true)
    expect(isTier1Symbol("USDtb")).toBe(true)
    expect(isTier1Symbol("sUSDtb")).toBe(true)
  })

  it("rejects non-Tier-1", () => {
    expect(isTier1Symbol("USDC")).toBe(false)
    expect(isTier1Symbol("PT-sUSDe-25JUN2026")).toBe(false)
  })
})

describe("isTier2Symbol", () => {
  it("recognises backing assets", () => {
    expect(isTier2Symbol("USDC")).toBe(true)
    expect(isTier2Symbol("USDT0")).toBe(true)
    expect(isTier2Symbol("PYUSD")).toBe(true)
    expect(isTier2Symbol("USDm")).toBe(true)
  })
})

describe("isPtSymbol", () => {
  it("matches any PT-* token", () => {
    expect(isPtSymbol("PT-sUSDe-25JUN2026")).toBe(true)
    expect(isPtSymbol("PT-USDe-30OCT2026")).toBe(true)
    expect(isPtSymbol("PT-srUSDe-2APR2026")).toBe(true)
  })

  it("rejects non-PT tokens", () => {
    expect(isPtSymbol("USDe")).toBe(false)
    expect(isPtSymbol("PT")).toBe(false)
  })
})
