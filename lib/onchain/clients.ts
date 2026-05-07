import "server-only"
import { createPublicClient, http, type PublicClient, type Chain as ViemChain } from "viem"
import { mainnet, base, mantle } from "viem/chains"
import { env } from "@/config/env"
import type { Chain } from "@/config/markets"

/** Multicall3 sits at the same address on every chain we use, so we can
 *  define minimal chain shims for Plasma and MegaETH where viem doesn't
 *  ship a built-in config. https://www.multicall3.com */
const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11" as const

const plasma: ViemChain = {
  id: 9745,
  name: "Plasma",
  nativeCurrency: { name: "XPL", symbol: "XPL", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.plasma.to"] } },
  contracts: { multicall3: { address: MULTICALL3 } },
}

const megaeth: ViemChain = {
  id: 4326,
  name: "MegaETH",
  nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://carrot.megaeth.com/rpc"] } },
  contracts: { multicall3: { address: MULTICALL3 } },
}

/** Per-chain (Alchemy path, viem chain) pair. Chains without idle tokens
 *  are still listed so the map stays exhaustive. */
const CHAIN_CONFIG: Record<Chain, { path: string; viem: ViemChain }> = {
  ethereum: { path: "eth-mainnet", viem: mainnet },
  base: { path: "base-mainnet", viem: base },
  mantle: { path: "mantle-mainnet", viem: mantle },
  plasma: { path: "plasma-mainnet", viem: plasma },
  megaeth: { path: "megaeth-mainnet", viem: megaeth },
}

const cache = new Map<Chain, PublicClient>()

export function getPublicClient(chain: Chain): PublicClient {
  const cached = cache.get(chain)
  if (cached) return cached

  const { path, viem } = CHAIN_CONFIG[chain]
  const url = `https://${path}.g.alchemy.com/v2/${env.ALCHEMY_KEY}`
  const client = createPublicClient({
    chain: viem,
    transport: http(url, { batch: true, timeout: 20_000 }),
    batch: {
      multicall: {
        // Bundle parallel reads into one Multicall3.aggregate3 call per chain.
        // Per-chain fan-out is small (≤ 11 wallets × 7 tokens = 77 reads),
        // so a short wait is enough to coalesce without adding latency.
        wait: 16,
        batchSize: 200,
      },
    },
  })
  cache.set(chain, client)
  return client
}
