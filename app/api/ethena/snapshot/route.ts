import { NextResponse } from "next/server"

/**
 * Edge-runtime proxy for Ethena's backing-assets endpoint.
 *
 * Cloudflare's anti-bot challenges Vercel's Node-runtime egress IPs — the
 * Node lambda lands on an HTML challenge page about half the time. The
 * Edge runtime (different egress fingerprint) does not get challenged, so
 * we proxy via Edge and let the rest of the app keep its Node runtime.
 *
 * The browser-like headers below also matter for the cold-cache path;
 * keep them in sync with lib/ethena/client.ts.
 */
export const runtime = "edge"
export const dynamic = "force-dynamic"

const HEADERS: HeadersInit = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: "https://app.ethena.fi/dashboards/backing-assets",
  Origin: "https://app.ethena.fi",
  "Sec-Fetch-Site": "same-origin",
  "Sec-Fetch-Mode": "cors",
  "Sec-Fetch-Dest": "empty",
}

export async function GET() {
  // Up to 3 attempts: when Cloudflare serves the HTML challenge on a cold
  // cache, the attempt itself warms the cache so the retry usually gets the
  // real JSON. 250ms gap is enough for CF to register the prior request.
  const body = await fetchWithChallengeRetry()
  if (!body) {
    return NextResponse.json(
      { error: "upstream challenged after retries" },
      { status: 502 },
    )
  }
  return new NextResponse(body, {
    status: 200,
    headers: {
      "content-type": "application/json",
      // Long stale-while-revalidate so a single good fetch carries the
      // dashboard through long stretches of CF challenges. Vercel will
      // re-fetch in the background after s-maxage; if that fails, the
      // page keeps seeing the last good payload.
      "cache-control": "public, s-maxage=60, stale-while-revalidate=86400",
    },
  })
}

async function fetchWithChallengeRetry(): Promise<string | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 250))
    const res = await fetch(
      "https://app.ethena.fi/api/positions/current/backing-assets",
      { headers: HEADERS, cache: "no-store" },
    )
    if (!res.ok) continue
    const contentType = res.headers.get("content-type") ?? ""
    if (!contentType.includes("json")) continue
    return await res.text()
  }
  return null
}
