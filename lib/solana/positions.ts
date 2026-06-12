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

export interface AssetLeg {
  asset: string
  value: number
}

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
    buildKaminoRows(ethenaSolanaLegs.kamino),
    buildJupiterRows(ethenaSolanaLegs.jupiter),
  ])
  if (kaminoRes.status === "fulfilled") {
    rows.push(...kaminoRes.value)
  } else {
    failed.push("kamino")
    console.warn(`[ethena-flow-monitor] kamino fetch failed: ${reasonOf(kaminoRes.reason)}`)
  }
  if (jupiterRes.status === "fulfilled") {
    rows.push(...jupiterRes.value)
  } else {
    failed.push("jupiter-lend")
    console.warn(`[ethena-flow-monitor] jupiter fetch failed: ${reasonOf(jupiterRes.reason)}`)
  }
  return { rows, failed }
}

/** @internal exported for testing */
export function extractSolanaLegs(
  snapshot: BackingSnapshot,
): { kamino: AssetLeg[]; jupiter: AssetLeg[] } {
  const kamino: AssetLeg[] = []
  const jupiter: AssetLeg[] = []
  for (const strategy of snapshot.strategies) {
    if (strategy.strategy !== "DeFi Lending") continue
    for (const cp of strategy.counterparties) {
      if (cp.counterparty === "Kamino") {
        for (const a of cp.assets) {
          kamino.push({ asset: a.asset, value: a.value })
        }
      } else if (cp.counterparty === "Jupiter") {
        for (const a of cp.assets) {
          jupiter.push({ asset: a.asset, value: a.value })
        }
      }
    }
  }
  return { kamino, jupiter }
}

async function buildKaminoRows(legs: AssetLeg[]): Promise<FootprintRow[]> {
  const activeLegs = legs.filter((l) => l.value > 0)
  if (activeLegs.length === 0) return []
  const [vault, reserves] = await Promise.all([
    fetchEthenaPrimeVaultMetrics(),
    fetchEthenaMarketReserves(),
  ])
  const recursionScore = computeKaminoRecursion(reserves)
  return activeLegs.map((leg) => {
    const reserve = reserves.find((r) => r.liquidityToken === leg.asset)
    const reserveAggregateDeposits = reserve?.totalSupplyUsd ?? vault.tokensInvestedUsd
    return {
      protocol: "KAMINO",
      chain: "solana",
      marketKey: `kamino:${KAMINO_ETHENA_MARKET}`,
      reserveSymbol: leg.asset,
      vaultName: "Ethena Prime (Sentora)",
      vaultAddress: KAMINO_ETHENA_PRIME_VAULT,
      ethenaSuppliedUsd: leg.value,
      reserveAggregateDeposits,
      shareOfReserve:
        reserveAggregateDeposits > 0
          ? Math.min(1, leg.value / reserveAggregateDeposits)
          : undefined,
      recursionScore,
      recursionApprox: false,
      isAnomalyBorrow: false,
    }
  })
}

async function buildJupiterRows(legs: AssetLeg[]): Promise<FootprintRow[]> {
  const activeLegs = legs.filter((l) => l.value > 0)
  if (activeLegs.length === 0) return []
  const [lending, borrowing] = await Promise.all([
    fetchEthenaLendingTokens(),
    fetchEthenaBorrowingVaults(),
  ])
  const usdgLending = lending.find((t) => t.address === JUPITER_ETHENA_LENDING_VAULT) ?? lending[0]
  if (!usdgLending) return []
  const price = usdgLending.asset.price ?? 1
  const totalAssets = (usdgLending.totalAssets ?? 0) / 10 ** usdgLending.decimals
  const totalSuppliedUsd = totalAssets * price
  const recursionScore = computeJupiterRecursion(borrowing)
  return activeLegs.map((leg) => ({
    protocol: "JUPITER LEND",
    chain: "solana",
    marketKey: `jup-lend:${JUPITER_ETHENA_LENDING_VAULT}`,
    reserveSymbol: leg.asset,
    vaultName: "Bitwise × Ethena (Fluid)",
    vaultAddress: JUPITER_ETHENA_LENDING_VAULT,
    ethenaSuppliedUsd: leg.value,
    reserveAggregateDeposits: totalSuppliedUsd,
    shareOfReserve:
      totalSuppliedUsd > 0 ? Math.min(1, leg.value / totalSuppliedUsd) : undefined,
    recursionScore,
    recursionApprox: false,
    isAnomalyBorrow: false,
  }))
}

function reasonOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
