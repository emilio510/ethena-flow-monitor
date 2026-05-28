import { describe, it, expect, vi, beforeEach } from "vitest"
import { RLUSD_CURRENCY_HEX, RLUSD_ISSUER } from "@/config/xrpl"

beforeEach(() => {
  vi.resetModules()
  vi.unstubAllGlobals()
})

/** Mock an XRPL account_lines response keyed by the queried account. */
function stubXrpl(linesByAccount: Record<string, unknown[]>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: { body?: string }) => {
      const body = JSON.parse(init?.body ?? "{}")
      const account = body.params?.[0]?.account as string
      return {
        ok: true,
        status: 200,
        json: async () => ({ result: { lines: linesByAccount[account] ?? [] } }),
      }
    }),
  )
}

describe("getEthenaRlusdHoldings", () => {
  it("sums RLUSD trust-line balances across the XRPL wallets", async () => {
    const { ETHENA_XRPL_WALLETS } = await import("@/config/xrpl")
    stubXrpl({
      [ETHENA_XRPL_WALLETS[0]]: [
        { currency: RLUSD_CURRENCY_HEX, account: RLUSD_ISSUER, balance: "159999000" },
      ],
      [ETHENA_XRPL_WALLETS[1]]: [
        { currency: RLUSD_CURRENCY_HEX, account: RLUSD_ISSUER, balance: "140000000" },
      ],
    })
    const { getEthenaRlusdHoldings } = await import("@/lib/onchain/xrpl")
    const r = await getEthenaRlusdHoldings()
    expect(r.totalUsd).toBe(299_999_000)
    expect(r.wallets).toHaveLength(4)
  })

  it("ignores trust lines from other issuers or currencies", async () => {
    const { ETHENA_XRPL_WALLETS } = await import("@/config/xrpl")
    stubXrpl({
      [ETHENA_XRPL_WALLETS[0]]: [
        { currency: RLUSD_CURRENCY_HEX, account: RLUSD_ISSUER, balance: "100000000" },
        // wrong issuer — a look-alike RLUSD must not count
        { currency: RLUSD_CURRENCY_HEX, account: "rSomeoneElse", balance: "999999999" },
        // a different token entirely
        { currency: "USD", account: RLUSD_ISSUER, balance: "5000000" },
      ],
      [ETHENA_XRPL_WALLETS[1]]: [],
    })
    const { getEthenaRlusdHoldings } = await import("@/lib/onchain/xrpl")
    const r = await getEthenaRlusdHoldings()
    expect(r.totalUsd).toBe(100_000_000)
  })

  it("throws when the XRPL node returns an error", async () => {
    const { ETHENA_XRPL_WALLETS } = await import("@/config/xrpl")
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ result: { error: "actNotFound", error_message: "Account not found." } }),
      }),
    )
    void ETHENA_XRPL_WALLETS
    const { getEthenaRlusdHoldings } = await import("@/lib/onchain/xrpl")
    await expect(getEthenaRlusdHoldings()).rejects.toThrow(/actNotFound|Account not found/)
  })
})
