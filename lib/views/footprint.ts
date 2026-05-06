import { getEthenaPositions } from "@/lib/tokenlogic/positions"
import { getMarketAggregates, type MarketReserve } from "@/lib/tokenlogic/markets"
import { isEthenaWallet } from "@/config/wallets"

export interface FootprintRow {
  chain: string
  marketKey: string
  reserveSymbol: string
  ethenaSuppliedUsd: number
  reserveAggregateDeposits?: number
  shareOfReserve?: number
  isAnomalyBorrow: boolean
}

export async function loadFootprint(): Promise<FootprintRow[]> {
  const [positions, aggregatesByKey] = await Promise.all([
    getEthenaPositions(),
    getMarketAggregates(),
  ])

  const aggBySymbol = new Map<string, MarketReserve>()
  for (const agg of aggregatesByKey.values()) {
    aggBySymbol.set(`${agg.market_key}:${agg.reserve_symbol}`, agg)
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
  return out.sort((a, b) => Math.abs(b.ethenaSuppliedUsd) - Math.abs(a.ethenaSuppliedUsd))
}
