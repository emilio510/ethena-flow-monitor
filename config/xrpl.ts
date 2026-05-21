/** RLUSD issuer on the XRP Ledger — Ripple's official RLUSD issuing account. */
export const RLUSD_ISSUER = "rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De"

/**
 * RLUSD's currency code on XRPL. Codes longer than 3 chars are hex-encoded
 * (RLUSD → "RLUSD" as ASCII hex, right-padded to 40 chars).
 */
export const RLUSD_CURRENCY_HEX = "524C555344000000000000000000000000000000"

/**
 * Ethena's RLUSD-holding wallets on the XRP Ledger.
 *
 * Both were trust-lined for RLUSD on 2026-05-20 and together hold ~$300M,
 * matching Ethena's reported RLUSD backing to within $1k. Each holds RLUSD
 * as its only trust line. Not disclosed in Ethena's API addressEntries —
 * identified by balance, single-trustline purity, and acquisition timing.
 */
export const ETHENA_XRPL_WALLETS = [
  "r4vFWRRZBXsWipgCLJBs6EqnMh7MRHbhyp",
  "rp1edBgyjbAsjXXHrhGtGUK2v6D6XhMTwc",
] as const
