import { RLUSD_CURRENCY_HEX, RLUSD_ISSUER } from "@/config/xrpl"
import { FLOW_MIN_USD, RIPPLE_EPOCH_OFFSET, type RawFlow } from "./types"

const XRPL_RPC = "https://xrplcluster.com/"
const TIMEOUT_MS = 15_000
const PAGE_LIMIT = 200
/** Safety cap so a pathological account can't loop forever. 25 pages × 200 =
 *  5000 txs, far beyond a 90-day window for these wallets. */
const MAX_PAGES = 25

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

async function accountTxPage(
  account: string,
  marker: unknown,
): Promise<{ items: XrplTxItem[]; marker: unknown }> {
  const params: Record<string, unknown> = {
    account,
    ledger_index_min: -1,
    ledger_index_max: -1,
    limit: PAGE_LIMIT,
    forward: false,
  }
  if (marker !== undefined) params.marker = marker
  const res = await fetch(XRPL_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ method: "account_tx", params: [params] }),
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`XRPL account_tx HTTP ${res.status}`)
  const json = (await res.json()) as {
    result?: { transactions?: XrplTxItem[]; marker?: unknown; error?: string; error_message?: string }
  }
  const result = json.result
  if (!result || result.error) {
    throw new Error(`XRPL account_tx error: ${result?.error_message ?? result?.error ?? "no result"}`)
  }
  return { items: result.transactions ?? [], marker: result.marker }
}

/** Fetch all account_tx items within the window, paginating newest-first and
 *  stopping once a page's oldest tx predates `sinceUnix`. */
async function accountTx(account: string, sinceUnix: number): Promise<XrplTxItem[]> {
  const all: XrplTxItem[] = []
  let marker: unknown = undefined
  for (let page = 0; page < MAX_PAGES; page++) {
    const { items, marker: next } = await accountTxPage(account, marker)
    all.push(...items)
    // Newest-first: if the last (oldest) item on this page is before the
    // window, every further page is older too — stop.
    const oldest = items[items.length - 1]
    const oldestTx = oldest?.tx_json ?? oldest?.tx
    const oldestTs = (oldestTx?.date ?? 0) + RIPPLE_EPOCH_OFFSET
    if (!next || items.length === 0 || oldestTs < sinceUnix) break
    marker = next
  }
  return all
}

/** Scan outgoing RLUSD payments ≥ $1M from each XRPL wallet, since `sinceUnix`. */
export async function scanXrplFlows(wallets: string[], sinceUnix: number): Promise<RawFlow[]> {
  const flows: RawFlow[] = []
  for (const wallet of wallets) {
    const items = await accountTx(wallet, sinceUnix)
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
