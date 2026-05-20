import {
  fetchEthenaMarketReserves,
  fetchEthenaPrimeVaultMetrics,
  KAMINO_ETHENA_MARKET,
  KAMINO_ETHENA_PRIME_VAULT,
  type KaminoReserve,
} from "@/lib/solana/kamino"
import {
  fetchEthenaBorrowingVaults,
  fetchEthenaLendingTokens,
  JUPITER_ETHENA_LENDING_VAULT,
  type FluidBorrowingVault,
  type FluidLendingToken,
} from "@/lib/solana/fluid"
import { fetchBackingAssets, type BackingSnapshot } from "@/lib/ethena"

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

/** Per-reserve / per-pair row used in the composition table. Same shape for
 *  both Kamino reserves and Fluid borrow vaults so the UI can render either
 *  with one component. */
export interface SolanaReserveRow {
  /** Human label e.g. "USDe", "USDe → USDG". */
  label: string
  /** Reserve / vault pubkey for `shortAddr`. */
  address: string
  /** Whether this row is the asset being borrowed out of the vault we're
   *  drilling into (the USDG reserve on Kamino; the USDe→USDG vault on
   *  Jupiter). The UI badges this row as the "active recursion leg". */
  isOutflowLeg: boolean
  /** $ supplied as collateral in this row. */
  supplyUsd: number
  /** $ currently borrowed out of this row. */
  borrowUsd: number
  /** Utilization ∈ [0, 1]. */
  utilization: number
  /** Annualised supply rate as a fraction (0.0214 = 2.14%). */
  supplyApy: number
  /** Annualised borrow rate as a fraction. */
  borrowApy: number
  /** maxLtv / collateralFactor (0.92 = 92%). 0 means non-collateral. */
  maxLtv: number
  /** Liquidation threshold ∈ [0,1]. Null when not applicable (Kamino reserves
   *  don't expose this in the metrics endpoint). */
  liquidationThreshold: number | null
  /** Number of open positions, if exposed by the source API. */
  positions: number | null
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
  /** vault-level utilization: borrowed / supplied. For Kamino kvault we use
   *  the USDG-reserve utilization on the routed market; for Jupiter the
   *  jleUSDG lending utilization. */
  utilization: number
  /** Vault supply APY paid to lenders. */
  supplyApy: number
  /** $ share of borrows in the underlying market that are collateralised by
   *  Ethena-stack assets (USDe / sUSDe). Mechanically 100% for both Ethena
   *  Prime markets; we compute it so the UI doesn't lie if the venue
   *  broadens collateral. */
  marketRecursionShare: number
  /** ethena_share × market_recursion — the headline figure mirroring Morpho's
   *  recursionScore semantics. */
  recursionScore: number
  /** Underlying market reserves / borrow pairs. */
  composition: SolanaReserveRow[]
  /** External canonical URL for the protocol's own UI, surfaced as a link. */
  externalUrl: string
}

const clamp = (n: number) => Math.max(0, Math.min(1, n))

/** Fluid encodes rates as bps × 100 (392 → 3.92%). */
const fluidRate = (raw: number) => raw / 10_000

/** Convert a raw token amount (base units) into USD. */
const toUsd = (raw: number, decimals: number, price = 1) => (raw / 10 ** decimals) * price

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

  const composition: SolanaReserveRow[] = reserves
    .map((r): SolanaReserveRow => ({
      label: r.liquidityToken,
      address: r.reserve,
      isOutflowLeg: r.liquidityToken === "USDG",
      supplyUsd: r.totalSupplyUsd,
      borrowUsd: r.totalBorrowUsd,
      utilization: r.totalSupplyUsd > 0 ? clamp(r.totalBorrowUsd / r.totalSupplyUsd) : 0,
      supplyApy: r.supplyApy,
      borrowApy: r.borrowApy,
      maxLtv: r.maxLtv,
      liquidationThreshold: null,
      positions: null,
    }))
    .sort((a, b) => b.supplyUsd - a.supplyUsd)

  const usdgReserve = reserves.find((r) => r.liquidityToken === "USDG")
  const utilization = usdgReserve && usdgReserve.totalSupplyUsd > 0
    ? clamp(usdgReserve.totalBorrowUsd / usdgReserve.totalSupplyUsd)
    : 0

  const marketRecursionShare = computeRecursionFromKaminoReserves(reserves)
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
    recursionScore: ethenaShareOfVault * marketRecursionShare,
    composition,
    externalUrl: `https://kamino.com/borrow/reserve/${KAMINO_ETHENA_MARKET}/${usdgReserve?.reserve ?? ""}`,
  }
}

function computeRecursionFromKaminoReserves(reserves: KaminoReserve[]): number {
  // Share of borrowed dollars in the market that are collateralised by an
  // Ethena-stack asset. Since maxLtv > 0 reserves *are* the collateral set,
  // we reduce to: (Ethena-stack collateral) / (total collateral that accepts
  // any borrowing).
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

  const composition: SolanaReserveRow[] = borrowing
    .map((v): SolanaReserveRow => {
      const supplyUsd = toUsd(
        Number(v.totalSupply ?? 0),
        v.supplyToken.decimals,
        v.supplyToken.price ?? 1,
      )
      const borrowUsd = toUsd(
        Number(v.totalBorrow ?? 0),
        v.borrowToken.decimals,
        v.borrowToken.price ?? 1,
      )
      return {
        label: `${v.supplyToken.symbol} → ${v.borrowToken.symbol}`,
        address: v.address,
        isOutflowLeg:
          v.supplyToken.symbol === "USDe" && v.borrowToken.symbol === "USDG",
        supplyUsd,
        borrowUsd,
        utilization: supplyUsd > 0 ? clamp(borrowUsd / supplyUsd) : 0,
        supplyApy: fluidRate(Number(v.supplyRate)),
        borrowApy: fluidRate(Number(v.borrowRate)),
        maxLtv: Number(v.collateralFactor) / 1000,
        liquidationThreshold: Number(v.liquidationThreshold) / 1000,
        positions: Number((v as FluidBorrowingVault & { totalPositions?: number }).totalPositions ?? 0),
      }
    })
    .sort((a, b) => b.supplyUsd - a.supplyUsd)

  // Utilization of the supply pool: total borrowed against USDG collateral
  // (we treat the supply side as "available USDG" and the sum of USDG-debt
  // vaults' totalBorrow as drained). For practical purposes the USDe→USDG
  // pair alone fully describes it.
  const totalUsdgBorrowedUsd = composition
    .filter((row) => row.label.endsWith("→ USDG"))
    .reduce((s, r) => s + r.borrowUsd, 0)
  const utilization = totalAssetsUsd > 0 ? clamp(totalUsdgBorrowedUsd / totalAssetsUsd) : 0

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
    marketRecursionShare: computeRecursionFromJupiterBorrows(borrowing),
    recursionScore: ethenaShareOfVault * computeRecursionFromJupiterBorrows(borrowing),
    composition,
    externalUrl: "https://jup.ag/lend/ethena/market",
  }
}

function computeRecursionFromJupiterBorrows(vaults: FluidBorrowingVault[]): number {
  // Share of borrowed USDG that's collateralised by USDe / sUSDe.
  const usdgBorrowVaults = vaults.filter((v) => v.borrowToken.symbol === "USDG")
  const totalUsdgBorrowed = usdgBorrowVaults.reduce(
    (s, v) =>
      s +
      toUsd(Number(v.totalBorrow ?? 0), v.borrowToken.decimals, v.borrowToken.price ?? 1),
    0,
  )
  if (totalUsdgBorrowed <= 0) return 0
  const ethenaCollatBorrowed = usdgBorrowVaults
    .filter((v) => v.supplyToken.symbol === "USDe" || v.supplyToken.symbol === "sUSDe")
    .reduce(
      (s, v) =>
        s +
        toUsd(Number(v.totalBorrow ?? 0), v.borrowToken.decimals, v.borrowToken.price ?? 1),
      0,
    )
  return clamp(ethenaCollatBorrowed / totalUsdgBorrowed)
}

export function isSolanaVaultAddress(address: string): boolean {
  return resolveSolanaProtocol(address) !== null
}
