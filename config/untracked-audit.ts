/**
 * Configuration for the EVM untracked-holdings audit.
 *
 * These constants are kept in config (not in lib/) so they can be adjusted
 * without touching the algorithm.
 */

/** Alert when an untracked position is valued at or above this threshold. */
export const UNTRACKED_ALERT_USD = 1_000_000

/**
 * Token contract addresses to always skip, regardless of value.
 * Extend as known spam / protocol-internal addresses accumulate.
 * All entries MUST be lowercase.
 */
export const UNTRACKED_DENY = new Set<string>([
  // Add known spam / non-standard ERC-20 contracts here (lowercase).
])

/**
 * Known stablecoin underlying assets used to identify ERC-4626 vaults that
 * can be valued 1:1 USD via convertToAssets.
 * All entries are lowercase.
 */
export const KNOWN_STABLE_UNDERLYINGS = new Set<string>([
  "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", // USDC (mainnet)
  "0xdac17f958d2ee523a2206206994597c13d831ec7", // USDT (mainnet)
  "0x4c9edd5852cd905f086c759e8383e09bff1e68b3", // USDe (mainnet)
  "0xc139190f447e929f090edeb554d95abb8b18ac1c", // USDtb (mainnet)
  "0x6b175474e89094c44da98b954eedeac495271d0f", // DAI (mainnet)
  "0xdc035d45d973e3ec169d2276ddab16f1e407384f", // USDS (mainnet)
  "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", // USDC (Base)
])
