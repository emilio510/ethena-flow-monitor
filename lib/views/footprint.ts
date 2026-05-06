import { getEthenaPositions, getMarketPositions } from "@/lib/tokenlogic/positions"
import { getMarketAggregates, type MarketReserve } from "@/lib/tokenlogic/markets"
import { isEthenaWallet } from "@/config/wallets"
import { computeReserveRecursion } from "@/lib/recursion/score"
import type { UserPositionRow } from "@/lib/tokenlogic/schemas"

export interface FootprintRow {
  chain: string
  marketKey: string
  reserveSymbol: string
  ethenaSuppliedUsd: number
  reserveAggregateDeposits?: number
  shareOfReserve?: number
  recursionScore?: number
  isAnomalyBorrow: boolean
}

export interface FootprintResult {
  rows: FootprintRow[]
  freshness: string | undefined
}

export async function loadFootprint(): Promise<FootprintResult> {
  const [positions, aggregatesByKey] = await Promise.all([
    getEthenaPositions(),
    getMarketAggregates(),
  ])

  const aggBySymbol = new Map<string, MarketReserve>()
  for (const agg of aggregatesByKey.values()) {
    aggBySymbol.set(`${agg.market_key}:${agg.reserve_symbol}`, agg)
  }

  // T4.3 — Compute a recursion score for every (market × reserve) where Ethena has supply.
  // Fan out market-position fetches in parallel for the markets Ethena touches.
  const ethenaMarkets = new Set<string>()
  for (const p of positions) {
    if (isEthenaWallet(p.userAddress)) ethenaMarkets.add(p.marketKey)
  }
  const marketRowsEntries = await Promise.all(
    Array.from(ethenaMarkets).map(async (mk) => {
      const rows = await getMarketPositions(mk)
      return [mk, rows] as const
    }),
  )
  const marketRowsByKey = new Map(marketRowsEntries)

  // Index Ethena supply per (marketKey, reserveSymbol, userAddress) for the score input.
  const ethenaSupply = new Map<string, Map<string, number>>()
  for (const p of positions) {
    if (!isEthenaWallet(p.userAddress)) continue
    for (const s of p.supplies) {
      const k = `${p.marketKey}:${s.symbol}`
      let inner = ethenaSupply.get(k)
      if (!inner) {
        inner = new Map()
        ethenaSupply.set(k, inner)
      }
      inner.set(p.userAddress, (inner.get(p.userAddress) ?? 0) + s.amountUsd)
    }
  }

  function recursionFor(marketKey: string, reserveSymbol: string): number | undefined {
    const agg = aggBySymbol.get(`${marketKey}:${reserveSymbol}`)
    if (!agg) return undefined
    const rows = marketRowsByKey.get(marketKey)
    if (!rows) return undefined
    const ethenaSupplyByUser = ethenaSupply.get(`${marketKey}:${reserveSymbol}`) ?? new Map()
    const nonEthenaRows: UserPositionRow[] = rows.filter(
      (r) => !isEthenaWallet(r.userAddress),
    )
    return computeReserveRecursion({
      reserveSymbol,
      marketKey,
      rows: nonEthenaRows,
      aggregateDeposits: agg.deposits,
      aggregateBorrows: agg.borrows,
      ethenaSupplyByUser,
    }).recursionScore
  }

  const out: FootprintRow[] = []
  for (const p of positions) {
    if (!isEthenaWallet(p.userAddress)) continue
    for (const supply of p.supplies) {
      const agg = aggBySymbol.get(`${p.marketKey}:${supply.symbol}`)
      out.push({
        chain: p.chain,
        marketKey: p.marketKey,
        reserveSymbol: supply.symbol,
        ethenaSuppliedUsd: supply.amountUsd,
        reserveAggregateDeposits: agg?.deposits,
        shareOfReserve:
          agg && agg.deposits > 0 ? supply.amountUsd / agg.deposits : undefined,
        recursionScore: recursionFor(p.marketKey, supply.symbol),
        isAnomalyBorrow: false,
      })
    }
    for (const borrow of p.borrows) {
      out.push({
        chain: p.chain,
        marketKey: p.marketKey,
        reserveSymbol: borrow.symbol,
        ethenaSuppliedUsd: -borrow.amountUsd,
        isAnomalyBorrow: true,
      })
    }
  }
  // Spec §3: recursion score is the primary sort key; fall back to $ size for rows w/o a score.
  const rows = out.sort((a, b) => {
    const ra = a.recursionScore ?? 0
    const rb = b.recursionScore ?? 0
    if (rb !== ra) return rb - ra
    return Math.abs(b.ethenaSuppliedUsd) - Math.abs(a.ethenaSuppliedUsd)
  })

  // T2.6 — surface staleness via the most recent latest_block_day across all
  // Ethena positions. Lets the user see if the BigQuery pipeline is stalled.
  const freshness = positions
    .map((p) => p.latestBlockDay)
    .sort()
    .pop()

  return { rows, freshness }
}
