import "server-only"
import { erc20Abi, type Address } from "viem"
import { getPublicClient } from "./clients"

/** USDe token on Ethereum mainnet. */
const USDE_MAINNET: Address = "0x4c9EDD5852cd905f086C759E8383e09bff1E68B3"
const USDE_DECIMALS = 18

/**
 * USDe circulating supply, read on-chain and independent of Ethena's snapshot.
 *
 * USDe is a LayerZero **lock-release** OFT: tokens bridged to other chains are
 * locked in the mainnet adapter and remain in the mainnet `totalSupply`, so the
 * Ethereum `totalSupply` already equals the GLOBAL circulating supply — summing
 * other chains would double-count. Validated 2026-06-14 against DefiLlama:
 * mainnet totalSupply $4.487B == DefiLlama total circulating $4.486B (its
 * per-chain split attributes the bridged ~$1.8B to destination chains, but the
 * total matches mainnet `totalSupply`).
 *
 * Returns the supply in USD (USDe is dollar-pegged), or `null` on read failure —
 * callers must render "unavailable", never substitute 0.
 */
export async function getUsdeCirculatingSupply(): Promise<number | null> {
  try {
    const client = getPublicClient("ethereum")
    const raw = await client.readContract({
      address: USDE_MAINNET,
      abi: erc20Abi,
      functionName: "totalSupply",
    })
    return Number(raw) / 10 ** USDE_DECIMALS
  } catch (err) {
    console.warn(
      `[ethena-flow-monitor] USDe totalSupply read failed: ${err instanceof Error ? err.message : String(err)}`,
    )
    return null
  }
}
