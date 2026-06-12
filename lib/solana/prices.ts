import "server-only"
import { z } from "zod"

const DEFAULT_TIMEOUT_MS = 15_000

// Jupiter price v3: { [mint]: { usdPrice: number, decimals, blockId, ... } }.
// Mints with no price are omitted from the object entirely.
const JupiterPriceResponse = z.record(
  z.string(),
  z.object({ usdPrice: z.number() }).passthrough(),
)

/**
 * Fetch live Solana USD spot prices by mint from the Jupiter price API v3.
 * Returns a mint -> price map. Mints Jupiter can't price are simply absent —
 * callers MUST treat "missing" as missing, never as 0.
 */
export async function fetchJupiterPrices(mints: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  if (mints.length === 0) return out

  const url = `https://lite-api.jup.ag/price/v3?ids=${mints.join(",")}`
  const res = await fetch(url, {
    cache: "no-store",
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
  })
  if (!res.ok) {
    throw new Error(`Jupiter price API error ${res.status}: ${await res.text()}`)
  }
  const parsed = JupiterPriceResponse.parse(await res.json())
  for (const [mint, info] of Object.entries(parsed)) {
    if (Number.isFinite(info.usdPrice)) out.set(mint, info.usdPrice)
  }
  return out
}
