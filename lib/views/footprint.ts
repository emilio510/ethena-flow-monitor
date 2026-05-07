import { getEthenaPositions, getMarketPositionsBulk } from "@/lib/tokenlogic/positions"
import { getMarketAggregates, type MarketReserve } from "@/lib/tokenlogic/markets"
import {
  getEthenaMorphoPositions,
  getMorphoVaultsBulk,
  MORPHO_CHAINS,
  type MorphoVaultDetail,
} from "@/lib/morpho/positions"
import { getEthenaIdleBalances, type IdleBalanceResult } from "@/lib/onchain/balances"
import { getEthenaBacking, type EthenaBackingResult } from "@/lib/ethena/transparency"
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
  /** Total $ Ethena has supplied across Aave + Morpho (sum of all deployed
   *  supply positions). Equals the existing landing-page "Total supplied" KPI. */
  deployedUsd: number
  /** Idle backing balances (per-token aggregate) sitting in the 11 wallets,
   *  not deployed in any lending market. */
  idle: IdleBalanceResult
  /** Recursive looping in USD = weightedRecursion × deployed.
   *  This is the slice of Ethena's stack actually being levered. */
  recursiveUsd: number
  /** True recursion share = recursiveUsd / total backing. Headline figure on
   *  View A. Denominator uses Ethena's official $-total when their API is up
   *  (so CEX-delegated funding-rate-harvest backing is included); falls back
   *  to deployed + idle when the API is down. */
  trueRecursionShare: number
  /** Ethena's own transparency feed — total backing notional, the CEX
   *  delegation breakdown, and the reserve fund. Used to surface the ~13%
   *  of backing that isn't on-chain. */
  ethena: EthenaBackingResult
}

/** Drop dust rows below this threshold so the table only shows meaningful
 * Ethena exposure. Tunable; $1M default per user feedback. */
const MIN_DUST_USD = 1_000_000

const clamp = (n: number) => Math.max(0, Math.min(1, n))

/** Recursion share for a Morpho vault. We attribute pro-rata to the
 * *borrowed* portion of each market the vault supplies — not the allocated
 * portion — so idle liquidity sitting unborrowed in a market does NOT count
 * as recursive. Only money that is actually being levered counts.
 *
 *   vault_recursion_share =
 *     Σ(allocation_i × utilization_i × is_recursive_i) / vault.TVL
 *
 * where utilization_i = market_i.borrowed / market_i.supplied.
 */
function morphoVaultRecursionShare(vault: MorphoVaultDetail): number {
  if (vault.totalAssetsUsd <= 0) return 0
  let attributedBorrow = 0
  for (const a of vault.allocation) {
    const colBucket = a.collateralSymbol ? classify(a.collateralSymbol) : "OTHER"
    const loanBucket = a.loanSymbol ? classify(a.loanSymbol) : "OTHER"
    if (!isEthenaStack(colBucket) && !isEthenaStack(loanBucket)) continue
    if (a.marketSupplyUsd <= 0) continue
    const utilization = a.marketBorrowUsd / a.marketSupplyUsd
    attributedBorrow += a.supplyAssetsUsd * utilization
  }
  return clamp(attributedBorrow / vault.totalAssetsUsd)
}

export async function loadFootprint(): Promise<FootprintResult> {
  const [
    { rows: aavePositions, failedWallets },
    aggregatesByKey,
    { positions: morphoPositions, failedWallets: failedMorpho },
    idle,
    ethena,
  ] = await Promise.all([
    getEthenaPositions(),
    getMarketAggregates(),
    getEthenaMorphoPositions(),
    getEthenaIdleBalances(),
    getEthenaBacking(),
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
      vaultVersion: "V1" | "V2"
    }
  >()
  for (const m of morphoPositions) {
    const key = `${m.chain}:${m.vaultAddress.toLowerCase()}`
    morphoMeta.set(key, {
      chain: m.chain,
      vaultAddress: m.vaultAddress,
      vaultName: m.vaultName,
      vaultAssetSymbol: m.vaultAssetSymbol,
      vaultVersion: m.vaultVersion,
    })
    morphoTotalByVault.set(key, (morphoTotalByVault.get(key) ?? 0) + m.ethenaSuppliedUsd)
  }

  const vaultRefs = Array.from(morphoMeta.values()).map((m) => ({
    address: m.vaultAddress,
    chain: m.chain,
    chainId: MORPHO_CHAINS.find((c) => c.chain === m.chain)!.chainId,
    version: m.vaultVersion,
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

  const rows = out
    .filter((r) => Math.abs(r.ethenaSuppliedUsd) >= MIN_DUST_USD)
    .sort((a, b) => Math.abs(b.ethenaSuppliedUsd) - Math.abs(a.ethenaSuppliedUsd))

  const freshness = aavePositions
    .map((p) => p.latestBlockDay)
    .sort()
    .pop()

  const weightedRecursion =
    weightedDenominator > 0 ? weightedNumerator / weightedDenominator : 0

  // Deployed = total Ethena supply across Aave + Morpho (positive rows only,
  // anomaly borrows are negative and excluded).
  const deployedUsd = rows
    .filter((r) => !r.isAnomalyBorrow)
    .reduce((a, r) => a + r.ethenaSuppliedUsd, 0)
  const recursiveUsd = weightedRecursion * deployedUsd
  // Prefer Ethena's official total when available — it includes the ~13% of
  // backing delegated to CEXes for funding-rate harvest, which we can't see
  // on-chain. Fall back to deployed + idle if their API is down.
  const totalBacking = ethena.failed
    ? deployedUsd + idle.totalUsd
    : ethena.totalBackingUsd
  const trueRecursionShare =
    totalBacking > 0 ? clamp(recursiveUsd / totalBacking) : 0

  return {
    rows,
    freshness,
    failedWallets,
    failedMarkets,
    failedMorpho,
    weightedRecursion,
    weightedRecursionApprox: weightedAnyApprox,
    deployedUsd,
    idle,
    recursiveUsd,
    trueRecursionShare,
    ethena,
  }
}
