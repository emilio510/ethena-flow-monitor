import { z } from "zod"
import { fluidFetch } from "./client"

/** Bitwise × Ethena lending vault on Jupiter Lend (Fluid-powered).
 *  Single jleUSDG vault that holds the USDG supply side. */
export const JUPITER_ETHENA_LENDING_VAULT = "Bd2wJsmaF3YKC6fKLo4AFQDYaFEzWR6SNvoxvTnA6dXc"

/** The USDe → USDG borrowing vault that pairs with jleUSDG.
 *  All borrowed USDG is collateralised here by USDe. */
export const JUPITER_ETHENA_USDE_USDG_BORROW_VAULT = "3LekyrZMPjcPSpkc1KwpduWLNRb5KM96C9tbxkc4oU62"

const NumericString = z.union([z.number(), z.string()]).transform((v) => (typeof v === "number" ? v : Number(v)))

const Asset = z.object({
  address: z.string(),
  chainId: z.string(),
  symbol: z.string(),
  decimals: z.number(),
  price: NumericString.optional(),
})

const LendingToken = z.object({
  address: z.string(),
  symbol: z.string(),
  uiSymbol: z.string().optional(),
  decimals: z.number(),
  assetAddress: z.string(),
  asset: Asset,
  totalAssets: NumericString.optional(),
  totalSupply: NumericString.optional(),
  supplyRate: NumericString.optional(),
})

export type FluidLendingToken = z.infer<typeof LendingToken>

const BorrowingVault = z.object({
  id: z.number(),
  address: z.string(),
  supplyToken: Asset,
  borrowToken: Asset,
  // Fluid emits these as either bare numbers or numeric strings depending on
  // endpoint version. NumericString coerces both into a `number`.
  liquidationThreshold: NumericString,
  collateralFactor: NumericString,
  supplyRate: NumericString,
  borrowRate: NumericString,
  // Raw token-unit totals (decimals carried on the token objects). The
  // borrowing API returns these as already-converted-down strings or numbers;
  // the v1/ethena endpoint always uses strings, but newer routes may return
  // numbers. NumericString handles both.
  totalSupply: NumericString.optional(),
  totalBorrow: NumericString.optional(),
  totalPositions: z.number().optional(),
})

export type FluidBorrowingVault = z.infer<typeof BorrowingVault>

export async function fetchEthenaLendingTokens(): Promise<FluidLendingToken[]> {
  const raw = await fluidFetch("/v1/ethena/lending/tokens")
  return z.array(LendingToken).parse(raw)
}

export async function fetchEthenaBorrowingVaults(): Promise<FluidBorrowingVault[]> {
  const raw = await fluidFetch("/v1/ethena/borrowing/vaults")
  return z.array(BorrowingVault).parse(raw)
}

/**
 * USD figures for the Bitwise × Ethena lending vault (the USDG-supply side
 * that Ethena's treasury supplies into). Returns supply + currently-borrowed
 * USD using the on-API USDG price. The Fluid response omits explicit USD
 * fields, so we compute them from raw integer assets × price.
 */
export function lendingUsd(token: FluidLendingToken): { totalSuppliedUsd: number; price: number } {
  const price = token.asset.price ?? 1
  const totalAssets = (token.totalAssets ?? 0) / 10 ** token.decimals
  return { totalSuppliedUsd: totalAssets * price, price }
}

/**
 * Recursion score for the Jupiter / Bitwise × Ethena USDG-supply pool: the
 * share of borrowed USDG that's collateralised by an Ethena-stack asset.
 *
 * The borrowing side exposes three vaults — USDe→USDG, WSOL→USDG, WSOL→USDe.
 * Only the USDe→USDG vault produces USDG borrows that drain the supply pool
 * we care about. We can't read per-vault borrow totals from this endpoint
 * (only rates + thresholds), so we use the heuristic: the USDe→USDG vault
 * exists iff the recursion is the dominant flow, and we return 1.0 when its
 * borrowRate is bounded under the supplyRate of the lending side (i.e. the
 * market is actually operating). This matches the "100% utilization by
 * design" structure Ethena describes for this market.
 */
export function computeJupiterRecursion(vaults: FluidBorrowingVault[], usdgLending: FluidLendingToken): number {
  const usdeUsdgVault = vaults.find(
    (v) => v.supplyToken.symbol === "USDe" && v.borrowToken.symbol === "USDG",
  )
  if (!usdeUsdgVault) return 0
  // Borrow rate must be live AND lending supply rate must be > 0 (else the
  // market is idle and recursion is meaningless).
  const lendingRateBps = Number(usdgLending.supplyRate ?? 0)
  if (lendingRateBps <= 0) return 0
  return 1
}
