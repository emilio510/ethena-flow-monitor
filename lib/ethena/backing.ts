import { ethenaFetch } from "./client"
import { BackingSnapshot, StablecoinCollateral } from "./schemas"
import staticSnapshot from "@/data/ethena-snapshot.json"
import staticStables from "@/data/ethena-stables.json"

/**
 * Ethena's API sits behind a Cloudflare anti-bot that consistently
 * challenges Vercel's egress IPs (HTML 200 instead of JSON) — see commit
 * history for the long investigation. Live-fetching from Vercel isn't
 * viable.
 *
 * Strategy: on Vercel, read the committed `data/ethena-snapshot.json` and
 * `data/ethena-stables.json` files. Refresh them locally via
 * `scripts/refresh-ethena-snapshot.ts`. Locally (`next dev`), hit the live
 * API so we see fresh data when iterating.
 */

/** Fetch and validate the current backing snapshot. */
export async function fetchBackingAssets(): Promise<BackingSnapshot> {
  if (process.env.VERCEL) return BackingSnapshot.parse(staticSnapshot)
  const json = await ethenaFetch("/positions/current/backing-assets")
  return BackingSnapshot.parse(json)
}

/** Fetch and validate the redemption stablecoin pool sizes. */
export async function fetchStablecoinCollateral(): Promise<StablecoinCollateral> {
  if (process.env.VERCEL) return StablecoinCollateral.parse(staticStables)
  const json = await ethenaFetch("/stablecoin-collateral")
  return StablecoinCollateral.parse(json)
}
