import { describe, it, expect, vi, beforeEach } from "vitest"

beforeEach(() => {
  vi.resetModules()
  vi.unstubAllGlobals()
  vi.stubEnv("ALCHEMY_KEY", "test-key")
})

function transfer(opts: { hash: string; from: string; to: string; value: number; contract: string; asset: string; iso: string }) {
  return {
    hash: opts.hash, from: opts.from, to: opts.to, value: opts.value, asset: opts.asset,
    rawContract: { address: opts.contract }, metadata: { blockTimestamp: opts.iso },
  }
}

const WALLET = "0xb8734a14fbd4aa2d44e6aa830405ffc861ba313c"
const USDE = "0x4c9EDD5852cd905f086C759E8383e09bff1E68B3"
const RECENT_ISO = "2026-05-26T13:24:00.000Z"
const since = Math.floor(new Date("2026-05-19T00:00:00Z").getTime() / 1000)

describe("scanEvmFlows", () => {
  it("returns ≥$1M transfers, mapping contract to symbol and ISO to unix", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true, status: 200,
      json: async () => ({ result: { transfers: [transfer({ hash: "0xH1", from: WALLET, to: "0xDEST", value: 5_000_000, contract: USDE, asset: "USDe", iso: RECENT_ISO })] } }),
    })))
    const { scanEvmFlows } = await import("@/lib/flows/evm-flows")
    const flows = await scanEvmFlows([WALLET], since)
    expect(flows).toHaveLength(1)
    expect(flows[0]).toMatchObject({ chain: "ethereum", from: WALLET.toLowerCase(), to: "0xdest", asset: "USDe", amountUsd: 5_000_000, txHash: "0xH1" })
    expect(flows[0].timestamp).toBe(Math.floor(new Date(RECENT_ISO).getTime() / 1000))
  })
  it("drops sub-$1M transfers", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true, status: 200,
      json: async () => ({ result: { transfers: [transfer({ hash: "0xH2", from: WALLET, to: "0xDEST", value: 999_999, contract: USDE, asset: "USDe", iso: RECENT_ISO })] } }),
    })))
    const { scanEvmFlows } = await import("@/lib/flows/evm-flows")
    expect(await scanEvmFlows([WALLET], since)).toHaveLength(0)
  })
  it("drops transfers older than the window", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true, status: 200,
      json: async () => ({ result: { transfers: [transfer({ hash: "0xH3", from: WALLET, to: "0xDEST", value: 5_000_000, contract: USDE, asset: "USDe", iso: "2026-01-01T00:00:00Z" })] } }),
    })))
    const { scanEvmFlows } = await import("@/lib/flows/evm-flows")
    expect(await scanEvmFlows([WALLET], since)).toHaveLength(0)
  })
  it("follows pageKey across pages then stops", async () => {
    let call = 0
    vi.stubGlobal("fetch", vi.fn(async () => {
      call++
      if (call === 1) {
        return { ok: true, status: 200, json: async () => ({ result: {
          transfers: [transfer({ hash: "0xP1", from: WALLET, to: "0xDEST", value: 2_000_000, contract: USDE, asset: "USDe", iso: RECENT_ISO })],
          pageKey: "next-page",
        } }) }
      }
      return { ok: true, status: 200, json: async () => ({ result: {
        transfers: [transfer({ hash: "0xP2", from: WALLET, to: "0xDEST", value: 3_000_000, contract: USDE, asset: "USDe", iso: RECENT_ISO })],
      } }) }
    }))
    const { scanEvmFlows } = await import("@/lib/flows/evm-flows")
    const flows = await scanEvmFlows([WALLET], since)
    expect(call).toBe(2)
    expect(flows.map((f) => f.txHash).sort()).toEqual(["0xP1", "0xP2"])
  })
  it("throws on an Alchemy JSON-RPC error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true, status: 200, json: async () => ({ error: { message: "invalid api key" } }),
    })))
    const { scanEvmFlows } = await import("@/lib/flows/evm-flows")
    await expect(scanEvmFlows([WALLET], since)).rejects.toThrow(/invalid api key/)
  })
  it("throws on an HTTP error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 429, json: async () => ({}) })))
    const { scanEvmFlows } = await import("@/lib/flows/evm-flows")
    await expect(scanEvmFlows([WALLET], since)).rejects.toThrow(/HTTP 429/)
  })
})
