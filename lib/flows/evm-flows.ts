import { FLOW_MIN_USD, type RawFlow } from "./types"

const ALCHEMY_BASE = "https://eth-mainnet.g.alchemy.com/v2"
const TIMEOUT_MS = 20_000
/** Safety cap on pagination — 25 pages × 1000 transfers is far beyond a
 *  90-day window of stable outflows for these wallets. */
const MAX_PAGES = 25

/** Ethena-family stable contracts (lowercased) -> symbol. */
const STABLE_CONTRACTS: Record<string, string> = {
  "0x4c9edd5852cd905f086c759e8383e09bff1e68b3": "USDe",
  "0x9d39a5de30e57443bff2a8307a4256c8797a3497": "sUSDe",
  "0xc139190f447e929f090edeb554d95abb8b18ac1c": "USDtb",
  "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": "USDC",
  "0xdac17f958d2ee523a2206206994597c13d831ec7": "USDT",
}

interface EvmTransfer {
  hash: string
  from: string
  to: string | null
  value: number | null
  asset: string | null
  rawContract: { address: string }
  metadata: { blockTimestamp: string }
}

async function getAssetTransfersPage(
  fromAddress: string,
  pageKey: string | undefined,
): Promise<{ transfers: EvmTransfer[]; pageKey: string | undefined }> {
  const key = process.env.ALCHEMY_KEY
  if (!key) throw new Error("ALCHEMY_KEY is not set")
  const params: Record<string, unknown> = {
    fromBlock: "0x0",
    toBlock: "latest",
    fromAddress,
    contractAddresses: Object.keys(STABLE_CONTRACTS),
    category: ["erc20"],
    withMetadata: true,
    excludeZeroValue: true,
    maxCount: "0x3e8",
    order: "desc",
  }
  if (pageKey !== undefined) params.pageKey = pageKey
  const res = await fetch(`${ALCHEMY_BASE}/${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: 1, jsonrpc: "2.0", method: "alchemy_getAssetTransfers", params: [params] }),
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`Alchemy getAssetTransfers HTTP ${res.status}`)
  const json = (await res.json()) as {
    result?: { transfers?: EvmTransfer[]; pageKey?: string }
    error?: { message?: string }
  }
  if (json.error) throw new Error(`Alchemy error: ${json.error.message}`)
  return { transfers: json.result?.transfers ?? [], pageKey: json.result?.pageKey }
}

function toUnix(iso: string): number {
  return Math.floor(new Date(iso).getTime() / 1000)
}

/** Scan outgoing Ethena-stable ERC20 transfers ≥ $1M from each EVM wallet,
 *  paginating newest-first and stopping once a page predates the window. */
export async function scanEvmFlows(wallets: string[], sinceUnix: number): Promise<RawFlow[]> {
  const flows: RawFlow[] = []
  for (const wallet of wallets) {
    let pageKey: string | undefined = undefined
    for (let page = 0; page < MAX_PAGES; page++) {
      const { transfers, pageKey: next } = await getAssetTransfersPage(wallet, pageKey)
      for (const t of transfers) {
        const timestamp = toUnix(t.metadata.blockTimestamp)
        if (Number.isNaN(timestamp) || timestamp < sinceUnix) continue
        // Drop transfers with no decoded USD value outright — never coerce a
        // missing amount to 0 and let it slip through a threshold check.
        if (t.value === null || !(t.value >= FLOW_MIN_USD)) continue
        const amountUsd = t.value
        const symbol = STABLE_CONTRACTS[t.rawContract.address.toLowerCase()] ?? t.asset ?? "?"
        flows.push({
          chain: "ethereum",
          txHash: t.hash,
          timestamp,
          from: wallet.toLowerCase(),
          to: (t.to ?? "").toLowerCase(),
          asset: symbol,
          amountUsd,
        })
      }
      // order: "desc" guarantees the last element of the page is the oldest.
      const oldest = transfers[transfers.length - 1]
      const oldestTs = oldest ? toUnix(oldest.metadata.blockTimestamp) : 0
      if (!next || transfers.length === 0 || oldestTs < sinceUnix) break
      pageKey = next
    }
  }
  return flows
}
