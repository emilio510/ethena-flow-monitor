import { describe, it, expect, vi, beforeEach } from "vitest"
import { RLUSD_CURRENCY_HEX, RLUSD_ISSUER } from "@/config/xrpl"

beforeEach(() => {
  vi.resetModules()
  vi.unstubAllGlobals()
  vi.stubEnv("ALCHEMY_KEY", "test-key")
})

describe("probeDestination — XRPL", () => {
  it("decodes trust-line currencies and counts them", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true, status: 200,
      json: async () => ({ result: { lines: [
        { currency: RLUSD_CURRENCY_HEX, account: RLUSD_ISSUER, balance: "80000000" },
      ] } }),
    })))
    const { probeDestination } = await import("@/lib/flows/probe")
    const h = await probeDestination("xrpl", "rDest")
    expect(h).toEqual({ chain: "xrpl", tokens: ["RLUSD"], trustLineCount: 1 })
  })
})

describe("probeDestination — EVM", () => {
  it("returns symbols for nonzero stable balances", async () => {
    // alchemy_getTokenBalances returns hex balances per contract.
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true, status: 200,
      json: async () => ({ result: { tokenBalances: [
        { contractAddress: "0x4c9edd5852cd905f086c759e8383e09bff1e68b3", tokenBalance: "0x16345785d8a0000" }, // USDe, nonzero
        { contractAddress: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", tokenBalance: "0x0" },              // USDC, zero
      ] } }),
    })))
    const { probeDestination } = await import("@/lib/flows/probe")
    const h = await probeDestination("ethereum", "0xDEST")
    expect(h).toEqual({ chain: "ethereum", tokens: ["USDe"] })
  })
})
