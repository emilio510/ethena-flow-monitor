import { z } from "zod"
import { morphoQuery } from "./client"
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

const UserResponse = z.object({
  userByAddress: z
    .object({
      address: z.string(),
      vaultPositions: z.array(VaultPosition),
    })
    .nullable(),
})

const Allocation = z.object({
  market: z.object({
    uniqueKey: z.string(),
    collateralAsset: z.object({ symbol: z.string() }).nullable(),
    loanAsset: z.object({ symbol: z.string() }).nullable(),
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

// ───────────────────────── Public types

export interface MorphoVaultPosition {
  chain: "ethereum" | "base"
  walletAddress: string
  vaultAddress: string
  vaultName: string
  vaultAssetSymbol: string
  ethenaSuppliedUsd: number
}

export interface MorphoVaultAllocation {
  marketUniqueKey: string
  collateralSymbol: string | null
  loanSymbol: string | null
  supplyAssetsUsd: number
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
      })
    }
  })

  return { positions, failedWallets }
}

/**
 * Fetch a single vault's allocation breakdown. Used for vault drill-down
 * and for computing recursion on Morpho vaults Ethena participates in.
 */
export async function getMorphoVault(
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
    })),
  }
}

/** Fetch detail for several vaults in parallel; partial-data tolerant. */
export async function getMorphoVaultsBulk(
  refs: Array<{ address: string; chainId: number; chain: "ethereum" | "base" }>,
): Promise<Map<string, MorphoVaultDetail>> {
  const settled = await Promise.allSettled(
    refs.map((r) => getMorphoVault(r.address, r.chainId)),
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
