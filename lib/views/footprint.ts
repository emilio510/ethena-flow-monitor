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
  recursionApprox?: boolean
  isAnomalyBorrow: boolean
}

export interface FootprintResult {
  rows: FootprintRow[]
  freshness: string | undefined
  failedWallets: string[]
  failedMarkets: string[]
  /** $-weighted average recursion score across all reserves where Ethena has
   * supply: Σ(supply_i × recursion_i) / Σ(supply_i). */
  weightedRecursion: number
  /** Whether the weighted average is approximate (any contributing reserve
   * was sampled from the first page only). */
  weightedRecursionApprox: boolean
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

  const ethenaSupplyTotalByReserve = new Map<string, number>()
  const ethenaBorrowTotalByReserve = new Map<string, number>()
  const ethenaSupplyByUserKey = new Map<string, Map<string, number>>()
  const reserveMeta = new Map<string, { chain: string; marketKey: string; reserveSymbol: string }>()

  for (const p of positions) {
    if (!isEthenaWallet(p.userAddress)) continue
    for (const s of p.supplies) {
      const k = `${p.marketKey}:${s.symbol}`
      reserveMeta.set(k, { chain: p.chain, marketKey: p.marketKey, reserveSymbol: s.symbol })
      ethenaSupplyTotalByReserve.set(k, (ethenaSupplyTotalByReserve.get(k) ?? 0) + s.amountUsd)
      let inner = ethenaSupplyByUserKey.get(k)
      if (!inner) {
        inner = new Map()
        ethenaSupplyByUserKey.set(k, inner)
      }
      inner.set(p.userAddress, (inner.get(p.userAddress) ?? 0) + s.amountUsd)
    }
    for (const b of p.borrows) {
      const k = `${p.marketKey}:${b.symbol}`
      reserveMeta.set(k, { chain: p.chain, marketKey: p.marketKey, reserveSymbol: b.symbol })
      ethenaBorrowTotalByReserve.set(k, (ethenaBorrowTotalByReserve.get(k) ?? 0) + b.amountUsd)
    }
  }

  // Fan out one-page samples for every market Ethena touches. This is the
  // cap that keeps View A under Vercel Hobby's 10s function timeout — full
  // pagination per market would take 30-60s on busy markets.
  const ethenaMarkets = Array.from(
    new Set(
      positions
        .filter((p) => isEthenaWallet(p.userAddress))
        .map((p) => p.marketKey),
    ),
  )
  const { byMarket: marketSamples, failedMarkets } = await getMarketPositionsBulk(ethenaMarkets)

  function computeRecursion(marketKey: string, reserveSymbol: string) {
    const agg = aggBySymbol.get(`${marketKey}:${reserveSymbol}`)
    const sample = marketSamples.get(marketKey)
    if (!agg || !sample) return undefined
    const ethenaSupplyByUser =
      ethenaSupplyByUserKey.get(`${marketKey}:${reserveSymbol}`) ?? new Map()
    const nonEthenaRows = sample.rows.filter((r) => !isEthenaWallet(r.userAddress))
    const r = computeReserveRecursion({
      reserveSymbol,
      marketKey,
      rows: nonEthenaRows,
      aggregateDeposits: agg.deposits,
      aggregateBorrows: agg.borrows,
      ethenaSupplyByUser,
    })
    return { score: r.recursionScore, approx: sample.truncated }
  }

  const out: FootprintRow[] = []
  let weightedNumerator = 0
  let weightedDenominator = 0
  let weightedAnyApprox = false

  for (const [k, meta] of reserveMeta.entries()) {
    const supplied = ethenaSupplyTotalByReserve.get(k) ?? 0
    const borrowed = ethenaBorrowTotalByReserve.get(k) ?? 0
    const agg = aggBySymbol.get(k)
    const recursion = supplied > 0 ? computeRecursion(meta.marketKey, meta.reserveSymbol) : undefined

    if (supplied > 0) {
      out.push({
        chain: meta.chain,
        marketKey: meta.marketKey,
        reserveSymbol: meta.reserveSymbol,
        ethenaSuppliedUsd: supplied,
        reserveAggregateDeposits: agg?.deposits,
        shareOfReserve: agg && agg.deposits > 0 ? supplied / agg.deposits : undefined,
        recursionScore: recursion?.score,
        recursionApprox: recursion?.approx,
        isAnomalyBorrow: false,
      })
      if (recursion) {
        weightedNumerator += supplied * recursion.score
        weightedDenominator += supplied
        if (recursion.approx) weightedAnyApprox = true
      }
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

  const weightedRecursion = weightedDenominator > 0 ? weightedNumerator / weightedDenominator : 0

  return {
    rows,
    freshness,
    failedWallets,
    failedMarkets,
    weightedRecursion,
    weightedRecursionApprox: weightedAnyApprox,
  }
}
