import { getMarketPositions, getEthenaPositions } from "@/lib/tokenlogic/positions"
import { getMarketAggregates } from "@/lib/tokenlogic/markets"
import { isEthenaWallet } from "@/config/wallets"
import { marketKeyForChain, type Chain } from "@/config/markets"
import { computeReserveRecursion, type ReserveRecursion } from "@/lib/recursion/score"

export interface DepositorRow {
  userAddress: string
  walletLabel: string | null
  amountUsd: number
  isEthena: boolean
}

export interface ReserveView {
  chain: Chain
  marketKey: string
  reserveSymbol: string
  reserveAddress?: string
  totalSupplyUsd: number
  totalBorrowUsd: number
  utilization: number
  supplyApy: number
  borrowApy: number
  borrowCap: number
  topDepositors: DepositorRow[]
  concentration: { top1: number; top5: number; top10: number }
  recursion: ReserveRecursion
  freshness?: string
}

export async function loadReserveView(
  chain: Chain,
  reserveSymbol: string,
): Promise<ReserveView> {
  const marketKey = marketKeyForChain(chain)
  const [marketRows, ethenaRows, aggregatesByKey] = await Promise.all([
    getMarketPositions(marketKey),
    getEthenaPositions(),
    getMarketAggregates(),
  ])

  const aggregate = Array.from(aggregatesByKey.values()).find(
    (a) => a.market_key === marketKey && a.reserve_symbol === reserveSymbol,
  )
  if (!aggregate) {
    throw new Error(`Reserve not found: ${marketKey}/${reserveSymbol}`)
  }

  const depositors: DepositorRow[] = []
  for (const row of marketRows) {
    for (const supply of row.supplies) {
      if (supply.symbol !== reserveSymbol) continue
      depositors.push({
        userAddress: row.userAddress,
        walletLabel: row.walletLabel,
        amountUsd: supply.amountUsd,
        isEthena: isEthenaWallet(row.userAddress),
      })
    }
  }
  depositors.sort((a, b) => b.amountUsd - a.amountUsd)

  // Use the markets-API aggregate as the canonical denominator (T1.4).
  // Falling back to local sum only if aggregate is zero so we don't divide by zero.
  const localSum = depositors.reduce((a, d) => a + d.amountUsd, 0)
  const denom = aggregate.deposits > 0 ? aggregate.deposits : localSum > 0 ? localSum : 1
  const top1 = (depositors[0]?.amountUsd ?? 0) / denom
  const top5 = depositors.slice(0, 5).reduce((a, d) => a + d.amountUsd, 0) / denom
  const top10 = depositors.slice(0, 10).reduce((a, d) => a + d.amountUsd, 0) / denom

  const ethenaSupplyByUser = new Map<string, number>()
  for (const row of ethenaRows) {
    if (row.marketKey !== marketKey) continue
    for (const supply of row.supplies) {
      if (supply.symbol !== reserveSymbol) continue
      ethenaSupplyByUser.set(
        row.userAddress,
        (ethenaSupplyByUser.get(row.userAddress) ?? 0) + supply.amountUsd,
      )
    }
  }

  // T1.3 — Ethena wallet rows are anomalies, not normal data; exclude from
  // the recursion calculation so a self-borrow doesn't inflate its own score.
  const nonEthenaRows = marketRows.filter((r) => !isEthenaWallet(r.userAddress))

  const recursion = computeReserveRecursion({
    reserveSymbol,
    marketKey,
    rows: nonEthenaRows,
    aggregateDeposits: aggregate.deposits,
    aggregateBorrows: aggregate.borrows,
    ethenaSupplyByUser,
  })

  const freshness = marketRows
    .map((r) => r.latestBlockDay)
    .sort()
    .pop()

  return {
    chain,
    marketKey,
    reserveSymbol,
    reserveAddress: aggregate.reserve_address,
    totalSupplyUsd: aggregate.deposits,
    totalBorrowUsd: aggregate.borrows,
    utilization: aggregate.utilization,
    supplyApy: aggregate.supply_apy,
    borrowApy: aggregate.borrow_apy,
    borrowCap: aggregate.borrow_capacity,
    topDepositors: depositors.slice(0, 50),
    concentration: { top1, top5, top10 },
    recursion,
    freshness,
  }
}
