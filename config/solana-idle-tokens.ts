/**
 * How to value an allowlisted Solana mint.
 *  - peg: hard $1 (stablecoins).
 *  - proxyPrice: price via a reference EVM contract through the Alchemy Prices
 *    API. For tokens with no Solana price but a market price on another chain
 *    (JAAA: same fund on Base + Solana, priced on Base). `approx` footnotes it.
 *  - jupiter: live Solana DEX price via the Jupiter price API (the only source
 *    that prices the jleUSDG vault share; Alchemy cannot).
 */
export type SolanaPricing =
  | { kind: "peg" }
  | { kind: "proxyPrice"; network: string; address: string; approx?: boolean }
  | { kind: "jupiter" }

/**
 * Accounting bucket:
 *  - "idle": base backing asset held directly. Counts in idle rows →
 *    reconciliation + idle total + wallet inventory total.
 *  - "deployed": vault-share / receipt token whose underlying position is
 *    ALREADY counted by a footprint row. Counts ONLY in the wallet inventory
 *    total — never in idle / reconciliation (or it double-counts).
 */
export type SolanaBucket = "idle" | "deployed"

export interface SolanaIdleToken {
  symbol: string
  mint: string
  decimals: number
  pricing: SolanaPricing
  bucket: SolanaBucket
}

/**
 * Allowlist of mints we value when held at SOLANA_WALLETS, keyed by mint.
 * Mints NOT listed here are ignored (that is how dust is dropped).
 *
 * Additional idle stable mints (USDG / PYUSD / USDe on Solana) can be added
 * with their verified mint + { kind: "peg" } + bucket "idle" when Ethena parks
 * idle stables here; today the only non-dust idle holding is JAAA, and the only
 * deployed holding is the jleUSDG vault share.
 */
export const SOLANA_IDLE_TOKENS: Record<string, SolanaIdleToken> = {
  AAAJXeGjpKu7W3X4QTSU4pm1Wbj4G2LPcdg7A6xJLLyG: {
    symbol: "JAAA",
    mint: "AAAJXeGjpKu7W3X4QTSU4pm1Wbj4G2LPcdg7A6xJLLyG",
    decimals: 6,
    pricing: {
      kind: "proxyPrice",
      network: "base-mainnet",
      address: "0x5a0f93d040de44e78f251b03c43be9cf317dcf64",
      approx: true,
    },
    bucket: "idle",
  },
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: {
    symbol: "USDC",
    mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    decimals: 6,
    pricing: { kind: "peg" },
    bucket: "idle",
  },
  // The Jupiter Lend (jleUSDG) receipt the C23FGx omnibus holds. Its USDG
  // position is already counted by buildJupiterRow, so it is DEPLOYED-bucket:
  // shown in the wallet's on-chain inventory total but kept out of idle/recon.
  Bd2wJsmaF3YKC6fKLo4AFQDYaFEzWR6SNvoxvTnA6dXc: {
    symbol: "jleUSDG",
    mint: "Bd2wJsmaF3YKC6fKLo4AFQDYaFEzWR6SNvoxvTnA6dXc",
    decimals: 6,
    pricing: { kind: "jupiter" },
    bucket: "deployed",
  },
}

/**
 * Mints deliberately kept OUT of the allowlist, with the reason. Defensive
 * documentation — the allowlist already excludes anything not listed above.
 */
export const EXCLUDED_MINTS: Record<string, string> = {
  "2u1tszSeqZ3qBWF3uNGPFc8TzMk2tdiwknnRMWGWjGWH":
    "sub-dollar dust stable held by both wallets — below the $1 dust floor",
}
