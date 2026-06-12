import "server-only"
import { z } from "zod"
import { env } from "@/config/env"

export interface TokenRef {
  network: string
  address: string
}

const PriceEntry = z.object({
  currency: z.string(),
  value: z.string(),
})

const PricesResponse = z.object({
  data: z.array(
    z.object({
      network: z.string(),
      address: z.string(),
      prices: z.array(PriceEntry).default([]),
    }),
  ),
})

const key = (network: string, address: string) => `${network}:${address.toLowerCase()}`

/**
 * Fetch USD spot prices for tokens via the Alchemy Prices API (by-address).
 * Returns a `network:address` -> price map. Addresses Alchemy can't price are
 * simply absent from the map — callers MUST treat "missing" as missing, never
 * as 0 (house rule: no silent value degradation).
 */
export async function fetchTokenPrices(refs: TokenRef[]): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  if (refs.length === 0) return out

  const url = `https://api.g.alchemy.com/prices/v1/${env.ALCHEMY_KEY}/tokens/by-address`
  const res = await fetch(url, {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ addresses: refs.map((r) => ({ network: r.network, address: r.address })) }),
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) {
    throw new Error(`Alchemy Prices API error ${res.status}: ${await res.text()}`)
  }
  const parsed = PricesResponse.parse(await res.json())
  for (const row of parsed.data) {
    const usd = row.prices.find((p) => p.currency === "usd")
    if (!usd) continue
    const n = Number(usd.value)
    if (!Number.isFinite(n)) continue
    out.set(key(row.network, row.address), n)
  }
  return out
}

/** Build the lookup key callers use against the returned map. */
export const priceKey = key
