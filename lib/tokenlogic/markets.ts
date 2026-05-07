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

export async function getMarketAggregates(): Promise<Map<string, MarketReserve>> {
  const raw = await tlFetch("/v1/aave/markets/latest")
  const parsed = Response.parse(raw)
  return new Map(parsed.data.map((r) => [aggregateKey(r.market_key, r.reserve_address), r]))
}
