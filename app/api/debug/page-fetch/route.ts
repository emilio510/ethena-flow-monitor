import { NextResponse } from "next/server"
import { headers } from "next/headers"

/**
 * NODE runtime debug endpoint: reproduces exactly what app/page.tsx does
 * when fetching Ethena via the local edge proxy. Returns the full
 * diagnostic chain as JSON so we can curl it and dodge Vercel log
 * truncation.
 *
 * Specifically reports: env detection, the constructed proxy URL, the
 * proxy's response status + content-type + first 200 body chars.
 */
export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET() {
  const startedAt = Date.now()
  const env = {
    VERCEL: process.env.VERCEL ?? null,
    VERCEL_URL: process.env.VERCEL_URL ?? null,
    VERCEL_BRANCH_URL: process.env.VERCEL_BRANCH_URL ?? null,
    VERCEL_PROJECT_PRODUCTION_URL: process.env.VERCEL_PROJECT_PRODUCTION_URL ?? null,
  }

  let host: string | null = null
  let proto: string | null = null
  let headersErr: string | null = null
  try {
    const h = await headers()
    host = h.get("x-forwarded-host") ?? h.get("host")
    proto = h.get("x-forwarded-proto") ?? "https"
  } catch (err) {
    headersErr = err instanceof Error ? err.message : String(err)
  }

  const origin = host
    ? `${proto}://${host}`
    : env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`
      : env.VERCEL_URL
        ? `https://${env.VERCEL_URL}`
        : null

  const target = origin ? `${origin}/api/ethena/snapshot` : null
  let probe: Record<string, unknown> = {}
  if (target) {
    try {
      const res = await fetch(target, { cache: "no-store" })
      const ct = res.headers.get("content-type") ?? ""
      const text = await res.text()
      probe = {
        status: res.status,
        contentType: ct,
        bodyLength: text.length,
        bodyPreview: text.slice(0, 200),
      }
    } catch (err) {
      probe = {
        threw: true,
        error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
      }
    }
  }

  return NextResponse.json(
    {
      elapsedMs: Date.now() - startedAt,
      env,
      headers: { host, proto, error: headersErr },
      origin,
      target,
      probe,
    },
    { status: 200 },
  )
}
