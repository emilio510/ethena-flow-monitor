import "server-only"
import { erc20Abi, parseAbi, type Address } from "viem"
import { getPublicClient } from "./clients"
import { RESERVE_FUND_WALLET } from "@/config/wallets"
import { RESERVE_FUND_LPS } from "@/config/reserve-fund"
import type { IdleBalanceRow } from "./balances"

const curveAbi = parseAbi(["function get_virtual_price() view returns (uint256)"])

/**
 * Value the reserve fund's Curve LP positions.
 *
 * For a Curve stableswap pool, LP USD ≈ balance × get_virtual_price(), both
 * 1e18-scaled — virtual_price is the pooled value per LP, which is ~$1 for a
 * dollar-pegged pool plus accrued fees. Accurate to within any USDtb/USDC
 * depeg, which is negligible.
 *
 * Returns one IdleBalanceRow per LP so the reserve-fund table can render
 * them alongside the stablecoin balances.
 */
export async function getReserveFundLpRows(): Promise<IdleBalanceRow[]> {
  const wallet = RESERVE_FUND_WALLET as Address
  return Promise.all(
    RESERVE_FUND_LPS.map(async (lp): Promise<IdleBalanceRow> => {
      const client = getPublicClient(lp.chain)
      const [balance, virtualPrice] = await Promise.all([
        client.readContract({
          address: lp.pool,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [wallet],
        }),
        client.readContract({
          address: lp.pool,
          abi: curveAbi,
          functionName: "get_virtual_price",
        }),
      ])
      const totalUsd = (Number(balance) / 1e18) * (Number(virtualPrice) / 1e18)
      return { symbol: lp.label, totalUsd, isErc4626: false }
    }),
  )
}
