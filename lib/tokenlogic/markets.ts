import { z } from "zod"
import { tlFetch } from "./client"

// TokenLogic recently started returning some numeric fields as strings
// (e.g. deposits: "7117.726384..."). Accept number / numeric string / null,
// always coerce to number; treat null and "" as 0.
const numericLike = z
  .union([z.number(), z.string(), z.null()])
  .transform((v) => {
    if (v === null || v === "") return 0
    const n = typeof v === "number" ? v : Number(v)
    if (!Number.isFinite(n)) {
      throw new Error(`markets: invalid numeric value: ${JSON.stringify(v)}`)
    }
    return n
  })

const MarketReserveRow = z.object({
  protocol: z.string(),
  market_key: z.string(),
  reserve_address: z.string(),
  reserve_symbol: z.string(),
  deposits: numericLike,
  borrows: numericLike,
  available_liquidity: numericLike,
  borrow_capacity: numericLike,
  utilization: numericLike,
  borrow_apy: numericLike,
  supply_apy: numericLike,
  reserve_price: numericLike,
})

const Response = z.object({ data: z.array(MarketReserveRow) })

export type MarketReserve = z.infer<typeof MarketReserveRow>

export function aggregateKey(marketKey: string, reserveAddress: string): string {
  return `${marketKey}:${reserveAddress.toLowerCase()}`
}

/**
 * Convert a raw row to one with `deposits`/`borrows`/`available_liquidity`
 * denominated in USD. The /v1/aave/markets/latest endpoint returns these
 * fields in token units alongside a `reserve_price` (USD/token); for stables
 * price ≈ 1 so the unconverted value happens to look right, but for any
 * other reserve (wstETH, WETH, BTC, etc.) the raw number under-reports by
 * the token's USD price. Downstream callers (reserve view, recursion,
 * reconciliation) all assume USD, so the conversion belongs at this boundary.
 */
function toUsdRow(r: MarketReserve): MarketReserve {
  const p = r.reserve_price
  return {
    ...r,
    deposits: r.deposits * p,
    borrows: r.borrows * p,
    available_liquidity: r.available_liquidity * p,
    borrow_capacity: r.borrow_capacity * p,
  }
}

export async function getMarketAggregates(): Promise<Map<string, MarketReserve>> {
  const raw = await tlFetch("/v1/aave/markets/latest")
  const parsed = Response.parse(raw)
  return new Map(
    parsed.data.map((r) => [aggregateKey(r.market_key, r.reserve_address), toUsdRow(r)]),
  )
}
