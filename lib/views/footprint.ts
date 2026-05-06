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

export interface FootprintResult {
  rows: FootprintRow[]
  freshness: string | undefined
  failedWallets: string[]
}

/**
 * View A loader — fast path. Computes Ethena's per-reserve footprint and
 * concentration share against the markets-API aggregates. Recursion score
 * is intentionally NOT computed here: it requires walking every borrower in
 * the market (~25k+ rows on Ethereum/Base), which exceeds Vercel Hobby tier
 * function timeouts. Recursion is computed per-reserve on the View B page
 * (one market at a time) where the data volume is bounded.
 */
export async function loadFootprint(): Promise<FootprintResult> {
  const [{ rows: positions, failedWallets }, aggregatesByKey] = await Promise.all([
    getEthenaPositions(),
    getMarketAggregates(),
  ])

  const aggBySymbol = new Map<string, MarketReserve>()
  for (const agg of aggregatesByKey.values()) {
    aggBySymbol.set(`${agg.market_key}:${agg.reserve_symbol}`, agg)
  }

  // Aggregate Ethena supply / borrow per (marketKey, reserveSymbol).
  const ethenaSupplyTotalByReserve = new Map<string, number>()
  const ethenaBorrowTotalByReserve = new Map<string, number>()
  const reserveMeta = new Map<string, { chain: string; marketKey: string; reserveSymbol: string }>()

  for (const p of positions) {
    if (!isEthenaWallet(p.userAddress)) continue
    for (const s of p.supplies) {
      const k = `${p.marketKey}:${s.symbol}`
      reserveMeta.set(k, { chain: p.chain, marketKey: p.marketKey, reserveSymbol: s.symbol })
      ethenaSupplyTotalByReserve.set(k, (ethenaSupplyTotalByReserve.get(k) ?? 0) + s.amountUsd)
    }
    for (const b of p.borrows) {
      const k = `${p.marketKey}:${b.symbol}`
      reserveMeta.set(k, { chain: p.chain, marketKey: p.marketKey, reserveSymbol: b.symbol })
      ethenaBorrowTotalByReserve.set(k, (ethenaBorrowTotalByReserve.get(k) ?? 0) + b.amountUsd)
    }
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
        shareOfReserve: agg && agg.deposits > 0 ? supplied / agg.deposits : undefined,
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

  const rows = out.sort(
    (a, b) => Math.abs(b.ethenaSuppliedUsd) - Math.abs(a.ethenaSuppliedUsd),
  )

  const freshness = positions
    .map((p) => p.latestBlockDay)
    .sort()
    .pop()

  return { rows, freshness, failedWallets }
}
