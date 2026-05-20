import { NextResponse } from "next/server"

/** Edge-runtime proxy for the stablecoin-collateral endpoint.
 *  See ../snapshot/route.ts for the rationale (Cloudflare anti-bot). */
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
  const res = await fetch("https://app.ethena.fi/api/stablecoin-collateral", {
    headers: HEADERS,
    cache: "no-store",
  })
  if (!res.ok) {
    return NextResponse.json({ error: `upstream ${res.status}` }, { status: 502 })
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
      "cache-control": "public, s-maxage=60, stale-while-revalidate=600",
    },
  })
}
