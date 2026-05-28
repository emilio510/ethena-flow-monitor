import { describe, it, expect, vi, beforeEach } from "vitest"
import { RLUSD_CURRENCY_HEX, RLUSD_ISSUER } from "@/config/xrpl"
import { RIPPLE_EPOCH_OFFSET } from "@/lib/flows/types"

beforeEach(() => {
  vi.resetModules()
  vi.unstubAllGlobals()
})

/** Build one account_tx item in the xrplcluster shape (tx + hash + meta). */
function payment(opts: { from: string; to: string; value: string; rippleDate: number; hash: string; result?: string }) {
  return {
    tx: {
      TransactionType: "Payment",
      Account: opts.from,
      Destination: opts.to,
      Amount: { currency: RLUSD_CURRENCY_HEX, issuer: RLUSD_ISSUER, value: opts.value },
      date: opts.rippleDate,
    },
    hash: opts.hash,
    meta: { TransactionResult: opts.result ?? "tesSUCCESS" },
  }
}

function stubAccountTx(byAccount: Record<string, unknown[]>) {
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: { body?: string }) => {
    const body = JSON.parse(init?.body ?? "{}")
    const account = body.params?.[0]?.account as string
    return { ok: true, status: 200, json: async () => ({ result: { transactions: byAccount[account] ?? [] } }) }
  }))
}

const WALLET = "rWALLET1"
// 2026-05-26 13:24 UTC in unix = 1779801840; ripple date = unix - offset.
const RECENT_RIPPLE = 1779801840 - RIPPLE_EPOCH_OFFSET
const since = 1779801840 - 7 * 86_400 // window start a week earlier

describe("scanXrplFlows", () => {
  it("returns ≥$1M outgoing RLUSD payments with converted timestamps", async () => {
    stubAccountTx({ [WALLET]: [payment({ from: WALLET, to: "rDEST", value: "70000000", rippleDate: RECENT_RIPPLE, hash: "H1" })] })
    const { scanXrplFlows } = await import("@/lib/flows/xrpl-flows")
    const flows = await scanXrplFlows([WALLET], since)
    expect(flows).toHaveLength(1)
    expect(flows[0]).toMatchObject({ chain: "xrpl", from: WALLET, to: "rDEST", asset: "RLUSD", amountUsd: 70_000_000, txHash: "H1" })
    expect(flows[0].timestamp).toBe(RECENT_RIPPLE + RIPPLE_EPOCH_OFFSET)
  })
  it("drops sub-$1M payments", async () => {
    stubAccountTx({ [WALLET]: [payment({ from: WALLET, to: "rDEST", value: "999999", rippleDate: RECENT_RIPPLE, hash: "H2" })] })
    const { scanXrplFlows } = await import("@/lib/flows/xrpl-flows")
    expect(await scanXrplFlows([WALLET], since)).toHaveLength(0)
  })
  it("drops incoming payments (wallet is the Destination, not Account)", async () => {
    stubAccountTx({ [WALLET]: [payment({ from: "rOTHER", to: WALLET, value: "5000000", rippleDate: RECENT_RIPPLE, hash: "H3" })] })
    const { scanXrplFlows } = await import("@/lib/flows/xrpl-flows")
    expect(await scanXrplFlows([WALLET], since)).toHaveLength(0)
  })
  it("drops payments older than the window", async () => {
    const oldRipple = since - 86_400 - RIPPLE_EPOCH_OFFSET
    stubAccountTx({ [WALLET]: [payment({ from: WALLET, to: "rDEST", value: "5000000", rippleDate: oldRipple, hash: "H4" })] })
    const { scanXrplFlows } = await import("@/lib/flows/xrpl-flows")
    expect(await scanXrplFlows([WALLET], since)).toHaveLength(0)
  })
  it("ignores non-Payment txs and failed txs", async () => {
    stubAccountTx({ [WALLET]: [
      { tx: { TransactionType: "TrustSet", Account: WALLET, date: RECENT_RIPPLE }, hash: "H5", meta: { TransactionResult: "tesSUCCESS" } },
      payment({ from: WALLET, to: "rDEST", value: "5000000", rippleDate: RECENT_RIPPLE, hash: "H6", result: "tecPATH_DRY" }),
    ] })
    const { scanXrplFlows } = await import("@/lib/flows/xrpl-flows")
    expect(await scanXrplFlows([WALLET], since)).toHaveLength(0)
  })

  it("follows the marker across pages until the window boundary", async () => {
    let call = 0
    vi.stubGlobal("fetch", vi.fn(async () => {
      call++
      if (call === 1) {
        return { ok: true, status: 200, json: async () => ({ result: {
          transactions: [payment({ from: WALLET, to: "rDEST", value: "5000000", rippleDate: RECENT_RIPPLE, hash: "P1" })],
          marker: { ledger: 1, seq: 1 },
        } }) }
      }
      // second page: an in-window large payment, then no marker → stop
      return { ok: true, status: 200, json: async () => ({ result: {
        transactions: [payment({ from: WALLET, to: "rDEST", value: "9000000", rippleDate: RECENT_RIPPLE, hash: "P2" })],
      } }) }
    }))
    const { scanXrplFlows } = await import("@/lib/flows/xrpl-flows")
    const flows = await scanXrplFlows([WALLET], since)
    expect(call).toBe(2)
    expect(flows.map((f) => f.txHash).sort()).toEqual(["P1", "P2"])
  })

  it("throws on an account_tx node error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true, status: 200,
      json: async () => ({ result: { error: "actNotFound", error_message: "Account not found." } }),
    })))
    const { scanXrplFlows } = await import("@/lib/flows/xrpl-flows")
    await expect(scanXrplFlows([WALLET], since)).rejects.toThrow(/actNotFound|Account not found/)
  })

  it("parses the tx_json item shape identically to tx", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true, status: 200,
      json: async () => ({ result: { transactions: [{
        tx_json: { TransactionType: "Payment", Account: WALLET, Destination: "rDEST",
          Amount: { currency: RLUSD_CURRENCY_HEX, issuer: RLUSD_ISSUER, value: "8000000" }, date: RECENT_RIPPLE },
        hash: "JV1", meta: { TransactionResult: "tesSUCCESS" },
      }] } }),
    })))
    const { scanXrplFlows } = await import("@/lib/flows/xrpl-flows")
    const flows = await scanXrplFlows([WALLET], since)
    expect(flows).toHaveLength(1)
    expect(flows[0]).toMatchObject({ txHash: "JV1", amountUsd: 8_000_000 })
  })
})
