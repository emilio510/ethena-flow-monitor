import { NextResponse } from "next/server"
import { fetchBackingAssets } from "@/lib/ethena"

/**
 * Debug-only route that surfaces the raw error chain when Ethena's API
 * isn't reachable from Vercel's egress. Returns JSON so we can `curl |
 * jq` the actual undici `cause` instead of fighting log truncation.
 *
 * Returns the parsed snapshot on success, or a structured error payload on
 * failure. Safe to leave wired — it doesn't expose secrets and only hits a
 * public endpoint.
 */
export const dynamic = "force-dynamic"
export const revalidate = 0
export const runtime = "edge"

export async function GET() {
  const startedAt = Date.now()
  try {
    const snap = await fetchBackingAssets()
    return NextResponse.json({
      ok: true,
      elapsedMs: Date.now() - startedAt,
      timestamp: snap.timestamp,
      strategies: snap.strategies.map((s) => ({
        name: s.strategy,
        value: s.value,
        counterparties: s.counterparties.length,
      })),
    })
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        elapsedMs: Date.now() - startedAt,
        error: errorShape(err),
      },
      { status: 200 },
    )
  }
}

function errorShape(err: unknown): unknown {
  if (!(err instanceof Error)) return { kind: "non-error", value: String(err) }
  const code = (err as Error & { code?: string }).code
  return {
    kind: err.name,
    message: err.message,
    code,
    cause: "cause" in err && err.cause ? errorShape(err.cause) : null,
  }
}
