import { ethenaFetch } from "./client"
import { BackingSnapshot, StablecoinCollateral } from "./schemas"

/** Fetch and validate the current backing snapshot. */
export async function fetchBackingAssets(): Promise<BackingSnapshot> {
  const json = await ethenaFetch("/positions/current/backing-assets")
  return BackingSnapshot.parse(json)
}

/** Fetch and validate the redemption stablecoin pool sizes. */
export async function fetchStablecoinCollateral(): Promise<StablecoinCollateral> {
  const json = await ethenaFetch("/stablecoin-collateral")
  return StablecoinCollateral.parse(json)
}
