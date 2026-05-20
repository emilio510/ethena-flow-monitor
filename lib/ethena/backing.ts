import { headers } from "next/headers"
import { ethenaFetch } from "./client"
import { BackingSnapshot, StablecoinCollateral } from "./schemas"

/**
 * Local same-origin proxy that runs on Vercel's Edge runtime. Cloudflare's
 * anti-bot heuristics challenge Vercel's Node runtime egress (HTML 200
 * instead of JSON) about half the time, while Edge runtime gets through
 * cleanly — see app/api/ethena/*. When deployed on Vercel we route through
 * the proxy; locally we hit Ethena directly (next dev has no such gating).
 *
 * Origin discovery: we read it from the incoming request's `host` header so
 * the call lands on the same deployment that's rendering the page. Env vars
 * (VERCEL_URL etc.) don't always agree with the alias the user hit.
 */
async function localProxyOrigin(): Promise<string | null> {
  if (!process.env.VERCEL) return null
  try {
    const h = await headers()
    const host = h.get("x-forwarded-host") ?? h.get("host")
    const proto = h.get("x-forwarded-proto") ?? "https"
    if (host) return `${proto}://${host}`
  } catch {
    // headers() throws outside a request context (e.g. build-time pre-render).
  }
  // Build-time / no-request fallback: deployment-specific URL.
  const fallback =
    process.env.VERCEL_PROJECT_PRODUCTION_URL ??
    process.env.VERCEL_BRANCH_URL ??
    process.env.VERCEL_URL
  return fallback ? `https://${fallback}` : null
}

async function fetchViaProxy<T>(localPath: string, directPath: string): Promise<T> {
  const origin = await localProxyOrigin()
  if (!origin) {
    // Local dev (and `next build` prerender on the developer's machine) —
    // talk to Ethena directly via the Node-side client.
    return ethenaFetch(directPath) as Promise<T>
  }
  const url = `${origin}${localPath}`
  let res: Response
  try {
    res = await fetch(url, { cache: "no-store" })
  } catch (err) {
    const reason = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
    throw new Error(`Edge proxy fetch threw for ${url}: ${reason}`)
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw new Error(`Edge proxy ${url} returned ${res.status}: ${body.slice(0, 200)}`)
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
