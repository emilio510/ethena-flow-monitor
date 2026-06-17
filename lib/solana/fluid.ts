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

/** Total USDG currently borrowed across all USDG-debt vaults, in USD. */
export function totalUsdgBorrowedUsd(vaults: FluidBorrowingVault[]): number {
  return vaults
    .filter((v) => v.borrowToken.symbol === "USDG")
    .reduce(
      (s, v) =>
        s +
        (Number(v.totalBorrow ?? 0) / 10 ** v.borrowToken.decimals) *
          (v.borrowToken.price ?? 1),
      0,
    )
}

/**
 * Recursion score for the Jupiter / Bitwise × Ethena USDG-supply pool: the
 * share of borrowed USDG that's collateralised by an Ethena-stack asset.
 *
 * The borrowing endpoint exposes per-vault `totalBorrow`, so this is the
 * actual dollar ratio — not an approximation. Single source of truth for
 * Jupiter recursion, used by both the footprint row and the vault drilldown.
 */
export function computeJupiterRecursion(vaults: FluidBorrowingVault[]): number {
  // Share of borrowed USDG collateralised by an Ethena-stack asset
  // (USDe / sUSDe), computed from actual borrow amounts. Robust to a
  // transient API hiccup — unlike the old rate-flag heuristic, which
  // collapsed the whole figure to 0 whenever a supplyRate read blipped.
  const borrowedUsd = (v: FluidBorrowingVault): number =>
    (Number(v.totalBorrow ?? 0) / 10 ** v.borrowToken.decimals) *
    (v.borrowToken.price ?? 1)

  const usdgBorrowVaults = vaults.filter((v) => v.borrowToken.symbol === "USDG")
  const total = usdgBorrowVaults.reduce((s, v) => s + borrowedUsd(v), 0)
  if (total <= 0) return 0

  const ethenaCollateral = usdgBorrowVaults
    .filter((v) => v.supplyToken.symbol === "USDe" || v.supplyToken.symbol === "sUSDe")
    .reduce((s, v) => s + borrowedUsd(v), 0)
  return Math.min(1, Math.max(0, ethenaCollateral / total))
}
