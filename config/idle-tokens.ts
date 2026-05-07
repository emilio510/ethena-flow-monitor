import type { Chain } from "./markets"

/** A backing-relevant token we want to query idle balances for.
 *  Addresses are hand-curated per-chain — we validate `symbol()` at fetch time
 *  so a wrong address gets logged rather than silently inflating numbers. */
export interface IdleToken {
  symbol: string
  address: `0x${string}`
  decimals: number
  /** ERC4626 vaults (sUSDe, sUSDtb) accrue value over time — we call
   *  `convertToAssets(balance)` to get the underlying-asset equivalent and
   *  use that as the USD value (close enough since underlying is dollar-pegged). */
  isErc4626?: boolean
}

/** Stablecoins + Ethena collateral assets we treat as "backing".
 *  Excludes airdrops, governance tokens, and obvious dust. Excludes PT-* —
 *  those are deployed positions by definition.
 *
 *  Values are 1:1 USD for non-vault stables; sUSDe/sUSDtb get unwrapped via
 *  convertToAssets so their ~5% accrued yield is captured. */
export const IDLE_TOKENS: Record<Chain, IdleToken[]> = {
  ethereum: [
    { symbol: "USDe",   address: "0x4c9EDD5852cd905f086C759E8383e09bff1E68B3", decimals: 18 },
    { symbol: "sUSDe",  address: "0x9D39A5DE30e57443BfF2A8307A4256c8797A3497", decimals: 18, isErc4626: true },
    { symbol: "USDtb",  address: "0xC139190F447e929f090Edeb554D95AbB8b18aC1C", decimals: 18 },
    { symbol: "USDC",   address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", decimals: 6  },
    { symbol: "USDT",   address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", decimals: 6  },
    { symbol: "PYUSD",  address: "0x6c3ea9036406852006290770BEdFcAbA0e23A0e8", decimals: 6  },
    { symbol: "USDS",   address: "0xdC035D45d973E3EC169d2276DDab16f1e407384F", decimals: 18 },
  ],
  base: [
    { symbol: "USDC",   address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", decimals: 6  },
    { symbol: "USDe",   address: "0x5d3a1ff2b6bab83b63cd9ad0787074081a52ef34", decimals: 18 },
  ],
  // Mantle/Plasma/MegaETH idle balances were probed against the 11 wallets
  // and returned ~$0 for the addresses we trust. The Debank screenshot's
  // $81M USDm sits on a chain we can't yet pin down — track this as known
  // under-coverage and re-enable once we have a verified address.
  mantle: [],
  plasma: [],
  megaeth: [],
}

/** Chains we actively query for idle balances. Empty entries above are skipped. */
export const IDLE_CHAINS = (Object.entries(IDLE_TOKENS) as [Chain, IdleToken[]][])
  .filter(([, tokens]) => tokens.length > 0)
  .map(([chain]) => chain)
