import { getMarketPositions, getEthenaPositions } from "@/lib/tokenlogic/positions"
import { getMarketAggregates } from "@/lib/tokenlogic/markets"
import { isEthenaWallet } from "@/config/wallets"
import { marketKeyForChain, type Chain } from "@/config/markets"
import {
  computeReserveRecursion,
  type ReserveRecursion,
  type MorphoReserveMarket,
} from "@/lib/recursion/score"
import {
  getEthenaMorphoPositions,
  getMorphoVaultsBulk,
  MORPHO_CHAINS,
} from "@/lib/morpho/positions"

export class ReserveNotFoundError extends Error {
  constructor(public marketKey: string, public reserveSymbol: string) {
    super(`Reserve not found: ${marketKey}/${reserveSymbol}`)
    this.name = "ReserveNotFoundError"
  }
}

export interface DepositorRow {
  userAddress: string
  walletLabel: string | null
  amountUsd: number
  isEthena: boolean
  isLeveraged: boolean
}

export interface PositionAsset {
  symbol: string
  amountUsd: number
}

export interface BorrowerRow {
  userAddress: string
  isEthena: boolean
  borrowOfReserveUsd: number
  totalSupplyUsd: number
  totalBorrowUsd: number
  healthFactor: number | null
  supplies: PositionAsset[]
  borrows: PositionAsset[]
}

export interface CollateralUserRow {
  userAddress: string
  isEthena: boolean
  reserveSupplyUsd: number
  totalSupplyUsd: number
  totalBorrowUsd: number
  healthFactor: number | null
  supplies: PositionAsset[]
  borrows: PositionAsset[]
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
  topBorrowers: BorrowerRow[]
  topCollateralUsers: CollateralUserRow[]
  concentration: { top1: number; top5: number; top10: number }
  recursion: ReserveRecursion
  freshness?: string
  /** True when the borrower set was sampled (large market exceeded one page).
   * Recursion + concentration are then approximate. */
  recursionApprox: boolean
}

export async function loadReserveView(
  chain: Chain,
  reserveSymbol: string,
): Promise<ReserveView> {
  const marketKey = marketKeyForChain(chain)
  const [{ rows: marketRows, truncated }, { rows: ethenaRows }, aggregatesByKey] = await Promise.all(
    [getMarketPositions(marketKey), getEthenaPositions(), getMarketAggregates()],
  )

  const aggregate = Array.from(aggregatesByKey.values()).find(
    (a) => a.market_key === marketKey && a.reserve_symbol === reserveSymbol,
  )
  if (!aggregate) {
    throw new ReserveNotFoundError(marketKey, reserveSymbol)
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
        isLeveraged: (row.totalBorrowUsd ?? 0) > 0,
      })
    }
  }
  depositors.sort((a, b) => b.amountUsd - a.amountUsd)

  // Use the markets-API aggregate as the canonical denominator (T1.4).
  // When the aggregate is zero (empty reserve), every concentration ratio is
  // zero by definition; never fall back to a local sum that could produce
  // >100% values.
  const denom = aggregate.deposits > 0 ? aggregate.deposits : 0
  const sliceShare = (slice: number) => (denom > 0 ? slice / denom : 0)
  const top1 = sliceShare(depositors[0]?.amountUsd ?? 0)
  const top5 = sliceShare(depositors.slice(0, 5).reduce((a, d) => a + d.amountUsd, 0))
  const top10 = sliceShare(depositors.slice(0, 10).reduce((a, d) => a + d.amountUsd, 0))

  // Borrowers of THIS reserve, with their full position composition for the bar viz.
  const borrowers: BorrowerRow[] = []
  for (const row of marketRows) {
    const borrow = row.borrows.find((b) => b.symbol === reserveSymbol)
    if (!borrow) continue
    borrowers.push({
      userAddress: row.userAddress,
      isEthena: isEthenaWallet(row.userAddress),
      borrowOfReserveUsd: borrow.amountUsd,
      totalSupplyUsd: row.totalSupplyUsd,
      totalBorrowUsd: row.totalBorrowUsd,
      healthFactor: row.healthFactor,
      supplies: row.supplies.map((s) => ({ symbol: s.symbol, amountUsd: s.amountUsd })),
      borrows: row.borrows.map((b) => ({ symbol: b.symbol, amountUsd: b.amountUsd })),
    })
  }
  borrowers.sort((a, b) => b.borrowOfReserveUsd - a.borrowOfReserveUsd)

  // Users who supply THIS reserve AND have any borrow position (i.e. using
  // it as collateral against debt).
  const collateralUsers: CollateralUserRow[] = []
  for (const row of marketRows) {
    if ((row.totalBorrowUsd ?? 0) <= 0) continue
    const supply = row.supplies.find((s) => s.symbol === reserveSymbol)
    if (!supply) continue
    collateralUsers.push({
      userAddress: row.userAddress,
      isEthena: isEthenaWallet(row.userAddress),
      reserveSupplyUsd: supply.amountUsd,
      totalSupplyUsd: row.totalSupplyUsd,
      totalBorrowUsd: row.totalBorrowUsd,
      healthFactor: row.healthFactor,
      supplies: row.supplies.map((s) => ({ symbol: s.symbol, amountUsd: s.amountUsd })),
      borrows: row.borrows.map((b) => ({ symbol: b.symbol, amountUsd: b.amountUsd })),
    })
  }
  collateralUsers.sort((a, b) => b.reserveSupplyUsd - a.reserveSupplyUsd)

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

  // Cross-protocol: fold in any Morpho markets that borrow this reserve's
  // asset, so the by-collateral donut and the Ethena-stack share reflect
  // Morpho-side leverage (e.g. Steakhouse Ethena USDtb's $108M of sUSDe→USDtb)
  // instead of hiding it. Fetched only for chains Morpho actually deploys to.
  const morphoMarkets = MORPHO_CHAINS.some((c) => c.chain === chain)
    ? await collectMorphoMarketsForReserve(chain, reserveSymbol)
    : []

  const recursion = computeReserveRecursion({
    reserveSymbol,
    marketKey,
    rows: nonEthenaRows,
    aggregateDeposits: aggregate.deposits,
    aggregateBorrows: aggregate.borrows,
    ethenaSupplyByUser,
    morphoMarkets,
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
    topBorrowers: borrowers.slice(0, 50),
    topCollateralUsers: collateralUsers.slice(0, 50),
    concentration: { top1, top5, top10 },
    recursion,
    freshness,
    recursionApprox: truncated,
  }
}

/**
 * Collect Morpho Blue markets whose loan asset matches `reserveSymbol` on
 * the given chain, deduped by collateral/loan pair so the same Blue market
 * supplied by multiple Ethena vaults contributes its market-wide borrow once.
 *
 * Best-effort: if Morpho's API is unreachable the reserve view degrades to
 * Aave-only rather than throwing — the caller's recursion donut is still
 * meaningful, just under-reports Morpho's contribution until the next render.
 */
async function collectMorphoMarketsForReserve(
  chain: Chain,
  reserveSymbol: string,
): Promise<MorphoReserveMarket[]> {
  try {
    const { positions } = await getEthenaMorphoPositions()
    const refs = positions
      .filter((p) => p.chain === chain)
      .map((p) => ({
        address: p.vaultAddress,
        chain: p.chain,
        chainId: p.chain === "ethereum" ? 1 : 8453,
        version: p.vaultVersion,
      }))
    if (refs.length === 0) return []
    const details = await getMorphoVaultsBulk(refs)
    const seen = new Set<string>()
    const out: MorphoReserveMarket[] = []
    for (const vault of details.values()) {
      for (const a of vault.allocation) {
        if (a.loanSymbol !== reserveSymbol) continue
        if (a.marketBorrowUsd <= 0) continue
        const key = `${a.collateralSymbol ?? ""}|${a.loanSymbol ?? ""}|${a.marketUniqueKey}`
        if (seen.has(key)) continue
        seen.add(key)
        out.push({
          collateralSymbol: a.collateralSymbol,
          marketBorrowUsd: a.marketBorrowUsd,
        })
      }
    }
    return out
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    console.warn(
      `[ethena-flow-monitor] morpho cross-protocol fetch failed for ${chain}/${reserveSymbol}: ${reason}`,
    )
    return []
  }
}
