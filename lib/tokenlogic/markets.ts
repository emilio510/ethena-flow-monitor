import { z } from "zod"
import { tlFetch } from "./client"

const MarketReserveRow = z.object({
  protocol: z.string(),
  market_key: z.string(),
  reserve_address: z.string(),
  reserve_symbol: z.string(),
  deposits: z.number(),
  borrows: z.number(),
  available_liquidity: z.number(),
  borrow_capacity: z.number(),
  utilization: z.number(),
  borrow_apy: z.number(),
  supply_apy: z.number(),
  reserve_price: z.number(),
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
