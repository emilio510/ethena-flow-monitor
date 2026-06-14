import { describe, it, expect, vi, beforeEach } from "vitest"

beforeEach(() => {
  vi.resetModules()
  vi.unstubAllEnvs()
  vi.stubEnv("ALCHEMY_KEY", "test-key")
  vi.stubEnv("TOKENLOGIC_API_KEY", "test")
})

describe("getUsdeCirculatingSupply", () => {
  it("reads mainnet totalSupply and returns USD (18 decimals)", async () => {
    const readContract = vi.fn().mockResolvedValue(BigInt("4487000000000000000000000000")) // 4.487B * 1e18
    vi.doMock("@/lib/onchain/clients", () => ({
      getPublicClient: vi.fn(() => ({ readContract })),
    }))
    const { getUsdeCirculatingSupply } = await import("@/lib/onchain/usde-supply")
    const supply = await getUsdeCirculatingSupply()
    expect(supply).toBeCloseTo(4_487_000_000, -3)
    // queried totalSupply on the mainnet USDe contract
    expect(readContract).toHaveBeenCalledWith(
      expect.objectContaining({ functionName: "totalSupply" }),
    )
  })

  it("returns null (NOT 0) on read failure + warns", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    vi.doMock("@/lib/onchain/clients", () => ({
      getPublicClient: vi.fn(() => ({
        readContract: vi.fn().mockRejectedValue(new Error("rpc down")),
      })),
    }))
    const { getUsdeCirculatingSupply } = await import("@/lib/onchain/usde-supply")
    const supply = await getUsdeCirculatingSupply()
    expect(supply).toBeNull()
    expect(warn).toHaveBeenCalled()
  })
})
