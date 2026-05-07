import { describe, it, expect, vi, beforeEach } from "vitest"

beforeEach(() => {
  vi.resetModules()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.stubEnv("TOKENLOGIC_API_KEY", "test-key")
  vi.stubEnv("TOKENLOGIC_API_BASE_URL", "https://api.tokenlogic.xyz")
  vi.stubEnv("ALCHEMY_KEY", "test-alchemy")
})

describe("tlFetch", () => {
  it("calls with bearer auth and returns JSON", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: [{ x: 1 }] }),
    })
    vi.stubGlobal("fetch", mockFetch)
    const { tlFetch } = await import("@/lib/tokenlogic/client")

    const r = await tlFetch("/v1/aave/markets/latest")
    expect(r).toEqual({ data: [{ x: 1 }] })
    const [url, opts] = mockFetch.mock.calls[0]
    expect(url).toBe("https://api.tokenlogic.xyz/v1/aave/markets/latest")
    expect((opts as RequestInit).headers).toMatchObject({ Authorization: "Bearer test-key" })
  })

  it("throws on 401", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 401, text: async () => "Unauthorized" }),
    )
    const { tlFetch } = await import("@/lib/tokenlogic/client")
    await expect(tlFetch("/x")).rejects.toThrow(/401/)
  })

  it("throws on 403", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 403, text: async () => "Forbidden" }),
    )
    const { tlFetch } = await import("@/lib/tokenlogic/client")
    await expect(tlFetch("/x")).rejects.toThrow(/403/)
  })
})
