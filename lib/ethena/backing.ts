import { ethenaFetch } from "./client"
import { BackingSnapshot, StablecoinCollateral } from "./schemas"

/**
 * Local same-origin proxy that runs on Vercel's Edge runtime. Cloudflare's
 * anti-bot heuristics challenge Vercel's Node runtime egress (HTML 200
 * instead of JSON) about half the time, while Edge runtime gets through
 * cleanly — see app/api/ethena/*. When deployed on Vercel we route through
 * the proxy; locally we hit Ethena directly (next dev has no such gating).
 */
function localProxyOrigin(): string | null {
  // VERCEL is set by Vercel for both prod & preview runtimes; absent locally.
  if (!process.env.VERCEL) return null
  const url = process.env.VERCEL_URL // e.g. ethena-flow-monitor-xyz.vercel.app
  return url ? `https://${url}` : null
}

async function fetchViaProxy<T>(localPath: string, directPath: string): Promise<T> {
  const origin = localProxyOrigin()
  if (!origin) {
    // Local dev (and `next build` prerender on the developer's machine) —
    // talk to Ethena directly via the Node-side client.
    return ethenaFetch(directPath) as Promise<T>
  }
  const res = await fetch(`${origin}${localPath}`, { cache: "no-store" })
  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw new Error(`Edge proxy ${localPath} returned ${res.status}: ${body.slice(0, 200)}`)
  }
  return (await res.json()) as T
}

/** Fetch and validate the current backing snapshot. */
export async function fetchBackingAssets(): Promise<BackingSnapshot> {
  const json = await fetchViaProxy<unknown>(
    "/api/ethena/snapshot",
    "/positions/current/backing-assets",
  )
  return BackingSnapshot.parse(json)
}

/** Fetch and validate the redemption stablecoin pool sizes. */
export async function fetchStablecoinCollateral(): Promise<StablecoinCollateral> {
  const json = await fetchViaProxy<unknown>(
    "/api/ethena/stables",
    "/stablecoin-collateral",
  )
  return StablecoinCollateral.parse(json)
}
