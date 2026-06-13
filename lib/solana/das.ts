import "server-only"
import { z } from "zod"
import { env } from "@/config/env"
import { SolanaApiError, SolanaTimeoutError } from "./client"

const DEFAULT_TIMEOUT_MS = 15_000

export interface AssetIdentity {
  symbol: string
  name: string
}

// DAS getAsset happy-path response shape.
const DasAssetResponse = z.object({
  result: z
    .object({
      id: z.string(),
      content: z
        .object({
          metadata: z
            .object({
              symbol: z.string().optional(),
              name: z.string().optional(),
            })
            .optional(),
        })
        .optional(),
    })
    .optional(),
  // error field present when DAS cannot find the asset
  error: z.unknown().optional(),
})

function solanaRpcUrl(): string {
  return `https://solana-mainnet.g.alchemy.com/v2/${env.ALCHEMY_KEY}`
}

async function getAsset(mint: string): Promise<AssetIdentity | null> {
  let res: Response
  try {
    res = await fetch(solanaRpcUrl(), {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getAsset",
        params: { id: mint },
      }),
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    })
  } catch (err) {
    if (err instanceof DOMException && err.name === "TimeoutError") {
      throw new SolanaTimeoutError("solana-rpc", `getAsset/${mint}`, DEFAULT_TIMEOUT_MS)
    }
    throw err
  }

  if (!res.ok) {
    throw new SolanaApiError("solana-rpc", res.status, `getAsset/${mint}`, await res.text())
  }

  const parsed = DasAssetResponse.parse(await res.json())

  // DAS returned an error (asset not found, invalid param, etc.)
  if (parsed.error !== undefined || !parsed.result) return null

  const metadata = parsed.result.content?.metadata
  const symbol = metadata?.symbol?.trim()
  const name = metadata?.name?.trim()

  if (!symbol || !name) return null

  return { symbol, name }
}

/**
 * Fetch identity (symbol + name) for a batch of Solana mints via the Alchemy
 * DAS `getAsset` API. One call per mint (N is small in practice).
 *
 * Mints that DAS cannot identify — unknown asset, no metadata, or a network
 * error on a single mint — are omitted from the returned map. The caller MUST
 * treat "absent from map" as "unidentified" and exclude the mint from valuation
 * rather than assuming any value. No silent zero.
 */
export async function fetchAssetIdentities(
  mints: string[],
): Promise<Map<string, AssetIdentity>> {
  const out = new Map<string, AssetIdentity>()
  if (mints.length === 0) return out

  const results = await Promise.allSettled(
    mints.map(async (mint) => ({ mint, identity: await getAsset(mint) })),
  )

  for (const r of results) {
    if (r.status === "rejected" || r.value.identity === null) continue
    out.set(r.value.mint, r.value.identity)
  }

  return out
}
