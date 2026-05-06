import { z } from "zod"

const BqDate = z.object({ value: z.string() }).transform((d) => d.value)

const ScalarOrArray = <T extends z.ZodTypeAny>(s: T) =>
  z.union([s, z.array(s)]).transform((v): z.infer<T>[] => (Array.isArray(v) ? v : [v]))

export const Reserve = z.object({
  symbol: z.string(),
  amount: z.number(),
  amountUsd: z.number(),
})

export type Reserve = z.infer<typeof Reserve>

const RawRow = z.object({
  protocol: z.string(),
  chain: z.string(),
  market_key: z.string(),
  market_label: z.string(),
  user_address: z.string(),
  wallet_label: z.string().nullable(),
  latest_block_day: BqDate,
  supply_reserve_symbols: z.array(z.string()),
  supply_reserve_amount: ScalarOrArray(z.number()),
  supply_reserve_amount_usd: ScalarOrArray(z.number()),
  total_supply_amount_usd: z.number(),
  borrow_reserve_symbols: z.array(z.string()),
  borrow_reserve_amount: ScalarOrArray(z.number()),
  borrow_reserve_amount_usd: ScalarOrArray(z.number()),
  total_borrow_amount_usd: z.number(),
  health_factor: z.number().nullable(),
  net_apy: z.number().nullable(),
  net_usd_per_day: z.number().nullable(),
  days_to_liquidation: z.number().nullable(),
})

function zip(symbols: string[], amounts: number[], amountsUsd: number[]): Reserve[] {
  if (symbols.length === 0) return []
  // T2.5 — refuse to silently zero-fill mismatched arrays; that would hide
  // schema drift and silently produce wrong totals downstream.
  if (amounts.length !== symbols.length || amountsUsd.length !== symbols.length) {
    throw new Error(
      `User-positions row has misaligned arrays: symbols=${symbols.length}, amounts=${amounts.length}, amountsUsd=${amountsUsd.length}`,
    )
  }
  return symbols.map((symbol, i) => ({
    symbol,
    amount: amounts[i]!,
    amountUsd: amountsUsd[i]!,
  }))
}

export const UserPositionRow = RawRow.transform((r) => ({
  protocol: r.protocol,
  chain: r.chain,
  marketKey: r.market_key,
  marketLabel: r.market_label,
  userAddress: r.user_address.toLowerCase(),
  walletLabel: r.wallet_label,
  latestBlockDay: r.latest_block_day,
  supplies: zip(r.supply_reserve_symbols, r.supply_reserve_amount, r.supply_reserve_amount_usd),
  borrows: zip(r.borrow_reserve_symbols, r.borrow_reserve_amount, r.borrow_reserve_amount_usd),
  totalSupplyUsd: r.total_supply_amount_usd,
  totalBorrowUsd: r.total_borrow_amount_usd,
  healthFactor: r.health_factor,
  netApy: r.net_apy,
  netUsdPerDay: r.net_usd_per_day,
  daysToLiquidation: r.days_to_liquidation,
}))

export type UserPositionRow = z.infer<typeof UserPositionRow>

export const UserPositionsResponse = z.object({
  data: z.array(UserPositionRow),
  lastUpdated: z.string().optional(),
})
