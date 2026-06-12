/**
 * Ethena's Solana addresses whose holdings are USDe backing. Base58 strings —
 * case-sensitive, NEVER lowercased (unlike EVM addresses).
 */
export const SOLANA_WALLETS = [
  "C23FGxQB2LsoTbZsQr5w3R7b3sw5saxPLGJ4ujvyH34L",
  "4FaQc6QZ5skFjcDF64mKcXRhtCCsnArZcr1xumPNrbtN",
] as const

/** Human labels keyed by exact base58 address (sourced from Ethena's snapshot). */
export const KNOWN_SOLANA_WALLET_LABELS: Record<string, string> = {
  "C23FGxQB2LsoTbZsQr5w3R7b3sw5saxPLGJ4ujvyH34L": "Solana DeFi omnibus (Sentora/Bitwise)",
  "4FaQc6QZ5skFjcDF64mKcXRhtCCsnArZcr1xumPNrbtN": "RWA — JAAA (Janus Henderson CLO)",
}

const SOLANA_SET = new Set<string>(SOLANA_WALLETS)

/** True for a tracked Solana wallet. Case-sensitive by design. */
export function isSolanaWallet(addr: string): boolean {
  return SOLANA_SET.has(addr)
}
