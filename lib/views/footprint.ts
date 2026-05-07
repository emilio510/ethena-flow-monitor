import { getEthenaPositions, getMarketPositionsBulk } from "@/lib/tokenlogic/positions"
import { getMarketAggregates, type MarketReserve } from "@/lib/tokenlogic/markets"
import {
  getEthenaMorphoPositions,
  getMorphoVaultsBulk,
  MORPHO_CHAINS,
  type MorphoVaultDetail,
} from "@/lib/morpho/positions"
import { isEthenaWallet } from "@/config/wallets"
import { computeReserveRecursion } from "@/lib/recursion/score"
import { classify, isEthenaStack } from "@/lib/recursion/classify"

export type Protocol = "AAVE V3" | "MORPHO"

export interface FootprintRow {
  protocol: Protocol
  chain: string
  marketKey: string
  reserveSymbol: string
  /** Morpho-only: human-readable vault name (e.g. "Sentora PYUSD Core"). */
  vaultName?: string
  /** Morpho-only: vault contract address for routing to a future drill-down. */
  vaultAddress?: string
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
  failedMorpho: string[]
  weightedRecursion: number
  weightedRecursionApprox: boolean
}

const clamp = (n: number) => Math.max(0, Math.min(1, n))

/** Recursion share for a Morpho vault: fraction of TVL allocated to markets
 * whose collateral OR loan asset is in the Ethena stack (Tier-1 or PT). */
function morphoVaultRecursionShare(vault: MorphoVaultDetail): number {
  if (vault.totalAssetsUsd <= 0) return 0
  let recursiveAlloc = 0
  for (const a of vault.allocation) {
    const colBucket = a.collateralSymbol ? classify(a.collateralSymbol) : "OTHER"
    const loanBucket = a.loanSymbol ? classify(a.loanSymbol) : "OTHER"
    if (isEthenaStack(colBucket) || isEthenaStack(loanBucket)) {
      recursiveAlloc += a.supplyAssetsUsd
    }
  }
  return clamp(recursiveAlloc / vault.totalAssetsUsd)
}

export async function loadFootprint(): Promise<FootprintResult> {
  const [
    { rows: aavePositions, failedWallets },
    aggregatesByKey,
    { positions: morphoPositions, failedWallets: failedMorpho },
  ] = await Promise.all([
    getEthenaPositions(),
    getMarketAggregates(),
    getEthenaMorphoPositions(),
  ])

  // ───────────────────── Aave footprint

  const aggBySymbol = new Map<string, MarketReserve>()
  for (const agg of aggregatesByKey.values()) {
    aggBySymbol.set(`${agg.market_key}:${agg.reserve_symbol}`, agg)
  }

  const ethenaSupplyTotalByReserve = new Map<string, number>()
  const ethenaBorrowTotalByReserve = new Map<string, number>()
  const ethenaSupplyByUserKey = new Map<string, Map<string, number>>()
  const reserveMeta = new Map<
    string,
    { chain: string; marketKey: string; reserveSymbol: string }
  >()

  for (const p of aavePositions) {
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

  const ethenaAaveMarkets = Array.from(
    new Set(
      aavePositions.filter((p) => isEthenaWallet(p.userAddress)).map((p) => p.marketKey),
    ),
  )
  const { byMarket: marketSamples, failedMarkets } =
    await getMarketPositionsBulk(ethenaAaveMarkets)

  function aaveRecursion(marketKey: string, reserveSymbol: string) {
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
    const recursion = supplied > 0 ? aaveRecursion(meta.marketKey, meta.reserveSymbol) : undefined

    if (supplied > 0) {
      out.push({
        protocol: "AAVE V3",
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
        protocol: "AAVE V3",
        chain: meta.chain,
        marketKey: meta.marketKey,
        reserveSymbol: meta.reserveSymbol,
        ethenaSuppliedUsd: -borrowed,
        isAnomalyBorrow: true,
      })
    }
  }

  // ───────────────────── Morpho footprint

  const morphoTotalByVault = new Map<string, number>()
  const morphoMeta = new Map<
    string,
    {
      chain: "ethereum" | "base"
      vaultAddress: string
      vaultName: string
      vaultAssetSymbol: string
    }
  >()
  for (const m of morphoPositions) {
    const key = `${m.chain}:${m.vaultAddress.toLowerCase()}`
    morphoMeta.set(key, {
      chain: m.chain,
      vaultAddress: m.vaultAddress,
      vaultName: m.vaultName,
      vaultAssetSymbol: m.vaultAssetSymbol,
    })
    morphoTotalByVault.set(key, (morphoTotalByVault.get(key) ?? 0) + m.ethenaSuppliedUsd)
  }

  const vaultRefs = Array.from(morphoMeta.values()).map((m) => ({
    address: m.vaultAddress,
    chain: m.chain,
    chainId: MORPHO_CHAINS.find((c) => c.chain === m.chain)!.chainId,
  }))
  const vaultsByKey: Map<string, MorphoVaultDetail> =
    vaultRefs.length > 0 ? await getMorphoVaultsBulk(vaultRefs) : new Map()

  for (const [key, meta] of morphoMeta.entries()) {
    const supplied = morphoTotalByVault.get(key) ?? 0
    if (supplied <= 0) continue
    const vault = vaultsByKey.get(key)
    let recursionScore: number | undefined
    let shareOfReserve: number | undefined
    let totalAssets: number | undefined
    if (vault) {
      totalAssets = vault.totalAssetsUsd
      shareOfReserve = vault.totalAssetsUsd > 0 ? supplied / vault.totalAssetsUsd : undefined
      const vaultRecursion = morphoVaultRecursionShare(vault)
      recursionScore = clamp(shareOfReserve ?? 0) * vaultRecursion
      weightedNumerator += supplied * recursionScore
      weightedDenominator += supplied
    }
    out.push({
      protocol: "MORPHO",
      chain: meta.chain,
      marketKey: `morpho:${meta.chain}:${meta.vaultAddress}`,
      reserveSymbol: meta.vaultAssetSymbol,
      vaultName: meta.vaultName,
      vaultAddress: meta.vaultAddress,
      ethenaSuppliedUsd: supplied,
      reserveAggregateDeposits: totalAssets,
      shareOfReserve,
      recursionScore,
      recursionApprox: false,
      isAnomalyBorrow: false,
    })
  }

  // ───────────────────── Sort + freshness

  const rows = out.sort((a, b) => {
    const ra = a.recursionScore ?? 0
    const rb = b.recursionScore ?? 0
    if (rb !== ra) return rb - ra
    return Math.abs(b.ethenaSuppliedUsd) - Math.abs(a.ethenaSuppliedUsd)
  })

  const freshness = aavePositions
    .map((p) => p.latestBlockDay)
    .sort()
    .pop()

  const weightedRecursion =
    weightedDenominator > 0 ? weightedNumerator / weightedDenominator : 0

  return {
    rows,
    freshness,
    failedWallets,
    failedMarkets,
    failedMorpho,
    weightedRecursion,
    weightedRecursionApprox: weightedAnyApprox,
  }
}
