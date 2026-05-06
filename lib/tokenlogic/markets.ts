import { z } from "zod"
import { tlFetch } from "./client"

// Rate-like fields are nullable in the upstream when a reserve has no
// liquidity (e.g. utilization is null when both deposits and borrows are 0).
// Default to 0 so the dashboard can still display the row.
const numberOrNullToZero = z
  .number()
  .nullable()
  .transform((v) => v ?? 0)

const MarketReserveRow = z.object({
  protocol: z.string(),
  market_key: z.string(),
  reserve_address: z.string(),
  reserve_symbol: z.string(),
  deposits: z.number(),
  borrows: z.number(),
  available_liquidity: z.number(),
  borrow_capacity: z.number(),
  utilization: numberOrNullToZero,
  borrow_apy: numberOrNullToZero,
  supply_apy: numberOrNullToZero,
  reserve_price: numberOrNullToZero,
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
