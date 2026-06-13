import { describe, it, expect, vi, beforeEach } from "vitest"
import { readFileSync } from "node:fs"
import path from "node:path"

const stacFixture = JSON.parse(
  readFileSync(path.join(__dirname, "fixtures", "das-get-asset-stac.json"), "utf8"),
)

const STAC_MINT = "u49MwZqu4bHRHRsciaBarHK7JZDYGxuaNnwyMBdEKYk"
const UNKNOWN_MINT = "unknownMintAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"

beforeEach(() => {
  vi.resetModules()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.stubEnv("ALCHEMY_KEY", "test-key")
  vi.stubEnv("TOKENLOGIC_API_KEY", "test")
})

describe("fetchAssetIdentities", () => {
  it("returns symbol and name for a known mint (STAC)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => stacFixture,
      }),
    )
    const { fetchAssetIdentities } = await import("@/lib/solana/das")
    const result = await fetchAssetIdentities([STAC_MINT])
    const identity = result.get(STAC_MINT)
    expect(identity).toBeDefined()
    expect(identity?.symbol).toBe("STAC")
    expect(identity?.name).toBe("Securitize Tokenized AAA CLO Fund")
  })

  it("omits a mint whose DAS response has no metadata", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          jsonrpc: "2.0",
          id: 1,
          result: {
            id: UNKNOWN_MINT,
            content: {},
          },
        }),
      }),
    )
    const { fetchAssetIdentities } = await import("@/lib/solana/das")
    const result = await fetchAssetIdentities([UNKNOWN_MINT])
    expect(result.has(UNKNOWN_MINT)).toBe(false)
  })

  it("returns empty map for empty input without calling fetch", async () => {
    const spy = vi.fn()
    vi.stubGlobal("fetch", spy)
    const { fetchAssetIdentities } = await import("@/lib/solana/das")
    const result = await fetchAssetIdentities([])
    expect(result.size).toBe(0)
    expect(spy).not.toHaveBeenCalled()
  })

  it("omits a mint when DAS returns an error result", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          jsonrpc: "2.0",
          id: 1,
          error: { code: -32602, message: "Invalid param: asset not found" },
        }),
      }),
    )
    const { fetchAssetIdentities } = await import("@/lib/solana/das")
    const result = await fetchAssetIdentities([UNKNOWN_MINT])
    expect(result.has(UNKNOWN_MINT)).toBe(false)
  })
})
