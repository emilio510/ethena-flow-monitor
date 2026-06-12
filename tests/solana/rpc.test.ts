import { describe, it, expect, vi, beforeEach } from "vitest"
import { readFileSync } from "node:fs"
import path from "node:path"

const accountsFixture = JSON.parse(
  readFileSync(path.join(__dirname, "fixtures", "token-accounts-4faqc6.json"), "utf8"),
)

beforeEach(() => {
  vi.resetModules()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.stubEnv("ALCHEMY_KEY", "test-key")
  vi.stubEnv("TOKENLOGIC_API_KEY", "test")
})

describe("getTokenBalancesByOwner", () => {
  it("flattens parsed token accounts into {mint, rawAmount, decimals}", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => accountsFixture, text: async () => "" }))
    const { getTokenBalancesByOwner } = await import("@/lib/solana/rpc")
    const balances = await getTokenBalancesByOwner("4FaQc6QZ5skFjcDF64mKcXRhtCCsnArZcr1xumPNrbtN")
    const jaaa = balances.find((b) => b.mint === "AAAJXeGjpKu7W3X4QTSU4pm1Wbj4G2LPcdg7A6xJLLyG")!
    expect(jaaa.rawAmount).toBe(192821471943242n)
    expect(jaaa.decimals).toBe(6)
  })

  it("queries both token programs (two RPC calls)", async () => {
    const spy = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ jsonrpc: "2.0", id: 1, result: { value: [] } }), text: async () => "" })
    vi.stubGlobal("fetch", spy)
    const { getTokenBalancesByOwner } = await import("@/lib/solana/rpc")
    await getTokenBalancesByOwner("4FaQc6QZ5skFjcDF64mKcXRhtCCsnArZcr1xumPNrbtN")
    expect(spy).toHaveBeenCalledTimes(2)
  })
})
