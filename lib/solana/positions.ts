import type { BackingSnapshot } from "@/lib/ethena"
import type { FootprintRow } from "@/lib/views/footprint"
import {
  fetchEthenaMarketReserves,
  fetchEthenaPrimeVaultMetrics,
  computeKaminoRecursion,
  KAMINO_ETHENA_MARKET,
  KAMINO_ETHENA_PRIME_VAULT,
} from "./kamino"
import {
  fetchEthenaBorrowingVaults,
  fetchEthenaLendingTokens,
  computeJupiterRecursion,
  JUPITER_ETHENA_LENDING_VAULT,
} from "./fluid"

export interface SolanaPositionsResult {
  rows: FootprintRow[]
  /** Names of Solana sources we tried but couldn't read. Partial-data tolerant: a
   *  Kamino API outage shouldn't blank out Jupiter and vice versa. */
  failed: string[]
}

/**
 * Build FootprintRows for Ethena's Solana DeFi-Lending positions on Kamino
 * (Ethena Prime kvault) and Jupiter Lend (Bitwise × Ethena lending vault).
 *
 * Position size comes from Ethena's own API — they're authoritative about
 * how much treasury sits in each venue. We enrich each row with live market
 * context (utilization, reserve totals, recursion score) by calling each
 * protocol's public REST API.
 *
 * If Ethena's API doesn't list one of the two venues (e.g. an unwind), we
 * silently emit zero rows for it — there's nothing to display.
 */
export async function getEthenaSolanaPositions(
  snapshot: BackingSnapshot,
): Promise<SolanaPositionsResult> {
  const rows: FootprintRow[] = []
  const failed: string[] = []

  const ethenaSolanaLegs = extractSolanaLegs(snapshot)

  const [kaminoRes, jupiterRes] = await Promise.allSettled([
    buildKaminoRow(ethenaSolanaLegs.kaminoUsd),
    buildJupiterRow(ethenaSolanaLegs.jupiterUsd),
  ])
  if (kaminoRes.status === "fulfilled") {
    if (kaminoRes.value) rows.push(kaminoRes.value)
  } else {
    failed.push("kamino")
    console.warn(`[ethena-flow-monitor] kamino fetch failed: ${reasonOf(kaminoRes.reason)}`)
  }
  if (jupiterRes.status === "fulfilled") {
    if (jupiterRes.value) rows.push(jupiterRes.value)
  } else {
    failed.push("jupiter-lend")
    console.warn(`[ethena-flow-monitor] jupiter fetch failed: ${reasonOf(jupiterRes.reason)}`)
  }
  return { rows, failed }
}

function extractSolanaLegs(snapshot: BackingSnapshot): { kaminoUsd: number; jupiterUsd: number } {
  let kaminoUsd = 0
  let jupiterUsd = 0
  for (const strategy of snapshot.strategies) {
    if (strategy.strategy !== "DeFi Lending") continue
    for (const cp of strategy.counterparties) {
      if (cp.counterparty === "Kamino") kaminoUsd += cp.value
      else if (cp.counterparty === "Jupiter") jupiterUsd += cp.value
    }
  }
  return { kaminoUsd, jupiterUsd }
}

async function buildKaminoRow(ethenaUsd: number): Promise<FootprintRow | null> {
  if (ethenaUsd <= 0) return null
  const [vault, reserves] = await Promise.all([
    fetchEthenaPrimeVaultMetrics(),
    fetchEthenaMarketReserves(),
  ])
  const usdgReserve = reserves.find((r) => r.liquidityToken === "USDG")
  const totalUsdgSuppliedUsd = usdgReserve?.totalSupplyUsd ?? vault.tokensInvestedUsd
  return {
    protocol: "KAMINO",
    chain: "solana",
    marketKey: `kamino:${KAMINO_ETHENA_MARKET}`,
    reserveSymbol: "USDG",
    vaultName: "Ethena Prime (Sentora)",
    vaultAddress: KAMINO_ETHENA_PRIME_VAULT,
    ethenaSuppliedUsd: ethenaUsd,
    reserveAggregateDeposits: totalUsdgSuppliedUsd,
    shareOfReserve: totalUsdgSuppliedUsd > 0 ? Math.min(1, ethenaUsd / totalUsdgSuppliedUsd) : undefined,
    recursionScore: computeKaminoRecursion(reserves),
    recursionApprox: false,
    isAnomalyBorrow: false,
  }
}

async function buildJupiterRow(ethenaUsd: number): Promise<FootprintRow | null> {
  if (ethenaUsd <= 0) return null
  const [lending, borrowing] = await Promise.all([
    fetchEthenaLendingTokens(),
    fetchEthenaBorrowingVaults(),
  ])
  const usdgLending = lending.find((t) => t.address === JUPITER_ETHENA_LENDING_VAULT) ?? lending[0]
  if (!usdgLending) return null
  const price = usdgLending.asset.price ?? 1
  const totalAssets = (usdgLending.totalAssets ?? 0) / 10 ** usdgLending.decimals
  const totalSuppliedUsd = totalAssets * price
  return {
    protocol: "JUPITER LEND",
    chain: "solana",
    marketKey: `jup-lend:${JUPITER_ETHENA_LENDING_VAULT}`,
    reserveSymbol: "USDG",
    vaultName: "Bitwise × Ethena (Fluid)",
    vaultAddress: JUPITER_ETHENA_LENDING_VAULT,
    ethenaSuppliedUsd: ethenaUsd,
    reserveAggregateDeposits: totalSuppliedUsd,
    shareOfReserve: totalSuppliedUsd > 0 ? Math.min(1, ethenaUsd / totalSuppliedUsd) : undefined,
    recursionScore: computeJupiterRecursion(borrowing, usdgLending),
    recursionApprox: false,
    isAnomalyBorrow: false,
  }
}

function reasonOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
