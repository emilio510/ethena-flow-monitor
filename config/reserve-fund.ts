import type { Chain } from "./markets"

/**
 * Non-stablecoin positions the reserve fund holds that the curated
 * idle-token scan can't value 1:1. Currently a single Curve LP.
 */
export interface ReserveFundLp {
  /** Display label, e.g. "USDtb/USDC Curve LP". */
  label: string
  chain: Chain
  /** Curve stableswap-ng pool. For these pools the LP token IS the pool
   *  contract, so balanceOf + get_virtual_price both hit this address. */
  pool: `0x${string}`
}

export const RESERVE_FUND_LPS: readonly ReserveFundLp[] = [
  {
    label: "USDtb/USDC Curve LP",
    chain: "ethereum",
    pool: "0xc2921134073151490193ac7369313c8e0b08e1e7",
  },
]

/** Reserve-fund rows below this USD size are dust (airdrops, dust transfers)
 *  and hidden — the fund's real positions are tens of millions. */
export const RESERVE_FUND_MIN_USD = 100_000
