import type { DestHoldings } from "./classify"
import type { FlowChain } from "./types"

const XRPL_RPC = "https://xrplcluster.com/"
const ALCHEMY_BASE = "https://eth-mainnet.g.alchemy.com/v2"
const TIMEOUT_MS = 15_000

/** Stable contracts we probe a destination for (lowercased) -> symbol. */
const STABLE_CONTRACTS: Record<string, string> = {
  "0x4c9edd5852cd905f086c759e8383e09bff1e68b3": "USDe",
  "0x9d39a5de30e57443bff2a8307a4256c8797a3497": "sUSDe",
  "0xc139190f447e929f090edeb554d95abb8b18ac1c": "USDtb",
  "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": "USDC",
  "0xdac17f958d2ee523a2206206994597c13d831ec7": "USDT",
}

/** Decode an XRPL currency code (3-char ASCII, or 40-char hex) to a symbol. */
function decodeXrplCurrency(code: string): string {
  if (code.length <= 3) return code
  const hex = code.replace(/0+$/, "")
  let out = ""
  for (let i = 0; i + 1 < hex.length; i += 2) {
    out += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16))
  }
  return out
}

interface XrplLine { currency: string; account: string; balance: string }

async function probeXrpl(address: string): Promise<DestHoldings> {
  const res = await fetch(XRPL_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ method: "account_lines", params: [{ account: address, ledger_index: "validated" }] }),
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`XRPL account_lines HTTP ${res.status}`)
  const json = (await res.json()) as {
    result?: { lines?: XrplLine[]; error?: string; error_message?: string }
  }
  const result = json.result
  // A node-level error (e.g. actNotFound) must throw, not masquerade as an
  // empty wallet — otherwise the orchestrator can't tell "no holdings" from
  // "lookup failed". Mirrors lib/onchain/xrpl.ts.
  if (!result || result.error) {
    throw new Error(
      `XRPL account_lines error: ${result?.error_message ?? result?.error ?? "no result"}`,
    )
  }
  const lines = result.lines ?? []
  return {
    chain: "xrpl",
    tokens: lines.map((l) => decodeXrplCurrency(l.currency)),
    trustLineCount: lines.length,
  }
}

interface AlchemyTokenBalance { contractAddress: string; tokenBalance: string | null }

async function probeEvm(address: string): Promise<DestHoldings> {
  const key = process.env.ALCHEMY_KEY
  if (!key) throw new Error("ALCHEMY_KEY is not set")
  const res = await fetch(`${ALCHEMY_BASE}/${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: 1, jsonrpc: "2.0", method: "alchemy_getTokenBalances",
      params: [address, Object.keys(STABLE_CONTRACTS)],
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`Alchemy getTokenBalances HTTP ${res.status}`)
  const json = (await res.json()) as { result?: { tokenBalances?: AlchemyTokenBalance[] }; error?: { message?: string } }
  if (json.error) throw new Error(`Alchemy error: ${json.error.message}`)
  const balances = json.result?.tokenBalances ?? []
  const tokens = balances
    .filter((b) => b.tokenBalance && BigInt(b.tokenBalance) > 0n)
    .map((b) => STABLE_CONTRACTS[b.contractAddress.toLowerCase()])
    .filter((s): s is string => Boolean(s))
  return { chain: "ethereum", tokens }
}

/** Fetch the holdings of a destination address for new-address judgment. */
export async function probeDestination(chain: FlowChain, address: string): Promise<DestHoldings> {
  return chain === "xrpl" ? probeXrpl(address) : probeEvm(address)
}
