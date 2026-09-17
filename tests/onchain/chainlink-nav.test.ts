import { describe, it, expect, vi, beforeEach } from "vitest"

beforeEach(() => {
  vi.resetModules()
  vi.unstubAllEnvs()
  vi.stubEnv("ALCHEMY_KEY", "test-key")
  vi.stubEnv("TOKENLOGIC_API_KEY", "test")
})

const JAAA_FEED = "0x3BbccB2301759D2e4A5692bA72DAb4b75dC43B1a"
const NOW_SEC = 1_789_650_000

/** viem readContract mock: decimals → 6, latestRoundData → tuple. */
function readContractFor(answer: bigint, updatedAt: number) {
  return vi.fn(async ({ functionName }: { functionName: string }) => {
    if (functionName === "decimals") return 6
    if (functionName === "latestRoundData")
      return [BigInt(1), answer, BigInt(updatedAt), BigInt(updatedAt), BigInt(1)]
    throw new Error(`unexpected fn ${functionName}`)
  })
}

describe("fetchChainlinkNavPrices", () => {
  it("returns symbol → NAV in USD from latestRoundData (6 dp) when fresh", async () => {
    const readContract = readContractFor(BigInt(1_049_803), NOW_SEC - 3600)
    vi.doMock("@/lib/onchain/clients", () => ({ getPublicClient: vi.fn(() => ({ readContract })) }))
    const { fetchChainlinkNavPrices } = await import("@/lib/onchain/chainlink-nav")
    const prices = await fetchChainlinkNavPrices({ JAAA: JAAA_FEED }, NOW_SEC * 1000)
    expect(prices.get("JAAA")).toBeCloseTo(1.049803, 6)
    expect(readContract).toHaveBeenCalledWith(expect.objectContaining({ address: JAAA_FEED, functionName: "latestRoundData" }))
  })

  it("omits a stale round (older than the max age) and warns — never returns it", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const readContract = readContractFor(BigInt(1_049_803), NOW_SEC - 10 * 86_400)
    vi.doMock("@/lib/onchain/clients", () => ({ getPublicClient: vi.fn(() => ({ readContract })) }))
    const { fetchChainlinkNavPrices } = await import("@/lib/onchain/chainlink-nav")
    const prices = await fetchChainlinkNavPrices({ JAAA: JAAA_FEED }, NOW_SEC * 1000)
    expect(prices.has("JAAA")).toBe(false)
    expect(warn).toHaveBeenCalled()
  })

  it("omits a non-positive answer", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    const readContract = readContractFor(BigInt(0), NOW_SEC - 60)
    vi.doMock("@/lib/onchain/clients", () => ({ getPublicClient: vi.fn(() => ({ readContract })) }))
    const { fetchChainlinkNavPrices } = await import("@/lib/onchain/chainlink-nav")
    const prices = await fetchChainlinkNavPrices({ JAAA: JAAA_FEED }, NOW_SEC * 1000)
    expect(prices.has("JAAA")).toBe(false)
  })

  it("omits a feed whose read fails (NOT 0) and warns", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    vi.doMock("@/lib/onchain/clients", () => ({
      getPublicClient: vi.fn(() => ({ readContract: vi.fn().mockRejectedValue(new Error("rpc down")) })),
    }))
    const { fetchChainlinkNavPrices } = await import("@/lib/onchain/chainlink-nav")
    const prices = await fetchChainlinkNavPrices({ JAAA: JAAA_FEED }, NOW_SEC * 1000)
    expect(prices.size).toBe(0)
    expect(warn).toHaveBeenCalled()
  })

  it("empty feed map → empty map, no client call", async () => {
    const getPublicClient = vi.fn()
    vi.doMock("@/lib/onchain/clients", () => ({ getPublicClient }))
    const { fetchChainlinkNavPrices } = await import("@/lib/onchain/chainlink-nav")
    const prices = await fetchChainlinkNavPrices({}, NOW_SEC * 1000)
    expect(prices.size).toBe(0)
    expect(getPublicClient).not.toHaveBeenCalled()
  })
})
