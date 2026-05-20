import { z } from "zod"
import { kaminoFetch } from "./client"

/** Kamino's Ethena Prime kvault (Sentora-managed USDG lender, deployed 6 May 2026). */
export const KAMINO_ETHENA_PRIME_VAULT = "D1XVxx4ur7kiSgpuerUmoJXvZ3yEBFZWPx1uN7qBADFb"

/** Kamino's "Ethena Market" - the isolated USDe/USDG lending market the kvault routes 100% to. */
export const KAMINO_ETHENA_MARKET = "BJnbcRHqvppTyGesLzWASGKnmnF1wq9jZu6ExrjT7wvF"

/** Kamino emits APYs and prices as decimal strings ("0.0214463…"). Coerce to number. */
const NumericString = z
  .union([z.number(), z.string()])
  .transform((v) => (typeof v === "number" ? v : Number(v)))

const KvaultMetrics = z.object({
  apy: NumericString,
  apy24h: NumericString,
  apy7d: NumericString,
  apy30d: NumericString,
  tokenPrice: NumericString,
  tokensInvested: NumericString,
  tokensInvestedUsd: NumericString,
  tokensAvailable: NumericString,
  tokensAvailableUsd: NumericString,
  sharePrice: NumericString,
  numberOfHolders: z.number(),
  sharesIssued: NumericString,
})

export type KvaultMetrics = z.infer<typeof KvaultMetrics>

const ReserveMetrics = z.object({
  reserve: z.string(),
  liquidityToken: z.string(),
  liquidityTokenMint: z.string(),
  maxLtv: NumericString,
  borrowApy: NumericString,
  supplyApy: NumericString,
  totalSupply: NumericString,
  totalBorrow: NumericString,
  totalSupplyUsd: NumericString,
  totalBorrowUsd: NumericString,
})

export type KaminoReserve = z.infer<typeof ReserveMetrics>

const ReserveMetricsArray = z.array(ReserveMetrics)

export async function fetchEthenaPrimeVaultMetrics(): Promise<KvaultMetrics> {
  const raw = await kaminoFetch(`/kvaults/${KAMINO_ETHENA_PRIME_VAULT}/metrics`)
  return KvaultMetrics.parse(raw)
}

export async function fetchEthenaMarketReserves(): Promise<KaminoReserve[]> {
  const raw = await kaminoFetch(`/kamino-market/${KAMINO_ETHENA_MARKET}/reserves/metrics`)
  return ReserveMetricsArray.parse(raw)
}

/**
 * Recursion score for the Ethena Market: share of borrowed dollars that come
 * from positions collateralised by Ethena-stack assets (USDe + sUSDe).
 *
 * The market is structurally isolated — only USDe / sUSDe have maxLtv > 0 —
 * so this is mechanically ~100% whenever there's any borrow activity. We
 * compute it from the live reserve state rather than hard-coding 1.0 so that
 * if Kamino ever broadens the collateral set, the score reflects it.
 */
export function computeKaminoRecursion(reserves: KaminoReserve[]): number {
  const totalBorrowUsd = reserves.reduce((s, r) => s + r.totalBorrowUsd, 0)
  if (totalBorrowUsd <= 0) return 0
  const ethenaCollateralUsd = reserves
    .filter((r) => r.maxLtv > 0 && (r.liquidityToken === "USDe" || r.liquidityToken === "sUSDe"))
    .reduce((s, r) => s + r.totalSupplyUsd, 0)
  const ethenaAcceptingCollateralUsd = reserves
    .filter((r) => r.maxLtv > 0)
    .reduce((s, r) => s + r.totalSupplyUsd, 0)
  if (ethenaAcceptingCollateralUsd <= 0) return 0
  // collateral_share × min(1, borrow_share) — collateral can only back debt
  // up to the maxLtv weighted by total accepted collateral.
  return Math.min(1, ethenaCollateralUsd / ethenaAcceptingCollateralUsd)
}
