import { RLUSD_CURRENCY_HEX, RLUSD_ISSUER } from "@/config/xrpl"
import { FLOW_MIN_USD, RIPPLE_EPOCH_OFFSET, type RawFlow } from "./types"

const XRPL_RPC = "https://xrplcluster.com/"
const TIMEOUT_MS = 15_000
const PAGE_LIMIT = 200

interface XrplIssuedAmount { currency: string; issuer: string; value: string }
interface XrplPaymentTx {
  TransactionType?: string
  Account?: string
  Destination?: string
  Amount?: XrplIssuedAmount | string
  date?: number
  hash?: string
}
interface XrplTxItem {
  tx?: XrplPaymentTx
  tx_json?: XrplPaymentTx
  hash?: string
  meta?: { TransactionResult?: string }
}

async function accountTx(account: string): Promise<XrplTxItem[]> {
  const res = await fetch(XRPL_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      method: "account_tx",
      params: [{ account, ledger_index_min: -1, ledger_index_max: -1, limit: PAGE_LIMIT, forward: false }],
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`XRPL account_tx HTTP ${res.status}`)
  const json = (await res.json()) as {
    result?: { transactions?: XrplTxItem[]; error?: string; error_message?: string }
  }
  const result = json.result
  if (!result || result.error) {
    throw new Error(`XRPL account_tx error: ${result?.error_message ?? result?.error ?? "no result"}`)
  }
  return result.transactions ?? []
}

/** Scan outgoing RLUSD payments ≥ $1M from each XRPL wallet, since `sinceUnix`. */
export async function scanXrplFlows(wallets: string[], sinceUnix: number): Promise<RawFlow[]> {
  const flows: RawFlow[] = []
  for (const wallet of wallets) {
    const items = await accountTx(wallet)
    for (const item of items) {
      const tx = item.tx_json ?? item.tx
      if (!tx || tx.TransactionType !== "Payment") continue
      if (tx.Account !== wallet) continue // outflow only
      const amt = tx.Amount
      if (typeof amt !== "object" || amt === null) continue // XRP drops, not RLUSD
      if (amt.currency.toUpperCase() !== RLUSD_CURRENCY_HEX || amt.issuer !== RLUSD_ISSUER) continue
      const result = item.meta?.TransactionResult
      if (result && result !== "tesSUCCESS") continue
      const timestamp = (tx.date ?? 0) + RIPPLE_EPOCH_OFFSET
      if (timestamp < sinceUnix) continue
      const amountUsd = Number(amt.value)
      if (!(amountUsd >= FLOW_MIN_USD)) continue
      flows.push({
        chain: "xrpl",
        txHash: item.hash ?? tx.hash ?? "",
        timestamp,
        from: wallet,
        to: tx.Destination ?? "",
        asset: "RLUSD",
        amountUsd,
      })
    }
  }
  return flows
}
