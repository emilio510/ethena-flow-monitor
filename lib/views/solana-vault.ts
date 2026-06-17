import {
  computeKaminoUtilization,
  fetchEthenaMarketReserves,
  fetchEthenaPrimeVaultMetrics,
  KAMINO_ETHENA_MARKET,
  KAMINO_ETHENA_PRIME_VAULT,
  type KaminoReserve,
} from "@/lib/solana/kamino"
import {
  fetchEthenaBorrowingVaults,
  fetchEthenaLendingTokens,
  computeJupiterRecursion,
  totalUsdgBorrowedUsd,
  JUPITER_ETHENA_LENDING_VAULT,
} from "@/lib/solana/fluid"
import { fetchBackingAssets, type BackingSnapshot } from "@/lib/ethena"
import { recursionMetrics } from "@/lib/recursion/metrics"

export type SolanaProtocol = "KAMINO" | "JUPITER LEND"

export class SolanaVaultNotFoundError extends Error {
  constructor(public address: string) {
    super(`Solana vault not found: ${address}`)
    this.name = "SolanaVaultNotFoundError"
  }
}

/**
 * Route a vault address to its Solana protocol. Today both Ethena-related
 * markets are 1-vault-per-protocol so this is just an address match; broaden
 * if Ethena adds more Solana venues.
 */
export function resolveSolanaProtocol(address: string): SolanaProtocol | null {
  if (address === KAMINO_ETHENA_PRIME_VAULT) return "KAMINO"
  if (address === JUPITER_ETHENA_LENDING_VAULT) return "JUPITER LEND"
  return null
}

/**
 * Composition rows come in two shapes — and conflating them was a real bug:
 *
 *  - "reserve" (Kamino): a single-token lending reserve. `utilization`
 *    (borrow ÷ supply) is the meaningful metric.
 *  - "pair" (Jupiter/Fluid): a collateral → debt vault. borrow ÷ supply here
 *    is NOT utilization — it's the aggregate **current LTV** (debt ÷
 *    collateral). From it + the liquidation threshold we derive the market's
 *    average health factor and leverage.
 */
export type SolanaRowKind = "reserve" | "pair"

export interface SolanaCompositionRow {
  kind: SolanaRowKind
  /** "USDe" (reserve) or "USDe → USDG" (pair). */
  label: string
  /** Reserve / vault pubkey. */
  address: string
  /** The leg where USDG actually leaves the vault we're drilling into. */
  isOutflowLeg: boolean
  /** reserve: token supplied · pair: collateral supplied (USD). */
  supplyUsd: number
  /** reserve: token borrowed · pair: debt borrowed (USD). */
  borrowUsd: number
  supplyApy: number
  borrowApy: number
  /** reserve maxLtv · pair collateralFactor (0.92 = 92%). */
  maxLtv: number
  /** pair only — liquidation threshold (0.94). null for reserves. */
  liquidationThreshold: number | null
  /** pair only — open borrower positions. null for reserves. */
  positions: number | null
  /** reserve only — borrow ÷ supply utilization. null for pairs. */
  utilization: number | null
  /** pair only — debt ÷ collateral aggregate LTV. null for reserves. */
  currentLtv: number | null
  /** pair only — liqThreshold ÷ currentLtv; > 1 is healthy. null otherwise. */
  healthFactor: number | null
  /** pair only — collateral ÷ (collateral − debt), aggregate loop leverage. */
  leverage: number | null
}

export interface SolanaVaultView {
  protocol: SolanaProtocol
  address: string
  name: string
  underlyingSymbol: string
  /** Total $ supplied into this vault (Ethena + any other LPs). */
  totalAssetsUsd: number
  /** $ Ethena's treasury attributes to this vault (from app.ethena.fi/api). */
  ethenaSuppliedUsd: number
  /** ethena / total clamped to [0,1]. */
  ethenaShareOfVault: number
  /** Vault-level utilization: how much of the supplied USDG is borrowed. */
  utilization: number
  /** Vault supply APY paid to lenders. */
  supplyApy: number
  /** $ share of borrows in the underlying market collateralised by Ethena
   *  stack (USDe / sUSDe) — mechanically ~100% for both Ethena Prime
   *  markets; computed live so the UI doesn't lie if collateral broadens. */
  marketRecursionShare: number
  /** ethena_share × market_recursion — mirrors Morpho's recursionScore. */
  recursionScore: number
  /** Concentration: ethenaShareOfVault × marketRecursionShare. Display-only. */
  closedLoopShare: number
  /** Underlying market reserves (Kamino) or borrow pairs (Jupiter). */
  composition: SolanaCompositionRow[]
  /** External canonical URL for the protocol's own UI. */
  externalUrl: string
}

const clamp = (n: number) => Math.max(0, Math.min(1, n))

/** Fluid encodes rates as bps × 100 (392 → 3.92%). */
const fluidRate = (raw: number) => raw / 10_000

/** Convert a raw token amount (base units) into USD. */
const toUsd = (raw: number, decimals: number, price = 1) => (raw / 10 ** decimals) * price

/**
 * Rows below this USD size are dust — config'd reserves with cents in them,
 * not real exposure. Both Ethena markets are effectively isolated USDe/USDG,
 * so this filter collapses the table to the assets that actually matter.
 */
const MIN_ROW_USD = 1_000_000

/** Aggregate-position risk metrics for a collateral → debt pair. */
function pairRisk(collateralUsd: number, debtUsd: number, liqThreshold: number) {
  const currentLtv = collateralUsd > 0 ? debtUsd / collateralUsd : 0
  const healthFactor = currentLtv > 0 ? liqThreshold / currentLtv : null
  const equity = collateralUsd - debtUsd
  // Loop leverage: how many times the equity is multiplied into collateral.
  const leverage = equity > 0 ? collateralUsd / equity : null
  return { currentLtv, healthFactor, leverage }
}

export async function loadSolanaVaultView(address: string): Promise<SolanaVaultView> {
  const protocol = resolveSolanaProtocol(address)
  if (!protocol) throw new SolanaVaultNotFoundError(address)
  const snapshot = await fetchBackingAssets()
  if (protocol === "KAMINO") return loadKaminoView(snapshot)
  return loadJupiterView(snapshot)
}

function ethenaUsdForCounterparty(snapshot: BackingSnapshot, counterparty: string): number {
  let total = 0
  for (const s of snapshot.strategies) {
    if (s.strategy !== "DeFi Lending") continue
    for (const cp of s.counterparties) {
      if (cp.counterparty === counterparty) total += cp.value
    }
  }
  return total
}

async function loadKaminoView(snapshot: BackingSnapshot): Promise<SolanaVaultView> {
  const [vault, reserves] = await Promise.all([
    fetchEthenaPrimeVaultMetrics(),
    fetchEthenaMarketReserves(),
  ])
  const ethenaSuppliedUsd = ethenaUsdForCounterparty(snapshot, "Kamino")
  const totalAssetsUsd = vault.tokensInvestedUsd + vault.tokensAvailableUsd
  const ethenaShareOfVault = totalAssetsUsd > 0 ? clamp(ethenaSuppliedUsd / totalAssetsUsd) : 0

  // One row per reserve, dust filtered — the Ethena Market config lists six
  // reserves but only USDe (collateral) and USDG (debt) carry real size.
  const composition: SolanaCompositionRow[] = reserves
    .filter((r) => r.totalSupplyUsd >= MIN_ROW_USD)
    .map((r): SolanaCompositionRow => ({
      kind: "reserve",
      label: r.liquidityToken,
      address: r.reserve,
      isOutflowLeg: r.liquidityToken === "USDG",
      supplyUsd: r.totalSupplyUsd,
      borrowUsd: r.totalBorrowUsd,
      supplyApy: r.supplyApy,
      borrowApy: r.borrowApy,
      maxLtv: r.maxLtv,
      liquidationThreshold: null,
      positions: null,
      utilization: r.totalSupplyUsd > 0 ? clamp(r.totalBorrowUsd / r.totalSupplyUsd) : 0,
      currentLtv: null,
      healthFactor: null,
      leverage: null,
    }))
    .sort((a, b) => b.supplyUsd - a.supplyUsd)

  const usdgReserve = reserves.find((r) => r.liquidityToken === "USDG")
  // Debt-weighted across the reserves that actually carry borrows, so the
  // single vault-level utilization follows the USDG → PYUSD lent-asset rotation
  // instead of pinning to one hard-coded reserve.
  const utilization = computeKaminoUtilization(reserves)

  const marketRecursionShare = computeRecursionFromKaminoReserves(reserves)
  const { exposureScore, closedLoopShare } = recursionMetrics(
    ethenaShareOfVault,
    marketRecursionShare,
    utilization,
  )
  return {
    protocol: "KAMINO",
    address: KAMINO_ETHENA_PRIME_VAULT,
    name: "Ethena Prime (Sentora)",
    underlyingSymbol: "USDG",
    totalAssetsUsd,
    ethenaSuppliedUsd,
    ethenaShareOfVault,
    utilization,
    supplyApy: vault.apy,
    marketRecursionShare,
    recursionScore: exposureScore,
    closedLoopShare,
    composition,
    externalUrl: `https://kamino.com/borrow/reserve/${KAMINO_ETHENA_MARKET}/${usdgReserve?.reserve ?? ""}`,
  }
}

function computeRecursionFromKaminoReserves(reserves: KaminoReserve[]): number {
  // Share of borrowed dollars in the market collateralised by an Ethena-stack
  // asset. Since maxLtv > 0 reserves *are* the collateral set, this reduces
  // to (Ethena-stack collateral) / (total collateral that accepts borrowing).
  const collateralReserves = reserves.filter((r) => r.maxLtv > 0)
  const totalCollateralUsd = collateralReserves.reduce((s, r) => s + r.totalSupplyUsd, 0)
  if (totalCollateralUsd <= 0) return 0
  const ethenaCollateralUsd = collateralReserves
    .filter((r) => r.liquidityToken === "USDe" || r.liquidityToken === "sUSDe")
    .reduce((s, r) => s + r.totalSupplyUsd, 0)
  return clamp(ethenaCollateralUsd / totalCollateralUsd)
}

async function loadJupiterView(snapshot: BackingSnapshot): Promise<SolanaVaultView> {
  const [lending, borrowing] = await Promise.all([
    fetchEthenaLendingTokens(),
    fetchEthenaBorrowingVaults(),
  ])
  const jleUsdg = lending.find((t) => t.address === JUPITER_ETHENA_LENDING_VAULT) ?? lending[0]
  if (!jleUsdg) throw new SolanaVaultNotFoundError(JUPITER_ETHENA_LENDING_VAULT)

  const price = jleUsdg.asset.price ?? 1
  const totalAssets = (jleUsdg.totalAssets ?? 0) / 10 ** jleUsdg.decimals
  const totalAssetsUsd = totalAssets * price

  const ethenaSuppliedUsd = ethenaUsdForCounterparty(snapshot, "Jupiter")
  const ethenaShareOfVault = totalAssetsUsd > 0 ? clamp(ethenaSuppliedUsd / totalAssetsUsd) : 0

  // Only borrow vaults that draw USDG drain this supply pool. WSOL → USDe,
  // for instance, is a separate market and doesn't belong in this table.
  const usdgBorrowVaults = borrowing.filter((v) => v.borrowToken.symbol === "USDG")

  const composition: SolanaCompositionRow[] = usdgBorrowVaults
    .map((v): SolanaCompositionRow => {
      const collateralUsd = toUsd(
        Number(v.totalSupply ?? 0),
        v.supplyToken.decimals,
        v.supplyToken.price ?? 1,
      )
      const debtUsd = toUsd(
        Number(v.totalBorrow ?? 0),
        v.borrowToken.decimals,
        v.borrowToken.price ?? 1,
      )
      const liquidationThreshold = Number(v.liquidationThreshold) / 1000
      const { currentLtv, healthFactor, leverage } = pairRisk(
        collateralUsd,
        debtUsd,
        liquidationThreshold,
      )
      return {
        kind: "pair",
        label: `${v.supplyToken.symbol} → ${v.borrowToken.symbol}`,
        address: v.address,
        isOutflowLeg: v.supplyToken.symbol === "USDe" && v.borrowToken.symbol === "USDG",
        supplyUsd: collateralUsd,
        borrowUsd: debtUsd,
        supplyApy: fluidRate(Number(v.supplyRate)),
        borrowApy: fluidRate(Number(v.borrowRate)),
        maxLtv: Number(v.collateralFactor) / 1000,
        liquidationThreshold,
        positions: Number(v.totalPositions ?? 0),
        utilization: null,
        currentLtv,
        healthFactor,
        leverage,
      }
    })
    .filter((row) => row.borrowUsd >= MIN_ROW_USD)
    .sort((a, b) => b.borrowUsd - a.borrowUsd)

  // Vault-level utilization: total USDG borrowed across all USDG-debt vaults
  // ÷ the supply pool. Mechanically ~100% — the IRM keeps it pinned there.
  const utilization =
    totalAssetsUsd > 0 ? clamp(totalUsdgBorrowedUsd(borrowing) / totalAssetsUsd) : 0

  const marketRecursionShare = computeJupiterRecursion(borrowing)
  const { exposureScore, closedLoopShare } = recursionMetrics(
    ethenaShareOfVault,
    marketRecursionShare,
    utilization,
  )
  return {
    protocol: "JUPITER LEND",
    address: JUPITER_ETHENA_LENDING_VAULT,
    name: "Bitwise × Ethena (Fluid)",
    underlyingSymbol: jleUsdg.asset.symbol,
    totalAssetsUsd,
    ethenaSuppliedUsd,
    ethenaShareOfVault,
    utilization,
    supplyApy: fluidRate(Number(jleUsdg.supplyRate ?? 0)),
    marketRecursionShare,
    recursionScore: exposureScore,
    closedLoopShare,
    composition,
    externalUrl: "https://jup.ag/lend/ethena/market",
  }
}

export function isSolanaVaultAddress(address: string): boolean {
  return resolveSolanaProtocol(address) !== null
}

/** Exported for tests — aggregate-position risk math. */
export { pairRisk }
