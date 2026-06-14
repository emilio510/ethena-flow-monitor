/**
 * Wallets whose holdings ARE Ethena's USDe backing — idle stablecoins plus
 * deployed Aave / Morpho positions all count toward the collateral stack.
 */
export const ETHENA_WALLETS = [
  "0xb8734a14fbd4aa2d44e6aa830405ffc861ba313c",
  "0xafbb1a7e9ddef38d9bc4a220e702b18dacaa2a62",
  "0x2d4d2a025b10c09bdbd794b4fce4f7ea8c7d7bb4",
  "0x2bf5d9a2326ad3c5ef8208f91af79c3ca1f0f67c",
  "0x6cd57b9a87c96421cfd7bc2b2f940c7e89cac4b5",
  "0xc7a455f687d1ed5d4d7edcc7563488c7e573d548",
  "0xe3490297a08d6fc8da46edb7b6142e4f461b62d3",
  "0xf270a1d7c68002da1ec8359f3958d4ec015729de",
  "0x1c3b25019ed4e4876e7af7903cc3e1e23287c337",
  "0x3feaa7483fcfba130e68b41369dd78ff30465459",
  // Holds $75M PYUSD on Ethereum (verified on-chain 2026-06-14). Not disclosed
  // in Ethena's API addressEntries — found on-chain; closes a PYUSD recon gap.
  "0xec8431fcae78a739ed9c026ab3ae16e4e58db7b5",
] as const

/**
 * The reserve fund — an insurance / solvency backstop. NOT part of USDe
 * backing: Ethena's reported backing total excludes it, so the dashboard
 * must too. Surfaced in its own table rather than the idle-backing total.
 */
export const RESERVE_FUND_WALLET = "0x2b5ab59163a6e93b4486f6055d33ca4a115dd4d5"

/** Every wallet we read on-chain — backing wallets plus the reserve fund.
 *  The idle reader scans this set, then buckets the reserve fund apart. */
export const MONITORED_WALLETS = [...ETHENA_WALLETS, RESERVE_FUND_WALLET] as const

/**
 * Human labels for addresses with a known on-chain identity, sourced from
 * Ethena's monthly custodian-attestation reports. Keyed by lowercased
 * address. Extend as future attestations disclose more — the April 2026
 * report named the MintRedeem contract; later reports are expected to
 * disclose additional addresses.
 */
export const KNOWN_WALLET_LABELS: Record<string, string> = {
  "0xe3490297a08d6fc8da46edb7b6142e4f461b62d3": "USDe MintRedeem contract",
}

const ETHENA_SET = new Set(ETHENA_WALLETS.map((a) => a.toLowerCase()))

/** True for the backing wallets — used to attribute lending positions. */
export function isEthenaWallet(addr: string): boolean {
  return ETHENA_SET.has(addr.toLowerCase())
}

/** True for the reserve-fund wallet. */
export function isReserveFundWallet(addr: string): boolean {
  return addr.toLowerCase() === RESERVE_FUND_WALLET.toLowerCase()
}
