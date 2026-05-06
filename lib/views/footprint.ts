import { getEthenaPositions, getMarketPositionsBulk } from "@/lib/tokenlogic/positions"
import { getMarketAggregates, type MarketReserve } from "@/lib/tokenlogic/markets"
import { isEthenaWallet } from "@/config/wallets"
import { computeReserveRecursion } from "@/lib/recursion/score"

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
  failedWallets: string[]
  failedMarkets: string[]
}

export async function loadFootprint(): Promise<FootprintResult> {
  const [{ rows: positions, failedWallets }, aggregatesByKey] = await Promise.all([
    getEthenaPositions(),
    getMarketAggregates(),
  ])

  const aggBySymbol = new Map<string, MarketReserve>()
  for (const agg of aggregatesByKey.values()) {
    aggBySymbol.set(`${agg.market_key}:${agg.reserve_symbol}`, agg)
  }

  // Determine markets Ethena touches and fan out with allSettled — a single
  // market timeout should not blank the landing page.
  const ethenaMarkets = new Set<string>()
  for (const p of positions) {
    if (isEthenaWallet(p.userAddress)) ethenaMarkets.add(p.marketKey)
  }
  const { byMarket: marketRowsByKey, failedMarkets } = await getMarketPositionsBulk(
    Array.from(ethenaMarkets),
  )

  // Per-(marketKey, reserveSymbol, userAddress) Ethena supply for the score input,
  // plus a per-(marketKey, reserveSymbol) total used for reserve-level row dedup.
  const ethenaSupplyByUserKey = new Map<string, Map<string, number>>()
  const ethenaSupplyTotalByReserve = new Map<string, number>()
  const ethenaBorrowTotalByReserve = new Map<string, number>()
  const reserveMeta = new Map<string, { chain: string; marketKey: string; reserveSymbol: string }>()

  for (const p of positions) {
    if (!isEthenaWallet(p.userAddress)) continue
    for (const s of p.supplies) {
      const k = `${p.marketKey}:${s.symbol}`
      reserveMeta.set(k, { chain: p.chain, marketKey: p.marketKey, reserveSymbol: s.symbol })
      let inner = ethenaSupplyByUserKey.get(k)
      if (!inner) {
        inner = new Map()
        ethenaSupplyByUserKey.set(k, inner)
      }
      inner.set(p.userAddress, (inner.get(p.userAddress) ?? 0) + s.amountUsd)
      ethenaSupplyTotalByReserve.set(k, (ethenaSupplyTotalByReserve.get(k) ?? 0) + s.amountUsd)
    }
    for (const b of p.borrows) {
      const k = `${p.marketKey}:${b.symbol}`
      reserveMeta.set(k, { chain: p.chain, marketKey: p.marketKey, reserveSymbol: b.symbol })
      ethenaBorrowTotalByReserve.set(k, (ethenaBorrowTotalByReserve.get(k) ?? 0) + b.amountUsd)
    }
  }

  function recursionFor(marketKey: string, reserveSymbol: string): number | undefined {
    const agg = aggBySymbol.get(`${marketKey}:${reserveSymbol}`)
    if (!agg) return undefined
    const rows = marketRowsByKey.get(marketKey)
    if (!rows) return undefined
    const ethenaSupplyByUser =
      ethenaSupplyByUserKey.get(`${marketKey}:${reserveSymbol}`) ?? new Map()
    const nonEthenaRows = rows.filter((r) => !isEthenaWallet(r.userAddress))
    return computeReserveRecursion({
      reserveSymbol,
      marketKey,
      rows: nonEthenaRows,
      aggregateDeposits: agg.deposits,
      aggregateBorrows: agg.borrows,
      ethenaSupplyByUser,
    }).recursionScore
  }

  // Reserve-level dedup: one row per (marketKey, reserveSymbol). Multi-wallet
  // supplies sum into a single Ethena $ figure (matches spec §View A).
  const out: FootprintRow[] = []
  for (const [k, meta] of reserveMeta.entries()) {
    const supplied = ethenaSupplyTotalByReserve.get(k) ?? 0
    const borrowed = ethenaBorrowTotalByReserve.get(k) ?? 0
    const agg = aggBySymbol.get(k)

    if (supplied > 0) {
      out.push({
        chain: meta.chain,
        marketKey: meta.marketKey,
        reserveSymbol: meta.reserveSymbol,
        ethenaSuppliedUsd: supplied,
        reserveAggregateDeposits: agg?.deposits,
        shareOfReserve:
          agg && agg.deposits > 0 ? supplied / agg.deposits : undefined,
        recursionScore: recursionFor(meta.marketKey, meta.reserveSymbol),
        isAnomalyBorrow: false,
      })
    }
    if (borrowed > 0) {
      out.push({
        chain: meta.chain,
        marketKey: meta.marketKey,
        reserveSymbol: meta.reserveSymbol,
        ethenaSuppliedUsd: -borrowed,
        isAnomalyBorrow: true,
      })
    }
  }

  const rows = out.sort((a, b) => {
    const ra = a.recursionScore ?? 0
    const rb = b.recursionScore ?? 0
    if (rb !== ra) return rb - ra
    return Math.abs(b.ethenaSuppliedUsd) - Math.abs(a.ethenaSuppliedUsd)
  })

  const freshness = positions
    .map((p) => p.latestBlockDay)
    .sort()
    .pop()

  return { rows, freshness, failedWallets, failedMarkets }
}
