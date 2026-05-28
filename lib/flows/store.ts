import { FLOW_WINDOW_DAYS, type Flow, type DiscoveredWallet } from "./types"

function dedupeKey(f: Flow): string {
  return `${f.chain}:${f.txHash}:${f.to.toLowerCase()}:${f.asset}`
}

/** Merge incoming classified flows into the existing ledger: drop anything
 *  older than the window, dedupe (incoming wins), newest first. */
export function mergeFlows(existing: Flow[], incoming: Flow[], nowUnix: number): Flow[] {
  const cutoff = nowUnix - FLOW_WINDOW_DAYS * 86_400
  const byKey = new Map<string, Flow>()
  for (const f of existing) {
    if (f.timestamp >= cutoff) byKey.set(dedupeKey(f), f)
  }
  for (const f of incoming) {
    if (f.timestamp >= cutoff) byKey.set(dedupeKey(f), f)
  }
  return [...byKey.values()].sort((a, b) => b.timestamp - a.timestamp)
}

/** Append high-confidence rebalance destinations (not already known/discovered)
 *  to the discovered-wallets list as quarantined. Idempotent. */
export function promoteWallets(
  existing: DiscoveredWallet[],
  flows: Flow[],
  knownWallets: Set<string>,
  _nowUnix: number,
): DiscoveredWallet[] {
  const have = new Set(existing.map((d) => `${d.chain}:${d.address.toLowerCase()}`))
  const out = [...existing]
  for (const f of flows) {
    if (f.classification !== "rebalance" || f.confidence !== "high") continue
    const norm = f.chain === "ethereum" ? f.to.toLowerCase() : f.to
    if (knownWallets.has(norm)) continue
    // XRPL addresses are case-sensitive; lowercasing here is safe only because
    // it is a within-run dedup guard and never the stored `address` value.
    const key = `${f.chain}:${f.to.toLowerCase()}`
    if (have.has(key)) continue
    have.add(key)
    out.push({ address: f.to, chain: f.chain, discoveredVia: f.txHash, firstSeen: f.timestamp, status: "quarantined" })
  }
  return out
}
