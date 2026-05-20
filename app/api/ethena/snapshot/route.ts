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
  const res = await fetch(
    "https://app.ethena.fi/api/positions/current/backing-assets",
    { headers: HEADERS, cache: "no-store" },
  )
  if (!res.ok) {
    return NextResponse.json(
      { error: `upstream ${res.status}` },
      { status: 502 },
    )
  }
  const contentType = res.headers.get("content-type") ?? ""
  if (!contentType.includes("json")) {
    return NextResponse.json(
      { error: `upstream returned ${contentType || "non-JSON"}` },
      { status: 502 },
    )
  }
  const body = await res.text()
  return new NextResponse(body, {
    status: 200,
    headers: {
      "content-type": "application/json",
      // Brief edge cache so the page render isn't re-billing on every visitor.
      "cache-control": "public, s-maxage=30, stale-while-revalidate=300",
    },
  })
}
