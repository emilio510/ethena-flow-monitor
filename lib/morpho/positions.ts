import { z } from "zod"
import { morphoQuery, MorphoError, MorphoNotFoundError } from "./client"
import { ETHENA_WALLETS } from "@/config/wallets"

// Chain ids for the two Morpho deployments we cover.
export const MORPHO_CHAINS = [
  { chain: "ethereum" as const, chainId: 1 },
  { chain: "base" as const, chainId: 8453 },
]

// ───────────────────────── Schemas

const VaultPosition = z.object({
  vault: z.object({
    address: z.string(),
    name: z.string().nullable(),
    asset: z.object({ symbol: z.string() }),
  }),
  state: z
    .object({
      assetsUsd: z.number().nullable(),
    })
    .nullable(),
})

// V2 vaults expose `assetsUsd` directly on the position (no `state` wrapper).
const VaultV2Position = z.object({
  vault: z.object({
    address: z.string(),
    name: z.string().nullable(),
    asset: z.object({ symbol: z.string() }),
  }),
  assetsUsd: z.number().nullable(),
})

const UserResponse = z.object({
  userByAddress: z
    .object({
      address: z.string(),
      vaultPositions: z.array(VaultPosition),
      vaultV2Positions: z.array(VaultV2Position).nullable().optional(),
    })
    .nullable(),
})

// V2 vault adapters either route through a V1 vault (MetaMorpho) or directly
// hold a position in a single Morpho Blue market (MorphoMarketV1). We follow
// MetaMorpho adapters as if they were users — `userByAddress(adapter)` returns
// the V1 vault that backs them; MorphoMarketV1 adapters appear in the same
// user response as `marketPositions`.
const VaultV2AdapterItem = z.object({
  type: z.string(),
  address: z.string(),
  assetsUsd: z.number().nullable(),
})


const VaultV2Response = z.object({
  vaultV2ByAddress: z
    .object({
      address: z.string(),
      name: z.string().nullable(),
      asset: z.object({ symbol: z.string() }),
      totalAssetsUsd: z.number().nullable(),
      adapters: z.object({ items: z.array(VaultV2AdapterItem) }),
    })
    .nullable(),
})

const MarketState = z
  .object({
    supplyAssetsUsd: z.number().nullable(),
    borrowAssetsUsd: z.number().nullable(),
  })
  .nullable()

const Allocation = z.object({
  market: z.object({
    uniqueKey: z.string(),
    collateralAsset: z.object({ symbol: z.string() }).nullable(),
    loanAsset: z.object({ symbol: z.string() }).nullable(),
    state: MarketState,
  }),
  supplyAssetsUsd: z.number().nullable(),
})

const VaultResponse = z.object({
  vaultByAddress: z
    .object({
      address: z.string(),
      name: z.string().nullable(),
      asset: z.object({ symbol: z.string() }),
      state: z
        .object({
          totalAssetsUsd: z.number().nullable(),
          allocation: z.array(Allocation),
        })
        .nullable(),
    })
    .nullable(),
})

// Adapters resolved as users expose both vaultPositions (for MetaMorpho route)
// and marketPositions (for MorphoMarketV1 route). Used only for adapter
// resolution; per-wallet queries stay on the leaner UserResponse.
const MarketPositionItem = z.object({
  market: z.object({
    uniqueKey: z.string(),
    collateralAsset: z.object({ symbol: z.string() }).nullable(),
    loanAsset: z.object({ symbol: z.string() }).nullable(),
    state: MarketState,
  }),
  state: z
    .object({ supplyAssetsUsd: z.number().nullable() })
    .nullable(),
})

const AdapterUserResponse = z.object({
  userByAddress: z
    .object({
      address: z.string(),
      vaultPositions: z.array(VaultPosition),
      marketPositions: z.array(MarketPositionItem).nullable().optional(),
    })
    .nullable(),
})

// ───────────────────────── Public types

export interface MorphoVaultPosition {
  chain: "ethereum" | "base"
  walletAddress: string
  vaultAddress: string
  vaultName: string
  vaultAssetSymbol: string
  ethenaSuppliedUsd: number
  /** Morpho V1 (legacy MetaMorpho) vs V2 (adapter-routed). */
  vaultVersion: "V1" | "V2"
}

export interface MorphoVaultAllocation {
  marketUniqueKey: string
  collateralSymbol: string | null
  loanSymbol: string | null
  /** Vault's allocation to this market (its supply contribution). */
  supplyAssetsUsd: number
  /** Total market supply across all suppliers (for vault-share computation). */
  marketSupplyUsd: number
  /** Total market borrow (the active leverage). */
  marketBorrowUsd: number
}

export interface MorphoVaultDetail {
  address: string
  name: string
  assetSymbol: string
  totalAssetsUsd: number
  allocation: MorphoVaultAllocation[]
}

// ───────────────────────── Queries

const USER_QUERY = `
query EthenaUser($address: String!, $chainId: Int!) {
  userByAddress(address: $address, chainId: $chainId) {
    address
    vaultPositions {
      vault { address name asset { symbol } }
      state { assetsUsd }
    }
    vaultV2Positions {
      vault { address name asset { symbol } }
      assetsUsd
    }
  }
}
`

const VAULT_V2_QUERY = `
query MorphoVaultV2($address: String!, $chainId: Int!) {
  vaultV2ByAddress(address: $address, chainId: $chainId) {
    address name
    asset { symbol }
    totalAssetsUsd
    adapters { items { type address assetsUsd } }
  }
}
`

const ADAPTER_USER_QUERY = `
query AdapterUser($address: String!, $chainId: Int!) {
  userByAddress(address: $address, chainId: $chainId) {
    address
    vaultPositions {
      vault { address name asset { symbol } }
      state { assetsUsd }
    }
    marketPositions {
      market {
        uniqueKey
        collateralAsset { symbol }
        loanAsset { symbol }
        state { supplyAssetsUsd borrowAssetsUsd }
      }
      state { supplyAssetsUsd }
    }
  }
}
`

const VAULT_QUERY = `
query MorphoVault($address: String!, $chainId: Int!) {
  vaultByAddress(address: $address, chainId: $chainId) {
    address name
    asset { symbol }
    state {
      totalAssetsUsd
      allocation {
        market {
          uniqueKey
          collateralAsset { symbol }
          loanAsset { symbol }
          state { supplyAssetsUsd borrowAssetsUsd }
        }
        supplyAssetsUsd
      }
    }
  }
}
`

// ───────────────────────── Public API

export interface EthenaMorphoResult {
  positions: MorphoVaultPosition[]
  failedWallets: string[]
}

/**
 * Fetch Ethena's vault positions on Morpho across {ethereum, base} for all
 * 11 monitored wallets. Returns a flat list with chain attribution. Partial-
 * data tolerant: a single failed wallet/chain combo logs and is skipped, the
 * rest still return.
 */
export async function getEthenaMorphoPositions(): Promise<EthenaMorphoResult> {
  const tasks: Array<{
    wallet: string
    chain: "ethereum" | "base"
    chainId: number
  }> = []
  for (const w of ETHENA_WALLETS) {
    for (const c of MORPHO_CHAINS) {
      tasks.push({ wallet: w, chain: c.chain, chainId: c.chainId })
    }
  }

  const settled = await Promise.allSettled(
    tasks.map((t) =>
      morphoQuery(USER_QUERY, { address: t.wallet, chainId: t.chainId }).then((raw) => ({
        task: t,
        parsed: UserResponse.parse(raw),
      })),
    ),
  )

  const positions: MorphoVaultPosition[] = []
  const failedWallets: string[] = []

  settled.forEach((r, i) => {
    const task = tasks[i]!
    if (r.status === "rejected") {
      // NOT_FOUND just means the wallet has never used Morpho on this chain.
      // That's not a fetch failure — silently skip without adding to the
      // "failed" tally that the UI surfaces as partial-data warnings.
      if (r.reason instanceof MorphoNotFoundError) return
      failedWallets.push(`${task.wallet}@${task.chain}`)
      const reason = r.reason instanceof Error ? r.reason.message : String(r.reason)
      console.warn(
        `[ethena-flow-monitor] morpho fetch failed for ${task.wallet}@${task.chain}: ${reason}`,
      )
      return
    }
    const user = r.value.parsed.userByAddress
    if (!user) return
    for (const vp of user.vaultPositions) {
      const usd = vp.state?.assetsUsd ?? 0
      if (usd <= 0) continue
      positions.push({
        chain: task.chain,
        walletAddress: task.wallet,
        vaultAddress: vp.vault.address,
        vaultName: vp.vault.name ?? vp.vault.asset.symbol,
        vaultAssetSymbol: vp.vault.asset.symbol,
        ethenaSuppliedUsd: usd,
        vaultVersion: "V1",
      })
    }
    for (const vp of user.vaultV2Positions ?? []) {
      const usd = vp.assetsUsd ?? 0
      if (usd <= 0) continue
      positions.push({
        chain: task.chain,
        walletAddress: task.wallet,
        vaultAddress: vp.vault.address,
        vaultName: vp.vault.name ?? vp.vault.asset.symbol,
        vaultAssetSymbol: vp.vault.asset.symbol,
        ethenaSuppliedUsd: usd,
        vaultVersion: "V2",
      })
    }
  })

  return { positions, failedWallets }
}

/**
 * Fetch a single Morpho V1 (legacy MetaMorpho) vault's allocation breakdown.
 * Returns null if no V1 vault exists at the address (e.g. it's a V2 vault).
 */
async function getMorphoVaultV1(
  address: string,
  chainId: number,
): Promise<MorphoVaultDetail | null> {
  const raw = await morphoQuery(VAULT_QUERY, { address, chainId })
  const parsed = VaultResponse.parse(raw)
  const v = parsed.vaultByAddress
  if (!v || !v.state) return null
  return {
    address: v.address,
    name: v.name ?? v.asset.symbol,
    assetSymbol: v.asset.symbol,
    totalAssetsUsd: v.state.totalAssetsUsd ?? 0,
    allocation: v.state.allocation.map((a) => ({
      marketUniqueKey: a.market.uniqueKey,
      collateralSymbol: a.market.collateralAsset?.symbol ?? null,
      loanSymbol: a.market.loanAsset?.symbol ?? null,
      supplyAssetsUsd: a.supplyAssetsUsd ?? 0,
      marketSupplyUsd: a.market.state?.supplyAssetsUsd ?? 0,
      marketBorrowUsd: a.market.state?.borrowAssetsUsd ?? 0,
    })),
  }
}

/**
 * Fetch a Morpho V2 vault and synthesise a unified allocation.
 *
 * V2 vaults route assets through adapters. Two adapter shapes matter:
 *   - MetaMorpho:   deposits into a V1 (legacy) MetaMorpho vault. We resolve
 *                   the underlying V1 vault via `userByAddress(adapter)` and
 *                   scale its allocation rows by `adapterHeld / v1.TVL`.
 *   - MorphoMarketV1: deposits straight into a single Blue market. We surface
 *                     a single allocation row sourced from the adapter's
 *                     `marketPositions` entry.
 *
 * MorphoVaultV2 (nested V2 vault) adapters are not in the wild yet; we log
 * and skip so the recursion math remains honest by under-counting rather
 * than fabricating values.
 *
 * Each adapter is resolved independently via `Promise.allSettled` so a
 * single failed lookup degrades to a missing allocation row rather than
 * collapsing the entire vault.
 */
async function getMorphoVaultV2(
  address: string,
  chainId: number,
): Promise<MorphoVaultDetail | null> {
  const raw = await morphoQuery(VAULT_V2_QUERY, { address, chainId })
  const parsed = VaultV2Response.parse(raw)
  const v = parsed.vaultV2ByAddress
  if (!v) return null

  const adapterResults = await Promise.allSettled(
    v.adapters.items.map((adapter) =>
      resolveV2Adapter(adapter, chainId, v.address),
    ),
  )
  const allocation: MorphoVaultAllocation[] = []
  adapterResults.forEach((res, i) => {
    const adapter = v.adapters.items[i]!
    if (res.status === "rejected") {
      const reason = res.reason instanceof Error ? res.reason.message : String(res.reason)
      console.warn(
        `[ethena-flow-monitor] V2 adapter ${adapter.type}@${adapter.address} ` +
          `failed for vault ${v.address}: ${reason}`,
      )
      return
    }
    allocation.push(...res.value)
  })

  return {
    address: v.address,
    name: v.name ?? v.asset.symbol,
    assetSymbol: v.asset.symbol,
    totalAssetsUsd: v.totalAssetsUsd ?? 0,
    allocation,
  }
}

/** Resolve one V2 adapter into zero or more synthetic allocation rows. */
async function resolveV2Adapter(
  adapter: { type: string; address: string; assetsUsd: number | null },
  chainId: number,
  parentVaultAddress: string,
): Promise<MorphoVaultAllocation[]> {
  const adapterAssets = adapter.assetsUsd ?? 0
  if (adapterAssets <= 0) return []

  const userRaw = await morphoQuery(ADAPTER_USER_QUERY, {
    address: adapter.address,
    chainId,
  })
  const user = AdapterUserResponse.parse(userRaw).userByAddress

  if (adapter.type === "MetaMorpho") {
    const out: MorphoVaultAllocation[] = []
    const v1Refs = user?.vaultPositions ?? []
    for (const vp of v1Refs) {
      const v1Held = vp.state?.assetsUsd ?? 0
      if (v1Held <= 0) continue
      const v1Vault = await getMorphoVaultV1(vp.vault.address, chainId)
      if (!v1Vault || v1Vault.totalAssetsUsd <= 0) continue
      // Clamp to ≤1 — `v1Held` and `totalAssetsUsd` come from independent
      // GraphQL roots and aren't atomic, so brief snapshot lag could push the
      // ratio above 1 and inflate recursion.
      const adapterShareOfV1 = Math.min(v1Held / v1Vault.totalAssetsUsd, 1)
      for (const a of v1Vault.allocation) {
        out.push({
          marketUniqueKey: a.marketUniqueKey,
          collateralSymbol: a.collateralSymbol,
          loanSymbol: a.loanSymbol,
          supplyAssetsUsd: a.supplyAssetsUsd * adapterShareOfV1,
          marketSupplyUsd: a.marketSupplyUsd,
          marketBorrowUsd: a.marketBorrowUsd,
        })
      }
    }
    return out
  }

  if (adapter.type === "MorphoMarketV1") {
    const positions = (user?.marketPositions ?? []).filter(
      (mp) => (mp.state?.supplyAssetsUsd ?? 0) > 0,
    )
    // Defensive scale: `userByAddress(adapter)` returns every position held by
    // the adapter address, but only `adapter.assetsUsd` of those are owed to
    // *this* parent V2 vault. If the sum of positions exceeds `adapter.assetsUsd`
    // (cross-vault use, snapshot lag), scale each row down so we never over-
    // attribute. If it fits within `adapter.assetsUsd`, leave them alone.
    const sumPositions = positions.reduce(
      (a, mp) => a + (mp.state?.supplyAssetsUsd ?? 0),
      0,
    )
    const scale =
      sumPositions > adapterAssets && sumPositions > 0
        ? adapterAssets / sumPositions
        : 1
    if (scale < 1) {
      console.warn(
        `[ethena-flow-monitor] V2 vault ${parentVaultAddress} adapter ` +
          `${adapter.address}: market positions sum to $${sumPositions.toFixed(0)} ` +
          `vs adapter.assetsUsd=$${adapterAssets.toFixed(0)} — scaling by ${scale.toFixed(4)}`,
      )
    }
    return positions.map((mp) => ({
      marketUniqueKey: mp.market.uniqueKey,
      collateralSymbol: mp.market.collateralAsset?.symbol ?? null,
      loanSymbol: mp.market.loanAsset?.symbol ?? null,
      supplyAssetsUsd: (mp.state?.supplyAssetsUsd ?? 0) * scale,
      marketSupplyUsd: mp.market.state?.supplyAssetsUsd ?? 0,
      marketBorrowUsd: mp.market.state?.borrowAssetsUsd ?? 0,
    }))
  }

  console.warn(
    `[ethena-flow-monitor] V2 vault ${parentVaultAddress} has unsupported ` +
      `adapter ${adapter.type}@${adapter.address} with $${adapterAssets} — ` +
      `recursion will under-count by this amount`,
  )
  return []
}

/** Morpho's GraphQL flags missing entities with a top-level error rather than
 *  a null payload. We treat that as "not a V1 vault" so the dispatcher can
 *  fall through to V2; any other error (timeout, 5xx, etc.) still propagates. */
function isNotFoundError(err: unknown): boolean {
  if (err instanceof MorphoNotFoundError) return true
  return (
    err instanceof MorphoError &&
    /no results matching|not[\s-]found/i.test(err.body)
  )
}

/**
 * Fetch a single vault's allocation breakdown. Tries Morpho V1 first; falls
 * back to V2 (which follows adapters through to their underlying V1 vaults)
 * so a single call works for both vault generations.
 */
export async function getMorphoVault(
  address: string,
  chainId: number,
): Promise<MorphoVaultDetail | null> {
  try {
    const v1 = await getMorphoVaultV1(address, chainId)
    if (v1) return v1
  } catch (err) {
    if (!isNotFoundError(err)) throw err
  }
  return getMorphoVaultV2(address, chainId)
}

/** Fetch detail for several vaults in parallel; partial-data tolerant.
 *  Pass the known `version` to skip the V1 probe on V2 vaults. */
export async function getMorphoVaultsBulk(
  refs: Array<{
    address: string
    chainId: number
    chain: "ethereum" | "base"
    version?: "V1" | "V2"
  }>,
): Promise<Map<string, MorphoVaultDetail>> {
  const settled = await Promise.allSettled(
    refs.map((r) =>
      r.version === "V2"
        ? getMorphoVaultV2(r.address, r.chainId)
        : r.version === "V1"
          ? getMorphoVaultV1(r.address, r.chainId)
          : getMorphoVault(r.address, r.chainId),
    ),
  )
  const out = new Map<string, MorphoVaultDetail>()
  settled.forEach((s, i) => {
    const ref = refs[i]!
    if (s.status === "fulfilled" && s.value) {
      out.set(`${ref.chain}:${ref.address.toLowerCase()}`, s.value)
    } else if (s.status === "rejected") {
      const reason = s.reason instanceof Error ? s.reason.message : String(s.reason)
      console.warn(
        `[ethena-flow-monitor] morpho vault fetch failed for ${ref.address}@${ref.chain}: ${reason}`,
      )
    }
  })
  return out
}
