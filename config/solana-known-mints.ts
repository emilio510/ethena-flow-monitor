/**
 * Tiny domain-knowledge overrides for Solana mint classification.
 * Only two categories need explicit listing — everything else is auto-discovered.
 *
 * SOLANA_DEPLOYED_MINTS: Vault-share / receipt tokens whose underlying position
 *   is already counted by a footprint row. Counted in wallet inventory only —
 *   never in idle rows or reconciliation (would double-count the position).
 *   Priced via Jupiter because Alchemy Prices cannot price these Solana-native
 *   vault shares.
 *
 * SOLANA_PEG_MINTS: Well-known stablecoins valued at a hard $1 peg.
 *   More robust than a live symbol lookup for assets we know are pegged.
 *
 * SOLANA_DENY_MINTS: Confirmed spam / dust mints to skip outright.
 *   The post-pricing $1 dust floor also catches most spam, but an explicit
 *   deny list handles mints we want to skip even before DAS identification.
 */

export const SOLANA_DEPLOYED_MINTS: Record<string, { symbol: string; price: { kind: "jupiter" } }> =
  {
    /** Jupiter Lend jleUSDG vault share (C23FGx omnibus). The USDG position is
     *  already counted by buildJupiterRow, so this stays out of idle/recon. */
    Bd2wJsmaF3YKC6fKLo4AFQDYaFEzWR6SNvoxvTnA6dXc: {
      symbol: "jleUSDG",
      price: { kind: "jupiter" },
    },
  }

/** Mints valued at a hard $1 USD peg. Keyed by mint address, value is the symbol. */
export const SOLANA_PEG_MINTS: Record<string, string> = {
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: "USDC",
  // Add USDG / PYUSD / USDe Solana mints here as confirmed
}

/** Mints to skip outright. Value is the reason string for documentation. */
export const SOLANA_DENY_MINTS: Record<string, string> = {
  "2u1tszSeqZ3qBWF3uNGPFc8TzMk2tdiwknnRMWGWjGWH":
    "sub-dollar dust stable held by both wallets — below the $1 dust floor",
}

/**
 * RWA tokens we AUTO-VALUE: symbol (UPPER) -> the ONE canonical mint allowed to
 * claim it. A token whose DAS symbol matches a key but whose mint != the value
 * is rejected as spoofed and pushed to failures (source: `spoof:<sym>`).
 * A symbol NOT in this map is a genuinely-new asset and is NOT auto-valued —
 * it routes to failures (source: `untracked:<sym>`) for human confirmation.
 */
export const SOLANA_RWA_MINTS: Record<string, string> = {
  STAC: "u49MwZqu4bHRHRsciaBarHK7JZDYGxuaNnwyMBdEKYk",
  JAAA: "AAAJXeGjpKu7W3X4QTSU4pm1Wbj4G2LPcdg7A6xJLLyG",
}
