import { z } from "zod"

/**
 * Ethena's API uses three sentinel values in the `address` field:
 *  - "custodial"  → off-chain custodian (Copper, INTX). No on-chain address.
 *  - "mixed"      → multiple on-chain wallets contribute. See `addressEntries[]`.
 *  - a real address (EVM 0x…, Solana base58, BTC P2SH)
 *
 * We keep `address` as a permissive string. Consumers should branch on the
 * `classifyAddress()` helper rather than parsing the raw value.
 */
const AddressString = z.string().min(1)

/** Chain slug as Ethena reports it. */
const ChainSlug = z.string().min(1)

/**
 * Ethena emits three flavours of addressEntry:
 *  - { address, chainSlug }            → normal on-chain wallet (EVM, Solana)
 *  - { address }                       → Bitcoin (no chain slug — address is self-identifying)
 *  - { address, kind: "custodial" }    → custodial omnibus account, e.g. "Custodial Omnibus"
 *
 * Keeping `chainSlug` optional plus an optional `kind` discriminator covers all three.
 * Use `flattenWallets()` if you need a clean (address, chainSlug) tuple list.
 */
const AddressEntry = z.object({
  address: AddressString,
  chainSlug: ChainSlug.optional(),
  kind: z.string().optional(),
})

export type AddressEntry = z.infer<typeof AddressEntry>

/** Leaf asset row. May omit `chain`/`chainSlug` for off-chain BTC/ETH backing. */
const RawAsset = z.object({
  asset: z.string(),
  address: AddressString.optional(),
  addressEntries: z.array(AddressEntry).default([]),
  aprMin: z.number().nullable(),
  aprMax: z.number().nullable(),
  chain: z.string().optional(),
  chainSlug: ChainSlug.optional(),
  location: z.string().optional(),
  percentOfTotal: z.number(),
  value: z.number(),
})

const RawCounterparty = z.object({
  counterparty: z.string().optional(),
  location: z.string().optional(),
  address: AddressString.optional(),
  addressEntries: z.array(AddressEntry).default([]),
  aprMin: z.number().nullable(),
  aprMax: z.number().nullable(),
  percentOfTotal: z.number(),
  value: z.number(),
  assets: z.array(RawAsset).default([]),
})

const RawStrategy = z.object({
  strategy: z.string(),
  address: AddressString.optional(),
  addressEntries: z.array(AddressEntry).default([]),
  aprMin: z.number().nullable(),
  aprMax: z.number().nullable(),
  percentOfTotal: z.number(),
  value: z.number(),
  counterparties: z.array(RawCounterparty).default([]),
})

export const BackingSnapshot = z.object({
  strategies: z.array(RawStrategy),
  timestamp: z.number().int().positive(),
})

export type BackingSnapshot = z.infer<typeof BackingSnapshot>
export type BackingStrategy = z.infer<typeof RawStrategy>
export type BackingCounterparty = z.infer<typeof RawCounterparty>
export type BackingAsset = z.infer<typeof RawAsset>

/**
 * The stablecoin-collateral endpoint returns a map keyed by an uppercased
 * token symbol. The inner `token_symbol` preserves canonical casing
 * (e.g. key "USDTB" → token_symbol "USDtb").
 */
const RawCollateralEntry = z.object({
  usd_amount: z.number().nonnegative(),
  timestamp: z.number().int().positive(),
  token_symbol: z.string(),
})

export const StablecoinCollateral = z.record(z.string(), RawCollateralEntry).transform((m) => {
  const entries = Object.values(m).map((e) => ({
    symbol: e.token_symbol,
    usdAmount: e.usd_amount,
    timestamp: e.timestamp,
  }))
  return entries
})

export type StablecoinCollateral = z.infer<typeof StablecoinCollateral>
