import { describe, it, expect, vi, beforeEach } from "vitest"

beforeEach(() => {
  vi.resetModules()
  vi.unstubAllGlobals()
})

describe("ethenaFetch", () => {
  it("hits the public Ethena base URL and returns JSON", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ strategies: [], timestamp: 1 }),
    })
    vi.stubGlobal("fetch", mockFetch)
    const { ethenaFetch } = await import("@/lib/ethena/client")

    const r = await ethenaFetch("/positions/current/backing-assets")
    expect(r).toEqual({ strategies: [], timestamp: 1 })
    const [url, opts] = mockFetch.mock.calls[0]
    expect(url).toBe("https://app.ethena.fi/api/positions/current/backing-assets")
    expect((opts as RequestInit).cache).toBe("no-store")
  })

  it("does NOT send an Authorization header (endpoint is public)", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    })
    vi.stubGlobal("fetch", mockFetch)
    const { ethenaFetch } = await import("@/lib/ethena/client")

    await ethenaFetch("/anything")
    const [, opts] = mockFetch.mock.calls[0]
    const headers = (opts as RequestInit).headers as Record<string, string> | undefined
    if (headers) {
      expect(headers["Authorization"]).toBeUndefined()
      expect(headers["authorization"]).toBeUndefined()
    }
  })

  it("throws EthenaApiError on 5xx", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 503, text: async () => "down" }),
    )
    const { ethenaFetch, EthenaApiError } = await import("@/lib/ethena/client")
    await expect(ethenaFetch("/x")).rejects.toBeInstanceOf(EthenaApiError)
  })

  it("throws EthenaTimeoutError on AbortSignal timeout", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new DOMException("timed out", "TimeoutError")),
    )
    const { ethenaFetch, EthenaTimeoutError } = await import("@/lib/ethena/client")
    await expect(ethenaFetch("/x")).rejects.toBeInstanceOf(EthenaTimeoutError)
  })
})
