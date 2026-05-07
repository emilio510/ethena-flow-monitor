import {
  getMorphoVault,
  getEthenaMorphoPositions,
  MORPHO_CHAINS,
} from "@/lib/morpho/positions"
import { classify, isEthenaStack } from "@/lib/recursion/classify"

export type MorphoChain = "ethereum" | "base"

export class VaultNotFoundError extends Error {
  constructor(public chain: string, public address: string) {
    super(`Morpho vault not found: ${chain}/${address}`)
    this.name = "VaultNotFoundError"
  }
}

export function isMorphoChain(value: unknown): value is MorphoChain {
  return value === "ethereum" || value === "base"
}

export interface VaultMarketAllocation {
  marketUniqueKey: string
  collateralSymbol: string | null
  loanSymbol: string | null
  supplyAssetsUsd: number
  shareOfVault: number
  isRecursive: boolean
}

export interface VaultEthenaDepositor {
  walletAddress: string
  ethenaSuppliedUsd: number
  shareOfVault: number
}

export interface VaultView {
  chain: MorphoChain
  address: string
  name: string
  assetSymbol: string
  totalAssetsUsd: number
  ethenaSuppliedUsd: number
  ethenaShareOfVault: number
  vaultRecursionShare: number
  recursionScore: number
  allocation: VaultMarketAllocation[]
  ethenaDepositors: VaultEthenaDepositor[]
}

const clamp = (n: number) => Math.max(0, Math.min(1, n))
const MIN_ALLOCATION_USD = 1_000

export async function loadVaultView(
  chain: MorphoChain,
  address: string,
): Promise<VaultView> {
  const chainId = MORPHO_CHAINS.find((c) => c.chain === chain)!.chainId
  const [vault, { positions }] = await Promise.all([
    getMorphoVault(address, chainId),
    getEthenaMorphoPositions(),
  ])
  if (!vault) throw new VaultNotFoundError(chain, address)

  const ethenaInVault = positions.filter(
    (p) =>
      p.chain === chain &&
      p.vaultAddress.toLowerCase() === address.toLowerCase(),
  )
  const ethenaSuppliedUsd = ethenaInVault.reduce(
    (a, p) => a + p.ethenaSuppliedUsd,
    0,
  )
  const ethenaShareOfVault =
    vault.totalAssetsUsd > 0 ? clamp(ethenaSuppliedUsd / vault.totalAssetsUsd) : 0

  // Per-market allocation rows; filter dust to keep the table readable.
  const allocation: VaultMarketAllocation[] = vault.allocation
    .filter((a) => a.supplyAssetsUsd >= MIN_ALLOCATION_USD)
    .map((a) => {
      const colBucket = a.collateralSymbol ? classify(a.collateralSymbol) : "OTHER"
      const loanBucket = a.loanSymbol ? classify(a.loanSymbol) : "OTHER"
      const isRecursive = isEthenaStack(colBucket) || isEthenaStack(loanBucket)
      return {
        marketUniqueKey: a.marketUniqueKey,
        collateralSymbol: a.collateralSymbol,
        loanSymbol: a.loanSymbol,
        supplyAssetsUsd: a.supplyAssetsUsd,
        shareOfVault:
          vault.totalAssetsUsd > 0 ? a.supplyAssetsUsd / vault.totalAssetsUsd : 0,
        isRecursive,
      }
    })
    .sort((a, b) => b.supplyAssetsUsd - a.supplyAssetsUsd)

  // Vault recursion share uses the full (unfiltered) allocation so dust
  // below MIN_ALLOCATION_USD doesn't change the headline number.
  const recursiveAlloc = vault.allocation.reduce((sum, a) => {
    const colBucket = a.collateralSymbol ? classify(a.collateralSymbol) : "OTHER"
    const loanBucket = a.loanSymbol ? classify(a.loanSymbol) : "OTHER"
    return isEthenaStack(colBucket) || isEthenaStack(loanBucket)
      ? sum + a.supplyAssetsUsd
      : sum
  }, 0)
  const vaultRecursionShare =
    vault.totalAssetsUsd > 0 ? clamp(recursiveAlloc / vault.totalAssetsUsd) : 0

  const recursionScore = ethenaShareOfVault * vaultRecursionShare

  const ethenaDepositors: VaultEthenaDepositor[] = ethenaInVault
    .map((p) => ({
      walletAddress: p.walletAddress,
      ethenaSuppliedUsd: p.ethenaSuppliedUsd,
      shareOfVault:
        vault.totalAssetsUsd > 0 ? p.ethenaSuppliedUsd / vault.totalAssetsUsd : 0,
    }))
    .sort((a, b) => b.ethenaSuppliedUsd - a.ethenaSuppliedUsd)

  return {
    chain,
    address: vault.address,
    name: vault.name,
    assetSymbol: vault.assetSymbol,
    totalAssetsUsd: vault.totalAssetsUsd,
    ethenaSuppliedUsd,
    ethenaShareOfVault,
    vaultRecursionShare,
    recursionScore,
    allocation,
    ethenaDepositors,
  }
}
