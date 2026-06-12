import {
  getEthenaPositions,
  getMarketPositionsBulk,
  type EthenaPositionsResult,
} from "@/lib/tokenlogic/positions"
import { getMarketAggregates, type MarketReserve } from "@/lib/tokenlogic/markets"
import {
  getEthenaMorphoPositions,
  getMorphoVaultsBulk,
  MORPHO_CHAINS,
  type MorphoVaultDetail,
  type EthenaMorphoResult,
} from "@/lib/morpho/positions"
import { getEthenaIdleBalances, type IdleBalanceResult, type IdleBalanceRow } from "@/lib/onchain/balances"
import { getEthenaRlusdHoldings, type XrplRlusdResult } from "@/lib/onchain/xrpl"
import {
  ETHENA_WALLETS,
  KNOWN_WALLET_LABELS,
  RESERVE_FUND_WALLET,
  isEthenaWallet,
} from "@/config/wallets"
import { computeReserveRecursion } from "@/lib/recursion/score"
import { classify, isEthenaStack } from "@/lib/recursion/classify"
import { getEthenaSolanaPositions } from "@/lib/solana"
import { getEthenaSolanaIdleBalances } from "@/lib/solana/balances"
import { SOLANA_WALLETS, KNOWN_SOLANA_WALLET_LABELS } from "@/config/solana-wallets"
import { flattenWallets, type BackingSnapshot } from "@/lib/ethena"

export type Protocol = "AAVE V3" | "MORPHO" | "KAMINO" | "JUPITER LEND"

export interface FootprintOptions {
  /** Ethena's reported backing snapshot. When provided, loadFootprint will
   *  emit Solana rows for Kamino + Jupiter Lend using Ethena's $ attribution
   *  and live market context from each protocol's API. */
  ethenaSnapshot?: BackingSnapshot
}

export interface FootprintRow {
  protocol: Protocol
  chain: string
  marketKey: string
  reserveSymbol: string
  /** Morpho / Kamino / Jupiter vaults: human-readable vault name. */
  vaultName?: string
  /** Morpho / Kamino / Jupiter vaults: vault contract address for routing. */
  vaultAddress?: string
  ethenaSuppliedUsd: number
  reserveAggregateDeposits?: number
  shareOfReserve?: number
  recursionScore?: number
  recursionApprox?: boolean
  isAnomalyBorrow: boolean
}

/** One monitored wallet and what it holds — the dashboard's "source of
 *  truth" inventory. `totalUsd` = idle wallet balances + deployed lending
 *  positions (the reserve fund's row folds in its Curve LP; Solana rows
 *  use Ethena's reported USDG value). */
export interface WalletInventoryRow {
  address: string
  chain: "ethereum" | "solana" | "xrpl"
  role: "backing" | "reserve-fund"
  /** What Ethena's API associates this address with — counterparty name
   *  (Aave / Morpho / Kamino / Jupiter) or strategy (Liquid Stables).
   *  Undefined when the address isn't disclosed in Ethena's API. */
  apiLabel?: string
  /** Known on-chain identity from Ethena's attestation reports
   *  (e.g. "USDe MintRedeem contract"). Undefined when no curated label. */
  label?: string
  totalUsd: number
}

export interface FootprintResult {
  rows: FootprintRow[]
  freshness: string | undefined
  failedWallets: string[]
  failedMarkets: string[]
  failedMorpho: string[]
  /** Solana protocols that returned an error (e.g. ["kamino"]). Empty
   *  array when no snapshot was passed or both succeeded. */
  failedSolana: string[]
  /** Sources that errored while reading Solana balances (RPC / price).
   *  Empty when all succeeded. */
  failedSolanaBalances: string[]
  /** Per-wallet inventory — every monitored address + its $ holdings. */
  walletInventory: WalletInventoryRow[]
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
  /** True recursion share = recursiveUsd / (deployed + idle). Headline figure
   *  on View A — the share of Ethena's total backing tied up in recursive
   *  loops, accounting for the idle reserves that don't lever anything. */
  trueRecursionShare: number
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

export async function loadFootprint(opts: FootprintOptions = {}): Promise<FootprintResult> {
  // Use allSettled so a single fetcher's failure (e.g. TokenLogic returning
  // an unexpected shape, or transient rate-limiting on Vercel egress IPs)
  // doesn't take down the entire dashboard. Each fetcher already has internal
  // partial-failure tolerance for its own fan-out; this is the *outer* safety
  // net. Without it, getEthenaPositions throwing "all 11 wallet fetches
  // failed" propagates to the page and triggers error.tsx.
  const settled = await Promise.allSettled([
    getEthenaPositions(),
    getMarketAggregates(),
    getEthenaMorphoPositions(),
    getEthenaIdleBalances(),
    getEthenaRlusdHoldings(),
    getEthenaSolanaIdleBalances(),
  ])

  const safeUnwrap = <T>(idx: number, name: string, fallback: T): T => {
    const r = settled[idx]!
    if (r.status === "fulfilled") return r.value as T
    const reason = r.reason instanceof Error ? r.reason.message : String(r.reason)
    console.warn(`[ethena-flow-monitor] ${name} fetcher threw: ${reason}`)
    return fallback
  }

  const { rows: aavePositions, failedWallets } = safeUnwrap<EthenaPositionsResult>(
    0,
    "getEthenaPositions",
    { rows: [], failedWallets: [] },
  )
  const aggregatesByKey = safeUnwrap<Map<string, MarketReserve>>(
    1,
    "getMarketAggregates",
    new Map(),
  )
  const { positions: morphoPositions, failedWallets: failedMorpho } =
    safeUnwrap<EthenaMorphoResult>(2, "getEthenaMorphoPositions", {
      positions: [],
      failedWallets: [],
    })
  const idleRaw = safeUnwrap(3, "getEthenaIdleBalances", {
    rows: [],
    totalUsd: 0,
    reserveFundRows: [],
    reserveFundTotalUsd: 0,
    walletIdleUsd: [],
    failures: [],
    uncoveredChains: [],
  } as IdleBalanceResult)
  const rlusd = safeUnwrap<XrplRlusdResult>(4, "getEthenaRlusdHoldings", {
    totalUsd: 0,
    wallets: [],
  })
  const solanaIdle = safeUnwrap(5, "getEthenaSolanaIdleBalances", {
    rows: [],
    totalUsd: 0,
    walletTotalUsd: [],
    failures: [],
  } as import("@/lib/solana/balances").SolanaIdleResult)
  const failedSolanaBalances = solanaIdle.failures.map((f) => f.source)

  // RLUSD (XRPL) and Solana idle-bucket balances are off-the-EVM-chain idle
  // backing — fold them into the idle result so they count toward total
  // backing and flow into the reconciliation by symbol. (Solana DEPLOYED-bucket
  // holdings like jleUSDG are deliberately NOT here — they live in the wallet
  // inventory only, see below, to avoid double-counting the Jupiter row.)
  const extraRows: IdleBalanceRow[] = [...solanaIdle.rows]
  if (rlusd.totalUsd > 0) {
    extraRows.push({ symbol: "RLUSD", totalUsd: rlusd.totalUsd, isErc4626: false })
  }
  const idle: IdleBalanceResult =
    extraRows.length > 0
      ? {
          ...idleRaw,
          rows: [...idleRaw.rows, ...extraRows].sort((a, b) => b.totalUsd - a.totalUsd),
          totalUsd: idleRaw.totalUsd + extraRows.reduce((a, r) => a + r.totalUsd, 0),
        }
      : idleRaw

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

  // ───────────────────── Solana (Kamino + Jupiter Lend)

  let failedSolana: string[] = []
  if (opts.ethenaSnapshot) {
    const solana = await getEthenaSolanaPositions(opts.ethenaSnapshot).catch((err) => {
      console.warn(`[ethena-flow-monitor] solana orchestrator threw: ${err instanceof Error ? err.message : String(err)}`)
      return { rows: [], failed: ["solana"] }
    })
    failedSolana = solana.failed
    for (const row of solana.rows) {
      out.push(row)
      // Solana rows feed the same weighted-recursion average as Aave / Morpho
      // so the headline "Recursion (deployed)" reflects them too.
      weightedNumerator += row.ethenaSuppliedUsd * (row.recursionScore ?? 0)
      weightedDenominator += row.ethenaSuppliedUsd
    }
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
  const totalBacking = deployedUsd + idle.totalUsd
  const trueRecursionShare =
    totalBacking > 0 ? clamp(recursiveUsd / totalBacking) : 0

  // ───────────────────── Monitored-wallet inventory

  // Deployed $ per wallet: Aave supply (TokenLogic) + Morpho supply.
  const deployedByWallet = new Map<string, number>()
  for (const p of aavePositions) {
    if (!isEthenaWallet(p.userAddress)) continue
    const w = p.userAddress.toLowerCase()
    deployedByWallet.set(w, (deployedByWallet.get(w) ?? 0) + p.totalSupplyUsd)
  }
  for (const p of morphoPositions) {
    const w = p.walletAddress.toLowerCase()
    deployedByWallet.set(w, (deployedByWallet.get(w) ?? 0) + p.ethenaSuppliedUsd)
  }
  const idleByWallet = new Map(
    idle.walletIdleUsd.map((w) => [w.address.toLowerCase(), w.idleUsd]),
  )

  // From Ethena's snapshot: what each address is labelled as (counterparty,
  // else strategy) and the Solana wallet's USDG holdings. Solana addresses
  // are case-sensitive base58 — never lowercased; EVM addresses from the
  // API arrive lowercased and match config/wallets.ts as-is.
  const apiLabels = new Map<string, string>()
  const solanaWallets: WalletInventoryRow[] = []
  if (opts.ethenaSnapshot) {
    const flat = flattenWallets(opts.ethenaSnapshot)
    const ctx = new Map<string, { cps: Set<string>; strategies: Set<string> }>()
    for (const f of flat) {
      const e = ctx.get(f.address) ?? { cps: new Set(), strategies: new Set() }
      if (f.counterparty) e.cps.add(f.counterparty)
      e.strategies.add(f.strategy)
      ctx.set(f.address, e)
    }
    for (const [addr, e] of ctx) {
      apiLabels.set(addr, e.cps.size > 0 ? [...e.cps].join(", ") : [...e.strategies].join(", "))
    }
  }

  // Solana wallet inventory driven by on-chain totals from solanaIdle (which
  // covers both idle-bucket and deployed-bucket holdings per wallet). apiLabel
  // is derived from the snapshot when available; totalUsd is always on-chain.
  const solTotalByAddr = new Map(
    solanaIdle.walletTotalUsd.map((w) => [w.address, w.totalUsd]),
  )
  for (const address of SOLANA_WALLETS) {
    solanaWallets.push({
      address,
      chain: "solana",
      role: "backing",
      apiLabel: apiLabels.get(address),
      label: KNOWN_SOLANA_WALLET_LABELS[address],
      totalUsd: solTotalByAddr.get(address) ?? 0,
    })
  }

  const walletInventory: WalletInventoryRow[] = [
    ...ETHENA_WALLETS.map((address): WalletInventoryRow => {
      const w = address.toLowerCase()
      return {
        address,
        chain: "ethereum",
        role: "backing",
        apiLabel: apiLabels.get(w),
        label: KNOWN_WALLET_LABELS[w],
        totalUsd: (idleByWallet.get(w) ?? 0) + (deployedByWallet.get(w) ?? 0),
      }
    }),
    // Reserve fund: its dust-filtered stablecoins + Curve LP.
    {
      address: RESERVE_FUND_WALLET,
      chain: "ethereum",
      role: "reserve-fund",
      apiLabel: apiLabels.get(RESERVE_FUND_WALLET.toLowerCase()),
      label: KNOWN_WALLET_LABELS[RESERVE_FUND_WALLET.toLowerCase()],
      totalUsd: idle.reserveFundTotalUsd,
    } satisfies WalletInventoryRow,
    ...solanaWallets,
    // XRPL wallets holding RLUSD — identified by us, not in Ethena's API
    // addressEntries, but the RLUSD asset itself is disclosed under Liquid
    // Stables.
    ...rlusd.wallets
      .filter((w) => w.rlusdUsd > 0)
      .map(
        (w): WalletInventoryRow => ({
          address: w.address,
          chain: "xrpl",
          role: "backing",
          apiLabel: "Liquid Stables",
          totalUsd: w.rlusdUsd,
        }),
      ),
  ].sort((a, b) => b.totalUsd - a.totalUsd)

  return {
    rows,
    freshness,
    failedWallets,
    failedMarkets,
    failedMorpho,
    failedSolana,
    failedSolanaBalances,
    walletInventory,
    weightedRecursion,
    weightedRecursionApprox: weightedAnyApprox,
    deployedUsd,
    idle,
    recursiveUsd,
    trueRecursionShare,
  }
}
